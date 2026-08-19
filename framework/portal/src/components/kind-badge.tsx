import type { EntityKind } from '@/lib/catalog'
import { STATUS_STYLES, kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

export function KindBadge({
  kind,
  className,
  showLabel = true,
}: {
  kind: EntityKind
  className?: string
  showLabel?: boolean
}) {
  const style = kindStyle(kind)
  const Icon = style.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5',
        'text-[11px] font-medium uppercase tracking-wider',
        style.bg,
        style.border,
        style.text,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {showLabel && style.label}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: 'text-muted-foreground border-border' }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  )
}

/**
 * The version chip's shape, split out from the badge so an interactive control
 * can wear it without cloning the class list. The version picker is a button
 * that must read as *the same chip* — a second, near-identical style would make
 * "v4" mean one thing in the header and another in a revision list.
 */
export const VERSION_CHIP =
  'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium'

/** Current version: the primary hue, as everywhere else in the console. */
export const VERSION_CHIP_CURRENT = 'border-primary/35 bg-primary/10 text-primary'

/** A version that is not what is on disk — the console's warning register. */
export const VERSION_CHIP_HISTORICAL = 'border-warning/35 bg-warning/[0.07] text-warning'

export function VersionBadge({
  version,
  historical = false,
  className,
}: {
  version: number
  /** Render in the warning register — the version shown is not the current one. */
  historical?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(VERSION_CHIP, historical ? VERSION_CHIP_HISTORICAL : VERSION_CHIP_CURRENT, className)}
    >
      v{version}
    </span>
  )
}
