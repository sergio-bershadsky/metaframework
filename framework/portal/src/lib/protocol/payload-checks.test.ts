import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import { payloadDiagnostics } from './payload-checks'

/**
 * One hermetic temp catalog, for the reason `lib/datamodel/datamodel.test.ts`
 * builds one: both rules here are joins. `E_PROTO_PAYLOAD_KIND` needs a second
 * entity in a second bucket to be the wrong kind, and `W_PROTO_WF_CHANNEL_UNKNOWN`
 * needs a `transport.yaml` and a `workflows/*.yaml` under one protocol.
 *
 * Every protocol below is one of a **pair**: a `*-ok` that must stay silent and
 * a `*-bad` that must fire, differing only in the field under test. The silent
 * half is the half that matters — `solutions/` is a catalog of exemplars, so a
 * check that cannot stay quiet on correct authoring is a check that gets
 * switched off. `emitsNothingElse` closes the other side: the whole diagnostic
 * list is asserted, so a rule that fires on an unintended protocol fails here
 * rather than on the shipped catalog.
 */

let catalogDir: string
let catalog: Catalog
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

async function artifact(relDir: string, file: string, contents: string) {
  await mkdir(path.join(catalogDir, relDir, path.dirname(file)), { recursive: true })
  await writeFile(path.join(catalogDir, relDir, file), contents)
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
    datamodel: { usage: 'exchange' },
    actor: { 'actor-type': 'human', goals: ['Buy a thing.'] },
    protocol: { style: 'request-response' },
  }[kind] ?? {}),
  ...extra,
})

/** A datamodel entity and the `schema.json` that makes it one. */
async function model(relDir: string, name: string) {
  const dir = `${relDir}/datamodel/${name}`
  await entity(dir, base(name, 'datamodel'))
  await artifact(
    dir,
    'schema.json',
    JSON.stringify(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: `${HOST}/${dir}`,
        'x-srn': `srn://${dir}`,
        title: name,
        type: 'object',
        properties: { id: { type: 'string' } },
      },
      null,
      2,
    ),
  )
}

const PARTICIPANTS = [
  { alias: 'checkout', ref: '/product/shop/component/checkout' },
  { alias: 'ledger', ref: '/product/billing/component/ledger' },
]

/** A protocol entity with the two participants every workflow below addresses. */
async function protocol(relDir: string, name: string) {
  await entity(`${relDir}/protocol/${name}`, base(name, 'protocol', { participants: PARTICIPANTS }))
}

/** One `workflows/<stem>.yaml` holding the given step lines, already indented. */
async function workflow(protocolDir: string, stem: string, steps: string[]) {
  await artifact(
    protocolDir,
    `workflows/${stem}.yaml`,
    [`name: ${stem}`, `title: ${stem}`, 'steps:', ...steps, ''].join('\n'),
  )
}

