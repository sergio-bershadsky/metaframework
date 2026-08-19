import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from './load'
import type { Catalog } from './types'

/**
 * The fixture is written to a temp catalog so the tests stay hermetic — they
 * must not depend on whatever real solutions live in the repo.
 */

let catalogDir: string
let catalog: Catalog

/** Write `solutions/<relDir>/index.md` with the given frontmatter fields. */
async function entity(relDir: string, frontmatter: Record<string, unknown>, body = 'Prose.') {
  const dir = path.join(catalogDir, relDir)
  await mkdir(dir, { recursive: true })
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) =>
      typeof value === 'object' && value !== null
        ? `${key}:\n${JSON.stringify(value, null, 2)
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')}`
        : `${key}: ${JSON.stringify(value)}`,
    )
    .join('\n')
  await writeFile(path.join(dir, 'index.md'), `---\n${yaml}\n---\n\n${body}\n`)
  return dir
}

const base = (name: string, kind: string, extra: Record<string, unknown> = {}) => ({
  name,
  kind,
  version: 1,
  title: name,
  summary: `The ${name} ${kind}.`,
  status: 'approved',
  ...extra,
})

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/actor/customer', base('customer', 'actor'))
  await entity('acme/environment/production', base('production', 'environment'))
  await entity('acme/shop', base('shop', 'product'))
  await entity('acme/shop/datamodel/money', base('money', 'datamodel'))
  await entity('acme/shop/protocol/order-events', base('order-events', 'protocol'))
  await entity('acme/shop/checkout/requirement/idem-cap', base('idem-cap', 'requirement'))

  // A well-formed component exercising every legal edge type.
  await entity(
    'acme/shop/checkout',
    base('checkout', 'component', {
      relations: {
        uses: ['/environment/production', '../datamodel/money@1'],
        exposes: ['../protocol/order-events'],
        implements: ['requirement/idem-cap'],
      },
      tags: ['commerce'],
    }),
  )

  // Sibling artifacts and an asset subdirectory.
  await writeFile(
    path.join(catalogDir, 'acme/shop/protocol/order-events/transport.yaml'),
    'kind: kafka\nbindings:\n  topic: order-events\n',
  )
  await mkdir(path.join(catalogDir, 'acme/shop/protocol/order-events/workflows'), { recursive: true })
  await writeFile(
    path.join(catalogDir, 'acme/shop/protocol/order-events/workflows/place-order.yaml'),
    'title: Place order\nsteps: []\n',
  )

  // --- deliberate violations, one per diagnostic ------------------------------
  await entity('acme/shop/inventory', base('warehouse', 'component')) // name mismatch
  await entity('acme/shop/pricing', base('pricing', 'product')) // kind contradicts position
  await entity('acme/shop/actor/operator', base('operator', 'actor')) // actor below solution
  await entity(
    'acme/shop/fulfilment',
    base('fulfilment', 'component', {
      relations: {
        uses: ['../datamodel/nonexistent'], // dangling
        implements: ['/actor/customer'], // illegal target kind
      },
    }),
  )
  await entity(
    'acme/shop/returns',
    base('returns', 'component', { relations: { uses: ['../datamodel/money@7'] } }), // stale pin
  )
  // An entity nested inside a datamodel — datamodels are not containers.
  await entity('acme/shop/datamodel/money/nested', base('nested', 'datamodel'))

  catalog = await loadCatalog({ catalogDir })
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

const codesFor = (srnFragment: string) =>
  catalog.diagnostics.filter((d) => d.srn?.includes(srnFragment) || d.path.includes(srnFragment)).map((d) => d.code)

