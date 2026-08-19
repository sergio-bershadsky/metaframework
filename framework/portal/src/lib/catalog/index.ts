import path from 'node:path'
import { cache } from 'react'
import { loadCatalog } from './load'
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

/**
 * Per-request memoised catalog.
 *
 * In development every request re-reads the filesystem, which is what makes
 * editing an `index.md` show up on reload. In production the tree is read once
 * per process — the catalog is static input to a deployed build.
 */
const loadOnce = cache(async (): Promise<Catalog> => loadCatalog({ catalogDir: catalogDir() }))

let productionCatalog: Promise<Catalog> | null = null

export async function getCatalog(): Promise<Catalog> {
  if (process.env.NODE_ENV === 'production') {
    productionCatalog ??= loadCatalog({ catalogDir: catalogDir() })
    return productionCatalog
  }
  return loadOnce()
}

export async function getEntity(srn: string): Promise<Entity | null> {
  const catalog = await getCatalog()
  return catalog.entities.get(srn) ?? null
}

/** Entities directly beneath `srn`, containers first, then owned kinds. */
export function childrenOf(catalog: Catalog, srn: string): Entity[] {
  const entity = catalog.entities.get(srn)
  if (!entity) return []
  const order = ['product', 'component', 'protocol', 'datamodel', 'actor', 'environment', 'requirement', 'adr']
  return entity.children
    .map((child) => catalog.entities.get(child))
    .filter((child): child is Entity => Boolean(child))
    .sort((a, b) => {
      const byKind = order.indexOf(a.kind) - order.indexOf(b.kind)
      return byKind !== 0 ? byKind : a.frontmatter.name.localeCompare(b.frontmatter.name)
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
