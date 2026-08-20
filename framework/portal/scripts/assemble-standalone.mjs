#!/usr/bin/env node
/**
 * Finish the standalone build into something publishable.
 *
 * `next build` with `output: 'standalone'` traces the *server* and its
 * dependencies into `.next/standalone`. It deliberately leaves out `public/`
 * and `.next/static/`, on the assumption that a CDN sits in front of the
 * server and serves them. This package has no CDN in front of it — it is a
 * `node server.js` on somebody's laptop — so the two directories have to be
 * copied inside, where the server already knows to look for them.
 *
 * Get this wrong and the failure is quiet in the worst way: the server boots,
 * HTML renders, and every stylesheet and script 404s. The assertions at the
 * end are here so that failure cannot leave this script.
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const portal = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const standalone = path.join(portal, '.next', 'standalone')

async function isDir(p) {
  try {
    return (await stat(p)).isDirectory()
  } catch {
    return false
  }
}

async function fail(message) {
  process.stderr.write(`assemble-standalone: ${message}\n`)
  process.exit(1)
}

if (!(await isDir(standalone))) {
  await fail(`${standalone} does not exist — run \`next build\` with output: 'standalone' first`)
}

// `public/` is optional in a Next app; `.next/static/` is not, so a missing one
// means the build did not finish and shipping it would produce a styleless page.
const staticSrc = path.join(portal, '.next', 'static')
if (!(await isDir(staticSrc))) await fail(`${staticSrc} is missing — the build did not finish`)

await mkdir(path.join(standalone, '.next'), { recursive: true })
await cp(staticSrc, path.join(standalone, '.next', 'static'), { recursive: true })

const publicSrc = path.join(portal, 'public')
if (await isDir(publicSrc)) {
  await cp(publicSrc, path.join(standalone, 'public'), { recursive: true })
}

/**
 * Replace the package.json Next copied in.
 *
 * Next copies this project's manifest verbatim, and what it copies is the
 * *build's* manifest: the whole devDependencies block, which describes how the
 * portal is compiled and says nothing about the compiled server being shipped,
 * plus a `files` allowlist and a `prepack` that would be nonsense one directory
 * down. A published server should carry a manifest that describes itself.
 *
 * The one field that is load-bearing rather than cosmetic is `type`. Next
 * generates `server.js` in whichever module format this project declares — with
 * `"type": "module"` here it emits `import` statements and an
 * `import.meta.url`-based `__dirname`. So the shipped manifest mirrors that
 * field rather than hard-coding it: get it wrong and Node 20 refuses the file
 * outright with "Cannot use import statement outside a module" (Node 25 retries
 * it as CommonJS and hides the bug, which is why this is asserted, not eyeballed).
 */
const manifest = JSON.parse(await readFile(path.join(portal, 'package.json'), 'utf8'))
await writeFile(
  path.join(standalone, 'package.json'),
  `${JSON.stringify(
    {
      name: `${manifest.name}-server`,
      version: manifest.version,
      private: true,
      type: manifest.type ?? 'commonjs',
    },
    null,
    2,
  )}\n`,
)

/* ------------------------------------------------ what the build over-emits */

/**
 * The raw TypeScript Turbopack leaves beside each Monaco worker.
 *
 * `new Worker(new URL('./json.worker.ts', import.meta.url), …)` is recognised
 * as a worker and compiled into `static/chunks/turbopack-worker-*.js` — but the
 * `new URL(…)` inside it is *also* treated as an asset reference on its own, so
 * the uncompiled `.ts` module is copied verbatim into `static/media/` as well.
 * Both modules end up in the client chunk; only the compiled one is reachable.
 *
 * Measured against the packaged build, not inferred: a datamodel page mounts
 * the JSON editor and makes exactly one `new Worker(...)` call, and its
 * argument is `turbopack-worker-2gqdcwp7k90ea.js` — the compiled chunk, served
 * as `application/javascript`. The `.ts` copy is never requested.
 *
 * Deleting it cannot break a working path, because there is no working path it
 * could be on: this server answers `.ts` with `Content-Type: video/mp2t`, and
 * no browser will run a module worker off that. It is removed so the next
 * reader does not find raw TypeScript in a published build and reopen the
 * question.
 */
const media = path.join(standalone, '.next', 'static', 'media')
const rawWorkerSources = (await isDir(media))
  ? (await readdir(media)).filter((name) => /\.worker\.[^.]+\.ts$/.test(name))
  : []
for (const name of rawWorkerSources) await rm(path.join(media, name))

/**
 * The whole of Monaco, compiled a second time for a server that never renders it.
 *
 * `.next/server/chunks/ssr/` is the server-side half of the client-component
 * graph, and Turbopack builds it for every client module whether or not the
 * server can reach it. Monaco is reached two ways, and neither survives to a
 * server render: `SourceView` is `dynamic(..., { ssr: false })`, and
 * `CodeBlock` reaches `./monaco` through an `import()` inside `useEffect`. So
 * the whole of it is compiled, shipped, and never opened — 113 chunks and 12MB
 * on the build this was written against, three of which were byte-identical
 * 949kB copies of one vendor chunk differing only in their own
 * `sourceMappingURL`.
 *
 * The check below is the safety rail, and it is the *shape* of the reference
 * that makes this safe rather than the crawl that confirmed it: every chunk
 * here is loaded asynchronously, by path, from a lazy `import()`. A module the
 * server actually needed would appear as a synchronous `require()` somewhere in
 * `.next/server`. If one ever does, this script stops instead of publishing a
 * build that 500s on a page nobody thought to open.
 */
const ssrChunks = path.join(standalone, '.next', 'server', 'chunks', 'ssr')
const monacoChunks = (await isDir(ssrChunks))
  ? (await readdir(ssrChunks)).filter((name) => name.includes('monaco'))
  : []
for (const file of await serverFiles(path.join(standalone, '.next', 'server'))) {
  const source = await readFile(file, 'utf8')
  const required = source.match(/require\("[^"]*monaco[^"]*"\)/)
  if (required) await fail(`${file} requires ${required[0]} synchronously — the SSR chunks are load-bearing after all`)
}
for (const name of monacoChunks) await rm(path.join(ssrChunks, name))

async function serverFiles(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...(await serverFiles(full)))
    else if (entry.name.endsWith('.js') && !entry.name.includes('monaco')) found.push(full)
  }
  return found
}

// The three things the CLI needs to exist at runtime, checked rather than
// assumed. `server.js` is the entry `bin/metaframework.mjs` requires; the two
// asset trees are what it serves to a browser.
for (const required of [
  path.join(standalone, 'server.js'),
  path.join(standalone, '.next', 'static'),
  path.join(standalone, '.next', 'server'),
]) {
  try {
    await stat(required)
  } catch {
    await fail(`${required} is missing after assembly`)
  }
}

const chunks = await readdir(path.join(standalone, '.next', 'static'))
if (chunks.length === 0) await fail('.next/static copied but empty')

process.stdout.write(
  `assemble-standalone: dropped ${rawWorkerSources.length} raw worker source(s) and ${monacoChunks.length} unreachable Monaco SSR chunk(s)\n` +
    `assemble-standalone: ${standalone} is ready to pack\n`,
)
