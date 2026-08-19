import { RelationGraph, type RelationGraphEdge, type RelationGraphNode } from '@/components/diagrams/relation-graph'
import type { Catalog, Entity } from '@/lib/catalog'

/**
 * The entity's immediate neighbourhood as a graph.
 *
 * Scoped to one hop deliberately: a whole-solution graph is a hairball that
 * answers no question, whereas "what does this touch, and what touches it"
 * is exactly what a reviewer opens a component page to find out. The global
 * graph is a separate, deferred feature.
 */
export function EntityGraph({ entity, catalog }: { entity: Entity; catalog: Catalog }) {
  const inbound = catalog.inbound.get(entity.srn) ?? []
  const outbound = entity.relations.filter((relation) => relation.target)

  if (inbound.length + outbound.length < 2) return null

  const nodes = new Map<string, RelationGraphNode>()
  const edges: RelationGraphEdge[] = []

  const add = (srn: string) => {
    const target = catalog.entities.get(srn)
    if (!target || nodes.has(srn)) return
    nodes.set(srn, {
      srn: target.srn,
      name: target.frontmatter.name,
      title: target.frontmatter.title,
      kind: target.kind,
    })
  }

  add(entity.srn)
  for (const relation of outbound) {
    if (!relation.target || !catalog.entities.has(relation.target)) continue
    add(relation.target)
    edges.push({ from: entity.srn, to: relation.target, edge: relation.edge })
  }
  for (const edge of inbound) {
    add(edge.from)
    edges.push({ from: edge.from, to: entity.srn, edge: edge.edge })
  }

  if (edges.length === 0) return null

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Neighbourhood</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {edges.length} relation{edges.length === 1 ? '' : 's'}, one hop
        </span>
      </div>
      <div className="panel mt-4 overflow-hidden">
        <RelationGraph
          nodes={[...nodes.values()]}
          edges={edges}
          focus={entity.srn}
          label={`Entities related to ${entity.frontmatter.title}`}
        />
      </div>
    </section>
  )
}
