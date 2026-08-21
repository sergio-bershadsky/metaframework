import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseJourney } from '../journey/journey'
import { buildSchemaBundle, buildSchemaRegistry, effectiveModel } from '../schema/registry'
import { loadCatalog } from './load'
import type { Catalog } from './types'

/**
 * Does every diagnostic the spec documents actually get emitted, by something,
 * on some input?
 *
 * The shipped catalog under `solutions/` answers "no" by construction: acme and
 * brass are exemplars, so every capability has a realizer, every metric has a
 * legal target, and every journey crossing carries an explicit protocol. That is
 * correct authoring and it must stay that way — /diagnostics is the one page
 * whose value depends on being empty, and a broken entity parked next to the
 * worked examples teaches an author that the broken thing is normal.
 *
 * So a spec-documented code could be deleted from the source, or written into a
 * branch that can never be taken, and nothing in the suite would notice. This
 * file is the missing gate, in two layers:
 *
 * - **Inventory** (static, total over every code the spec defines). The spec is
 *   read at run time, so a code added to a kind document is in scope the moment
 *   it is written, without anyone remembering to update a list here. A
 *   documented code with no emitter is red unless it is named in
 *   {@link UNIMPLEMENTED} with the gap spelled out; a code that gains an emitter
 *   forces its entry to be retired.
 * - **Emission** (dynamic, over the catalog pipeline). One hermetic fixture
 *   catalog carrying a deliberate violation per code, run through exactly what
 *   the portal runs — `loadCatalog`, then `buildSchemaRegistry` — plus the
 *   journey mini-spec parser. Each code gets its own assertion, so "specified
 *   but never emitted" fails with the code in the test name.
 *
 * Why a temp fixture and not a checked-in one. The obvious alternative is a
 * corpus under `solutions/_diagnostics/`: the loader's walk and the catalog
 * fingerprint both skip dot- and underscore-prefixed directories, so it would
 * never load as a solution or move the fingerprint. It was rejected on two
 * counts. The underscore skip is a *portal loader* convention, not a repo one —
 * the review-solution plugin's own walker (`catalog_facts.py`) skips only `.git`
 * and `node_modules`, so a checked-in broken corpus is one tool away from being
 * read as content, and it is unconditionally visible to grep, to an editor file
 * tree, and to whoever reads `solutions/` to learn the shape of a catalog. And
 * it cannot express some of what has to be exercised anyway: a stale version
 * pin, a reserved-word entity name, and a solution-crossing reference all want a
 * second solution root that exists only for the length of one test. The
 * hermetic-temp-fixture precedent is already set by `load.test.ts` and named in
 * `fixture-check.test.ts`'s own docblock; this suite follows it.
 */

/* --------------------------------------------------------------- inventory */

const SPEC_DIR = path.resolve(process.cwd(), '../spec')
const SRC_DIR = path.resolve(process.cwd(), 'src')

/**
 * A code is *documented* when a spec table gives it a definition row —
 * `| \`E_FM_SCHEMA\` | … |`. That is the shape every "error classes" table in
 * `framework/spec` uses, and it is deliberately narrower than "the string
 * appears somewhere": rule tables name codes in their Class column and prose
 * names them in passing, and neither is a claim that the code exists.
 */
const DEFINITION_ROW = /^\s*\|\s*`([EW]_[A-Z0-9_]+)`\s*\|/

/** Every code literal the shipped source hands to a diagnostic. */
const CODE_LITERAL = /'([EW]_[A-Z0-9_]+)'/g

async function filesUnder(dir: string, match: (name: string) => boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await filesUnder(full, match)))
    else if (match(entry.name)) files.push(full)
  }
  return files
}

const isTest = (file: string) => /\.test\.tsx?$/.test(file)

/** Every code literal in one file, as a set. */
async function codesIn(file: string): Promise<string[]> {
  const source = await readFile(file, 'utf8')
  return [...source.matchAll(CODE_LITERAL)].map(([, code]) => code)
}

/**
 * Codes the spec documents that nothing in the portal emits, each with the gap
 * named. Every entry here is a rule a kind document states and the portal does
 * not enforce — an author following the spec gets no complaint when they break
 * it. The list is a debt register, not an exemption: the inventory suite fails
 * the moment an entry gains an emitter, so implementing a rule forces its line
 * out of this map.
 */
