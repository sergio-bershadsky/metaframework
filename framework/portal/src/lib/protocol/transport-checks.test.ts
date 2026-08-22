import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { adoptDialect } from '../catalog/dialects'
import type { Artifact, ArtifactDialect } from '../catalog/types'
import { dirToSrn, formatSrn } from '../srn/srn'
import { transportDiagnostics } from './transport-checks'

/**
 * The five transport classes, each proved twice: a document that goes red on the
 * sentence of `kinds/protocol.md` it violates, and the same document corrected.
 *
 * The last suite is the other half of the proof. Every `transport.yaml` under
 * `solutions/`, in both dialects, is a *green* corpus for all five codes, run
 * through the same entry point with the same dialect ruling the loader makes. A
 * checker proved only against synthetic red cases can still be wrong in the one
 * direction that breaks a repository — and one proved against a corpus it
 * silently failed to load is not proved at all, which is what the mutation at
 * the end of that suite is for.
 */

const MINI_SPEC: ArtifactDialect = {
  role: 'transport',
  key: '$schema',
  declared: 'https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document',
  known: true,
}

const ASYNCAPI: ArtifactDialect = { role: 'transport', key: 'asyncapi', declared: '3.1.0', known: true }

const codes = (diagnostics: ReturnType<typeof transportDiagnostics>) => diagnostics.map((d) => d.code)

/** A mini-spec document the spec's own worked example 2 writes, minus the spec link. */
const grpcTransport = () => ({
  kind: 'grpc',
  summary: 'Internal price quotation service consumed by the payment sub-component.',
  encoding: 'protobuf',
  auth: ['mtls'],
  grpc: {
    package: 'acme.shop.checkout.pricing.v1',
    service: 'PricingService',
    tls: true,
    methods: [{ name: 'Quote', request: '/datamodel/quote-request@1', streaming: 'none' }],
  },
})

/** Worked example 1: kafka, a surface list, no external spec. */
const kafkaTransport = () => ({
  kind: 'kafka',
  summary: 'Order lifecycle facts published by checkout for downstream consumers.',
  encoding: 'avro',
  auth: ['sasl-scram'],
  kafka: {
    cluster: 'shop-events',
    topics: [
      {
        name: 'acme.shop.order.placed.v1',
        key: 'order-id',
        message: '/product/shop/datamodel/order-placed@2',
        partitions: 12,
        retention: '7d',
        summary: 'Emitted once an order reaches the confirmed state.',
      },
    ],
  },
})

/** The worked `settlement` document, cut to the profile's six rules. */
const settlement = () => ({
  asyncapi: '3.1.0',
  'x-srn': 'srn://acme/protocol/settlement',
  info: {
    title: 'Settlement',
    version: 'unversioned',
    description: 'Settlement facts published by shop and consumed by billing.',
  },
  defaultContentType: 'application/vnd.apache.avro',
  servers: {
    'acme-settlement': {
      host: '{host}',
      protocol: 'kafka',
      variables: { host: { description: 'Supplied by the environment; this protocol names no deployment.' } },
      'x-srn-auth': ['sasl-scram', 'mtls'],
    },
  },
  channels: {
    'order-paid': {
      address: 'acme.settlement.order-paid.v1',
      messages: { 'order-paid': { 'x-srn-payload': '/product/shop/datamodel/order@3' } },
    },
  },
})

const SETTLEMENT_OPTIONS = {
  dialect: ASYNCAPI,
  srn: 'srn://acme/protocol/settlement',
  title: 'Settlement',
  participants: [
    { alias: 'shop', ref: '/product/shop/component/checkout' },
    { alias: 'billing', ref: '/product/billing' },
  ],
}

