import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import { type SchemaRegistry, buildSchemaRegistry } from '../schema/registry'
import { datamodelDiagnostics, payloadReferences } from './datamodel'

/**
 * One hermetic temp catalog, and it has to be one: every rule here is a join.
 * `E_DM_EXAMPLE_INVALID` needs the compiled validator, which needs the registry,
 * which needs the catalog; the other two need a *protocol* naming a datamodel,
 * which is a second entity in a second bucket.
 *
 * The fixture is built so that each code has a positive case and a negative one
 * standing right beside it — an abstract base that is only ever `allOf`-ed, a
 * concrete model carried on a wire while declaring `usage: exchange`, an example
 * that validates. The negatives are the half that matters: acme and brass are
 * exemplars, so a rule that cannot stay quiet on correct authoring is a rule
 * that will be switched off.
 */

let catalogDir: string
let catalog: Catalog
let registry: SchemaRegistry
let diagnostics: Diagnostic[]

const HOST = 'https://schemas.metaframework.dev'

async function entity(relDir: string, frontmatter: Record<string, unknown>) {
  const target = path.join(catalogDir, relDir)
  await mkdir(target, { recursive: true })
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
  await writeFile(path.join(target, 'index.md'), `---\n${yaml}\n---\n\nProse.\n`)
}

async function artifact(relDir: string, file: string, contents: unknown) {
  await mkdir(path.join(catalogDir, relDir, path.dirname(file)), { recursive: true })
  const raw = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
  await writeFile(path.join(catalogDir, relDir, file), raw)
}

const base = (name: string, kind: string, extra: Record<string, unknown> = {}) => ({
  name,
  kind,
  version: 1,
  title: name,
  summary: `The ${name} ${kind}.`,
  status: 'approved',
  ...({
    solution: { vision: 'Sell things reliably.' },
    product: { lifecycle: 'active' },
    component: { 'component-type': 'service', lifecycle: 'released' },
    datamodel: { usage: 'both' },
    actor: { 'actor-type': 'human', goals: ['Buy a thing.'] },
    protocol: { style: 'request-response' },
  }[kind] ?? {}),
  ...extra,
})

const schema = (srnPath: string, extra: Record<string, unknown> = {}) => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${HOST}/${srnPath}`,
  'x-srn': `srn://${srnPath}`,
  title: srnPath.slice(srnPath.lastIndexOf('/') + 1),
  type: 'object',
  ...extra,
})

