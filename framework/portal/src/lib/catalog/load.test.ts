import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from './load'
import type { Catalog } from './types'

/**
 * The fixture is written to a temp catalog so the tests stay hermetic — they
 * must not depend on whatever real solutions live in the repo.
 *
 * Every directory below the solution is a kind bucket holding entity
 * directories, so the paths here read `product/shop/component/checkout/...`.
 * That is not decoration: the loader derives an entity's kind from its bucket,
 * and placement rules are enforced by the SRN grammar as the path is parsed.
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

/** Required kind-specific fields, per framework/spec/kinds/*.md. */
const KIND_DEFAULTS: Record<string, Record<string, unknown>> = {
  solution: { vision: 'Sell things reliably.' },
  product: { lifecycle: 'active' },
  component: { 'component-type': 'service' },
  datamodel: { usage: 'both' },
  protocol: {
    style: 'point-to-point',
    participants: [
      { alias: 'checkout', ref: '/product/shop/component/checkout' },
      { alias: 'customer', ref: '/actor/customer' },
    ],
  },
  actor: { 'actor-type': 'human', goals: ['Buy things.'] },
  environment: { 'environment-type': 'production' },
  adr: { 'decision-status': 'proposed', date: '2026-01-01' },
  requirement: { 'requirement-type': 'functional', priority: 'must' },
}

const base = (name: string, kind: string, extra: Record<string, unknown> = {}) => ({
  name,
  kind,
  version: 1,
  title: name,
  summary: `The ${name} ${kind}.`,
  status: 'approved',
  ...(KIND_DEFAULTS[kind] ?? {}),
  ...extra,
})

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/actor/customer', base('customer', 'actor'))
  await entity('acme/environment/production', base('production', 'environment'))
  await entity('acme/product/shop', base('shop', 'product'))
  await entity('acme/product/shop/datamodel/money', base('money', 'datamodel'))
  await entity('acme/product/shop/protocol/order-events', base('order-events', 'protocol'))
  await entity(
    'acme/product/shop/component/checkout/requirement/idem-cap',
    base('idem-cap', 'requirement'),
  )
  await entity('acme/product/shop/component/checkout/datamodel/cart', base('cart', 'datamodel'))
  await entity('acme/product/shop/component/checkout/component/payment', base('payment', 'component'))
  await entity('acme/product/shop/component/inventory', base('warehouse', 'component')) // name mismatch

  // A well-formed component exercising every legal edge type, and both reference
  // styles: solution-absolute, and relative arithmetic where `../..` pops a name
  // and its bucket to reach the owning product.
  await entity(
    'acme/product/shop/component/checkout',
    base('checkout', 'component', {
      relations: {
        uses: ['/environment/production', '../../datamodel/money@1'],
        exposes: ['../../protocol/order-events', 'datamodel/cart@1'],
        'depends-on': ['../inventory'],
        implements: ['requirement/idem-cap'],
      },
      tags: ['commerce'],
    }),
  )

  // Sibling artifacts and an asset subdirectory.
  await writeFile(
    path.join(catalogDir, 'acme/product/shop/protocol/order-events/transport.yaml'),
    'kind: kafka\nbindings:\n  topic: order-events\n',
  )
  await mkdir(path.join(catalogDir, 'acme/product/shop/protocol/order-events/workflows'), { recursive: true })
  await writeFile(
    path.join(catalogDir, 'acme/product/shop/protocol/order-events/workflows/place-order.yaml'),
    'title: Place order\nsteps: []\n',
  )

  // --- deliberate violations, one per diagnostic ------------------------------
  await entity('acme/product/shop/component/pricing', base('pricing', 'component', { kind: 'product' }))
  await entity('acme/product/shop/actor/operator', base('operator', 'actor')) // actor below solution
  await entity('acme/component/rogue', base('rogue', 'component')) // component outside a product
  await entity(
    'acme/product/shop/component/fulfilment',
    base('fulfilment', 'component', {
      relations: {
        uses: ['../../datamodel/nonexistent'], // dangling
        implements: ['/actor/customer'], // illegal target kind
      },
    }),
  )
  await entity(
    'acme/product/shop/component/returns',
    base('returns', 'component', { relations: { uses: ['../../datamodel/money@7'] } }), // stale pin
  )
  // An entity directory sitting straight inside a datamodel: it is both nested in
  // a non-container and, being unbucketed, no longer a parseable SRN.
  await entity('acme/product/shop/datamodel/money/nested', base('nested', 'datamodel'))

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
    expect(catalog.entities.has('srn://acme/product/shop/component/checkout')).toBe(true)
    expect(catalog.entities.has('srn://acme/product/shop/datamodel/money')).toBe(true)
    expect(catalog.entities.has('srn://acme/actor/customer')).toBe(true)
  })

  it('never turns a kind bucket into an entity — buckets hold entities, they are not addressable', () => {
    expect(catalog.entities.has('srn://acme/product')).toBe(false)
    expect(catalog.entities.has('srn://acme/product/shop/component')).toBe(false)
    expect([...catalog.entities.keys()].every((srn) => srn.split('/').length % 2 === 1)).toBe(true)
  })

  it('assigns kind from the bucket the entity sits in', () => {
    expect(catalog.entities.get('srn://acme')?.kind).toBe('solution')
    expect(catalog.entities.get('srn://acme/product/shop')?.kind).toBe('product')
    expect(catalog.entities.get('srn://acme/product/shop/component/checkout')?.kind).toBe('component')
    expect(catalog.entities.get('srn://acme/product/shop/component/checkout/component/payment')?.kind).toBe(
      'component',
    )
    expect(catalog.entities.get('srn://acme/product/shop/protocol/order-events')?.kind).toBe('protocol')
    expect(catalog.entities.get('srn://acme/actor/customer')?.kind).toBe('actor')
  })

  it('links owned entities to their owning container, not their kind bucket', () => {
    expect(catalog.entities.get('srn://acme/product/shop/datamodel/money')?.parent).toBe('srn://acme/product/shop')
    expect(catalog.entities.get('srn://acme/actor/customer')?.parent).toBe('srn://acme')
    expect(catalog.entities.get('srn://acme/product/shop/component/checkout')?.parent).toBe('srn://acme/product/shop')
    expect(catalog.entities.get('srn://acme/product/shop/component/checkout/datamodel/cart')?.parent).toBe(
      'srn://acme/product/shop/component/checkout',
    )
    expect(catalog.entities.get('srn://acme/product/shop/component/checkout/component/payment')?.parent).toBe(
      'srn://acme/product/shop/component/checkout',
    )
  })

  it('collects children on containers', () => {
    const shop = catalog.entities.get('srn://acme/product/shop')?.children ?? []
    expect(shop).toContain('srn://acme/product/shop/component/checkout')
    expect(shop).toContain('srn://acme/product/shop/datamodel/money')
    expect(catalog.entities.get('srn://acme')?.children).toContain('srn://acme/product/shop')
  })

  it('gives the solution root no parent', () => {
    expect(catalog.entities.get('srn://acme')?.parent).toBeNull()
  })
})

