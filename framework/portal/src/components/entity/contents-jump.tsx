import type { Entity } from '@/lib/catalog'
import { KIND_ORDER } from '@/lib/catalog/tree'
import { kindStyle } from '@/lib/ui/kind'

/**
 * Anchor ids for the two lists inside Contents. Exported so the jump strip and
 * the section itself cannot drift apart.
 */
export function contentsAnchor(kind: string): string {
  return `contents-${kind}`
}

export function deeperAnchor(kind: string): string {
  return `deeper-${kind}`
}

/**
 * One chip per kind held below this entity, at the top of the page.
 *
 * The problem it solves is measured, not aesthetic: on the metaframework
 * solution page the Contents section begins ~2,600px down — the body prose is
 * long, and it is *supposed* to be — so every kind inside the solution,
 * decisions included, was several screens of scrolling away from the reader who
 * had just been told the decisions are half of what they came for.
 *
 * Reordering the kinds alone could not fix that; it only decides which kind is
 * stranded first. So the page grows a way *in* rather than a better queue: a
 * strip of the kinds actually present, with their counts, each one a jump to its
 * group. It makes no claim about rank — every kind is one click away, which is
 * the only claim an index is entitled to make — and it costs nothing on an
 * entity with no children, where it renders nothing at all.
 *
 * Counts fold the deep list into the direct one deliberately. "11 ADRs directly
 * and 14 further down" is a fact about directory depth, not about the catalog,
 * and the reader asking "does this thing record its decisions" is served by one
 * number. The link lands on the direct group when there is one, because that is
 * where the section starts.
 */
export function ContentsJump({
  entities,
  descendants,
  className,
}: {
  /** Direct children, already in the ontology's order. */
  entities: Entity[]
  /** Everything deeper, in the same order. */
  descendants: Entity[]
  className?: string
}) {
  if (entities.length === 0) return null

  const counts = new Map<Entity['kind'], { direct: number; total: number }>()
  for (const entity of entities) {
    const seen = counts.get(entity.kind) ?? { direct: 0, total: 0 }
    counts.set(entity.kind, { direct: seen.direct + 1, total: seen.total + 1 })
  }
  for (const entity of descendants) {
    const seen = counts.get(entity.kind) ?? { direct: 0, total: 0 }
    counts.set(entity.kind, { direct: seen.direct, total: seen.total + 1 })
  }

  // Re-sorted rather than left in insertion order: the direct list contributes
  // its kinds first and the deep list appends whatever it adds, which put
  // `component` after `requirement` on the framework's own solution — an order
  // that reports directory depth instead of the ontology. KIND_ORDER is the one
  // ordering of the kinds a reader is ever shown; this strip is not an exception.
  const chips = [...counts.entries()].sort(
    ([a], [b]) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b),
  )

  return (
    <nav aria-label="Contents" className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {chips.map(([kind, count]) => {
        const style = kindStyle(kind)
        const Icon = style.icon
        return (
          // A plain anchor, not next/link: the target is on this page, and the
          // router would push a history entry for a scroll.
          <a
            key={kind}
            href={`#${count.direct > 0 ? contentsAnchor(kind) : deeperAnchor(kind)}`}
            className={`focusable inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5
                        text-[11px] font-medium uppercase tracking-wider transition
                        ${style.bg} ${style.border} ${style.text} hover:brightness-125`}
          >
            <Icon className="size-3" aria-hidden />
            {style.label}
            <span className="font-mono tabular-nums opacity-70">{count.total}</span>
          </a>
        )
      })}
    </nav>
  )
}
