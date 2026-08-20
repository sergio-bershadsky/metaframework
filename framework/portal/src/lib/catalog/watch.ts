import { type FSWatcher, watch } from 'node:fs'
import { catalogFingerprint } from './fingerprint'

/**
 * Noticing that the catalog moved, so an open browser can be told.
 *
 * This exists only for the working-tree mode (see ./mode). A deployed build
 * serves a catalog that cannot change under it and must not spawn a watcher.
 *
 * Two rules keep this from becoming a source of phantom reloads:
 *
 * 1. **The same walk rules as everything else.** The loader skips dot and
 *    underscore directories and so does the fingerprint; a watcher that reported
 *    them would announce changes the catalog cannot contain — an editor swap
 *    file or a `.git` write would refresh the page for nothing.
 * 2. **The fingerprint has the last word.** A filesystem event is only a hint —
 *    one editor save fires several, and some arrive with no filename at all, so
 *    the name filter cannot judge them. Every debounced batch is checked against
 *    {@link catalogFingerprint} instead, which is the same key the loader caches
 *    on: the browser is told exactly when the server would re-read, no more and
 *    no less. (A `touch` does move that key, deliberately — the loader would
 *    re-read too, and mtime is what both agree to trust.)
 */

/** One editor save is several filesystem events; this is how long we wait. */
const DEBOUNCE_MS = 150

/** Poll interval for the fallback strategy — see {@link WatchStrategy}. */
const POLL_MS = 1_000

export type WatchStrategy =
  /** `fs.watch(dir, { recursive: true })` — the normal case. */
  | 'recursive-watch'
  /** Recursive watching is unavailable here; stat-walk the tree instead. */
  | 'fingerprint-poll'
  /** Nothing worked. The portal still serves; live reload does not. */
  | 'off'

export interface CatalogWatch {
  /** How change is being noticed. Only meaningful once something subscribed. */
  readonly strategy: WatchStrategy
  /** Called with the new fingerprint on every real change. Returns unsubscribe. */
  subscribe(listener: (fingerprint: string) => void): () => void
}

/**
 * True for a path the catalog loader would never read.
 *
 * Checks every segment, not just the last one: `fs.watch` reports
 * `_drafts/checkout/index.md`, and it is the `_drafts` ancestor that decides.
 * The rule is stated once here and mirrored from `loadCatalog` and
 * `catalogFingerprint`, which apply the same test while walking.
 */
export function isIgnoredPath(relPath: string): boolean {
  return relPath
    .split(/[\\/]/)
    .some((segment) => segment.startsWith('.') || segment.startsWith('_'))
}

/**
 * Trailing-edge debounce: the call happens once, `ms` after the last trigger.
 *
 * Trailing rather than leading because the interesting state is the one after
 * the burst — a "save all" across four files should produce one reload that
 * sees all four, not one reload that saw the first.
 */
export function debounce(fn: () => void, ms: number): { trigger(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    trigger() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        fn()
      }, ms)
      // A pending reload notification is not a reason to keep node alive.
      timer.unref?.()
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

type Listener = (fingerprint: string) => void

function createWatch(dir: string): CatalogWatch {
  const listeners = new Set<Listener>()
  let strategy: WatchStrategy = 'off'
  let watcher: FSWatcher | null = null
  let poll: ReturnType<typeof setInterval> | null = null
  let last = ''

  const settle = debounce(() => {
    const fingerprint = catalogFingerprint(dir)
    if (fingerprint === last) return
    last = fingerprint
    for (const listener of listeners) listener(fingerprint)
  }, DEBOUNCE_MS)

  /**
   * Degrading is a first-class outcome, not a failure: a portal that refuses to
   * serve because it could not install a watcher is worse than one that serves
   * and says so. One line, once, naming what the user has to do instead.
   *
   * Once really means once. A browser whose stream dropped reconnects every few
   * seconds, and each reconnect retries the watcher, so a warning per attempt
   * would bury the terminal in the same sentence.
   */
  let warned = false
  const disable = (reason: string): void => {
    strategy = 'off'
    if (warned) return
    warned = true
    console.warn(`[metaframework] live reload is off (${reason}) — reload the page after editing`)
  }

  const startPolling = (): void => {
    strategy = 'fingerprint-poll'
    poll = setInterval(() => settle.trigger(), POLL_MS)
    poll.unref?.()
  }

  const start = (): void => {
    last = catalogFingerprint(dir)
    try {
      watcher = watch(dir, { recursive: true, persistent: false }, (_event, name) => {
        // `name` is null for some events on some platforms; a change we cannot
        // name still gets checked, because the fingerprint decides anyway.
        if (typeof name === 'string' && isIgnoredPath(name)) return
        settle.trigger()
      })
      strategy = 'recursive-watch'
      // An error *after* a successful start (the tree was removed, an inotify
      // limit was hit while descending) leaves us with a dead watcher, so fall
      // back rather than sit silent.
      watcher.on('error', (error: NodeJS.ErrnoException) => {
        watcher?.close()
        watcher = null
        disable(error.code ?? error.message)
      })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      // Recursive watching is a platform capability, not a resource: where it is
      // missing, stat-walking the tree costs ~12ms a second and is exactly as
      // correct, so live reload survives instead of being switched off.
      if (code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') startPolling()
      else disable(code ?? String(error))
    }
  }

  const stop = (): void => {
    settle.cancel()
    watcher?.close()
    watcher = null
    if (poll) clearInterval(poll)
    poll = null
    strategy = 'off'
  }

  return {
    get strategy() {
      return strategy
    },
    subscribe(listener) {
      // Started on demand and stopped when the last browser goes away: the
      // watcher exists to serve open connections and nothing else.
      if (listeners.size === 0) start()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stop()
      }
    },
  }
}

const watches = new Map<string, CatalogWatch>()

/**
 * The watch over a catalog directory, shared by every open connection — one
 * watcher per directory per process, however many browsers are listening.
 *
 * Takes the directory rather than calling `catalogDir()` itself so this module
 * stays free of the loader (and of the ajv instance behind it): the SSE route
 * already knows where the catalog is.
 */
export function watchCatalog(dir: string): CatalogWatch {
  let existing = watches.get(dir)
  if (!existing) {
    existing = createWatch(dir)
    watches.set(dir, existing)
  }
  return existing
}
