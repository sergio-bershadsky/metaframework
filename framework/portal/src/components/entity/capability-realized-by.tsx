import { CornerDownRight } from 'lucide-react'
import Link from 'next/link'
import { SectionHeading } from '@/components/entity/section-heading'
import { KindBadge } from '@/components/kind-badge'
import type { Catalog, EdgeType, Entity } from '@/lib/catalog'
import { entityHref } from '@/lib/catalog/href'
import { ownerTrail } from '@/lib/srn/srn'

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

/**
 * The containers between the solution root and a realizer — `fulfilment` for a
 * component of the fulfilment product, `fulfilment / carrier-gateway` for one
 * nested inside that component, and empty for a product.
 *
 * A capability is always solution-level, so the solution root is the right base
 * and the first name back is always the owning product. Shared with the deep
 * list on a container page, which had this problem first.
 */
function owners(entity: Entity): string {
  return ownerTrail(entity.srn).join(' / ')
}

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
    // Products before components, then BY OWNING PRODUCT, then by name.
    //
    // The middle key is the one that was missing. A capability is placed at
    // solution level precisely because more than one product realizes it — that
    // argument is what the prose above this list spends its paragraphs on — and
    // a list sorted by name alone interleaves the products, so the split the
    // page is about is the one thing the list did not show. Ordering by owner
    // puts each product's contribution together, and `owners` below names it on
    // every row so the grouping is legible rather than merely present.
    .sort((a, b) => {
      const byKind = Number(a.kind === 'component') - Number(b.kind === 'component')
      if (byKind !== 0) return byKind
      const byOwner = owners(a).localeCompare(owners(b))
      return byOwner !== 0 ? byOwner : a.frontmatter.name.localeCompare(b.frontmatter.name)
    })

  return (
    <section className="mt-8" aria-labelledby="section-realized-by">
      <div className="flex flex-wrap items-baseline gap-3">
        <SectionHeading id="section-realized-by">Realized by</SectionHeading>
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
                {/* The owners, then the name, in one mono run so the row reads as
                    the address it is. Dimmer than the name because the name is
                    still what the reader is looking for — but present, because
                    `checkout` and `tracking` say nothing about which half of the
                    split they belong to, and that split is the argument the prose
                    above just made. Empty for a product, which owns itself. */}
                <span className="truncate font-mono text-[12.5px] text-foreground/85 group-hover:text-foreground">
                  {owners(entity) && (
                    <span className="text-muted-foreground/70">{owners(entity)} / </span>
                  )}
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
