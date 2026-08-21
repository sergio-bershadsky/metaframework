import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import { configContractDiagnostics, readConfigContracts } from '../schema/config-contract'
import { buildSchemaRegistry } from '../schema/registry'
import { environmentDiagnostics, parseConfig, parseTopology } from './environment'

/**
 * Two suites, split exactly where the kind document splits its rules.
 *
 * The first drives the pure parsers with literal documents — every content-model
 * rule is decidable from the file alone, so a fixture on disk would only add
 * latency and indirection. The second builds a hermetic temp catalog, because
 * the joins are the point of this lane and none of them is answerable without a
 * second entity: `W_ENV_HOST_UNDECLARED` needs the component's own edges, and
 * `W_ENV_CONFIG_MISSING` needs a datamodel in another container's bucket, read
 * through the schema registry.
 */

const codes = (issues: Array<{ code: string }>) => issues.map((issue) => issue.code)

/* ------------------------------------------------------------ topology.yaml */

describe('parseTopology — the content model', () => {
  const minimal = { hosts: [{ component: '/product/shop/component/checkout' }] }

  it('accepts the kind document’s worked example', () => {
    const { topology, issues } = parseTopology({
      regions: [
        { name: 'eu-west-1', zones: ['a', 'b', 'c'], notes: 'primary; the write side lives here' },
        { name: 'us-east-1', zones: ['a', 'b'] },
      ],
      hosts: [
        {
          component: '/product/shop/component/checkout',
          regions: ['eu-west-1', 'us-east-1'],
          replicas: { min: 3, max: 24 },
          scaling: 'horizontal on p95 request latency above 200ms',
          notes: 'stateless; sticky sessions disabled',
        },
        { component: '/product/shop/component/inventory', regions: ['eu-west-1'] },
      ],
    })
    expect(issues).toEqual([])
    expect(topology?.hosts).toHaveLength(2)
    expect(topology?.regions.map((region) => region.name)).toEqual(['eu-west-1', 'us-east-1'])
  })

  it('fires E_ENV_TOPOLOGY_SCHEMA when hosts is absent', () => {
    // `hosts` is the one required key: a topology with no placement in it makes
    // no claim, and an empty file is better spelled by having no file.
    expect(codes(parseTopology({ regions: [{ name: 'eu-west-1' }] }).issues)).toEqual(['E_ENV_TOPOLOGY_SCHEMA'])
  })

  it('fires E_ENV_TOPOLOGY_SCHEMA on an unknown top-level key', () => {
    const { issues } = parseTopology({ ...minimal, tier: 'gold' })
    expect(codes(issues)).toEqual(['E_ENV_TOPOLOGY_SCHEMA'])
    expect(issues[0].message).toContain('x-')
  })

  it('fires E_ENV_TOPOLOGY_SCHEMA on an unknown host key', () => {
    const { issues } = parseTopology({ hosts: [{ component: '/product/shop/component/checkout', tier: 'gold' }] })
    expect(codes(issues)).toEqual(['E_ENV_TOPOLOGY_SCHEMA'])
    expect(issues[0].path).toBe('hosts[0].tier')
  })

  it('fires E_ENV_TOPOLOGY_SCHEMA when min exceeds max', () => {
    const { issues } = parseTopology({
      hosts: [{ component: '/product/shop/component/checkout', replicas: { min: 5, max: 2 } }],
    })
    expect(codes(issues)).toEqual(['E_ENV_TOPOLOGY_SCHEMA'])
    expect(issues[0].message).toContain('5')
    expect(issues[0].message).toContain('2')
  })

  it('accepts a fixed count as the degenerate range', () => {
    expect(
      parseTopology({ hosts: [{ component: '/product/shop/component/checkout', replicas: { min: 2, max: 2 } }] }).issues,
    ).toEqual([])
  })

  it('fires E_ENV_REGION_UNKNOWN on a region no regions list declares', () => {
    const { issues } = parseTopology({
      regions: [{ name: 'eu-west-1' }],
      hosts: [{ component: '/product/shop/component/checkout', regions: ['ap-south-1'] }],
    })
    expect(codes(issues)).toEqual(['E_ENV_REGION_UNKNOWN'])
  })

  it('reads an absent regions key as "not recorded", never as everywhere', () => {
    // The distinction the spec draws in the host table: no regions key is the
    // absence of a claim, so there is nothing to check it against.
    expect(parseTopology(minimal).issues).toEqual([])
  })

  it('admits x- keys at every level, and $schema only at the root', () => {
    expect(
      parseTopology({
        $schema: 'https://schemas.metaframework.dev/metaframework/product/specification/datamodel/topology-document',
        'x-owner': 'platform',
        hosts: [{ component: '/product/shop/component/checkout', 'x-tier': 'gold' }],
      }).issues,
    ).toEqual([])

    const nested = parseTopology({
      hosts: [{ component: '/product/shop/component/checkout', $schema: 'https://example.test/x' }],
    })
    expect(codes(nested.issues)).toEqual(['E_ENV_TOPOLOGY_SCHEMA'])
  })

  it('keeps parsing after a bad host — loading is fail-soft', () => {
    const { topology, issues } = parseTopology({
      hosts: [{ regions: [] }, { component: '/product/shop/component/checkout' }],
    })
    expect(codes(issues)).toEqual(['E_ENV_TOPOLOGY_SCHEMA'])
    expect(topology?.hosts).toHaveLength(1)
  })
})

