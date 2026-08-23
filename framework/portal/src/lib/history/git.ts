import { execFile } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { parse as parseYaml } from 'yaml'
import { catalogDir as defaultCatalogDir } from '../catalog'
import { servingWorkingTree } from '../catalog/mode'
import type { Diagnostic } from '../catalog/types'
import { RESERVED_KINDS } from '../srn/srn'

/**
 * Git-backed history — framework/spec/evolution.md.
 *
 * The catalog keeps only current versions on disk; every historical read goes
 * through git. What the portal needs from git is deliberately tiny: `log` with a
 * path filter, `show` of a blob at a commit, and `diff`. That fits the CLI, so
 * this module shells out rather than adding a libgit binding.
 *
 * Every call goes through execFile with an argv array — never a shell string —
 * so no catalog path or commit-ish can be interpreted as shell syntax.
 *
 * Nothing here throws. History is an enrichment: a portal running from a
 * tarball, a shallow CI clone, or an image without a git binary must still
 * render the catalog and simply say why the past is not reachable.
 */

const runFile = promisify(execFile)

/** Git-level options; they must precede the subcommand. */
const GIT_BASE_ARGS = [
  '--no-pager',
  '-c',
  'core.quotepath=false',
  // evolution.md forbids moving an entity, and the version→commit index does not
  // follow renames. A user's `log.follow = true` would silently change that.
  '-c',
  'log.follow=false',
]

/**
 * Read-only posture: GIT_OPTIONAL_LOCKS stops `diff` from refreshing (and thus
 * rewriting) the index, and GIT_TERMINAL_PROMPT stops any credential prompt from
 * hanging a request. LC_ALL pins the stderr wording this module matches on.
 */
const GIT_ENV = {
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  GIT_PAGER: 'cat',
  LC_ALL: 'C',
}

const GIT_TIMEOUT_MS = 15_000
const MAX_BUFFER = 32 * 1024 * 1024

/** Beyond this the revision list is a scroll graveyard, not an affordance. */
const DEFAULT_COMMIT_LIMIT = 200

/** Guard against a pathological diff turning into megabytes of DOM. */
const MAX_DIFF_LINES = 4000

/** git's canonical empty tree — the diff base for a root commit. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

const HEX = /^[0-9a-f]{4,40}$/i

/** The entity document; a directory holding one is an entity (structure.md). */
const ENTITY_DOCUMENT = 'index.md'

// --- public types ------------------------------------------------------------

/**
 * Why history is not available *for one read*. Shallowness is deliberately
 * absent: a shallow clone still has *some* history, so for a page asking to
 * render one revision it is a flag on the result rather than a failure to
 * report. A caller asking whether a rule that walks the past could run wants
 * {@link HistoryLimit} instead, which is that same question widened to the
 * repository.
 */
export type HistoryReason = 'no-git-binary' | 'not-a-repository' | 'not-committed' | 'git-error'

export interface HistoryUnavailable {
  reason: HistoryReason
  message: string
  /** What the reader can do about it, when anything can be done. */
  hint?: string
}

/**
 * Why the rules that read commits cannot be trusted to have run in full.
 *
 * Deliberately *not* {@link HistoryReason}. That type answers "why can this page
 * not show the past", and for it a shallow clone is a flag on a result rather
 * than a failure, because the commits it does hold are real. This one answers a
 * different question — "could a rule that walks history reach everything it
 * needed" — and there the two states that look most like success are the ones
 * that matter: a shallow clone and a repository with no commits both answer
 * every `rev-parse` this module makes, and then hand every walk an empty list
 * that is indistinguishable from "nothing to report".
 */
export type HistoryLimit = 'no-git-binary' | 'not-a-repository' | 'git-error' | 'no-commits' | 'shallow-clone'

/** What a caller asking "could the git-backed rules run?" gets back. */
export interface HistoryStatus {
  /** Is any commit reachable at all? */
  available: boolean
  /** …and does the repository hold the whole past? False for a shallow clone. */
  complete: boolean
  /** null exactly when `available && complete`. */
  limit: HistoryLimit | null
  message: string | null
  /** What the reader can do about it, when anything can be done. */
  hint?: string
}

export interface Commit {
  hash: string
  short: string
  /** Author date, ISO 8601 with offset. */
  date: string
  author: string
  subject: string
}

export interface EntityRevision extends Commit {
  /** Frontmatter `version` at this commit; null when index.md was unreadable. */
  version: number | null
}

/**
 * How far back this entity's history actually reaches, and whether that is far
 * enough to be the whole story.
 *
 * `git log` with a path filter stops where the path stops. evolution.md forbids
 * moving an entity precisely because the version→commit index does not follow a
 * rename — and GIT_BASE_ARGS pins `log.follow=false` so no local config can make
 * the tool contradict that rule. The consequence is that a directory which HAS
 * been moved presents a truncated history that looks complete: the oldest
 * reachable commit is an "add", and every version authored before it is
 * unreachable without saying so.
 *
 * evolution.md also fixes the other half: `version` starts at 1 and increments
 * by exactly 1. So an entity whose oldest reachable commit already carries v7 is
 * telling us that v1..v6 were written somewhere this log cannot see. That is the
 * whole inference, and it needs no extra git call to make.
 */
export interface HistoryReach {
  /** Lowest version any reachable commit carries. */
  earliestVersion: number
  /** The oldest commit that touches this path — where the trail stops. */
  commit: string
  short: string
  date: string
  /** True when the trail reaches v1: nothing is missing below it. */
  complete: boolean
}

export interface EntityHistory {
  /** Catalog-relative entity directory, POSIX separators. */
  relDir: string
  /** Newest first. */
  revisions: EntityRevision[]
  /**
   * version → commit hash. Keys are stringified integers because this crosses
   * the wire as JSON. The LAST commit carrying a version wins, so a status-only
   * follow-up commit is the one a pinned `@N` resolves to (evolution.md).
   */
  versions: Record<string, string>
  /** The version on the filesystem right now; null when index.md is unreadable. */
  currentVersion: number | null
  /** Where the version→commit index bottoms out; null when there is no index. */
  reach: HistoryReach | null
  shallow: boolean
  /** The log hit the commit cap; older revisions exist but were not listed. */
  truncated: boolean
  /** Non-null when there is no history to show, with the reason. */
  unavailable: HistoryUnavailable | null
  /** E_VER_REGRESSION findings — only checkable where history is available. */
  diagnostics: Diagnostic[]
}

