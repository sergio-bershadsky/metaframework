import path from 'node:path'
import { cache } from 'react'
import { type SchemaRegistry, buildSchemaRegistry } from '../schema/registry'
import { catalogFingerprint } from './fingerprint'
import { loadCatalog } from './load'
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
 * Per-request memoised catalog.
 *
 * In development the filesystem decides: every request fingerprints the catalog
 * tree and re-reads it only when that fingerprint moved, which is what makes
 * editing an `index.md` show up on reload. In production the tree is read once
 * per process — the catalog is static input to a deployed build.
 */
const load = async (): Promise<LoadedCatalog> =>
  withSchemaRegistry(await loadCatalog({ catalogDir: catalogDir() }))

/**
 * Development-only catalog cache, keyed on {@link catalogFingerprint}.
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
let devCatalog: { fingerprint: string; loading: Promise<LoadedCatalog> } | null = null

async function loadIfChanged(): Promise<LoadedCatalog> {
  const fingerprint = catalogFingerprint(catalogDir())
  if (devCatalog?.fingerprint === fingerprint) return devCatalog.loading

  const loading = load()
  devCatalog = { fingerprint, loading }
  // A failed load must not be remembered as this fingerprint's answer, or the
  // error sticks until the next edit. The caller still sees the rejection.
  loading.catch(() => {
    if (devCatalog?.loading === loading) devCatalog = null
  })
  return loading
}

const loadOnce = cache(loadIfChanged)

let productionCatalog: Promise<LoadedCatalog> | null = null

async function loaded(): Promise<LoadedCatalog> {
  if (process.env.NODE_ENV === 'production') {
    productionCatalog ??= load()
    return productionCatalog
  }
  return loadOnce()
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