describe('loadCatalog — artifacts', () => {
  const protocol = () => catalog.entities.get('srn://acme/product/shop/protocol/order-events')

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
  const checkout = () => catalog.entities.get('srn://acme/product/shop/component/checkout')

  it('resolves solution-absolute and relative refs alike to absolute SRNs', () => {
    const targets = checkout()?.relations.map((r) => r.target)
    expect(targets).toContain('srn://acme/environment/production')
    expect(targets).toContain('srn://acme/product/shop/datamodel/money')
    expect(targets).toContain('srn://acme/product/shop/protocol/order-events')
    expect(targets).toContain('srn://acme/product/shop/component/checkout/datamodel/cart')
    expect(targets).toContain('srn://acme/product/shop/component/checkout/requirement/idem-cap')
  })

  it('pops one segment per ".." — "../inventory" is a sibling inside the same bucket', () => {
    const sibling = checkout()?.relations.find((r) => r.ref === '../inventory')
    expect(sibling?.target).toBe('srn://acme/product/shop/component/inventory')
  })

  it('keeps the version pin separate from the target identity', () => {
    const money = checkout()?.relations.find((r) => r.target === 'srn://acme/product/shop/datamodel/money')
    expect(money?.version).toBe(1)
  })

  it('derives inverse edges instead of requiring them to be authored', () => {
    expect(catalog.inbound.get('srn://acme/product/shop/protocol/order-events')).toEqual([
      { edge: 'exposes', from: 'srn://acme/product/shop/component/checkout' },
    ])
  })

  it('produces no diagnostics for the well-formed component or anything it owns', () => {
    expect(codesFor('srn://acme/product/shop/component/checkout')).toHaveLength(0)
  })
})

describe('loadCatalog — diagnostics', () => {
  it('flags a frontmatter name that differs from the directory', () => {
    expect(codesFor('acme/product/shop/component/inventory')).toContain('E_FM_NAME_MISMATCH')
  })

  it('flags a kind contradicting the bucket it sits in', () => {
    expect(codesFor('acme/product/shop/component/pricing')).toContain('E_FM_KIND_LOCATION')
  })

  it('flags an actor below solution level as a grammar violation, not a loader rule', () => {
    expect(codesFor('acme/product/shop/actor/operator')).toContain('E_SRN_PLACEMENT')
  })

  it('flags a component outside a product', () => {
    expect(codesFor('acme/component/rogue')).toContain('E_SRN_PLACEMENT')
  })

  it('no longer emits the loader-side placement code — placement is enforced while parsing', () => {
    expect(catalog.diagnostics.map((d) => d.code)).not.toContain('E_STRUCT_KIND_PLACEMENT')
  })

  it('flags a dangling reference', () => {
    expect(codesFor('acme/product/shop/component/fulfilment')).toContain('E_SRN_DANGLING')
  })

  it('flags an edge pointing at an illegal target kind', () => {
    expect(codesFor('acme/product/shop/component/fulfilment')).toContain('E_FM_EDGE_TARGET')
  })

  it('warns about a version pin that no longer matches the current version', () => {
    const stale = catalog.diagnostics.find((d) => d.code === 'E_SRN_VERSION')
    expect(stale?.severity).toBe('warning')
    expect(stale?.srn).toBe('srn://acme/product/shop/component/returns')
  })

  it('flags an entity nested inside a non-container entity', () => {
    expect(codesFor('acme/product/shop/datamodel/money/nested')).toContain('E_STRUCT_NESTED_ENTITY')
  })

  it('rejects the unbucketed directory that nesting produced, so it never enters the graph', () => {
    expect(codesFor('acme/product/shop/datamodel/money/nested')).toContain('E_SRN_SYNTAX')
    expect(catalog.entities.has('srn://acme/product/shop/datamodel/money/nested')).toBe(false)
  })

  it('is fail-soft — a broken catalog still yields a usable graph', () => {
    expect(catalog.diagnostics.some((d) => d.severity === 'error')).toBe(true)
    expect(catalog.entities.size).toBeGreaterThan(5)
  })
})
