#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DEFAULT_PORT, helpText, parseCli } from './args.mjs'
import { CATALOG_DIR_NAME, catalogShape, resolveCatalogDir } from './discover.mjs'
import { repositoryRoot, unbumpedSince } from './since.mjs'

/**
 * `metaframework` — the shell around the portal.
 *
 * This file is the only part of the CLI allowed to touch `process`, print, or
 * exit; ./args.mjs and ./discover.mjs are pure so that the decisions they make
 * are testable without a server. What is left here is genuinely about running
 * one: find the catalog, prove the port is free before something crashes on it,
 * hand the server its environment, and wait until the catalog has actually
 * parsed before claiming anything about it.
 *
 * The CLI never reads the catalog itself. The loader is TypeScript compiled
 * into the server bundle, and a second copy of it here would be a second answer
 * to "is this catalog valid" — the one thing this product exists to have
 * exactly one of. So the counts in the banner, and the whole of
 * `metaframework check`, come from the server over `/api/status`.
 */

/** Where `scripts/assemble-standalone.mjs` leaves the compiled server. */
const SERVER_ENTRY = ['.next', 'standalone', 'server.js']

/** Escape hatch for a build laid out somewhere else. */
const SERVER_ENV_VAR = 'METAFRAMEWORK_SERVER'

/** How long to wait for the first parse of the catalog before giving up. */
const READY_TIMEOUT_MS = 120_000
const READY_POLL_MS = 100

const colour = process.stdout.isTTY && !process.env.NO_COLOR
const bold = (text) => (colour ? `\u001B[1m${text}\u001B[22m` : text)
const dim = (text) => (colour ? `\u001B[2m${text}\u001B[22m` : text)
const red = (text) => (colour ? `\u001B[31m${text}\u001B[39m` : text)
const yellow = (text) => (colour ? `\u001B[33m${text}\u001B[39m` : text)

/**
 * Spelled the long way on purpose. `import.meta.dirname` says the same thing in
 * one identifier, but it landed in Node 20.11 — which would put this package's
 * floor above Next's own `>=20.9.0` for the sake of a shorthand, and a portal
 * that refuses to start on a Node the server it wraps runs happily on is a
 * self-inflicted incompatibility.
 */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

main().catch((error) => {
  // Nothing below should throw, so anything arriving here is either a bug in
  // the CLI or the server failing to boot. Both need the stack.
  fail(`the portal did not start — ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`)
})

async function main() {
  const invocation = parseCli(process.argv.slice(2))
  if (!invocation.ok) {
    process.stderr.write(`metaframework: ${invocation.message}\n`)
    process.exit(2)
  }

  if (invocation.command === 'help') {
    process.stdout.write(helpText())
    return
  }
  if (invocation.command === 'version') {
    process.stdout.write(`${version()}\n`)
    return
  }

  const catalogDir = catalogOrExit(invocation)
  return invocation.command === 'check'
    ? check({ catalogDir, port: invocation.port, since: invocation.since })
    : serve({ ...invocation, catalogDir })
}

/* ------------------------------------------------------------------ catalog */

/**
 * What to do when there is no catalog yet — the other half of the error.
 *
 * "Create solutions/<name>/index.md" was technically complete and practically
 * useless: it tells somebody the shape of the first file and nothing about what
 * belongs in it, and the frontmatter contracts, the placement grammar and the
 * eleven kinds are not guessable from an error message. The two honest answers
 * are a guided one and a manual one, in that order — the guided one is the
 * reason the authoring kit exists, and somebody hitting this message has almost
 * certainly not heard of it.
 *
 * Deliberately not a tutorial. Four lines of commands and a link; anything
 * longer stops being read, and the skills themselves carry the interview.
 */
function bootstrapGuide() {
  return [
    bold('Starting from nothing?'),
    'The authoring kit is a Claude Code plugin: it interviews you, proposes an',
    'SRN tree, and writes the catalog once you have agreed to the shape.',
    '',
    `  ${dim('# in Claude Code, from the repository you want the catalog to live in')}`,
    '  /plugin marketplace add sergio-bershadsky/metaframework',
    '  /plugin install metaframework@metaframework',
    '  /solution-new',
    '',
    `${dim('  /entity-new adds one entity afterwards; /catalog-check reads the diagnostics.')}`,
    '',
    'By hand, the smallest catalog that loads is one file:',
    `  ${CATALOG_DIR_NAME}/<name>/index.md, with frontmatter naming a solution.`,
    `  ${dim('See https://github.com/sergio-bershadsky/metaframework#readme')}`,
  ]
}