/** A datamodel entity and its schema, in one call. */
async function model(relDir: string, name: string, frontmatter: Record<string, unknown>, body: Record<string, unknown> = {}) {
  await entity(`${relDir}/datamodel/${name}`, base(name, 'datamodel', frontmatter))
  await artifact(`${relDir}/datamodel/${name}`, 'schema.json', schema(`${relDir}/datamodel/${name}`, body))
}

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-datamodel-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/product/shop', base('shop', 'product'))
  await entity('acme/product/shop/component/checkout', base('checkout', 'component'))
  await entity('acme/product/billing', base('billing', 'product'))
  await entity('acme/product/billing/component/ledger', base('ledger', 'component'))

  /* --- identity and examples ------------------------------------------- */

  await model('acme', 'money', { usage: 'both' }, {
    properties: { amount: { type: 'string' }, currency: { type: 'string', minLength: 3, maxLength: 3 } },
    required: ['amount', 'currency'],
  })
  // The example the build keeps honest, and the two that break it.
  await artifact('acme/datamodel/money', 'examples/canonical.json', { amount: '49.90', currency: 'EUR' })
  await artifact('acme/datamodel/money', 'examples/no-currency.json', { amount: '49.90' })
  await artifact('acme/datamodel/money', 'examples/truncated.json', '{ "amount": "49.90",')

  /* --- abstract bases --------------------------------------------------- */

  // Only ever `allOf`-ed and pinned from a container's `uses` — the intended use,
  // twice over, and neither is a finding.
  await model('acme', 'base-record', { usage: 'both', abstract: true }, {
    properties: { id: { type: 'string' } },
    required: ['id'],
  })
  // Abstract and carrying an instance of itself.
  await model('acme', 'auditable', { usage: 'both', abstract: true }, { properties: { 'changed-by': { type: 'string' } } })
  await artifact('acme/datamodel/auditable', 'examples/minimal.json', { 'changed-by': 'team-shop' })
  // Abstract and named on a wire.
  await model('acme', 'access-grant', { usage: 'exchange', abstract: true }, { properties: { scope: { type: 'string' } } })

  /* --- concrete models -------------------------------------------------- */

  // Derives from base-record. `allOf` toward an abstract base is never flagged.
  await model('acme/product/shop', 'order', { usage: 'exchange' }, {
    allOf: [{ $ref: `${HOST}/acme/datamodel/base-record` }],
    properties: { total: { $ref: `${HOST}/acme/datamodel/money` } },
  })
  // Declared storage-only and then put on a wire — the mismatch, in the shape
  // the kind document describes.
  await model('acme/product/shop/component/checkout', 'cart', { usage: 'storage' }, {
    properties: { lines: { type: 'integer' } },
  })
  // A config contract carried as a payload: "rarely the protocol's fault".
  await model('acme/product/billing/component/ledger', 'config', { usage: 'config' }, {
    properties: { LOG_LEVEL: { enum: ['debug', 'info'] } },
  })
  // Declared storage and named nowhere — the negative case for the same rule.
  await model('acme/product/shop', 'audience-segment', { usage: 'storage' }, { properties: { size: { type: 'integer' } } })

  /* --- the container that exposes a base -------------------------------- */

  await entity(
    'acme/product/identity',
    base('identity', 'product', {
      relations: {
        // `exposes` toward an abstract model is the finding; `uses` toward one is
        // the pinned review target datamodel.md recommends, and is not.
        exposes: ['/datamodel/access-grant'],
        uses: ['/datamodel/base-record@1'],
      },
    }),
  )

  /* --- protocols: the three payload surfaces ---------------------------- */

  await entity(
    'acme/protocol/settlement',
    base('settlement', 'protocol', {
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'ledger', ref: '/product/billing/component/ledger' },
      ],
    }),
  )
  // The workflow mini-spec: `payload` is the SRN, `message` is the arrow label.
  await artifact(
    'acme/protocol/settlement',
    'workflows/settle-order.yaml',
    [
      'name: settle-order',
      'title: Settle an order',
      'steps:',
      '  - message: order-paid',
      '    from: checkout',
      '    to: ledger',
      '    payload: /product/shop/datamodel/order@1',
      '  - message: cart-snapshot',
      '    from: checkout',
      '    to: ledger',
      '    payload: /product/shop/component/checkout/datamodel/cart@1',
      '',
    ].join('\n'),
  )
  // The transport mini-spec: a surface list entry's `request` / `response`.
  await artifact(
    'acme/protocol/settlement',
    'transport.yaml',
    [
      'kind: http',
      'summary: JSON over HTTPS.',
      'http:',
      '  base-path: /api/v1',
      '  operations:',
      '    - name: post-settlement',
      '      method: POST',
      '      path: /',
      '      request: /product/billing/component/ledger/datamodel/config@1',
      '      response: /datamodel/access-grant@1',
      '',
    ].join('\n'),
  )

  await entity(
    'acme/product/shop/protocol/order-events',
    base('order-events', 'protocol', {
      style: 'bus',
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'ledger', ref: '/product/billing/component/ledger' },
      ],
    }),
  )
  // The AsyncAPI dialect: a Message Object's `x-srn-payload`, and a `payload`
  // that is a Schema Object rather than a reference.
  await artifact(
    'acme/product/shop/protocol/order-events',
    'transport.yaml',
    [
      'asyncapi: 3.1.0',
      'x-srn: srn://acme/product/shop/protocol/order-events',
      'info:',
      '  title: Order events',
      '  version: unversioned',
      'channels:',
      '  order-placed:',
      '    address: acme.shop.order-placed.v1',
      '    messages:',
      '      order-placed:',
      '        x-srn-payload: /product/shop/datamodel/order@1',
      '        payload:',
      '          type: object',
      '',
    ].join('\n'),
  )

  catalog = await loadCatalog({ catalogDir })
  registry = buildSchemaRegistry(catalog)
  diagnostics = datamodelDiagnostics(catalog, registry)
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

const found = (code: string) => diagnostics.filter((diagnostic) => diagnostic.code === code)
const on = (code: string) => found(code).map((diagnostic) => diagnostic.srn)

