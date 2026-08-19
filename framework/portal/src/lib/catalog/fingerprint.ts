import { type Dirent, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * A cheap identity for the catalog tree: the newest mtime under it, plus how
 * many entries it holds.
 *
 * The count is not redundant. mtime alone answers "was anything written?" but
 * not "was anything removed?" — deleting a file leaves every surviving mtime
 * untouched, so a max-mtime-only key would keep serving a catalog containing an
 * entity that is no longer on disk.
 *
 * Directories are stat'ed as well as files, because a rename is invisible in
 * file mtimes: `mv checkout renamed` changes neither the file's mtime nor the
 * entry count, only the mtime of the directory that held it.
 *
 * This deliberately stats rather than reads. The point of the fingerprint is to
 * decide whether a full parse of ~300 files is needed; a key that had to open
 * those files would cost what it saves.
 *
 * Synchronous on purpose, which is the opposite of the rule everywhere else in
 * this codebase. Measured against the real catalog (597 entries) from inside
 * `next dev`, the `fs/promises` form of this same walk costs ~120ms and this one
 * ~18ms: 597 awaited operations each need a turn of an event loop that the dev
 * server keeps busy with watchers and HMR, and the walk has nothing to overlap
 * with anyway — no request can proceed until it answers. It is only ever called
 * on the development path (see `loadIfChanged` in ./index), so no served request
 * outside a developer's own machine blocks on it.
 */
export function catalogFingerprint(catalogDir: string): string {
  let newest = 0
  let entries = 0

  const record = (target: string): void => {
    // A file that vanished mid-walk is a change by definition; the entry simply
    // drops out of the count, which moves the key.
    const stats = statSync(target, { throwIfNoEntry: false })
    if (!stats) return
    entries += 1
    // `mtimeMs` is a double, but at current epoch values one ULP is ~244ns —
    // finer than any filesystem this runs on records, so two edits cannot round
    // into the same instant.
    if (stats.mtimeMs > newest) newest = stats.mtimeMs
  }

  const visit = (dir: string): void => {
    record(dir)

    let children: Dirent[]
    try {
      children = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    const subdirs: string[] = []
    for (const child of children) {
      if (child.isDirectory()) {
        // The loader never descends into dot/underscore directories, so their
        // contents cannot change what the catalog contains.
        if (child.name.startsWith('.') || child.name.startsWith('_')) continue
        subdirs.push(path.join(dir, child.name))
      } else if (child.isFile()) {
        record(path.join(dir, child.name))
      }
    }
    for (const subdir of subdirs) visit(subdir)
  }

  visit(catalogDir)
  return `${newest}:${entries}`
}
