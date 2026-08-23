import { execFileSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { catalogShape, resolveCatalogDir } from './discover.mjs'
import { GIT_MISSING, inCatalogFilter, repositoryContext, unbumpedSince } from './since.mjs'

/**
 * **Portability conformance for the CLI** — the half of the tool that runs
 * before any catalog is parsed: find the directory, and judge the change that
 * produced it.
 *
 * The companion suite (`src/lib/catalog/portability.test.ts`) drives the loader
 * against foreign catalogs. This one drives the version gate against foreign
 * *repositories*, and every case here is a way of reaching a repository that a
 * developer's machine has and CI does not: through a symlink (every macOS temp
 * directory, plenty of home directories and mounts), before the first commit,
 * and with no git at all.
 *
 * Nothing here asserts a count or names a solution that lives in `solutions/`.
 * The repositories are built in temp directories under names this repository
 * does not contain, and every assertion is about what the gate *decides*, not
 * about what this catalog happens to hold today.
 *
 * ## Why these cases and not an end-to-end run of the binary
 *
 * `metaframework check` needs the compiled server (`.next/standalone`), which
 * is a `npm run package` artifact and not a test dependency. The gate itself is
 * pure git, so it is exercised here at exactly the boundary the CLI calls:
 * `repositoryContext` + `inCatalogFilter` + `unbumpedSince`, which is the whole
 * of `versionGate` minus its printing.
 */

const scratch = []
afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })))
})

const git = (cwd, args) =>
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  })

async function temp(prefix) {
  const dir = await mkdtemp(path.join(tmpdir(), `metaframework-cli-${prefix}-`))
  scratch.push(dir)
  return dir
}

function document(version, status, body = 'Body.') {
  return [
    '---',
    'name: shipment',
    'kind: datamodel',
    `version: ${version}`,
    'title: Shipment',
    'summary: A shipment.',
    `status: ${status}`,
    '---',
    '',
    body,
    '',
  ].join('\n')
}

/**
 * A repository holding a catalog, with the catalog root either at the
 * repository root or one level down — the two layouts a real catalog has.
 */
async function makeRepo({ nested = true } = {}) {
  const root = await temp('repo')
  const catalogDir = nested ? path.join(root, 'solutions') : root
  await mkdir(catalogDir, { recursive: true })
  git(root, ['init', '-b', 'main', '--quiet'])

  const write = async (rel, content) => {
    const file = path.join(catalogDir, rel)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content)
  }
  const commit = (subject) => {
    git(root, ['add', '-A'])
    git(root, ['commit', '--quiet', '-m', subject])
    return git(root, ['rev-parse', 'HEAD']).trim()
  }
  return { root, catalogDir, write, commit }
}

/** The whole of `versionGate`, minus the printing the CLI does around it. */
async function gate(catalogDir, ref) {
  const { context, failure } = await repositoryContext(catalogDir)
  if (!context) return { ran: false, failure }
  const result = await unbumpedSince({
    repoRoot: context.root,
    ref,
    inCatalog: inCatalogFilter(context.prefix),
  })
  return { ran: true, prefix: context.prefix, ...result }
}

/* ------------------------------------------------- reached through a symlink */

