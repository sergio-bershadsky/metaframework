import { createHash } from 'node:crypto'
import { type Dirent, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

/**
 * A cheap identity for the catalog tree: a digest over every entry's path and
 * mtime.
 *
 * This deliberately stats rather than reads. The point of the fingerprint is to
 * decide whether a full parse of ~300 files is needed; a key that had to open
 * those files would cost what it saves.
 *
 * Directories are stat'ed as well as files, because a rename is invisible in
 * file mtimes: `mv checkout renamed` changes neither the file's mtime nor the
 * entry count, only the mtime of the directory that held it.
 *
 * ## Why a digest and not `max(mtime):count`
 *
 * That was the original key, and it had a blind spot that CI found on the first
 * run against Linux while every local run on macOS passed. mtime alone answers
 * "was anything written?" but not "was anything removed?"; the count covered
 * removal; and *neither* covers a change that moves no file mtime and no count
 * — which is exactly what a rename is. A rename was supposed to be caught by
 * the parent directory's mtime landing above the running maximum, and that is
 * where the assumption broke:
 *
 * Linux stamps inode timestamps from a **coarse** clock
 * (`ktime_get_coarse_real_ts64`), whose granularity is one timer tick — order
 * 1–4ms depending on `CONFIG_HZ` — while macOS stamps from a fine one. So on
 * Linux a rename occurring within a tick of the previous newest write rounds
 * onto the identical `mtimeMs`, and `max:count` is byte-for-byte unchanged
 * across a mutation that renamed an entity. The old comment defended the key by
 * observing that one ULP of a double at current epoch values is ~244ns, "finer
 * than any filesystem this runs on records". True, and beside the point: the
 * binding limit is the filesystem's clock granularity, four orders of magnitude
 * coarser than the float's.
 *
 * Digesting the paths removes the dependency on the clock advancing. A rename
 * changes the path set whatever the clock did; so does an addition, and so does
 * a removal — which makes the entry count redundant rather than load-bearing.
 * Only an in-place edit still relies on mtime, and there the coarse clock is
 * harmless: the comparison is against the previous *request's* fingerprint,
 * taken whole ticks ago, not against a write from the same millisecond.
 *
 * Entries are fed in sorted order, because `readdirSync` order is the
 * filesystem's, not a promise — an unsorted digest could move without the tree
 * moving, which is the cheap-but-wrong direction of the same trade.
 *
 * Synchronous on purpose, which is the opposite of the rule everywhere else in
 * this codebase. Measured against the real catalog (597 entries) from inside
 * `next dev`, the `fs/promises` form of this same walk costs ~120ms and this one
 * ~18ms: 597 awaited operations each need a turn of an event loop that the dev
 * server keeps busy with watchers and HMR, and the walk has nothing to overlap
 * with anyway — no request can proceed until it answers. It is only ever called
 * when the portal is serving a working tree (see `loadIfChanged` in ./index and
 * the two modes in ./mode) — a developer's `next dev` or the CLI on that same
 * developer's machine — so no request served from a deployment blocks on it.
 *
 * Hashing is not what this costs. Re-measured standalone on 2026-08-20 against
 * the catalog as it now stands — 862 entries — the whole walk runs a median of
 * 7.2ms over ten runs (min 6.6, max 7.8). The ~18ms above was measured inside
 * `next dev` at 597 entries and is the figure that matters for the trade, since
 * that is where it is actually paid; the two are not comparable and neither is
 * dominated by the digest, which sees ~50KB of path-and-mtime text.
 */
export function catalogFingerprint(catalogDir: string): string {
  const digest = createHash('sha1')

  const record = (target: string): void => {
    // A file that vanished mid-walk is a change by definition; the entry simply
    // drops out of the digest, which moves the key.
    const stats = statSync(target, { throwIfNoEntry: false })
    if (!stats) return
    digest.update(`${path.relative(catalogDir, target)}\0${stats.mtimeMs}\n`)
  }

  const visit = (dir: string): void => {
    record(dir)

    let children: Dirent[]
    try {
      children = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

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
  return digest.digest('hex')
}