/* -------------------------------------------------------------- config.yaml */

describe('parseConfig — the content model', () => {
  it('accepts the kind document’s worked example', () => {
    const { entries, issues } = parseConfig({
      config: [
        { key: 'LOG_LEVEL', value: 'warn', description: 'Root log level for every hosted component.' },
        {
          key: 'DATABASE_URL',
          for: '/product/shop/component/checkout',
          secret: true,
          source: 'vault:kv/acme/production/checkout#database-url',
        },
        { key: 'PAYMENT_TIMEOUT_MS', for: '/product/shop/component/checkout', value: 8000 },
        { key: 'FEATURE_INSTANT_REFUNDS', for: '/product/shop/component/checkout', value: 'false' },
      ],
    })
    expect(issues).toEqual([])
    expect(entries).toHaveLength(4)
    expect(entries?.[0].secret).toBe(false)
  })

  it('fires E_ENV_CONFIG_SCHEMA on kebab-case casing', () => {
    const { issues } = parseConfig({ config: [{ key: 'database-url' }] })
    expect(codes(issues)).toEqual(['E_ENV_CONFIG_SCHEMA'])
  })

  it('fires E_ENV_CONFIG_SCHEMA on a duplicate (key, for) pair', () => {
    const { issues } = parseConfig({
      config: [
        { key: 'PORT', for: '/product/shop/component/checkout' },
        { key: 'PORT', for: '/product/shop/component/checkout' },
      ],
    })
    expect(codes(issues)).toEqual(['E_ENV_CONFIG_SCHEMA'])
  })

  it('admits one key twice when the scopes differ', () => {
    // The pair is the identity: the same key legitimately appears once
    // environment-wide and once narrowed to a component.
    expect(
      parseConfig({ config: [{ key: 'PORT' }, { key: 'PORT', for: '/product/shop/component/checkout' }] }).issues,
    ).toEqual([])
  })

  it('fires E_ENV_CONFIG_SCHEMA on a list value', () => {
    const { issues } = parseConfig({ config: [{ key: 'ALLOWED_ORIGINS', value: ['a.example', 'b.example'] }] })
    expect(codes(issues)).toEqual(['E_ENV_CONFIG_SCHEMA'])
  })

  it('fires E_ENV_CONFIG_SCHEMA on a secret with no source', () => {
    const { issues } = parseConfig({ config: [{ key: 'API_TOKEN', secret: true }] })
    expect(codes(issues)).toEqual(['E_ENV_CONFIG_SCHEMA'])
  })

  it('fires E_ENV_SECRET_VALUE on a secret carrying a value', () => {
    const { issues } = parseConfig({
      config: [{ key: 'DATABASE_PASSWORD', secret: true, source: 'vault:kv/x#y', value: 'hunter2' }],
    })
    expect(codes(issues)).toEqual(['E_ENV_SECRET_VALUE'])
  })

  it('accepts a native scalar as well as the quoted spelling', () => {
    // The widening ADR 0015 calls additive: `"8000"` and `8000` are the same
    // dialect at a later version of its meta-schema.
    expect(parseConfig({ config: [{ key: 'PORT', value: 8000 }, { key: 'DEBUG', value: false }] }).issues).toEqual([])
  })

  it('fires E_ENV_CONFIG_SCHEMA on a description that is not one line', () => {
    expect(codes(parseConfig({ config: [{ key: 'PORT', description: 'one\ntwo' }] }).issues)).toEqual([
      'E_ENV_CONFIG_SCHEMA',
    ])
  })
})

/* -------------------------------------------------------------------- joins */