describe('E_PROTO_TRANSPORT_SCHEMA — the mini-spec field table', () => {
  it('stays green on a document written the way the spec writes it', () => {
    expect(transportDiagnostics(grpcTransport(), { dialect: MINI_SPEC })).toEqual([])
    expect(transportDiagnostics(kafkaTransport(), { dialect: MINI_SPEC })).toEqual([])
  })

  it('goes red on a key that merely resembles the dialect header', () => {
    // protocol.md, "Top-level fields": `$schema` is not "any other key" — it is
    // the dialect header — but a key that merely resembles it is.
    const document = { ...kafkaTransport(), schema: 'transport-document' }
    const found = transportDiagnostics(document, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_SCHEMA'])
    expect(found[0].message).toContain('schema: unknown key')
  })

  it('goes red on a version key, which artifacts do not have', () => {
    // "Artifacts carry no version of their own … A `version:` key at the top
    // level of transport.yaml or a workflow file is a shape violation."
    const found = transportDiagnostics({ ...kafkaTransport(), version: 4 }, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_SCHEMA'])
    expect(found[0].message).toContain('version: unknown key')
  })

  it('admits the header itself, and the x- hatch, at the root and inside entries', () => {
    const document = {
      $schema: MINI_SPEC.declared,
      ...kafkaTransport(),
      'x-carrier-timeout': '30s',
    }
    document.kafka.topics[0] = { ...document.kafka.topics[0], 'x-audit': true } as never
    expect(transportDiagnostics(document, { dialect: MINI_SPEC })).toEqual([])
  })

  it('goes red on a type violation of the table', () => {
    const document = { ...kafkaTransport(), encoding: 'yaml', auth: 'sasl-scram' }
    expect(codes(transportDiagnostics(document, { dialect: MINI_SPEC }))).toEqual([
      'E_PROTO_TRANSPORT_SCHEMA',
      'E_PROTO_TRANSPORT_SCHEMA',
    ])
  })

  it('goes red on a summary that is over the cap or is not one line', () => {
    const long = { ...kafkaTransport(), summary: 'x'.repeat(201) }
    const wrapped = { ...kafkaTransport(), summary: 'two\nlines' }
    expect(codes(transportDiagnostics(long, { dialect: MINI_SPEC }))).toEqual(['E_PROTO_TRANSPORT_SCHEMA'])
    expect(codes(transportDiagnostics(wrapped, { dialect: MINI_SPEC }))).toEqual(['E_PROTO_TRANSPORT_SCHEMA'])
  })

  it('goes red inside a binding block and inside one of its entries', () => {
    const document = grpcTransport()
    document.grpc = { ...document.grpc, service: 42 } as never
    document.grpc.methods[0] = { name: 'Quote', streaming: 'half-duplex' } as never
    const found = transportDiagnostics(document, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_SCHEMA', 'E_PROTO_TRANSPORT_SCHEMA'])
    expect(found.map((d) => d.message.split(':')[0])).toEqual(['grpc.service', 'grpc.methods[0].streaming'])
  })

  it('goes red on a missing required field of an entry', () => {
    // An entry is a level below "a required binding field", which is the class
    // E_PROTO_TRANSPORT_BINDING's definition row names. See the module docblock.
    const document = { kind: 'http', http: { 'base-path': '/v1', operations: [{ name: 'create-order' }] } }
    const found = transportDiagnostics(document, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_SCHEMA', 'E_PROTO_TRANSPORT_SCHEMA'])
    expect(found.map((d) => d.message.split(':')[0])).toEqual([
      'http.operations[0].method',
      'http.operations[0].path',
    ])
  })

  it('goes red when kind is absent or outside the closed set', () => {
    expect(codes(transportDiagnostics({ http: { 'base-path': '/v1' } }, { dialect: MINI_SPEC }))).toEqual([
      'E_PROTO_TRANSPORT_SCHEMA',
    ])
    expect(codes(transportDiagnostics({ kind: 'stdio' }, { dialect: MINI_SPEC }))).toEqual([
      'E_PROTO_TRANSPORT_SCHEMA',
    ])
  })

  it('goes red on a document that is not a mapping', () => {
    expect(codes(transportDiagnostics(null, { dialect: MINI_SPEC }))).toEqual(['E_PROTO_TRANSPORT_SCHEMA'])
    expect(codes(transportDiagnostics([{ kind: 'http' }], { dialect: MINI_SPEC }))).toEqual([
      'E_PROTO_TRANSPORT_SCHEMA',
    ])
  })

  it('reads an unrecognised asyncapi header as the legacy dialect, which is this one', () => {
    // structure.md, "The legacy dialect, and its warning": an artifact carrying
    // no *recognisable* discriminator is read as the legacy dialect and "still
    // checked against the legacy grammar". For the transport role that grammar
    // is the mini-spec, so an AsyncAPI 2.6 document — which was never valid
    // under it either — is judged by the field table, not by the profile.
    const stale: ArtifactDialect = { role: 'transport', key: 'asyncapi', declared: '2.6.0', known: false }
    const document = { asyncapi: '2.6.0', info: { title: 'Settlement' }, channels: {} }
    const found = transportDiagnostics(document, { dialect: stale, srn: 'srn://acme/protocol/settlement' })
    expect(new Set(codes(found))).toEqual(new Set(['E_PROTO_TRANSPORT_SCHEMA']))
    expect(found.map((d) => d.message.split(':')[0]).sort()).toEqual(['asyncapi', 'channels', 'info', 'kind'])
  })

  it('reads a file declaring both dialect keys as the mini-spec, where asyncapi is an unknown key', () => {
    // protocol.md, "Artifact dialects": the loader takes the first match, so
    // `$schema` wins; `asyncapi:` is a foreign key, is not stripped, and the
    // mini-spec's field table rejects it. Sniffing `data.asyncapi` would print
    // the opposite verdict on the spec's own counter-example.
    const document = { asyncapi: '3.1.0', ...kafkaTransport() }
    const found = transportDiagnostics(document, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_SCHEMA'])
    expect(found[0].message).toContain('asyncapi: unknown key')
  })
})

describe('E_PROTO_TRANSPORT_BINDING — one protocol, one transport', () => {
  it('stays green when the block is keyed by exactly the kind value', () => {
    expect(transportDiagnostics(grpcTransport(), { dialect: MINI_SPEC })).toEqual([])
  })

  it('goes red on a second, undocumented block', () => {
    // protocol.md: modelling two wires as `kind: http` plus a second block is
    // E_PROTO_TRANSPORT_BINDING, not two transports.
    const document = {
      kind: 'http',
      http: { 'base-path': '/api/v1' },
      grpc: { package: 'acme.v1', service: 'Orders' },
    }
    const found = transportDiagnostics(document, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_BINDING'])
    expect(found[0].message).toContain('grpc')
  })

  it('goes red when the block the kind names is missing', () => {
    const found = transportDiagnostics({ kind: 'websocket', summary: 'A socket.' }, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_BINDING'])
    expect(found[0].message).toContain('needs a "websocket" binding block')
  })

  it('goes red on a required binding field the block does not carry', () => {
    // The definition row's third clause: "or a required binding field absent".
    const found = transportDiagnostics({ kind: 'http', http: { operations: [] } }, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_BINDING'])
    expect(found[0].message).toContain('http.base-path')

    const green = { kind: 'http', http: { 'base-path': '/api/v1', operations: [] } }
    expect(transportDiagnostics(green, { dialect: MINI_SPEC })).toEqual([])
  })

  it('goes red on a kafka block with neither a spec link nor topics', () => {
    // The one surface list a field table marks required — "yes, unless `spec` is
    // present" — which makes it a required binding field, conditionally.
    const withoutTopics = { kind: 'kafka', kafka: { cluster: 'shop-events' } }
    const found = transportDiagnostics(withoutTopics, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_BINDING'])
    expect(found[0].message).toContain('unless the document links a spec')

    const withSpec = {
      kind: 'kafka',
      spec: { format: 'asyncapi', file: 'asyncapi.yaml' },
      kafka: { cluster: 'shop-events' },
    }
    expect(transportDiagnostics(withSpec, { dialect: MINI_SPEC })).toEqual([])
  })

  it('says nothing about blocks when kind itself is unreadable', () => {
    // One defect, one diagnostic: which block should be there is unanswerable
    // until `kind` is, and the field-table finding already carries it.
    const found = transportDiagnostics({ kind: 'stdio', grpc: { package: 'a.b', service: 'S' } }, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_SCHEMA'])
  })
})

describe('E_PROTO_TRANSPORT_SPEC_CONFLICT — spec XOR the surface list', () => {
  it('stays green with a spec link and no surface list', () => {
    const document = {
      ...grpcTransport(),
      spec: { format: 'protobuf', version: 'proto3', file: 'pricing.proto' },
      grpc: { package: 'acme.shop.checkout.pricing.v1', service: 'PricingService', tls: true },
    }
    expect(transportDiagnostics(document, { dialect: MINI_SPEC })).toEqual([])
  })

  it('stays green with a surface list and no spec link', () => {
    expect(transportDiagnostics(kafkaTransport(), { dialect: MINI_SPEC })).toEqual([])
  })

  it('goes red when both are written', () => {
    // protocol.md's own counter-example, on the http block.
    const document = {
      kind: 'http',
      spec: { format: 'openapi', file: 'openapi.yaml' },
      http: {
        'base-path': '/api/v1/orders',
        operations: [{ name: 'create-order', method: 'POST', path: '/' }],
      },
    }
    const found = transportDiagnostics(document, { dialect: MINI_SPEC })
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_SPEC_CONFLICT'])
    expect(found[0].message).toContain('http.operations')
  })

  it('goes red on every block that has a surface list, not just http', () => {
    const each = [
      { kind: 'grpc', grpc: { package: 'a.b', service: 'S', methods: [{ name: 'Q' }] } },
      { kind: 'amqp', amqp: { exchange: 'x', 'exchange-type': 'topic', bindings: [{ 'routing-key': 'a.#', queue: 'q' }] } },
      { kind: 'kafka', kafka: { topics: [{ name: 't' }] } },
      { kind: 'websocket', websocket: { path: '/ws', channels: [{ name: 'move', direction: 'bidi' }] } },
      { kind: 'in-process', 'in-process': { language: 'typescript', module: '@a/b', functions: [{ name: 'quote' }] } },
    ]
    for (const document of each) {
      const withSpec = { ...document, spec: { format: 'openapi', file: 'openapi.yaml' } }
      expect(codes(transportDiagnostics(withSpec, { dialect: MINI_SPEC }))).toEqual([
        'E_PROTO_TRANSPORT_SPEC_CONFLICT',
      ])
      expect(transportDiagnostics(document, { dialect: MINI_SPEC })).toEqual([])
    }
  })
})

describe('E_PROTO_TRANSPORT_ASYNCAPI — the six-rule profile', () => {
  it('stays green on the worked settlement document', () => {
    expect(transportDiagnostics(settlement(), SETTLEMENT_OPTIONS)).toEqual([])
  })

  it('applies to the AsyncAPI dialect only', () => {
    // The mini-spec branch never emits this class, and vice versa: a document
    // missing `x-srn` is not a mini-spec finding, and a missing `kind` is not an
    // AsyncAPI one.
    const document = settlement()
    delete (document as Record<string, unknown>)['x-srn']
    expect(codes(transportDiagnostics(document, SETTLEMENT_OPTIONS))).toEqual(['E_PROTO_TRANSPORT_ASYNCAPI'])
    expect(codes(transportDiagnostics(document, { ...SETTLEMENT_OPTIONS, dialect: MINI_SPEC })).every((c) => c !== 'E_PROTO_TRANSPORT_ASYNCAPI')).toBe(true)
  })

  it('rule 1 — x-srn must name the owning entity', () => {
    const wrong = { ...settlement(), 'x-srn': 'srn://acme/protocol/settlement-v2' }
    const found = transportDiagnostics(wrong, SETTLEMENT_OPTIONS)
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_ASYNCAPI'])
    expect(found[0].message).toContain('rule 1')
  })

  it('rule 2 — info.title mirrors the frontmatter title', () => {
    const document = settlement()
    document.info.title = 'Settlements'
    const found = transportDiagnostics(document, SETTLEMENT_OPTIONS)
    expect(found.map((d) => d.message)).toEqual([
      expect.stringContaining('rule 2'),
    ])
  })

  it('rule 3 — info.version is exactly "unversioned"', () => {
    const document = settlement()
    document.info.version = '4'
    const found = transportDiagnostics(document, SETTLEMENT_OPTIONS)
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_ASYNCAPI'])
    expect(found[0].message).toContain('rule 3')
  })

  it('rule 4 — exactly one server', () => {
    const document = settlement()
    const servers: Record<string, unknown> = {
      ...document.servers,
      // A second server is a second wire, which is a second protocol entity.
      'acme-settlement-dr': { host: '{host}', protocol: 'kafka' },
    }
    const found = transportDiagnostics({ ...document, servers }, SETTLEMENT_OPTIONS)
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_ASYNCAPI'])
    expect(found[0].message).toContain('rule 4')

    // And none is not one either.
    const none = transportDiagnostics({ ...document, servers: {} }, SETTLEMENT_OPTIONS)
    expect(codes(none)).toEqual(['E_PROTO_TRANSPORT_ASYNCAPI'])
    expect(none[0].message).toContain('rule 4')
  })

  it('rule 4 — the protocol is a wire this dialect covers', () => {
    const document = settlement()
    // `http` is admitted by AsyncAPI itself and refused here: OpenAPI owns that
    // wire and already has a role and a filename.
    document.servers['acme-settlement'].protocol = 'http'
    const found = transportDiagnostics(document, SETTLEMENT_OPTIONS)
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_ASYNCAPI'])
    expect(found[0].message).toContain('rule 4')

    for (const protocol of ['kafka', 'kafka-secure', 'ws', 'wss', 'amqp', 'amqps']) {
      const green = settlement()
      green.servers['acme-settlement'].protocol = protocol
      expect(transportDiagnostics(green, SETTLEMENT_OPTIONS)).toEqual([])
    }
  })

  it('rule 5 — channels is present and non-empty', () => {
    const empty = { ...settlement(), channels: {} }
    const found = transportDiagnostics(empty, SETTLEMENT_OPTIONS)
    expect(codes(found)).toEqual(['E_PROTO_TRANSPORT_ASYNCAPI'])
    expect(found[0].message).toContain('rule 5')
  })

  it('rule 6 — operations oblige an id, and it must be a participant', () => {
    const operations = { 'publish-order-paid': { action: 'send', channel: { $ref: '#/channels/order-paid' } } }

    const noId = { ...settlement(), operations }
    expect(transportDiagnostics(noId, SETTLEMENT_OPTIONS)[0].message).toContain('rule 6')

    const stranger = { ...settlement(), operations, id: 'srn://acme/product/shop/component/inventory' }
    expect(transportDiagnostics(stranger, SETTLEMENT_OPTIONS)[0].message).toContain('rule 6')

    // The participant's ref in absolute form, resolved from the entity's SRN.
    const named = { ...settlement(), operations, id: 'srn://acme/product/shop/component/checkout' }
    expect(transportDiagnostics(named, SETTLEMENT_OPTIONS)).toEqual([])

    // No operations, no obligation — the mini-spec's kafka surface list records
    // no direction, and a migration must not invent one.
    expect(transportDiagnostics(settlement(), SETTLEMENT_OPTIONS)).toEqual([])
  })

  it('checks only what the caller supplied', () => {
    // Rules 1, 2 and 6 compare against the entity. Handed nothing to compare
    // against, they are silent rather than inventive.
    const document = { ...settlement(), 'x-srn': 'srn://elsewhere/protocol/x' }
    document.info.title = 'Anything'
    expect(transportDiagnostics(document, { dialect: ASYNCAPI })).toEqual([])
  })
})

describe('W_PROTO_TRANSPORT_HOST — a literal host is a deployment fact', () => {
  it('stays green on a templated host with no default', () => {
    expect(transportDiagnostics(settlement(), SETTLEMENT_OPTIONS)).toEqual([])
  })

  it('warns on a literal host, and does not break the catalog', () => {
    const document = settlement()
    document.servers['acme-settlement'] = {
      ...document.servers['acme-settlement'],
      host: 'kafka-01.acme.internal:9092',
    }
    const found = transportDiagnostics(document, SETTLEMENT_OPTIONS)
    expect(codes(found)).toEqual(['W_PROTO_TRANSPORT_HOST'])
    expect(found[0].severity).toBe('warning')
    expect(found[0].message).toContain('servers.acme-settlement.host')
  })

  it('says nothing about a host AsyncAPI requires and the file omits', () => {
    // Requiredness is AsyncAPI's own, and validating the document against the
    // full specification is deferred. A warning here would report a fact the
    // file never stated.
    const document = settlement()
    delete (document.servers['acme-settlement'] as Record<string, unknown>).host
    expect(transportDiagnostics(document, SETTLEMENT_OPTIONS)).toEqual([])
  })
})

/* ------------------------------------------------- the shipped catalog */

const CATALOG = path.resolve(process.cwd(), '../../solutions')

interface Transport {
  /** Catalog-relative path, as a diagnostic reports it. */
  file: string
  data: unknown
  dialect: ArtifactDialect | undefined
  srn: string
  title?: string
  participants?: readonly unknown[]
}

async function walk(dir: string, out: string[]): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) await walk(full, out)
    else if (entry.name === 'transport.yaml') out.push(full)
  }
  return out
}

/**
 * Every `transport.yaml` under `solutions/`, loaded the way `loadCatalog` loads
 * one: parsed, then handed to {@link adoptDialect}, which records the dialect and
 * strips a framework-owned header before any validator sees the document.
 * Reproducing that sequence is the point — a checker that only ever saw
 * documents with `$schema` already removed would pass a test the portal fails.
 */
async function shippedTransports(): Promise<Transport[]> {
  const files = await walk(CATALOG, [])
  files.sort()
  const transports: Transport[] = []
  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    const artifact: Artifact = { file: 'transport.yaml', extension: '.yaml', data: parseYaml(raw), raw }
    adoptDialect('protocol', artifact)
    const dir = path.dirname(file)
    const front = matter(await readFile(path.join(dir, 'index.md'), 'utf8')).data as Record<string, unknown>
    transports.push({
      file: path.relative(CATALOG, file),
      data: artifact.data,
      dialect: artifact.dialect,
      srn: formatSrn(dirToSrn(path.relative(path.dirname(CATALOG), dir))),
      title: typeof front.title === 'string' ? front.title : undefined,
      participants: Array.isArray(front.participants) ? front.participants : undefined,
    })
  }
  return transports
}

describe('the shipped catalog', () => {
  it('is a green corpus for all five classes, in both dialects', async () => {
    const transports = await shippedTransports()
    const findings = transports.flatMap((transport) =>
      transportDiagnostics(transport.data, {
        dialect: transport.dialect,
        path: transport.file,
        srn: transport.srn,
        title: transport.title,
        participants: transport.participants,
      }).map((d) => `${d.code} ${d.path} — ${d.message}`),
    )
    expect(findings).toEqual([])

    // The corpus is only evidence if it covers both branches, and only evidence
    // at all if it loaded. Counts are not asserted — they are a measured fact
    // that rots (ADR 0018) — but emptiness is: an empty corpus would make the
    // assertion above pass by describing nothing.
    const asyncapi = transports.filter((t) => t.dialect?.key === 'asyncapi')
    expect(asyncapi.length).toBeGreaterThan(0)
    expect(transports.length - asyncapi.length).toBeGreaterThan(0)
  })

  it('goes red when a shipped document is broken, in either dialect', async () => {
    // The corpus test above passes if this harness quietly reads nothing at all
    // — a wrong `CATALOG` path, a dialect the adopter did not record. So one
    // real document of each dialect is broken here and has to complain.
    const transports = await shippedTransports()
    const mini = transports.find((t) => t.dialect?.key !== 'asyncapi')
    const wire = transports.find((t) => t.dialect?.key === 'asyncapi')
    expect(mini && wire).toBeTruthy()

    const brokenMini = { ...(mini?.data as Record<string, unknown>), 'not-a-transport-field': true }
    expect(codes(transportDiagnostics(brokenMini, { dialect: mini?.dialect, srn: mini?.srn }))).toEqual([
      'E_PROTO_TRANSPORT_SCHEMA',
    ])

    const brokenAsync = { ...(wire?.data as Record<string, unknown>), 'x-srn': 'srn://elsewhere/protocol/x' }
    expect(codes(transportDiagnostics(brokenAsync, { dialect: wire?.dialect, srn: wire?.srn }))).toEqual([
      'E_PROTO_TRANSPORT_ASYNCAPI',
    ])
  })
})
