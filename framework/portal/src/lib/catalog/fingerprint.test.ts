import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { catalogFingerprint } from './fingerprint'

/**
 * The fingerprint's whole job is to answer "may I reuse the catalog I already
 * parsed?", so every test here is one way the answer must be no. A false "yes"
 * is the expensive failure — it serves a catalog that no longer matches disk —
 * which is why the cases below are all mutations that leave *something* about
 * the tree looking unchanged.
 */

let dir: string

const write = async (rel: string, body: string) => {
  const file = path.join(dir, rel)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, body)
  return file
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'fingerprint-'))
  await write('acme/index.md', '---\nname: acme\n---\n')
  await write('acme/product/shop/index.md', '---\nname: shop\n---\n')
  await write('acme/product/shop/protocol/orders/transport.yaml', 'kind: kafka\n')
  await mkdir(path.join(dir, 'acme/_scratch'), { recursive: true })
  await mkdir(path.join(dir, 'acme/.cache'), { recursive: true })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('catalogFingerprint', () => {
  it('is stable while nothing changes', () => {
    expect(catalogFingerprint(dir)).toBe(catalogFingerprint(dir))
  })

  it('moves when a file is edited', async () => {
    const before = catalogFingerprint(dir)
    await write('acme/product/shop/index.md', '---\nname: shop\ntitle: Shop\n---\n')
    expect(catalogFingerprint(dir)).not.toBe(before)
  })

  it('moves when a file is deleted', async () => {
    // The mtime of everything left behind is untouched: only the count moves.
    const before = catalogFingerprint(dir)
    await rm(path.join(dir, 'acme/product/shop/protocol/orders/transport.yaml'))
    expect(catalogFingerprint(dir)).not.toBe(before)
  })

  it('moves when a directory is renamed', async () => {
    // Neither the file mtimes nor the entry count change here — only the mtime
    // of the parent directory does, which is why directories are stat'ed too.
    const before = catalogFingerprint(dir)
    await rename(path.join(dir, 'acme/product/shop'), path.join(dir, 'acme/product/store'))
    expect(catalogFingerprint(dir)).not.toBe(before)
  })

  it('moves when a solution root appears', async () => {
    const before = catalogFingerprint(dir)
    await write('other/index.md', '---\nname: other\n---\n')
    expect(catalogFingerprint(dir)).not.toBe(before)
  })

  it('ignores directories the loader never descends into', async () => {
    // The dot/underscore directories themselves already exist, so writing into
    // them leaves every mtime the walk actually looks at alone.
    const before = catalogFingerprint(dir)
    await write('acme/_scratch/notes.md', 'not part of the catalog\n')
    await write('acme/.cache/blob.json', '{}\n')
    expect(catalogFingerprint(dir)).toBe(before)
  })

  it('survives a catalog directory that does not exist', () => {
    expect(catalogFingerprint(path.join(dir, 'nope'))).toBe('0:0')
  })
})
