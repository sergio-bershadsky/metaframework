import { describe, expect, it } from 'vitest'
import { chromiumFor, launchCommand } from './window.mjs'

/**
 * Picking the command is pure, so it is tested without launching anything.
 * What a browser does with the argv is the browser's business; what this owns
 * is choosing `--app=` when a Chromium exists and stepping back to the ordinary
 * opener when one does not.
 */
describe('chromiumFor', () => {
  const has = (...found) => (p) => found.includes(p)

  it('finds Chrome on macOS', () => {
    const path = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    expect(chromiumFor('darwin', has(path))).toBe(path)
  })

  it('prefers Chrome over the others when several are installed', () => {
    const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    const brave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    expect(chromiumFor('darwin', has(brave, chrome))).toBe(chrome)
  })

  it('takes a later candidate when the first is absent', () => {
    const brave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    expect(chromiumFor('darwin', has(brave))).toBe(brave)
  })

  it('returns null when none is installed', () => {
    expect(chromiumFor('darwin', () => false)).toBe(null)
    expect(chromiumFor('linux', () => false)).toBe(null)
    expect(chromiumFor('win32', () => false)).toBe(null)
  })
})

describe('launchCommand', () => {
  const url = 'http://127.0.0.1:6363'
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

  it('asks a Chromium for a chromeless window', () => {
    const [cmd, args] = launchCommand({ platform: 'darwin', url, app: true, chromium: chrome })
    expect(cmd).toBe(chrome)
    expect(args).toContain(`--app=${url}`)
  })

  /**
   * Each window gets its own profile directory. Without one, a second
   * `--app=` on a machine with Chrome already running is handed to the running
   * instance, which opens a TAB and ignores the app flag entirely.
   */
  it('gives the window its own profile, or Chrome reuses a running tab', () => {
    const [, args] = launchCommand({ platform: 'darwin', url, app: true, chromium: chrome })
    expect(args.some((a) => a.startsWith('--user-data-dir='))).toBe(true)
  })

  it('falls back to the ordinary opener when no Chromium is installed', () => {
    expect(launchCommand({ platform: 'darwin', url, app: true, chromium: null })).toEqual(['open', [url]])
    expect(launchCommand({ platform: 'linux', url, app: true, chromium: null })).toEqual(['xdg-open', [url]])
  })

  it('uses the ordinary opener when an app window was not asked for', () => {
    expect(launchCommand({ platform: 'darwin', url, app: false, chromium: chrome })).toEqual(['open', [url]])
  })

  it('opens a tab on Windows through cmd, as it always did', () => {
    expect(launchCommand({ platform: 'win32', url, app: false, chromium: null })).toEqual([
      'cmd', ['/c', 'start', '', url],
    ])
  })
})
