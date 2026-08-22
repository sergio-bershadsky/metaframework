import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { actorDiagnostics } from '../actor/actor'
import { adrDiagnostics } from '../adr/adr'
import { datamodelDiagnostics } from '../datamodel/datamodel'
import { environmentDiagnostics } from '../environment/environment'
import { journeyArtifactDiagnostics } from '../journey/artifacts'
import { parseJourney } from '../journey/journey'
import { requirementDiagnostics } from '../requirement/requirement'
import { structureDiagnostics } from '../structure/structure'
import { configContractDiagnostics, readConfigContracts } from '../schema/config-contract'
import { buildSchemaBundle, buildSchemaRegistry, effectiveModel } from '../schema/registry'
import { catalogListings } from './listings'
import { loadCatalog } from './load'
import { measurementDiagnostics } from './measurements'
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
 *   the portal runs — `loadCatalog`, the directory listings, the five kind-check
 *   modules, the prose scan, `buildSchemaRegistry`, and the config/environment
 *   join — plus the journey mini-spec parser. Each code gets its own assertion, so "specified
 *   but never emitted" fails with the code in the test name. The order here is
 *   the order in `./index.ts`'s `load()`, and it is not free: the datamodel
 *   example check runs a schema's own instances through the registry's compiled
 *   validator, so it cannot precede the registry.
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
  // --- journey ---------------------------------------------------------------
  // Empty. JRN4, JRN9 and JRN15 were the three rows here, and all three named a
  // missing *input* rather than a missing branch: `parseJourney` is handed a
  // parsed document, so it can neither notice the document is absent, nor that
  // something else sits beside it, nor look up a protocol's participants.
  // `lib/journey/artifacts.ts` is given the entity directory listing and the
  // resolved catalog, and emits all three.
  //
  // JRN11 and JRN12 are half-implemented and are still NOT listed here:
  // parseJourney emits both on JRN16's clause (the reference carries an artifact
  // suffix, decidable from the SRN and the role table alone). What still has no
  // emitter is each rule's other clause — "the target resolves to the wrong
  // kind". A register keyed by code cannot express half a rule, so the gap lives
  // in the two `it.todo`s that name it, next to the tests for the clause that
  // does fire.

  // --- protocol: the rules protocol.md states and nothing runs ---------------
  //
  // The `participants` rows below no longer say "nothing reads `participants`",
  // because three modules now do: `lib/structure` resolves the list to compute a
  // protocol's nearest common ancestor, `lib/actor` reads it to answer "does any
  // conversation name this actor", and `lib/journey/artifacts` reads it to judge
  // whether a step's protocol documents that hop. Each of them treats a
  // participant it cannot resolve as somebody else's finding and moves on —
  // correctly, because none of them owns this surface. The gap is now precisely
  // that: the list is read three ways and judged by none of them.
  //
  // `E_PROTO_PARTICIPANTS` is a different shape of gap again, and the same one
  // `E_ADR_DATE` and `E_ADR_DECIDERS` were in until this run: the rule IS
  // enforced — `KIND_FRONTMATTER.protocol` carries `.min(2)` — but everything a
  // kind schema rejects is reported as `E_FM_SCHEMA`, so the class the spec names
  // for it never appears. Fixing it is the `metric` manoeuvre: relax the schema,
  // raise the class from a kind check.
  E_PROTO_PARTICIPANTS: 'the rule is enforced by KIND_FRONTMATTER.protocol’s .min(2) and reported as E_FM_SCHEMA; the spec’s own class is never raised',
  E_PROTO_ALIAS_DUP: 'the aliases are read (as a workflow’s address space) and never compared with each other',
  E_PROTO_PARTICIPANT_KIND: 'three modules resolve participant refs and each skips what it cannot use; nothing owns the surface and kind-checks it',
  E_PROTO_PAYLOAD_KIND: '`payloadReferences` (lib/datamodel) already collects exactly this set of refs; nothing kind-checks them',
  E_PROTO_SPEC_FILE: 'nothing inspects a protocol entity directory for the files protocol.md pins — the listing that JRN4/JRN9 use (lib/catalog/listings.ts) is taken for journeys only',
  E_PROTO_TRANSPORT_SCHEMA: 'transport.yaml is parsed into artifact.data and never validated',
  E_PROTO_TRANSPORT_BINDING: 'transport.yaml is parsed into artifact.data and never validated',
  E_PROTO_TRANSPORT_SPEC_CONFLICT: 'transport.yaml is parsed into artifact.data and never validated',
  // The AsyncAPI dialect of the transport role (ADR 0017). `dialects.ts` now
  // carries the `asyncapi:` row, so the dialect is *detected* — an AsyncAPI
  // transport.yaml loads, records `dialect.key: 'asyncapi'` and keeps its native
  // key. What is still missing is the same thing missing from the three rows
  // above: nothing reads the document. The six profile rules and the host rule
  // therefore have a dialect to fire on and no reader to fire them.
  E_PROTO_TRANSPORT_ASYNCAPI: 'the AsyncAPI dialect is detected and never read; nothing validates transport.yaml',
  W_PROTO_TRANSPORT_HOST: 'nothing reads `servers` out of an AsyncAPI transport.yaml',
  W_PROTO_SPEC_ASYNCAPI: 'needs transport.yaml validated first, which nothing does',
  W_PROTO_ARTIFACT_UNKNOWN: 'nothing inspects a protocol entity directory for unrecognised files; JRN9 is the same rule on the journey kind and now has a reader to copy',
  // `W_PROTO_ARAZZO_UNGROUNDED` was here, and its retirement is worth a note
  // because the entry was wrong about itself in the direction that matters.
  //
  // It called clause 1 (the source url names a sibling) "not blocked —
  // unwritten" and clause 2 (every operation, channel or workflow a step names
  // resolves) "genuinely blocked: it needs the sibling openapi.yaml /
  // transport.yaml *interpreted*". Clause 2 was not blocked. The two grounding
  // documents were already parsed objects on `entity.artifacts[].data`, and
  // every resolution the rule asks for is a key lookup or a JSON-pointer walk —
  // no AsyncAPI or OpenAPI validator, no schema, no dependency. What clause 2
  // needed was a reader, and the reader was `Object.keys()`.
  //
  // By this register's own standard — "an implementable gap listed as an
  // unimplementable one is how a gap stops being worked on" — that entry was the
  // failure it warns about, and it sat here for a release. The lesson is in the
  // wording, not the code: "needs X interpreted" is a claim about cost, and a
  // claim about cost belongs beside a look at what the pipeline already holds.
  //
  // `lib/protocol/arazzo-grounding.ts` is the emitter; the rule stays exactly as
  // narrow as the spec states it, which is why the three `E_PROTO_TRANSPORT_*`
  // rows above are untouched. Grounding reads a `channels` or `operations` key
  // out of a transport document; it validates nothing in one, and a transport in
  // a dialect it cannot read is left to whoever eventually writes that reader.
  W_PROTO_PARTICIPANT_MISSING: 'the `exposes`/`uses` back-edges and the participant list both resolve; nothing joins one against the other',
  W_PROTO_PARTICIPANT_UNLINKED: 'the same join, read from its other end',
  W_PROTO_STYLE_MISMATCH: '`style` frontmatter is never compared with the workflows beneath it',
  W_PROTO_WF_CHANNEL_UNKNOWN: 'needs transport.yaml validated first, which nothing does',

  // --- environment ----------------------------------------------------------
  // Empty, and it used to hold seven rows all saying the same thing:
  // "environment artifacts are parsed into artifact.data and never validated".
  // `lib/environment/environment.ts` is that reader, and it arrived with the
  // config-contract join (ENV12–ENV15) rather than only the v1 rules, so
  // ENV4–ENV15 are now all emitted. Nothing environment-shaped is outstanding.

  // --- component, adr, requirement, actor, product, solution, structure ------
  // All empty. Twenty-one rows lived here — the five component containment
  // rules, the five ADR rules, the three requirement rules, the two actor rules,
  // PD7, S1 and the protocol placement rule — and every one of them named the
  // same missing thing in a different accent: a check that needs a *second*
  // entity, or a directory listing, and so could not live in the loader's
  // per-entity pass. `lib/{structure,adr,requirement,actor}` are those checks and
  // `lib/catalog/index.ts`'s `withKindChecks` is where they join the pipeline.

  // --- datamodel ------------------------------------------------------------
  // One row left of four. `E_DM_EXAMPLE_INVALID`, `W_DM_ABSTRACT_USE` and
  // `W_DM_USAGE_MISMATCH` are `lib/datamodel/datamodel.ts`.
  //
  // This one is not deferred for want of a branch — it is the only rule in the
  // spec that cannot be answered from any input the load pipeline has. It
  // compares version N read from **git** against N+1 on disk (kinds/datamodel.md,
  // "What the portal checks mechanically"), and `loadCatalog` is the pure
  // filesystem→graph step: `metaframework check` never spawns git. The working
  // tree cannot substitute either — diffing the tree against the commit carrying
  // the *current* version is `E_VER_UNBUMPED`'s question, not this one. What it
  // needs is `resolveVersion` + `readFileAtRevision` (both already in
  // lib/history/git.ts, both async, both spawning git), a new async fold after
  // `withSchemaRegistry`, and `HistoryUnavailable` meaning silence. The
  // decidable diff itself — the eight rows of datamodel.md's additive table — is
  // pure once the two documents are in hand.
  E_DM_NOT_ADDITIVE:
    'the only rule needing git: it diffs schema.json at version N-1 against the working tree. lib/history can fetch both (resolveVersion + readFileAtRevision) but nothing in the load pipeline spawns git, and a hermetic temp fixture has no history to read',
}

