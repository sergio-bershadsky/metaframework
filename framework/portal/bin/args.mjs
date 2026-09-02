import { parseArgs } from 'node:util'

/**
 * Argument parsing, kept pure so the shell has nothing to decide.
 *
 * `node:util`'s `parseArgs` does the tokenising — it is in the runtime already,
 * it gets `--port=6363` and `--` right, and a hand-rolled loop here would only
 * be a place for those to go wrong. What this module adds is the part
 * `parseArgs` has no opinion about: which combinations mean something, and what
 * to say when they do not.
 */

/**
 * 6363 is M-F on a phone keypad. It is outside every range a developer's
 * machine is already using — 3000 (Next), 3210, 4200, 5173, 5432, 7000 (macOS
 * AirPlay), 8000, 8080 — which is the whole requirement: the first run of a
 * tool must not collide with the server the user is already running.
 */
export const DEFAULT_PORT = 6363

/** Loopback, not 0.0.0.0: a catalog is somebody's unreleased design work. */
export const DEFAULT_HOST = '127.0.0.1'

const OPTIONS = {
  dir: { type: 'string', short: 'd' },
  // `check` only: the ref a version bump is required since.
  since: { type: 'string' },
  port: { type: 'string', short: 'p' },
  host: { type: 'string' },
  // Opening a window is the default, so the two flags that matter are the ones
  // that turn it down: `--no-open` serves silently, `--browser` opens an
  // ordinary tab. `--open` is kept because it was documented and now says what
  // already happens, which is friendlier than an "unknown option".
  open: { type: 'boolean' },
  'no-open': { type: 'boolean' },
  browser: { type: 'boolean' },
  // parseArgs has no notion of a negated flag, so the negative form is the
  // option. There is no `--watch`: watching is the default and always was.
  'no-watch': { type: 'boolean' },
  version: { type: 'boolean', short: 'v' },
  help: { type: 'boolean', short: 'h' },
}

const COMMANDS = new Set(['serve', 'check'])

/**
 * @typedef {object} Invocation
 * @property {true} ok
 * @property {'serve' | 'check' | 'help' | 'version'} command
 * @property {string | undefined} dir the `--dir` flag, unresolved
 * @property {string | undefined} since the `--since` flag: require a version bump for anything changed since this ref
 * @property {number} port
 * @property {string} host
 * @property {boolean} open
 * @property {boolean} app open a chromeless app window rather than a browser tab
 * @property {boolean} portPinned the caller named a port, so it must not be stepped past
 * @property {boolean} watch push live-reload events to the browser
 */

/**
 * @typedef {object} Refusal
 * @property {false} ok
 * @property {string} message one line, no stack, ready to print to stderr
 */

/**
 * @param {string[]} argv arguments after `node` and the script path
 * @returns {Invocation | Refusal}
 */
export function parseCli(argv) {
  let values
  let positionals
  try {
    ;({ values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true }))
  } catch (error) {
    // parseArgs' own text is accurate but ends mid-sentence about quoting
    // positionals, which is never the actual mistake here.
    const detail = error instanceof Error ? error.message.split('. ')[0] : String(error)
    return refuse(`${detail}. Run \`metaframework --help\` for the ones that exist.`)
  }

  // Asked for before anything else can be wrong: `--help` on a malformed
  // command line is a request for the help, not an invitation to argue.
  if (values.help) return { ok: true, command: 'help', ...defaults() }
  if (values.version) return { ok: true, command: 'version', ...defaults() }

  if (positionals.length > 1) {
    return refuse(`unexpected argument "${positionals[1]}" — metaframework takes one command at most.`)
  }
  const command = positionals[0] ?? 'serve'
  if (!COMMANDS.has(command)) {
    return refuse(`unknown command "${command}". Expected \`metaframework\` or \`metaframework check\`.`)
  }

  const port = values.port === undefined ? DEFAULT_PORT : Number(values.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    // 0 is excluded deliberately: it means "let the kernel choose", and a
    // server whose port this process cannot predict has no URL to print.
    return refuse(`--port must be a whole number between 1 and 65535, not "${values.port}".`)
  }

  const host = values.host ?? DEFAULT_HOST
  if (host.trim() === '') return refuse('--host needs a hostname or address.')

  if (values['no-open'] && values.browser) {
    return refuse('--no-open and --browser disagree: one opens nothing, the other opens a tab.')
  }

  if (command === 'check') {
    for (const flag of ['open', 'no-open', 'browser', 'no-watch']) {
      if (values[flag]) return refuse(`--${flag} means nothing to \`metaframework check\`, which serves nobody.`)
    }
  }

  return {
    ok: true,
    command: /** @type {'serve' | 'check'} */ (command),
    dir: values.dir,
    since: values.since,
    port,
    // A named port is a demand; the default is a preference the server may step
    // past when something already holds it.
    portPinned: values.port !== undefined,
    host,
    open: !values['no-open'],
    app: !values['no-open'] && !values.browser,
    watch: !values['no-watch'],
  }
}

/** @returns {Refusal} */
function refuse(message) {
  return { ok: false, message }
}

function defaults() {
  return {
    dir: undefined,
    since: undefined,
    port: DEFAULT_PORT,
    portPinned: false,
    host: DEFAULT_HOST,
    open: true,
    app: true,
    watch: true,
  }
}

/**
 * The help text.
 *
 * It states the precedence rule out loud because that is the one thing about
 * this tool a user cannot deduce from watching it run: when a `--dir` and a
 * `CATALOG_DIR` disagree, the flag wins, and nothing on screen would say so.
 */
export function helpText() {
  return `metaframework — serve a solution catalog from the working tree

USAGE
  metaframework [options]          start the portal and watch the catalog
  metaframework check [options]    validate the catalog and exit non-zero on errors

OPTIONS
  -d, --dir <path>   catalog directory to serve (skips discovery)
      --since <ref>  check only: also require a version bump for every entity
                     whose files changed since <ref> (e.g. --since origin/main)
  -p, --port <n>     port to listen on (default ${DEFAULT_PORT}, stepped past if taken)
      --host <addr>  address to bind (default ${DEFAULT_HOST}; use 0.0.0.0 to share)
      --open         open a window once ready (the default; kept for habit)
      --browser      open an ordinary browser tab instead of an app window
      --no-open      start the portal without opening anything
      --no-watch     stop pushing reloads to the browser; edits still show on refresh
  -v, --version      print the version
  -h, --help         print this

FINDING THE CATALOG
  --dir beats CATALOG_DIR beats discovery. With neither, metaframework looks for a
  \`solutions\` directory in the current directory and then in each directory above
  it, the way git looks for \`.git\`, and stops at the first one that holds a
  solution — a directory with an <name>/index.md inside it. If it finds none it
  prints every path it tried and exits 1.
`
}