describe('the fixture itself', () => {
  it('loads and registers with no errors of its own', () => {
    expect(catalog.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
    expect(registry.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  })
})

/* ------------------------------------------------------------- payloads */

describe('payloadReferences — every surface a protocol names a payload on', () => {
  it('reads the workflow `payload` key, the transport surface list, and x-srn-payload', () => {
    expect(payloadReferences(catalog).map((reference) => `${reference.datamodel} @ ${reference.pointer}`).sort()).toEqual([
      'srn://acme/datamodel/access-grant @ /http/operations/0/response',
      'srn://acme/product/billing/component/ledger/datamodel/config @ /http/operations/0/request',
      'srn://acme/product/shop/component/checkout/datamodel/cart @ /steps/1/payload',
      'srn://acme/product/shop/datamodel/order @ /channels/order-placed/messages/order-placed/x-srn-payload',
      'srn://acme/product/shop/datamodel/order @ /steps/0/payload',
    ])
  })

  it('does not read a workflow step’s `message` — that is the arrow label, not the SRN', () => {
    // Both steps carry one; neither resolves to a datamodel, and neither is
    // scanned in a workflow to begin with.
    expect(payloadReferences(catalog).map((reference) => reference.ref)).not.toContain('order-paid')
  })

  it('keeps the file each reference came from, so the diagnostic can name it', () => {
    const cart = payloadReferences(catalog).find((reference) => reference.datamodel.endsWith('/cart'))
    expect(cart?.file).toBe('acme/protocol/settlement/workflows/settle-order.yaml')
    expect(cart?.protocol).toBe('srn://acme/protocol/settlement')
  })
})

/* ------------------------------------------------- E_DM_EXAMPLE_INVALID */

describe('E_DM_EXAMPLE_INVALID — an example is a validated instance', () => {
  it('fires on an instance that fails its own schema', () => {
    expect(found('E_DM_EXAMPLE_INVALID')).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        path: 'acme/datamodel/money/examples/no-currency.json',
        srn: 'srn://acme/datamodel/money',
        message: expect.stringContaining('currency'),
      }),
    )
  })

  it('fires on an example that is not JSON at all', () => {
    expect(found('E_DM_EXAMPLE_INVALID')).toContainEqual(
      expect.objectContaining({
        path: 'acme/datamodel/money/examples/truncated.json',
        message: expect.stringContaining('does not parse as JSON'),
      }),
    )
  })

  it('stays silent on the example that validates', () => {
    expect(found('E_DM_EXAMPLE_INVALID').map((diagnostic) => diagnostic.path)).not.toContain(
      'acme/datamodel/money/examples/canonical.json',
    )
  })

  it('reports one row per file, not one per ajv error', () => {
    expect(found('E_DM_EXAMPLE_INVALID')).toHaveLength(2)
  })
})

/* ---------------------------------------------------- W_DM_ABSTRACT_USE */

describe('W_DM_ABSTRACT_USE — a base nobody instantiates, instantiated', () => {
  it('fires on an abstract model carrying examples/', () => {
    expect(found('W_DM_ABSTRACT_USE')).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        srn: 'srn://acme/datamodel/auditable',
        path: 'acme/datamodel/auditable/index.md',
        message: expect.stringContaining('examples/minimal.json'),
      }),
    )
  })

  it('fires on an abstract model named as a message payload', () => {
    expect(found('W_DM_ABSTRACT_USE')).toContainEqual(
      expect.objectContaining({
        srn: 'srn://acme/datamodel/access-grant',
        message: expect.stringContaining('named as a message payload'),
      }),
    )
  })

  it('fires on an abstract model that is an "exposes" target', () => {
    expect(found('W_DM_ABSTRACT_USE')).toContainEqual(
      expect.objectContaining({
        srn: 'srn://acme/datamodel/access-grant',
        message: expect.stringContaining('"exposes" target of srn://acme/product/identity'),
      }),
    )
  })

  it('never fires on the intended use — an allOf $ref, or a pinned "uses" edge', () => {
    // base-record is `allOf`-ed by order and pinned by identity's `uses`. Both are
    // exactly what an abstract model is for.
    expect(on('W_DM_ABSTRACT_USE')).not.toContain('srn://acme/datamodel/base-record')
  })

  it('never fires on a concrete model, whatever names it', () => {
    expect(on('W_DM_ABSTRACT_USE')).not.toContain('srn://acme/product/shop/datamodel/order')
  })
})

/* -------------------------------------------------- W_DM_USAGE_MISMATCH */

describe('W_DM_USAGE_MISMATCH — the declared destination and the observed one', () => {
  it('fires on a usage: storage model carried as a payload', () => {
    expect(found('W_DM_USAGE_MISMATCH')).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        srn: 'srn://acme/product/shop/component/checkout/datamodel/cart',
        path: 'acme/product/shop/component/checkout/datamodel/cart/index.md',
        message: expect.stringContaining('a model that crosses a boundary is "exchange" or "both"'),
      }),
    )
  })

  it('fires on a usage: config contract carried as a payload, with the sharper reason', () => {
    expect(found('W_DM_USAGE_MISMATCH')).toContainEqual(
      expect.objectContaining({
        srn: 'srn://acme/product/billing/component/ledger/datamodel/config',
        message: expect.stringContaining('is not a wire payload'),
      }),
    )
  })

  it('stays silent on a usage: storage model nothing names', () => {
    // The rule is about the *disagreement*, not about storage.
    expect(on('W_DM_USAGE_MISMATCH')).not.toContain('srn://acme/product/shop/datamodel/audience-segment')
  })

  it('stays silent on usage: exchange and usage: both models on the same wire', () => {
    expect(on('W_DM_USAGE_MISMATCH')).not.toContain('srn://acme/product/shop/datamodel/order')
    expect(on('W_DM_USAGE_MISMATCH')).not.toContain('srn://acme/datamodel/money')
  })

  it('names every protocol that carries it, in one row', () => {
    expect(found('W_DM_USAGE_MISMATCH')).toHaveLength(2)
  })
})