/**
 * Codes the source emits that no spec table defines. An entry here is spec debt
 * in the other direction — the portal complains in a vocabulary the spec does
 * not publish, so a reader who hits the code has nothing to look up.
 *
 * Empty, and the empty state is the goal rather than an accident: the ratchet
 * below retires an entry the moment the spec defines its code, so a row here is
 * always a debt with a name. `W_ARTIFACT_DIALECT` was the last one out —
 * `framework/spec/structure.md` now publishes it beside the artifact role table,
 * which is where a cross-kind class about a file's bytes belongs.
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
  'src/lib/schema/config-contract.ts',
  'src/lib/environment/environment.ts',
  'src/lib/history/git.ts',
  // The kind disciplines, folded in by `withKindChecks` and `withDatamodelChecks`.
  // Listing them here is what puts them under the "accounts for every code"
  // guard below: without it a rule added to one of these modules would never
  // appear in PIPELINE_CODES and the fixture would keep passing while the new
  // rule went unexercised.
  'src/lib/adr/adr.ts',
  'src/lib/requirement/requirement.ts',
  'src/lib/actor/actor.ts',
  'src/lib/structure/structure.ts',
  'src/lib/journey/artifacts.ts',
  'src/lib/datamodel/datamodel.ts',
  // The prose discipline (ADR 0018), folded in by `withProseChecks`. Not a kind
  // discipline — it reads sentences rather than the graph, and it applies to
  // every kind — but it reaches catalog.diagnostics by the same route and so
  // owes the same account of itself.
  'src/lib/catalog/measurements.ts',
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
  // W_PROSE_MEASUREMENT — a number that was obtained by running a command,
  // typed into a document that claims to describe the present. The second
  // sentence is the control: a target is a decision, it was not measured, and it
  // must not be reported.
  await entity(
    'acme/product/shop/component/tape-measure',
    base('tape-measure', 'component'),
    '`src/checkout.ts` is 1,178 lines, the largest module here.\n\nThe p99 budget is 250 ms over a 30d window.\n',
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

  // --- loader: the dialect header -------------------------------------------
  // W_ARTIFACT_DIALECT, both message forms. `transport.yaml` says nothing about
  // which grammar it is in; `states.json` names one the framework does not know.
  // Neither is fatal — that is the class's whole contract — so the protocol is
  // otherwise well-formed and both files still parse.
  await entity(
    'acme/product/shop/protocol/order-events',
    base('order-events', 'protocol', {
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'inventory', ref: '/product/shop/component/inventory' },
      ],
    }),
  )
  await artifact('acme/product/shop/protocol/order-events', 'transport.yaml', 'kind: kafka\n')
  await artifact('acme/product/shop/protocol/order-events', 'states.json', {
    $schema: 'https://example.com/not-a-dialect-of-ours',
    id: 'order-events',
    initial: 'open',
    states: { open: { type: 'final' } },
  })

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

  // --- environment: the two artifacts, and the contract they join against ---
  //
  // One environment carrying one deliberate violation per environment code. The
  // config half needs a *second* entity to be wrong against — a `usage: config`
  // datamodel in the hosted component's own bucket — so the contract below is
  // well-formed and it is the environment that disagrees with it, which is the
  // direction every E_ENV_*/W_ENV_* code is written in.
  await entity('acme/environment/production', base('production', 'environment'))
  await entity(
    'acme/product/shop/component/dispatcher',
    base('dispatcher', 'component', { relations: { uses: ['/environment/production'] } }),
  )
  await entity(
    'acme/product/shop/component/dispatcher/datamodel/config',
    base('config', 'datamodel', { usage: 'config' }),
  )
  await artifact('acme/product/shop/component/dispatcher/datamodel/config', 'schema.json', {
    ...schema('acme/product/shop/component/dispatcher/datamodel/config', {
      properties: {
        DISPATCH_MODE: { enum: ['fast', 'slow'], default: 'fast' },
        DISPATCH_TOKEN: { type: 'string', writeOnly: true },
        DISPATCH_RETRIES: { type: 'integer' },
      },
      // must-provide is { DISPATCH_TOKEN }: DISPATCH_MODE is required and
      // defaulted, so the process supplies its own.
      required: ['DISPATCH_MODE', 'DISPATCH_TOKEN'],
    }),
  })
  // E_ENV_TOPOLOGY_SCHEMA (unknown host key), E_ENV_REGION_UNKNOWN,
  // E_ENV_TARGET_KIND (an actor is not deployable), W_ENV_HOST_UNDECLARED.
  await artifact(
    'acme/environment/production',
    'topology.yaml',
    [
      'regions:',
      '  - name: eu-west-1',
      'hosts:',
      '  - component: /product/shop/component/dispatcher',
      '    regions: [ap-south-1]',
      '    tier: gold',
      '  - component: /actor/customer',
      '  - component: /product/shop/component/inventory',
      '',
    ].join('\n'),
  )
  // E_ENV_CONFIG_SCHEMA (casing), E_ENV_SECRET_VALUE, E_ENV_CONFIG_VALUE,
  // E_ENV_SECRET_MISMATCH, W_ENV_CONFIG_UNDECLARED, W_ENV_CONFIG_ORPHAN — and
  // W_ENV_CONFIG_MISSING, which is an absence: DISPATCH_TOKEN is never declared.
  await artifact(
    'acme/environment/production',
    'config.yaml',
    [
      'config:',
      '  - key: dispatch-mode',
      '  - key: LEAKED_SECRET',
      '    secret: true',
      '    source: vault:kv/acme/production#leaked',
      '    value: hunter2',
      '  - key: DISPATCH_MODE',
      '    for: /product/shop/component/dispatcher',
      '    value: sideways',
      '  - key: DISPATCH_RETRIES',
      '    for: /product/shop/component/dispatcher',
      '    secret: true',
      '    source: vault:kv/acme/production#retries',
      '  - key: DISPATCH_TIMEOUT',
      '    for: /product/shop/component/dispatcher',
      '  - key: WAREHOUSE_URL',
      '    for: /product/shop/component/inventory',
      '',
    ].join('\n'),
  )
  // E_DM_CONFIG_SHAPE (kebab name, nested property) and
  // E_DM_CONFIG_SECRET_DEFAULT (a secret value in git) on the contract side.
  await entity('acme/product/shop/component/tuner', base('tuner', 'component'))
  await entity('acme/product/shop/component/tuner/datamodel/config', base('config', 'datamodel', { usage: 'config' }))
  await artifact('acme/product/shop/component/tuner/datamodel/config', 'schema.json', {
    ...schema('acme/product/shop/component/tuner/datamodel/config', {
      properties: {
        'tuner-mode': { type: 'string' },
        TUNER_LIMITS: { type: 'object' },
        API_TOKEN: { type: 'string', writeOnly: true, default: 'dev-token' },
      },
    }),
  })

  // --- structure: what a component may declare, contain, and be -------------
  // E_COMP_LIBRARY_ENVIRONMENT — a library runs inside its consumers, so an
  // environment edge from one is a category mistake rather than a stale fact.
  await entity(
    'acme/product/shop/component/toolkit',
    base('toolkit', 'component', {
      'component-type': 'library',
      relations: { uses: ['/environment/production'] },
    }),
  )
  // E_COMP_EXTERNAL_CHILD — we describe the boundary of a system we do not own,
  // never its insides.
  await entity('acme/product/shop/component/stripe', base('stripe', 'component', { 'component-type': 'external' }))
  await entity('acme/product/shop/component/stripe/component/webhooks', base('webhooks', 'component'))
  // W_COMP_NO_ENVIRONMENT — a `ui` that names nowhere it runs. `lifecycle` is
  // deliberately `released`: the check exempts only `planned` and `retired`,
  // where naming an environment would be the lie.
  await entity('acme/product/shop/component/dashboard', base('dashboard', 'component', { 'component-type': 'ui' }))
  // W_COMP_DEP_CYCLE — the smallest cycle there is, filed once on the
  // lexicographically first member rather than once per participant.
  await entity(
    'acme/product/shop/component/yin',
    base('yin', 'component', { relations: { 'depends-on': ['../yang'] } }),
  )
  await entity(
    'acme/product/shop/component/yang',
    base('yang', 'component', { relations: { 'depends-on': ['../yin'] } }),
  )
  // E_COMP_SYMLINK — the one arrangement no other rule in the portal can see:
  // `readdir(…, { withFileTypes: true })` reports `isDirectory() === false` for a
  // symlink, so the loader's walk never descends and no entity is ever created.
  // Position decides what a directory is, so the bucket is the whole test.
  await symlink('inventory', path.join(catalogDir, 'acme/product/shop/component/mirror'))

  // E_PROD_ACTOR_TARGET — `primary-actors` is a kind field, never a relation, so
  // `collectRelations` never saw it and a product could name anything at all.
  // The ledger below is also the far end of the placement violation further down.
  await entity(
    'acme/product/billing',
    base('billing', 'product', { 'primary-actors': ['/product/shop'] }),
  )
  await entity('acme/product/billing/component/ledger', base('ledger', 'component'))

  // E_SOL_NO_ROOT — a directory directly under the catalog root is a solution,
  // and a solution states itself. Deliberately EMPTY: with children this case
  // produced one E_STRUCT_MISSING_INDEX per orphan, naming the children rather
  // than the directory; with none it produced nothing whatsoever.
  await mkdir(path.join(catalogDir, 'annex'), { recursive: true })

  // W_STRUCT_PROTOCOL_NCA — participants in two different products, so their
  // nearest common ancestor is the solution root and shop's bucket is below it.
  await entity(
    'acme/product/shop/protocol/cross-talk',
    base('cross-talk', 'protocol', {
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'ledger', ref: '/product/billing/component/ledger' },
      ],
    }),
  )

  // --- adr ------------------------------------------------------------------
  // Every ADR here also carries E_ADR_SECTIONS: the default body is one
  // paragraph, so all four canonical headings are missing and each is its own
  // finding. That is the point of the class — "Alternatives considered is
  // missing" is a fix, "sections are wrong" is a trip back to the kind document.
  //
  // E_ADR_DATE — the shape passes and the calendar does not. E_ADR_DECIDERS —
  // accepted, with nobody accountable. Both reach their own class only because
  // KIND_FRONTMATTER.adr stopped claiming them (lib/catalog/frontmatter.ts);
  // under the old string-and-refine schema they were E_FM_SCHEMA twice over.
  await entity(
    'acme/adr/0001-pick-a-datastore',
    base('0001-pick-a-datastore', 'adr', { 'decision-status': 'accepted', date: '2026-02-30' }),
  )
  // W_ADR_ORDINAL — one ordinal, one ADR, per bucket. Compared numerically, so
  // `0002` and `002` would collide too; the finding lands on the later name.
  await entity('acme/adr/0002-event-log', base('0002-event-log', 'adr', { deciders: ['sergio'] }))
  await entity('acme/adr/0002-event-sourcing', base('0002-event-sourcing', 'adr', { deciders: ['sergio'] }))
  // W_ADR_SUPERSESSION — the successor authors the `supersedes` edge, so a
  // predecessor marked superseded with no incoming edge has no replacement on
  // record. (The mirror case — an ADR superseded by an edge it never
  // acknowledged — is the same class from its other end.)
  await entity(
    'acme/adr/0003-retired-idea',
    base('0003-retired-idea', 'adr', { 'decision-status': 'superseded', deciders: ['sergio'] }),
  )
  // W_ADR_MEASUREMENT — the one bucket allowed to author a measured number, and
  // it must say when. The frontmatter `date` deliberately does not count: it is
  // the date the decision reached its current standing and it MOVES when the
  // standing does, which would silently re-date every number in the body.
  await entity(
    'acme/adr/0004-drop-the-cache',
    base('0004-drop-the-cache', 'adr', { deciders: ['sergio'] }),
    '## Context\n\nThe cache layer is 1,240 lines and nobody has read it since March.\n',
  )

  // --- requirement ----------------------------------------------------------
  // E_REQ_CRITERIA — no `## Acceptance criteria` section at all. `priority` is
  // `should` so this entity carries exactly one violation.
  await entity('acme/requirement/paginate-results', base('paginate-results', 'requirement', { priority: 'should' }))
  // W_REQ_UNIMPLEMENTED — an obligation the catalog states and nobody claims.
  // Given a well-formed criteria section, so the criteria class stays out of it.
  await entity(
    'acme/requirement/audit-everything',
    base('audit-everything', 'requirement'),
    '## Acceptance criteria\n\n- Every write records who made it.\n',
  )
  // W_REQ_WONT_IMPLEMENTED — a recorded non-goal that something claims to meet.
  await entity(
    'acme/requirement/rewrite-in-rust',
    base('rewrite-in-rust', 'requirement', { priority: 'wont' }),
    '## Acceptance criteria\n\n- Nothing. This is the point.\n',
  )
  await entity(
    'acme/product/shop/component/oxidizer',
    base('oxidizer', 'component', { relations: { implements: ['/requirement/rewrite-in-rust'] } }),
  )

  // --- actor ----------------------------------------------------------------
  // W_ACTOR_PARTICIPATION_EDGE — participation is authored once, in the
  // protocol's `participants` list; the edge back is a second list to keep in
  // step. W_ACTOR_ORPHAN needs no entity of its own: `acme/actor/customer` above
  // is named by no protocol and walks no journey, which is exactly the leftover
  // the rule looks for.
  await entity(
    'acme/actor/courier',
    base('courier', 'actor', { relations: { uses: ['/product/shop/protocol/order-events'] } }),
  )

  // --- datamodel: the three rules that read a model from the outside --------
  // E_DM_EXAMPLE_INVALID — an example is the one artifact whose whole purpose is
  // to be a true instance, and until this ran the build's claim to have
  // validated it was unbacked.
  await entity('acme/datamodel/coupon', base('coupon', 'datamodel'))
  await artifact(
    'acme/datamodel/coupon',
    'schema.json',
    schema('acme/datamodel/coupon', { properties: { code: { type: 'string' } }, required: ['code'] }),
  )
  await artifact('acme/datamodel/coupon', 'examples/wrong.json', { code: 42 })
  // W_DM_ABSTRACT_USE — a base nobody instantiates, exposed as something there
  // can be an instance of. `allOf` inheritance is the intended use and is never
  // flagged; this is the other direction.
  await entity('acme/datamodel/party', base('party', 'datamodel', { abstract: true }))
  await artifact('acme/datamodel/party', 'schema.json', schema('acme/datamodel/party'))
  await entity(
    'acme/product/shop/component/registry',
    base('registry', 'component', { relations: { exposes: ['/datamodel/party'] } }),
  )
  // W_DM_USAGE_MISMATCH — declared destination and observed one disagree. The
  // payload reference is added to the transport document above rather than to a
  // new protocol, so the same file keeps carrying W_ARTIFACT_DIALECT.
  await entity('acme/product/shop/datamodel/ledger-entry', base('ledger-entry', 'datamodel', { usage: 'storage' }))
  await artifact(
    'acme/product/shop/datamodel/ledger-entry',
    'schema.json',
    schema('acme/product/shop/datamodel/ledger-entry'),
  )
  await artifact(
    'acme/product/shop/protocol/order-events',
    'transport.yaml',
    ['kind: kafka', 'channels:', '  - name: order-placed', '    message: /product/shop/datamodel/ledger-entry', ''].join(
      '\n',
    ),
  )

  // --- journey: the rules about the directory, not the document -------------
  // E_JRN_ARTIFACT_MISSING needs no entity of its own: `acme/journey/broken-path`
  // above holds an index.md and nothing else, and a journey's frontmatter says
  // nothing about the path — so an entity without its artifact asserts nothing.
  //
  // W_JRN_ARTIFACT_UNKNOWN — `steps.txt` is invisible to `entity.artifacts` by
  // construction (the loader reads four extensions and drops the rest), which is
  // precisely why JRN9 needs the listing rather than the artifact list.
  //
  // W_JRN_PROTOCOL_UNRELATED — `order-events` lists checkout and inventory, and
  // this hop runs ledger → ledger, so the protocol documents neither end of it.
  await entity('acme/journey/side-quest', base('side-quest', 'journey'))
  await artifact(
    'acme/journey/side-quest',
    'journey.yaml',
    [
      `$schema: ${HOST}/metaframework/product/specification/datamodel/journey-document`,
      'name: side-quest',
      'steps:',
      '  - actor: /actor/customer',
      '    touches: /product/billing/component/ledger',
      '  - actor: /actor/customer',
      '    touches: /product/billing/component/ledger',
      '    protocol: /product/shop/protocol/order-events',
      '',
    ].join('\n'),
  )
  await artifact('acme/journey/side-quest', 'steps.txt', 'Not a file this kind defines.\n')

  catalog = await loadCatalog({ catalogDir })
  const registry = buildSchemaRegistry(catalog)

  fired = new Set<string>()
  for (const diagnostic of [...catalog.diagnostics, ...registry.diagnostics]) fired.add(diagnostic.code)
  // The kind disciplines, collected the way `lib/catalog/index.ts` collects them
  // — `withKindChecks` over the resolved catalog plus the two directory
  // listings, then `withDatamodelChecks` once the registry exists. The listings
  // are the input three of these rules cannot be answered without: a symlinked
  // directory, a solution root with no document, and a file the loader chose not
  // to read are all absences from the entity graph.
  const listings = await catalogListings(catalogDir, catalog)
  for (const diagnostic of [
    ...adrDiagnostics(catalog),
    ...requirementDiagnostics(catalog),
    ...actorDiagnostics(catalog),
    ...structureDiagnostics(catalog, listings.directories),
    ...journeyArtifactDiagnostics(catalog, listings.journeys),
    ...datamodelDiagnostics(catalog, registry),
    // Not a kind discipline, and folded in by its own step (`withProseChecks`):
    // it reads the sentences of every kind and needs neither a second entity nor
    // a listing.
    ...measurementDiagnostics(catalog),
  ]) {
    fired.add(diagnostic.code)
  }
  // The config contract and the environment artifacts are folded in after the
  // registry exists, because four of the environment rules read a datamodel's
  // flattened schema (lib/catalog/index.ts, `withEnvironmentChecks`). Collected
  // here exactly as the portal collects them.
  const contracts = readConfigContracts(catalog, registry)
  for (const diagnostic of configContractDiagnostics(catalog, registry)) fired.add(diagnostic.code)
  for (const diagnostic of environmentDiagnostics(catalog, contracts)) fired.add(diagnostic.code)
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
  'W_ARTIFACT_DIALECT',
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
  'E_DM_CONFIG_SHAPE',
  'E_DM_CONFIG_SECRET_DEFAULT',
  'W_DM_CONTRADICTION',
  'W_DM_UNION_TAG',
  'E_ENV_TOPOLOGY_SCHEMA',
  'E_ENV_CONFIG_SCHEMA',
  'E_ENV_REGION_UNKNOWN',
  'E_ENV_TARGET_KIND',
  'E_ENV_SECRET_VALUE',
  'E_ENV_CONFIG_VALUE',
  'E_ENV_SECRET_MISMATCH',
  'W_ENV_HOST_UNDECLARED',
  'W_ENV_CONFIG_ORPHAN',
  'W_ENV_CONFIG_MISSING',
  'W_ENV_CONFIG_UNDECLARED',
  'E_COMP_LIBRARY_ENVIRONMENT',
  'E_COMP_EXTERNAL_CHILD',
  'E_COMP_SYMLINK',
  'W_COMP_NO_ENVIRONMENT',
  'W_COMP_DEP_CYCLE',
  'E_PROD_ACTOR_TARGET',
  'E_SOL_NO_ROOT',
  'W_STRUCT_PROTOCOL_NCA',
  'E_ADR_DATE',
  'E_ADR_DECIDERS',
  'E_ADR_SECTIONS',
  'W_ADR_ORDINAL',
  'W_ADR_SUPERSESSION',
  'E_REQ_CRITERIA',
  'W_REQ_UNIMPLEMENTED',
  'W_REQ_WONT_IMPLEMENTED',
  'W_ACTOR_ORPHAN',
  'W_ACTOR_PARTICIPATION_EDGE',
  'E_DM_EXAMPLE_INVALID',
  'W_DM_ABSTRACT_USE',
  'W_DM_USAGE_MISMATCH',
  'E_JRN_ARTIFACT_MISSING',
  'W_JRN_ARTIFACT_UNKNOWN',
  'W_JRN_PROTOCOL_UNRELATED',
  'W_PROSE_MEASUREMENT',
  'W_ADR_MEASUREMENT',
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
   * Three todos left where there were five. JRN4, JRN9 and JRN15 are no longer
   * waiting on a reader — `lib/journey/artifacts.ts` is that reader, and the
   * three codes are asserted in the pipeline suite above, against the fixture's
   * `side-quest` and `broken-path` journeys.
   *
   * What remains is the half-rule the register cannot express. JRN11 and JRN12
   * each have two clauses, and `parseJourney` emits the class on the one that is
   * decidable from the SRN and the role table alone (tested above). The other —
   * "the target resolves to the wrong kind" — needs the resolved catalog, and
   * `journeyArtifactDiagnostics` deliberately did not take it on: it re-parses
   * the document for JRN15 and discards every issue, because `artifact-checks.ts`
   * already runs the same parser and owns those findings. Moving the kind clause
   * would mean one rule reported from two places.
   */
  it.todo('fires E_JRN_TOUCHES_KIND on a wrong-kind target — JRN11 needs the resolved catalog')
  it.todo('fires E_JRN_PROTOCOL_KIND on a wrong-kind target — JRN12 needs the resolved catalog')
})
