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
  component: { 'component-type': 'service', lifecycle: 'released' },
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
  // A capability adds nothing to the common contract; a journey adds exactly
  // its protagonist (kinds/capability.md, kinds/journey.md).
  capability: {},
  journey: { actor: '/actor/customer' },
  metric: { 'metric-type': 'ratio', target: '99.9%', window: '30d', direction: 'higher-is-better' },
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

  // The three kinds admitted with the grammar's eleventh bucket. capability and
  // journey are solution-level like actor and environment; metric is
  // owner-scoped like requirement, so one sits at the solution root and one
  // hangs off a nested component.
  await entity('acme/capability/fulfil-orders', base('fulfil-orders', 'capability'))
  await entity(
    'acme/capability/forecast-demand',
    // Nothing realizes it, and it reaches down to a component to say what does —
    // the direction that drifts.
    base('forecast-demand', 'capability', { relations: { uses: ['/product/shop/component/inventory'] } }),
  )
  await entity('acme/journey/first-purchase', base('first-purchase', 'journey'))
  await entity(
    'acme/metric/order-conversion',
    base('order-conversion', 'metric', { relations: { measures: ['/capability/fulfil-orders'] } }),
  )
  await entity(
    'acme/product/shop/component/checkout/metric/authorization-success',
    base('authorization-success', 'metric', {
      // `../..` pops the name and its bucket, landing on the component that owns
      // this metric — the shape an owner-scoped kind measures most often.
      relations: { measures: ['../..'] },
      'metric-type': 'ratio',
      target: '99.5%',
      window: '1h',
    }),
  )

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
        realizes: ['/capability/fulfil-orders'],
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

  // --- violations specific to the new kinds and edges --------------------------
  // A component is a built thing now, so it must say what state it is built in.
  await entity('acme/product/shop/component/legacy', {
    name: 'legacy',
    kind: 'component',
    version: 1,
    title: 'legacy',
    summary: 'A component written before lifecycle was required.',
    status: 'approved',
    'component-type': 'service',
  })
  // A journey is a path, not a thing anyone delivers.
  await entity(
    'acme/product/shop/component/telemetry',
    base('telemetry', 'component', { relations: { realizes: ['/journey/first-purchase'] } }),
  )
  // Only the built kinds may claim to realize; a datamodel ships nothing.
  await entity(
    'acme/datamodel/receipt',
    base('receipt', 'datamodel', { relations: { realizes: ['/capability/fulfil-orders'] } }),
  )
  // Measuring an actor is measuring a person, not the system.
  await entity(
    'acme/metric/staff-happiness',
    base('staff-happiness', 'metric', { relations: { measures: ['/actor/customer'] } }),
  )
  // A metric that names nothing it measures.
  await entity('acme/metric/floating', base('floating', 'metric'))
  // Literals that do not match the grammar their metric-type selects.
  await entity(
    'acme/metric/bad-literals',
    base('bad-literals', 'metric', {
      relations: { measures: ['/capability/fulfil-orders'] },
      target: '99.9', // a ratio without its %
      window: 'monthly', // a cadence, not a rolling window
    }),
  )
  // Filed under a component that neither is nor contains the subject's owner.
  await entity(
    'acme/product/shop/component/returns/metric/stock-accuracy',
    base('stock-accuracy', 'metric', { relations: { measures: ['/product/shop/component/inventory'] } }),
  )
  // A protagonist that is not an actor.
  await entity('acme/journey/broken-path', base('broken-path', 'journey', { actor: '/product/shop' }))

  // --- document body ----------------------------------------------------------
  // The page renders `title` as the h1, so a `#` in the prose is a second one.
  await entity(
    'acme/product/shop/component/twice-titled',
    base('twice-titled', 'component'),
    '# Twice titled\n\nProse.\n',
  )
  // The other spelling of the same heading, which a `#`-only check would miss.
  await entity(
    'acme/product/shop/component/underlined',
    base('underlined', 'component'),
    'Underlined\n==========\n\nProse.\n',
  )
  // A `#` inside a fence is a path comment, not a heading — every spec example
  // is written that way, and flagging them would make the rule unusable.
  await entity(
    'acme/product/shop/component/fenced-hash',
    base('fenced-hash', 'component'),
    '## Layout\n\n```text\n# solutions/acme/product/shop\n```\n\nProse.\n',
  )

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

  it('flags a component that does not say what state it is built in', () => {
    const missing = catalog.diagnostics.filter((d) => d.srn === 'srn://acme/product/shop/component/legacy')
    expect(missing.map((d) => d.code)).toContain('E_FM_SCHEMA')
    expect(missing.find((d) => d.code === 'E_FM_SCHEMA')?.message).toContain('lifecycle')
  })

  it('flags a body that opens its own level-1 heading', () => {
    expect(codesFor('acme/product/shop/component/twice-titled')).toContain('E_STRUCT_BODY_H1')
  })

  it('flags a setext level-1 heading too — the spelling a "#" check would miss', () => {
    expect(codesFor('acme/product/shop/component/underlined')).toContain('E_STRUCT_BODY_H1')
  })

  it('leaves a "#" inside a fence alone — it is a path comment, not a heading', () => {
    expect(codesFor('acme/product/shop/component/fenced-hash')).not.toContain('E_STRUCT_BODY_H1')
  })

  it('says nothing about a body that starts its sections at level 2', () => {
    expect(codesFor('acme/product/shop/component/checkout')).not.toContain('E_STRUCT_BODY_H1')
  })

  it('is fail-soft — a broken catalog still yields a usable graph', () => {
    expect(catalog.diagnostics.some((d) => d.severity === 'error')).toBe(true)
    expect(catalog.entities.size).toBeGreaterThan(5)
  })
})