describe('loadCatalog — graph construction', () => {
  it('discovers one solution root', () => {
    expect(catalog.solutions).toEqual(['srn://acme'])
  })

  it('keys entities by canonical unversioned SRN', () => {
    expect(catalog.entities.has('srn://acme/shop/checkout')).toBe(true)
    expect(catalog.entities.has('srn://acme/shop/datamodel/money')).toBe(true)
    expect(catalog.entities.has('srn://acme/actor/customer')).toBe(true)
  })

  it('assigns kind from disk position', () => {
    expect(catalog.entities.get('srn://acme')?.kind).toBe('solution')
    expect(catalog.entities.get('srn://acme/shop')?.kind).toBe('product')
    expect(catalog.entities.get('srn://acme/shop/checkout')?.kind).toBe('component')
    expect(catalog.entities.get('srn://acme/shop/protocol/order-events')?.kind).toBe('protocol')
  })

  it('links owned entities to their owning container, not their kind bucket', () => {
    expect(catalog.entities.get('srn://acme/shop/datamodel/money')?.parent).toBe('srn://acme/shop')
    expect(catalog.entities.get('srn://acme/actor/customer')?.parent).toBe('srn://acme')
    expect(catalog.entities.get('srn://acme/shop/checkout')?.parent).toBe('srn://acme/shop')
  })

  it('collects children on containers', () => {
    expect(catalog.entities.get('srn://acme/shop')?.children).toContain('srn://acme/shop/checkout')
    expect(catalog.entities.get('srn://acme/shop')?.children).toContain('srn://acme/shop/datamodel/money')
  })

  it('gives the solution root no parent', () => {
    expect(catalog.entities.get('srn://acme')?.parent).toBeNull()
  })
})

describe('loadCatalog — artifacts', () => {
  const protocol = () => catalog.entities.get('srn://acme/shop/protocol/order-events')

  it('reads sibling artifacts and parses YAML', () => {
    const transport = protocol()?.artifacts.find((a) => a.file === 'transport.yaml')
    expect(transport?.data).toEqual({ kind: 'kafka', bindings: { topic: 'order-events' } })
  })

  it('reads artifacts inside asset subdirectories under their relative path', () => {
    expect(protocol()?.artifacts.map((a) => a.file)).toContain('workflows/place-order.yaml')
  })

  it('never treats index.md as an artifact', () => {
    expect(protocol()?.artifacts.some((a) => a.file === 'index.md')).toBe(false)
  })
})

describe('loadCatalog — relations', () => {
  const checkout = () => catalog.entities.get('srn://acme/shop/checkout')

  it('resolves relative refs to absolute SRNs', () => {
    const targets = checkout()?.relations.map((r) => r.target)
    expect(targets).toContain('srn://acme/environment/production')
    expect(targets).toContain('srn://acme/shop/datamodel/money')
    expect(targets).toContain('srn://acme/shop/protocol/order-events')
    expect(targets).toContain('srn://acme/shop/checkout/requirement/idem-cap')
  })

  it('keeps the version pin separate from the target identity', () => {
    const money = checkout()?.relations.find((r) => r.target === 'srn://acme/shop/datamodel/money')
    expect(money?.version).toBe(1)
  })

  it('derives inverse edges instead of requiring them to be authored', () => {
    expect(catalog.inbound.get('srn://acme/shop/protocol/order-events')).toEqual([
      { edge: 'exposes', from: 'srn://acme/shop/checkout' },
    ])
  })

  it('produces no diagnostics for the well-formed component', () => {
    expect(codesFor('srn://acme/shop/checkout')).toHaveLength(0)
  })
})

describe('loadCatalog — diagnostics', () => {
  it('flags a frontmatter name that differs from the directory', () => {
    expect(codesFor('acme/shop/inventory')).toContain('E_FM_NAME_MISMATCH')
  })

  it('flags a kind contradicting disk position', () => {
    expect(codesFor('acme/shop/pricing')).toContain('E_FM_KIND_LOCATION')
  })

  it('flags an actor below solution level', () => {
    expect(codesFor('acme/shop/actor/operator')).toContain('E_STRUCT_KIND_PLACEMENT')
  })

  it('flags a dangling reference', () => {
    expect(codesFor('acme/shop/fulfilment')).toContain('E_SRN_DANGLING')
  })

  it('flags an edge pointing at an illegal target kind', () => {
    expect(codesFor('acme/shop/fulfilment')).toContain('E_FM_EDGE_TARGET')
  })

  it('warns about a version pin that no longer matches the current version', () => {
    const stale = catalog.diagnostics.find((d) => d.code === 'E_SRN_VERSION')
    expect(stale?.severity).toBe('warning')
    expect(stale?.srn).toBe('srn://acme/shop/returns')
  })

  it('flags an entity nested inside a non-container entity', () => {
    expect(catalog.diagnostics.map((d) => d.code)).toContain('E_STRUCT_NESTED_ENTITY')
  })

  it('is fail-soft — a broken catalog still yields a usable graph', () => {
    expect(catalog.diagnostics.some((d) => d.severity === 'error')).toBe(true)
    expect(catalog.entities.size).toBeGreaterThan(5)
  })
})
