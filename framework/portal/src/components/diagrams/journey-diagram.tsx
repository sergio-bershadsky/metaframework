'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ExpandButton } from '@/components/diagrams/expand-button'
import { useExpandable } from '@/lib/diagrams/use-expandable'
import type { EntityKind } from '@/lib/catalog/frontmatter'
import { entityHref } from '@/lib/catalog/href'
import { compileJourney, type CompiledJourney, type JourneyDrawStep } from '@/lib/journey/mermaid'
import type { JourneySummary } from '@/lib/journey/journey'
import { kindColorVar } from '@/lib/ui/kind'
import { renderMermaid } from '@/lib/ui/mermaid'
import { cn } from '@/lib/utils'

/**
 * The walk derived from a journey's `journey.yaml`, drawn by mermaid.
 *
 * Built on exactly the machinery the state chart uses — the shared loader and
 * theme in `@/lib/ui/mermaid`, a pure generator (`compileJourney`) that decides
 * every word on the drawing, and a decorate pass that dresses the SVG. A second
 * loader or a second theming path would be drift by construction.
 *
 * Three things are decorated in, because mermaid's theme has no vocabulary for
 * any of them:
 *
 * - **The hue of a step is the kind it touches.** Colour is ontology in this
 *   console, so a step at a component is component-blue and a step at a
 *   product is product-violet — the drawing says what the walk crosses without
 *   a legend having to. An unresolved reference keeps the neutral border,
 *   which is the honest answer: nothing is known about what it touches.
 * - **A crossing nobody documented is flagged.** `W_JRN_UNDOCUMENTED_INTEGRATION`
 *   is the finding the journey kind exists to produce, so the arrow that
 *   carries it is drawn in the console's warning register rather than left to
 *   be inferred from a missing label. Warning is not an ontology hue — it says
 *   "this is a diagnostic", which is exactly what it is.
 * - **A step navigates** to the entity it touches. The drawing is `aria-hidden`
 *   (the ladder beneath it carries the same references as real, focusable
 *   links), so this is a shortcut for the pointer, never the only way through.
 */

/** One step, as the client needs it: drawn labels plus where it points. */
export interface JourneyStepTarget extends JourneyDrawStep {
  /** Kind of the touched entity — the node's hue. Null when unresolved. */
  kind: EntityKind | null
  /** SRN of the touched entity, for click-through. Null when unresolved. */
  srn: string | null
}

export interface JourneyDiagramProps {
  steps: readonly JourneyStepTarget[]
  summary: JourneySummary
  className?: string
}

