/**
 * Which command opens the portal, and in what kind of window.
 *
 * A chromeless window is the default door now, and it costs no runtime: every
 * Chromium accepts `--app=<url>`, which opens a window with no address bar, no
 * tab strip, and its own entry in the dock or taskbar. That is the whole of
 * what wrapping the portal in a desktop shell was wanted for, without shipping
 * a second runtime beside the one already in the tarball.
 *
 * Deciding is pure and lives here so it can be tested without launching a
 * browser; `metaframework.mjs` does the spawning.
 */

import { statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Chromium binaries, most-preferred first.
 *
 * Order is preference, not popularity: Chrome and Edge ship `--app` behaviour
 * that has been stable for years, and the rest are the same engine. Firefox and
 * Safari are absent because neither has an equivalent — Firefox dropped
 * `--ssb`, and Safari has never had one — so on a machine with only those we
 * open an ordinary tab rather than pretend.
 */
const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/brave-browser',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
}

const isFile = (target) => statSync(target, { throwIfNoEntry: false })?.isFile() ?? false

/**
 * The first installed Chromium for this platform, or null.
 *
 * `exists` is a parameter so the choice can be tested on a machine that has a
 * different set installed than the one the test describes.
 */
export function chromiumFor(platform, exists = isFile) {
  return (CANDIDATES[platform] ?? []).find((candidate) => exists(candidate)) ?? null
}

/** The ordinary "open this in whatever the user set as default" command. */
function opener(platform, url) {
  if (platform === 'darwin') return ['open', [url]]
  if (platform === 'win32') return ['cmd', ['/c', 'start', '', url]]
  return ['xdg-open', [url]]
}

/**
 * @returns {[string, string[]]} command and argv for opening `url`.
 */
export function launchCommand({ platform, url, app, chromium, profileDir }) {
  if (!app || !chromium) return opener(platform, url)

  // A profile of our own, and this is not optional. `--app=` handed to an
  // ALREADY-RUNNING Chrome is forwarded to that instance, which opens a plain
  // tab and drops the flag — so without a separate --user-data-dir the feature
  // silently does nothing for anyone who had a browser open, which is
  // everyone. The directory is per-port so two portals get two windows.
  const profile = profileDir ?? path.join(os.tmpdir(), `metaframework-${hash(url)}`)
  return [
    chromium,
    [
      `--app=${url}`,
      `--user-data-dir=${profile}`,
      // Chrome shows a "restore pages?" bubble in a fresh profile after any
      // unclean exit — in a chromeless window there is nowhere to dismiss it.
      '--no-first-run',
      '--no-default-browser-check',
    ],
  ]
}

/** Stable, short, and only ever a directory name. */
function hash(value) {
  let h = 5381
  for (let i = 0; i < value.length; i += 1) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0
  return h.toString(36)
}