describe('a catalog reached through a symlink', () => {
  /**
   * The failure this suite exists for. The gate used to derive the repository
   * prefix by subtracting the repository root from the catalog path, and those
   * two strings are the same string only while every component of the path is
   * real: git answers from the physical path, the user hands over the logical
   * one. The subtraction then yields `../../..`, which prefixes no file in any
   * diff, so the gate reported "no catalog entity changed" and exited 0 over an
   * edit that had not bumped its version.
   */
  it('finds the same unbumped entity as through the real path', async () => {
    const repo = await makeRepo()
    await repo.write('parcelworks/datamodel/shipment/index.md', document(1, 'review'))
    await repo.write('parcelworks/datamodel/shipment/schema.json', '{"title":"Shipment"}')
    const base = repo.commit('add shipment')

    // A content change with no bump — the violation the gate exists to catch.
    await repo.write('parcelworks/datamodel/shipment/schema.json', '{"title":"Shipment","x":1}')

    const linkRoot = await temp('link')
    const link = path.join(linkRoot, 'linked-repo')
    await symlink(repo.root, link)

    const direct = await gate(repo.catalogDir, base)
    const linked = await gate(path.join(link, 'solutions'), base)

    expect(direct.unbumped.map((entity) => entity.dir)).toEqual(['solutions/parcelworks/datamodel/shipment'])
    expect(linked.unbumped).toEqual(direct.unbumped)
    expect(linked.entitiesTouched).toBe(direct.entitiesTouched)
  })

  it('derives the repository prefix from git rather than from the two paths', async () => {
    const repo = await makeRepo()
    await repo.write('parcelworks/index.md', document(1, 'approved'))
    repo.commit('add solution')

    const linkRoot = await temp('link-prefix')
    const link = path.join(linkRoot, 'linked-repo')
    await symlink(repo.root, link)
    const linkedCatalog = path.join(link, 'solutions')

    const { context } = await repositoryContext(linkedCatalog)
    expect(context.prefix).toBe('solutions/')

    // The reason it cannot be computed locally: the same two paths, subtracted,
    // do not produce a prefix at all. This assertion is the regression guard —
    // it fails the moment somebody reintroduces the subtraction.
    expect(path.relative(context.root, linkedCatalog)).not.toBe('solutions')
  })

  it('treats a catalog at the repository root as an empty prefix', async () => {
    const repo = await makeRepo({ nested: false })
    await repo.write('parcelworks/datamodel/shipment/index.md', document(1, 'review'))
    const base = repo.commit('add shipment')
    await repo.write('parcelworks/datamodel/shipment/index.md', document(1, 'review', 'Changed.'))

    const result = await gate(repo.catalogDir, base)
    expect(result.prefix).toBe('')
    expect(result.unbumped.map((entity) => entity.dir)).toEqual(['parcelworks/datamodel/shipment'])
  })

  it('keeps a file outside the catalog out of the gate, through either path', async () => {
    /**
     * The file outside the catalog has to sit under an `index.md` of its own,
     * and that is the whole test.
     *
     * The first version of this used a `README.md` at the repository root, and
     * it proved nothing: `unbumpedSince` groups changed files by their nearest
     * ancestor holding an `index.md`, a root README has no such ancestor, and
     * so it was discarded a step later whether or not the filter had seen it.
     * The assertion survived `inCatalogFilter` being replaced by `() => true`.
     *
     * This repository is the reason that matters rather than being a
     * technicality: `framework/spec/index.md` is a real entity document outside
     * `solutions/`, so without the prefix filter every edit under
     * `framework/spec/**` would be attributed to it and reported as an unbumped
     * entity that nobody had touched. The fixture now has that shape.
     */
    const repo = await makeRepo()
    await repo.write('parcelworks/datamodel/shipment/index.md', document(1, 'review'))
    const outside = path.join(repo.root, 'framework', 'spec')
    await mkdir(outside, { recursive: true })
    await writeFile(path.join(outside, 'index.md'), document(1, 'approved'))
    await writeFile(path.join(outside, 'structure.md'), 'The rules.\n')
    const base = repo.commit('add shipment and a spec beside the catalog')

    // Changed, and deliberately not bumped: inside the catalog this is exactly
    // what the gate exists to catch, so if the filter stops working it fires.
    await writeFile(path.join(outside, 'structure.md'), 'The rules, revised.\n')

    const linkRoot = await temp('link-outside')
    const link = path.join(linkRoot, 'linked-repo')
    await symlink(repo.root, link)

    for (const dir of [repo.catalogDir, path.join(link, 'solutions')]) {
      const result = await gate(dir, base)
      expect(result.entitiesTouched).toBe(0)
      expect(result.unbumped).toEqual([])
    }
  })

  it('still judges the entity when that same change is inside the catalog', async () => {
    // The control the assertion above needs to mean anything: the fixture's
    // out-of-catalog edit is one the gate would report, so "reported nothing"
    // is a decision about *where the file is* rather than about the edit.
    const repo = await makeRepo()
    await repo.write('parcelworks/spec/index.md', document(1, 'approved'))
    await repo.write('parcelworks/spec/structure.md', 'The rules.\n')
    const base = repo.commit('add a spec inside the catalog')
    await repo.write('parcelworks/spec/structure.md', 'The rules, revised.\n')

    const result = await gate(repo.catalogDir, base)
    expect(result.entitiesTouched).toBe(1)
    expect(result.unbumped.map((entity) => entity.dir)).toEqual(['solutions/parcelworks/spec'])
  })
})

/* ---------------------------------------------------- a repository day one */

