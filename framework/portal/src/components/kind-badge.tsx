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

export function VersionBadge({ version, className }: { version: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border border-primary/35 bg-primary/10 px-1.5 py-0.5',
        'font-mono text-[11px] font-medium text-primary',
        className,
      )}
    >
      v{version}
    </span>
  )
}
