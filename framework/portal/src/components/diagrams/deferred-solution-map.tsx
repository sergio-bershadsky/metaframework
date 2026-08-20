'use client'

import dynamic from 'next/dynamic'
import type { SolutionMapProps } from '@/components/diagrams/solution-map'
import { DIAGRAM_BACKGROUND } from '@/lib/diagrams/layout'

/**
 * The bundle boundary for the solution map.
 *
 * `/map/[solution]` is a server component, so it cannot take `ssr: false`
 * itself, and making the page a client component would drag the catalog loader
 * into the browser. This wrapper is therefore the split point, the same one
 * `navigable.tsx` gives the two entity-page canvases.
 *
 * The map IS this route's content, so unlike the entity pages there is nothing
 * to gain in time-to-first-paint — the reader is waiting for the canvas either
 * way. What the boundary buys is that React Flow leaves the route's *static*
 * module graph: the chunk stops being a script the HTML tells the browser to
 * fetch before hydration, and becomes one fetched after it, so the header, the
 * solution switcher and the counts are interactive without waiting on it.
 *
 * `ssr: false` is required rather than merely convenient: React Flow measures
 * real DOM nodes, so its server pass produces an empty canvas.
 */

/**
 * What the server sends in place of the map.
 *
 * Unlike the entity pages' 220px hole this one fills its container, because the
 * route hands the map `h-full` inside a `min-h-0 flex-1` column — a short
 * placeholder would let the page collapse and then jump when the canvas landed.
 * It wears the real component's own frame classes (`panel diagram-surface`)
 * rather than a copy of what they resolve to, so the box the reader sees before
 * hydration is the same box, and stays the same box if either rule changes.
 * `h-full` is stated here rather than plumbed through: `dynamic`'s `loading`
 * cannot see props, and this wrapper serves exactly one route, whose column
 * sizes the map that way.
 *
 * The dotted substrate is `DIAGRAM_BACKGROUND` drawn in CSS, because React
 * Flow's `<Background>` is in the very chunk being deferred. Reading the
 * constants rather than restating them keeps the two from drifting.
 */
function MapPlaceholder() {
  return (
    <div
      className="panel diagram-surface relative h-full overflow-hidden"
      role="status"
      aria-live="polite"
      style={{
        backgroundImage: `radial-gradient(${DIAGRAM_BACKGROUND.color} ${DIAGRAM_BACKGROUND.size}px, transparent ${DIAGRAM_BACKGROUND.size}px)`,
        backgroundSize: `${DIAGRAM_BACKGROUND.gap}px ${DIAGRAM_BACKGROUND.gap}px`,
      }}
    >
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2" aria-hidden>
            <span className="h-[30px] w-[92px] animate-pulse rounded-md bg-muted" />
            <span className="h-px w-8 bg-border-strong" />
            <span className="h-[30px] w-[92px] animate-pulse rounded-md bg-muted" style={{ animationDelay: '120ms' }} />
            <span className="h-px w-8 bg-border-strong" />
            <span className="h-[30px] w-[92px] animate-pulse rounded-md bg-muted" style={{ animationDelay: '240ms' }} />
          </div>
          <p className="font-mono text-[11px] tracking-tight text-muted-foreground">Loading the map…</p>
        </div>
      </div>
    </div>
  )
}

const SolutionMap = dynamic(
  () => import('@/components/diagrams/solution-map').then((module) => module.SolutionMap),
  { ssr: false, loading: () => <MapPlaceholder /> },
)

export function DeferredSolutionMap(props: SolutionMapProps) {
  return <SolutionMap {...props} />
}