/**
 * Why a version could not be produced. The distinction is the point: two of
 * these are statements about the catalog and one is a statement about the
 * INDEX, and a reader who is told "no such version" when the truth is "not
 * reachable from here" goes looking for a bug that is not there.
 */
export type VersionMiss =
  /** Git could not answer at all — no binary, no repository, nothing committed. */
  | 'no-history'
  /** Older than the oldest commit that touches this path. It existed; it is not reachable. */
  | 'before-reach'
  /** Within reach, and no commit carries it. This one really was never written. */
  | 'never-written'

export interface VersionResolution {
  version: number
  /** Commit to read the snapshot from; null when it is the filesystem version. */
  commit: string | null
  current: boolean
  code: 'E_SRN_VERSION' | null
  /** Which kind of miss this is; null when the version resolved. */
  miss: VersionMiss | null
  /** One sentence a reader can act on; null when the version resolved. */
  message: string | null
  hint: string | null
}

export interface FileRevision {
  /** Catalog-relative file path. */
  path: string
  /** Commit hash, or null for the working tree. */
  commit: string | null
  content: string | null
  /** Non-null exactly when `content` is null. */
  unavailable: HistoryUnavailable | null
}

export type DiffLineType = 'context' | 'added' | 'removed'

export interface DiffLine {
  type: DiffLineType
  /** Line number on the "from" side; null for added lines. */
  oldLine: number | null
  /** Line number on the "to" side; null for removed lines. */
  newLine: number | null
  text: string
  /** git's "\ No newline at end of file" marker applied to this line. */
  noNewline?: boolean
}

export interface DiffHunk {
  /** The raw `@@ … @@` header, including git's section heading when present. */
  header: string
  /** Section heading git guessed for the hunk, e.g. the enclosing key. */
  section: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface FileDiff {
  path: string
  /** Commit hash of the "from" side. */
  from: string
  /** Commit hash of the "to" side, or null for the working tree. */
  to: string | null
  hunks: DiffHunk[]
  added: number
  removed: number
  /** git reported no differences between the two revisions. */
  identical: boolean
  binary: boolean
  /** The patch exceeded the render cap; trailing hunks were dropped. */
  truncated: boolean
  unavailable: HistoryUnavailable | null
}

export interface HistoryOptions {
  /** Override the catalog root — used by tests and by embedders. */
  catalogDir?: string
  /** Maximum commits to list. */
  limit?: number
}

// --- path safety -------------------------------------------------------------

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/**
 * Normalise a catalog-relative path, or reject it.
 *
 * The route handler feeds this straight from the URL, so it is the trust
 * boundary for path traversal. Rejecting every dot-leading segment kills `..`
 * and `.git` with one rule, and matches the loader, which already skips
 * dot-directories — so nothing addressable is lost.
 */
export function safeCatalogPath(input: unknown, options: HistoryOptions = {}): string | null {
  if (typeof input !== 'string' || input.length === 0) return null
  if (CONTROL_CHARS.test(input)) return null
  if (input.includes('\\')) return null
  if (path.posix.isAbsolute(input) || path.isAbsolute(input)) return null

  const segments = input.replace(/\/+$/, '').split('/')
  if (segments.length === 0) return null
  for (const segment of segments) {
    if (segment.length === 0) return null
    if (segment.startsWith('.')) return null
    // Defence in depth: `--` guards every pathspec we build, but a leading dash
    // must never be able to reach git as an option even if one is forgotten.
    if (segment.startsWith('-')) return null
  }

  const relative = segments.join('/')
  const root = options.catalogDir ?? defaultCatalogDir()
  const resolved = path.resolve(root, relative)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return relative
}

/** A commit-ish this module is willing to hand to git. */
export function isCommitHash(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value)
}

// --- process plumbing --------------------------------------------------------

interface GitRun {
  stdout: string
  failure: HistoryUnavailable | null
}

function unavailable(reason: HistoryReason, message: string, hint?: string): HistoryUnavailable {
  return hint ? { reason, message, hint } : { reason, message }
}

/** Expected misses — a path absent from a commit is data, not a malfunction. */
const MISSING_PATH = /does not exist in|exists on disk, but not in|unknown revision or path not in/i

function classify(error: unknown): HistoryUnavailable {
  const err = error as { code?: string | number; stderr?: string; message?: string }
  const stderr = typeof err.stderr === 'string' ? err.stderr : ''

  if (err.code === 'ENOENT') {
    return unavailable('no-git-binary', 'the git executable was not found on PATH')
  }
  if (/not a git repository/i.test(stderr)) {
    return unavailable('not-a-repository', 'the catalog is not inside a git repository')
  }
  if (/detected dubious ownership/i.test(stderr)) {
    return unavailable('not-a-repository', 'git refused the repository as unowned', 'add it to safe.directory')
  }
  if (MISSING_PATH.test(stderr)) {
    return unavailable('not-committed', 'the path is not present at that revision')
  }
  return unavailable('git-error', (stderr || err.message || 'git failed').trim().split('\n')[0])
}

/**
 * The catalog directory itself is unusable — said with the path where the reader
 * can act on it, and without it where they cannot.
 *
 * The path is the whole diagnostic for whoever mistyped `--dir` or pointed
 * `CATALOG_DIR` at an index.md. It is also the one thing a deployment does not
 * publish: /api/status withholds `catalogDir` there, and withholds a history
 * *message* for exactly this reason — "a history message can quote the directory
 * it failed on". This message travels further than that route does. It is
 * rendered verbatim by the entity page's history panel, which is not
 * mode-gated, and it is reachable in a deployment: the catalog is read once at
 * boot, so a mount that goes away underneath a running container leaves entity
 * pages rendering from memory while every git call lands here.
 */
