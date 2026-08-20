import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * Finding the catalog a user meant, the way git finds `.git`.
 *
 * Plain JavaScript rather than TypeScript on purpose: this module is loaded by
 * the `metaframework` bin before any bundler or compiler is in the picture, and
 * the published package must be runnable by `node` with nothing built. The
 * types are here as JSDoc, so `tsc` and an editor still see them.
 *
 * Nothing here reads `process.argv`, writes to a stream, or exits. The shell
 * (./metaframework.mjs) turns these results into messages and exit codes; that
 * split is what makes the "no solutions folder" error testable, and it is why
 * the failure case returns *the whole list of paths tried* rather than null.
 */

/** The directory name a catalog lives under. Fixed by the spec, not a setting. */
export const CATALOG_DIR_NAME = 'solutions'

/** The file that makes a directory an entity — the loader's `ENTITY_DOCUMENT`. */
const ENTITY_DOCUMENT = 'index.md'

/**
 * @typedef {'missing' | 'empty' | 'catalog'} Shape
 *   `missing` — nothing at this path, or it is not a directory.
 *   `empty`   — a directory, but the loader would find no solution in it.
 *   `catalog` — holds at least one solution: a subdirectory with an index.md.
 */

/**
 * What a directory is, as far as the catalog loader is concerned.
 *
 * "Catalog-shaped" is defined as exactly what `loadCatalog` would do with it:
 * list non-dot, non-underscore subdirectories and look for `index.md`. Deciding
 * this by any looser rule (does the path exist? is it non-empty?) would answer a
 * different question than the one the caller is asking, which is always "would
 * the portal have anything to show?".
 *
 * Symlinked children are not counted, because `Dirent.isDirectory()` is false
 * for a symlink and the loader uses that same test — a shape check that
 * disagreed with the loader would be worse than no shape check at all.
 *
 * @param {string} dir absolute path
 * @returns {Shape}
 */
export function catalogShape(dir) {
  const stats = statSync(dir, { throwIfNoEntry: false })
  if (!stats?.isDirectory()) return 'missing'

  let children
  try {
    children = readdirSync(dir, { withFileTypes: true })
  } catch {
    // Exists but cannot be read (permissions, a dead mount). Not a catalog we
    // can serve, and the caller's "no catalog here" message is the right one.
    return 'missing'
  }

  for (const child of children) {
    if (!child.isDirectory()) continue
    if (child.name.startsWith('.') || child.name.startsWith('_')) continue
    const doc = statSync(path.join(dir, child.name, ENTITY_DOCUMENT), { throwIfNoEntry: false })
    if (doc?.isFile()) return 'catalog'
  }
  return 'empty'
}

/**
 * @typedef {object} Discovery
 * @property {string | null} dir the catalog to serve, or null when none was found
 * @property {Shape} shape shape of `dir`; `missing` only when `dir` is null
 * @property {string[]} searched every candidate path tried, nearest first — the
 *   error message exists to print this, so it is returned even on success
 * @property {string[]} skipped candidates that existed but held no solution and
 *   were therefore walked past
 */

/**
 * Walk up from `startDir` looking for a `solutions` directory, stopping at the
 * filesystem root.
 *
 * The walk does not stop at the first *directory named* `solutions` — it stops
 * at the first one that holds a solution. A repository can easily contain a
 * `solutions/` that means something else (an exercises folder, a vendored SDK),
 * and stopping there would serve an empty portal while the real catalog sat one
 * level up, with nothing on screen to explain why. Directories walked past are
 * reported in `skipped` so the shell can say it saw them.
 *
 * An empty `solutions/` with no better candidate above it is still returned,
 * with `shape: 'empty'`. That is a real and common state — the moment before
 * somebody writes their first `index.md` — and refusing to start would be the
 * wrong answer for a server that watches the tree and re-renders when the file
 * appears. The caller says so out loud instead.
 *
 * @param {string} startDir
 * @returns {Discovery}
 */
export function discoverCatalogDir(startDir) {
  const searched = []
  const skipped = []
  let cursor = path.resolve(startDir)

  for (;;) {
    const candidate = path.join(cursor, CATALOG_DIR_NAME)
    searched.push(candidate)

    const shape = catalogShape(candidate)
    if (shape === 'catalog') return { dir: candidate, shape, searched, skipped }
    if (shape === 'empty') skipped.push(candidate)

    const parent = path.dirname(cursor)
    // `dirname('/') === '/'`, and likewise for a Windows drive root.
    if (parent === cursor) break
    cursor = parent
  }

  // No catalog anywhere up the chain. The nearest empty candidate is a better
  // answer than nothing: it is almost always the directory the user just made.
  if (skipped.length > 0) {
    return { dir: skipped[0], shape: 'empty', searched, skipped: skipped.slice(1) }
  }
  return { dir: null, shape: 'missing', searched, skipped }
}

/**
 * @typedef {object} Resolution
 * @property {'flag' | 'env' | 'discovery'} source which rule decided
 * @property {string | null} dir absolute catalog path; null only when discovery
 *   found nothing. A named directory is returned even when it does not exist —
 *   `shape: 'missing'` there means "you asked for this and it is not there",
 *   which is a different message from "I looked everywhere and found nothing".
 * @property {Shape} shape
 * @property {string[]} searched candidates tried; a single entry for flag/env
 * @property {string[]} skipped
 */

/**
 * Settle on one catalog directory.
 *
 * **Precedence: `--dir` beats `CATALOG_DIR` beats discovery.** An argument typed
 * on this invocation is more specific than an environment configured for the
 * shell, which is in turn more specific than a guess made from the working
 * directory. Neither of the explicit forms walks: naming a directory that turns
 * out to be wrong must produce an error about *that* directory, not a portal
 * quietly serving some other one found further up.
 *
 * @param {object} options
 * @param {string} options.cwd directory to start discovery from
 * @param {string} [options.dir] the `--dir` flag, if given
 * @param {Partial<NodeJS.ProcessEnv>} [options.env]
 * @returns {Resolution}
 */
export function resolveCatalogDir({ cwd, dir, env = process.env }) {
  const explicit = dir ?? env.CATALOG_DIR
  if (explicit) {
    const resolved = path.resolve(cwd, explicit)
    return {
      source: dir ? 'flag' : 'env',
      dir: resolved,
      shape: catalogShape(resolved),
      searched: [resolved],
      skipped: [],
    }
  }
  return { source: 'discovery', ...discoverCatalogDir(cwd) }
}
