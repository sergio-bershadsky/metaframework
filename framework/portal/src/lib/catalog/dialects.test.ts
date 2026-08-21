import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { metaSchemaUrl, schemaUrlToSrn } from '../schema/url'
import { ARTIFACT_ROLES } from '../srn/artifacts'
import { artifactDiagnostics } from './artifact-checks'
import { adoptDialect, canonicalDialect } from './dialects'
import { loadCatalog } from './load'
import type { Artifact, Catalog, Entity } from './types'

/**
 * ADR 0015 in two halves, because it makes two promises and they fail
 * differently.
 *
 * The first is the *warning*: a file that does not say which grammar it is
 * written in is read as the legacy dialect and reported, per role, in the two
 * message forms the record fixes.
 *
 * The second is the one nothing else in the suite would catch — **the header
 * cannot break a file that carries it.** The whole decision rests on the
 * discriminator never reaching a strict validator, and that is not a property of
 * any one module: it is a property of the loader stripping the key before the
 * validators run. So the second half loads a real catalog whose artifacts all
 * carry headers and asserts that no parser complained, that `data` lost the key
 * and `raw` kept it. A unit test on `adoptDialect` alone would pass while the
 * wiring was missing, which is exactly the shape of the hole
 * `artifact-checks.ts` was written to close for the mini-spec parsers.
 */

const artifactOf = (file: string, data: unknown): Artifact => ({
  file,
  extension: file.endsWith('.json') ? '.json' : '.yaml',
  data,
  raw: '',
})

/* ------------------------------------------------------------------ table */

describe('the discriminator table', () => {
  it('rules on every role the role table defines, and exempts exactly one', () => {
    // The module throws at import if a role reached `ARTIFACT_ROLES` without a
    // ruling, so this file loading at all is half the assertion. The other half
    // is that the *exemption* stays deliberate and singular: `examples/*.json`
    // is an instance of its sibling schema and has no dialect of its own.
    const exempt = ARTIFACT_ROLES.filter(
      (role) => canonicalDialect(role.kind, role.file.replace('<name>', 'placeholder')) === null,
    )
    expect(exempt.map((role) => `${role.kind}:${role.role}`)).toEqual(['datamodel:examples.<name>'])
  })

  it('points every framework-owned role at a meta-schema URL, and owns only those', () => {
    const owned = ARTIFACT_ROLES.map((role) => canonicalDialect(role.kind, role.file.replace('<name>', 'x')))
      .filter((dialect) => dialect?.owned)
      .map((dialect) => dialect?.value)

    expect(owned).toEqual([
      metaSchemaUrl('transport-document'),
      metaSchemaUrl('state-machine-document'),
      metaSchemaUrl('workflow-document'),
      metaSchemaUrl('journey-document'),
      metaSchemaUrl('topology-document'),
      metaSchemaUrl('config-document'),
    ])
  })

  it('leaves a native discriminator to its own format', () => {
    // `openapi:` and `schema.json`'s `$schema` are the format's, not ours. They
    // are recognised and never stripped — deleting `$schema` from a JSON Schema
    // document would take `E_DM_DIALECT`'s subject away from it.
    expect(canonicalDialect('protocol', 'openapi.yaml')).toMatchObject({ key: 'openapi', owned: false })
    expect(canonicalDialect('datamodel', 'schema.json')).toMatchObject({ key: '$schema', owned: false })
  })

  it('keeps the mini-spec first on the one role that carries two dialects', () => {
    // Order is the ruling, not a detail of the table
    // ([0017](srn://metaframework/adr/0017-transport-asyncapi)). The first row is
    // what a headerless file is told to add, and `in-process` and `grpc`
    // transports have no AsyncAPI expression at all — so the mini-spec is the
    // dialect every wire can use, and it stays the one a bare file is sent to.
    expect(canonicalDialect('protocol', 'transport.yaml')).toEqual({
      key: '$schema',
      value: metaSchemaUrl('transport-document'),
      owned: true,
    })
  })

  it('matches a name family without swallowing a nested path', () => {
    expect(canonicalDialect('protocol', 'workflows/place-order.yaml')).not.toBeNull()
    expect(canonicalDialect('protocol', 'workflows/nested/place-order.yaml')).toBeNull()
    expect(canonicalDialect('protocol', 'workflows/.yaml')).toBeNull()
  })

  it('knows no dialect for a role of another kind, or for a free-named file', () => {
    expect(canonicalDialect('journey', 'transport.yaml')).toBeNull()
    expect(canonicalDialect('protocol', 'notes.yaml')).toBeNull()
  })

  it('names a meta-schema entity that exists, for every role it owns', async () => {
    // ADR 0015's live consequence: six meta-schema entities are now named from
    // inside files across three catalogs, so they are a published contract and
    // not internal documentation. Renaming or deleting one breaks every artifact
    // pointing at it, and nothing else in the suite would notice — the URL is a
    // string until somebody dereferences it.
    const shipped = await loadCatalog({ catalogDir: path.resolve(process.cwd(), '../../solutions') })

    for (const role of ARTIFACT_ROLES) {
      const dialect = canonicalDialect(role.kind, role.file.replace('<name>', 'placeholder'))
      if (!dialect?.owned) continue
      const named = schemaUrlToSrn(dialect.value)
      expect(named, dialect.value).not.toBeNull()
      expect(shipped.entities.get(named as string)?.kind, dialect.value).toBe('datamodel')
    }
  })
})

