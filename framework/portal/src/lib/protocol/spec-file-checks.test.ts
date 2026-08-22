import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import {
  type ProtocolDirectoryEntry,
  protocolArtifactDiagnostics,
  protocolDirectoryIssues,
  styleIssues,
  transportSpecIssues,
} from './spec-file-checks'
import { type Workflow, parseWorkflow } from './workflow'

/**
 * Two layers, split where the inputs split.
 *
 * The three checks are pure functions of a directory listing, a parsed
 * `transport.yaml` and a parsed workflow, so they are driven with literals — a
 * temp directory would add latency and prove nothing the array does not. The
 * composition is then exercised once, over a hermetic temp catalog run through
 * the same `loadCatalog` the portal runs, because that is the only place the
 * wiring can be wrong: the listing keyed by SRN, the link read out of the
 * transport before the directory is judged, and the paths the diagnostics carry.
 *
 * Every code gets both halves — one input that fires it and one legal input that
 * must stay silent. The shipped catalogs are exemplars, so a rule that cannot go
 * green is as useless as one that cannot go red.
 */

const codes = (issues: Array<{ code: string }>) => issues.map((issue) => issue.code)

const file = (p: string): ProtocolDirectoryEntry => ({ path: p, directory: false })
const dir = (p: string): ProtocolDirectoryEntry => ({ path: p, directory: true })

/** The directory the kind document draws, in full. */
const EXEMPLAR: ProtocolDirectoryEntry[] = [
  file('index.md'),
  file('transport.yaml'),
  file('openapi.yaml'),
  file('arazzo.yaml'),
  file('states.json'),
  dir('workflows'),
  file('workflows/place-order.yaml'),
  file('workflows/cancel-order.yaml'),
]

/* --------------------------------------------- W_PROTO_ARTIFACT_UNKNOWN */

describe('protocolDirectoryIssues — the entity directory', () => {
  it('accepts the directory kinds/protocol.md draws', () => {
    expect(protocolDirectoryIssues(EXEMPLAR)).toEqual([])
  })

  it('accepts a *.md prose sibling, which carries no machine semantics', () => {
    expect(protocolDirectoryIssues([...EXEMPLAR, file('design-notes.md')])).toEqual([])
  })

  it('fires on the near-miss filenames the fixed bare names exist to prevent', () => {
    for (const name of ['protocol.yaml', 'order-placement.transport.yaml', 'arazzo.json', 'states.yaml']) {
      const issues = protocolDirectoryIssues([...EXEMPLAR, file(name)])
      expect(codes(issues)).toEqual(['W_PROTO_ARTIFACT_UNKNOWN'])
      expect(issues[0].severity).toBe('warning')
      expect(issues[0].path).toBe(name)
    }
  })

  it('fires on an unrecognised file beside a valid directory', () => {
    const issues = protocolDirectoryIssues([...EXEMPLAR, file('notes.txt')])
    expect(codes(issues)).toEqual(['W_PROTO_ARTIFACT_UNKNOWN'])
    expect(issues[0].message).toContain('bare and fixed')
  })

  it('fires on a subdirectory that is not workflows/', () => {
    const issues = protocolDirectoryIssues([...EXEMPLAR, dir('schemas'), file('schemas/pricing.proto')])
    expect(codes(issues)).toEqual(['W_PROTO_ARTIFACT_UNKNOWN', 'W_PROTO_ARTIFACT_UNKNOWN'])
    expect(issues[0].message).toContain('only asset subdirectory')
  })

  it('fires inside workflows/ on an extension a role may not vary, and on nesting', () => {
    const issues = protocolDirectoryIssues([
      ...EXEMPLAR,
      file('workflows/place-order.yml'),
      dir('workflows/archive'),
      file('workflows/archive/old.yaml'),
    ])
    expect(codes(issues)).toEqual(['W_PROTO_ARTIFACT_UNKNOWN', 'W_PROTO_ARTIFACT_UNKNOWN', 'W_PROTO_ARTIFACT_UNKNOWN'])
    const message = (p: string) => issues.find((issue) => issue.path === p)?.message ?? ''
    expect(message('workflows/place-order.yml')).toContain('may not vary its extension')
    expect(message('workflows/archive')).toContain('nothing below it')
    expect(message('workflows/archive/old.yaml')).toContain('nothing below it')
  })

  it('reports in path order, so two filesystems cannot disagree about the list', () => {
    const issues = protocolDirectoryIssues([file('zebra.txt'), file('index.md'), file('alpha.txt')])
    expect(issues.map((issue) => issue.path)).toEqual(['alpha.txt', 'zebra.txt'])
  })

  it('recognises a file by virtue of being linked, and only the one linked', () => {
    const listing = [...EXEMPLAR, file('pricing.proto'), file('legacy.proto')]
    expect(codes(protocolDirectoryIssues(listing, ['pricing.proto']))).toEqual(['W_PROTO_ARTIFACT_UNKNOWN'])
    expect(protocolDirectoryIssues(listing, ['pricing.proto'])[0].path).toBe('legacy.proto')
  })

  it('recognises the subdirectory a linked spec file sits in', () => {
    const listing = [...EXEMPLAR, dir('schemas'), file('schemas/pricing.proto')]
    expect(protocolDirectoryIssues(listing, ['./schemas/pricing.proto'])).toEqual([])
  })

  it('says nothing about dot- and underscore-prefixed entries, at any depth', () => {
    expect(
      protocolDirectoryIssues([...EXEMPLAR, file('.DS_Store'), dir('_scratch'), file('_scratch/draft.yaml')]),
    ).toEqual([])
  })

  it('does not mistake a directory named like an artifact for the artifact', () => {
    const issues = protocolDirectoryIssues([file('index.md'), dir('transport.yaml')])
    expect(codes(issues)).toEqual(['W_PROTO_ARTIFACT_UNKNOWN'])
  })
})

