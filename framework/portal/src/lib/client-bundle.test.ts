import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * What the browser is allowed to be handed, enforced against the real import
 * graph rather than against a convention nobody can see.
 *
 * ## The defect this exists to catch
 *
 * `catalog-tree.tsx` imported one four-element const array —
 * `['draft','review','approved','deprecated']` — from `lib/catalog/frontmatter`,
 * a module that builds a tree of zod schemas at module scope. That single value
 * import put **272.7 KB of zod into the first-load JS of all five page routes**:
 * 30.2% of the 901.8 KB shared bundle, of which 127.2 KB was `zod/v4/locales`,
 * every translation of zod's error messages. Three more client modules reached
 * zod the same way. No client module ever called a schema.
 *
 * Nothing in a type system or a linter sees that. It is a property of the
 * *graph*, it is invisible in review — the import line looks free — and the only
 * signal is a number in a build artifact nobody reads. So it is asserted here.
 *
 * ## Why exactly these two packages
 *
 * `zod` and `yaml` are **validation and parsing**, and in this portal both
 * happen on the server: entities are loaded, validated and parsed there, and the
 * client is handed the result across the RSC boundary. There is no legitimate
 * browser use for either, which is what makes "zero paths" the right assertion
 * rather than a budget.
 *
 * The heavy *rendering* dependencies — monaco-editor, mermaid, elkjs,
 * @xyflow/react, xstate, the Stoplight viewers — are deliberately NOT listed.
 * They genuinely do run in the browser; the discipline for those is that they
 * sit behind a dynamic boundary (`navigable.tsx`, `deferred-solution-map.tsx`,
 * `artifact-block.tsx`), and a static-graph walk cannot tell a deferred import
 * of Monaco from an eager one because both are `'use client'` modules. Asserting
 * on them here would either pass vacuously or fail honestly-written code.
 *
 * ## How the walk reads a file
 *
 * Deliberately syntactic, and deliberately narrow: it follows exactly the edges
 * that put bytes in a chunk.
 *
 *  - `import type { … }` and named clauses whose specifiers are *all* `type X`
 *    are skipped: TypeScript erases them, so they cost nothing.
 *  - `import(...)` is skipped, because that IS the boundary being defended.
 *  - `import './x'`, `import x from './x'` and `export … from './x'` are
 *    followed, because all three evaluate the target module.
 *
 * A regex parser is the wrong tool for TypeScript in general and the right one
 * here: it errs toward following *more* edges than the bundler would, so it
 * cannot manufacture a false pass — only, at worst, a false failure that a
 * reader can immediately see through.
 */

const SRC = path.resolve(import.meta.dirname, '..')

/** Packages that validate or parse, and therefore belong to the server alone. */
const SERVER_ONLY_PACKAGES = ['zod', 'yaml']

/**
 * Modules split out of a zod-carrying neighbour precisely so client code could
 * reach them. Each is asserted directly, not merely through whoever imports it:
 * the split has to hold even during a refactor where nothing imports it yet.
 */
const MUST_STAY_SERVER_FREE = [
  'lib/catalog/vocabulary.ts',
  'lib/protocol/sequence.ts',
  'lib/protocol/state-chart-model.ts',
  'lib/artifacts/source-map.ts',
]

const IMPORT = /^\s*import\s+(?!type\s)([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/gm
const EXPORT_FROM = /^\s*export\s+(?!type\s)(?:\*|\{[\s\S]*?\})\s*from\s*['"]([^'"]+)['"]/gm
const BARE_IMPORT = /^\s*import\s*['"]([^'"]+)['"]/gm

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** `@/x` and `./x` to a file on disk; a bare specifier resolves to null. */
function resolveSpecifier(specifier: string, importer: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = path.join(SRC, specifier.slice(2))
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(importer), specifier)
  else return null

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate
    } catch {
      // Not this extension; try the next.
    }
  }
  return null
}

/** Every specifier this module evaluates at import time. */
function valueImports(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const specifiers: string[] = []

  for (const match of text.matchAll(IMPORT)) {
    const clause = match[1].trim()
    // `import { type A, type B } from 'x'` is erased in full; a clause with even
    // one value specifier is not.
    if (clause.startsWith('{') && clause.endsWith('}')) {
      const names = clause
        .slice(1, -1)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
      if (names.length > 0 && names.every((name) => name.startsWith('type '))) continue
    }
    specifiers.push(match[2])
  }
  for (const match of text.matchAll(EXPORT_FROM)) specifiers.push(match[1])
  for (const match of text.matchAll(BARE_IMPORT)) specifiers.push(match[1])

  return specifiers
}

interface Reach {
  /** External package name → the shortest import chain that arrives at it. */
  packages: Map<string, string[]>
  modules: Set<string>
}

/** Breadth-first over value imports, keeping the shortest path to each package. */
function reachableFrom(entries: string[]): Reach {
  const seen = new Map<string, string[]>(entries.map((entry) => [entry, [entry]]))
  const packages = new Map<string, string[]>()
  const queue = [...entries]

  while (queue.length > 0) {
    const current = queue.shift() as string
    const chain = seen.get(current) as string[]
    for (const specifier of valueImports(current)) {
      const resolved = resolveSpecifier(specifier, current)
      if (resolved === null) {
        const name = specifier.startsWith('@')
          ? specifier.split('/').slice(0, 2).join('/')
          : (specifier.split('/')[0] as string)
        if (!packages.has(name)) packages.set(name, [...chain, specifier])
        continue
      }
      if (!seen.has(resolved)) {
        seen.set(resolved, [...chain, resolved])
        queue.push(resolved)
      }
    }
  }

  return { packages, modules: new Set(seen.keys()) }
}

const relative = (file: string) => path.relative(SRC, file)
const chainOf = (chain: string[]) =>
  chain.map((step) => (step.includes(path.sep) ? relative(step) : step)).join(' → ')

const clientEntries = sourceFiles(SRC).filter((file) => {
  const head = readFileSync(file, 'utf8').slice(0, 200)
  return head.includes("'use client'") || head.includes('"use client"')
})

describe('client bundle', () => {
  it('finds the client modules to walk from', () => {
    // A guard on the walk itself: if the discovery ever breaks, every assertion
    // below would pass over an empty set and say nothing.
    expect(clientEntries.length).toBeGreaterThan(20)
  })

  it.each(SERVER_ONLY_PACKAGES)('never reaches %s from a client module', (name) => {
    const { packages } = reachableFrom(clientEntries)
    const chain = packages.get(name)
    expect(chain ? chainOf(chain) : null).toBeNull()
  })

  it.each(MUST_STAY_SERVER_FREE)('%s imports nothing server-only', (module) => {
    const { packages } = reachableFrom([path.join(SRC, module)])
    const found = SERVER_ONLY_PACKAGES.filter((name) => packages.has(name)).map((name) =>
      chainOf(packages.get(name) as string[]),
    )
    expect(found).toEqual([])
  })
})
