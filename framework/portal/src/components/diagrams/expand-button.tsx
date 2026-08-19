'use client'

import { Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Expand / collapse a diagram to the browser viewport.
 *
 * Carries the outward-arrows icon, and the fit control gave that icon up:
 * arrows pointing out of a box read as "make this bigger" to everyone, so a
 * control that merely re-fits the viewport behind them feels broken — it does
 * nothing visible on an already-fitted graph.
 */
export function ExpandButton({
  expanded,
  onToggle,
  className,
}: {
  expanded: boolean
  onToggle: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={expanded}
      aria-label={expanded ? 'Collapse diagram' : 'Expand diagram to fill the window'}
      title={expanded ? 'Collapse (Esc)' : 'Expand'}
      className={cn('focusable rounded p-1 text-muted-foreground transition hover:text-foreground', className)}
    >
      {expanded ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
    </button>
  )
}
