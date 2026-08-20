import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_DIR_NAME, catalogShape, discoverCatalogDir, resolveCatalogDir } from './discover.mjs'

/**
 * Discovery is the first thing that runs and the only thing the user cannot
 * work around, so the cases below are the ways it could plausibly pick the
 * wrong directory: a same-named folder that means something else, an explicit
 * path that should never have been second-guessed, a catalog the user is
 * standing inside of.
 *
 * Fixtures are real directories under the OS temp dir rather than a mocked fs.
 * The rule being tested is "what would the loader see here", and the loader
 * asks the filesystem — a fake that answered differently would prove nothing.
 */

/** @type {string} */
let root

/** @type {(rel: string, body?: string) => Promise<void>} */
const write = async (rel, body = '') => {
  const file = path.join(root, rel)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, body)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'discover-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('catalogShape', () => {
  it('is a catalog when a subdirectory holds an index.md', async () => {
    await write('solutions/acme/index.md', '---\nname: acme\n---\n')
    expect(catalogShape(path.join(root, 'solutions'))).toBe('catalog')
  })

  it('is missing when the path is absent, or is a file', async () => {
    await write('solutions', 'not a directory')
    expect(catalogShape(path.join(root, 'nowhere'))).toBe('missing')
    expect(catalogShape(path.join(root, 'solutions'))).toBe('missing')
  })

  it('is empty when nothing inside is a solution', async () => {
    await mkdir(path.join(root, 'solutions'), { recursive: true })
    expect(catalogShape(path.join(root, 'solutions'))).toBe('empty')

    // A loose file is not a solution; only a directory with an index.md is.
    await write('solutions/README.md', '# soon')
    expect(catalogShape(path.join(root, 'solutions'))).toBe('empty')
  })

  it('does not count an index.md buried below the solution root', async () => {
    // The loader treats children of the catalog dir as solution roots, and a
    // solution root without its own index.md is not an entity.
    await write('solutions/acme/product/shop/index.md', '---\nname: shop\n---\n')
    expect(catalogShape(path.join(root, 'solutions'))).toBe('empty')
  })

  it('ignores dot and underscore directories, as the loader does', async () => {
    await write('solutions/.trash/index.md', '---\nname: trash\n---\n')
    await write('solutions/_drafts/index.md', '---\nname: drafts\n---\n')
    expect(catalogShape(path.join(root, 'solutions'))).toBe('empty')
  })
})

describe('discoverCatalogDir', () => {
  it('finds the catalog from a directory deep inside the repo', async () => {
    await write('repo/solutions/acme/index.md', '---\nname: acme\n---\n')
    await mkdir(path.join(root, 'repo/services/api/src'), { recursive: true })

    const found = discoverCatalogDir(path.join(root, 'repo/services/api/src'))
    expect(found.dir).toBe(path.join(root, 'repo/solutions'))
    expect(found.shape).toBe('catalog')
  })

  it('finds it when the user is standing inside the catalog itself', async () => {
    await write('repo/solutions/acme/index.md', '---\nname: acme\n---\n')

    const found = discoverCatalogDir(path.join(root, 'repo/solutions/acme'))
    expect(found.dir).toBe(path.join(root, 'repo/solutions'))
  })

  it('walks past a solutions directory that holds no solution', async () => {
    // The near case that motivates shape-checking: an unrelated `solutions/`
    // nearer than the real one. Stopping at it would serve an empty portal.
    await mkdir(path.join(root, 'repo/exercises/solutions'), { recursive: true })
    await write('repo/solutions/acme/index.md', '---\nname: acme\n---\n')

    const found = discoverCatalogDir(path.join(root, 'repo/exercises'))
    expect(found.dir).toBe(path.join(root, 'repo/solutions'))
    expect(found.skipped).toEqual([path.join(root, 'repo/exercises/solutions')])
  })

  it('returns the nearest empty candidate when there is nothing better', async () => {
    await mkdir(path.join(root, 'repo/solutions'), { recursive: true })

    const found = discoverCatalogDir(path.join(root, 'repo'))
    expect(found.dir).toBe(path.join(root, 'repo/solutions'))
    expect(found.shape).toBe('empty')
    // Reported as the answer, not also as something walked past.
    expect(found.skipped).toEqual([])
  })

  it('reports every path it tried, nearest first, up to the filesystem root', async () => {
    const start = path.join(root, 'a/b/c')
    await mkdir(start, { recursive: true })

    const found = discoverCatalogDir(start)
    expect(found.dir).toBeNull()
    expect(found.shape).toBe('missing')

    expect(found.searched.slice(0, 3)).toEqual([
      path.join(root, 'a/b/c', CATALOG_DIR_NAME),
      path.join(root, 'a/b', CATALOG_DIR_NAME),
      path.join(root, 'a', CATALOG_DIR_NAME),
    ])
    expect(found.searched.at(-1)).toBe(path.join(path.parse(root).root, CATALOG_DIR_NAME))
    // Every entry is one directory up from the previous one — the list is the
    // walk, so a reader can check it against their own tree.
    for (let i = 1; i < found.searched.length; i += 1) {
      const previous = path.dirname(path.dirname(found.searched[i - 1]))
      expect(path.dirname(found.searched[i])).toBe(previous)
    }
  })

  it('records the successful candidate in `searched` too', async () => {
    await write('repo/solutions/acme/index.md', '---\nname: acme\n---\n')

    const found = discoverCatalogDir(path.join(root, 'repo'))
    expect(found.searched).toEqual([path.join(root, 'repo/solutions')])
  })
})