let catalogDir: string
let catalog: Catalog
let diagnostics: Diagnostic[]

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
    environment: { 'environment-type': 'production' },
  }[kind] ?? {}),
  ...extra,
})

const HOST = 'https://schemas.metaframework.dev'

const contract = (srnPath: string, extra: Record<string, unknown>) => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: `${HOST}/${srnPath}`,
  'x-srn': `srn://${srnPath}`,
  title: 'Configuration',
  type: 'object',
  ...extra,
})

/** `/acme/environment/production` is the only environment; only checkout runs there. */
beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-environment-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/actor/customer', base('customer', 'actor', { 'actor-type': 'human', goals: ['Buy.'] }))
  await entity('acme/environment/production', base('production', 'environment'))
  await entity('acme/product/shop', base('shop', 'product'))

  // checkout runs in production and publishes a contract with one defaulted
  // required key, one required-no-default key, and one secret.
  await entity(
    'acme/product/shop/component/checkout',
    base('checkout', 'component', { relations: { uses: ['/environment/production'] } }),
  )
  await entity('acme/product/shop/component/checkout/datamodel/config', base('config', 'datamodel', { usage: 'config' }))
  await artifact('acme/product/shop/component/checkout/datamodel/config', 'schema.json', {
    ...contract('acme/product/shop/component/checkout/datamodel/config', {
      allOf: [{ $ref: `${HOST}/acme/datamodel/otel-config` }],
      properties: {
        LOG_LEVEL: { enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
        DATABASE_URL: { type: 'string', writeOnly: true },
        PAYMENT_TIMEOUT_MS: { type: 'integer', minimum: 1, default: 3000 },
        FEATURE_INSTANT_REFUNDS: { type: 'boolean', default: false },
      },
      required: ['LOG_LEVEL', 'DATABASE_URL'],
    }),
  })

  // The shared surface, abstract, in a bucket of its own: its required key is
  // the deriving component's obligation too.
  await entity('acme/datamodel/otel-config', base('otel-config', 'datamodel', { usage: 'config', abstract: true }))
  await artifact('acme/datamodel/otel-config', 'schema.json', {
    ...contract('acme/datamodel/otel-config', {
      properties: { OTEL_SERVICE_NAME: { type: 'string', minLength: 1 } },
      required: ['OTEL_SERVICE_NAME'],
    }),
  })

  // inventory runs nowhere, so a config entry scoped to it is dead.
  await entity('acme/product/shop/component/inventory', base('inventory', 'component'))

  await writeFile(
    path.join(catalogDir, 'acme/environment/production/topology.yaml'),
    [
      'hosts:',
      '  - component: /product/shop/component/checkout',
      '  - component: /product/shop/component/inventory',
      '  - component: /actor/customer',
      '',
    ].join('\n'),
  )
  await writeFile(
    path.join(catalogDir, 'acme/environment/production/config.yaml'),
    [
      'config:',
      '  - key: LOG_LEVEL',
      '    value: verbose',
      '  - key: PAYMENT_TIMEOUT_MS',
      '    for: /product/shop/component/checkout',
      '    secret: true',
      '    source: vault:kv/acme/production/checkout#timeout',
      '  - key: DATABASE_URI',
      '    for: /product/shop/component/checkout',
      '  - key: WAREHOUSE_API_URL',
      '    for: /product/shop/component/inventory',
      '  - key: OTEL_SERVICE_NAME',
      '    for: /product/shop/component/ghost',
      '',
    ].join('\n'),
  )

  catalog = await loadCatalog({ catalogDir })
  const registry = buildSchemaRegistry(catalog)
  diagnostics = [
    ...configContractDiagnostics(catalog, registry),
    ...environmentDiagnostics(catalog, readConfigContracts(catalog, registry)),
  ]
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

const found = (code: string) => diagnostics.filter((diagnostic) => diagnostic.code === code)

describe('environmentDiagnostics — rules that need the resolved catalog', () => {
  it('fires E_ENV_TARGET_KIND on a host entry naming something that is not deployable', () => {
    expect(found('E_ENV_TARGET_KIND').map((diagnostic) => diagnostic.message)).toEqual([
      expect.stringContaining('whose kind is "actor"'),
    ])
  })

  it('fires W_ENV_HOST_UNDECLARED on a component that never says it runs here', () => {
    const hits = found('W_ENV_HOST_UNDECLARED')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('component/inventory')
    expect(hits[0].path).toBe('acme/environment/production/topology.yaml')
  })

  it('fires W_ENV_CONFIG_ORPHAN on a key scoped to a component that does not run here', () => {
    const hits = found('W_ENV_CONFIG_ORPHAN')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('WAREHOUSE_API_URL')
  })

  it('fires E_ENV_CONFIG_VALUE on a value the contract’s subschema refuses', () => {
    const hits = found('E_ENV_CONFIG_VALUE')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('LOG_LEVEL')
    // The environment-wide entry resolved to checkout's contract because that
    // is the one hosted contract declaring the key — the last row of the
    // resolution table, and the only thing that makes such an entry checkable.
    expect(hits[0].message).toContain('checkout/datamodel/config')
  })

  it('fires E_ENV_SECRET_MISMATCH when the entry claims a secret the contract does not', () => {
    const hits = found('E_ENV_SECRET_MISMATCH')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('PAYMENT_TIMEOUT_MS')
  })

  it('fires W_ENV_CONFIG_UNDECLARED on a for:-scoped key the contract does not know', () => {
    const hits = found('W_ENV_CONFIG_UNDECLARED')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toContain('DATABASE_URI')
  })

  it('fires W_ENV_CONFIG_MISSING for every must-provide key nothing declares', () => {
    const hits = found('W_ENV_CONFIG_MISSING')
    expect(hits).toHaveLength(1)
    // DATABASE_URL is required with no default; OTEL_SERVICE_NAME is required by
    // the abstract mixin, and the join reads the flattened contract, so it is
    // checkout's obligation too. LOG_LEVEL is required *and* defaulted, so it is
    // not in the set — omitting it is the normal case.
    expect(hits[0].message).toContain('"DATABASE_URL"')
    expect(hits[0].message).toContain('"OTEL_SERVICE_NAME"')
    expect(hits[0].message).not.toContain('LOG_LEVEL')
  })

  it('does not let a for: that resolves to nothing satisfy a must-provide key', () => {
    // `OTEL_SERVICE_NAME` is declared here — scoped to a component that does not
    // exist. An entry that covers nothing must not read as environment-wide, or
    // a typo would silence the one rule whose value is noticing an absence.
    expect(found('E_SRN_DANGLING').map((diagnostic) => diagnostic.message)).toEqual([
      expect.stringContaining('component/ghost'),
    ])
    expect(found('W_ENV_CONFIG_MISSING')[0].message).toContain('"OTEL_SERVICE_NAME"')
  })

  it('says nothing about a component that publishes no contract', () => {
    // inventory has no contract, so none of the four join codes may name it.
    const about = diagnostics.filter(
      (diagnostic) =>
        diagnostic.message.includes('component/inventory') &&
        ['E_ENV_CONFIG_VALUE', 'E_ENV_SECRET_MISMATCH', 'W_ENV_CONFIG_MISSING', 'W_ENV_CONFIG_UNDECLARED'].includes(
          diagnostic.code,
        ),
    )
    expect(about).toEqual([])
  })

  it('reports an artifact that will not parse, rather than skipping it', async () => {
    // ENV4 and ENV5 read "parses **and** matches the schema". The loader keeps
    // the parser's message and raises nothing, so before this branch existed a
    // duplicate key made a file invisible to every check in the portal.
    const dir = await mkdtemp(path.join(tmpdir(), 'metaframework-unparseable-'))
    try {
      await mkdir(path.join(dir, 'acme/environment/production'), { recursive: true })
      await writeFile(
        path.join(dir, 'acme/index.md'),
        '---\nname: acme\nkind: solution\nversion: 1\ntitle: acme\nsummary: A solution.\nstatus: approved\nvision: Sell things.\n---\n\nProse.\n',
      )
      await writeFile(
        path.join(dir, 'acme/environment/production/index.md'),
        '---\nname: production\nkind: environment\nversion: 1\ntitle: production\nsummary: An environment.\nstatus: approved\nenvironment-type: production\n---\n\nProse.\n',
      )
      await writeFile(path.join(dir, 'acme/environment/production/config.yaml'), 'config:\n  - key: A\n    key: B\n')

      const broken = await loadCatalog({ catalogDir: dir })
      const issues = environmentDiagnostics(broken, readConfigContracts(broken, buildSchemaRegistry(broken)))
      expect(issues.map((issue) => issue.code)).toEqual(['E_ENV_CONFIG_SCHEMA'])
      expect(issues[0].message).toContain('does not parse')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('paths every finding at the file a reader can open', () => {
    for (const diagnostic of diagnostics) {
      expect(diagnostic.path).toMatch(/\.(yaml|json|md)$/)
      expect(diagnostic.srn).toBeDefined()
    }
  })
})
