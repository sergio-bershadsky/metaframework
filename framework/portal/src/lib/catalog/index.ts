import path from 'node:path'
import { cache } from 'react'
import { actorDiagnostics } from '../actor/actor'
import { adrDiagnostics } from '../adr/adr'
import { datamodelDiagnostics } from '../datamodel/datamodel'
import { environmentDiagnostics } from '../environment/environment'
import { journeyArtifactDiagnostics } from '../journey/artifacts'
import { requirementDiagnostics } from '../requirement/requirement'
import { structureDiagnostics } from '../structure/structure'
import { configContractDiagnostics, readConfigContracts } from '../schema/config-contract'
import { type SchemaRegistry, buildSchemaRegistry } from '../schema/registry'
import { artifactDiagnostics } from './artifact-checks'
import { catalogFingerprint } from './fingerprint'
import { type CatalogListings, catalogListings } from './listings'
import { loadCatalog } from './load'
import { measurementDiagnostics } from './measurements'
import { servingWorkingTree } from './mode'
import { KIND_ORDER } from './tree'
import type { Catalog, Entity } from './types'

export * from './types'
export * from './frontmatter'
export * from './href'
export { loadCatalog } from './load'

/**
 * Where the catalog lives. Defaults to `<repo>/solutions`, overridable with
 * CATALOG_DIR so the portal can be pointed at a solution repo that lives
 * outside this monorepo — the separation line the decision record draws.
 */
export function catalogDir(): string {
  const configured = process.env.CATALOG_DIR
  if (configured) return path.resolve(configured)
  // portal cwd is framework/portal; the catalog sits two levels up.
  return path.resolve(process.cwd(), '../../solutions')
}

/** The catalog the portal renders, plus the schema registry built from it. */
export interface LoadedCatalog {
  /** The entity graph, with schema diagnostics folded into `diagnostics`. */
  catalog: Catalog
  registry: SchemaRegistry
}

/**
 * Fold the datamodel schema registry into the catalog it was built from.
 *
 * The loader validates frontmatter, placement and relations; it never opens a
 * `schema.json` beyond parsing it into `artifact.data`. Everything a datamodel
 * can get wrong — a missing or mismatched `$id`, an absent `x-srn`, a `$ref`
 * that names no entity, an inheritance cycle, a closed base — is found by
 * {@link buildSchemaRegistry} instead. Until this merge existed the registry was
 * built only by the test suite, so that whole class of error never reached
 * /diagnostics, which is the portal's only integrity gate.
 *
 * One list, one severity split, one indicator count: a reader must not have to
 * know which validator found a problem in order to see it.
 *
 * Kept separate from `loadCatalog` on purpose. That function is the pure
 * filesystem → entity-graph step and is exercised against hermetic temp
 * fixtures; the registry needs ajv, and pulling it in there would put a JSON
 * Schema engine behind every loader test. Composition happens here, at the
 * memoisation layer, so the registry is built exactly as often as the catalog.
 */
export function withSchemaRegistry(catalog: Catalog): LoadedCatalog {
  const registry = buildSchemaRegistry(catalog)
  if (registry.diagnostics.length === 0) return { catalog, registry }
  return { catalog: { ...catalog, diagnostics: [...catalog.diagnostics, ...registry.diagnostics] }, registry }
}

/**
 * Fold the artifact mini-spec parsers in, for the same reason and by the same
 * route as {@link withSchemaRegistry}.
 *
 * `journey.yaml`, `workflows/*.yaml` and `states.json` each have a parser that
 * validates them, and every one of those parsers was reachable only from a
 * rendering component — so a journey with an unknown key showed `E_JRN_SCHEMA`
 * on its own page while /diagnostics reported the catalog clean and the header
 * count did not move. See ./artifact-checks for what is checked and what is
 * deliberately left out.
 *
 * Composed here rather than inside `loadCatalog` on the same grounds: that
 * function is the pure filesystem → entity-graph step, and its tests run against
 * hermetic temp fixtures that assert an exact diagnostics list.
 */
