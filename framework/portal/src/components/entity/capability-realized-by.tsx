import { CornerDownRight } from 'lucide-react'
import Link from 'next/link'
import { KindBadge } from '@/components/kind-badge'
import type { Catalog, EdgeType } from '@/lib/catalog'
import { entityHref } from '@/lib/catalog/href'

/**
 * What actually delivers this capability — the inverse of `realizes`.
 *
 * A capability adds nothing to the common frontmatter contract on purpose
 * (kinds/capability.md): what the business can *do* is stated in `title` and
 * `summary`, and whether it is *real* is answered by the products and
 * components that claim it. So this list is not one section among several on a
 * capability page — it is the page's answer, and it is promoted above the prose
 * for that reason rather than left in the Incoming column of Relations, where
 * it would sit under a heading called "derived" alongside every other edge.
 *
 * `EntityRelations` is told to skip `realizes` on this page, so the edge is
 * shown once.
 *
 * The empty case says something rather than rendering nothing: an unrealized
 * capability is the gap between what a solution says it can do and what it has
 * built, which is the number a roadmap is made of. The loader raises
 * `W_CAP_UNREALIZED` for the same reason; this is where a reader meets it.
 */
export const CAPABILITY_DERIVED_EDGES: readonly EdgeType[] = ['realizes']

export function CapabilityRealizedBy({
  catalog,
  inbound,
}: {
  catalog: Catalog
  inbound: ReadonlyArray<{ edge: EdgeType; from: string }>
}) {
  const realizers = inbound
    .filter((edge) => edge.edge === 'realizes')
    .map((edge) => catalog.entities.get(edge.from))
    .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
    // Products before components, then by name: a product claiming a capability
    // is a broader claim than one of its components making the same one.
    .sort((a, b) => {
      const byKind = Number(a.kind === 'component') - Number(b.kind === 'component')
      return byKind !== 0 ? byKind : a.frontmatter.name.localeCompare(b.frontmatter.name)
    })

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Realized by</h2>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CornerDownRight className="size-3" aria-hidden />
          derived from `realizes`, never authored here
        </span>
      </div>

      {realizers.length === 0 ? (
        <p className="mt-3 text-[13px] text-warning">
          Nothing realizes this capability yet — it is described, not built.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {realizers.map((entity) => (
            <li key={entity.srn}>
              <Link
                href={entityHref(entity.srn)}
                className="focusable group -mx-2 flex items-center gap-2 rounded px-2 py-1.5 transition hover:bg-surface"
              >
                <KindBadge kind={entity.kind} showLabel={false} />
                <span className="truncate font-mono text-[12.5px] text-foreground/85 group-hover:text-foreground">
                  {entity.frontmatter.name}
                </span>
                <span className="truncate text-[12px] text-muted-foreground">{entity.frontmatter.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