const only = (code: string) => diagnostics.filter((diagnostic) => diagnostic.code === code)
const at = (file: string) => diagnostics.filter((diagnostic) => diagnostic.path.endsWith(file))

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-payload-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/product/shop', base('shop', 'product'))
  await entity('acme/product/shop/component/checkout', base('checkout', 'component'))
  await entity('acme/product/billing', base('billing', 'product'))
  await entity('acme/product/billing/component/ledger', base('ledger', 'component'))
  await entity('acme/actor/customer', base('customer', 'actor'))

  await model('acme/product/shop', 'order')
  await model('acme/product/billing', 'ledger-entry')

  /* --- the AsyncAPI dialect: `x-srn-payload`, and channels ---------------- */

  const asyncTransport = (channelId: string, address: string, payload: string) =>
    [
      'asyncapi: 3.1.0',
      'x-srn: srn://acme/protocol/settlement',
      'info:',
      '  title: Settlement',
      '  version: unversioned',
      'servers:',
      '  acme-settlement:',
      '    host: "{host}"',
      '    protocol: kafka',
      'channels:',
      `  ${channelId}:`,
      `    address: ${address}`,
      '    messages:',
      `      ${channelId}:`,
      `        x-srn-payload: ${payload}`,
      '',
    ].join('\n')

  // GREEN. The payload is a datamodel; one step names the channel by its
  // `address` and the other by its channelId — W9 admits both.
  await protocol('acme', 'settlement-ok')
  await artifact(
    'acme/protocol/settlement-ok',
    'transport.yaml',
    asyncTransport('order-paid', 'acme.settlement.order-paid.v1', '/product/shop/datamodel/order@1'),
  )
  await workflow('acme/protocol/settlement-ok', 'settle', [
    '  - message: order-paid',
    '    from: checkout',
    '    to: ledger',
    '    payload: /product/shop/datamodel/order@1',
    '    channel: acme.settlement.order-paid.v1',
    '  - message: entry-posted',
    '    from: ledger',
    '    to: checkout',
    '    kind: return',
    '    payload: /product/billing/datamodel/ledger-entry@1',
    '    channel: order-paid',
  ])

  // RED. `x-srn-payload` names an actor; the step's channel is a topic the
  // document does not declare.
  await protocol('acme', 'settlement-bad')
  await artifact(
    'acme/protocol/settlement-bad',
    'transport.yaml',
    asyncTransport('order-paid', 'acme.settlement.order-paid.v1', '/actor/customer'),
  )
  await workflow('acme/protocol/settlement-bad', 'settle', [
    '  - message: order-paid',
    '    from: checkout',
    '    to: ledger',
    '    payload: /product/shop/datamodel/order@1',
    '    channel: acme.settlement.order-shipped.v1',
  ])

  /* --- the mini-spec dialect: surface lists ------------------------------- */

  // GREEN. `request`/`response` are datamodels; the steps name an operation by
  // its `name` and by its `path`.
  await protocol('acme/product/shop', 'order-placement-ok')
  await artifact(
    'acme/product/shop/protocol/order-placement-ok',
    'transport.yaml',
    [
      'kind: http',
      'http:',
      '  base-path: /api/v1/orders',
      '  operations:',
      '    - name: create-order',
      '      method: POST',
      '      path: /',
      '      request: /product/shop/datamodel/order@1',
      '      response: /product/billing/datamodel/ledger-entry@1',
      '',
    ].join('\n'),
  )
  await workflow('acme/product/shop/protocol/order-placement-ok', 'place', [
    '  - message: create-order',
    '    from: checkout',
    '    to: ledger',
    '    payload: /product/shop/datamodel/order@1',
    '    channel: create-order',
    '  - message: order-created',
    '    from: ledger',
    '    to: checkout',
    '    kind: return',
    '    channel: /',
  ])

  // RED, four ways: `request` names a component, `response` names a legal
  // artifact of a datamodel, the workflow payload names a product, and the
  // channel matches no operation.
  await protocol('acme/product/shop', 'order-placement-bad')
  await artifact(
    'acme/product/shop/protocol/order-placement-bad',
    'transport.yaml',
    [
      'kind: http',
      'http:',
      '  base-path: /api/v1/orders',
      '  operations:',
      '    - name: create-order',
      '      method: POST',
      '      path: /',
      '      request: /product/shop/component/checkout',
      '      response: /product/shop/datamodel/order.schema@1',
      '',
    ].join('\n'),
  )
  await workflow('acme/product/shop/protocol/order-placement-bad', 'place', [
    '  - message: create-order',
    '    from: checkout',
    '    to: ledger',
    '    payload: /product/shop',
    '    channel: cancel-order',
  ])

  /* --- the two ways a payload reference belongs to somebody else ---------- */

  // `order.topology` is not a datamodel role at all: V5 is static and fails
  // first, as `E_SRN_ARTIFACT`. `/product/shop/datamodel/nowhere@1` resolves to
  // nothing, which is `E_SRN_DANGLING`. Neither is this module's class.
  await protocol('acme', 'elsewhere')
  await artifact(
    'acme/protocol/elsewhere',
    'transport.yaml',
    [
      'kind: http',
      'http:',
      '  base-path: /api',
      '  operations:',
      '    - name: get-order',
      '      method: GET',
      '      path: /orders',
      '      request: /product/shop/datamodel/order.topology@1',
      '      response: /product/shop/datamodel/nowhere@1',
      '',
    ].join('\n'),
  )
  await workflow('acme/protocol/elsewhere', 'fetch', [
    '  - message: get-order',
    '    from: checkout',
    '    to: ledger',
    '    payload: /product/shop/datamodel/order.topology@1',
    '    channel: get-order',
  ])

  /* --- the two shapes W9 skips ------------------------------------------- */

  // A mini-spec transport that links a `spec` instead of declaring a surface
  // list. The linked file is not parsed in v1, so there is nothing to match a
  // channel against and the absence of a check is not a warning.
  await protocol('acme', 'spec-linked')
  await artifact(
    'acme/protocol/spec-linked',
    'transport.yaml',
    ['kind: http', 'http:', '  base-path: /api/v1', 'spec:', '  format: openapi', '  file: openapi.yaml', ''].join('\n'),
  )
  await artifact('acme/protocol/spec-linked', 'openapi.yaml', 'openapi: 3.1.0\ninfo:\n  title: x\n  version: "1"\npaths: {}\n')
  await workflow('acme/protocol/spec-linked', 'call', [
    '  - message: create-order',
    '    from: checkout',
    '    to: ledger',
    '    channel: anything-at-all',
  ])

  // No `transport.yaml` at all — the first of W9's two named skips.
  await protocol('acme', 'no-transport')
  await workflow('acme/protocol/no-transport', 'call', [
    '  - message: create-order',
    '    from: checkout',
    '    to: ledger',
    '    channel: anything-at-all',
  ])

  // The third shape, which `kinds/protocol.md` does not name: a mini-spec
  // transport with neither a `spec` nor a surface list. `operations` is OPTIONAL
  // on five of the six wires, so this is legal authoring, and it has exactly as
  // much to check a channel against as the spec-linked case above — nothing. See
  // `channelNames` for why the governing clause is implemented rather than the
  // two-item enumeration.
  await protocol('acme', 'bare-binding')
  await artifact('acme/protocol/bare-binding', 'transport.yaml', ['kind: http', 'http:', '  base-path: /api/v1', ''].join('\n'))
  await workflow('acme/protocol/bare-binding', 'call', [
    '  - message: create-order',
    '    from: checkout',
    '    to: ledger',
    '    channel: anything-at-all',
  ])

  // The fourth: a transport that declares a `spec` *and* a surface list. That is
  // `E_PROTO_TRANSPORT_SPEC_CONFLICT` and somebody else's finding; for W9 the
  // document has still named its surface, so the list is what a channel is
  // matched against — "instead of" is what makes the spec-link case a skip.
  await protocol('acme', 'conflicted-bad')
  await artifact(
    'acme/protocol/conflicted-bad',
    'transport.yaml',
    [
      'kind: http',
      'spec:',
      '  format: openapi',
      '  file: openapi.yaml',
      'http:',
      '  base-path: /api/v1',
      '  operations:',
      '    - name: create-order',
      '      method: POST',
      '      path: /',
      '',
    ].join('\n'),
  )
  await artifact('acme/protocol/conflicted-bad', 'openapi.yaml', 'openapi: 3.1.0\ninfo:\n  title: x\n  version: "1"\npaths: {}\n')
  await workflow('acme/protocol/conflicted-bad', 'call', [
    '  - message: create-order',
    '    from: checkout',
    '    to: ledger',
    '    channel: create-order',
    '  - message: cancel-order',
    '    from: checkout',
    '    to: ledger',
    '    channel: cancel-order',
  ])

  // An `asyncapi:` version outside the row's band. `structure.md` rules that an
  // artifact declaring "one unknown for its role" is "read as the legacy
  // dialect" and "still checked against the legacy grammar", so this document is
  // judged as the mini-spec by BOTH readers — here and in `transport-checks.ts`.
  // It declares no mini-spec surface list, so W9 has nothing to check against
  // and is skipped. Read as AsyncAPI it would have a channel set of
  // {`orderPlaced`, `acme.shop.order-placed.v1`} and the step below would warn,
  // which is what makes this fixture a real discriminator between the two
  // readings rather than a restatement of the skip above.
  await protocol('acme', 'stale-asyncapi')
  await artifact(
    'acme/protocol/stale-asyncapi',
    'transport.yaml',
    [
      'asyncapi: 2.6.0',
      'channels:',
      '  orderPlaced:',
      '    address: acme.shop.order-placed.v1',
      '',
    ].join('\n'),
  )
  await workflow('acme/protocol/stale-asyncapi', 'call', [
    '  - message: create-order',
    '    from: checkout',
    '    to: ledger',
    '    channel: not-a-declared-channel',
  ])

  catalog = await loadCatalog({ catalogDir })
  diagnostics = payloadDiagnostics(catalog)
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

