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
