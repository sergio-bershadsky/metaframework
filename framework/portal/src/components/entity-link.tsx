import { ArrowUpRight, Unlink } from 'lucide-react'
import Link from 'next/link'
import type { EntityKind } from '@/lib/catalog'
import { entityHref } from '@/lib/catalog/href'
import { kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

/** The minimum an SRN mention needs in order to render as a link. */
export interface LinkTarget {
  srn: string
  name: string
  title: string
  kind: EntityKind
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
  className,
  showTitle = false,
}: {
  target: LinkTarget | null
  /** The reference as authored, shown when it cannot be resolved. */
  reference?: string
  version?: number | null
  className?: string
  showTitle?: boolean
}) {
  if (!target) {
    return (
      <span
        title={`Unresolved reference: ${rawRef ?? 'unknown'}`}
        className={cn(
          'inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1 py-0 align-baseline',
          'font-mono text-[0.85em] leading-none text-destructive',
          className,
        )}
      >
        <Unlink className="size-3 shrink-0" aria-hidden />
        {rawRef ?? 'unresolved'}
      </span>
    )
  }

  const style = kindStyle(target.kind)
  const Icon = style.icon

  return (
    <Link
      href={entityHref(target.srn)}
      title={`${style.label} · ${target.title}`}
      className={cn(
        // No vertical padding and leading-none: a badge must sit inside the
        // line box it appears in, or a paragraph full of references ends up
        // double-spaced compared with one without them.
        'focusable group/link inline-flex items-center gap-1 rounded border px-1 py-0 align-baseline',
        'font-mono text-[0.85em] leading-none no-underline transition',
        style.bg,
        style.border,
        'hover:border-border-strong',
        className,
      )}
    >
      <Icon className={cn("size-3 shrink-0", style.text)} aria-hidden />
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
