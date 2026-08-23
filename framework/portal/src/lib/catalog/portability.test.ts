import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  clearHistoryCache,
  diffAgainstParent,
  diffRevisions,
  getEntityHistory,
  historyAvailability,
  listCommits,
  listEntityFiles,
  readFileAtRevision,
  resolveVersion,
  unbumpedChanges,
} from '../history/git'
import { EMBEDDED_META_SCHEMAS } from '../schema/embedded'
import { CANONICAL_SCHEMA_HOST, srnToSchemaUrl } from '../schema/url'
import {
  withArtifactChecks,
  withDatamodelChecks,
  withEnvironmentChecks,
  withEvolutionChecks,
  withKindChecks,
  withProseChecks,
  withSchemaRegistry,
} from './index'
import { catalogListings } from './listings'
import { catalogRoot, loadCatalog } from './load'
import { MODE_ENV_VAR } from './mode'
import type { Catalog, Diagnostic } from './types'

/**
 * **Portability conformance** — the portal against a catalog that is not this
 * repository.
 *
 * Every other suite either builds a fixture to exercise one rule
 * (`load.test.ts`, `diagnostic-coverage.test.ts`) or asserts the shipped
 * catalog stays clean (`fixture-check.test.ts`). Neither answers the question a
 * first user asks: *does this thing work on my directory?* — which is a
 * different question, because the failures that answer "no" are the ones that
 * do not fail. A version gate that checks nothing and prints a reassuring
 * sentence, a catalog directory that was never mounted and reads as an empty
 * valid one, a git-backed rule that cannot run and is not counted as skipped:
 * each is green, and each is green about nothing.
 *
 * ## What may be asserted here
 *
 * Rules, never contents. **No assertion in this file may name a solution that
 * lives in `solutions/`, or state a catalog-wide count.** Both have been the
 * defect twice: a suite that asserts "480 entities across 5 solutions" is a
 * photograph of one afternoon, it goes red for correct work, and it says
 * nothing whatsoever about somebody else's catalog. The fixtures below are
 * written into temp directories under names this repository does not contain,
 * and what is asserted about them is derivable from the fixture itself — "as
 * many entities as index.md files", "every diagnostic path lands inside the
 * root", "the same shape under a different name gives the same verdict".
 *
 * The four catalogs the task names are all here: a foreign single-solution
 * catalog, a catalog in no git repository at all, an empty catalog, and the
 * day-one catalog that is one solution and nothing else. The git-less case runs
 * twice — no repository, and no `git` binary on PATH — because they are
 * different failures with the same requirement: history degrades with a named
 * reason and nothing throws.
 *
 * ## A catalog with no past proves nothing about git
 *
 * Every fixture here used to write its datamodel at version 1, and the one rule
 * in the pipeline that reads a commit returns before its first `rev-parse` for
 * those. So the whole file ran without a single git call, and the test that
 * claimed "with git and without it agree" was comparing two runs that had each
 * done nothing — it stayed green with `resolveContext` mutated to throw
 * unconditionally. "A catalog whose past decides the verdict" is the fix: v2 on
 * disk with v1 behind it in a commit, which is the only shape in which history
 * changes the answer, and therefore the only one in which a shallow clone or a
 * repository with no commits is distinguishable from a clean bill of health.
 */

/* ------------------------------------------------------------------ fixtures */

const scratch: string[] = []

afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })))
})

/** A temp directory holding a `solutions/` catalog root, and nothing else. */
async function temp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), `metaframework-portability-${prefix}-`))
  scratch.push(dir)
  return dir
}

type Frontmatter = Record<string, unknown>

/** Required kind-specific fields, per framework/spec/kinds/*.md. */
const KIND_DEFAULTS: Record<string, Frontmatter> = {
  solution: { vision: 'Move parcels without losing any.' },
  product: { lifecycle: 'active' },
  component: { 'component-type': 'service', lifecycle: 'released' },
  actor: { 'actor-type': 'human', goals: ['Send a parcel.'] },
  environment: { 'environment-type': 'production' },
  datamodel: { usage: 'both' },
}

function frontmatter(name: string, kind: string, extra: Frontmatter = {}): Frontmatter {
  return {
    name,
    kind,
    version: 1,
    title: name,
    summary: `The ${name} ${kind}.`,
    status: 'approved',
    ...(KIND_DEFAULTS[kind] ?? {}),
    ...extra,
  }
}

/** YAML for a flat-ish frontmatter block; objects and arrays go through JSON. */
function yaml(fields: Frontmatter): string {
  return Object.entries(fields)
    .map(([key, value]) =>
      typeof value === 'object' && value !== null
        ? `${key}:\n${JSON.stringify(value, null, 2)
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')}`
        : `${key}: ${JSON.stringify(value)}`,
    )
    .join('\n')
}

interface CatalogFixture {
  /** The catalog root — the directory CATALOG_DIR would name. */
  dir: string
  /** How many entity documents were written. */
  entityCount: number
}

/**
 * Write a catalog under a temp root. `entities` maps a catalog-relative entity
 * directory to its frontmatter; `files` adds any other file, relative to the
 * catalog root.
 */