/* ----------------------------- E_PROTO_SPEC_FILE / W_PROTO_SPEC_ASYNCAPI */

const carried: ProtocolDirectoryEntry[] = [file('index.md'), file('transport.yaml'), file('openapi.yaml')]

describe('transportSpecIssues — the external-spec link', () => {
  it('says nothing about a transport that links no spec', () => {
    expect(transportSpecIssues({ kind: 'http', http: { 'base-path': '/api' } }, carried)).toEqual([])
  })

  it('accepts a link to a file the entity carries', () => {
    const document = { kind: 'http', spec: { format: 'openapi', version: '3.1.0', file: 'openapi.yaml' } }
    expect(transportSpecIssues(document, carried)).toEqual([])
    expect(transportSpecIssues({ ...document, spec: { ...document.spec, file: './openapi.yaml' } }, carried)).toEqual(
      [],
    )
  })

  it('fires E_PROTO_SPEC_FILE on a path that escapes the entity directory', () => {
    const issues = transportSpecIssues({ kind: 'http', spec: { format: 'openapi', file: '../shared/o.yaml' } }, carried)
    expect(codes(issues)).toEqual(['E_PROTO_SPEC_FILE'])
    expect(issues[0].severity).toBe('error')
    expect(issues[0].path).toBe('transport.yaml')
    expect(issues[0].message).toContain('escapes')
  })

  it('fires E_PROTO_SPEC_FILE on an absolute path, and says so rather than "does not exist"', () => {
    const issues = transportSpecIssues({ kind: 'http', spec: { format: 'openapi', file: '/etc/openapi.yaml' } }, carried)
    expect(codes(issues)).toEqual(['E_PROTO_SPEC_FILE'])
    expect(issues[0].message).toContain('absolute')
  })

  it('fires E_PROTO_SPEC_FILE when the linked file is not in the directory', () => {
    const issues = transportSpecIssues({ kind: 'http', spec: { format: 'protobuf', file: 'pricing.proto' } }, carried)
    expect(codes(issues)).toEqual(['E_PROTO_SPEC_FILE'])
    expect(issues[0].message).toContain('does not exist')
  })

  it('does not ask whether a file exists when no listing was supplied', () => {
    expect(transportSpecIssues({ kind: 'http', spec: { format: 'protobuf', file: 'pricing.proto' } }, null)).toEqual([])
    // The two clauses that need no filesystem still run.
    expect(codes(transportSpecIssues({ kind: 'http', spec: { format: 'openapi', file: '../o.yaml' } }, null))).toEqual([
      'E_PROTO_SPEC_FILE',
    ])
  })

  it('does not mistake a directory of that name for the linked file', () => {
    const issues = transportSpecIssues({ kind: 'http', spec: { format: 'graphql', file: 'schema' } }, [
      ...carried,
      dir('schema'),
    ])
    expect(codes(issues)).toEqual(['E_PROTO_SPEC_FILE'])
  })

  it('leaves a spec block it cannot read to E_PROTO_TRANSPORT_SCHEMA', () => {
    expect(transportSpecIssues({ kind: 'http', spec: 'openapi.yaml' }, carried)).toEqual([])
    expect(transportSpecIssues({ kind: 'http', spec: { format: 'openapi', file: 42 } }, carried)).toEqual([])
    expect(transportSpecIssues(null, carried)).toEqual([])
  })

  it('fires W_PROTO_SPEC_ASYNCAPI on each wire that has an AsyncAPI dialect', () => {
    for (const kind of ['kafka', 'websocket', 'amqp']) {
      const issues = transportSpecIssues({ kind, spec: { format: 'asyncapi', file: 'asyncapi.yaml' } }, [
        ...carried,
        file('asyncapi.yaml'),
      ])
      expect(codes(issues)).toEqual(['W_PROTO_SPEC_ASYNCAPI'])
      expect(issues[0].severity).toBe('warning')
      expect(issues[0].message).toContain(kind)
    }
  })

  it('stays silent on a wire that has no AsyncAPI dialect to move the document into', () => {
    for (const kind of ['http', 'grpc', 'in-process']) {
      expect(
        transportSpecIssues({ kind, spec: { format: 'asyncapi', file: 'asyncapi.yaml' } }, [
          ...carried,
          file('asyncapi.yaml'),
        ]),
      ).toEqual([])
    }
  })

  it('stays silent on an AsyncAPI-capable wire linking any other format', () => {
    expect(
      transportSpecIssues({ kind: 'kafka', spec: { format: 'protobuf', file: 'events.proto' } }, [
        ...carried,
        file('events.proto'),
      ]),
    ).toEqual([])
  })

  it('reports both classes when the link is both AsyncAPI-shaped and absent', () => {
    const issues = transportSpecIssues({ kind: 'kafka', spec: { format: 'asyncapi', file: 'asyncapi.yaml' } }, carried)
    expect(codes(issues)).toEqual(['E_PROTO_SPEC_FILE', 'W_PROTO_SPEC_ASYNCAPI'])
  })
})

