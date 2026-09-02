import { describe, expect, it } from 'vitest'
import { DEFAULT_HOST, DEFAULT_PORT, helpText, parseCli } from './args.mjs'

/**
 * Every refusal below is checked for *what it says*, not only that it refused.
 * A CLI that exits 1 without naming the flag it disliked is a stack trace with
 * better manners.
 */

describe('parseCli', () => {
  it('serves on the default port and host with no arguments', () => {
    expect(parseCli([])).toEqual({
      ok: true,
      command: 'serve',
      dir: undefined,
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
      open: true,
      app: true,
      portPinned: false,
      watch: true,
    })
  })

  it('does not default to 3000, which is already taken on every machine', () => {
    expect(DEFAULT_PORT).not.toBe(3000)
  })

  it('reads the flags', () => {
    expect(parseCli(['--dir', '../catalog', '--port', '4000', '--host', '0.0.0.0', '--open'])).toMatchObject({
      dir: '../catalog',
      port: 4000,
      host: '0.0.0.0',
      open: true,
    })
    expect(parseCli(['-d', 'x', '-p', '9', '--no-watch'])).toMatchObject({ dir: 'x', port: 9, watch: false })
    expect(parseCli(['--port=4000'])).toMatchObject({ port: 4000 })
  })

  it('takes `check` as a command', () => {
    expect(parseCli(['check', '--dir', 'x'])).toMatchObject({ command: 'check', dir: 'x' })
  })

  it('answers --help and --version before complaining about anything else', () => {
    expect(parseCli(['--help'])).toMatchObject({ command: 'help' })
    expect(parseCli(['-v'])).toMatchObject({ command: 'version' })
    expect(parseCli(['nonsense', '--help'])).toMatchObject({ command: 'help' })
  })

  it('names the option it did not recognise', () => {
    const refusal = parseCli(['--watch'])
    expect(refusal.ok).toBe(false)
    expect(refusal.message).toContain('--watch')
    expect(refusal.message).toContain('--help')
    // parseArgs' trailing advice about quoting positionals is not the mistake.
    expect(refusal.message).not.toContain('positional')
  })

  it('names the command it did not recognise', () => {
    expect(parseCli(['lint'])).toMatchObject({ ok: false, message: expect.stringContaining('"lint"') })
    expect(parseCli(['check', 'twice'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('"twice"'),
    })
  })

  it('rejects a port that is not a port', () => {
    for (const port of ['abc', '-1', '70000', '80.5', '']) {
      expect(parseCli(['--port', port]).ok).toBe(false)
    }
    // 0 parses as a number and would even bind — but the kernel picks the port
    // and the banner would have no URL to print.
    expect(parseCli(['--port', '0'])).toMatchObject({ ok: false, message: expect.stringContaining('65535') })
  })

  it('rejects an empty --host', () => {
    expect(parseCli(['--host', '  '])).toMatchObject({ ok: false, message: expect.stringContaining('--host') })
  })

  it('refuses serve-only flags on `check` instead of ignoring them', () => {
    expect(parseCli(['check', '--open'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('--open'),
    })
    expect(parseCli(['check', '--no-watch'])).toMatchObject({
      ok: false,
      message: expect.stringContaining('--no-watch'),
    })
  })
})

describe('helpText', () => {
  it('states the precedence rule, which is the one thing running it cannot show', () => {
    expect(helpText()).toContain('--dir beats CATALOG_DIR beats discovery')
  })

  it('documents every option the parser accepts', () => {
    const help = helpText()
    for (const flag of ['--dir', '--port', '--host', '--open', '--no-watch', '--version', '--help']) {
      expect(help).toContain(flag)
    }
    expect(help).toContain(String(DEFAULT_PORT))
  })
})

/**
 * Opening a window is now the default, and the window is a chromeless one.
 * `--app=` is Chrome's own flag: it gives a dock entry and no address bar,
 * which is the whole of what a desktop wrapper was wanted for — without a
 * second runtime to ship.
 */
describe('opening a window', () => {
  it('opens an app window by default, with no flag at all', () => {
    expect(parseCli([])).toMatchObject({ open: true, app: true })
  })

  it('--no-open serves without opening anything', () => {
    expect(parseCli(['--no-open'])).toMatchObject({ open: false, app: false })
  })

  it('--browser opens an ordinary tab instead of an app window', () => {
    expect(parseCli(['--browser'])).toMatchObject({ open: true, app: false })
  })

  it('--open is still accepted, and still means the default', () => {
    expect(parseCli(['--open'])).toMatchObject({ open: true, app: true })
  })

  it('refuses --no-open and --browser together, which disagree', () => {
    expect(parseCli(['--no-open', '--browser'])).toMatchObject({ ok: false })
  })

  for (const flag of ['--browser', '--no-open']) {
    it(`refuses ${flag} on \`check\`, which serves nobody`, () => {
      expect(parseCli(['check', flag])).toMatchObject({ ok: false })
    })
  }
})

/**
 * Two portals at once used to be an error. The default port is now a
 * PREFERENCE — taken when free, stepped past when not — while an explicit
 * `--port` stays a demand, because someone who names a port has a reason.
 */
describe('port', () => {
  it('does not pin the default port', () => {
    expect(parseCli([])).toMatchObject({ port: DEFAULT_PORT, portPinned: false })
  })

  it('pins a port the caller named', () => {
    expect(parseCli(['--port', '7000'])).toMatchObject({ port: 7000, portPinned: true })
  })

  it('pins it even when the caller names the default', () => {
    expect(parseCli(['--port', String(DEFAULT_PORT)])).toMatchObject({ portPinned: true })
  })
})