describe('the fixture catalog', () => {
  it('loads every protocol the rules are asserted over', () => {
    for (const name of [
      'srn://acme/protocol/settlement-ok',
      'srn://acme/protocol/settlement-bad',
      'srn://acme/product/shop/protocol/order-placement-ok',
      'srn://acme/product/shop/protocol/order-placement-bad',
      'srn://acme/protocol/elsewhere',
      'srn://acme/protocol/spec-linked',
      'srn://acme/protocol/no-transport',
      'srn://acme/protocol/bare-binding',
      'srn://acme/protocol/conflicted-bad',
      'srn://acme/protocol/stale-asyncapi',
    ]) {
      expect(catalog.entities.get(name)?.kind).toBe('protocol')
    }
  })
})

describe('E_PROTO_PAYLOAD_KIND — a payload names a datamodel', () => {
  it('is silent on the AsyncAPI protocol whose `x-srn-payload` is a datamodel', () => {
    expect(at('settlement-ok/transport.yaml')).toEqual([])
    expect(at('settlement-ok/workflows/settle.yaml')).toEqual([])
  })

  it('fires on an `x-srn-payload` that names an actor', () => {
    const found = at('settlement-bad/transport.yaml')
    expect(found).toHaveLength(1)
    expect(found[0].code).toBe('E_PROTO_PAYLOAD_KIND')
    expect(found[0].severity).toBe('error')
    expect(found[0].message).toContain('/channels/order-paid/messages/order-paid/x-srn-payload')
    expect(found[0].message).toContain('srn://acme/actor/customer')
    expect(found[0].message).toContain('whose kind is "actor"')
    expect(found[0].srn).toBe('srn://acme/protocol/settlement-bad')
  })

  it('is silent on a mini-spec surface list whose `request`/`response` are datamodels', () => {
    expect(at('order-placement-ok/transport.yaml')).toEqual([])
  })

  it('fires on a surface entry’s `request` that names a component', () => {
    const found = at('order-placement-bad/transport.yaml').filter((d) =>
      d.message.startsWith('http.operations[0].request'),
    )
    expect(found).toHaveLength(1)
    expect(found[0].code).toBe('E_PROTO_PAYLOAD_KIND')
    expect(found[0].message).toContain('whose kind is "component"')
  })

  it('fires on a surface entry’s `response` that addresses an artifact of a datamodel', () => {
    const found = at('order-placement-bad/transport.yaml').filter((d) =>
      d.message.startsWith('http.operations[0].response'),
    )
    expect(found).toHaveLength(1)
    expect(found[0].code).toBe('E_PROTO_PAYLOAD_KIND')
    expect(found[0].message).toContain('addresses the "schema" artifact')
    expect(found[0].message).toContain('an artifact has no kind')
  })

  it('fires on a workflow step whose `payload` names a product', () => {
    const found = at('order-placement-bad/workflows/place.yaml').filter((d) => d.code === 'E_PROTO_PAYLOAD_KIND')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('steps[0].payload')
    expect(found[0].message).toContain('whose kind is "product"')
  })

  it('leaves an artifact suffix outside the role table to E_SRN_ARTIFACT, and a dangling ref to E_SRN_DANGLING', () => {
    // `.topology` is not a datamodel role (V5, static, precedes every surface
    // class) and `nowhere` is not an entity — three references, no findings.
    expect(at('elsewhere/transport.yaml')).toEqual([])
    expect(at('elsewhere/workflows/fetch.yaml')).toEqual([])
  })

  // W8 is `E_SRN_DANGLING` / `E_PROTO_PAYLOAD_KIND`, and only the second half
  // has an emitter. The `elsewhere` fixture above is already the input: its
  // `response: /product/shop/datamodel/nowhere@1` resolves to a legal SRN that
  // is not in the catalog, and nothing anywhere says so. Not this module's
  // class — see its docblock, "What this module deliberately does not report" —
  // and a register keyed by code cannot express half a rule, so the gap is
  // named here, beside the clause that does fire.
  it.todo('E_SRN_DANGLING: a payload reference resolving to no entity has no emitter, on any of the three surfaces')

  // The same hole one step earlier, and only on the transport surfaces:
  // `parseWorkflow` files E_SRN_SYNTAX / E_SRN_CROSS_SOLUTION / E_SRN_ARTIFACT
  // for a workflow step's `payload`, and nothing files them for a surface
  // entry's `request` / `response` / `message` or for `x-srn-payload`.
  it.todo('E_SRN_SYNTAX / E_SRN_ARTIFACT: an unparseable payload reference inside transport.yaml has no emitter')
})