/* --------------------------------------------------------------- warnings */

describe('adoptDialect — the legacy dialect is warned, never broken', () => {
  it('names the header to add when a file declares none', () => {
    const artifact = artifactOf('transport.yaml', { kind: 'kafka' })
    expect(adoptDialect('protocol', artifact)).toBe(
      'transport.yaml declares no dialect — read as the legacy dialect; add ' +
        `\`$schema: ${metaSchemaUrl('transport-document')}\``,
    )
    expect(artifact.dialect).toEqual({ role: 'transport', key: '$schema', declared: null, known: false })
  })

  it('names the role when a file declares a dialect nobody knows', () => {
    const artifact = artifactOf('transport.yaml', { $schema: 'https://example.com/foo', kind: 'kafka' })
    expect(adoptDialect('protocol', artifact)).toBe(
      'transport.yaml declares dialect "https://example.com/foo", which is not a known dialect of the ' +
        'transport role — read as the legacy dialect',
    )
    expect(artifact.dialect).toMatchObject({ declared: 'https://example.com/foo', known: false })
  })

  it('strips an unrecognised framework key too, so a warning never becomes an error', () => {
    // The key is the framework's on that role whatever it holds. Leaving a bad
    // value in `data` would hand the strict validator downstream an unknown key
    // and turn "warned, never broken" into a hard failure on the file the
    // warning was about.
    const artifact = artifactOf('transport.yaml', { $schema: 'nonsense', kind: 'kafka' })
    adoptDialect('protocol', artifact)
    expect(artifact.data).toEqual({ kind: 'kafka' })
  })

  it('says nothing about a file that declares its dialect correctly', () => {
    const artifact = artifactOf('journey.yaml', { $schema: metaSchemaUrl('journey-document'), name: 'walk' })
    expect(adoptDialect('journey', artifact)).toBeNull()
    expect(artifact.dialect).toMatchObject({ known: true })
    expect(artifact.data).toEqual({ name: 'walk' })
  })

  it('accepts any patch release of a native format that versions its documents', () => {
    expect(adoptDialect('protocol', artifactOf('openapi.yaml', { openapi: '3.1.0' }))).toBeNull()
    expect(adoptDialect('protocol', artifactOf('openapi.yaml', { openapi: '3.1.1' }))).toBeNull()
    expect(adoptDialect('protocol', artifactOf('openapi.yaml', { openapi: '3.0.3' }))).toContain('3.0.3')
  })

  it('never raises on examples/*.json — an instance has its schema’s dialect and none of its own', () => {
    const artifact = artifactOf('examples/basic.json', { amount: 1 })
    expect(adoptDialect('datamodel', artifact)).toBeNull()
    expect(artifact.dialect).toBeUndefined()
  })

  it('never raises on schema.json — E_DM_DIALECT already owns that fact, as an error', () => {
    const artifact = artifactOf('schema.json', { type: 'object' })
    expect(adoptDialect('datamodel', artifact)).toBeNull()
    // Recorded, though: the fact is true and the registry is the one that judges it.
    expect(artifact.dialect).toMatchObject({ role: 'schema', declared: null })
  })

  it('keeps a JSON Schema document’s own $schema, which is not ours to strip', () => {
    const dialect = 'https://json-schema.org/draft/2020-12/schema'
    const artifact = artifactOf('schema.json', { $schema: dialect, type: 'object' })
    expect(adoptDialect('datamodel', artifact)).toBeNull()
    expect(artifact.data).toEqual({ $schema: dialect, type: 'object' })
  })

  it('stays quiet about a file that did not parse into a mapping', () => {
    // It already carries the loader's complaint or its validator's; "and it
    // declares no dialect" is noise on a file nobody can act on yet.
    expect(adoptDialect('protocol', artifactOf('states.json', null))).toBeNull()
    expect(adoptDialect('datamodel', artifactOf('schema.json', []))).toBeNull()
  })
})