const UNIMPLEMENTED: Record<string, string> = {
  // --- journey: specified for the loader, emitted by nothing -----------------
  // journey.yaml is parsed by `parseJourney`, which the *entity page component*
  // calls while rendering. Nothing calls it during `loadCatalog`, so no journey
  // code reaches `catalog.diagnostics` at all — and these five are not emitted
  // by `parseJourney` either, because each needs the resolved catalog, or the
  // entity directory, that a pure parser is not given.
  E_JRN_ARTIFACT_MISSING: 'JRN4: nothing checks a journey entity directory for journey.yaml',
  // JRN11 and JRN12 are half-implemented and so are NOT listed here: parseJourney
  // emits both on JRN16's clause (the reference carries an artifact suffix,
  // decidable from the SRN and the role table alone). What still has no emitter
  // is each rule's other clause — "the target resolves to the wrong kind" — which
  // needs the resolved catalog a pure parser is not given. A register keyed by
  // code cannot express half a rule, so the gap lives in the two `it.todo`s that
  // name it, next to the tests for the clause that does fire.
  W_JRN_PROTOCOL_UNRELATED: 'JRN15: needs the named protocol’s participants; parseJourney has no catalog',
  W_JRN_ARTIFACT_UNKNOWN: 'JRN9: the loader reads every artifact extension it knows and judges none of them',

  // --- protocol: artifact rules protocol.md states and nothing runs ----------
  E_PROTO_PARTICIPANTS: 'nothing reads `participants` frontmatter beyond its zod shape',
  E_PROTO_ALIAS_DUP: 'nothing reads `participants` frontmatter beyond its zod shape',
  E_PROTO_PARTICIPANT_KIND: 'needs the resolved catalog; participant refs are never kind-checked',
  E_PROTO_PAYLOAD_KIND: 'parseWorkflow resolves payload refs syntactically and never kind-checks them',
  E_PROTO_SPEC_FILE: 'nothing inspects a protocol entity directory for the files protocol.md pins',
  E_PROTO_TRANSPORT_SCHEMA: 'transport.yaml is parsed into artifact.data and never validated',
  E_PROTO_TRANSPORT_BINDING: 'transport.yaml is parsed into artifact.data and never validated',
  E_PROTO_TRANSPORT_SPEC_CONFLICT: 'transport.yaml is parsed into artifact.data and never validated',
  W_PROTO_ARTIFACT_UNKNOWN: 'nothing inspects a protocol entity directory for unrecognised files',
  W_PROTO_PARTICIPANT_MISSING: 'needs the resolved catalog; participants are never resolved',
  W_PROTO_PARTICIPANT_UNLINKED: 'needs the resolved catalog; participants are never resolved',
  W_PROTO_STYLE_MISMATCH: '`style` frontmatter is never compared with the workflows beneath it',
  W_PROTO_WF_CHANNEL_UNKNOWN: 'needs transport.yaml validated first, which nothing does',

  // --- environment ----------------------------------------------------------
  E_ENV_TOPOLOGY_SCHEMA: 'environment artifacts are parsed into artifact.data and never validated',
  E_ENV_CONFIG_SCHEMA: 'environment artifacts are parsed into artifact.data and never validated',
  E_ENV_SECRET_VALUE: 'nothing scans environment config for inlined secret values',
  E_ENV_REGION_UNKNOWN: 'nothing validates region names',
  E_ENV_TARGET_KIND: 'needs the resolved catalog; environment targets are never kind-checked',
  W_ENV_HOST_UNDECLARED: 'no environment/component hosting cross-check exists',
  W_ENV_CONFIG_ORPHAN: 'no environment/component hosting cross-check exists',

  // --- component ------------------------------------------------------------
  E_COMP_LIBRARY_ENVIRONMENT: '`component-type: library` is never checked against its environment edges',
  E_COMP_EXTERNAL_CHILD: 'external components are never checked for child entities',
  E_COMP_SYMLINK: 'the loader follows readdir and never asks whether an entry is a symlink',
  W_COMP_NO_ENVIRONMENT: 'nothing checks that a deployed component names an environment',
  W_COMP_DEP_CYCLE: 'the `depends-on` graph is built and never searched for cycles',

  // --- adr ------------------------------------------------------------------
  E_ADR_DATE: 'the ADR `date` field is shape-checked by zod and never compared with anything',
  E_ADR_DECIDERS: 'nothing validates `deciders`',
  E_ADR_SECTIONS: 'nothing reads an ADR body for its required sections',
  W_ADR_ORDINAL: 'nothing checks ADR directory ordinals for gaps or duplicates',
  W_ADR_SUPERSESSION: 'nothing checks that a superseded ADR is marked superseded',

  // --- requirement ----------------------------------------------------------
  E_REQ_CRITERIA: 'nothing reads a requirement body for acceptance criteria',
  W_REQ_UNIMPLEMENTED: 'the inbound `implements` index exists; nothing reads it for unimplemented musts',
  W_REQ_WONT_IMPLEMENTED: 'the inbound `implements` index exists; nothing reads it for won’t-do requirements',

  // --- actor, product, solution, structure ----------------------------------
  W_ACTOR_ORPHAN: 'nothing checks an actor for inbound participation',
  W_ACTOR_PARTICIPATION_EDGE: 'nothing checks the direction actors are wired in',
  E_PROD_ACTOR_TARGET: 'no product-level actor edge check exists',
  E_SOL_NO_ROOT: 'a solution directory with no index.md yields E_STRUCT_MISSING_INDEX, not this code',
  W_STRUCT_PROTOCOL_NCA: 'no nearest-common-ancestor check on protocol placement',

  // --- datamodel ------------------------------------------------------------
  E_DM_EXAMPLE_INVALID: 'the registry compiles validators but never runs a schema’s own `examples` through them',
  E_DM_NOT_ADDITIVE: 'additive-only evolution is a git-history question; lib/history compares versions only',
  W_DM_ABSTRACT_USE: '`x-abstract` is never read back when a schema is used',
  W_DM_USAGE_MISMATCH: 'frontmatter `usage` is never compared with how the schema is referenced',
}