/* ------------------------------------------------- W_PROTO_STYLE_MISMATCH */

function workflow(name: string, steps: string): { file: string; workflow: Workflow } {
  const { workflow: parsed, issues } = parseWorkflow({
    name,
    title: name,
    ...(JSON.parse(steps) as { steps: unknown[] }),
  })
  // A fixture that does not parse would make every style assertion vacuous.
  // Warnings are allowed and expected: the two deliberately unmatched fixtures
  // below draw `W_PROTO_WF_ORPHAN_RETURN`, which is this module's reading of
  // "matched" agreeing with W10's on the same two steps.
  expect(issues.filter((issue) => issue.severity === 'error')).toEqual([])
  if (!parsed) throw new Error('unparseable workflow fixture')
  return { file: `workflows/${name}.yaml`, workflow: parsed }
}

const CALL_AND_RETURN = JSON.stringify({
  steps: [
    { message: 'get-price', from: 'checkout', to: 'pricing', kind: 'call' },
    { message: 'price', from: 'pricing', to: 'checkout', kind: 'return' },
  ],
})

const EVENTS_ONLY = JSON.stringify({
  steps: [{ message: 'order-placed', from: 'checkout', to: ['inventory', 'billing'], kind: 'event' }],
})

describe('styleIssues — style against the steps beneath it', () => {
  it('says nothing about a bus protocol whose steps are all events', () => {
    expect(styleIssues('bus', [workflow('fan-out', EVENTS_ONLY)])).toEqual([])
  })

  it('fires on a bus protocol with a call step, once per step, at the workflow file', () => {
    const issues = styleIssues('bus', [workflow('quote', CALL_AND_RETURN)])
    expect(codes(issues)).toEqual(['W_PROTO_STYLE_MISMATCH'])
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].path).toBe('workflows/quote.yaml')
    expect(issues[0].message).toContain('steps[0]')
    expect(issues[0].message).toContain('does not name a callee')
  })

  it('finds a call inside a fragment, which a top-level-only walk would miss', () => {
    const nested = JSON.stringify({
      steps: [
        {
          opt: {
            when: 'the cart carries a coupon',
            steps: [{ message: 'get-price', from: 'checkout', to: 'pricing', kind: 'call' }],
          },
        },
      ],
    })
    const issues = styleIssues('bus', [workflow('nested', nested)])
    expect(codes(issues)).toEqual(['W_PROTO_STYLE_MISMATCH'])
    expect(issues[0].message).toContain('steps[0].opt.steps[0]')
  })

  it('says nothing about a request-response protocol whose workflow answers', () => {
    expect(styleIssues('request-response', [workflow('quote', CALL_AND_RETURN)])).toEqual([])
  })

  it('fires on a request-response protocol where no workflow ever answers, at index.md', () => {
    const issues = styleIssues('request-response', [
      workflow('fan-out', EVENTS_ONLY),
      workflow('more-fan-out', EVENTS_ONLY),
    ])
    expect(codes(issues)).toEqual(['W_PROTO_STYLE_MISMATCH'])
    expect(issues[0].path).toBe('index.md')
    expect(issues[0].message).toContain('no workflow ever answers')
  })

  it('is satisfied by one answering workflow among several', () => {
    expect(
      styleIssues('request-response', [workflow('fan-out', EVENTS_ONLY), workflow('quote', CALL_AND_RETURN)]),
    ).toEqual([])
  })

  it('counts an error as an answer, exactly as W_PROTO_WF_ORPHAN_RETURN does', () => {
    const declined = JSON.stringify({
      steps: [
        { message: 'authorize', from: 'checkout', to: 'payment', kind: 'call' },
        { message: 'declined', from: 'payment', to: 'checkout', kind: 'error' },
      ],
    })
    expect(styleIssues('request-response', [workflow('authorize', declined)])).toEqual([])
  })

  it('requires the pair to be matched — a return the call cannot see is not an answer', () => {
    // The return travels the wrong way: nobody called `pricing` FROM `inventory`.
    const unmatched = JSON.stringify({
      steps: [
        { message: 'get-price', from: 'checkout', to: 'pricing', kind: 'call' },
        { message: 'stock-level', from: 'inventory', to: 'warehouse', kind: 'return' },
      ],
    })
    expect(codes(styleIssues('request-response', [workflow('crossed', unmatched)]))).toEqual([
      'W_PROTO_STYLE_MISMATCH',
    ])
  })

  it('does not see a call made in a sibling compartment', () => {
    const siblings = JSON.stringify({
      steps: [
        {
          alt: [
            { when: 'in stock', steps: [{ message: 'reserve', from: 'checkout', to: 'inventory', kind: 'call' }] },
            { when: 'out of stock', steps: [{ message: 'reserved', from: 'inventory', to: 'checkout', kind: 'return' }] },
          ],
        },
      ],
    })
    expect(codes(styleIssues('request-response', [workflow('branchy', siblings)]))).toEqual(['W_PROTO_STYLE_MISMATCH'])
  })

  it('says nothing about a request-response protocol that has no workflows at all', () => {
    // "A protocol with only index.md is legal — an intent-level protocol under
    // design." Five of the protocols shipped in solutions/ are exactly that.
    expect(styleIssues('request-response', [])).toEqual([])
  })

  it('says nothing about point-to-point, for which the kind document states no check', () => {
    expect(styleIssues('point-to-point', [workflow('quote', CALL_AND_RETURN)])).toEqual([])
    expect(styleIssues('point-to-point', [workflow('fan-out', EVENTS_ONLY)])).toEqual([])
  })

  it('says nothing when style is absent or unreadable — that is E_FM_SCHEMA', () => {
    expect(styleIssues('', [workflow('quote', CALL_AND_RETURN)])).toEqual([])
    expect(styleIssues('pub-sub', [workflow('quote', CALL_AND_RETURN)])).toEqual([])
  })
})