/* ------------------------------------------------- two dialects, one role */

/**
 * ADR 0017. `transport.yaml` is the only role reading two grammars at once, and
 * permanently — `in-process` and `grpc` have no AsyncAPI expression, so this is
 * not a migration window with an end. Every assertion here is about the seam:
 * which key is read, which key survives, and what a file saying both is taken to
 * mean.
 */
describe('the transport role — the mini-spec and AsyncAPI, live together', () => {
  it('reads AsyncAPI’s own key, and leaves it in the document it belongs to', () => {
    const document = { asyncapi: '3.1.0', 'x-srn': 'srn://acme/protocol/settlement', channels: {} }
    const artifact = artifactOf('transport.yaml', { ...document })
    expect(adoptDialect('protocol', artifact)).toBeNull()
    expect(artifact.dialect).toEqual({ role: 'transport', key: 'asyncapi', declared: '3.1.0', known: true })
    // `asyncapi` is REQUIRED by the format it belongs to. Stripping it would hand
    // every AsyncAPI tool downstream a document that is no longer one.
    expect(artifact.data).toEqual(document)
  })

  it('accepts the whole 3.x line, because AsyncAPI promises minor forward compatibility', () => {
    // Wider than the `openapi` row's `3.1.x`, on the two standards' own text.
    // AsyncAPI's version-string section says a minor increment "should not
    // interfere with operations of tooling developed to a lower minor version"
    // and that "the patch version will not be considered by tooling" — so a
    // correct 3.2.0 document warned here would be this reader reporting its own
    // narrowness as the file's fault.
    for (const version of ['3.0.0', '3.1.0', '3.1.7', '3.2.0']) {
      expect(adoptDialect('protocol', artifactOf('transport.yaml', { asyncapi: version })), version).toBeNull()
    }
    // 2.6 is a different grammar, not an older patch of this one: it had no root
    // `operations` and spelled direction `publish`/`subscribe` under a channel.
    expect(adoptDialect('protocol', artifactOf('transport.yaml', { asyncapi: '2.6.0' }))).toContain('2.6.0')
  })

  it('reads an unquoted `asyncapi: 3.1` for what YAML made of it', () => {
    // YAML turns `3.1` into a number and `3.1.0` into a string, because the
    // second dot makes it unparseable as one. AsyncAPI's field is the full
    // version string, so the float is one component short and is warned rather
    // than quietly promoted to 3.1.0.
    expect(adoptDialect('protocol', artifactOf('transport.yaml', { asyncapi: 3.1 }))).toContain('"3.1"')
  })

  it('never strips a native key, even when its value names no dialect this reader knows', () => {
    // The mirror of the `$schema` case above, and the opposite outcome. An
    // unrecognised *framework* key is deleted so a warning cannot become an
    // error; an unrecognised *foreign* key is kept, because it is not ours to
    // remove and the file is still that format's document.
    const artifact = artifactOf('transport.yaml', { asyncapi: '2.6.0', channels: {} })
    adoptDialect('protocol', artifact)
    expect(artifact.data).toEqual({ asyncapi: '2.6.0', channels: {} })
  })

  it('reads a file declaring both keys as the mini-spec, and leaves `asyncapi:` to its field table', () => {
    const artifact = artifactOf('transport.yaml', {
      $schema: metaSchemaUrl('transport-document'),
      asyncapi: '3.1.0',
      kind: 'kafka',
    })
    expect(adoptDialect('protocol', artifact)).toBeNull()
    expect(artifact.dialect).toMatchObject({ key: '$schema', known: true })
    // The resolution 0017 chose, and it needs no machinery: the first row wins,
    // so `$schema` is read and stripped; `asyncapi:` is foreign, so it survives
    // into `data` as an unknown non-`x-` top-level key that the mini-spec's own
    // field table rejects with `E_PROTO_TRANSPORT_SCHEMA`. That code still has no
    // emitter, so this assertion is currently the only thing standing between a
    // two-dialect file and silence.
    expect(artifact.data).toEqual({ asyncapi: '3.1.0', kind: 'kafka' })
  })
})

