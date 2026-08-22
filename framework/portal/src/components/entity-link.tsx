import { ArrowUpRight, Unlink } from 'lucide-react'
import Link from 'next/link'
import type { EntityKind } from '@/lib/catalog'
import { EntityGlyph } from '@/components/entity-glyph'
import { entityHref } from '@/lib/catalog/href'
import { kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

/** The minimum an SRN mention needs in order to render as a link. */
export interface LinkTarget {
  srn: string
  name: string
  title: string
  kind: EntityKind
  /**
   * The `component-type`, when the producer of this target knew it.
   *
   * Optional rather than required, and that is the whole design: a mention is
   * built in several places from whatever the caller had to hand, and a badge
   * that refused to render without a second typing axis would turn a cosmetic
   * reveal into a hard dependency. Absent means `EntityGlyph` draws the kind
   * glyph alone, exactly as it did before the hover reveal existed.
   */
  componentType?: string | null
}

/**
 * An inline reference to another entity, rendered as a kind-coloured badge.
 *
 * Every mention of an entity anywhere in the portal — prose, frontmatter
 * fields, diagram chips — goes through this component, so a reference always
 * looks the same and always navigates. An SRN that does not resolve renders as
 * a visibly broken badge rather than silently as plain text: a dangling
 * reference is exactly the thing a reviewer needs to see.
 */
export function EntityLink({
  target,
  reference: rawRef,
  version,
  href,
  className,
  showTitle = false,
}: {
  target: LinkTarget | null
  /** The reference as authored, shown when it cannot be resolved. */
  reference?: string
  version?: number | null
  /**
   * Where the badge navigates instead of the entity page — an artifact
   * mention's serving route. Defaults to the target's own page.
   */
  href?: string | null
  className?: string
  showTitle?: boolean
}) {
  if (!target) {
    return (
      <span
        title={`Unresolved reference: ${rawRef ?? 'unknown'}`}
        className={cn(
          'inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-[6px] py-[2px] align-baseline',
          'font-mono text-[0.78em] leading-none text-destructive',
          className,
        )}
      >
        <Unlink className="size-3 shrink-0" aria-hidden />
        {rawRef ?? 'unresolved'}
      </span>
    )
  }

  const style = kindStyle(target.kind)

  return (
    <Link
      href={href ?? entityHref(target.srn)}
      title={`${style.label} · ${target.title}`}
      className={cn(
        // leading-none plus minimal vertical padding: a badge must stay inside
        // the line box it appears in, or a paragraph full of references ends up
        // double-spaced compared with one without them.
        'focusable group/link glyph-host inline-flex items-center gap-1 rounded border px-[6px] py-[2px] align-baseline',
        'font-mono text-[0.78em] leading-none no-underline transition',
        style.bg,
        style.border,
        'hover:border-border-strong',
        className,
      )}
    >
      <EntityGlyph kind={target.kind} componentType={target.componentType} className="size-3 shrink-0" />
      <span className="text-foreground/90">{target.name}</span>
      {version != null && <span className="text-primary">@{version}</span>}
      {showTitle && <span className="text-muted-foreground">{target.title}</span>}
      {/* Always visible: the arrow is what marks the badge as navigable, so
          hiding it until hover hides the affordance from anyone scanning. */}
      <ArrowUpRight
        className="size-2.5 shrink-0 text-muted-foreground/60 transition group-hover/link:text-foreground"
        aria-hidden
      />
    </Link>
  )
}