function unreadableCatalogDir(fault: string, cwd: string): HistoryUnavailable {
  return unavailable(
    'not-a-repository',
    servingWorkingTree() ? `catalog directory ${cwd} ${fault}` : `the catalog directory ${fault}`,
  )
}

async function runGit(cwd: string, args: string[]): Promise<GitRun> {
  // One stat rather than an `existsSync` and a spawn. The second case is why:
  // a path that exists and is a *file* passes `existsSync`, and spawning with
  // it as `cwd` then fails inside libuv rather than in git, which reached the
  // reader as the bare string "spawn ENOTDIR". A `CATALOG_DIR` aimed at an
  // index.md is a configuration mistake, and it is named here in the vocabulary
  // the rest of this module speaks.
  const stats = statSync(cwd, { throwIfNoEntry: false })
  if (!stats) return { stdout: '', failure: unreadableCatalogDir('does not exist', cwd) }
  if (!stats.isDirectory()) return { stdout: '', failure: unreadableCatalogDir('is not a directory', cwd) }
  try {
    const { stdout } = await runFile('git', [...GIT_BASE_ARGS, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...GIT_ENV },
      maxBuffer: MAX_BUFFER,
      timeout: GIT_TIMEOUT_MS,
    })
    return { stdout, failure: null }
  } catch (error) {
    return { stdout: '', failure: classify(error) }
  }
}

// --- repository context ------------------------------------------------------

interface GitContext {
  /** Repository top level, as git reports it. */
  root: string
  /** Catalog directory relative to the top level: '' or e.g. 'solutions/'. */
  prefix: string
}

interface ContextResult {
  context: GitContext | null
  failure: HistoryUnavailable | null
}

/**
 * Repository layout cannot change under a running process, so this is cached
 * forever. `--show-prefix` rather than path.relative: the catalog is commonly
 * reached through a symlink (every macOS temp dir is one), and only git can say
 * where its own working tree considers us to be.
 *
 * Layout, and nothing else. Shallowness used to ride along on this rev-parse
 * for the price of one flag, and inherited a cache policy that was never argued
 * for it: `git fetch --unshallow` is a thing a reader does *because this file
 * told them to*, and a forever cache meant the portal went on printing the hint
 * until somebody restarted it. It is {@link isShallow} now — same question, a
 * cache that expires. See that function for why the split is worth a spawn.
 */
const contextCache = new Map<string, Promise<ContextResult>>()

function resolveContext(root: string): Promise<ContextResult> {
  const cached = contextCache.get(root)
  if (cached) return cached

  const pending = (async (): Promise<ContextResult> => {
    const { stdout, failure } = await runGit(root, ['rev-parse', '--show-toplevel', '--show-prefix'])
    if (failure) return { context: null, failure }

    const [top = '', prefix = ''] = stdout.split('\n')
    if (!top) {
      return { context: null, failure: unavailable('not-a-repository', 'git reported no working tree') }
    }
    return { context: { root: top, prefix }, failure: null }
  })()

  contextCache.set(root, pending)
  return pending
}

/** Repository-relative path for a catalog-relative one. */
function gitPath(context: GitContext, relative: string): string {
  return `${context.prefix}${relative}`
}

/**
 * Can this process read the catalog's past at all — and if not, why not.
 *
 * Every history call already degrades with a named reason, but each of them
 * degrades *privately*: the entity page says "History unavailable" while
 * /api/status and `metaframework check` report a verdict computed without the
 * git-backed rules and say nothing about the ones that could not run. The same
 * catalog then prints "1 error" on a laptop and "catalog is valid" in an image
 * with no git binary, which is the failing-open shape this codebase refuses
 * everywhere else.
 *
 * This is the one question those two surfaces need, asked once. Repository
 * layout comes from the same {@link resolveContext} every other call uses, so it
 * costs nothing beyond the `rev-parse` a page would have run anyway; the two
 * probes on top of it — {@link hasNoCommits}, {@link isShallow} — are on the
 * listing TTL, which is what lets an answer change while the server runs. Both
 * of the states it names are states the reader is expected to leave: commit
 * something, or unshallow the clone.
 *
 * ## Why a `rev-parse` that succeeds is not the answer
 *
 * It was, and that made this function report a readable history for the two
 * repositories where the git-backed rules provably cannot run:
 *
 *  - **A shallow clone** — `actions/checkout`'s default, so the common case in
 *    CI rather than an exotic one. `git rev-parse` answers, `git log` answers,
 *    and the answer stops at the graft point: `resolveVersion` cannot find the
 *    commit carrying v(N−1), `datamodelEvolutionDiagnostics` returns an empty
 *    list, and a catalog that prints `E_DM_NOT_ADDITIVE` and exits 1 on a laptop
 *    prints a clean verdict and exits 0 in CI.
 *  - **A repository with no commits**, which is where a catalog is on the day it
 *    is created. Every rev-parse below succeeds; nothing any of them points at
 *    exists yet.
 *
 * Both are the failing-open shape this file's header refuses, and neither is
 * expressible as a {@link HistoryUnavailable} — hence {@link HistoryStatus},
 * which separates "no commit is reachable" from "not all of them are".
 *
 * @returns the state of the past as far as this process can see it.
 */
export async function historyAvailability(options: HistoryOptions = {}): Promise<HistoryStatus> {
  const root = options.catalogDir ?? defaultCatalogDir()
  const { context, failure } = await resolveContext(root)

  if (failure) {
    // `not-committed` is a statement about one path and cannot come from the
    // repository-wide rev-parse above; mapping it defensively keeps this union
    // honest rather than asserting the case away.
    const limit: HistoryLimit = failure.reason === 'not-committed' ? 'git-error' : failure.reason
    return { available: false, complete: false, limit, message: failure.message, ...(failure.hint ? { hint: failure.hint } : {}) }
  }
  if (!context) {
    return { available: false, complete: false, limit: 'git-error', message: 'git reported no working tree' }
  }

  if (await hasNoCommits(root)) {
    return {
      available: false,
      complete: false,
      limit: 'no-commits',
      message: 'the repository has no commits yet',
    }
  }

  if (await isShallow(root)) {
    return {
      available: true,
      complete: false,
      limit: 'shallow-clone',
      message: 'the repository is a shallow clone, so commits before its graft point are absent',
      hint: SHALLOW_HINT,
    }
  }

  return { available: true, complete: true, limit: null, message: null }
}