export function withArtifactChecks(catalog: Catalog): Catalog {
  const diagnostics = artifactDiagnostics(catalog)
  if (diagnostics.length === 0) return catalog
  return { ...catalog, diagnostics: [...catalog.diagnostics, ...diagnostics] }
}

/**
 * Fold in the prose discipline — ADR 0018, "Measured facts are derived, or they
 * are dated".
 *
 * Its own fold rather than a passenger on {@link withKindChecks}, because it
 * shares nothing with those: it needs no second entity, no directory listing and
 * no schema registry, it applies to every kind there is, and its subject is the
 * *sentences* of a document rather than the shape of the graph around it. See
 * ./measurements for what a measured quantity is taken to be and, more
 * importantly, for the two shapes it deliberately does not chase.
 */
export function withProseChecks(catalog: Catalog): Catalog {
  const diagnostics = measurementDiagnostics(catalog)
  if (diagnostics.length === 0) return catalog
  return { ...catalog, diagnostics: [...catalog.diagnostics, ...diagnostics] }
}

/**
 * Fold in the kind disciplines — the rules each `kinds/*.md` states about the
 * *shape of the graph around* an entity, as opposed to the shape of its own
 * document.
 *
 * These are one step because they share one input and one position in the
 * pipeline, not because they share a subject. Every one of them is answerable
 * from the resolved catalog plus the two directory listings {@link catalogListings}
 * takes, and none of them needs the schema registry — so they compose exactly
 * where {@link withArtifactChecks} does and their order among themselves is
 * irrelevant.
 *
 * Why they were not in `loadCatalog`: each asks about a *second* entity — the
 * kind an edge points at, the ordinals of an ADR's siblings, whether anything
 * anywhere implements this requirement, which actors a protocol names — and the
 * loader's per-entity pass has one document in hand. `checkGraphShape` is the
 * exception that proves it: the three graph rules that predate this run live
 * there precisely because they run after the graph is linked.
 *
 * Twenty-one error and warning classes reach /diagnostics through this call that
 * reached nothing before it. The register they came out of is
 * ./diagnostic-coverage.test.ts.
 */
export function withKindChecks(catalog: Catalog, listings: CatalogListings): Catalog {
  const diagnostics = [
    ...adrDiagnostics(catalog),
    ...requirementDiagnostics(catalog),
    ...actorDiagnostics(catalog),
    ...structureDiagnostics(catalog, listings.directories),
    ...journeyArtifactDiagnostics(catalog, listings.journeys),
  ]
  if (diagnostics.length === 0) return catalog
  return { ...catalog, diagnostics: [...catalog.diagnostics, ...diagnostics] }
}

/**
 * Fold in the three datamodel rules that read a model from the *outside*.
 *
 * Separate from {@link withKindChecks} for one reason, and it is the same reason
 * {@link withEnvironmentChecks} is separate: `E_DM_EXAMPLE_INVALID` runs an
 * `examples/*.json` through the entity's own compiled validator, which lives in
 * the registry — so this fold cannot run before {@link withSchemaRegistry}, and
 * the other four folds can.
 *
 * Nothing is re-implemented here. The registry already holds one ajv instance in
 * which every `$ref` resolves; validating an example is a lookup and a call.
 */
export function withDatamodelChecks({ catalog, registry }: LoadedCatalog): LoadedCatalog {
  const diagnostics = datamodelDiagnostics(catalog, registry)
  if (diagnostics.length === 0) return { catalog, registry }
  return { catalog: { ...catalog, diagnostics: [...catalog.diagnostics, ...diagnostics] }, registry }
}