/* ------------------------------------------------------- the strip, wired */

let catalogDir: string
let catalog: Catalog

const META = {
  transport: metaSchemaUrl('transport-document'),
  states: metaSchemaUrl('state-machine-document'),
  workflow: metaSchemaUrl('workflow-document'),
  journey: metaSchemaUrl('journey-document'),
  topology: metaSchemaUrl('topology-document'),
  config: metaSchemaUrl('config-document'),
}

async function entity(root: string, relDir: string, frontmatter: Record<string, unknown>) {
  const dir = path.join(root, relDir)
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
  await writeFile(path.join(dir, 'index.md'), `---\n${yaml}\n---\n\nProse.\n`)
}

async function artifact(root: string, relDir: string, file: string, contents: string) {
  await mkdir(path.join(root, relDir, path.dirname(file)), { recursive: true })
  await writeFile(path.join(root, relDir, file), contents)
}

/** The spine every fixture in this file shares: a solution, a product, a protocol. */
async function spine(root: string) {
  await entity(root, 'acme', base('acme', 'solution', { vision: 'Sell things reliably.' }))
  await entity(root, 'acme/product/shop', base('shop', 'product', { lifecycle: 'active' }))
  for (const name of ['checkout', 'inventory']) {
    await entity(
      root,
      `acme/product/shop/component/${name}`,
      base(name, 'component', { 'component-type': 'service', lifecycle: 'released' }),
    )
  }
  await entity(
    root,
    'acme/product/shop/protocol/order-events',
    base('order-events', 'protocol', {
      style: 'point-to-point',
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'inventory', ref: '/product/shop/component/inventory' },
      ],
    }),
  )
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

const PROTOCOL = 'acme/product/shop/protocol/order-events'
const ASYNCAPI_PROTOCOL = 'acme/product/shop/protocol/order-shipping'

/**
 * A profile-correct AsyncAPI document, written the way `kinds/protocol.md`'s
 * worked example writes one: `x-srn` naming the entity, `info.title` mirroring
 * the frontmatter, `info.version` the fixed string (the frontmatter is the only
 * clock), one server on an admitted protocol, a templated `host` with no
 * `default` because a default is a deployment fact, and a non-empty `channels`.
 * No `operations`, because this spine records no direction and the profile makes
 * the block optional rather than have a fixture invent one. The channel carries
 * no `messages` map for the same reason — `x-srn-payload` must name a datamodel
 * that exists, and this fixture has none, so writing one would be a fixture
 * lying about the catalog it lives in.
 *
 * Nothing validates any of this yet. It is realistic so the reader that
 * eventually does has a file to be right about, and so that the assertions below
 * are about a real document rather than a two-line stub.
 */