async function writeCatalog(
  prefix: string,
  entities: Record<string, Frontmatter>,
  files: Record<string, string> = {},
): Promise<CatalogFixture> {
  const root = await temp(prefix)
  const dir = path.join(root, 'solutions')
  await mkdir(dir, { recursive: true })

  for (const [relDir, fields] of Object.entries(entities)) {
    const target = path.join(dir, relDir)
    await mkdir(target, { recursive: true })
    await writeFile(path.join(target, 'index.md'), `---\n${yaml(fields)}\n---\n\nProse about it.\n`)
  }
  for (const [relPath, content] of Object.entries(files)) {
    const target = path.join(dir, relPath)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
  }
  return { dir, entityCount: Object.keys(entities).length }
}

/**
 * The datamodel schema {@link writeSolution} ships, and its two possible
 * successors — one legal, one not.
 *
 * `additive` adds an optional property, which every instance v1 accepted still
 * satisfies. `breaking` adds the same property *and requires it*, which is the
 * tightening `evolution.md` forbids: an instance without `route` was valid at v1
 * and is not at v2.
 */
function parcelSchema(solution: string, shape: 'v1' | 'additive' | 'breaking'): string {
  const modelSrn = `srn://${solution}/product/dispatch/datamodel/parcel`
  return `${JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: srnToSchemaUrl(modelSrn),
      'x-srn': modelSrn,
      type: 'object',
      title: 'Parcel',
      properties:
        shape === 'v1' ? { id: { type: 'string' } } : { id: { type: 'string' }, route: { type: 'string' } },
      ...(shape === 'breaking' ? { required: ['route'] } : {}),
    },
    null,
    2,
  )}\n`
}

/**
 * A whole solution under one name: the shape a real catalog has on the day it
 * is first worth serving. Parameterised by the solution name so the same shape
 * can be written twice and the two verdicts compared — see "shape, not name".
 */
async function writeSolution(prefix: string, solution: string): Promise<CatalogFixture> {
  return writeCatalog(
    prefix,
    {
      [solution]: frontmatter(solution, 'solution'),
      [`${solution}/actor/sender`]: frontmatter('sender', 'actor'),
      [`${solution}/environment/production`]: frontmatter('production', 'environment'),
      [`${solution}/product/dispatch`]: frontmatter('dispatch', 'product'),
      [`${solution}/product/dispatch/component/router`]: frontmatter('router', 'component', {
        relations: { uses: ['/environment/production'] },
      }),
      [`${solution}/product/dispatch/datamodel/parcel`]: frontmatter('parcel', 'datamodel'),
    },
    { [`${solution}/product/dispatch/datamodel/parcel/schema.json`]: parcelSchema(solution, 'v1') },
  )
}

/** git in a fixture, with the ambient user's configuration kept out of it. */
function gitIn(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  })
}

/** Run `fn` with no `git` on PATH. */
async function hidingGit<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env.PATH
  process.env.PATH = await temp('empty-path')
  try {
    return await fn()
  } finally {
    process.env.PATH = saved
  }
}

/** Run `fn` as a deployed build rather than as somebody's working tree. */
async function asDeployment<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env[MODE_ENV_VAR]
  process.env[MODE_ENV_VAR] = 'deployment'
  try {
    return await fn()
  } finally {
    if (saved === undefined) delete process.env[MODE_ENV_VAR]
    else process.env[MODE_ENV_VAR] = saved
  }
}

interface EvolvedFixture extends CatalogFixture {
  /** The repository the catalog sits inside. */
  repoRoot: string
}

/**
 * A foreign catalog whose datamodel is at v2, with v1 behind it in a commit.
 *
 * **The only fixture in this file that makes the pipeline touch git at all**,
 * and the reason it exists is a defect this suite had: the additive-schema rule
 * short-circuits at `version < 2` before its first `rev-parse`, so every v1
 * fixture runs the whole "with git" pipeline without a single git call. A
 * with-git/without-git comparison over one of those compares two runs that both
 * did nothing — it stayed green with `resolveContext` mutated to throw
 * unconditionally, which is a suite named for portability unable to see a git
 * regression.
 *
 * `commitSecond` decides whether v2 is committed too. Left uncommitted it is the
 * shape a working tree has mid-edit; committed, it is a repository whose *past*
 * holds the predecessor — which is what a shallow clone of it then cannot see.
 */
async function evolvedRepository(
  prefix: string,
  solution: string,
  shape: 'additive' | 'breaking',
  { commitSecond = false, init = true } = {},
): Promise<EvolvedFixture> {
  const fixture = await writeSolution(prefix, solution)
  const repoRoot = path.dirname(fixture.dir)

  if (init) {
    gitIn(repoRoot, ['init', '-b', 'main', '--quiet'])
    gitIn(repoRoot, ['add', '-A'])
    gitIn(repoRoot, ['commit', '--quiet', '-m', 'the first version of the parcel'])
  }

  const model = path.join(fixture.dir, solution, 'product', 'dispatch', 'datamodel', 'parcel')
  await writeFile(path.join(model, 'schema.json'), parcelSchema(solution, shape))
  await writeFile(
    path.join(model, 'index.md'),
    `---\n${yaml(frontmatter('parcel', 'datamodel', { version: 2 }))}\n---\n\nProse about it.\n`,
  )

  if (init && commitSecond) {
    gitIn(repoRoot, ['add', '-A'])
    gitIn(repoRoot, ['commit', '--quiet', '-m', 'the second version of the parcel'])
  }
  return { ...fixture, repoRoot }
}

/** A clone of `repoRoot`, at the given depth — the catalog root inside it. */
async function cloneCatalog(repoRoot: string, prefix: string, depth: number | null): Promise<string> {
  const into = await temp(prefix)
  const target = path.join(into, 'clone')
  gitIn(into, ['clone', ...(depth === null ? [] : ['--depth', String(depth)]), '--quiet', `file://${repoRoot}`, target])
  return path.join(target, 'solutions')
}

