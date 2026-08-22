import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Entity } from '../catalog/types'
import { exportStructurizr, identifierFor, instancesLiteral } from './structurizr'
import type { ExportNote, StructurizrExport } from './structurizr'

/**
 * The ADR 0016 prototype, driven by the seven `topology.yaml` files that exist.
 *
 * The point of this suite is not that a string comes out. It is that the string
 * is **grammatical Structurizr** and that the two claims 0016 rests its
 * Structurizr entry on survive the trip: `instances` keeps a range (criterion c),
 * and the environment stays the subject (criterion a). Both are asserted against
 * shipped content rather than a fixture, because a mapping that only works on
 * the example a mapper was written against has proved nothing.
 *
 * There is no reference implementation to run — `structurizr-cli` is a Java
 * program and this repository has no JVM — so {@link check} is a transcription
 * of the parts of the real parser that decide whether a file loads:
 * `Tokenizer.tokenize`, `Tokens.get`, `DeploymentNodeParser`'s arity,
 * `DeploymentNode.setInstances` and `IdentifiersRegister.IDENTIFIER_PATTERN`,
 * all read from `structurizr/structurizr` at v2026.06.28. That is weaker than
 * executing the parser and stronger than eyeballing the output, and the
 * difference is worth stating rather than papering over.
 */

/* ------------------------------------------------------- a partial parser */

/** `Tokenizer.tokenize`, transcribed. Returns null for an unterminated quote. */
function tokenize(line: string): string[] | null {
  const tokens: string[] = []
  const source = line.trim()
  let started = false
  let quoted = false
  let token = ''

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i]
    if (!started) {
      if (c === '"') {
        quoted = true
        started = true
        token = ''
      } else if (!/\s/.test(c)) {
        quoted = false
        started = true
        token = c
      }
      continue
    }
    if (c === '"' && source[i - 1] === '\\') token += c
    else if (quoted && c === '"') {
      tokens.push(token)
      started = false
      quoted = false
    } else if (!quoted && /\s/.test(c)) {
      tokens.push(token)
      started = false
      quoted = false
    } else token += c
  }

  if (started && quoted) return null
  if (started) tokens.push(token)
  return tokens
}

/** `Tokens.get`, transcribed: the only two unescapes the reader performs. */
const unescape = (token: string) => token.replace(/\\"/g, '"').replace(/\\n/g, '\n')

/** `DeploymentNode.setInstances`, transcribed. */
function instancesAccepted(value: string): boolean {
  if (/^\d+$/.test(value)) return Number(value) >= 1
  const range = value.match(/^(\d+)\.\.(\d+)$/)
  if (range) return Number(range[1]) <= Number(range[2])
  return /^\d*\.\.(N|\*)$/.test(value)
}

const IDENTIFIER = /^\w[a-zA-Z0-9_-]*$/
const VIEW_KEY = /^[a-zA-Z0-9_-]+$/

/** Arity limits from the parsers, keyed by keyword: max tokens on the line. */
const ARITY: Record<string, number> = {
  workspace: 3,
  softwareSystem: 4,
  container: 5,
  deploymentEnvironment: 2,
  deploymentNode: 6,
  containerInstance: 4,
  softwareSystemInstance: 4,
  instances: 2,
  deployment: 5,
}

interface Check {
  problems: string[]
  /** Identifiers declared by `id = keyword …`, in declaration order. */
  declared: string[]
  /** Every `instances` value seen. */
  instances: string[]
}

function check(dsl: string): Check {
  const problems: string[] = []
  const declared: string[] = []
  const instances: string[] = []
  const referenced: Array<{ id: string; line: number }> = []
  let depth = 0

  dsl.split('\n').forEach((raw, index) => {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) return
    if (line === '}') {
      depth -= 1
      if (depth < 0) problems.push(`line ${index + 1}: closes a block that was never opened`)
      return
    }

    let tokens = tokenize(line)
    if (tokens === null) {
      problems.push(`line ${index + 1}: unterminated quoted token — ${line}`)
      return
    }

    const opens = tokens[tokens.length - 1] === '{'
    if (opens) tokens = tokens.slice(0, -1)

    if (tokens.length >= 2 && tokens[1] === '=') {
      const id = tokens[0]
      if (!IDENTIFIER.test(id)) problems.push(`line ${index + 1}: illegal identifier "${id}"`)
      if (declared.some((seen) => seen.toLowerCase() === id.toLowerCase())) {
        problems.push(`line ${index + 1}: identifier "${id}" is already registered`)
      }
      declared.push(id)
      tokens = tokens.slice(2)
    }

    const keyword = tokens[0]
    const limit = ARITY[keyword]
    if (limit !== undefined && tokens.length > limit) {
      problems.push(`line ${index + 1}: ${keyword} takes at most ${limit - 1} arguments, got ${tokens.length - 1}`)
    }

    if (keyword === 'instances') {
      const value = unescape(tokens[1] ?? '')
      instances.push(value)
      if (!instancesAccepted(value)) problems.push(`line ${index + 1}: setInstances rejects "${value}"`)
    }
    if (keyword === 'containerInstance' || keyword === 'softwareSystemInstance') {
      referenced.push({ id: tokens[1] ?? '', line: index + 1 })
    }
    if (keyword === 'deployment' && tokens[3] !== undefined && !VIEW_KEY.test(tokens[3])) {
      problems.push(`line ${index + 1}: illegal view key "${tokens[3]}"`)
    }
    if (keyword === 'properties' && !opens) problems.push(`line ${index + 1}: properties must open a block`)

    if (opens) depth += 1
  })

  if (depth !== 0) problems.push(`${depth} block(s) left open`)
  // Forward referencing is not supported, so a reference must already be declared.
  for (const { id, line } of referenced) {
    if (!declared.some((seen) => seen.toLowerCase() === id.toLowerCase())) {
      problems.push(`line ${line}: instance references undeclared identifier "${id}"`)
    }
  }

  return { problems, declared, instances }
}