/**
 * True when no commit exists on any ref — an unborn HEAD.
 *
 * Deliberately not on {@link resolveContext}'s cache, which is forever: that one
 * is forever because repository *layout* cannot change under a running process,
 * and a commit count plainly can. It goes on the listing TTL instead — infinite
 * in a deployment, two seconds against a working tree — which is the same policy
 * every other "this may move while the server runs" read here already uses, and
 * it keeps the first commit of a catalog visible to the server that is watching
 * for it. Measured at ~6ms on a 109-commit repository, which is worth caching on
 * a route the container healthcheck polls.
 */
async function hasNoCommits(root: string): Promise<boolean> {
  return listed(`no-commits\u0000${root}`, async () => {
    const { stdout, failure } = await runGit(root, ['rev-list', '-n', '1', '--all'])
    return !failure && stdout.trim() === ''
  })
}

/**
 * True when the repository stops at a graft point rather than at its own first
 * commit.
 *
 * On the listing TTL for {@link hasNoCommits}'s reason, and one more: this is
 * the single limit the reader is actively *told to go fix* — {@link
 * SHALLOW_HINT} says `git fetch --unshallow`, on every surface this answer
 * feeds. That takes seconds, and while it rode {@link resolveContext}'s forever
 * cache the portal went on reporting `shallow-clone` afterwards until the
 * process was restarted, which teaches a reader to stop believing the verdict.
 * Layout cannot change under a running process; shallowness is a thing we ask
 * people to change.
 *
 * The price is one `rev-parse` per root per TTL window, where it used to be a
 * free extra flag on the layout call. A failure reads as "not shallow": this
 * only ever *adds* a limitation to an answer, and a git that will not answer
 * this has already failed the caller's own git call with a reason of its own.
 */
function isShallow(root: string): Promise<boolean> {
  return listed(`shallow\u0000${root}`, async () => {
    const { stdout, failure } = await runGit(root, ['rev-parse', '--is-shallow-repository'])
    return !failure && stdout.trim() === 'true'
  })
}

const SHALLOW_HINT = 'shallow clone — run `git fetch --unshallow` to restore full history'

// --- caches ------------------------------------------------------------------

/**
 * Blobs and commit-to-commit diffs are immutable, so they are cached for the
 * life of the process. The listing caches carry a TTL instead: infinite where
 * the catalog is fixed input to a build, and short where somebody is editing it
 * while the server runs and a commit made now should show up on the next reload.
 *
 * That question is {@link servingWorkingTree}, not `NODE_ENV`. The two agreed
 * only while the portal was a website: the CLI serves a production build over a
 * directory the user is committing to *right now*, so `NODE_ENV === 'production'`
 * gave `metaframework serve` a cache no commit could ever expire — the exact
 * conflation `lib/catalog/mode.ts` exists to abolish, quietly re-introduced
 * here. Read per call, and never hoisted into a module-scope const: the bundler
 * resolves a static `process.env.NODE_ENV` at build time and would freeze the
 * answer into the standalone server.
 */
function listingTtlMs(): number {
  return servingWorkingTree() ? 2_000 : Number.POSITIVE_INFINITY
}

const CACHE_LIMIT = 512

const blobCache = new Map<string, Promise<FileRevision>>()
const diffCache = new Map<string, Promise<FileDiff>>()
const listingCache = new Map<string, { at: number; value: Promise<unknown> }>()

/** Bounded without an eviction policy: a flush costs re-reads, nothing more. */
function cap(map: Map<string, unknown>): void {
  if (map.size > CACHE_LIMIT) map.clear()
}

function listed<T>(key: string, produce: () => Promise<T>): Promise<T> {
  const hit = listingCache.get(key)
  if (hit && Date.now() - hit.at < listingTtlMs()) return hit.value as Promise<T>
  const value = produce()
  cap(listingCache)
  listingCache.set(key, { at: Date.now(), value })
  return value
}

/** Drop every cached read. Tests mutate repositories between assertions. */
export function clearHistoryCache(): void {
  contextCache.clear()
  blobCache.clear()
  diffCache.clear()
  listingCache.clear()
}

// --- commits -----------------------------------------------------------------

const FIELD = '\u001f'
const RECORD = '\u001e'
const LOG_FORMAT = ['%H', '%h', '%aI', '%an', '%s'].join(FIELD) + RECORD

export interface CommitLog {
  commits: Commit[]
  shallow: boolean
  truncated: boolean
  unavailable: HistoryUnavailable | null
}

/** Commits that touched one catalog-relative path, newest first. */
export async function listCommits(relPath: string, options: HistoryOptions = {}): Promise<CommitLog> {
  const root = options.catalogDir ?? defaultCatalogDir()
  const limit = options.limit ?? DEFAULT_COMMIT_LIMIT
  const safe = safeCatalogPath(relPath, options)
  const empty: CommitLog = { commits: [], shallow: false, truncated: false, unavailable: null }

  if (!safe) {
    return { ...empty, unavailable: unavailable('git-error', `rejected path "${String(relPath)}"`) }
  }

  return listed(`log\u0000${root}\u0000${safe}\u0000${limit}`, async () => {
    const { context, failure } = await resolveContext(root)
    if (!context) return { ...empty, unavailable: failure }
    const shallow = await isShallow(root)

    // One extra commit tells us whether the cap actually truncated anything.
    const run = await runGit(context.root, [
      'log',
      `--format=${LOG_FORMAT}`,
      `--max-count=${limit + 1}`,
      '--',
      gitPath(context, safe),
    ])
    if (run.failure) return { ...empty, shallow, unavailable: run.failure }

    const commits = run.stdout
      .split(RECORD)
      .map((record) => record.replace(/^\r?\n/, ''))
      .filter((record) => record.length > 0)
      .map((record) => {
        const [hash = '', short = '', date = '', author = '', subject = ''] = record.split(FIELD)
        return { hash, short, date, author, subject }
      })
      .filter((commit) => HEX.test(commit.hash))

    const truncated = commits.length > limit
    return {
      commits: truncated ? commits.slice(0, limit) : commits,
      shallow,
      truncated,
      unavailable:
        commits.length === 0
          ? unavailable(
              'not-committed',
              `no commit touches ${safe}`,
              shallow ? SHALLOW_HINT : undefined,
            )
          : null,
    }
  })
}

