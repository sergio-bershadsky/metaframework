/**
 * `--since <ref>` — the version-bump gate.
 *
 * evolution.md's rule is that every content change bumps an entity's `version`,
 * with one exemption: a change touching `status:` alone. Nothing enforced it,
 * so the rule held by habit. The portal's `E_VER_UNBUMPED` catches violations
 * that are already in history; this catches them in the change that would
 * create one, which is the only moment the fix is free.
 *
 * It is a pure git operation and deliberately does not boot the server. The
 * question — "did the files under this entity move without its version moving"
 * — is answerable from two trees and a frontmatter line, and making it wait on
 * a catalog parse would put a two-second dependency on a check that CI runs on
 * every push.
 *
 * ## Why a diff and not a history walk
 *
 * The portal's walk visits every commit of an entity, which is right for an
 * audit and wrong for a gate: on a branch with forty commits it re-reports
 * everything already merged. `--since` compares two states — the ref and the
 * working tree — and asks only whether the NET change to an entity came with a
 * bump. Intermediate commits are the author's business.
 *
 * The consequence worth knowing: a branch that breaks the rule in one commit
 * and repairs it in the next passes here, and should. The gate is about what
 * lands, not about how it was written.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runFile = promisify(execFile)

/** The entity document; a directory holding one is an entity. */
const ENTITY_DOCUMENT = 'index.md'

const GIT_ENV = { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', LC_ALL: 'C' }
const GIT_TIMEOUT_MS = 15_000
const MAX_BUFFER = 32 * 1024 * 1024

/**
 * @typedef {object} UnbumpedEntity
 * @property {string} dir repository-relative entity directory
 * @property {number | null} version the version on both sides, or null if unreadable
 * @property {string[]} changed repository-relative paths that moved
 */

/**
 * @typedef {object} SinceResult
 * @property {boolean} ok
 * @property {string | null} failure why the check could not run, when it could not
 * @property {string | null} skipped why there was nothing to compare against — a
 *   repository with no commits. Distinct from `failure`: the gate did not run
 *   and nothing is wrong, exactly as when the catalog is in no repository at all
 * @property {UnbumpedEntity[]} unbumped
 * @property {number} entitiesTouched
 */

/** The failure string {@link git} returns when the binary is not on PATH. */
export const GIT_MISSING = 'git is not installed'

async function git(cwd, args) {
  try {
    const { stdout } = await runFile('git', ['--no-pager', '-c', 'core.quotepath=false', ...args], {
      cwd,
      env: { ...process.env, ...GIT_ENV },
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    })
    return { stdout, failure: null }
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    if (error?.code === 'ENOENT') return { stdout: '', failure: GIT_MISSING }
    return { stdout: '', failure: stderr || String(error?.message ?? error) }
  }
}

/** The version in a frontmatter block, or null. Regex, because bin/ ships no parser. */
function versionOf(source) {
  if (!source) return null
  const fence = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fence) return null
  const line = fence[1].match(/^version:[ \t]*(\d+)[ \t]*$/m)
  return line ? Number(line[1]) : null
}

/**
 * The document with its `status:` line removed.
 *
 * Textual rather than parsed, and the difference matters: the question is
 * whether this edit is *only* the status line, and re-serialising parsed
 * frontmatter would answer a different one — two documents can parse equal and
 * differ in comments, key order or wrapping, none of which is exempt.
 */
function sansStatus(source) {
  if (source === null) return ''
  return source
    .split('\n')
    .filter((line) => !/^status:[ \t]/.test(line))
    .join('\n')
}

/** File content at a ref, or null when the path did not exist there. */
async function show(cwd, ref, file) {
  const run = await git(cwd, ['show', `${ref}:${file}`])
  return run.failure ? null : run.stdout
}

/**
 * Entities whose content changed between `ref` and the working tree without
 * their `version` changing.
 *
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {string} options.ref
 * @param {(file: string) => boolean} options.inCatalog does this path belong to the catalog
 * @returns {Promise<SinceResult>}
 */
