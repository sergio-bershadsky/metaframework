import Link from 'next/link'
import { KindBadge, StatusBadge } from '@/components/kind-badge'
import type { Entity } from '@/lib/catalog'
import { entityHref } from '@/lib/catalog/href'
import { kindStyle } from '@/lib/ui/kind'

/**
 * Children grouped by kind — the catalog view of "what is inside this thing" —
 * followed by every deeper descendant, flat.
 *
 * The deep list extends this section rather than becoming a sibling because it
 * answers the same question at a different depth: "Contents" already means
 * "what is inside", and a second heading would split one answer in two while
 * re-implementing the render-nothing-when-empty rule this section owns. What
 * keeps the two groups honest is the location line: names collide across
 * sub-components (every component may own an `api` protocol), so each deep row
 * carries the owners between here and it — the same context a tree shows by
 * indentation, restated as text because this list is deliberately flat.
 */
export function EntityChildren({
  srn,
  entities,
  descendants,
}: {
  /** The entity whose page this is; deep rows show their path relative to it. */
  srn: string
  /** Direct children, as {@link childrenOf} orders them. */
  entities: Entity[]
  /** The rest of the subtree, as {@link descendantsOf} orders it. */
  descendants: Entity[]
}) {
  if (entities.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Contents</h2>

      <div className="mt-4 space-y-6">
        <KindGroups entities={entities} />
      </div>

      {descendants.length > 0 && (
        <>
          <div className="mt-8 flex flex-wrap items-baseline gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Deeper</h3>
            <span className="text-[11px] text-muted-foreground">
              everything below the entries above, flattened
            </span>
          </div>
          <div className="mt-4 space-y-6">
            <KindGroups entities={descendants} base={srn} />
          </div>
        </>
      )}
    </section>
  )
}

/**
 * One block per kind, in the order the caller sorted the list — this only
 * buckets, so both the direct and the deep group keep one comparator, the one
 * `childrenOf`/`descendantsOf` state.
 */
function KindGroups({ entities, base }: { entities: Entity[]; base?: string }) {
  const groups = new Map<string, Entity[]>()
  for (const entity of entities) {
    const group = groups.get(entity.kind) ?? []
    group.push(entity)
    groups.set(entity.kind, group)
  }

  return [...groups.entries()].map(([kind, group]) => {
    const style = kindStyle(kind as Entity['kind'])
    return (
      <div key={kind}>
        <div className="mb-2 flex items-center gap-2">
          <KindBadge kind={kind as Entity['kind']} />
          <span className="font-mono text-[11px] text-muted-foreground">{group.length}</span>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {group.map((entity) => (
            <li key={entity.srn}>
              {/* `h-full` is what makes a row's cards line up. The <li> already
                  stretches to the tallest card in its row — that is the grid
                  default — but the card is this link, and a block element is
                  sized by its own content, so it sat short inside a cell that
                  was already the right height. One entity carrying a status
                  badge was enough to leave its neighbours visibly clipped. */}
              <Link
                href={entityHref(entity.srn)}
                className={`focusable group block h-full rounded-lg border border-border bg-surface/60 p-3
                            transition hover:border-border-strong hover:bg-surface`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[13px] font-medium text-foreground/90">
                    {entity.frontmatter.name}
                  </span>
                  <span className={`shrink-0 font-mono text-[11px] ${style.text}`}>
                    v{entity.frontmatter.version}
                  </span>
                </div>
                {base && (
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground/70">
                    {owningPath(entity.srn, base)}
                  </p>
                )}
                <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                  {entity.frontmatter.summary}
                </p>
                {entity.frontmatter.status !== 'approved' && (
                  <StatusBadge status={entity.frontmatter.status} className="mt-2" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  })
}

/**
 * The owners between `base` and a descendant, as names — `payment / psp` for
 * an order model two components down. SRN segments below an entity come in
 * kind/name pairs (that is what the loader's directory walk produces), so the
 * odd positions are the names and the final pair is the entity itself.
 */
function owningPath(srn: string, base: string): string {
  const pairs = srn.slice(base.length + 1).split('/')
  const names: string[] = []
  for (let i = 1; i < pairs.length - 2; i += 2) names.push(pairs[i])
  return names.join(' / ')
}