// --- reading a file at a revision --------------------------------------------

/**
 * Content of one catalog file at a revision. `commit === null` reads the
 * working tree, which is where the current version lives.
 */
export async function readFileAtRevision(
  relPath: string,
  commit: string | null,
  options: HistoryOptions = {},
): Promise<FileRevision> {
  const root = options.catalogDir ?? defaultCatalogDir()
  const safe = safeCatalogPath(relPath, options)
  if (!safe) {
    return {
      path: String(relPath),
      commit,
      content: null,
      unavailable: unavailable('git-error', `rejected path "${String(relPath)}"`),
    }
  }
  if (commit !== null && !isCommitHash(commit)) {
    return { path: safe, commit, content: null, unavailable: unavailable('git-error', 'rejected revision') }
  }

  if (commit === null) return readWorktreeFile(root, safe)

  const key = `${root}\u0000${commit}\u0000${safe}`
  const cached = blobCache.get(key)
  if (cached) return cached

  const pending = (async (): Promise<FileRevision> => {
    const { context, failure } = await resolveContext(root)
    if (!context) return { path: safe, commit, content: null, unavailable: failure }

    const run = await runGit(context.root, ['show', `${commit}:${gitPath(context, safe)}`])
    if (run.failure) {
      const reason =
        run.failure.reason === 'not-committed' && (await isShallow(root))
          ? { ...run.failure, hint: SHALLOW_HINT }
          : run.failure
      return { path: safe, commit, content: null, unavailable: reason }
    }
    return { path: safe, commit, content: run.stdout, unavailable: null }
  })()

  cap(blobCache)
  blobCache.set(key, pending)
  return pending
}

/**
 * Worktree reads re-check containment after resolving symlinks: git reads blobs
 * from the object database and cannot escape the repository, but the filesystem
 * can — a symlink inside the catalog is the one way a validated path still
 * leaves it.
 */
async function readWorktreeFile(root: string, safe: string): Promise<FileRevision> {
  try {
    const real = realpathSync(path.resolve(root, safe))
    const realRoot = realpathSync(root)
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      return {
        path: safe,
        commit: null,
        content: null,
        unavailable: unavailable('git-error', 'path escapes the catalog through a symlink'),
      }
    }
    return { path: safe, commit: null, content: await readFile(real, 'utf8'), unavailable: null }
  } catch (error) {
    return { path: safe, commit: null, content: null, unavailable: worktreeFailure(safe, error) }
  }
}

/**
 * Why a working-tree read failed, in words that are true of the path.
 *
 * Every failure used to be reported as `not-committed — "<path> is not on
 * disk"`, and the commonest one is a path that is emphatically on disk: `?op=show`
 * with no commit reads the entity *directory*, which fails EISDIR. A reader
 * looking at that directory in their own file tree was told it was not there.
 *
 * The reasons are the module's existing vocabulary and no wider: `not-committed`
 * keeps its meaning — the path is not in this tree — and everything else is the
 * generic bucket, which `safeCatalogPath`'s rejection already uses for failures
 * git was never asked about.
 */
function worktreeFailure(safe: string, error: unknown): HistoryUnavailable {
  const code = (error as NodeJS.ErrnoException | null)?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') return unavailable('not-committed', `${safe} is not on disk`)
  if (code === 'EISDIR') return unavailable('git-error', `${safe} is a directory, not a file`)
  if (code === 'EACCES' || code === 'EPERM') return unavailable('git-error', `${safe} is not readable`)
  return unavailable('git-error', `${safe} could not be read (${code ?? 'unknown error'})`)
}

/** Files of an entity directory as they existed at a commit, relative to it. */
export async function listEntityFiles(
  relDir: string,
  commit: string,
  options: HistoryOptions = {},
): Promise<string[]> {
  const root = options.catalogDir ?? defaultCatalogDir()
  const safe = safeCatalogPath(relDir, options)
  if (!safe || !isCommitHash(commit)) return []

  return listed(`tree\u0000${root}\u0000${commit}\u0000${safe}`, async () => {
    const { context } = await resolveContext(root)
    if (!context) return []

    const dir = `${gitPath(context, safe)}/`
    const run = await runGit(context.root, ['ls-tree', '-r', '--name-only', '-z', commit, '--', dir])
    if (run.failure) return []

    const files = run.stdout
      .split('\u0000')
      .filter((file) => file.startsWith(dir))
      .map((file) => file.slice(dir.length))
      .filter((file) => file.length > 0)

    // A descendant directory holding its own index.md is a separate entity with
    // its own history (structure.md), so its files belong to it, not to this one.
    const nested = files
      .filter((file) => file.endsWith(`/${ENTITY_DOCUMENT}`))
      .map((file) => file.slice(0, -ENTITY_DOCUMENT.length))

    return files.filter((file) => !nested.some((prefix) => file.startsWith(prefix))).sort()
  })
}

// --- the version → commit index ----------------------------------------------

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Only `version` is needed here, so this deliberately never runs the full loader. */
function frontmatterVersion(source: string | null): number | null {
  if (!source) return null
  const match = FRONTMATTER.exec(source)
  if (!match) return null
  try {
    const data = parseYaml(match[1]) as Record<string, unknown> | null
    const version = data?.version
    return typeof version === 'number' && Number.isInteger(version) && version >= 1 ? version : null
  } catch {
    return null
  }
}