/* ------------------------------------------------------------------ pipeline */

/**
 * Exactly what `load()` in ./index.ts runs, against a caller-supplied root.
 *
 * Spelled out rather than reached through `getCatalog()` because that one reads
 * `catalogDir()` — process-wide state — and memoises per fingerprint. A
 * conformance suite that shared a cache between two catalogs would be asserting
 * the cache.
 */
async function pipeline(dir: string): Promise<Catalog> {
  const catalog = await loadCatalog({ catalogDir: dir })
  const listings = await catalogListings(dir, catalog)
  const checked = withKindChecks(withProseChecks(withArtifactChecks(catalog)), listings)
  const loaded = await withEvolutionChecks(
    withEnvironmentChecks(withDatamodelChecks(withSchemaRegistry(checked))),
    { catalogDir: dir },
  )
  return loaded.catalog
}

const errorsIn = (catalog: Catalog) => catalog.diagnostics.filter((d) => d.severity === 'error')
const format = (d: Diagnostic) => `${d.code} ${d.path} — ${d.message}`

/* ----------------------------------------------- a catalog that is not ours */

describe('a foreign single-solution catalog', () => {
  it('loads every entity it holds and nothing else', async () => {
    const fixture = await writeSolution('foreign', 'parcelworks')
    const catalog = await pipeline(fixture.dir)

    // Derived from the fixture, not from a remembered number.
    expect(catalog.entities.size).toBe(fixture.entityCount)
    expect(catalog.solutions).toEqual(['srn://parcelworks'])
    for (const srn of catalog.entities.keys()) {
      expect(srn === 'srn://parcelworks' || srn.startsWith('srn://parcelworks/')).toBe(true)
    }
  })

  it('finds nothing wrong with a well-formed one', async () => {
    const fixture = await writeSolution('foreign-clean', 'parcelworks')
    const catalog = await pipeline(fixture.dir)
    expect(errorsIn(catalog).map(format)).toEqual([])
  })

  it('keeps every diagnostic path relative to the catalog root it was given', async () => {
    const fixture = await writeSolution('foreign-paths', 'parcelworks')
    const catalog = await pipeline(fixture.dir)

    // A loop over an empty list asserts nothing, and this fixture is clean
    // enough that it nearly is one. Guard the guard.
    expect(catalog.diagnostics.length).toBeGreaterThan(0)
    for (const diagnostic of catalog.diagnostics) {
      expect(path.isAbsolute(diagnostic.path)).toBe(false)
      expect(diagnostic.path.split('/')).not.toContain('..')
      // A path that leaves the root would name a file the reader cannot open
      // from the catalog they are holding.
      expect(path.resolve(fixture.dir, diagnostic.path).startsWith(fixture.dir + path.sep)).toBe(true)
    }
  })

  it('answers the same for the same shape under a different name', async () => {
    // The anti-snapshot rule, mechanised. Two catalogs identical but for the
    // solution name must produce the same verdict, or something in the pipeline
    // is keyed on content rather than on structure.
    const one = await writeSolution('shape-a', 'parcelworks')
    const two = await writeSolution('shape-b', 'harbourline')

    const [first, second] = [await pipeline(one.dir), await pipeline(two.dir)]

    const normalise = (catalog: Catalog, name: string) =>
      catalog.diagnostics
        .map((d) => `${d.code} ${d.path.split(name).join('<solution>')} ${d.severity}`)
        .sort()

    expect(normalise(second, 'harbourline')).toEqual(normalise(first, 'parcelworks'))
    expect(second.entities.size).toBe(first.entities.size)
  })
})

/* ------------------------------------------------------------- the day-one catalog */

describe('a day-one catalog — one solution and nothing else', () => {
  it('loads, and reports nothing wrong', async () => {
    const fixture = await writeCatalog('day-one', { orbital: frontmatter('orbital', 'solution') })
    const catalog = await pipeline(fixture.dir)

    expect(catalog.entities.size).toBe(1)
    expect([...catalog.entities.keys()]).toEqual(['srn://orbital'])
    expect(catalog.entities.get('srn://orbital')?.kind).toBe('solution')
    expect(errorsIn(catalog).map(format)).toEqual([])
  })

  it('takes the solution identity from the directory it was given', async () => {
    // Nothing in the loader may know a solution name in advance: the SRN is the
    // path, and a catalog whose directory is renamed is a different solution.
    const fixture = await writeCatalog('day-one-named', { 'quiet-harbour': frontmatter('quiet-harbour', 'solution') })
    const catalog = await pipeline(fixture.dir)
    expect([...catalog.entities.keys()]).toEqual(['srn://quiet-harbour'])
  })
})

/* -------------------------------------------------- empty, and not-there-at-all */

describe('an empty catalog', () => {
  it('is a legal state: no entities, no complaints, no throw', async () => {
    const fixture = await writeCatalog('empty', {})
    const catalog = await pipeline(fixture.dir)

    expect(catalog.entities.size).toBe(0)
    expect(catalog.solutions).toEqual([])
    expect(catalog.diagnostics).toEqual([])
  })

  it('is readable — which is what makes "no solutions yet" a true sentence', async () => {
    const fixture = await writeCatalog('empty-root', {})
    expect(await catalogRoot(fixture.dir)).toEqual({ dir: fixture.dir, readable: true, reason: null })
  })
})