/**
 * Codes the source emits that no spec table defines. An entry here is spec debt
 * in the other direction — the portal complains in a vocabulary the spec does
 * not publish, so a reader who hits the code has nothing to look up.
 */
const UNDOCUMENTED: Record<string, string> = {}

/**
 * The modules whose diagnostics reach `catalog.diagnostics` — the /diagnostics
 * page and the header indicator. The emission suite below is responsible for
 * every code any of them can produce.
 */
const PIPELINE_MODULES = [
  'src/lib/catalog/load.ts',
  'src/lib/catalog/frontmatter.ts',
  'src/lib/srn/srn.ts',
  'src/lib/schema/registry.ts',
  'src/lib/schema/lineage.ts',
  'src/lib/history/git.ts',
]

let documented: Set<string>
let emitted: Set<string>
let named: Set<string>
let pipelineEmitted: Set<string>

beforeAll(async () => {
  documented = new Set<string>()
  for (const file of await filesUnder(SPEC_DIR, (name) => name.endsWith('.md'))) {
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      const match = DEFINITION_ROW.exec(line)
      if (match) documented.add(match[1])
    }
  }

  emitted = new Set<string>()
  named = new Set<string>()
  for (const file of await filesUnder(SRC_DIR, (name) => /\.tsx?$/.test(name))) {
    const target = isTest(file) ? named : emitted
    for (const code of await codesIn(file)) target.add(code)
  }

  pipelineEmitted = new Set<string>()
  for (const relative of PIPELINE_MODULES) {
    for (const code of await codesIn(path.resolve(process.cwd(), relative))) pipelineEmitted.add(code)
  }
})

describe('diagnostic inventory — the spec’s code list against the portal’s', () => {
  it('reads a code list out of the spec rather than restating one here', () => {
    // A guard on the extraction itself: if the tables are ever reformatted the
    // regex stops matching, and every assertion below would pass vacuously.
    expect(documented.size).toBeGreaterThan(90)
    expect(documented).toContain('E_FM_SCHEMA')
    expect(documented).toContain('W_CAP_UNREALIZED')
    expect(documented).toContain('E_JRN_ARTIFACT_MISSING')
  })

  it('emits every code the spec documents, or names the gap', () => {
    const silent = [...documented].filter((code) => !emitted.has(code) && !(code in UNIMPLEMENTED)).sort()
    expect(silent).toEqual([])
  })

  it('retires an UNIMPLEMENTED entry as soon as something emits the code', () => {
    // The ratchet. Without it the debt register rots into an exemption list.
    const landed = Object.keys(UNIMPLEMENTED)
      .filter((code) => emitted.has(code))
      .sort()
    expect(landed).toEqual([])
  })

  it('documents every code the portal emits', () => {
    const invented = [...emitted].filter((code) => !documented.has(code) && !(code in UNDOCUMENTED)).sort()
    expect(invented).toEqual([])
  })

  it('keeps the UNDOCUMENTED list honest — an entry the spec now defines must go', () => {
    const defined = Object.keys(UNDOCUMENTED)
      .filter((code) => documented.has(code))
      .sort()
    expect(defined).toEqual([])
  })

  it('has at least one test naming every code the portal emits', () => {
    // Weaker than "it fires" — that is the next suite's job, for the pipeline it
    // owns — but total over every subsystem, including the protocol artifact
    // parsers whose codes never reach catalog.diagnostics.
    const untested = [...emitted].filter((code) => !named.has(code)).sort()
    expect(untested).toEqual([])
  })
})

/* ----------------------------------------------------------------- fixture */

let catalogDir: string
let catalog: Catalog
/** Every code the pipeline produced from the fixture, whoever produced it. */
let fired: Set<string>

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
}

async function artifact(relDir: string, file: string, contents: unknown) {
  await mkdir(path.join(catalogDir, relDir, path.dirname(file)), { recursive: true })
  const raw = typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)
  await writeFile(path.join(catalogDir, relDir, file), raw)
}