describe('a repository with no commits yet', () => {
  /**
   * The state of a repository the minute after `git init`, which is where a
   * catalog is most likely to be created. It used to be a hard failure with a
   * raw git message — `cannot resolve "HEAD" — fatal: Needed a single revision`
   * — while its neighbour, a catalog in no repository at all, warned and passed.
   * Both are "there is nothing to compare against".
   */
  it('is nothing to compare against, not a broken invocation', async () => {
    const repo = await makeRepo()
    await repo.write('parcelworks/index.md', document(1, 'draft'))

    const result = await gate(repo.catalogDir, 'HEAD')
    expect(result.ok).toBe(true)
    expect(result.failure).toBeNull()
    expect(result.skipped).toBe('the repository has no commits yet')
    expect(result.unbumped).toEqual([])
  })

  it('still fails hard on a ref that does not exist in a repository that has commits', async () => {
    // The other half of the rule: an unresolvable ref must not be silently
    // forgiven, or a typo in CI turns the gate off for everybody.
    const repo = await makeRepo()
    await repo.write('parcelworks/index.md', document(1, 'draft'))
    repo.commit('add solution')

    const result = await gate(repo.catalogDir, 'v9.9.9-not-a-tag')
    expect(result.ok).toBe(false)
    expect(result.skipped).toBeNull()
    expect(result.failure).toContain('v9.9.9-not-a-tag')
  })
})

/* --------------------------------------------------------------- no git ---- */

describe('a catalog git cannot be asked about', () => {
  it('says the catalog is not in a repository when it is not', async () => {
    const loose = await temp('loose')
    const { context, failure } = await repositoryContext(loose)
    expect(context).toBeNull()
    expect(failure).toBeTruthy()
    expect(failure).not.toBe(GIT_MISSING)
  })

  it('says git is missing rather than blaming the catalog', async () => {
    // Two different problems with two different fixes: "install git" and "run
    // this inside a repository". Collapsing them into one message sent every
    // user of a git-less image looking for a repository they already had.
    const repo = await makeRepo()
    await repo.write('parcelworks/index.md', document(1, 'draft'))
    repo.commit('add solution')

    const saved = process.env.PATH
    process.env.PATH = await temp('empty-path')
    try {
      const { context, failure } = await repositoryContext(repo.catalogDir)
      expect(context).toBeNull()
      expect(failure).toBe(GIT_MISSING)
    } finally {
      process.env.PATH = saved
    }
  })
})

/* ---------------------------------------------------- finding the catalog */

describe('finding a catalog that is not this repository', () => {
  it('tells a directory that is not there from one that holds nothing', async () => {
    // The distinction the CLI has always drawn and the server did not: `missing`
    // stops the launcher with the path in the message, `empty` starts it and
    // says the page will fill in by itself.
    const root = await temp('shapes')
    const empty = path.join(root, 'solutions')
    await mkdir(empty, { recursive: true })

    expect(catalogShape(path.join(root, 'nowhere'))).toBe('missing')
    expect(catalogShape(empty)).toBe('empty')

    await mkdir(path.join(empty, 'parcelworks'), { recursive: true })
    await writeFile(path.join(empty, 'parcelworks', 'index.md'), document(1, 'draft'))
    expect(catalogShape(empty)).toBe('catalog')
  })

  // Mode bits do not apply to root, and this suite must not fail about its
  // runner.
  it.skipIf(process.getuid?.() === 0)('tells a directory it may not read from one that is not there', async () => {
    // The CLI's half of the distinction the server already draws. Folding this
    // into `missing` made the launcher say "which is not a directory" about a
    // directory sitting in the reader's own file tree — and send them to check
    // the path when the fix was `chmod`.
    const root = await temp('unreadable')
    const dir = path.join(root, 'solutions')
    await mkdir(dir, { recursive: true })
    await chmod(dir, 0o000)
    try {
      expect(catalogShape(dir)).toBe('unreadable')
      expect(catalogShape(path.join(root, 'nowhere'))).toBe('missing')
    } finally {
      await chmod(dir, 0o755)
    }
  })

  it('resolves a relative --dir against the directory the user is standing in', async () => {
    // The launcher's own answer to the question the packaged server gets wrong:
    // a relative path means the caller's working directory, always.
    const root = await temp('relative')
    const catalog = path.join(root, 'solutions', 'parcelworks')
    await mkdir(catalog, { recursive: true })
    await writeFile(path.join(catalog, 'index.md'), document(1, 'draft'))

    const resolution = resolveCatalogDir({ cwd: root, dir: 'solutions', env: {} })
    expect(resolution.dir).toBe(path.join(root, 'solutions'))
    expect(resolution.shape).toBe('catalog')
  })
})