describe('a catalog directory that is not there', () => {
  /**
   * The failure a forgotten mount, a typo'd CATALOG_DIR and a relative path
   * resolved against the wrong cwd all produce. The loader answers it with an
   * empty catalog — which is the right *posture* (a misconfigured path must not
   * crash a running portal) and the wrong *report*: "valid" is not something
   * that can be said about a directory nobody could read.
   */
  it('is distinguishable from an empty one', async () => {
    const root = await temp('missing')
    const absent = path.join(root, 'solutions')

    expect(await catalogRoot(absent)).toEqual({
      dir: absent,
      readable: false,
      reason: 'does not exist',
    })
  })

  it('says which way it is unreadable', async () => {
    const root = await temp('not-a-dir')
    const file = path.join(root, 'solutions')
    await writeFile(file, 'not a catalog\n')

    expect(await catalogRoot(file)).toEqual({ dir: file, readable: false, reason: 'is not a directory' })
  })

  // Mode bits do not apply to root, and a suite that failed for that reason
  // would be failing about the runner rather than about the catalog.
  it.skipIf(process.getuid?.() === 0)('tells a directory it may not read from one that is not there', async () => {
    const root = await temp('unreadable')
    const dir = path.join(root, 'solutions')
    await mkdir(dir, { recursive: true })
    await chmod(dir, 0o000)
    try {
      expect(await catalogRoot(dir)).toEqual({
        dir,
        readable: false,
        reason: 'is not readable by this process',
      })
    } finally {
      // Restored so the afterAll cleanup can descend into it.
      await chmod(dir, 0o755)
    }
  })

  it('still loads as an empty catalog rather than throwing', async () => {
    const root = await temp('missing-loads')
    const catalog = await pipeline(path.join(root, 'solutions'))
    expect(catalog.entities.size).toBe(0)
    expect(catalog.diagnostics).toEqual([])
  })

  it('does not hand a reader a raw syscall name when the path is a file', async () => {
    // `CATALOG_DIR` aimed one level too deep — at an `index.md` rather than at
    // the directory holding it. The path exists, so the guard that checked only
    // existence let it through to a spawn, where libuv failed before git ever
    // started and the reader was told "spawn ENOTDIR" about their catalog.
    const root = await temp('catalog-is-a-file')
    const file = path.join(root, 'solutions')
    await writeFile(file, 'not a catalog\n')

    clearHistoryCache()
    const status = await historyAvailability({ catalogDir: file })
    clearHistoryCache()

    expect(status.available).toBe(false)
    expect(status.message).toContain('is not a directory')
    expect(status.message).toContain(file)
    expect(status.message).not.toContain('ENOTDIR')
  })

  it('keeps the path out of the sentence in a deployment', async () => {
    // The same failure in the other mode. `unavailable.message` is rendered
    // verbatim by the entity page's history panel, which no mode gates, and a
    // deployment is a portal whose catalog directory is nobody's business — the
    // rule /api/status already follows for `catalogDir`. The mount can go away
    // under a running container, so this is reachable there and not only here.
    const root = await temp('catalog-is-a-file-deployed')
    const file = path.join(root, 'solutions')
    await writeFile(file, 'not a catalog\n')

    clearHistoryCache()
    const status = await asDeployment(() => historyAvailability({ catalogDir: file }))
    clearHistoryCache()

    expect(status.available).toBe(false)
    expect(status.message).toContain('is not a directory')
    expect(status.message).not.toContain(file)
    expect(status.message).not.toContain(root)
  })
})

/* ---------------------------------------------------------- no git anywhere */

/**
 * Every history entry point, against a catalog with no history to read.
 *
 * The bar is the one lib/history/git.ts sets for itself — "nothing here
 * throws… must still render the catalog and simply say why the past is not
 * reachable" — so each call is asserted to *answer*, and to name a reason
 * rather than inventing a story about why there is none.
 */
async function historySurfaces(dir: string, relDir: string) {
  clearHistoryCache()
  const options = { catalogDir: dir }
  const commit = 'a'.repeat(40)

  const surfaces = {
    history: await getEntityHistory(relDir, options),
    commits: await listCommits(`${relDir}/index.md`, options),
    worktree: await readFileAtRevision(`${relDir}/index.md`, null, options),
    atCommit: await readFileAtRevision(`${relDir}/index.md`, commit, options),
    files: await listEntityFiles(relDir, commit, options),
    current: await resolveVersion(relDir, 1, options),
    older: await resolveVersion(relDir, 2, options),
    parentDiff: await diffAgainstParent(`${relDir}/index.md`, commit, options),
    revisionDiff: await diffRevisions(`${relDir}/index.md`, commit, null, options),
    unbumped: await unbumpedChanges(relDir, options),
  }
  clearHistoryCache()
  return surfaces
}