const ASYNCAPI_TRANSPORT = `asyncapi: 3.1.0
x-srn: srn://${ASYNCAPI_PROTOCOL}
info:
  title: order-shipping
  version: unversioned
  description: Shipping facts published by checkout and consumed by inventory.
defaultContentType: application/json
servers:
  acme-shipping:
    host: "{host}"
    protocol: kafka-secure
    variables:
      host:
        description: Supplied by the environment; this protocol names no deployment.
    x-srn-auth: [sasl-scram]
channels:
  order-shipped:
    address: acme.shop.order-shipped.v1
    summary: Emitted once a paid order leaves the warehouse.
    bindings:
      kafka:
        partitions: 6
        bindingVersion: "0.5.0"
`

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-dialects-'))

  await spine(catalogDir)
  await entity(catalogDir, 'acme/actor/customer', base('customer', 'actor', { 'actor-type': 'human', goals: ['Buy.'] }))

  await artifact(catalogDir, PROTOCOL, 'transport.yaml', `$schema: ${META.transport}\nkind: kafka\n`)
  await artifact(
    catalogDir,
    PROTOCOL,
    'states.json',
    `${JSON.stringify(
      { $schema: META.states, id: 'order-events', initial: 'open', states: { open: { type: 'final' } } },
      null,
      2,
    )}\n`,
  )
  await artifact(
    catalogDir,
    PROTOCOL,
    'workflows/place-order.yaml',
    `$schema: ${META.workflow}\nname: place-order\ntitle: Place order\n` +
      'steps:\n  - message: place-order\n    from: checkout\n    to: checkout\n',
  )

  // The transport role's second dialect, on a protocol of its own — one
  // transport per protocol, so the two grammars cannot share an entity. This
  // file carries **no** `$schema`: the native key is the whole discriminator,
  // and proving that through the loader is the point. A unit test on
  // `adoptDialect` would pass while `readArtifacts` handed the document to
  // something that demanded a framework header.
  await entity(
    catalogDir,
    ASYNCAPI_PROTOCOL,
    base('order-shipping', 'protocol', {
      style: 'bus',
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'inventory', ref: '/product/shop/component/inventory' },
      ],
    }),
  )
  await artifact(catalogDir, ASYNCAPI_PROTOCOL, 'transport.yaml', ASYNCAPI_TRANSPORT)

  await entity(
    catalogDir,
    'acme/journey/first-purchase',
    base('first-purchase', 'journey', { actor: '/actor/customer' }),
  )
  await artifact(
    catalogDir,
    'acme/journey/first-purchase',
    'journey.yaml',
    `$schema: ${META.journey}\nname: first-purchase\nsteps:\n` +
      '  - actor: /actor/customer\n    touches: /product/shop/component/checkout\n' +
      '  - actor: /actor/customer\n    touches: /product/shop/component/checkout\n',
  )

  await entity(
    catalogDir,
    'acme/environment/production',
    base('production', 'environment', { 'environment-type': 'production' }),
  )
  await artifact(
    catalogDir,
    'acme/environment/production',
    'topology.yaml',
    `$schema: ${META.topology}\nregions: [eu-west-1]\n`,
  )
  await artifact(catalogDir, 'acme/environment/production', 'config.yaml', `$schema: ${META.config}\nconfig: []\n`)

  catalog = await loadCatalog({ catalogDir })
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

const artifactsOf = (srn: string): Artifact[] => (catalog.entities.get(srn) as Entity).artifacts

