import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { parse as parseYaml } from 'yaml'
import { catalogDir as defaultCatalogDir } from '../catalog'
import type { Diagnostic } from '../catalog/types'

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
 * Why history is not available. Shallowness is deliberately absent: a shallow
 * clone still has *some* history, so it is a flag on the result rather than a
 * failure to report.
 */
export type HistoryReason = 'no-git-binary' | 'not-a-repository' | 'not-committed' | 'git-error'

export interface HistoryUnavailable {
  reason: HistoryReason
  message: string
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
  shallow: boolean
  /** The log hit the commit cap; older revisions exist but were not listed. */
  truncated: boolean
  /** Non-null when there is no history to show, with the reason. */
  unavailable: HistoryUnavailable | null
  /** E_VER_REGRESSION findings — only checkable where history is available. */
  diagnostics: Diagnostic[]
}

export interface VersionResolution {
  version: number
  /** Commit to read the snapshot from; null when it is the filesystem version. */
  commit: string | null
  current: boolean
  code: 'E_SRN_VERSION' | null
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

async function runGit(cwd: string, args: string[]): Promise<GitRun> {
  if (!existsSync(cwd)) {
    return { stdout: '', failure: unavailable('not-a-repository', `catalog directory ${cwd} does not exist`) }
  }
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
  shallow: boolean
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
 */
const contextCache = new Map<string, Promise<ContextResult>>()

function resolveContext(root: string): Promise<ContextResult> {
  const cached = contextCache.get(root)
  if (cached) return cached

  const pending = (async (): Promise<ContextResult> => {
    const { stdout, failure } = await runGit(root, [
      'rev-parse',
      '--show-toplevel',
      '--show-prefix',
      '--is-shallow-repository',
    ])
    if (failure) return { context: null, failure }

    const [top = '', prefix = '', shallow = 'false'] = stdout.split('\n')
    if (!top) {
      return { context: null, failure: unavailable('not-a-repository', 'git reported no working tree') }
    }
    return { context: { root: top, prefix, shallow: shallow.trim() === 'true' }, failure: null }
  })()

  contextCache.set(root, pending)
  return pending
}

/** Repository-relative path for a catalog-relative one. */
function gitPath(context: GitContext, relative: string): string {
  return `${context.prefix}${relative}`
}

const SHALLOW_HINT = 'shallow clone — run `git fetch --unshallow` to restore full history'

// --- caches ------------------------------------------------------------------

/**
 * Blobs and commit-to-commit diffs are immutable, so they are cached for the
 * life of the process. The listing caches carry a TTL that is effectively
 * infinite in production and short in development, where a commit made while
 * the dev server runs should show up on the next reload.
 */
const LISTING_TTL_MS = process.env.NODE_ENV === 'production' ? Number.POSITIVE_INFINITY : 2_000
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
  if (hit && Date.now() - hit.at < LISTING_TTL_MS) return hit.value as Promise<T>
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

    // One extra commit tells us whether the cap actually truncated anything.
    const run = await runGit(context.root, [
      'log',
      `--format=${LOG_FORMAT}`,
      `--max-count=${limit + 1}`,
      '--',
      gitPath(context, safe),
    ])
    if (run.failure) return { ...empty, shallow: context.shallow, unavailable: run.failure }

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
      shallow: context.shallow,
      truncated,
      unavailable:
        commits.length === 0
          ? unavailable(
              'not-committed',
              `no commit touches ${safe}`,
              context.shallow ? SHALLOW_HINT : undefined,
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
        run.failure.reason === 'not-committed' && context.shallow
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
  } catch {
    return {
      path: safe,
      commit: null,
      content: null,
      unavailable: unavailable('not-committed', `${safe} is not on disk`),
    }
  }
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
      shallow: log.shallow,
      truncated: log.truncated,
      unavailable: null,
      // A truncated log has no visible oldest commit, so a "regression" at the
      // boundary would be an artefact of the cap rather than a real defect.
      diagnostics: log.truncated ? [] : versionRegressions(revisions, safe),
    }
  })
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

/** Resolve a pinned `@N` to the commit whose snapshot the referrer should see. */
export async function resolveVersion(
  relDir: string,
  version: number,
  options: HistoryOptions = {},
): Promise<VersionResolution> {
  const history = await getEntityHistory(relDir, options)

  if (history.currentVersion !== null && version === history.currentVersion) {
    return { version, commit: null, current: true, code: null, hint: null }
  }

  const commit = history.versions[String(version)]
  if (commit) return { version, commit, current: false, code: null, hint: null }

  return {
    version,
    commit: null,
    current: false,
    code: 'E_SRN_VERSION',
    hint: history.shallow
      ? SHALLOW_HINT
      : (history.unavailable?.hint ?? history.unavailable?.message ?? 'no commit carries that version'),
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