describe.each([
  ['no git repository', 'not-a-repository' as const, false],
  ['no git binary on PATH', 'no-git-binary' as const, true],
])('a catalog with %s', (_label, reason, hideGit) => {
  /** Run `fn` with git unreachable, when this case calls for it. */
  async function withoutGit<T>(fn: () => Promise<T>): Promise<T> {
    return hideGit ? hidingGit(fn) : fn()
  }

  it('loads every entity it holds and finds nothing wrong', async () => {
    const fixture = await writeSolution(`nogit-${reason}`, 'parcelworks')

    clearHistoryCache()
    const catalog = await withoutGit(() => pipeline(fixture.dir))
    clearHistoryCache()

    // Deliberately *not* phrased as "the same as it would be with git". This
    // fixture's datamodel is at v1, so the one git-backed rule short-circuits
    // before its first `rev-parse` and there is no comparison to make; claiming
    // one here is what let a suite named for portability stay green with
    // `resolveContext` mutated to throw. The real comparison needs a catalog
    // with a past — see "a catalog whose past decides the verdict".
    expect(errorsIn(catalog).map(format)).toEqual([])
    expect(catalog.entities.size).toBe(fixture.entityCount)
    expect(catalog.solutions).toEqual(['srn://parcelworks'])
  })

  it('answers every history surface with a named reason instead of throwing', async () => {
    const fixture = await writeSolution(`surfaces-${reason}`, 'parcelworks')
    const surfaces = await withoutGit(() => historySurfaces(fixture.dir, 'parcelworks'))

    expect(surfaces.history.unavailable?.reason).toBe(reason)
    expect(surfaces.history.revisions).toEqual([])
    expect(surfaces.history.diagnostics).toEqual([])
    expect(surfaces.commits.unavailable?.reason).toBe(reason)
    expect(surfaces.atCommit.unavailable?.reason).toBe(reason)
    expect(surfaces.parentDiff.unavailable?.reason).toBe(reason)
    expect(surfaces.revisionDiff.unavailable?.reason).toBe(reason)
    expect(surfaces.files).toEqual([])
    expect(surfaces.unbumped).toEqual([])
  })

  it('still reads the working tree, which is where the current version lives', async () => {
    const fixture = await writeSolution(`worktree-${reason}`, 'parcelworks')
    const surfaces = await withoutGit(() => historySurfaces(fixture.dir, 'parcelworks'))

    expect(surfaces.worktree.unavailable).toBeNull()
    expect(surfaces.worktree.content).toContain('kind: "solution"')
    // The current version is on disk, so it resolves; anything older is a miss
    // that has to say why rather than pretend the version does not exist.
    expect(surfaces.current.current).toBe(true)
    expect(surfaces.older.current).toBe(false)
    expect(surfaces.older.miss).toBe('no-history')
    expect(surfaces.older.message).toBeTruthy()
  })

  it('says that history could not be read, rather than leaving the verdict silent', async () => {
    // The rules that read commits contribute nothing here — correctly, since an
    // accusation nobody can support is worse than none. What must not happen is
    // the *verdict* going quiet about it: the same catalog reports a finding
    // where git is reachable and "valid" where it is not, and only this makes
    // the difference visible to /api/status and to `metaframework check`.
    const fixture = await writeSolution(`availability-${reason}`, 'parcelworks')
    clearHistoryCache()
    const availability = await withoutGit(() => historyAvailability({ catalogDir: fixture.dir }))
    clearHistoryCache()

    expect(availability.available).toBe(false)
    expect(availability.complete).toBe(false)
    expect(availability.limit).toBe(reason)
    expect(availability.message).toBeTruthy()
  })

  it('does not claim a directory that is on disk is not on disk', async () => {
    // `?op=show` with no commit reads the entity *directory*. Every read failure
    // was reported as "not committed — <path> is not on disk", which is a false
    // statement about a path the reader can see in their own file tree.
    const fixture = await writeSolution(`eisdir-${reason}`, 'parcelworks')
    clearHistoryCache()
    const revision = await withoutGit(() =>
      readFileAtRevision('parcelworks', null, { catalogDir: fixture.dir }),
    )
    clearHistoryCache()

    expect(revision.content).toBeNull()
    expect(revision.unavailable?.message).not.toContain('is not on disk')
    expect(revision.unavailable?.message).toContain('directory')
  })
})

/* -------------------------------------------- a foreign catalog with history */

describe('a foreign catalog inside its own repository', () => {
  it('reads its history through git, including when the path is a symlink', async () => {
    const fixture = await writeSolution('foreign-repo', 'parcelworks')
    const repoRoot = path.dirname(fixture.dir)
    gitIn(repoRoot, ['init', '-b', 'main', '--quiet'])
    gitIn(repoRoot, ['add', '-A'])
    gitIn(repoRoot, ['commit', '--quiet', '-m', 'the first solution'])

    // A second path to the same catalog, through a symlink — the shape every
    // macOS temp directory already has and plenty of checkouts have on purpose.
    const linkRoot = await temp('foreign-repo-link')
    const link = path.join(linkRoot, 'linked')
    await symlink(repoRoot, link)

    for (const dir of [fixture.dir, path.join(link, 'solutions')]) {
      clearHistoryCache()
      expect(await historyAvailability({ catalogDir: dir })).toEqual({
        available: true,
        complete: true,
        limit: null,
        message: null,
      })

      const history = await getEntityHistory('parcelworks', { catalogDir: dir })
      expect(history.unavailable).toBeNull()
      expect(history.revisions).toHaveLength(1)
      expect(history.currentVersion).toBe(1)
      // The version→commit index is what a `@1` pin resolves through; it is
      // built from the catalog's own prefix inside a repository this framework
      // did not create.
      expect(Object.keys(history.versions)).toEqual(['1'])
      clearHistoryCache()
    }
  })
})

/* ------------------------------------- a catalog whose past decides the verdict */

