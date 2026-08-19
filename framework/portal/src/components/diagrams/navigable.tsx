'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { useAnchorLink } from '@/components/code/anchor-link'
import type { RelationGraphProps } from '@/components/diagrams/relation-graph'
import { SequenceDiagram, type SequenceDiagramProps } from '@/components/diagrams/sequence-diagram'
import type { StateChartDiagramProps } from '@/components/diagrams/state-chart'
import { entityHref } from '@/lib/catalog/href'

/**
 * Diagrams wired to the things a server component cannot hand them.
 *
 * The diagram components take callbacks but are otherwise pure, which keeps
 * them testable and reusable. A server component cannot pass a function across
 * the boundary, so these thin client wrappers supply what has to come from the
 * client: the router, so every clickable thing in a diagram lands on that
 * entity's page, and the artifact block's anchor link, so hovering an element
 * lights the lines that authored it.
 *
 * This layer is also the *bundle* boundary, which is why the two React Flow
 * canvases are reached through `next/dynamic` here rather than imported.
 * `entity-graph.tsx` and `entity-artifacts.tsx` are server components, so they
 * cannot take `ssr: false` themselves — and converting either of them to a
 * client component to get it would drag the catalog loader into the browser.
 * They already import this wrapper, so it is the split point that costs nothing
 * to introduce.
 *
 * Measured on a production build of this portal: React Flow is a 180 KiB chunk
 * that every entity page carried, including an actor page that draws no diagram
 * at all — every route under /catalog shipped byte-identical client JS
 * regardless of what was on it. `ssr: false` is the same treatment
 * `stoplight-schema-view.tsx` already gives its viewer, and it is required
 * rather than merely convenient: React Flow measures real DOM nodes, so its
 * server pass produces a canvas with nothing in it.
 *
 * The sequence diagram stays a static import. It is hand-rolled SVG over a pure
 * layout pass with no React Flow behind it, so there is no weight to defer, and
 * keeping it server-rendered keeps its narration in the HTML.
 */

/**
 * What the server sends in place of a canvas.
 *
 * `next/dynamic` renders this on the server when `ssr: false`, so it is the
 * entity page's diagram-shaped hole rather than a client-only flash. It is
 * 220px tall because that is exactly what both canvases occupied server-side
 * before this split — their height is `fitCanvasHeight(null, max)` until the
 * first ELK pass lands, and that floors at `MIN_CANVAS_HEIGHT` — so the box the
 * reader sees is the box that was already there and nothing moves.
 *
 * Deliberately frameless: both call sites already sit inside a frame (a panel
 * in the neighbourhood section, an artifact block's body in the other), and the
 * real components take their own border from a `className` a loading component
 * cannot be handed.
 */
function CanvasPlaceholder({ label }: { label: string }) {
  return (
    <div className="relative bg-surface" style={{ height: 220 }} role="status" aria-live="polite">
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2" aria-hidden>
            <span className="h-6 w-16 animate-pulse rounded-sm bg-muted" />
            <span className="h-px w-6 bg-border-strong" />
            <span className="h-6 w-16 animate-pulse rounded-sm bg-muted" style={{ animationDelay: '120ms' }} />
            <span className="h-px w-6 bg-border-strong" />
            <span className="h-6 w-16 animate-pulse rounded-sm bg-muted" style={{ animationDelay: '240ms' }} />
          </div>
          <p className="font-mono text-[11px] tracking-tight text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  )
}

const RelationGraph = dynamic(
  () => import('@/components/diagrams/relation-graph').then((module) => module.RelationGraph),
  { ssr: false, loading: () => <CanvasPlaceholder label="Loading the graph…" /> },
)

const StateChartDiagram = dynamic(
  () => import('@/components/diagrams/state-chart').then((module) => module.StateChartDiagram),
  { ssr: false, loading: () => <CanvasPlaceholder label="Loading the state chart…" /> },
)

function useEntityNavigation() {
  const router = useRouter()
  return useCallback((srn: string) => router.push(entityHref(srn)), [router])
}

/**
 * Inside an artifact block this also joins up with the source pane: the block
 * provides the link, the diagram consumes it. Outside one `useAnchorLink()`
 * returns null and the diagram behaves exactly as it did before — which is what
 * lets the same component be rendered from a server component that cannot pass
 * callbacks across the boundary.
 */
export function NavigableSequenceDiagram(
  props: Omit<SequenceDiagramProps, 'onNavigate' | 'activeAnchors' | 'onAnchorHover' | 'onAnchorSelect'>,
) {
  const navigate = useEntityNavigation()
  const link = useAnchorLink()
  return (
    <SequenceDiagram
      {...props}
      onNavigate={navigate}
      activeAnchors={link?.active}
      onAnchorHover={link?.onActivate}
      onAnchorSelect={link?.onSelect}
    />
  )
}

export function NavigableRelationGraph(props: Omit<RelationGraphProps, 'onNavigate'>) {
  const navigate = useEntityNavigation()
  return <RelationGraph {...props} onNavigate={navigate} />
}

/**
 * The state chart, joined to `states.json`. It navigates nowhere — a state is
 * not an entity — so this wrapper exists only for the anchor link.
 */
export function LinkedStateChart(
  props: Omit<StateChartDiagramProps, 'activeAnchors' | 'onAnchorHover' | 'onAnchorSelect'>,
) {
  const link = useAnchorLink()
  return (
    <StateChartDiagram
      {...props}
      activeAnchors={link?.active}
      onAnchorHover={link?.onActivate}
      onAnchorSelect={link?.onSelect}
    />
  )
}
