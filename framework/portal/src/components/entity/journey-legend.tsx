import { ArrowRight, CornerDownRight, TriangleAlert } from 'lucide-react'
import { EntityLink, type LinkTarget } from '@/components/entity-link'

/**
 * The journey's steps as real, navigable references — the ladder beneath the
 * drawing.
 *
 * Mermaid's own click bindings are off (the shared loader runs at
 * `securityLevel: 'strict'`, which is not a setting to relax for one diagram),
 * and its labels are drawn text, not markup — so a step's `touches` and
 * `protocol` cannot become entity badges *inside* the SVG without a second,
 * looser mermaid. Dropping the references was the other option and the wrong
 * one: reaching the entity a step touches is the whole point of a journey page.
 *
 * So the drawing carries the shape and the order, and this carries the links.
 * It is also the accessible copy of the walk — the SVG is `aria-hidden`, these
 * are focusable links in document order — and the only place a step's note is
 * shown in full. kinds/journey.md calls it the step ladder: ordinal, actor,
 * touched entity, protocol chip, note, with hand-off rows marked.
 */

export interface JourneyLegendStep {
  ordinal: number
  actor: LinkTarget | null
  actorRef: string
  /** This step's actor differs from the previous step's. */
  handoff: boolean
  touches: LinkTarget | null
  touchesRef: string
  /** This step's owning product differs from the previous step's. */
  crossing: boolean
  protocol: LinkTarget | null
  protocolRef?: string
  /** The step wrote `protocol: none` — the actor carries the hop. */
  actorCarried: boolean
  note?: string
}

export function JourneyLegend({ steps }: { steps: readonly JourneyLegendStep[] }) {
  if (steps.length === 0) return null

  return (
    <div>
      <p className="mb-2 text-[11px] tracking-wider text-muted-foreground uppercase">Steps</p>
      <ol className="space-y-1.5">
        {steps.map((step) => (
          <li key={step.ordinal} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="w-4 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
              {step.ordinal}
            </span>
            {/* A hand-off is the row a reader most needs to spot, so it is
                marked on the row itself rather than left to be inferred from
                two adjacent actor names being different. */}
            {step.handoff && (
              <CornerDownRight className="size-3 shrink-0 self-center text-muted-foreground" aria-label="hand-off" />
            )}
            <EntityLink target={step.actor} reference={step.actorRef} />
            <ArrowRight className="size-3 shrink-0 self-center text-muted-foreground/70" aria-hidden />
            <EntityLink target={step.touches} reference={step.touchesRef} />
            {step.protocolRef ? (
              <>
                <span className="text-[11px] text-muted-foreground">via</span>
                <EntityLink target={step.protocol} reference={step.protocolRef} />
              </>
            ) : step.actorCarried ? (
              <span
                title="protocol: none — the actor carries this hop, and there is nothing to write down"
                className="rounded border border-border px-1.5 py-[1px] font-mono text-[11px] text-muted-foreground"
              >
                actor-carried
              </span>
            ) : (
              step.crossing && (
                <span className="flex items-center gap-1 text-[11.5px] text-warning">
                  <TriangleAlert className="size-3 shrink-0" aria-hidden />
                  crosses a product boundary with no protocol
                </span>
              )
            )}
            {step.note && <span className="text-[12.5px] text-muted-foreground">{step.note}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