/**
 * Turn a resolution into a directory to serve, or into the error the tool owes
 * its user: every path tried, and a non-zero exit.
 */
function catalogOrExit(invocation) {
  const resolution = resolveCatalogDir({ cwd: process.cwd(), dir: invocation.dir, env: process.env })

  if (resolution.dir === null) {
    fail(
      [
        `no ${CATALOG_DIR_NAME}/ directory found.`,
        '',
        `Looked for a \`${CATALOG_DIR_NAME}\` directory holding at least one <name>/index.md,`,
        'starting in the working directory and walking up:',
        ...resolution.searched.map((candidate) => `  ${candidate}`),
        '',
        'If you already have a catalog elsewhere, name it:',
        '  metaframework --dir <path>          (or CATALOG_DIR=<path>)',
        '',
        ...bootstrapGuide(),
      ].join('\n'),
    )
  }

  if (resolution.shape === 'missing') {
    fail(`${resolution.source === 'flag' ? '--dir' : 'CATALOG_DIR'} names ${resolution.dir}, which is not a directory.`)
  }

  if (resolution.shape === 'empty') {
    // Not fatal. This is the state of a repository one minute before its first
    // solution exists, and the server watches the tree — the page fills in by
    // itself. Saying nothing would leave the user staring at an empty portal
    // wondering which directory it had read.
    const lines = [
      `${resolution.dir} holds no solutions yet.`,
      `A solution is a directory with an index.md — create ${path.join(resolution.dir, '<name>', 'index.md')}`,
      'and the open page will pick it up.',
    ]
    // The likeliest reason an explicit --dir is empty: it was aimed one level
    // too high, at the repository rather than at the catalog inside it.
    const nested = path.join(resolution.dir, CATALOG_DIR_NAME)
    if (resolution.source !== 'discovery' && catalogShape(nested) === 'catalog') {
      lines.push(`${nested} is a catalog — did you mean \`--dir ${nested}\`?`)
    }
    warn(lines.join('\n  '))
  }

  if (resolution.skipped.length > 0) {
    warn(
      [
        `walked past a \`${CATALOG_DIR_NAME}\` directory that holds no solution:`,
        ...resolution.skipped.map((candidate) => `  ${candidate}`),
      ].join('\n  '),
    )
  }

  return resolution.dir
}

/* -------------------------------------------------------------------- serve */

async function serve({ catalogDir, port, host, open, watch }) {
  await claimPortOrExit(host, port)

  const muffled = startServer({ catalogDir, port, host, watch })
  handleSignals()

  const status = await waitForStatus({ host, port, muffled })
  muffled.discard()

  const url = `http://${displayHost(host)}:${port}`
  printBanner({ status, url, catalogDir, watch })
  if (open) openBrowser(url)
}

/**
 * Start the compiled server inside this process.
 *
 * Imported rather than spawned. The standalone entry resolves everything from
 * its own directory and then listens, so there is nothing a child process would
 * buy — and there is a great deal it would cost: a second PID to keep alive, a
 * signal to forward, and a way to leave a server holding a port after the shell
 * that started it has gone. One process cannot orphan itself.
 *
 * Its startup chatter is held back rather than printed. The server announces
 * its own port a second or two before the catalog has finished parsing, and two
 * banners disagreeing about whether the portal is ready is worse than one
 * banner that waits. Anything it said is released if startup fails.
 */