/* ----------------------------------------------------------- composition */

let catalogDir: string
let catalog: Catalog
let diagnostics: Diagnostic[]

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

async function artifact(relDir: string, name: string, raw: string) {
  await mkdir(path.dirname(path.join(catalogDir, relDir, name)), { recursive: true })
  await writeFile(path.join(catalogDir, relDir, name), raw)
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
  }[kind] ?? {}),
  ...extra,
})

const PARTICIPANTS = [
  { alias: 'checkout', ref: '/product/shop/component/checkout' },
  { alias: 'pricing', ref: '/product/shop/component/pricing' },
]

const protocolEntity = (name: string, style: string) =>
  entity(`acme/product/shop/protocol/${name}`, base(name, 'protocol', { style, participants: PARTICIPANTS }))

const WORKFLOW_HEADER =
  '$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/workflow-document\n'

const answering = (name: string) =>
  `${WORKFLOW_HEADER}name: ${name}\ntitle: Ask for a price\nsteps:\n` +
  '  - message: get-price\n    from: checkout\n    to: pricing\n    kind: call\n' +
  '  - message: price\n    from: pricing\n    to: checkout\n    kind: return\n'

const announcing = (name: string) =>
  `${WORKFLOW_HEADER}name: ${name}\ntitle: Announce a price change\nsteps:\n` +
  '  - message: price-changed\n    from: pricing\n    to: checkout\n    kind: event\n'