describe('loadCatalog — capability, journey and metric', () => {
  it('loads each of the three new kinds at the position its grammar allows', () => {
    expect(catalog.entities.get('srn://acme/capability/fulfil-orders')?.kind).toBe('capability')
    expect(catalog.entities.get('srn://acme/journey/first-purchase')?.kind).toBe('journey')
    expect(catalog.entities.get('srn://acme/metric/order-conversion')?.kind).toBe('metric')
    expect(catalog.entities.get('srn://acme/product/shop/component/checkout/metric/authorization-success')?.kind).toBe(
      'metric',
    )
  })

  it('scopes a metric to its owner, exactly as it scopes a requirement', () => {
    expect(catalog.entities.get('srn://acme/metric/order-conversion')?.parent).toBe('srn://acme')
    expect(
      catalog.entities.get('srn://acme/product/shop/component/checkout/metric/authorization-success')?.parent,
    ).toBe('srn://acme/product/shop/component/checkout')
  })

  it('derives realized-by and measured-by the same way it derives every other inverse', () => {
    // Nothing authors a back-edge: both of these come from the forward edge on
    // the other document, which is what keeps the two directions from drifting.
    // Compared as a set: inbound order follows catalog walk order, which is a
    // fact about the filesystem rather than about the graph.
    expect(catalog.inbound.get('srn://acme/capability/fulfil-orders')).toEqual(
      expect.arrayContaining([
        { edge: 'realizes', from: 'srn://acme/product/shop/component/checkout' },
        { edge: 'measures', from: 'srn://acme/metric/order-conversion' },
      ]),
    )
    const realizers = (catalog.inbound.get('srn://acme/capability/fulfil-orders') ?? []).filter(
      (edge) => edge.edge === 'realizes',
    )
    expect(realizers).toHaveLength(1)
    expect(catalog.inbound.get('srn://acme/product/shop/component/checkout')).toContainEqual({
      edge: 'measures',
      from: 'srn://acme/product/shop/component/checkout/metric/authorization-success',
    })
  })

  it('refuses "realizes" from a kind that ships nothing', () => {
    const codes = catalog.diagnostics.filter((d) => d.srn === 'srn://acme/datamodel/receipt').map((d) => d.code)
    expect(codes).toContain('E_FM_EDGE_SOURCE')
  })

  it('refuses "realizes" toward anything but a capability', () => {
    const codes = codesFor('acme/product/shop/component/telemetry')
    expect(codes).toContain('E_FM_EDGE_TARGET')
  })

  it('refuses "measures" toward a kind outside the measurable set', () => {
    const codes = catalog.diagnostics.filter((d) => d.srn === 'srn://acme/metric/staff-happiness').map((d) => d.code)
    expect(codes).toContain('E_FM_EDGE_TARGET')
  })

  it('warns about a capability nothing realizes, and only about that one', () => {
    const unrealized = catalog.diagnostics.filter((d) => d.code === 'W_CAP_UNREALIZED')
    expect(unrealized.map((d) => d.srn)).toEqual(['srn://acme/capability/forecast-demand'])
    expect(unrealized[0].severity).toBe('warning')
  })

  it('warns when a capability reaches down to a component to state its own realization', () => {
    const codes = catalog.diagnostics.filter((d) => d.srn === 'srn://acme/capability/forecast-demand')
    expect(codes.map((d) => d.code)).toContain('W_CAP_REALIZATION_EDGE')
    expect(codes.find((d) => d.code === 'W_CAP_REALIZATION_EDGE')?.severity).toBe('warning')
  })

  it('errors on a metric that names nothing it measures', () => {
    // The one required edge in the ontology: a number with no subject is a
    // figure, so this is an error where the capability warning is not.
    const orphan = catalog.diagnostics.filter((d) => d.code === 'E_MET_NO_SUBJECT')
    expect(orphan.map((d) => d.srn)).toEqual(['srn://acme/metric/floating'])
    expect(orphan[0].severity).toBe('error')
  })

  it('does not call a metric subject-less merely because its target kind is wrong', () => {
    // Two separate complaints about two separate mistakes: staff-happiness says
    // what it measures, it just may not measure that.
    const codes = catalog.diagnostics.filter((d) => d.srn === 'srn://acme/metric/staff-happiness').map((d) => d.code)
    expect(codes).not.toContain('E_MET_NO_SUBJECT')
  })

  it('reports a target and a window that miss their grammars, each under its own code', () => {
    const codes = catalog.diagnostics.filter((d) => d.srn === 'srn://acme/metric/bad-literals').map((d) => d.code)
    expect(codes).toContain('E_MET_TARGET')
    expect(codes).toContain('E_MET_WINDOW')
  })

  it('warns about a metric filed outside its subject’s ownership line', () => {
    const scope = catalog.diagnostics.filter((d) => d.code === 'W_MET_SUBJECT_SCOPE')
    expect(scope.map((d) => d.srn)).toEqual(['srn://acme/product/shop/component/returns/metric/stock-accuracy'])
    expect(scope[0].severity).toBe('warning')
  })

  it('lets a metric sit on its subject or anywhere above it', () => {
    // On the subject itself, and — for a capability, which nothing owns — at
    // any depth at all. Neither is a scope complaint.
    for (const srn of [
      'srn://acme/product/shop/component/checkout/metric/authorization-success',
      'srn://acme/metric/order-conversion',
    ]) {
      expect(catalog.diagnostics.filter((d) => d.srn === srn).map((d) => d.code)).not.toContain('W_MET_SUBJECT_SCOPE')
    }
  })

  it('resolves a journey’s protagonist and insists it is an actor', () => {
    expect(catalog.diagnostics.filter((d) => d.srn === 'srn://acme/journey/first-purchase')).toEqual([])
    const codes = catalog.diagnostics.filter((d) => d.srn === 'srn://acme/journey/broken-path').map((d) => d.code)
    expect(codes).toContain('E_JRN_ACTOR_KIND')
  })

  it('splits severity where the kind documents split it', () => {
    // Error when the entity is meaningless without the fix; warning when it is
    // a true statement about a system still being built, or a judgement call.
    const severity = (code: string) => catalog.diagnostics.find((d) => d.code === code)?.severity
    expect(severity('E_MET_NO_SUBJECT')).toBe('error')
    expect(severity('E_JRN_ACTOR_KIND')).toBe('error')
    expect(severity('W_CAP_UNREALIZED')).toBe('warning')
    expect(severity('W_MET_SUBJECT_SCOPE')).toBe('warning')
  })
})
