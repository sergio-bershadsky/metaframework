import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import { type ConfigContracts, configContractDiagnostics, readConfigContracts } from './config-contract'
import { buildSchemaRegistry } from './registry'

/**
 * The contract side of the config lane — `usage: config` as
 * framework/spec/kinds/datamodel.md defines it.
 *
 * One fixture catalog carrying a deliberate violation per rule, plus the two
 * well-formed contracts the reading half is checked against: a component's own,
 * and the abstract mixin it inherits. The fixture is hermetic for the reason
 * every fixture in this suite is — the shipped catalog under `solutions/` is an
 * exemplar and a broken contract parked next to it would teach an author that
 * the broken thing is normal.
 */

let catalogDir: string
let catalog: Catalog
let diagnostics: Diagnostic[]
let contracts: ConfigContracts

const HOST = 'https://schemas.metaframework.dev'

async function entity(relDir: string, frontmatter: Record<string, unknown>) {
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
  await writeFile(path.join(dir, 'index.md'), `---\n${yaml}\n---\n\nProse.\n`)
}

async function artifact(relDir: string, file: string, contents: unknown) {
  await mkdir(path.join(catalogDir, relDir, path.dirname(file)), { recursive: true })
  await writeFile(path.join(catalogDir, relDir, file), JSON.stringify(contents, null, 2))
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
  }[kind] ?? {}),
  ...extra,
})

const contract = (srnPath: string, extra: Record<string, unknown>) => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${HOST}/${srnPath}`,
  'x-srn': `srn://${srnPath}`,
  title: 'Configuration',
  type: 'object',
  ...extra,
})