/** One protocol directory, recursively, as {@link ProtocolDirectoryEntry} rows. */
async function listing(root: string, prefix = ''): Promise<ProtocolDirectoryEntry[]> {
  const found = await readdir(path.join(root, prefix), { withFileTypes: true })
  const entries: ProtocolDirectoryEntry[] = []
  for (const entry of found) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    entries.push({ path: rel, directory: entry.isDirectory() })
    if (entry.isDirectory()) entries.push(...(await listing(root, rel)))
  }
  return entries
}

async function listings(loaded: Catalog): Promise<Map<string, ProtocolDirectoryEntry[]>> {
  const map = new Map<string, ProtocolDirectoryEntry[]>()
  for (const found of loaded.entities.values()) {
    if (found.kind !== 'protocol') continue
    map.set(found.srn, await listing(found.dir))
  }
  return map
}

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-protocol-files-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/product/shop', base('shop', 'product'))
  await entity('acme/product/shop/component/checkout', base('checkout', 'component'))
  await entity('acme/product/shop/component/pricing', base('pricing', 'component'))

  // The exemplar: fixed names, a linked spec that is there, a workflow that
  // answers. Every rule in this module must be silent on it.
  await protocolEntity('price-quoting', 'request-response')
  await artifact(
    'acme/product/shop/protocol/price-quoting',
    'transport.yaml',
    '$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document\n' +
      'kind: http\nspec:\n  format: openapi\n  version: 3.1.0\n  file: openapi.yaml\n' +
      'http:\n  base-path: /api/v1/prices\n',
  )
  await artifact('acme/product/shop/protocol/price-quoting', 'openapi.yaml', 'openapi: 3.1.0\n')
  await artifact('acme/product/shop/protocol/price-quoting', 'design-notes.md', '## Notes\n')
  await artifact('acme/product/shop/protocol/price-quoting', 'workflows/ask.yaml', answering('ask'))

  // A link that escapes the entity directory, and litter beside it.
  await protocolEntity('escaping-link', 'request-response')
  await artifact(
    'acme/product/shop/protocol/escaping-link',
    'transport.yaml',
    'kind: http\nspec:\n  format: openapi\n  file: ../price-quoting/openapi.yaml\nhttp:\n  base-path: /api\n',
  )
  await artifact('acme/product/shop/protocol/escaping-link', 'protocol.yaml', 'kind: http\n')
  await artifact('acme/product/shop/protocol/escaping-link', 'notes.txt', 'scratch\n')
  await artifact('acme/product/shop/protocol/escaping-link', 'workflows/ask.yaml', answering('ask'))

  // A link to a file in a foreign convention that is simply not there — and one
  // that is, so the check is not "any non-artifact extension is missing".
  await protocolEntity('missing-link', 'request-response')
  await artifact(
    'acme/product/shop/protocol/missing-link',
    'transport.yaml',
    'kind: grpc\nspec:\n  format: protobuf\n  file: pricing.proto\ngrpc:\n  package: acme.v1\n  service: Pricing\n',
  )
  await artifact('acme/product/shop/protocol/missing-link', 'legacy.proto', 'syntax = "proto3";\n')
  await artifact('acme/product/shop/protocol/missing-link', 'workflows/ask.yaml', answering('ask'))

  // An AsyncAPI document linked beside a kafka transport instead of adopting the
  // dialect. The file is present and linked, so it is recognised and the only
  // finding is the warning.
  await protocolEntity('linked-asyncapi', 'bus')
  await artifact(
    'acme/product/shop/protocol/linked-asyncapi',
    'transport.yaml',
    'kind: kafka\nspec:\n  format: asyncapi\n  file: asyncapi.yaml\nkafka:\n  cluster: shop-events\n',
  )
  await artifact('acme/product/shop/protocol/linked-asyncapi', 'asyncapi.yaml', 'asyncapi: 3.1.0\n')
  await artifact('acme/product/shop/protocol/linked-asyncapi', 'workflows/announce.yaml', announcing('announce'))

  // A bus protocol whose workflow calls, and a request-response one whose
  // workflows only announce.
  await protocolEntity('calling-bus', 'bus')
  await artifact('acme/product/shop/protocol/calling-bus', 'workflows/ask.yaml', answering('ask'))

  await protocolEntity('silent-request-response', 'request-response')
  await artifact(
    'acme/product/shop/protocol/silent-request-response',
    'workflows/announce.yaml',
    announcing('announce'),
  )

  // Intent-level: index.md and nothing else. Legal, and must draw nothing.
  await protocolEntity('under-design', 'request-response')

  // A transport.yaml that does not parse: the link is unreadable, so the
  // directory rule cannot tell an attachment from litter and says nothing.
  await protocolEntity('unreadable-transport', 'request-response')
  await artifact('acme/product/shop/protocol/unreadable-transport', 'transport.yaml', 'kind: http\n  spec: [oops\n')
  await artifact('acme/product/shop/protocol/unreadable-transport', 'pricing.proto', 'syntax = "proto3";\n')

  catalog = await loadCatalog({ catalogDir })
  diagnostics = protocolArtifactDiagnostics(catalog, await listings(catalog))
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