/** Bound the fan-out of `git show` calls without serialising the whole walk. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++
      out[index] = await fn(items[index])
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Full history of one entity plus the version→commit index that resolves a
 * pinned `@N`.
 *
 * The index is built oldest → newest with later commits overwriting, exactly as
 * evolution.md specifies: a status-only follow-up carries the same version, and
 * the *last* such commit is the snapshot a pin should see.
 */
export async function getEntityHistory(relDir: string, options: HistoryOptions = {}): Promise<EntityHistory> {
  const root = options.catalogDir ?? defaultCatalogDir()
  const limit = options.limit ?? DEFAULT_COMMIT_LIMIT
  const safe = safeCatalogPath(relDir, options)

  const blank = (reason: HistoryUnavailable, dir: string): EntityHistory => ({
    relDir: dir,
    revisions: [],
    versions: {},
    currentVersion: null,
    reach: null,
    shallow: false,
    truncated: false,
    unavailable: reason,
    diagnostics: [],
  })

  if (!safe) return blank(unavailable('git-error', `rejected path "${String(relDir)}"`), String(relDir))

  return listed(`history\u0000${root}\u0000${safe}\u0000${limit}`, async () => {
    const document = `${safe}/${ENTITY_DOCUMENT}`
    const [log, current] = await Promise.all([
      listCommits(document, options),
      readFileAtRevision(document, null, options),
    ])
    const currentVersion = frontmatterVersion(current.content)

    if (log.commits.length === 0) {
      return {
        ...blank(log.unavailable ?? unavailable('not-committed', `${document} has no commits`), safe),
        currentVersion,
        shallow: log.shallow,
      }
    }

    const versionsAt = await mapLimit(log.commits, 8, async (commit) =>
      frontmatterVersion((await readFileAtRevision(document, commit.hash, options)).content),
    )

    const revisions: EntityRevision[] = log.commits.map((commit, index) => ({
      ...commit,
      version: versionsAt[index],
    }))

    const versions: Record<string, string> = {}
    // Oldest → newest so a later commit carrying the same version wins.
    for (let index = revisions.length - 1; index >= 0; index--) {
      const revision = revisions[index]
      if (revision.version !== null) versions[String(revision.version)] = revision.hash
    }

    return {
      relDir: safe,
      revisions,
      versions,
      currentVersion,
      reach: reachOf(revisions),
      shallow: log.shallow,
      truncated: log.truncated,
      unavailable: null,
      // A truncated log has no visible oldest commit, so a "regression" at the
      // boundary would be an artefact of the cap rather than a real defect.
      diagnostics: log.truncated ? [] : versionRegressions(revisions, safe),
    }
  })
}

/**
 * Where the trail stops, read off the revisions themselves.
 *
 * The oldest revision carrying a version is the bottom of the index; a repo
 * whose oldest reachable commit already says v7 has six versions somewhere it
 * cannot reach. Revisions whose index.md would not parse are skipped rather
 * than counted as v-unknown — they say nothing either way about the floor.
 */
function reachOf(revisions: readonly EntityRevision[]): HistoryReach | null {
  for (let index = revisions.length - 1; index >= 0; index--) {
    const revision = revisions[index]
    if (revision.version === null) continue
    return {
      earliestVersion: revision.version,
      commit: revision.hash,
      short: revision.short,
      date: revision.date,
      complete: revision.version === 1,
    }
  }
  return null
}

/** E_VER_REGRESSION — `version` decreased, or jumped by more than 1 (evolution.md). */
function versionRegressions(revisions: EntityRevision[], relDir: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  let previous: number | null = null

  for (let index = revisions.length - 1; index >= 0; index--) {
    const revision = revisions[index]
    if (revision.version === null) continue
    if (previous !== null && revision.version !== previous && revision.version !== previous + 1) {
      diagnostics.push({
        code: 'E_VER_REGRESSION',
        severity: 'error',
        message:
          revision.version < previous
            ? `version went ${previous} → ${revision.version} at ${revision.short}`
            : `version jumped ${previous} → ${revision.version} at ${revision.short} (increments are exactly 1)`,
        path: `${relDir}/${ENTITY_DOCUMENT}`,
      })
    }
    previous = revision.version
  }
  return diagnostics
}

/**
 * `E_VER_UNBUMPED` — an entity's content changed while its `version` did not.
 *
 * evolution.md's whole model is that a version is a snapshot of the entity
 * *directory* at one commit, with exactly one exemption: a commit touching only
 * `status:` in `index.md` does not bump. Nothing enforced that. `version` was
 * checked for going backwards or skipping ({@link versionRegressions}) and never
 * for standing still while the files under it moved.
 *
 * The gap is invisible today and load-bearing tomorrow. `getEntityHistory`
 * builds its index by logging `{dir}/index.md`, so a commit that touched only
 * `transport.yaml` never appears in the revision list at all — the machinery
 * cannot see artifact-only history, let alone judge it. The moment an artifact
 * is addressable as `…/worktree-lease.transport@3`, an unbumped edit makes the
 * pinned form and the unpinned form answer differently for the same version,
 * which is the one thing a pin exists to prevent.
 *
 * So this walks the **directory**, not the document, and compares consecutive
 * commits that carry the same version.
 *
 * ## Why committed states and never the working tree
 *
 * The obvious cheap check — diff the working tree against the commit carrying
 * the current version — is wrong, and wrong in the way that would have made the
 * feature hated: editing a file before committing it is not a violation, it is
 * authoring. The bump legitimately arrives in the same commit as the change. A
 * check that fired on every unsaved edit would be noise, so this only ever
 * compares two commits.
 *
 * Truncated logs are skipped for the same reason `versionRegressions` skips
 * them: with no visible predecessor, a boundary finding is an artefact of the
 * 200-commit cap rather than a defect.
 */