/**
 * The half of portability the rest of this file cannot reach.
 *
 * Every fixture above writes its datamodel at version 1, and the additive-schema
 * rule — the only rule in the pipeline that reads a commit — returns before its
 * first `rev-parse` for those. So none of them can tell a working git integration
 * from a broken one, and the comparison that claimed to ("with git and without it
 * agree") was comparing two runs that had each done nothing.
 *
 * These fixtures put v2 on disk with v1 behind it, which is the only shape in
 * which the past changes the answer. That makes three previously invisible
 * states visible, and two of them were live defects:
 *
 *  - **no git binary** — the rule cannot run, and the report says so;
 *  - **a shallow clone** — `actions/checkout`'s default. git answers every call
 *    and the predecessor is simply not there, so the finding vanished under a
 *    verdict that read `catalog is valid`;
 *  - **a repository with no commits**, which is where a catalog starts.
 */
describe('a catalog whose past decides the verdict', () => {
  it('reads the predecessor out of a commit, and stays silent when the change was additive', async () => {
    const fixture = await evolvedRepository('evolved-additive', 'parcelworks', 'additive')
    const model = 'parcelworks/product/dispatch/datamodel/parcel'

    clearHistoryCache()
    const withGit = await pipeline(fixture.dir)
    const reach = await historyAvailability({ catalogDir: fixture.dir })

    // The rule's own two git calls, made here in the same order and asserted on
    // their content. Everything below this line would also be true of a run that
    // never touched git — an additive v1 → v2 is legal, so the rule's output is
    // empty whether it ran or not, and the earlier version of this test asserted
    // only that emptiness. It survived `resolveVersion` returning no commit at
    // all. The v1 schema has no `route` property and the v2 on disk does, so the
    // one assertion that cannot be faked by reading the working tree is the
    // shape of what came back.
    const previous = await resolveVersion(model, 1, { catalogDir: fixture.dir })
    expect(previous.commit).toMatch(/^[0-9a-f]{7,40}$/)
    const schemaAtV1 = await readFileAtRevision(`${model}/schema.json`, previous.commit, {
      catalogDir: fixture.dir,
    })
    expect(schemaAtV1.unavailable).toBeNull()
    expect(JSON.parse(schemaAtV1.content ?? '{}').properties).toEqual({ id: { type: 'string' } })
    expect(reach).toEqual({ available: true, complete: true, limit: null, message: null })

    clearHistoryCache()
    const without = await hidingGit(() => pipeline(fixture.dir))
    clearHistoryCache()

    // What this half proves, and the limit of it: an unreadable past must not
    // *manufacture* a finding. It cannot prove the rule ran — a rule stubbed out
    // to return nothing passes here and is caught by the breaking fixture in the
    // next test, which is the only shape where a comparison that did not happen
    // has a visible cost.
    expect(errorsIn(withGit).map(format)).toEqual([])
    expect(without.diagnostics.map(format)).toEqual(withGit.diagnostics.map(format))
    expect(without.entities.size).toBe(fixture.entityCount)
  })

  it('finds a tightening when the predecessor is readable, and reports the gap when it is not', async () => {
    const fixture = await evolvedRepository('evolved-breaking', 'parcelworks', 'breaking')

    clearHistoryCache()
    const seen = await pipeline(fixture.dir)
    const readable = await historyAvailability({ catalogDir: fixture.dir })
    clearHistoryCache()
    const unseen = await hidingGit(() => pipeline(fixture.dir))
    const unreadable = await hidingGit(() => historyAvailability({ catalogDir: fixture.dir }))
    clearHistoryCache()

    expect(errorsIn(seen).map((diagnostic) => diagnostic.code)).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(readable).toEqual({ available: true, complete: true, limit: null, message: null })
    // The finding is still a path inside the catalog it was given, which is the
    // one thing every diagnostic owes a reader holding somebody else's tree.
    for (const diagnostic of seen.diagnostics) {
      expect(path.isAbsolute(diagnostic.path)).toBe(false)
      expect(path.resolve(fixture.dir, diagnostic.path).startsWith(fixture.dir + path.sep)).toBe(true)
    }

    // Without git the same catalog is clean — correctly, since an accusation
    // nobody can support is worse than none. What must not happen is the report
    // agreeing with it.
    expect(errorsIn(unseen)).toEqual([])
    expect(unreadable.available).toBe(false)
    expect(unreadable.limit).toBe('no-git-binary')
  })

  it('calls a shallow clone incomplete rather than calling it fine', async () => {
    // The regression guard for the failure this whole describe exists to name:
    // one repository, two clones, and the only difference between the verdicts
    // is how much of the past came with them.
    const fixture = await evolvedRepository('shallow-source', 'parcelworks', 'breaking', { commitSecond: true })
    const full = await cloneCatalog(fixture.repoRoot, 'clone-full', null)
    const shallow = await cloneCatalog(fixture.repoRoot, 'clone-shallow', 1)

    clearHistoryCache()
    const complete = await pipeline(full)
    const completeStatus = await historyAvailability({ catalogDir: full })
    clearHistoryCache()
    const truncated = await pipeline(shallow)
    const truncatedStatus = await historyAvailability({ catalogDir: shallow })
    clearHistoryCache()

    expect(errorsIn(complete).map((diagnostic) => diagnostic.code)).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(completeStatus.complete).toBe(true)

    // Same bytes on disk, and the rule cannot fire — so the report carries the
    // whole of the difference. `available` alone could not: git is right there
    // and answers everything asked of it.
    expect(errorsIn(truncated)).toEqual([])
    expect(truncatedStatus.available).toBe(true)
    expect(truncatedStatus.complete).toBe(false)
    expect(truncatedStatus.limit).toBe('shallow-clone')
    expect(truncatedStatus.hint).toContain('unshallow')
  })

  it('stops calling it shallow once the reader has taken the hint', async () => {
    // The hint above says `git fetch --unshallow`, so somebody will run it, and
    // the answer has to move. This test deliberately never clears the cache
    // between the two reads: shallowness used to ride the repository-layout
    // cache, which is kept for the life of the process, so a `serve` session
    // went on printing "shallow clone" at a repository that was no longer one.
    const fixture = await evolvedRepository('unshallow-live', 'parcelworks', 'breaking', { commitSecond: true })
    const shallow = await cloneCatalog(fixture.repoRoot, 'clone-unshallowed', 1)

    clearHistoryCache()
    expect((await historyAvailability({ catalogDir: shallow })).limit).toBe('shallow-clone')

    gitIn(path.dirname(shallow), ['fetch', '--unshallow', '--quiet'])

    // Past the listing TTL, without a restart and without a cache clear. Only
    // the clock moves — Date is the single thing faked, so the git calls below
    // are as real as the ones above.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 10_000)
      expect(await historyAvailability({ catalogDir: shallow })).toEqual({
        available: true,
        complete: true,
        limit: null,
        message: null,
      })
      expect(errorsIn(await pipeline(shallow)).map((diagnostic) => diagnostic.code)).toEqual([
        'E_DM_NOT_ADDITIVE',
      ])
    } finally {
      vi.useRealTimers()
      clearHistoryCache()
    }
  })

  it('calls a repository with no commits a repository with no commits', async () => {
    // `git init` and nothing else — the state of a catalog on the day it is
    // created, and the one place every `rev-parse` here succeeds while every
    // walk behind it comes back empty.
    const fixture = await evolvedRepository('unborn', 'parcelworks', 'breaking', { init: false })
    gitIn(fixture.repoRoot, ['init', '-b', 'main', '--quiet'])

    clearHistoryCache()
    const catalog = await pipeline(fixture.dir)
    const status = await historyAvailability({ catalogDir: fixture.dir })
    clearHistoryCache()

    expect(errorsIn(catalog)).toEqual([])
    expect(status.available).toBe(false)
    expect(status.complete).toBe(false)
    expect(status.limit).toBe('no-commits')
    expect(status.message).toBeTruthy()
  })
})