describe('the header, through the loader', () => {
  it('warns about nothing — every artifact says which grammar it is written in', () => {
    expect(catalog.diagnostics.filter((d) => d.code === 'W_ARTIFACT_DIALECT')).toEqual([])
  })

  it('loads the catalog clean, header and all', () => {
    expect(catalog.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  })

  it('never lets the discriminator reach a strict validator', () => {
    // The claim ADR 0015 rests on. `journey.ts` still rejects an unknown key
    // with `E_JRN_SCHEMA`, `workflow.ts` and `states.ts` are still
    // `strictObject`s — and none of them ever sees `$schema`, because the key is
    // gone by the time they run.
    expect(artifactDiagnostics(catalog)).toEqual([])
  })

  it('deletes a framework-owned key from the parse product and keeps the bytes', () => {
    for (const artifact of artifactsOf('srn://acme/product/shop/protocol/order-events')) {
      expect(artifact.data, artifact.file).not.toHaveProperty('$schema')
      expect(artifact.raw, artifact.file).toContain('$schema')
      expect(artifact.dialect, artifact.file).toMatchObject({ known: true })
    }
  })

  it('records the dialect it read, so a reader can ask what it is holding', () => {
    const states = artifactsOf('srn://acme/product/shop/protocol/order-events').find((a) => a.file === 'states.json')
    expect(states?.dialect).toEqual({ role: 'states', key: '$schema', declared: META.states, known: true })
  })
})

describe('the AsyncAPI dialect, through the loader', () => {
  const SRN = `srn://${ASYNCAPI_PROTOCOL}`
  const transportOf = (srn: string) => artifactsOf(srn).find((a) => a.file === 'transport.yaml')

  it('loads a transport.yaml carrying no framework header, and says nothing about it', () => {
    // The claim in one assertion: `asyncapi:` *is* the header. The two clean-load
    // assertions above already cover the whole catalog, and this file is in it —
    // but they would stay green if this entity had failed to produce an artifact
    // at all, so the dialect is read back explicitly.
    expect(transportOf(SRN)?.dialect).toEqual({
      role: 'transport',
      key: 'asyncapi',
      declared: '3.1.0',
      known: true,
    })
    expect(catalog.diagnostics.filter((d) => d.srn === SRN)).toEqual([])
  })

  it('keeps the native key in the parse product as well as in the bytes', () => {
    // The exact inverse of the mini-spec assertion above, which requires the key
    // to be *gone* from `data`. Both files are transport.yaml; only the ownership
    // of the key differs, and that difference is the whole of ADR 0015's rule.
    const transport = transportOf(SRN)
    expect(transport?.data).toMatchObject({ asyncapi: '3.1.0', 'x-srn': SRN })
    expect(transport?.raw).toContain('asyncapi: 3.1.0')
    expect(transport?.raw).not.toContain('$schema')
  })

  it('reaches every view the mini-spec dialect reaches', () => {
    // Measured before this row was added rather than assumed: **nothing in the
    // portal derives anything from `transport.yaml` in either dialect today.**
    // It is not in `artifact-checks.ts`'s dispatch table and not in
    // `entity-artifacts.tsx`'s, so its only readers are the source pane and the
    // /artifacts route, and both serve `raw`. The transport card, the message ×
    // datamodel matrix and workflow rule W9 are stated in kinds/protocol.md and
    // implemented nowhere — `W_PROTO_WF_CHANNEL_UNKNOWN` sits in the
    // diagnostic-coverage debt register saying exactly that.
    //
    // So "the derived views hold for both dialects" is, today, the claim that
    // the two files are indistinguishable to every consumer that exists: parsed
    // without error, bytes intact, dialect recorded, no diagnostic. When a reader
    // is written, this test is where it stops being true by default.
    const mini = transportOf('srn://acme/product/shop/protocol/order-events')
    const async = transportOf(SRN)

    for (const transport of [mini, async]) {
      expect(transport?.error).toBeUndefined()
      expect(transport?.extension).toBe('.yaml')
      expect(transport?.raw.length).toBeGreaterThan(0)
      expect(transport?.dialect?.known).toBe(true)
    }
    // The one consumer that dispatches on kind × filename judges neither, and
    // must judge them alike: a diagnostic on one dialect and not the other would
    // be the migration costing a protocol its clean bill of health.
    expect(artifactDiagnostics(catalog).filter((d) => d.path.endsWith('transport.yaml'))).toEqual([])
  })
})

describe('the same protocol without a header', () => {
  it('warns on the entity that owns the file, and still loads clean', async () => {
    const bare = await mkdtemp(path.join(tmpdir(), 'metaframework-legacy-'))
    try {
      await spine(bare)
      await artifact(bare, PROTOCOL, 'transport.yaml', 'kind: kafka\n')

      const legacy = await loadCatalog({ catalogDir: bare })
      expect(legacy.diagnostics.filter((d) => d.code === 'W_ARTIFACT_DIALECT')).toEqual([
        {
          code: 'W_ARTIFACT_DIALECT',
          severity: 'warning',
          message:
            'transport.yaml declares no dialect — read as the legacy dialect; add ' +
            `\`$schema: ${META.transport}\``,
          path: path.join(PROTOCOL, 'transport.yaml'),
          srn: 'srn://acme/product/shop/protocol/order-events',
        },
      ])
      // The contract in one assertion: nothing about a missing header is fatal.
      expect(legacy.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    } finally {
      await rm(bare, { recursive: true, force: true })
    }
  })
})