/** A `usage: config` datamodel plus its schema, in one call. */
async function configModel(relDir: string, name: string, document: Record<string, unknown>, abstract = false) {
  await entity(relDir, base(name, 'datamodel', { usage: 'config', ...(abstract ? { abstract: true } : {}) }))
  await artifact(relDir, 'schema.json', contract(relDir, document))
}

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-config-contract-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/product/shop', base('shop', 'product'))

  // The mixin every contract below shares: abstract, so the bucket cap ignores
  // it, and its `required` is nevertheless the deriver's obligation.
  await configModel(
    'acme/datamodel/otel-config',
    'otel-config',
    {
      properties: { OTEL_SERVICE_NAME: { type: 'string', minLength: 1 } },
      required: ['OTEL_SERVICE_NAME'],
    },
    true,
  )

  // --- well-formed: the reading half ---------------------------------------
  await entity('acme/product/shop/component/checkout', base('checkout', 'component'))
  await configModel('acme/product/shop/component/checkout/datamodel/config', 'config', {
    allOf: [{ $ref: `${HOST}/acme/datamodel/otel-config` }],
    properties: {
      LOG_LEVEL: { enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
      DATABASE_URL: { type: 'string', pattern: '^postgres(ql)?://', writeOnly: true },
      PAYMENT_TIMEOUT_MS: { type: 'integer', minimum: 1, default: 3000 },
      PORT: { type: 'integer', minimum: 1, maximum: 65535 },
      FEATURE_INSTANT_REFUNDS: { type: 'boolean' },
      NOTE: { description: 'Annotation only; constrains nothing.' },
    },
    required: ['LOG_LEVEL', 'DATABASE_URL', 'FEATURE_INSTANT_REFUNDS'],
  })

  // --- E_DM_CONFIG_SHAPE: the five rules -----------------------------------
  await entity('acme/product/shop/component/misshapen', base('misshapen', 'component'))
  await configModel('acme/product/shop/component/misshapen/datamodel/config', 'config', {
    type: 'array',
    properties: {
      'database-url': { type: 'string' },
      DATABASE: { type: 'object' },
      TOTAL: { $ref: `${HOST}/acme/datamodel/otel-config` },
      TAGS: { type: 'array', items: { type: 'string' } },
    },
  })

  // Two concrete contracts in one bucket: which one is this component's?
  await entity('acme/product/shop/component/ambiguous', base('ambiguous', 'component'))
  await configModel('acme/product/shop/component/ambiguous/datamodel/config', 'config', {
    properties: { PORT: { type: 'integer' } },
  })
  await configModel('acme/product/shop/component/ambiguous/datamodel/settings', 'settings', {
    properties: { HOST_NAME: { type: 'string' } },
  })

  // --- E_DM_CONFIG_SECRET_DEFAULT: both halves ------------------------------
  await entity('acme/product/shop/component/leaky', base('leaky', 'component'))
  await configModel('acme/product/shop/component/leaky/datamodel/config', 'config', {
    allOf: [{ $ref: `${HOST}/acme/datamodel/secret-mixin` }],
    properties: {
      API_TOKEN: { type: 'string', writeOnly: true, default: 'dev-token' },
      SIGNING_KEY: { type: 'string', writeOnly: true, enum: ['only-one'] },
    },
  })
  await artifact('acme/product/shop/component/leaky/datamodel/config', 'examples/local.json', {
    API_TOKEN: 'dev-token',
    INHERITED_SECRET: 'also-a-secret',
  })
  await configModel(
    'acme/datamodel/secret-mixin',
    'secret-mixin',
    { properties: { INHERITED_SECRET: { type: 'string', writeOnly: true } } },
    true,
  )

  catalog = await loadCatalog({ catalogDir })
  const registry = buildSchemaRegistry(catalog)
  diagnostics = configContractDiagnostics(catalog, registry)
  contracts = readConfigContracts(catalog, registry)
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

const about = (relDir: string, code: string) =>
  diagnostics.filter((diagnostic) => diagnostic.code === code && diagnostic.path.startsWith(relDir))

describe('readConfigContracts — the flattened, joinable view', () => {
  const checkout = () => contracts.get('srn://acme/product/shop/component/checkout')

  it('finds the one concrete contract in a component’s own bucket', () => {
    expect(checkout()?.srn).toBe('srn://acme/product/shop/component/checkout/datamodel/config')
  })

  it('carries the mixin’s keys, because the join reads the flattened contract', () => {
    expect(checkout()?.keys.has('OTEL_SERVICE_NAME')).toBe(true)
    expect(checkout()?.required.has('OTEL_SERVICE_NAME')).toBe(true)
  })

  it('computes must-provide as required minus every defaulted key', () => {
    // LOG_LEVEL is required *and* defaulted, so the process supplies its own;
    // FEATURE_INSTANT_REFUNDS is required with no default even though it is a
    // boolean, which is the case a "booleans always default" shortcut would miss.
    expect([...(checkout()?.mustProvide ?? [])].sort()).toEqual([
      'DATABASE_URL',
      'FEATURE_INSTANT_REFUNDS',
      'OTEL_SERVICE_NAME',
    ])
  })

  it('reads writeOnly as the secret marker', () => {
    expect([...(checkout()?.secret ?? [])]).toEqual(['DATABASE_URL'])
  })

  it('skips a bucket holding two concrete contracts rather than tossing a coin', () => {
    expect(contracts.has('srn://acme/product/shop/component/ambiguous')).toBe(false)
  })

  describe('accepts — the lexical coercion the format owes its history', () => {
    it('takes both spellings of an integer', () => {
      expect(checkout()?.accepts('PAYMENT_TIMEOUT_MS', 8000)).toBeNull()
      expect(checkout()?.accepts('PAYMENT_TIMEOUT_MS', '8000')).toBeNull()
    })

    it('takes both spellings of a boolean', () => {
      expect(checkout()?.accepts('FEATURE_INSTANT_REFUNDS', false)).toBeNull()
      expect(checkout()?.accepts('FEATURE_INSTANT_REFUNDS', 'false')).toBeNull()
    })

    it('refuses a truthiness reading — the coercion is lexical, never semantic', () => {
      expect(checkout()?.accepts('FEATURE_INSTANT_REFUNDS', '1')).not.toBeNull()
      expect(checkout()?.accepts('FEATURE_INSTANT_REFUNDS', 'yes')).not.toBeNull()
    })

    it('refuses a string with no reading in the declared type', () => {
      expect(checkout()?.accepts('PAYMENT_TIMEOUT_MS', 'soon')).not.toBeNull()
    })

    it('reports the bound a coerced value broke, not the type it was coerced from', () => {
      // The reason this is pinned to the exact sentence: `"70000"` fails twice
      // over — as a string it is not an integer, as the integer it plainly means
      // it is out of range — and only the second is the author's mistake. A
      // reader told "must be integer" about a value that looks like an integer
      // goes looking for a quoting bug that is not there.
      expect(checkout()?.accepts('PORT', '70000')).toBe('value must be <= 65535')
      expect(checkout()?.accepts('PORT', 70000)).toBe('value must be <= 65535')
      expect(checkout()?.accepts('PORT', '0')).toBe('value must be >= 1')
    })

    it('still reports the type when the value has no reading to fall back on', () => {
      // The other side of the same rule: here `type` is not a coercion artifact,
      // it is the whole finding.
      expect(checkout()?.accepts('PAYMENT_TIMEOUT_MS', 'soon')).toBe('value must be integer')
    })

    it('refuses a value outside an enum, and one failing a pattern', () => {
      expect(checkout()?.accepts('LOG_LEVEL', 'verbose')).not.toBeNull()
      expect(checkout()?.accepts('DATABASE_URL', 'mysql://db/x')).not.toBeNull()
    })

    it('enforces the mixin’s own constraints on the deriving contract', () => {
      expect(checkout()?.accepts('OTEL_SERVICE_NAME', '')).not.toBeNull()
      expect(checkout()?.accepts('OTEL_SERVICE_NAME', 'checkout')).toBeNull()
    })

    it('says nothing about a key the contract does not declare', () => {
      // That absence is W_ENV_CONFIG_UNDECLARED's finding, not this one's.
      expect(checkout()?.accepts('NOT_A_KEY', 'anything')).toBeNull()
    })
  })
})

describe('configContractDiagnostics — the discipline', () => {
  const misshapen = 'acme/product/shop/component/misshapen/datamodel/config'

  it('fires E_DM_CONFIG_SHAPE on a root that is not an object', () => {
    expect(about(misshapen, 'E_DM_CONFIG_SHAPE').some((d) => d.message.includes('root type'))).toBe(true)
  })

  it('fires E_DM_CONFIG_SHAPE on a property name that is not SCREAMING_SNAKE_CASE', () => {
    expect(about(misshapen, 'E_DM_CONFIG_SHAPE').some((d) => d.message.includes('"database-url"'))).toBe(true)
  })

  it('fires E_DM_CONFIG_SHAPE on a nested property', () => {
    const hits = about(misshapen, 'E_DM_CONFIG_SHAPE')
    expect(hits.some((d) => d.message.includes('"DATABASE"') && d.message.includes('"object"'))).toBe(true)
    expect(hits.some((d) => d.message.includes('"TAGS"') && d.message.includes('"array"'))).toBe(true)
  })

  it('fires E_DM_CONFIG_SHAPE on a $ref below the root', () => {
    expect(
      about(misshapen, 'E_DM_CONFIG_SHAPE').some((d) => d.message.includes('/properties/TOTAL')),
    ).toBe(true)
  })

  it('fires E_DM_CONFIG_SHAPE once per contract when a bucket holds two', () => {
    const hits = about('acme/product/shop/component/ambiguous', 'E_DM_CONFIG_SHAPE')
    expect(hits).toHaveLength(2)
    expect(hits[0].message).toContain('2 concrete config contracts')
  })

  it('leaves an annotation-only property alone', () => {
    // `NOTE` declares no type. It constrains nothing, joins by name like any
    // other key, and refusing it would be stricter than the document.
    expect(about('acme/product/shop/component/checkout', 'E_DM_CONFIG_SHAPE')).toEqual([])
  })

  it('counts abstract mixins out of the bucket cap', () => {
    // Two abstract config models sit in `acme/datamodel/`; neither is anybody's
    // contract, so the cap has nothing to say.
    expect(about('acme/datamodel/', 'E_DM_CONFIG_SHAPE')).toEqual([])
  })

  it('fires E_DM_CONFIG_SECRET_DEFAULT on a default under writeOnly', () => {
    expect(
      about('acme/product/shop/component/leaky/datamodel/config/schema.json', 'E_DM_CONFIG_SECRET_DEFAULT').some((d) =>
        d.message.includes('"API_TOKEN"'),
      ),
    ).toBe(true)
  })

  it('fires E_DM_CONFIG_SECRET_DEFAULT on a one-member enum under writeOnly', () => {
    expect(
      about('acme/product/shop/component/leaky/datamodel/config/schema.json', 'E_DM_CONFIG_SECRET_DEFAULT').some((d) =>
        d.message.includes('"SIGNING_KEY"'),
      ),
    ).toBe(true)
  })

  it('fires E_DM_CONFIG_SECRET_DEFAULT on an examples/ instance carrying a secret key', () => {
    const hits = about('acme/product/shop/component/leaky/datamodel/config/examples/', 'E_DM_CONFIG_SECRET_DEFAULT')
    expect(hits).toHaveLength(1)
    // Both halves: the key written in place, and the one the mixin marks — the
    // secret set is the flattened one, because a credential is a credential
    // whichever branch of the conjunction named it.
    expect(hits[0].message).toContain('"API_TOKEN"')
    expect(hits[0].message).toContain('"INHERITED_SECRET"')
  })

  it('says nothing about a well-formed contract', () => {
    expect(about('acme/product/shop/component/checkout', 'E_DM_CONFIG_SECRET_DEFAULT')).toEqual([])
  })
})