/* --------------------------------------------------------- the real files */

const CATALOG = path.resolve(process.cwd(), '../../solutions')

let catalog: Catalog
let environments: Entity[]
const exports_ = new Map<string, StructurizrExport>()

const codes = (result: StructurizrExport) => result.notes.map((note: ExportNote) => note.code)

beforeAll(async () => {
  catalog = await loadCatalog({ catalogDir: CATALOG })
  environments = [...catalog.entities.values()]
    .filter((entity) => entity.kind === 'environment')
    .sort((a, b) => a.srn.localeCompare(b.srn))
  for (const environment of environments) exports_.set(environment.srn, exportStructurizr(catalog, environment))
})

describe('exportStructurizr over the shipped catalog', () => {
  it('finds exactly the environments that carry a topology.yaml', () => {
    // Derived, not listed: a snapshot of SRNs breaks the moment a solution is
    // added, which is the drift ADR 0018 is about — and it was breaking here.
    // The claim worth testing is the correspondence, so compute both sides.
    const withTopology = environments
      .filter((environment) => environment.artifacts.some((artifact) => artifact.file === 'topology.yaml'))
      .map((environment) => environment.srn)
    const exported = environments
      .filter((environment) => Boolean(exports_.get(environment.srn)?.dsl))
      .map((environment) => environment.srn)

    expect(exported).toEqual(withTopology)
    expect(withTopology.length).toBeGreaterThan(0)
    for (const environment of environments) {
      const hasTopology = withTopology.includes(environment.srn)
      expect(Boolean(exports_.get(environment.srn)?.dsl), environment.srn).toBe(hasTopology)
    }
  })

  it('exports every one of them, dropping no host entry', () => {
    for (const environment of environments) {
      const result = exports_.get(environment.srn) as StructurizrExport
      const hasTopology = environment.artifacts.some((artifact) => artifact.file === 'topology.yaml')
      if (!hasTopology) {
        expect(result.dsl).toBeNull()
        continue
      }
      expect(result.dsl, environment.srn).not.toBeNull()
      // Nothing in a clean catalog should fail to map. The only `dropped` note a
      // spec-clean file may carry is the comments one, which is a property of
      // YAML and not of anything the author did.
      expect(
        result.notes.filter((note) => note.severity === 'dropped' && note.code !== 'COMMENTS_DROPPED'),
        environment.srn,
      ).toEqual([])
      expect(result.stats.hostsExported, environment.srn).toBe(result.stats.hosts)
    }
  })

  it('accounts for every host entry and every replica range in the sources', () => {
    // Differential rather than snapshot: read the topology.yaml files by a
    // second path and require the exporter's tally to agree. Hardcoding the
    // totals made this test a record of how many environments existed on the
    // day it was written.
    let hosts = 0
    const ranges: string[] = []
    for (const environment of environments) {
      const topology = environment.artifacts.find((artifact) => artifact.file === 'topology.yaml')
      const data = topology?.data as { hosts?: { replicas?: { min?: number; max?: number } }[] } | undefined
      for (const host of data?.hosts ?? []) {
        hosts += 1
        const { min, max } = host.replicas ?? {}
        if (typeof min === 'number' && typeof max === 'number' && min !== max) ranges.push(`${min}..${max}`)
      }
    }

    const totals = [...exports_.values()].reduce((sum, result) => sum + result.stats.hosts, 0)
    expect(totals).toBe(hosts)
    expect(hosts).toBeGreaterThan(0)

    // A range may be emitted more than once — a host naming two regions becomes
    // two deployment nodes — so every source range must appear, and every
    // emitted range must trace back to one.
    const emitted = [...exports_.values()].flatMap((result) =>
      check(result.dsl ?? '').instances.filter((value) => value.includes('..')),
    )
    expect(ranges.length).toBeGreaterThan(0)
    expect(new Set(emitted)).toEqual(new Set(ranges))
    expect(emitted.length).toBeGreaterThanOrEqual(ranges.length)
  })

  it('produces DSL the published grammar accepts', () => {
    for (const environment of environments) {
      const dsl = exports_.get(environment.srn)?.dsl
      if (!dsl) continue
      expect(check(dsl).problems, environment.srn).toEqual([])
    }
  })

  it('keeps a replica range a range — criterion (c), and the only candidate that met it', () => {
    const dsl = exports_.get('srn://acme/environment/production')?.dsl as string
    // The exact claim Compose could not carry: "between 3 and 24", not "3".
    expect(dsl).toContain('instances "3..24"')
    expect(dsl).toContain('"metaframework.replicas.min" "3"')
    expect(dsl).toContain('"metaframework.replicas.max" "24"')
    // And a closed range stays distinguishable from a range, because the source
    // spells a fixed count as { min: n, max: n } and nothing else.
    const staging = exports_.get('srn://acme/environment/staging')?.dsl as string
    expect(staging).toContain('instances "1..2"')
    expect(staging).toContain('instances "2"')
  })

  it('makes the environment the subject — criterion (a)', () => {
    for (const environment of environments) {
      const dsl = exports_.get(environment.srn)?.dsl
      if (!dsl) continue
      expect(dsl, environment.srn).toContain(`deploymentEnvironment "${environment.frontmatter.title}"`)
      expect(dsl, environment.srn).toContain(`"metaframework.srn" "${environment.srn}"`)
    }
  })

  it('maps a product host entry to a software system instance and a component to a container instance', () => {
    const staging = exports_.get('srn://acme/environment/staging')?.dsl as string
    expect(staging).toContain('softwareSystemInstance acme_product_shop')
    expect(staging).toContain('containerInstance acme_product_shop_component_checkout')

    const local = exports_.get('srn://metaframework/environment/local')?.dsl as string
    expect(local).toContain('softwareSystemInstance metaframework_product_portal')
    expect(local).not.toContain('containerInstance')
  })

  it('carries the SRN of every element, which is the only join back to the catalog', () => {
    const dsl = exports_.get('srn://acme/environment/production')?.dsl as string
    for (const srn of [
      'srn://acme/product/shop',
      'srn://acme/product/shop/component/checkout',
      'srn://acme/product/shop/component/checkout/component/payment',
      'srn://acme/product/billing/component/ledger',
    ]) {
      expect(dsl).toContain(`"metaframework.srn" "${srn}"`)
    }
  })

  it('keeps every notes and scaling string, escaped rather than truncated', () => {
    // brass/local is the extreme case: four block scalars, five lines each.
    const dsl = exports_.get('srn://brass/environment/local')?.dsl as string
    expect(dsl).toContain('\\n')
    // The reader unescapes \n, so the multi-line note comes back whole.
    const line = dsl.split('\n').find((candidate) => candidate.includes('tsx watch on packages/server')) as string
    const tokens = tokenize(line) as string[]
    expect(tokens).not.toBeNull()
    expect(unescape(tokens[2])).toContain('\n')
    expect(unescape(tokens[2])).toContain('Playwright starts the same')

    const scaling = dsl.split('\n').filter((candidate) => candidate.includes('metaframework.scaling'))
    expect(scaling).toHaveLength(4)
    expect(scaling.some((candidate) => candidate.includes('playwright.config.ts pins workers to 1'))).toBe(true)
  })
})