/* ------------------------------------------------------------- the verdict */

/**
 * `/api/status` is the whole of `metaframework check` and the container's
 * healthcheck, so it is the surface on which a silent skip becomes a green
 * build. Both fields asserted here exist because it used to answer "zero
 * errors, zero warnings" for a catalog it had not read, and for one whose
 * git-backed rules had not run.
 */
describe('the status a foreign catalog reports about itself', () => {
  const saved = process.env.CATALOG_DIR

  afterAll(() => {
    if (saved === undefined) delete process.env.CATALOG_DIR
    else process.env.CATALOG_DIR = saved
  })

  async function status(dir: string) {
    process.env.CATALOG_DIR = dir
    clearHistoryCache()
    const { GET } = await import('@/app/api/status/route')
    const response = await GET()
    clearHistoryCache()
    return (await response.json()) as {
      catalogRoot: { readable: boolean; reason: string | null }
      history: {
        available: boolean
        complete: boolean
        reason: string | null
        message: string | null
        hint: string | null
        uncheckedDatamodels: number
      }
      entities: number
      solutions: number
      diagnostics: { errors: number; warnings: number }
    }
  }

  it('reports a readable root and unreadable history for a git-less catalog', async () => {
    const fixture = await writeSolution('status-nogit', 'tidewater')
    const body = await status(fixture.dir)

    expect(body.catalogRoot).toEqual({ readable: true, reason: null })
    expect(body.entities).toBe(fixture.entityCount)
    expect(body.solutions).toBe(1)
    expect(body.diagnostics.errors).toBe(0)
    // A temp directory is in no repository, so the one class of check that
    // reads commits could not run — and the status says so instead of letting
    // the counts imply it was tried.
    expect(body.history.available).toBe(false)
    expect(body.history.message).toBeTruthy()
    // …and nothing in this catalog needed a predecessor, so the honest cost of
    // that is zero. A report that said otherwise would be teaching every
    // day-one reader to scroll past the line that will one day matter.
    expect(body.history.uncheckedDatamodels).toBe(0)
  })

  it('counts what an unreadable past actually cost the catalog', async () => {
    // The other half of the same rule. This catalog holds one datamodel that
    // needs a predecessor, so the report names one — the number the CLI prints,
    // and the reason the note is a measurement rather than a standing caveat.
    const fixture = await evolvedRepository('status-unchecked', 'tidewater', 'breaking', { init: false })
    const body = await status(fixture.dir)

    expect(body.history.available).toBe(false)
    expect(body.history.uncheckedDatamodels).toBe(1)
    expect(body.diagnostics.errors).toBe(0)
  })

  it('reports a shallow clone as available but incomplete, with what to do about it', async () => {
    const fixture = await evolvedRepository('status-shallow', 'tidewater', 'breaking', { commitSecond: true })
    const shallow = await cloneCatalog(fixture.repoRoot, 'status-shallow-clone', 1)
    const body = await status(shallow)

    expect(body.history.available).toBe(true)
    expect(body.history.complete).toBe(false)
    expect(body.history.reason).toBe('shallow-clone')
    expect(body.history.uncheckedDatamodels).toBe(1)
    expect(body.history.hint).toContain('unshallow')
    // The finding the full clone reports is absent here, which is the whole
    // reason the three fields above have to exist.
    expect(body.diagnostics.errors).toBe(0)
  })

  it('does not report an unread directory as a valid empty catalog', async () => {
    const root = await temp('status-missing')
    const body = await status(path.join(root, 'solutions'))

    expect(body.catalogRoot).toEqual({ readable: false, reason: 'does not exist' })
    expect(body.entities).toBe(0)
    expect(body.diagnostics.errors).toBe(0)
  })
})