/**
 * Fold in the config contract and the environment artifacts, which are one
 * subject and so are one step.
 *
 * They could not ride {@link withArtifactChecks} with the other mini-spec
 * parsers, and the reason is the shape of the check rather than an accident of
 * layering: four of the environment rules read a **datamodel's** flattened
 * schema (`usage: config` — kinds/datamodel.md), so they need the registry, and
 * the registry needs the catalog. Hence the order here — load, parse artifacts,
 * build the registry, and only then join the two kinds against each other.
 *
 * `topology.yaml` and `config.yaml` were parsed by the loader and validated by
 * nothing until this landed; the seven codes that reported the gap are in
 * lib/environment/environment.ts's own docblock.
 */
export function withEnvironmentChecks({ catalog, registry }: LoadedCatalog): LoadedCatalog {
  const contracts = readConfigContracts(catalog, registry)
  const diagnostics = [
    ...configContractDiagnostics(catalog, registry),
    ...environmentDiagnostics(catalog, contracts),
  ]
  if (diagnostics.length === 0) return { catalog, registry }
  return { catalog: { ...catalog, diagnostics: [...catalog.diagnostics, ...diagnostics] }, registry }
}

/**
 * Per-request memoised catalog.
 *
 * Which of the two strategies below applies is decided by
 * {@link servingWorkingTree}, not by NODE_ENV. Serving a working tree — `next dev`, and the CLI, which is a
 * production build pointed at a directory the user is editing — the filesystem
 * decides: every request fingerprints the catalog tree and re-reads it only when
 * that fingerprint moved, which is what makes editing an `index.md` show up.
 * Serving a deployed build, the tree is read once per process, because there the
 * catalog really is static input to a build.
 */
const load = async (): Promise<LoadedCatalog> => {
  const dir = catalogDir()
  const catalog = await loadCatalog({ catalogDir: dir })
  // The listings are taken from the graph the loader just returned, so they
  // cover exactly the entities that loaded — and taken once, for both the
  // structure rules and the journey rules that read them.
  const listings = await catalogListings(dir, catalog)
  const checked = withKindChecks(withProseChecks(withArtifactChecks(catalog)), listings)
  return withEnvironmentChecks(withDatamodelChecks(withSchemaRegistry(checked)))
}

/**
 * Working-tree catalog cache, keyed on {@link catalogFingerprint}.
 *
 * Parsing the catalog costs two orders of magnitude more than stat'ing it, and
 * between two page loads the answer is almost always "nothing changed".
 * Measured in `next dev` against the catalog as it stood at the time (197
 * entities, 597 entries; it has since grown past 280, which moves the absolute
 * numbers but not the ratio this trade rests on):
 * ~18ms to fingerprint against ~2.2s of request time to rebuild. Only ~400ms of
 * that lands inside the loader; the balance is the price of the graph itself,
 * which each rebuild grows the heap by ~250MB to produce and the rest of the
 * render then pays to have collected.
 *
 * Asking the filesystem on every request keeps that skip honest: there is no
 * watcher to mis-wire and no state that outlives what it describes, so an edit
 * made while the server was down, by another process, or through a
 * `git checkout` is seen exactly like an edit made in the editor.
 *
 * Held per-key rather than as a plain memo so that a stale entry is replaced,
 * not accumulated: only the newest fingerprint's catalog is retained.
 */
let watchedCatalog: { fingerprint: string; loading: Promise<LoadedCatalog> } | null = null

async function loadIfChanged(): Promise<LoadedCatalog> {
  const fingerprint = catalogFingerprint(catalogDir())
  if (watchedCatalog?.fingerprint === fingerprint) return watchedCatalog.loading

  const loading = load()
  watchedCatalog = { fingerprint, loading }
  // A failed load must not be remembered as this fingerprint's answer, or the
  // error sticks until the next edit. The caller still sees the rejection.
  loading.catch(() => {
    if (watchedCatalog?.loading === loading) watchedCatalog = null
  })
  return loading
}

const loadOnce = cache(loadIfChanged)

let deployedCatalog: Promise<LoadedCatalog> | null = null