/** Required kind-specific fields, per framework/spec/kinds/*.md. */
const KIND_DEFAULTS: Record<string, Record<string, unknown>> = {
  solution: { vision: 'Sell things reliably.' },
  product: { lifecycle: 'active' },
  component: { 'component-type': 'service', lifecycle: 'released' },
  datamodel: { usage: 'both' },
  protocol: { style: 'point-to-point', participants: [{ alias: 'checkout', ref: '/product/shop/component/checkout' }] },
  actor: { 'actor-type': 'human', goals: ['Buy things.'] },
  environment: { 'environment-type': 'production' },
  adr: { 'decision-status': 'proposed', date: '2026-01-01' },
  requirement: { 'requirement-type': 'functional', priority: 'must' },
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

const HOST = 'https://schemas.metaframework.dev'
const DIALECT = 'https://json-schema.org/draft/2020-12/schema'

/** A schema.json correct in every respect, so a spread overrides exactly one. */
const schema = (srnPath: string, extra: Record<string, unknown> = {}) => ({
  $schema: DIALECT,
  $id: `${HOST}/${srnPath}`,
  'x-srn': `srn://${srnPath}`,
  title: 'A model',
  type: 'object',
  ...extra,
})

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-diagnostics-'))

  // --- a well-formed spine, so each violation below is the only thing wrong --
  await entity('acme', base('acme', 'solution'))
  await entity('acme/actor/customer', base('customer', 'actor'))
  await entity('acme/product/shop', base('shop', 'product'))
  await entity('acme/product/shop/component/inventory', base('inventory', 'component'))
  await entity('acme/product/shop/datamodel/money', base('money', 'datamodel'))
  await artifact('acme/product/shop/datamodel/money', 'schema.json', schema('acme/product/shop/datamodel/money'))
  await entity('acme/capability/fulfil-orders', base('fulfil-orders', 'capability'))
  await entity(
    'acme/product/shop/component/checkout',
    base('checkout', 'component', { relations: { realizes: ['/capability/fulfil-orders'] } }),
  )

  // --- loader: frontmatter --------------------------------------------------
  // E_FM_SCHEMA — a component that never says what state it is built in.
  await entity('acme/product/shop/component/legacy', {
    name: 'legacy',
    kind: 'component',
    version: 1,
    title: 'legacy',
    summary: 'No lifecycle.',
    status: 'approved',
    'component-type': 'service',
  })
  // E_FM_UNKNOWN_FIELD — an actor's field on a component.
  await entity('acme/product/shop/component/goal-haver', base('goal-haver', 'component', { goals: ['Ship.'] }))
  // E_FM_NAME_MISMATCH — directory and frontmatter disagree about the name.
  await entity('acme/product/shop/component/warehouse', base('depot', 'component'))
  // E_FM_KIND_LOCATION — a declared kind contradicting the bucket on disk.
  await entity('acme/product/shop/component/pricing', base('pricing', 'component', { kind: 'product' }))
  // E_FM_EDGE_SOURCE — only the built kinds may claim to realize.
  await entity(
    'acme/datamodel/receipt',
    base('receipt', 'datamodel', { relations: { realizes: ['/capability/fulfil-orders'] } }),
  )
  await artifact('acme/datamodel/receipt', 'schema.json', schema('acme/datamodel/receipt'))
  // E_FM_EDGE_TARGET, and E_SRN_DANGLING beside it.
  await entity(
    'acme/product/shop/component/fulfilment',
    base('fulfilment', 'component', {
      relations: {
        implements: ['/actor/customer'],
        uses: ['../../datamodel/nonexistent'],
      },
    }),
  )
  // E_SRN_ARTIFACT — a suffix outside the addressed kind's role table (V5).
  // The vocabulary check precedes the edge fence, so this is not E_FM_EDGE_TARGET.
  await entity(
    'acme/product/shop/component/dotted',
    base('dotted', 'component', { relations: { uses: ['/product/shop/datamodel/money.bogus'] } }),
  )

  // --- loader: SRN and structure -------------------------------------------
  // E_SRN_PLACEMENT — a component bucket at solution level.
  await entity('acme/component/rogue', base('rogue', 'component'))
  // E_SRN_RESERVED — a kind keyword used as an entity name.
  await entity('acme/actor/metric', base('metric', 'actor'))
  // W_REF_STALE_PIN — a pin that resolves but no longer matches the target's
  // version. Not E_SRN_VERSION: that is a pin resolving to nothing, which needs
  // git, which a temp fixture has not got.
  await entity(
    'acme/product/shop/component/returns',
    base('returns', 'component', { relations: { uses: ['../../datamodel/money@7'] } }),
  )
  // E_SRN_CROSS_SOLUTION — solutions are sealed universes.
  await entity(
    'acme/product/shop/component/tourist',
    base('tourist', 'component', { relations: { uses: ['srn://brass/datamodel/elsewhere'] } }),
  )
  // E_STRUCT_NESTED_ENTITY, plus E_SRN_SYNTAX for the unbucketed path it makes.
  await entity('acme/product/shop/datamodel/money/nested', base('nested', 'datamodel'))
  // E_STRUCT_MISSING_INDEX — an owner directory with no index.md above it.
  await entity('acme/product/ghost/component/orphan', base('orphan', 'component'))
  // W_REF_DEPRECATED — a live entity pointing at a retired one.
  await entity('acme/product/shop/datamodel/guilder', base('guilder', 'datamodel', { status: 'deprecated' }))
  await artifact('acme/product/shop/datamodel/guilder', 'schema.json', schema('acme/product/shop/datamodel/guilder'))
  await entity(
    'acme/product/shop/component/nostalgia',
    base('nostalgia', 'component', { relations: { uses: ['../../datamodel/guilder'] } }),
  )

  // E_STRUCT_BODY_H1 — the page renders `title` as the h1, so a body that opens
  // one renders two.
  await entity(
    'acme/product/shop/component/twice-titled',
    base('twice-titled', 'component'),
    '# Twice titled\n\nProse.',
  )

  // --- loader: capability, journey, metric ----------------------------------
  // W_CAP_UNREALIZED, and W_CAP_REALIZATION_EDGE for saying so downwards.
  await entity(
    'acme/capability/forecast-demand',
    base('forecast-demand', 'capability', { relations: { uses: ['/product/shop/component/inventory'] } }),
  )
  // E_MET_NO_SUBJECT — a number with no subject.
  await entity('acme/metric/floating', base('floating', 'metric'))
  // E_MET_TARGET and E_MET_WINDOW — literals that miss their grammars.
  await entity(
    'acme/metric/bad-literals',
    base('bad-literals', 'metric', {
      relations: { measures: ['/capability/fulfil-orders'] },
      target: '99.9',
      window: 'monthly',
    }),
  )
  // W_MET_SUBJECT_SCOPE — filed off its subject's ownership line.
  await entity(
    'acme/product/shop/component/returns/metric/stock-accuracy',
    base('stock-accuracy', 'metric', { relations: { measures: ['/product/shop/component/inventory'] } }),
  )
  // E_JRN_ACTOR_KIND — a protagonist that is not an actor.
  await entity('acme/journey/broken-path', base('broken-path', 'journey', { actor: '/product/shop' }))

  // --- registry: datamodel schemas -----------------------------------------
  // E_DM_SCHEMA_MISSING — a datamodel with no schema is prose.
  await entity('acme/datamodel/wordy', base('wordy', 'datamodel'))
  // E_DM_SCHEMA_INVALID — the file parses but is not a schema object.
  await entity('acme/datamodel/listy', base('listy', 'datamodel'))
  await artifact('acme/datamodel/listy', 'schema.json', [])
  // E_DM_DIALECT — the dialect must be declared, and must be 2020-12.
  await entity('acme/datamodel/old-dialect', base('old-dialect', 'datamodel'))
  await artifact('acme/datamodel/old-dialect', 'schema.json', {
    ...schema('acme/datamodel/old-dialect'),
    $schema: 'http://json-schema.org/draft-07/schema#',
  })
  // E_DM_KEYWORD — the dynamic-reference keywords the spec forbids.
  await entity('acme/datamodel/anchored', base('anchored', 'datamodel'))
  await artifact('acme/datamodel/anchored', 'schema.json', {
    ...schema('acme/datamodel/anchored'),
    $defs: { local: { $anchor: 'local', type: 'string' } },
  })
  // E_DM_ID_MISSING and E_DM_SRN_MISSING — identity stated nowhere.
  await entity('acme/datamodel/nameless', base('nameless', 'datamodel'))
  await artifact('acme/datamodel/nameless', 'schema.json', { $schema: DIALECT, title: 'Nameless', type: 'object' })
  // E_DM_ID_MISMATCH and E_DM_SRN_MISMATCH — identity stated wrongly.
  await entity('acme/datamodel/misnamed', base('misnamed', 'datamodel'))
  await artifact('acme/datamodel/misnamed', 'schema.json', {
    ...schema('acme/datamodel/misnamed'),
    $id: `${HOST}/acme/datamodel/somebody-else`,
    'x-srn': 'srn://acme/datamodel/somebody-else',
  })
  // E_DM_ID_FORBIDDEN — a nested $id re-bases everything beneath it.
  await entity('acme/datamodel/two-headed', base('two-headed', 'datamodel'))
  await artifact('acme/datamodel/two-headed', 'schema.json', {
    ...schema('acme/datamodel/two-headed'),
    $defs: { inner: { $id: `${HOST}/acme/datamodel/two-headed-inner`, type: 'string' } },
  })
  // E_DM_REF_TARGET — a relative $ref where a canonical URL belongs.
  await entity('acme/datamodel/relative-ref', base('relative-ref', 'datamodel'))
  await artifact('acme/datamodel/relative-ref', 'schema.json', {
    ...schema('acme/datamodel/relative-ref'),
    properties: { price: { $ref: '../money/schema.json' } },
  })
  // E_DM_FOREIGN_DEFS — $defs is entity-private.
  await entity('acme/datamodel/peeper', base('peeper', 'datamodel'))
  await artifact('acme/datamodel/peeper', 'schema.json', {
    ...schema('acme/datamodel/peeper'),
    properties: { amount: { $ref: `${HOST}/acme/product/shop/datamodel/money#/$defs/inner` } },
  })
  // E_DM_INHERIT_CYCLE — two roots that inherit from each other.
  for (const [name, other] of [
    ['ouroboros-a', 'ouroboros-b'],
    ['ouroboros-b', 'ouroboros-a'],
  ]) {
    await entity(`acme/datamodel/${name}`, base(name, 'datamodel'))
    await artifact(`acme/datamodel/${name}`, 'schema.json', {
      ...schema(`acme/datamodel/${name}`),
      allOf: [{ $ref: `${HOST}/acme/datamodel/${other}` }],
    })
  }
  // E_DM_CLOSED_BASE — a sealed base rejects everything its children add.
  await entity('acme/datamodel/sealed-base', base('sealed-base', 'datamodel'))
  await artifact('acme/datamodel/sealed-base', 'schema.json', {
    ...schema('acme/datamodel/sealed-base'),
    additionalProperties: false,
    properties: { id: { type: 'string' } },
  })
  await entity('acme/datamodel/sealed-child', base('sealed-child', 'datamodel'))
  await artifact('acme/datamodel/sealed-child', 'schema.json', {
    ...schema('acme/datamodel/sealed-child'),
    allOf: [{ $ref: `${HOST}/acme/datamodel/sealed-base` }],
    properties: { extra: { type: 'string' } },
  })
  // W_DM_CONTRADICTION — a child narrowing a property to a disjoint type.
  await entity('acme/datamodel/typed-base', base('typed-base', 'datamodel'))
  await artifact('acme/datamodel/typed-base', 'schema.json', {
    ...schema('acme/datamodel/typed-base'),
    properties: { quantity: { type: 'string' } },
  })
  await entity('acme/datamodel/contradictor', base('contradictor', 'datamodel'))
  await artifact('acme/datamodel/contradictor', 'schema.json', {
    ...schema('acme/datamodel/contradictor'),
    allOf: [{ $ref: `${HOST}/acme/datamodel/typed-base` }],
    properties: { quantity: { type: 'integer' } },
  })
  // W_DM_UNION_TAG — a oneOf with no shared const tag to read it by.
  await entity('acme/datamodel/opaque-union', base('opaque-union', 'datamodel'))
  await artifact('acme/datamodel/opaque-union', 'schema.json', {
    ...schema('acme/datamodel/opaque-union'),
    properties: {
      payload: {
        oneOf: [
          { type: 'object', properties: { a: { type: 'string' } } },
          { type: 'object', properties: { b: { type: 'string' } } },
        ],
      },
    },
  })

  catalog = await loadCatalog({ catalogDir })
  const registry = buildSchemaRegistry(catalog)

  fired = new Set<string>()
  for (const diagnostic of [...catalog.diagnostics, ...registry.diagnostics]) fired.add(diagnostic.code)
  // The two datamodel warnings are computed per schema *view* rather than during
  // registry construction, so they are collected the way the portal collects
  // them: by asking for the view.
  for (const entry of registry.entries.values()) {
    for (const diagnostic of effectiveModel(registry, entry.id)?.diagnostics ?? []) fired.add(diagnostic.code)
    for (const diagnostic of buildSchemaBundle(registry, entry.id)?.diagnostics ?? []) fired.add(diagnostic.code)
  }
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

/* ---------------------------------------------------------------- emission */

/**
 * The codes this fixture is responsible for firing. Held as a literal list
 * rather than derived, because the point of the suite is that each one has a
 * *named* violation behind it — the cross-check below proves the list complete.
 */
const PIPELINE_CODES = [
  'E_FM_SCHEMA',
  'E_FM_UNKNOWN_FIELD',
  'E_FM_NAME_MISMATCH',
  'E_FM_KIND_LOCATION',
  'E_FM_EDGE_SOURCE',
  'E_FM_EDGE_TARGET',
  'E_SRN_SYNTAX',
  'E_SRN_PLACEMENT',
  'E_SRN_RESERVED',
  'E_SRN_ARTIFACT',
  'E_SRN_DANGLING',
  'E_SRN_CROSS_SOLUTION',
  'E_STRUCT_NESTED_ENTITY',
  'E_STRUCT_MISSING_INDEX',
  'E_STRUCT_BODY_H1',
  'W_REF_DEPRECATED',
  'W_REF_STALE_PIN',
  'W_CAP_UNREALIZED',
  'W_CAP_REALIZATION_EDGE',
  'E_MET_NO_SUBJECT',
  'E_MET_TARGET',
  'E_MET_WINDOW',
  'W_MET_SUBJECT_SCOPE',
  'E_JRN_ACTOR_KIND',
  'E_DM_SCHEMA_MISSING',
  'E_DM_SCHEMA_INVALID',
  'E_DM_DIALECT',
  'E_DM_KEYWORD',
  'E_DM_ID_MISSING',
  'E_DM_ID_MISMATCH',
  'E_DM_ID_FORBIDDEN',
  'E_DM_SRN_MISSING',
  'E_DM_SRN_MISMATCH',
  'E_DM_REF_TARGET',
  'E_DM_FOREIGN_DEFS',
  'E_DM_INHERIT_CYCLE',
  'E_DM_CLOSED_BASE',
  'W_DM_CONTRADICTION',
  'W_DM_UNION_TAG',
] as const

/**
 * Pipeline codes no on-disk fixture can produce, and why. Each is a claim about
 * reachability, not a gap in this file — if one of them ever fires, the claim
 * was wrong and the entry has to go.
 */
const UNREACHABLE_FROM_DISK: Record<string, string> = {
  // Quoted keys, not bare identifiers: the inventory suite scans test sources
  // for code literals to answer "is any test naming this code", and these two
  // are named here and nowhere else.
  'E_STRUCT_DUPLICATE_SRN':
    'a bucketed path maps to exactly one SRN, so two entity directories cannot collide; the check guards a future non-filesystem source',
  'E_VER_REGRESSION': 'lib/history reads git, not the catalog directory — a temp fixture has no history',
  'E_VER_UNBUMPED':
    'the same reason, one step further: this compares two COMMITS of an entity directory, so it is not merely unreachable from a fixture with no history — it is undecidable from disk at all. Content that changed without a version bump looks exactly like content that never changed. Its own tests build real repositories in git.test.ts',
  'E_SRN_VERSION':
    'V8 is "the pin resolves to no commit", which only lib/history can answer — a temp fixture has no history. A pin that resolves but has fallen behind is W_REF_STALE_PIN, and the fixture does fire that',
}

describe('diagnostic emission — every pipeline code fires on the fixture', () => {
  it('builds a catalog despite the violations — loading is fail-soft', () => {
    expect(catalog.entities.size).toBeGreaterThan(20)
    expect(catalog.diagnostics.some((d) => d.severity === 'error')).toBe(true)
  })

  for (const code of PIPELINE_CODES) {
    it(`fires ${code}`, () => {
      expect([...fired].sort()).toContain(code)
    })
  }

  it('accounts for every code the catalog pipeline can emit', () => {
    // Without this, a code added to load.ts or registry.ts would never appear in
    // PIPELINE_CODES and the suite would keep passing while the new rule went
    // unexercised.
    const unaccounted = [...pipelineEmitted]
      .filter((code) => !(PIPELINE_CODES as readonly string[]).includes(code))
      .filter((code) => !(code in UNREACHABLE_FROM_DISK))
      .sort()
    expect(unaccounted).toEqual([])
  })

  it('keeps the unreachable list honest', () => {
    const reachable = Object.keys(UNREACHABLE_FROM_DISK)
      .filter((code) => fired.has(code))
      .sort()
    expect(reachable).toEqual([])
  })
})

/* ------------------------------------------------------------------ journey */

/**
 * The journey mini-spec is validated by `parseJourney`, a pure function the
 * *entity page* calls while rendering. Nothing calls it from `loadCatalog`, so
 * none of these codes reaches `catalog.diagnostics` or /diagnostics — they are
 * exercised here the only way they can be, against the parser directly.
 */
const journeyCodes = (data: unknown, options: Parameters<typeof parseJourney>[1] = {}) =>
  parseJourney(data, options).issues.map((issue) => issue.code)

const twoSteps = [
  { actor: '/actor/customer', touches: '/product/shop/component/checkout' },
  { actor: '/actor/customer', touches: '/product/shop/component/inventory' },
]

describe('diagnostic emission — the journey mini-spec', () => {
  it('fires E_JRN_SCHEMA', () => {
    expect(journeyCodes({ name: 'walk', steps: twoSteps, cadence: 'daily' })).toContain('E_JRN_SCHEMA')
  })

  it('fires E_JRN_NAME', () => {
    expect(journeyCodes({ name: 'walk', steps: twoSteps }, { entityName: 'stroll' })).toContain('E_JRN_NAME')
  })

  it('fires E_JRN_STEP_COUNT', () => {
    expect(journeyCodes({ name: 'walk', steps: [twoSteps[0]] })).toContain('E_JRN_STEP_COUNT')
  })

  it('fires E_JRN_BRANCH', () => {
    expect(journeyCodes({ name: 'walk', steps: [{ ...twoSteps[0], alt: [] }, twoSteps[1]] })).toContain('E_JRN_BRANCH')
  })

  it('fires E_SRN_SYNTAX on an unusable reference', () => {
    expect(
      journeyCodes(
        { name: 'walk', steps: [{ actor: '/actor/customer', touches: '/not-a-bucket' }, twoSteps[1]] },
        { journeySrn: 'srn://acme/journey/walk' },
      ),
    ).toContain('E_SRN_SYNTAX')
  })

  it('fires W_JRN_ACTOR_ABSENT', () => {
    expect(
      journeyCodes(
        { name: 'walk', steps: twoSteps },
        { journeySrn: 'srn://acme/journey/walk', protagonist: '/actor/courier' },
      ),
    ).toContain('W_JRN_ACTOR_ABSENT')
  })

  it('fires W_JRN_UNDOCUMENTED_INTEGRATION', () => {
    expect(
      journeyCodes(
        {
          name: 'walk',
          steps: [
            { actor: '/actor/customer', touches: '/product/shop/component/checkout' },
            { actor: '/actor/customer', touches: '/product/billing/component/ledger' },
          ],
        },
        { journeySrn: 'srn://acme/journey/walk' },
      ),
    ).toContain('W_JRN_UNDOCUMENTED_INTEGRATION')
  })

  /*
   * JRN16's half of the two kind rules. The rules have two clauses each and only
   * one is decidable here: "the target is not a component/product" needs the
   * resolved catalog a pure parser is not given, while "the reference carries an
   * artifact suffix" is decidable from the SRN and the role table alone. So the
   * code fires, on the artifact clause, and the todos below still name the
   * catalog clause that does not.
   */
  it('fires E_JRN_TOUCHES_KIND — JRN16, a legal artifact role where an entity belongs', () => {
    expect(
      journeyCodes(
        {
          name: 'walk',
          steps: [
            { actor: '/actor/customer', touches: '/product/shop/protocol/order-events.transport' },
            { actor: '/actor/customer', touches: '/product/shop/component/checkout' },
          ],
        },
        { journeySrn: 'srn://acme/journey/walk' },
      ),
    ).toContain('E_JRN_TOUCHES_KIND')
  })

  it('fires E_JRN_PROTOCOL_KIND — JRN16, a legal artifact role where an entity belongs', () => {
    expect(
      journeyCodes(
        {
          name: 'walk',
          steps: [
            {
              actor: '/actor/customer',
              touches: '/product/shop/component/checkout',
              protocol: '/product/shop/protocol/order-events.transport',
            },
            { actor: '/actor/customer', touches: '/product/shop/component/checkout' },
          ],
        },
        { journeySrn: 'srn://acme/journey/walk' },
      ),
    ).toContain('E_JRN_PROTOCOL_KIND')
  })

  it('fires E_SRN_ARTIFACT ahead of the surface class — illegal vocabulary fails first', () => {
    // An actor owns no roles at all, so the suffix never reaches JRN16's class.
    const codes = journeyCodes(
      {
        name: 'walk',
        steps: [
          { actor: '/actor/customer.profile', touches: '/product/shop/component/checkout' },
          { actor: '/actor/customer', touches: '/product/shop/component/checkout' },
        ],
      },
      { journeySrn: 'srn://acme/journey/walk' },
    )
    expect(codes).toContain('E_SRN_ARTIFACT')
    expect(codes).not.toContain('E_JRN_ACTOR_KIND')
  })

  /*
   * The codes kinds/journey.md specifies and nothing emits. They are not written
   * as failing assertions because a permanently red suite stops being read; the
   * inventory suite carries them instead, as UNIMPLEMENTED entries that go red
   * the moment an emitter appears — the same ratchet without the standing
   * failure. Each todo names the rule it waits on.
   */
  it.todo('fires E_JRN_ARTIFACT_MISSING — JRN4, needs a reader that looks for journey.yaml on disk')
  it.todo('fires W_JRN_ARTIFACT_UNKNOWN — JRN9, needs a reader that judges the entity directory’s other files')
  it.todo('fires E_JRN_TOUCHES_KIND on a wrong-kind target — JRN11 needs the resolved catalog')
  it.todo('fires E_JRN_PROTOCOL_KIND on a wrong-kind target — JRN12 needs the resolved catalog')
  it.todo('fires W_JRN_PROTOCOL_UNRELATED — JRN15, needs the named protocol’s participants')
})