function startServer({ catalogDir, port, host, watch }) {
  const entry = serverEntryOrExit()

  process.env.CATALOG_DIR = catalogDir
  // Load-bearing. A Next standalone build sets NODE_ENV=production, and the
  // catalog layer would infer from that a catalog it may read once and keep. It
  // may not — the user is editing it. See src/lib/catalog/mode.ts.
  process.env.METAFRAMEWORK_MODE = 'working-tree'
  if (!watch) process.env.METAFRAMEWORK_LIVE_RELOAD = '0'
  process.env.PORT = String(port)
  // Deliberately overwritten rather than inherited: bash exports HOSTNAME as
  // the machine's name, which is not an address and fails with EADDRNOTAVAIL.
  process.env.HOSTNAME = host
  // Where this process serves schema bytes, which is NOT the same question as
  // what a schema's `$id` is — that stays the canonical host constant, and
  // `fixture-check` asserts it. Unset, `schemaBaseUrl()` falls back to
  // DEFAULT_SCHEMA_BASE_URL (`http://localhost:3000`, src/lib/schema/url.ts:49),
  // which is Next's dev port and not this one: the portal then printed
  // retrieval links to an address nothing was listening on. Set here rather
  // than changing the default, because the default is right for `next dev` and
  // wrong only for this launcher, which is the thing that knows the real port.
  // Still deferring to an explicit SCHEMA_BASE_URL — a deployment behind a
  // proxy has an origin neither of us can guess.
  process.env.SCHEMA_BASE_URL ||= `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`

  const muffled = muffleStdout()
  // Not awaited: the import resolves when the module has evaluated, which is
  // not when the server is listening. `waitForStatus` is the real signal, and a
  // failure to boot arrives as a rejection either way.
  const loading = import(pathToFileURL(entry).href)
  loading.catch((error) => {
    process.stdout.write(muffled.release())
    fail(`the portal server failed to start — ${error instanceof Error ? error.message : String(error)}`)
  })
  return muffled
}

function serverEntryOrExit() {
  const override = process.env[SERVER_ENV_VAR]
  const entry = override ? path.resolve(override) : path.join(packageRoot, ...SERVER_ENTRY)
  if (!isFile(entry)) {
    fail(
      override
        ? `${SERVER_ENV_VAR} points at ${entry}, which is not a file.`
        : `this installation is missing its compiled server (${entry}). Reinstall the package.`,
    )
  }
  return entry
}

/**
 * Bind the port before the server does.
 *
 * The compiled server starts with retries off, so a taken port surfaces as an
 * unhandled EADDRINUSE stack — which reads as a crash in the tool rather than
 * as a busy port on the machine. Binding first costs a millisecond and turns it
 * into a sentence. The gap between this bind and the server's is a race nobody
 * will lose in practice, and losing it is survivable: the server still errors.
 */
async function claimPortOrExit(host, port) {
  const error = await tryBind(host, port)
  if (!error) return

  const elsewhere = port === DEFAULT_PORT ? '' : `, or drop --port to use ${DEFAULT_PORT}`
  if (error.code === 'EADDRINUSE') {
    fail(`port ${port} is already in use on ${host}.\nPass \`--port <n>\` to use another one${elsewhere}.`)
  }
  if (error.code === 'EACCES') {
    fail(`binding ${host}:${port} is not permitted — ports below 1024 need root. Pass \`--port <n>\`.`)
  }
  if (error.code === 'EADDRNOTAVAIL') {
    fail(`no interface on this machine has the address ${host}. Check \`--host\`.`)
  }
  fail(`cannot listen on ${host}:${port} — ${error.code ?? error.message}.`)
}

function tryBind(host, port) {
  return new Promise((resolve) => {
    const probe = net.createServer()
    probe.once('error', (error) => resolve(error))
    probe.listen({ host, port, exclusive: true }, () => probe.close(() => resolve(null)))
  })
}