const of = (srnTail: string) =>
  diagnostics.filter((diagnostic) => diagnostic.srn === `srn://acme/product/shop/protocol/${srnTail}`)

describe('protocolArtifactDiagnostics — over the resolved catalog', () => {
  it('loads the fixture with no errors of its own', () => {
    expect(catalog.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  })

  it('says nothing about the exemplar protocol', () => {
    expect(of('price-quoting')).toEqual([])
  })

  it('says nothing about an intent-level protocol carrying only index.md', () => {
    expect(of('under-design')).toEqual([])
  })

  it('says nothing about a directory whose transport.yaml did not parse', () => {
    // The loader recorded the parse failure on the artifact; reporting the
    // possibly-linked `pricing.proto` as litter would be a second, wrong
    // complaint about the same defect.
    const entity = catalog.entities.get('srn://acme/product/shop/protocol/unreadable-transport')
    expect(entity?.artifacts.find((found) => found.file === 'transport.yaml')?.error).toBeTruthy()
    expect(of('unreadable-transport')).toEqual([])
  })

  it('fires E_PROTO_SPEC_FILE at transport.yaml, with the entity SRN', () => {
    expect(of('escaping-link').filter((diagnostic) => diagnostic.code === 'E_PROTO_SPEC_FILE')).toEqual([
      expect.objectContaining({
        severity: 'error',
        path: 'acme/product/shop/protocol/escaping-link/transport.yaml',
        srn: 'srn://acme/product/shop/protocol/escaping-link',
      }),
    ])
  })

  it('fires W_PROTO_ARTIFACT_UNKNOWN at each offending entry, including the one the loader never read', () => {
    expect(
      of('escaping-link')
        .filter((diagnostic) => diagnostic.code === 'W_PROTO_ARTIFACT_UNKNOWN')
        .map((diagnostic) => diagnostic.path),
    ).toEqual([
      'acme/product/shop/protocol/escaping-link/notes.txt',
      'acme/product/shop/protocol/escaping-link/protocol.yaml',
    ])
  })

  it('fires E_PROTO_SPEC_FILE on a linked file that is absent, and nothing on the one that is present', () => {
    expect(codes(of('missing-link'))).toEqual(['W_PROTO_ARTIFACT_UNKNOWN', 'E_PROTO_SPEC_FILE'])
    // `legacy.proto` is the unknown one: unlinked, and in a foreign convention.
    expect(of('missing-link')[0].path).toBe('acme/product/shop/protocol/missing-link/legacy.proto')
    expect(of('missing-link')[1].message).toContain('pricing.proto')
  })

  it('fires W_PROTO_SPEC_ASYNCAPI alone — the linked file is recognised by being linked', () => {
    expect(of('linked-asyncapi')).toEqual([
      expect.objectContaining({
        code: 'W_PROTO_SPEC_ASYNCAPI',
        severity: 'warning',
        path: 'acme/product/shop/protocol/linked-asyncapi/transport.yaml',
      }),
    ])
  })

  it('fires W_PROTO_STYLE_MISMATCH at the workflow for a bus protocol that calls', () => {
    expect(of('calling-bus')).toEqual([
      expect.objectContaining({
        code: 'W_PROTO_STYLE_MISMATCH',
        path: 'acme/product/shop/protocol/calling-bus/workflows/ask.yaml',
        message: expect.stringContaining('steps[0]:'),
      }),
    ])
  })

  it('fires W_PROTO_STYLE_MISMATCH at index.md for a request-response protocol that never answers', () => {
    expect(of('silent-request-response')).toEqual([
      expect.objectContaining({
        code: 'W_PROTO_STYLE_MISMATCH',
        path: 'acme/product/shop/protocol/silent-request-response/index.md',
      }),
    ])
  })

  it('keeps the filesystem-free checks for a protocol the caller supplied no listing for', () => {
    const withoutListings = protocolArtifactDiagnostics(catalog, new Map())
    expect(withoutListings.filter((diagnostic) => diagnostic.code === 'W_PROTO_ARTIFACT_UNKNOWN')).toEqual([])
    // The absent `pricing.proto` can no longer be asked after; the escaping link
    // and both style findings are decidable without a directory.
    expect(codes(withoutListings).sort()).toEqual([
      'E_PROTO_SPEC_FILE',
      'W_PROTO_SPEC_ASYNCAPI',
      'W_PROTO_STYLE_MISMATCH',
      'W_PROTO_STYLE_MISMATCH',
    ])
  })
})