export async function unbumpedChanges(relDir: string, options: HistoryOptions & { srn?: string } = {}): Promise<Diagnostic[]> {
  const root = options.catalogDir ?? defaultCatalogDir()
  const safe = safeCatalogPath(relDir, options)
  if (!safe) return []

  return listed(`unbumped\0${root}\0${safe}`, async () => {
    const { context } = await resolveContext(root)
    if (!context) return []

    // Directory-scoped: this is the log that can see an artifact-only commit.
    const log = await listCommits(safe, options)
    if (log.unavailable || log.truncated || log.commits.length < 2) return []

    const document = `${safe}/${ENTITY_DOCUMENT}`
    const at = await mapLimit(log.commits, 8, async (commit) =>
      (await readFileAtRevision(document, commit.hash, options)).content,
    )
    const versions = at.map(frontmatterVersion)

    const findings: Diagnostic[] = []
    // `commits` is newest-first; walk from the end so each pair reads forward.
    for (let index = log.commits.length - 1; index > 0; index--) {
      const older = log.commits[index]
      const newer = log.commits[index - 1]
      const before = versions[index]
      const after = versions[index - 1]

      // An unreadable index.md says nothing either way; a bump is the correct
      // behaviour and needs no report.
      if (before === null || after === null || before !== after) continue

      const changed = (await changedPaths(context, older.hash, newer.hash, safe)).filter((file) =>
        ownedBy(safe, file),
      )
      const offenders = changed.filter((file) => file !== document)

      // `index.md` alone is legal only under the status-only exemption.
      if (offenders.length === 0) {
        if (changed.length === 0) continue
        if (sansStatus(at[index]) === sansStatus(at[index - 1])) continue
        offenders.push(document)
      }

      for (const file of offenders) {
        findings.push({
          code: 'E_VER_UNBUMPED',
          severity: 'error',
          message:
            `changed at ${newer.short} (${newer.date}) while version stayed ${before} — ` +
            `every content change bumps version, and only a status-only edit is exempt. ` +
            `A pin at @${before} therefore names two different files.`,
          path: file,
          ...(options.srn ? { srn: options.srn } : {}),
        })
      }
    }
    return findings
  })
}

/**
 * Whether a changed path is this entity's own file rather than a descendant's.
 *
 * `git diff -- <dir>` is recursive, and an entity directory contains its
 * children. Without this filter a solution was blamed for every commit under
 * it: the first probe over the real catalog reported `srn://acme` as having
 * changed `acme/actor/customer/index.md`, which is another entity with a
 * version of its own and its own answer to this question.
 *
 * The test is structural rather than a filesystem walk. A child entity always
 * sits inside a kind bucket (`actor/`, `component/`, `datamodel/`, …), and an
 * entity's own artifacts never do — they are `index.md`, `schema.json`,
 * `transport.yaml`, `workflows/*.yaml`, `examples/*.json` and the like, none of
 * which is a reserved kind. So the first segment below the entity decides it.
 */
function ownedBy(relDir: string, file: string): boolean {
  const rest = file.startsWith(`${relDir}/`) ? file.slice(relDir.length + 1) : null
  if (rest === null) return false
  const head = rest.split('/')[0]
  return !(RESERVED_KINDS as readonly string[]).includes(head)
}

/** Catalog-relative paths that differ between two commits, under one directory. */
async function changedPaths(
  context: GitContext,
  from: string,
  to: string,
  relDir: string,
): Promise<string[]> {
  const run = await runGit(context.root, [
    'diff',
    '--name-only',
    from,
    to,
    '--',
    gitPath(context, relDir),
  ])
  if (run.failure) return []
  return run.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (context.prefix ? line.slice(context.prefix.length) : line))
}

/**
 * The document with its `status:` line removed, for the exemption comparison.
 *
 * Textual rather than parsed on purpose: the question is "is this edit
 * *only* the status line", and re-serialising parsed frontmatter would answer a
 * different one — two documents can parse equal and differ in comments,
 * ordering or whitespace, none of which is exempt.
 */
function sansStatus(source: string | null): string {
  if (source === null) return ''
  return source
    .split('\n')
    .filter((line) => !/^status:\s/.test(line))
    .join('\n')
}

const RENAME_HINT =
  'The version→commit index does not follow renames — evolution.md forbids moving an entity, so the ' +
  'portal will not paper over one. Anything authored under an earlier path is outside what this index ' +
  'can address; `git log --follow` finds it in the repository, not here.'

/**
 * Why version N is not available, said in the terms that are actually true.
 *
 * Exported because three surfaces have to say the same thing — the entity
 * page's notice, the version picker, and any client of /api/history — and a
 * sentence written three times is a sentence that will differ three ways.
 */
export function explainMissingVersion(
  history: EntityHistory,
  version: number,
): { miss: VersionMiss; message: string; hint: string | null } {
  if (history.unavailable) {
    return {
      miss: 'no-history',
      message: `v${version} cannot be read: ${history.unavailable.message}.`,
      hint: history.unavailable.hint ?? null,
    }
  }

  const reach = history.reach
  if (reach && version < reach.earliestVersion) {
    return {
      miss: 'before-reach',
      // "existed" rather than "may have existed": evolution.md makes versions
      // start at 1 and step by 1, so a reachable floor of v7 is evidence that
      // the six below it were written, not a guess that they might have been.
      message:
        `v${version} existed, but is not reachable. The history of this path starts at ${reach.short} ` +
        `(${reach.date.slice(0, 10)}), where the entity already carried v${reach.earliestVersion}; ` +
        `nothing below v${reach.earliestVersion} is addressable from here.`,
      hint: history.shallow ? SHALLOW_HINT : RENAME_HINT,
    }
  }

  const known = Object.keys(history.versions)
    .map(Number)
    .sort((a, b) => a - b)
  return {
    miss: 'never-written',
    message:
      known.length === 0
        ? `No commit carries v${version}; git has no version of this entity at all.`
        : `No commit carries v${version}; the index holds ${known.map((value) => `v${value}`).join(', ')}.`,
    hint: history.shallow ? SHALLOW_HINT : null,
  }
}