/** A port nothing is using, for the throwaway server `check` runs. */
function freePort(host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen({ host, port: 0, exclusive: true }, () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/**
 * Statuses that mean "ask again", not "give up".
 *
 * Measured, not assumed: the standalone server accepts connections and answers
 * **404** for a window after it prints its own "Ready" — it is listening before
 * the route table is loaded. Failing on the first non-200 turned that window
 * into "the portal cannot report on this catalog", which was a lie about a
 * server that was three hundred milliseconds from working.
 */
const NOT_READY_YET = new Set([404, 425, 429, 502, 503, 504])

/**
 * Wait until `/api/status` answers, which is later than "the port is open" and
 * later still than the server's own banner: the first request is the one that
 * parses the catalog, so this is also the moment the counts become true.
 */
async function waitForStatus({ host, port, muffled }) {
  const url = `http://${probeHost(host)}:${port}/api/status`
  const deadline = Date.now() + READY_TIMEOUT_MS
  let last = 'no connection'

  for (;;) {
    if (Date.now() > deadline) {
      process.stdout.write(muffled.release())
      fail(`the portal server did not answer ${url} within ${READY_TIMEOUT_MS / 1000}s (last: ${last}).`)
    }

    let response = null
    try {
      response = await fetch(url, { cache: 'no-store' })
    } catch {
      // Not listening yet.
    }

    if (response?.ok) return response.json()
    if (response) {
      last = `HTTP ${response.status}`
      // Every body must be consumed, including the ones being ignored. undici
      // keeps one connection per origin and will not start the next request
      // until the previous response has been read — a poll loop that dropped
      // its 404s on the floor deadlocked on the second iteration and waited out
      // the whole timeout against a server that was already answering.
      await response.body?.cancel().catch(() => {})
      if (!NOT_READY_YET.has(response.status)) {
        // A server that is up and answering with a reason will not give a
        // different one by being asked again.
        process.stdout.write(muffled.release())
        fail(`${url} answered ${response.status}. The portal cannot report on this catalog.`)
      }
    }
    await delay(READY_POLL_MS)
  }
}

function printBanner({ status, url, catalogDir, watch }) {
  const { errors, warnings } = status.diagnostics
  const row = (label, value) => `  ${dim(label.padEnd(11))}${value}`

  const lines = [
    '',
    `  ${bold('metaframework')} ${dim(version())}`,
    '',
    row('catalog', catalogDir),
    row('solutions', String(status.solutions)),
    row('entities', String(status.entities)),
  ]

  if (errors > 0) lines.push(row('errors', red(String(errors))))
  if (warnings > 0) lines.push(row('warnings', yellow(String(warnings))))
  lines.push(row('url', bold(url)), '')

  if (errors > 0) {
    // The portal's integrity gate is the reason this tool exists. A catalog
    // that contradicts the spec must not be reported only as a coloured digit.
    lines.push(
      `  ${red(`${count(errors, 'error')}`)} in the catalog — it is being served anyway.`,
      `  ${dim(`See ${url}/diagnostics, or run \`metaframework check\`.`)}`,
      '',
    )
  }

  lines.push(
    dim(
      watch
        ? '  Watching the catalog — the open page reloads itself. Ctrl-C to stop.'
        : '  Not watching (--no-watch) — edits show on the next refresh. Ctrl-C to stop.',
    ),
    '',
  )

  process.stdout.write(`${lines.join('\n')}\n`)
}

/* -------------------------------------------------------------------- check */

/**
 * The CI half: the same loader, the same diagnostics, the same severity split
 * as /diagnostics, because it is the same server — started on a port nobody
 * asked for and stopped as soon as it has answered.
 */
async function check({ catalogDir, port, since }) {
  const host = '127.0.0.1'
  // A caller who named a port meant it; otherwise take one at random, because
  // `check` is the command most likely to run beside something else.
  const listenOn = port === DEFAULT_PORT ? await freePort(host) : port

  const muffled = startServer({ catalogDir, port: listenOn, host, watch: false })
  const status = await waitForStatus({ host, port: listenOn, muffled })
  muffled.discard()

  const { errors, warnings, items } = status.diagnostics
  const out = [`${dim('catalog')}  ${catalogDir}`, '']

  for (const severity of ['error', 'warning']) {
    for (const item of items.filter((diagnostic) => diagnostic.severity === severity)) {
      out.push(
        `${severity === 'error' ? red('error  ') : yellow('warning')} ${bold(item.code)}  ${dim(item.path)}`,
        `        ${item.message}`,
      )
    }
  }
  if (items.length > 0) out.push('')

  const scale = `${count(status.entities, 'entity', 'entities')} across ${count(status.solutions, 'solution')}`
  out.push(
    errors === 0 && warnings === 0
      ? `catalog is valid — ${scale}.`
      : `${count(errors, 'error')}, ${count(warnings, 'warning')} — ${scale}.`,
  )

  process.stdout.write(`${out.join('\n')}\n`)

  // The version gate, when asked for. Reported after the loader's verdict and
  // before the exit, because it answers a different question — the loader says
  // whether the catalog is legal NOW, this says whether the change getting it
  // there followed the evolution rule.
  const gate = since ? await versionGate({ catalogDir, since }) : { failed: false }

  // The exit code is the contract with CI: warnings are a catalog that will
  // drift, errors are a catalog that contradicts the spec.
  process.exit(errors > 0 || gate.failed ? 1 : 0)
}

/**
 * `--since <ref>`: every entity whose files changed must have bumped `version`.
 *
 * Separate from the loader's diagnostics on purpose. Those are decidable from
 * the files on disk and this one is decidable only from two trees, so folding
 * it into the same list would make the whole of `check` conditional on git —
 * and `catalog-renders-without-git` exists to stop that. Here it is additive:
 * without `--since` nothing changes, and with it the check gains a second,
 * clearly-labelled verdict.
 */
async function versionGate({ catalogDir, since }) {
  const repoRoot = await repositoryRoot(catalogDir)
  if (!repoRoot) {
    // Not fatal: a catalog outside a repository cannot break a rule about
    // commits, and failing CI for that would be a false accusation.
    warn(`--since ${since} needs a git repository; ${catalogDir} is not in one, so the version gate did not run.`)
    return { failed: false }
  }

  const prefix = path.relative(repoRoot, catalogDir).split(path.sep).filter(Boolean).join('/')
  const result = await unbumpedSince({
    repoRoot,
    ref: since,
    inCatalog: (file) => (prefix ? file.startsWith(`${prefix}/`) : true),
  })

  if (!result.ok) {
    fail(`--since ${since}: ${result.failure}`)
  }

  if (result.unbumped.length === 0) {
    process.stdout.write(
      result.entitiesTouched === 0
        ? `\n${dim('since')}    ${since} — no catalog entity changed.\n`
        : `\n${dim('since')}    ${since} — ${count(result.entitiesTouched, 'entity', 'entities')} changed, each either bumped its version or changed only its status.\n`,
    )
    return { failed: false }
  }

  const lines = ['', `${red('error  ')} ${bold('E_VER_UNBUMPED')}  ${dim(`${result.unbumped.length} of ${result.entitiesTouched} changed entities`)}`]
  for (const entity of result.unbumped) {
    lines.push(
      `        ${entity.dir} — still version ${entity.version}, but these changed since ${since}:`,
      ...entity.changed.map((file) => `          ${dim(file)}`),
    )
  }
  lines.push(
    '',
    'Every content change bumps `version`; only a commit touching `status:` alone is exempt.',
    'Without the bump, one version number names two different files, and a reference',
    'pinned to it resolves to whichever the index recorded rather than to what is on disk.',
  )
  process.stdout.write(`${lines.join('\n')}\n`)
  return { failed: true }
}

/* ------------------------------------------------------------------ process */

/**
 * Ctrl-C stops the portal now.
 *
 * With the server in this process there is nothing to orphan, but the default
 * disposition is not enough on its own: whatever handlers the compiled server
 * registers run too, and a graceful shutdown that waits on an open SSE stream
 * would leave the terminal held. This exits, and does so with the code a shell
 * expects from a signal.
 */
function handleSignals() {
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ]) {
    process.on(signal, () => {
      // The ^C the terminal echoed is sitting on this line.
      process.stdout.write('\n')
      process.exit(code)
    })
  }
}

/**
 * Hold back everything written to stdout until told otherwise.
 *
 * Narrow and short-lived on purpose: it is in place only between the server's
 * import and its first successful `/api/status`, and every exit path either
 * releases what was captured or discards it deliberately.
 */
function muffleStdout() {
  const original = process.stdout.write.bind(process.stdout)
  let buffered = ''
  let held = true

  process.stdout.write = (chunk, encoding, callback) => {
    if (!held) return original(chunk, encoding, callback)
    buffered += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    const done = typeof encoding === 'function' ? encoding : callback
    done?.()
    return true
  }

  const stop = () => {
    held = false
    process.stdout.write = original
    return buffered
  }
  return { release: stop, discard: () => void stop() }
}

/**
 * The address to put in front of a human, and the one to probe. `--host
 * 0.0.0.0` means "every interface", which is not an address a browser can be
 * pointed at; the loopback the server is now also listening on is.
 */
function displayHost(host) {
  return host === '0.0.0.0' || host === '::' ? 'localhost' : host
}

function probeHost(host) {
  return host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '[::1]' : host
}

/** Best effort, never fatal: failing to open a browser is not failing to serve. */
function openBrowser(url) {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]

  import('node:child_process').then(({ spawn }) => {
    const opener = spawn(command, args, { stdio: 'ignore', detached: true })
    opener.on('error', () => warn(`could not open a browser — visit ${url}.`))
    opener.unref()
  })
}

function version() {
  try {
    return JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function isFile(target) {
  return statSync(target, { throwIfNoEntry: false })?.isFile() ?? false
}

function count(n, noun, plural = `${noun}s`) {
  return `${n} ${n === 1 ? noun : plural}`
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function warn(message) {
  process.stderr.write(`${yellow('metaframework:')} ${message}\n`)
}

/** @returns {never} */
function fail(message) {
  process.stderr.write(`${red('metaframework:')} ${message}\n`)
  process.exit(1)
}