async function loaded(): Promise<LoadedCatalog> {
  // Deliberately not `NODE_ENV === 'production'`. The CLI is a production build
  // that serves a live working tree; reading the catalog once per process there
  // means an edit is never seen. See ./mode for the two modes.
  if (servingWorkingTree()) return loadOnce()
  deployedCatalog ??= load()
  return deployedCatalog
}

export async function getCatalog(): Promise<Catalog> {
  return (await loaded()).catalog
}

/**
 * The schema registry for the current catalog. Server-side only: it holds an
 * ajv instance, so a client component may import *types* from
 * `lib/schema/registry` but never call this.
 */
export async function getSchemaRegistry(): Promise<SchemaRegistry> {
  return (await loaded()).registry
}

export async function getEntity(srn: string): Promise<Entity | null> {
  const catalog = await getCatalog()
  return catalog.entities.get(srn) ?? null
}

/**
 * Sibling order below a container: sub-containers first, then owned kinds.
 *
 * Derived from the rail's {@link KIND_ORDER} rather than restated, because it
 * was the same sequence minus `solution` — and a second copy is a second place
 * to forget a kind. It had already been forgotten once: capability, journey and
 * metric were missing here while the rail knew all three, and `indexOf` answers
 * -1 for a kind it does not know, which sorted them *above* products. A list
 * whose failure mode is silent misordering is a list worth deriving.
 */
const CONTAINED_KIND_ORDER: readonly string[] = KIND_ORDER.filter((kind) => kind !== 'solution')

/** Entities directly beneath `srn`, containers first, then owned kinds. */
export function childrenOf(catalog: Catalog, srn: string): Entity[] {
  const entity = catalog.entities.get(srn)
  if (!entity) return []
  return entity.children
    .map((child) => catalog.entities.get(child))
    .filter((child): child is Entity => Boolean(child))
    .sort((a, b) => {
      const byKind = CONTAINED_KIND_ORDER.indexOf(a.kind) - CONTAINED_KIND_ORDER.indexOf(b.kind)
      return byKind !== 0 ? byKind : a.frontmatter.name.localeCompare(b.frontmatter.name)
    })
}

/**
 * Everything strictly below `srn`'s direct children — the rest of the subtree,
 * flat. Walks the `children` arrays rather than prefix-matching SRNs so it
 * cannot disagree with what the loader linked. Kind-major like {@link childrenOf},
 * then by SRN within a kind, so rows owned by the same sub-component sit
 * together and the order survives entities being added elsewhere in the tree.
 */
export function descendantsOf(catalog: Catalog, srn: string): Entity[] {
  const entity = catalog.entities.get(srn)
  if (!entity) return []

  const deep: Entity[] = []
  const walk = (childSrn: string, direct: boolean) => {
    const child = catalog.entities.get(childSrn)
    if (!child) return
    if (!direct) deep.push(child)
    for (const grand of child.children) walk(grand, false)
  }
  for (const child of entity.children) walk(child, true)

  return deep.sort((a, b) => {
    const byKind = CONTAINED_KIND_ORDER.indexOf(a.kind) - CONTAINED_KIND_ORDER.indexOf(b.kind)
    return byKind !== 0 ? byKind : a.srn.localeCompare(b.srn)
  })
}

/** Root-to-entity chain, used for breadcrumbs. */
export function ancestorsOf(catalog: Catalog, srn: string): Entity[] {
  const chain: Entity[] = []
  let current = catalog.entities.get(srn)?.parent ?? null
  while (current) {
    const entity = catalog.entities.get(current)
    if (!entity) break
    chain.unshift(entity)
    current = entity.parent
  }
  return chain
}

/** Every entity belonging to a solution, in catalog order. */
export function entitiesOfSolution(catalog: Catalog, solutionSrn: string): Entity[] {
  const prefix = `${solutionSrn}/`
  return [...catalog.entities.values()]
    .filter((entity) => entity.srn === solutionSrn || entity.srn.startsWith(prefix))
    .sort((a, b) => a.relDir.localeCompare(b.relDir))
}