export async function unbumpedSince({ repoRoot, ref, inCatalog }) {
  const empty = { ok: true, failure: null, skipped: null, unbumped: [], entitiesTouched: 0 }

  const resolved = await git(repoRoot, ['rev-parse', '--verify', `${ref}^{commit}`])
  if (resolved.failure) {
    // A repository with no commits is the state of a catalog on the day it is
    // created, and no ref resolves in one — not HEAD, not a tag, not a branch.
    // That is "nothing to compare against", which is the same answer the CLI
    // already gives for a catalog in no repository at all; it is not a broken
    // invocation. A ref that fails to resolve in a repository that *does* have
    // commits still fails hard, because that one is a typo and passing it
    // silently is how a gate stops checking anything.
    if (await hasNoCommits(repoRoot)) {
      return { ...empty, skipped: 'the repository has no commits yet' }
    }
    return { ...empty, ok: false, failure: `cannot resolve "${ref}" — ${resolved.failure}` }
  }

  // Working tree, not HEAD: a gate that ignored uncommitted work would pass a
  // change and then fail the moment it was committed.
  const diff = await git(repoRoot, ['diff', '--name-only', ref, '--'])
  if (diff.failure) return { ...empty, ok: false, failure: diff.failure }

  const changed = diff.stdout.split('\n').map((line) => line.trim()).filter(Boolean).filter(inCatalog)
  if (changed.length === 0) return empty

  // Group by owning entity: the nearest ancestor directory holding an index.md.
  // Derived from the ref side as well as the working tree, so an entity deleted
  // or created wholesale is still attributed.
  /** @type {Map<string, string[]>} */
  const byEntity = new Map()
  for (const file of changed) {
    const dir = await owningEntity(repoRoot, ref, file)
    if (!dir) continue
    const list = byEntity.get(dir)
    if (list) list.push(file)
    else byEntity.set(dir, [file])
  }

  /** @type {UnbumpedEntity[]} */
  const unbumped = []
  for (const [dir, files] of byEntity) {
    const document = `${dir}/${ENTITY_DOCUMENT}`
    const before = await show(repoRoot, ref, document)
    // A brand-new entity has no previous version to have failed to bump.
    if (before === null) continue

    const after = await readWorktree(repoRoot, document)
    // Deleted entirely — a different rule's problem (evolution.md forbids it),
    // not this one's, and reporting it here would be a second opinion.
    if (after === null) continue

    const wasVersion = versionOf(before)
    const isVersion = versionOf(after)
    if (wasVersion === null || isVersion === null || wasVersion !== isVersion) continue

    // index.md alone is legal under the status-only exemption.
    const others = files.filter((file) => file !== document)
    if (others.length === 0 && sansStatus(before) === sansStatus(after)) continue

    unbumped.push({ dir, version: wasVersion, changed: files.sort() })
  }

  return { ok: true, failure: null, skipped: null, unbumped, entitiesTouched: byEntity.size }
}

/**
 * The entity a changed file belongs to: the nearest ancestor holding an
 * `index.md`, on either side of the diff.
 *
 * Both sides matter. A file added in the working tree has no ref-side ancestor,
 * and a file deleted from it has no worktree-side one; asking only one side
 * silently drops half the changes it should judge.
 */
async function owningEntity(repoRoot, ref, file) {
  const segments = file.split('/')
  for (let depth = segments.length - 1; depth > 0; depth--) {
    const dir = segments.slice(0, depth).join('/')
    const document = `${dir}/${ENTITY_DOCUMENT}`
    if ((await readWorktree(repoRoot, document)) !== null) return dir
    if ((await show(repoRoot, ref, document)) !== null) return dir
  }
  return null
}

async function readWorktree(repoRoot, file) {
  const { readFile } = await import('node:fs/promises')
  const path = await import('node:path')
  try {
    return await readFile(path.default.join(repoRoot, file), 'utf8')
  } catch {
    return null
  }
}

/** True when the repository has no commits on any ref — an unborn HEAD. */
async function hasNoCommits(repoRoot) {
  const run = await git(repoRoot, ['rev-list', '-n', '1', '--all'])
  return !run.failure && run.stdout.trim() === ''
}

/**
 * @typedef {object} RepositoryContext
 * @property {string} root repository top level, as git reports it
 * @property {string} prefix the catalog directory relative to that top level —
 *   `''` or e.g. `solutions/`, always with a trailing slash when non-empty
 */

/**
 * Where the repository is, and where inside it the catalog sits.
 *
 * **`--show-prefix`, never `path.relative`.** The two agree only while every
 * component of the catalog path is real: git answers from its own working tree,
 * which is the physical path, and a user hands over the logical one. Every macOS
 * temp directory is a symlink, so are plenty of home directories and mounts, and
 * for those `path.relative(root, catalogDir)` returns something beginning
 * `../../..` — which matches no file in any diff, which makes the version gate
 * report "no catalog entity changed" over an unbumped edit and exit 0. A gate
 * that fails open is worse than no gate, because it is quoted.
 *
 * `lib/history/git.ts` learned this first and says so at its own `resolveContext`;
 * this is the same fix on the half of the codebase that never got it.
 *
 * The failure is returned rather than collapsed into null, because "git is not
 * installed" and "this is not a repository" are different sentences and the
 * caller prints one of them.
 *
 * @param {string} from a directory inside the repository — the catalog root
 * @returns {Promise<{context: RepositoryContext | null, failure: string | null}>}
 */
export async function repositoryContext(from) {
  const run = await git(from, ['rev-parse', '--show-toplevel', '--show-prefix'])
  if (run.failure) return { context: null, failure: run.failure }

  // Line-split rather than trimmed, the same way lib/history/git.ts reads the
  // same two values: a directory name may legally end in a space, and trimming
  // would silently rewrite the prefix for it.
  const [root = '', prefix = ''] = run.stdout.split('\n')
  if (!root) return { context: null, failure: 'git reported no working tree' }
  return { context: { root, prefix }, failure: null }
}

/**
 * "Is this repository-relative path part of the catalog?", for a prefix
 * {@link repositoryContext} produced. An empty prefix means the catalog *is* the
 * repository root, where every path qualifies.
 *
 * @param {string} prefix
 * @returns {(file: string) => boolean}
 */
export function inCatalogFilter(prefix) {
  return prefix ? (file) => file.startsWith(prefix) : () => true
}