describe('resolveCatalogDir', () => {
  it('prefers --dir over CATALOG_DIR over discovery', async () => {
    await write('flag/acme/index.md', '---\nname: acme\n---\n')
    await write('env/acme/index.md', '---\nname: acme\n---\n')
    await write('repo/solutions/acme/index.md', '---\nname: acme\n---\n')

    const cwd = path.join(root, 'repo')
    const env = { CATALOG_DIR: path.join(root, 'env') }

    expect(resolveCatalogDir({ cwd, dir: path.join(root, 'flag'), env })).toMatchObject({
      source: 'flag',
      dir: path.join(root, 'flag'),
    })
    expect(resolveCatalogDir({ cwd, env })).toMatchObject({ source: 'env', dir: path.join(root, 'env') })
    expect(resolveCatalogDir({ cwd, env: {} })).toMatchObject({
      source: 'discovery',
      dir: path.join(root, 'repo/solutions'),
    })
  })

  it('does not walk up from an explicit directory', async () => {
    await write('repo/solutions/acme/index.md', '---\nname: acme\n---\n')
    await mkdir(path.join(root, 'repo/elsewhere'), { recursive: true })

    // `solutions/` sits one level above the named directory. Walking would find
    // it and serve something the user did not ask for.
    const resolved = resolveCatalogDir({ cwd: root, dir: path.join(root, 'repo/elsewhere'), env: {} })
    expect(resolved.dir).toBe(path.join(root, 'repo/elsewhere'))
    expect(resolved.shape).toBe('empty')
    expect(resolved.searched).toEqual([path.join(root, 'repo/elsewhere')])
  })

  it('resolves a relative --dir against the working directory', async () => {
    await write('repo/catalog/acme/index.md', '---\nname: acme\n---\n')

    const resolved = resolveCatalogDir({ cwd: path.join(root, 'repo'), dir: 'catalog', env: {} })
    expect(resolved).toMatchObject({ dir: path.join(root, 'repo/catalog'), shape: 'catalog' })
  })

  it('reports a named directory that is not there, rather than looking elsewhere', async () => {
    await write('repo/solutions/acme/index.md', '---\nname: acme\n---\n')

    const resolved = resolveCatalogDir({ cwd: path.join(root, 'repo'), dir: 'typo', env: {} })
    expect(resolved).toMatchObject({ source: 'flag', dir: path.join(root, 'repo/typo'), shape: 'missing' })
  })
})
