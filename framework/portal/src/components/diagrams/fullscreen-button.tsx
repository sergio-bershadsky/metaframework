'use client'

import { Maximize2, Minimize2 } from 'lucide-react'
import type { RefObject } from 'react'
import { useFullscreen } from '@/lib/diagrams/use-fullscreen'
import { cn } from '@/lib/utils'

/**
 * Fullscreen toggle for a diagram.
 *
 * Deliberately carries the outward/inward arrows, and the fit control was moved
 * off that icon: arrows pointing out of a box read as "make this bigger" to
 * everyone, so a control that merely re-fits the viewport behind that icon
 * feels broken — it does nothing visible on an already-fitted graph.
 */
export function FullscreenButton({
  target,
  className,
}: {
  target: RefObject<HTMLElement | null>
  className?: string
}) {
  const { isFullscreen, supported, toggle } = useFullscreen(target)

  if (!supported) return null

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Show this diagram fullscreen'}
      title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
      aria-pressed={isFullscreen}
      className={cn('focusable rounded p-1 text-muted-foreground transition hover:text-foreground', className)}
    >
      {isFullscreen ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
    </button>
  )
}