/* ---------------------------------------------------------- what is lost */

describe('what the mapping cannot carry', () => {
  it('reports YAML comments as dropped, with the byte count measured from the file', () => {
    const hasComment = (environment: Entity) => {
      const raw = environment.artifacts.find((artifact) => artifact.file === 'topology.yaml')?.raw ?? ''
      return raw.split('\n').some((line) => /^\s*#/.test(line))
    }
    const commented = environments.filter((environment) => exports_.get(environment.srn)?.dsl && hasComment(environment))
    const dropped = environments.filter((environment) =>
      exports_.get(environment.srn)?.notes.some((note) => note.code === 'COMMENTS_DROPPED'),
    )
    expect(dropped.map((environment) => environment.srn)).toEqual(commented.map((environment) => environment.srn))
    expect(commented.length).toBeGreaterThan(0)

    // This solution's production topology is the extreme case 0016 names.
    const production = exports_
      .get('srn://metaframework/environment/production')
      ?.notes.find((note) => note.code === 'COMMENTS_DROPPED')
    expect(production?.message).toMatch(/^1\d{3} of \d+ bytes \(4\d\.\d%\)/)
  })

  it('reports the invented node wherever the source declares no region', () => {
    const declaresRegion = (environment: Entity) => {
      const data = environment.artifacts.find((artifact) => artifact.file === 'topology.yaml')?.data as
        | { regions?: unknown[] }
        | undefined
      return Array.isArray(data?.regions) && data.regions.length > 0
    }
    const expected = environments
      .filter((environment) => exports_.get(environment.srn)?.dsl && !declaresRegion(environment))
      .map((environment) => environment.srn)
    const synthetic = environments
      .filter((environment) => codes(exports_.get(environment.srn) as StructurizrExport).includes('SYNTHETIC_PLACE'))
      .map((environment) => environment.srn)

    expect(synthetic).toEqual(expected)
    expect(expected.length).toBeGreaterThan(0)
    const dsl = exports_.get('srn://brass/environment/local')?.dsl as string
    expect(dsl).toContain('deploymentNode "Local" "This environment declares no regions."')
  })

  it('reports zones: [] as indistinguishable from an absent zones key', () => {
    const production = exports_.get('srn://metaframework/environment/production') as StructurizrExport
    expect(codes(production)).toContain('ZONES_DECLARED_EMPTY')
    // The two claims differ only in a property, which is the honest reading of
    // "a candidate that cannot hold both holds neither".
    expect(production.dsl).toContain('"metaframework.zones.declared" "0"')
    const brass = exports_.get('srn://brass/environment/production') as StructurizrExport
    expect(codes(brass)).not.toContain('ZONES_DECLARED_EMPTY')
    expect(brass.dsl).not.toContain('metaframework.zones.declared')
  })

  it('reports the nested component C4 has to flatten', () => {
    const production = exports_.get('srn://acme/environment/production') as StructurizrExport
    const note = production.notes.find((candidate) => candidate.code === 'COMPONENT_FLATTENED')
    expect(note?.message).toContain('srn://acme/product/shop/component/checkout/component/payment')
    // The containment survives as a property and not as structure: payment's
    // container sits beside checkout's, both directly inside the Shop system.
    expect(production.dsl).toContain(
      '"metaframework.parent" "srn://acme/product/shop/component/checkout"',
    )
  })

  it('reports the one replica range that two regions make ambiguous', () => {
    const production = exports_.get('srn://acme/environment/production') as StructurizrExport
    const notes = production.notes.filter((candidate) => candidate.code === 'RANGE_SPLIT_ACROSS_REGIONS')
    expect(notes).toHaveLength(1)
    expect(notes[0].path).toBe('hosts[0].replicas')
    // Both nodes claim 3..24, so a reader of the DSL alone cannot tell whether
    // the fleet is 3..24 or 6..48.
    const dsl = production.dsl as string
    expect(dsl.split('instances "3..24"')).toHaveLength(3)
  })

  it('reports the product shorthand C4 turns into a double count', () => {
    // The spec's own worked example, in the shipped catalog: acme/staging places
    // /product/shop at 1..2 and overrides checkout at 2. "The most specific entry
    // wins" has no C4 spelling, so both instances appear and checkout is counted
    // twice — valid DSL that says something topology.yaml does not.
    const staging = exports_.get('srn://acme/environment/staging') as StructurizrExport
    const note = staging.notes.find((candidate) => candidate.code === 'PRODUCT_OVERRIDE_FLATTENED')
    expect(note?.path).toBe('hosts[0].component')
    expect(note?.message).toContain('hosts[1]')
    expect(staging.dsl).toContain('softwareSystemInstance acme_product_shop')
    expect(staging.dsl).toContain('containerInstance acme_product_shop_component_checkout')

    // The other product entry in the catalog places a product nothing overrides.
    const local = exports_.get('srn://metaframework/environment/local') as StructurizrExport
    expect(codes(local)).not.toContain('PRODUCT_OVERRIDE_FLATTENED')
  })

  it('states that the component graph is not mapped, and counts what was left out', () => {
    const production = exports_.get('srn://acme/environment/production') as StructurizrExport
    const note = production.notes.find((candidate) => candidate.code === 'RELATIONSHIPS_OMITTED')
    // checkout depends-on inventory and depends-on ledger; both run here.
    expect(note?.message).toMatch(/^2 "depends-on" edges join elements placed here/)
    expect(production.dsl).not.toContain(' -> ')
  })

  it('finds no backslash it cannot represent in the shipped prose', () => {
    for (const environment of environments) {
      expect(codes(exports_.get(environment.srn) as StructurizrExport), environment.srn).not.toContain(
        'BACKSLASH_UNREPRESENTABLE',
      )
    }
  })
})

/* ------------------------------------------------------- the pure pieces */

describe('instancesLiteral', () => {
  it('keeps a range a range and closes a fixed count to a number', () => {
    expect(instancesLiteral({ min: 3, max: 24 })).toBe('3..24')
    expect(instancesLiteral({ min: 0, max: 3 })).toBe('0..3')
    expect(instancesLiteral({ min: 2, max: 2 })).toBe('2')
  })

  it('spells a fixed zero as a range, because setInstances refuses a bare 0', () => {
    // `Integer.parseInt("0") < 1` throws; `0..0` passes the range branch.
    expect(instancesLiteral({ min: 0, max: 0 })).toBe('0..0')
    expect(instancesAccepted('0')).toBe(false)
    expect(instancesAccepted('0..0')).toBe(true)
  })

  it('emits only values the reference implementation accepts', () => {
    for (const min of [0, 1, 2, 7]) {
      for (const max of [min, min + 1, min + 40]) {
        expect(instancesAccepted(instancesLiteral({ min, max })), `${min}..${max}`).toBe(true)
      }
    }
  })
})

describe('identifierFor', () => {
  it('turns an SRN into a legal, unique identifier', () => {
    expect(identifierFor('srn://acme/product/shop/component/checkout')).toBe('acme_product_shop_component_checkout')
    expect(IDENTIFIER.test(identifierFor('srn://acme/product/shop'))).toBe(true)
  })

  it('is injective over the catalog, so no two elements collide', () => {
    const seen = new Map<string, string>()
    for (const srn of catalog.entities.keys()) {
      const id = identifierFor(srn).toLowerCase()
      expect(seen.get(id), `${srn} vs ${seen.get(id)}`).toBeUndefined()
      seen.set(id, srn)
    }
  })
})

/* ------------------------------------------------- the cases no file has */

/**
 * Hermetic entities, because the export is a pure function of the graph.
 *
 * The rows below are the shapes the format admits and no shipped file uses —
 * a host naming an undeclared region, a reference to a kind that does not
 * deploy, an `x-` key. Building a temp catalog for them would add a filesystem
 * to a test about a string.
 */
function fakeEntity(srn: string, kind: Entity['kind'], extra: Record<string, unknown> = {}): Entity {
  const body = srn.replace('srn://', '').split('/')
  const name = body[body.length - 1]
  return {
    srn,
    parsed: { solution: body[0], path: [], kind: kind === 'solution' ? null : kind, name, artifact: null, version: null },
    kind,
    relDir: body.join('/'),
    dir: `/tmp/${body.join('/')}`,
    frontmatter: {
      name,
      kind,
      version: 1,
      title: name,
      summary: `The ${name} ${kind}.`,
      status: 'approved',
      ...extra,
    } as Entity['frontmatter'],
    body: '',
    artifacts: [],
    relations: [],
    parent: null,
    children: [],
  }
}

function fakeCatalog(entities: Entity[]): Catalog {
  return {
    entities: new Map(entities.map((entity) => [entity.srn, entity])),
    solutions: ['srn://x'],
    diagnostics: [],
    inbound: new Map(),
  }
}

function environmentWith(document: unknown, raw = ''): Entity {
  const environment = fakeEntity('srn://x/environment/e', 'environment')
  environment.artifacts = [
    { file: 'topology.yaml', extension: '.yaml', data: document, raw },
  ]
  return environment
}

describe('shapes the format admits and no shipped file uses', () => {
  const shop = fakeEntity('srn://x/product/shop', 'product')
  const checkout = fakeEntity('srn://x/product/shop/component/checkout', 'component', { 'component-type': 'service' })
  checkout.parent = shop.srn
  const order = fakeEntity('srn://x/product/shop/datamodel/order', 'datamodel')
  order.parent = shop.srn

  it('drops a host naming a region the file never declared, and says so', () => {
    const environment = environmentWith({
      regions: [{ name: 'eu-west-1' }],
      hosts: [{ component: '/product/shop/component/checkout', regions: ['ap-south-1'] }],
    })
    const result = exportStructurizr(fakeCatalog([shop, checkout, environment]), environment)
    expect(codes(result)).toContain('REGION_UNDECLARED')
    expect(result.dsl).not.toContain('containerInstance')
    // It resolved, so it is not a HOST_ failure — but it did not reach the
    // output, and the stat has to say so.
    expect(result.stats.hostsExported).toBe(0)
    expect(check(result.dsl as string).problems).toEqual([])
  })

  it('drops a host pointing at a kind that does not deploy', () => {
    const environment = environmentWith({ hosts: [{ component: '/product/shop/datamodel/order' }] })
    const result = exportStructurizr(fakeCatalog([shop, order, environment]), environment)
    expect(codes(result)).toEqual(['HOST_NOT_DEPLOYABLE'])
    expect(result.stats.hostsExported).toBe(0)
  })

  it('carries author-owned x- keys through as properties', () => {
    const environment = environmentWith({
      regions: [{ name: 'eu-west-1', 'x-provider': 'hetzner' }],
      hosts: [{ component: '/product/shop/component/checkout', regions: ['eu-west-1'], 'x-tier': 'gold' }],
    })
    const result = exportStructurizr(fakeCatalog([shop, checkout, environment]), environment)
    expect(result.dsl).toContain('"metaframework.x-provider" "hetzner"')
    expect(result.dsl).toContain('"metaframework.x-tier" "gold"')
  })

  it('flags a backslash the tokenizer cannot represent', () => {
    const environment = environmentWith({
      hosts: [{ component: '/product/shop/component/checkout', notes: 'C:\\data holds the volume' }],
    })
    const result = exportStructurizr(fakeCatalog([shop, checkout, environment]), environment)
    expect(codes(result)).toContain('BACKSLASH_UNREPRESENTABLE')
  })

  it('escapes a double quote so the token still closes', () => {
    const environment = environmentWith({
      hosts: [{ component: '/product/shop/component/checkout', notes: 'the "hot" path' }],
    })
    const result = exportStructurizr(fakeCatalog([shop, checkout, environment]), environment)
    const dsl = result.dsl as string
    expect(check(dsl).problems).toEqual([])
    const line = dsl.split('\n').find((candidate) => candidate.includes('hot')) as string
    expect(unescape((tokenize(line) as string[])[2])).toBe('the "hot" path')
  })

  it('returns no DSL when the environment has no topology.yaml', () => {
    const environment = fakeEntity('srn://x/environment/e', 'environment')
    const result = exportStructurizr(fakeCatalog([environment]), environment)
    expect(result.dsl).toBeNull()
    expect(codes(result)).toEqual(['TOPOLOGY_UNPARSED'])
  })
})