describe('W_PROTO_WF_CHANNEL_UNKNOWN — W9, over both dialects', () => {
  it('admits an AsyncAPI channel named by its `address` and one named by its channelId', () => {
    expect(at('settlement-ok/workflows/settle.yaml')).toEqual([])
  })

  it('fires on an AsyncAPI channel the document does not declare', () => {
    const found = at('settlement-bad/workflows/settle.yaml')
    expect(found).toHaveLength(1)
    expect(found[0].code).toBe('W_PROTO_WF_CHANNEL_UNKNOWN')
    expect(found[0].severity).toBe('warning')
    expect(found[0].message).toContain('steps[0].channel')
    expect(found[0].message).toContain('acme.settlement.order-shipped.v1')
    expect(found[0].message).toContain('channelId')
  })

  it('admits a mini-spec channel named by an operation `name` and one named by its `path`', () => {
    expect(at('order-placement-ok/workflows/place.yaml')).toEqual([])
  })

  it('fires on a mini-spec channel no surface entry names', () => {
    const found = at('order-placement-bad/workflows/place.yaml').filter(
      (d) => d.code === 'W_PROTO_WF_CHANNEL_UNKNOWN',
    )
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('steps[0].channel')
    expect(found[0].message).toContain('cancel-order')
    expect(found[0].message).toContain('routing-key')
  })

  it('is skipped when the transport links a `spec` instead of declaring a surface list', () => {
    expect(at('spec-linked/workflows/call.yaml')).toEqual([])
  })

  it('is skipped when the protocol carries no transport.yaml', () => {
    expect(at('no-transport/workflows/call.yaml')).toEqual([])
  })

  it('is skipped when a mini-spec transport declares neither a `spec` nor a surface list', () => {
    // The reading `channelNames` documents: an empty name set is "nothing to
    // check against", however it came to be empty. The literal two-item
    // enumeration in `kinds/protocol.md` would warn here.
    expect(at('bare-binding/workflows/call.yaml')).toEqual([])
  })

  it('reads an `asyncapi:` version outside the band as the legacy dialect, as transport-checks does', () => {
    // The reconciliation, pinned. `structure.md`: an artifact declaring "one
    // unknown for its role" is "read as the legacy dialect" and "still checked
    // against the legacy grammar". Under the AsyncAPI reading this step's
    // channel matches nothing in {orderPlaced, acme.shop.order-placed.v1} and
    // would warn; under the mini-spec reading the document declares no surface
    // list, so there is nothing to check against and W9 is skipped. Silence here
    // is the legacy reading, and it is the same one `transport-checks.ts` takes
    // of the same bytes.
    expect(at('stale-asyncapi/workflows/call.yaml')).toEqual([])
  })

  it('runs against the surface list of a transport that also declares a `spec`', () => {
    const found = at('conflicted-bad/workflows/call.yaml')
    expect(found.map((d) => d.code)).toEqual(['W_PROTO_WF_CHANNEL_UNKNOWN'])
    // The first step matched `create-order`; only the second is a finding, which
    // is what says the list was read rather than the protocol skipped.
    expect(found[0].message).toContain('steps[1].channel')
    expect(found[0].message).toContain('cancel-order')
  })
})

describe('the whole list', () => {
  it('emits these two codes and nothing else', () => {
    expect([...new Set(diagnostics.map((d) => d.code))].sort()).toEqual([
      'E_PROTO_PAYLOAD_KIND',
      'W_PROTO_WF_CHANNEL_UNKNOWN',
    ])
  })

  it('fires exactly seven times, all of them on a `*-bad` protocol', () => {
    // Four payload findings — an actor, a component, a legal artifact suffix and
    // a product — and three channels no transport declares.
    expect(only('E_PROTO_PAYLOAD_KIND')).toHaveLength(4)
    expect(only('W_PROTO_WF_CHANNEL_UNKNOWN')).toHaveLength(3)
    expect(diagnostics.every((d) => d.path.includes('-bad/'))).toBe(true)
  })
})

describe('the shipped catalog', () => {
  it('is clean — both rules stay quiet on every protocol under solutions/', async () => {
    const shipped = await loadCatalog({ catalogDir: path.resolve(process.cwd(), '../../solutions') })
    expect(payloadDiagnostics(shipped)).toEqual([])
  })
})
