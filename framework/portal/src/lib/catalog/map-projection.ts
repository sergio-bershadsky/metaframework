import type { MapKind, SolutionMapLink, SolutionMapNode } from '@/components/diagrams/solution-map'
import { entitiesOfSolution } from './index'
import { CONTAINER_KINDS } from './frontmatter'
import type { Catalog } from './types'

/**
 * The catalog, projected onto the map's two edge languages.
 *
 * Containment comes from the entity tree, which the loader has already built
 * and validated; dependency comes from resolved `depends-on` and `uses`
 * relations. A relation pointing at a datamodel or a protocol is dropped rather
 * than pulling that entity onto the canvas — the map's promise is that only
 * structure appears on it, and a promise with exceptions is not one.
 *
 * It lives here rather than in `/map/[solution]/page.tsx`, where it was born,
 * because the shape it produces is what the map's legibility is asserted
 * against: `map-fit.test.ts` walks every focus of every shipped solution, and a
 * projection that only a route could reach would have left that suite testing a
 * hand-made approximation of the real thing.
 */

/** The only kinds the map draws. Everything else belongs to an entity page. */
const MAP_KINDS = new Set<string>(CONTAINER_KINDS)

/** Frontmatter edges that count as crossing the structure. */
const CROSSING_EDGES = new Set(['depends-on', 'uses'])

export function projectStructure(
  catalog: Catalog,
  root: string,
): { nodes: SolutionMapNode[]; links: SolutionMapLink[] } {
  const entities = entitiesOfSolution(catalog, root).filter((entity) => MAP_KINDS.has(entity.kind))
  const present = new Set(entities.map((entity) => entity.srn))

  const nodes: SolutionMapNode[] = entities.map((entity) => ({
    srn: entity.srn,
    name: entity.frontmatter.name,
    title: entity.frontmatter.title,
    kind: entity.kind as MapKind,
    parent: entity.parent && present.has(entity.parent) ? entity.parent : null,
  }))

  const links: SolutionMapLink[] = []
  const seen = new Set<string>()
  const add = (link: SolutionMapLink) => {
    const key = `${link.from}--${link.relation}--${link.to}`
    if (seen.has(key)) return
    seen.add(key)
    links.push(link)
  }

  for (const entity of entities) {
    if (entity.parent && present.has(entity.parent)) {
      add({ from: entity.parent, to: entity.srn, relation: 'contains' })
    }
    for (const relation of entity.relations) {
      if (!CROSSING_EDGES.has(relation.edge)) continue
      if (!relation.target || relation.target === entity.srn || !present.has(relation.target)) continue
      add({ from: entity.srn, to: relation.target, relation: relation.edge as 'depends-on' | 'uses' })
    }
  }

  return { nodes, links }
}