/* ------------------------------------- the framework's own, in any catalog */

/**
 * **The one document set a foreign catalog cannot supply for itself.**
 *
 * Every artifact the framework tells an author to write opens with a `$schema`
 * naming a datamodel of the framework's *own* solution. That solution lives in
 * this repository and nowhere else, so a portal pointed at somebody else's
 * catalog had no bytes to answer with and returned 404 to the very first
 * instruction the framework gives — while `metaframework check` passed the file
 * clean, because a dialect header is compared as a string and a string cannot
 * tell "correct" from "retrievable". The portal now carries the documents
 * (`lib/schema/embedded.ts`) and serves them under its own base.
 *
 * Nothing here names a solution or a document: every path comes from the
 * embedded table, which is the same rule the rest of this file follows.
 */
describe('the meta-schemas a foreign catalog cannot hold', () => {
  const saved = process.env.CATALOG_DIR
  const served = Object.keys(EMBEDDED_META_SCHEMAS).sort()

  afterAll(() => {
    if (saved === undefined) delete process.env.CATALOG_DIR
    else process.env.CATALOG_DIR = saved
  })

  /** The `/schemas` route, against a given catalog, at a given entity path. */
  async function serve(catalog: string, relDir: string): Promise<Response> {
    process.env.CATALOG_DIR = catalog
    const { GET } = await import('../../app/schemas/[...path]/route')
    return GET(new Request(`http://localhost:3000/schemas/${relDir}`), {
      params: Promise.resolve({ path: relDir.split('/') }),
    })
  }

  it('has documents to serve at all', () => {
    // The floor under every loop below: an empty table would pass all of them.
    expect(served.length).toBeGreaterThan(0)
  })

  it('answers for every one of them from a catalog that has no such solution', async () => {
    const fixture = await writeSolution('meta-foreign', 'tidewater')

    for (const relDir of served) {
      const response = await serve(fixture.dir, relDir)
      expect(response.status, relDir).toBe(200)
      expect(response.headers.get('content-type'), relDir).toContain('application/schema+json')

      const body = await response.text()
      expect(body, relDir).toBe(EMBEDDED_META_SCHEMAS[relDir])
      // Retrieval moved; identity did not. The document a foreign portal hands
      // over still calls itself by the canonical URL its author was told to
      // write, which is the only reason serving it locally is honest.
      expect((JSON.parse(body) as { $id: string }).$id, relDir).toBe(`${CANONICAL_SCHEMA_HOST}/${relDir}`)
    }
  })

  it('still has nothing to say about a datamodel the catalog does not have', async () => {
    // The control for the test above. A fallback that answered *any* legal
    // datamodel address would pass it while making the route a liar about
    // every entity in the catalog it was pointed at.
    const fixture = await writeSolution('meta-foreign-miss', 'tidewater')
    const response = await serve(fixture.dir, 'tidewater/product/dispatch/datamodel/nonesuch')

    expect(response.status).toBe(404)
  })

  it('prefers the catalog copy when the catalog is the one that owns them', async () => {
    // This repository *is* a catalog holding these eight, and an edit to one of
    // them has to show on the next request rather than after a regeneration —
    // otherwise the framework's own portal is the one place the documents go
    // stale. Precedence this way round also means the fallback can never shadow
    // a real entity.
    const [relDir] = served
    const edited = `${JSON.stringify(
      { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `${CANONICAL_SCHEMA_HOST}/${relDir}`, title: 'edited in the catalog' },
      null,
      2,
    )}\n`
    // Without this the assertion below could pass on the embedded bytes.
    expect(edited).not.toBe(EMBEDDED_META_SCHEMAS[relDir])

    const fixture = await writeCatalog(
      'meta-catalog-first',
      { tidewater: frontmatter('tidewater', 'solution') },
      { [`${relDir}/schema.json`]: edited },
    )
    const response = await serve(fixture.dir, relDir)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(edited)
  })

  it('does not let the embedded copy answer a request that left the catalog', async () => {
    // The gate the fallback is most able to weaken: a symlink at the document's
    // own path, pointing outside the root, is the one escape a validated path
    // still allows. It must be answered as the refusal it is — reading it as a
    // miss would turn a 400 into a 200 and excuse the thing the check exists to
    // catch, in the one case where the route happens to hold plausible bytes.
    const [relDir] = served
    const fixture = await writeSolution('meta-symlink', 'tidewater')
    const outside = path.join(path.dirname(fixture.dir), 'outside-the-catalog.json')
    await writeFile(outside, '{}\n')
    await mkdir(path.join(fixture.dir, relDir), { recursive: true })
    await symlink(outside, path.join(fixture.dir, relDir, 'schema.json'))

    const response = await serve(fixture.dir, relDir)

    expect(response.status).toBe(400)
  })
})
