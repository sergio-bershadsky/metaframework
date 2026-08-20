import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two paths a developer's own machine never takes.
 *
 * `fs.watch` with `recursive: true` works here (macOS), so nothing in a normal
 * run exercises what happens where it does not, or where the kernel refuses to
 * hand out another watch. Both are the difference between "the CLI still works,
 * a bit slower" and "the CLI serves a page that silently never updates", so
 * they are worth having covered by something other than a platform we cannot
 * run.
 *
 * `fs.watch` is stubbed rather than the whole module: the fingerprint underneath
 * reads a real temp directory, so the fallback is tested against real file
 * writes and not against a mock of the filesystem.
 */

const fail = (code: string) => () => {
  const error: NodeJS.ErrnoException = new Error(`stubbed ${code}`)
  error.code = code
  throw error
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'watch-degrade-'))
  writeFileSync(path.join(dir, 'index.md'), '---\nname: acme\n---\n')
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('when recursive watching is unavailable on the platform', () => {
  it('polls the fingerprint instead, and still reports real changes', async () => {
    vi.doMock('node:fs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('node:fs')>()),
      watch: fail('ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'),
    }))
    const { watchCatalog } = await import('./watch')

    vi.useFakeTimers()
    const watch = watchCatalog(dir)
    const changes: string[] = []
    const unsubscribe = watch.subscribe((fingerprint) => changes.push(fingerprint))

    expect(watch.strategy).toBe('fingerprint-poll')

    // Nothing moved: a poll that fires must not tell the browser anything.
    await vi.advanceTimersByTimeAsync(2_000)
    expect(changes).toEqual([])

    writeFileSync(path.join(dir, 'index.md'), '---\nname: acme\ntitle: Acme\n---\n')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(changes).toHaveLength(1)

    unsubscribe()
    // Unsubscribing stops the polling; a later edit reaches nobody.
    writeFileSync(path.join(dir, 'other.md'), 'x')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(changes).toHaveLength(1)
  })
})

describe('when the watcher cannot start at all', () => {
  it('serves on, with one warning naming the reason', async () => {
    vi.doMock('node:fs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('node:fs')>()),
      watch: fail('EMFILE'),
    }))
    const { watchCatalog } = await import('./watch')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const watch = watchCatalog(dir)
    // Two connections, two attempts — and still a single line in the terminal.
    watch.subscribe(() => {})()
    watch.subscribe(() => {})()

    expect(watch.strategy).toBe('off')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('EMFILE')
    expect(warn.mock.calls[0][0]).toContain('live reload is off')
  })
})
