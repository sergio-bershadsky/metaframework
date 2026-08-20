import { ArrowUpRight, CornerDownRight } from 'lucide-react'
import Link from 'next/link'
import { KindBadge } from '@/components/kind-badge'
import type { Catalog, EdgeType, Entity } from '@/lib/catalog'
import { entityHref } from '@/lib/catalog/href'

/**
 * Outgoing edges are authored; incoming ones are derived by the loader. Showing
 * them in one place — visually distinguished — is what makes a component page
 * answer "what breaks if I change this?" without opening anything else.
 */
const EDGE_LABELS: Record<EdgeType, { out: string; in: string }> = {
  uses: { out: 'Uses', in: 'Used by' },
  exposes: { out: 'Exposes', in: 'Exposed by' },
  'depends-on': { out: 'Depends on', in: 'Depended on by' },
  implements: { out: 'Implements', in: 'Implemented by' },
  supersedes: { out: 'Supersedes', in: 'Superseded by' },
  realizes: { out: 'Realizes', in: 'Realized by' },
  measures: { out: 'Measures', in: 'Measured by' },
}

export function EntityRelations({
  entity,
  catalog,
  inbound,
  omitIncoming = [],
}: {
  entity: Entity
  catalog: Catalog
  inbound: Array<{ edge: EdgeType; from: string }>
  /**
   * Inverse edges the page has already given a section of their own — a
   * capability's `realizes`. Listing them twice would make the page look like
   * it holds two different answers to the same question.
   */
  omitIncoming?: readonly EdgeType[]
}) {
  const shown = inbound.filter((edge) => !omitIncoming.includes(edge.edge))
  if (entity.relations.length === 0 && shown.length === 0) return null

  const outgoing = groupBy(entity.relations, (relation) => relation.edge)
  const incoming = groupBy(shown, (edge) => edge.edge)

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Relations</h2>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-medium text-foreground/80">
            <ArrowUpRight className="size-3.5 text-primary" aria-hidden />
            Outgoing
          </h3>
          {entity.relations.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">None declared.</p>
          ) : (
            <div className="space-y-3.5">
              {[...outgoing.entries()].map(([edge, relations]) => (
                <div key={edge}>
                  <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {EDGE_LABELS[edge].out}
                  </p>
                  <ul className="space-y-1">
                    {relations.map((relation, index) => {
                      const target = relation.target ? catalog.entities.get(relation.target) : null
                      return (
                        <li key={`${relation.ref}-${index}`}>
                          {target ? (
                            <Link
                              href={entityHref(target.srn)}
                              className="focusable group flex items-center gap-2 rounded px-2 py-1.5 -mx-2 transition hover:bg-surface"
                            >
                              <KindBadge kind={target.kind} showLabel={false} />
                              <span className="truncate font-mono text-[12.5px] text-foreground/85 group-hover:text-foreground">
                                {target.frontmatter.name}
                              </span>
                              {relation.version != null && (
                                <span className="font-mono text-[11px] text-primary">@{relation.version}</span>
                              )}
                              <span className="truncate text-[12px] text-muted-foreground">
                                {target.frontmatter.title}
                              </span>
                            </Link>
                          ) : (
                            <span className="flex items-center gap-2 px-2 py-1.5 -mx-2 font-mono text-[12.5px] text-destructive">
                              {relation.ref}
                              <span className="text-[11px] uppercase tracking-wider">unresolved</span>
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-medium text-foreground/80">
            <CornerDownRight className="size-3.5 text-muted-foreground" aria-hidden />
            Incoming
            <span className="font-normal text-muted-foreground">— derived, never authored</span>
          </h3>
          {shown.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing references this entity.</p>
          ) : (
            <div className="space-y-3.5">
              {[...incoming.entries()].map(([edge, edges]) => (
                <div key={edge}>
                  <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {EDGE_LABELS[edge].in}
                  </p>
                  <ul className="space-y-1">
                    {edges.map(({ from }) => {
                      const source = catalog.entities.get(from)
                      if (!source) return null
                      return (
                        <li key={from}>
                          <Link
                            href={entityHref(from)}
                            className="focusable group flex items-center gap-2 rounded px-2 py-1.5 -mx-2 transition hover:bg-surface"
                          >
                            <KindBadge kind={source.kind} showLabel={false} />
                            <span className="truncate font-mono text-[12.5px] text-foreground/85 group-hover:text-foreground">
                              {source.frontmatter.name}
                            </span>
                            <span className="truncate text-[12px] text-muted-foreground">
                              {source.frontmatter.title}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const group = groups.get(key(item)) ?? []
    group.push(item)
    groups.set(key(item), group)
  }
  return groups
}