/** Resolve a pinned `@N` to the commit whose snapshot the referrer should see. */
export async function resolveVersion(
  relDir: string,
  version: number,
  options: HistoryOptions = {},
): Promise<VersionResolution> {
  const history = await getEntityHistory(relDir, options)
  const found = { commit: null, current: true, code: null, miss: null, message: null, hint: null } as const

  if (history.currentVersion !== null && version === history.currentVersion) {
    return { version, ...found }
  }

  const commit = history.versions[String(version)]
  if (commit) return { version, ...found, commit, current: false }

  const explained = explainMissingVersion(history, version)
  return {
    version,
    commit: null,
    current: false,
    code: 'E_SRN_VERSION',
    miss: explained.miss,
    message: explained.message,
    // The shallow hint stays first: it is the one cause the reader can undo.
    hint: history.shallow ? SHALLOW_HINT : explained.hint,
  }
}

// --- diffs -------------------------------------------------------------------

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/

/**
 * Parse a unified patch into hunks the UI can render without a diff library.
 * Only the subset git emits for a single text path is handled; anything else
 * (binary, mode-only) is reported rather than half-parsed.
 */
function parseUnifiedDiff(patch: string): Pick<FileDiff, 'hunks' | 'added' | 'removed' | 'binary' | 'truncated'> {
  const hunks: DiffHunk[] = []
  let binary = false
  let added = 0
  let removed = 0
  let rendered = 0
  let truncated = false

  let hunk: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  for (const raw of patch.split('\n')) {
    if (raw.startsWith('Binary files') || raw.startsWith('GIT binary patch')) {
      binary = true
      hunk = null
      continue
    }

    const header = HUNK_HEADER.exec(raw)
    if (header) {
      if (rendered >= MAX_DIFF_LINES) {
        truncated = true
        break
      }
      oldLine = Number(header[1])
      newLine = Number(header[3])
      hunk = {
        header: raw,
        section: header[5] ?? '',
        oldStart: oldLine,
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart: newLine,
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
      }
      hunks.push(hunk)
      continue
    }

    if (!hunk) continue

    if (raw.startsWith('\\')) {
      const last = hunk.lines[hunk.lines.length - 1]
      if (last) last.noNewline = true
      continue
    }

    const marker = raw.charAt(0)
    if (raw !== '' && marker !== ' ' && marker !== '+' && marker !== '-') {
      // A following `diff --git` header or trailer ends this hunk.
      hunk = null
      continue
    }

    if (rendered >= MAX_DIFF_LINES) {
      truncated = true
      break
    }
    rendered++

    const text = raw.slice(1)
    if (marker === '+') {
      added++
      hunk.lines.push({ type: 'added', oldLine: null, newLine: newLine++, text })
    } else if (marker === '-') {
      removed++
      hunk.lines.push({ type: 'removed', oldLine: oldLine++, newLine: null, text })
    } else {
      hunk.lines.push({ type: 'context', oldLine: oldLine++, newLine: newLine++, text })
    }
  }

  return { hunks, added, removed, binary, truncated }
}

function emptyDiff(pathValue: string, from: string, to: string | null, reason: HistoryUnavailable | null): FileDiff {
  return {
    path: pathValue,
    from,
    to,
    hunks: [],
    added: 0,
    removed: 0,
    identical: reason === null,
    binary: false,
    truncated: false,
    unavailable: reason,
  }
}

async function runDiff(
  relPath: string,
  from: string,
  to: string | null,
  revArgs: string[],
  options: HistoryOptions,
): Promise<FileDiff> {
  const root = options.catalogDir ?? defaultCatalogDir()
  const safe = safeCatalogPath(relPath, options)
  if (!safe) {
    return emptyDiff(String(relPath), from, to, unavailable('git-error', `rejected path "${String(relPath)}"`))
  }

  const { context, failure } = await resolveContext(root)
  if (!context) return emptyDiff(safe, from, to, failure)

  const run = await runGit(context.root, [
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--unified=3',
    ...revArgs,
    '--',
    gitPath(context, safe),
  ])
  if (run.failure) return emptyDiff(safe, from, to, run.failure)

  const parsed = parseUnifiedDiff(run.stdout)
  return {
    path: safe,
    from,
    to,
    ...parsed,
    identical: parsed.hunks.length === 0 && !parsed.binary,
    unavailable: null,
  }
}

/**
 * Diff one file between two revisions. `to === null` means the working tree —
 * the "how does this old version differ from what is live" question that the
 * previous-version affordance asks.
 */
export async function diffRevisions(
  relPath: string,
  from: string,
  to: string | null,
  options: HistoryOptions = {},
): Promise<FileDiff> {
  if (!isCommitHash(from) || (to !== null && !isCommitHash(to))) {
    return emptyDiff(String(relPath), from, to, unavailable('git-error', 'rejected revision'))
  }

  const root = options.catalogDir ?? defaultCatalogDir()
  const key = `${root}\u0000${String(relPath)}\u0000${from}\u0000${to}`
  if (to !== null) {
    const cached = diffCache.get(key)
    if (cached) return cached
  }

  const pending = runDiff(relPath, from, to, to === null ? [from] : [from, to], options)
  if (to !== null) {
    cap(diffCache)
    diffCache.set(key, pending)
  }
  return pending
}

/** What one commit changed in a file — the diff against its first parent. */
export async function diffAgainstParent(
  relPath: string,
  commit: string,
  options: HistoryOptions = {},
): Promise<FileDiff> {
  if (!isCommitHash(commit)) {
    return emptyDiff(String(relPath), commit, null, unavailable('git-error', 'rejected revision'))
  }

  const root = options.catalogDir ?? defaultCatalogDir()
  const { context } = await resolveContext(root)
  const parent = context ? await firstParent(context.root, commit) : null
  // A root commit has no parent; git's empty tree is the correct "before".
  return diffRevisions(relPath, parent ?? EMPTY_TREE, commit, { ...options, catalogDir: root })
}

function firstParent(root: string, commit: string): Promise<string | null> {
  return listed(`parent\u0000${root}\u0000${commit}`, async () => {
    const run = await runGit(root, ['rev-parse', '--verify', '--quiet', `${commit}^`])
    const hash = run.stdout.trim()
    return HEX.test(hash) ? hash : null
  })
}