export function JourneyDiagram({ steps, summary, className }: JourneyDiagramProps) {
  const compiled = useMemo(() => compileJourney(steps), [steps])
  const { expanded, toggle: toggleExpanded } = useExpandable()
  const router = useRouter()

  const hostRef = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [rendered, setRendered] = useState(false)
  const renderId = `jny${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  // The router lives in a ref so the render effect keys on the diagram alone:
  // a navigation must not re-run mermaid.
  const navigate = useRef(router.push)
  useEffect(() => {
    navigate.current = router.push
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host || steps.length === 0) return
    let cancelled = false

    renderMermaid(renderId, compiled.text)
      .then((root) => {
        if (cancelled) return
        host.replaceChildren(root)
        decorate(host, steps, compiled, (srn) => navigate.current(entityHref(srn)))
        setFailure(null)
        setRendered(true)
      })
      .catch((error: unknown) => {
        // A failed render can leave mermaid's scratch element in the document.
        document.getElementById(renderId)?.remove()
        if (!cancelled) setFailure(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
    }
  }, [steps, compiled, renderId])

  if (steps.length === 0) {
    return (
      <p className={cn('px-4 py-6 text-[13px] text-muted-foreground', className)}>This journey has no steps.</p>
    )
  }

  return (
    <figure
      data-expanded={expanded || undefined}
      className={cn(
        'diagram-surface overflow-hidden',
        expanded && 'fixed inset-0 z-50 flex flex-col rounded-none border-0 bg-background',
        className,
      )}
    >
      <div className={cn('relative', expanded && 'min-h-0 flex-1')}>
        {failure ? (
          <TextFallback summary={summary} />
        ) : (
          <>
            <div
              ref={hostRef}
              className={cn('jny-host overflow-auto p-4', expanded && 'absolute inset-0')}
              // The drawing duplicates the figcaption below it and the legend
              // beneath the block, and every step in it is reachable there as a
              // real link — hiding it keeps a screen reader from hearing the
              // same walk three times.
              aria-hidden
            />
            {!rendered && (
              <div className="absolute inset-0 grid place-items-center bg-surface" role="status" aria-live="polite">
                <p className="font-mono text-[11px] tracking-tight text-muted-foreground">Drawing the journey…</p>
              </div>
            )}
          </>
        )}
        <div className="absolute top-2.5 right-2.5">
          <ExpandButton
            expanded={expanded}
            onToggle={toggleExpanded}
            className="rounded-md border border-border bg-surface/90 backdrop-blur-sm hover:bg-surface-raised"
          />
        </div>
      </div>

      <figcaption className="sr-only">
        <p>{summary.headline}</p>
        <ol>
          {summary.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </figcaption>
    </figure>
  )
}

/* -------------------------------------------------------- post-processing */

/**
 * Paint each step with the hue of the kind it touches, and make it navigable.
 *
 * The join is mermaid's flowchart node id, which ends in the generator's own
 * node id plus an instance counter (`flowchart-js3-7`); the leading part has
 * changed shape across mermaid versions, so only the tail is matched. A node
 * that does not match is left exactly as mermaid drew it — the walk still
 * reads, it simply keeps the neutral border.
 */
function decorate(
  host: HTMLElement,
  steps: readonly JourneyStepTarget[],
  compiled: CompiledJourney,
  navigate: (srn: string) => void,
): void {
  const svg = host.querySelector('svg')
  if (!svg) return
  svg.classList.add('jny-svg')

  const byNodeId = new Map(compiled.nodeIds.map((nodeId, index) => [nodeId, steps[index]]))
  const pattern = /(?:^|-)(js\d+)-\d+$/

  for (const element of svg.querySelectorAll('g.node')) {
    const nodeId = element.id.match(pattern)?.[1]
    const step = nodeId ? byNodeId.get(nodeId) : undefined
    if (!step) continue

    if (step.kind) {
      // Inline style rather than a stroke attribute: a presentation attribute
      // cannot hold `var()`, and the hue must stay a reference to the one place
      // it is defined rather than a copy of its value.
      const shape = element.querySelector('rect, path, polygon, circle')
      if (shape instanceof SVGElement) {
        shape.style.stroke = kindColorVar(step.kind)
        shape.style.strokeWidth = '1.5'
      }
    }

    if (step.srn) {
      const srn = step.srn
      element.classList.add('jny-hit')
      element.addEventListener('click', () => navigate(srn))
    }
  }

  // Hops join by rank: a flowchart emits one path per arrow statement, in
  // statement order, and this diagram writes nothing else that draws a path —
  // no notes, no pseudo-transitions. The zip is still verified by count before
  // it is trusted, so a mermaid upgrade that reshapes the DOM drops the flag
  // rather than putting it on the wrong arrow.
  const paths = [...svg.querySelectorAll('.edgePaths > *')]
  if (paths.length !== compiled.hops.length) return
  compiled.hops.forEach((hop, index) => {
    if (hop !== 'gap') return
    const path = paths[index]
    path.classList.add('jny-hop-gap')
    // Inline, not a stylesheet rule: mermaid scopes its own edge styles by the
    // render id (`#<renderId> .flowchart-link { stroke: … }`), and an id
    // selector outranks any class rule the console can write. Measured — the
    // class alone left the arrow grey. Same reason the node hues above are
    // inline.
    if (path instanceof SVGElement) path.style.stroke = 'var(--warning)'
  })
}

/** Rendering can only fail catastrophically; say so and still show the walk. */
function TextFallback({ summary }: { summary: JourneySummary }) {
  return (
    <div className="max-h-[480px] overflow-auto px-4 py-3">
      <p className="text-[12.5px] text-warning">Diagram unavailable — the walk is listed instead.</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">{summary.headline}</p>
      <ol className="mt-2 space-y-1 font-mono text-[11.5px] text-foreground/80">
        {summary.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  )
}
