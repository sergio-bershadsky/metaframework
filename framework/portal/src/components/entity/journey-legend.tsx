import { ArrowRight, CornerDownRight, TriangleAlert } from 'lucide-react'
import { EntityLink, type LinkTarget } from '@/components/entity-link'
import { cn } from '@/lib/utils'

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
 *
 * The ladder is drawn as a RAIL — ordinals in nodes, a connector between them —
 * because a journey is a walk and a walk has a line. The connector reuses the
 * derived diagram's own edge language, so the ladder and the drawing above it
 * read as two views of one thing: SOLID means the hop rides a named protocol,
 * DOTTED means `protocol: none` — the actor carries it — and DASHED in the
 * warning colour is the one case worth an alarm, a product boundary crossed
 * with nothing written down. The connector above step N describes the hop INTO
 * step N, which is the same fact that step's own chips state.
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

/** The connector's border style, in the drawing's own edge language. */
function connectorClass(step: JourneyLegendStep): string {
  if (step.crossing && !step.protocolRef && !step.actorCarried) {
    return 'border-warning/60 border-dashed'
  }
  if (step.actorCarried) return 'border-border-strong border-dotted'
  return 'border-border-strong border-solid'
}

export function JourneyLegend({ steps }: { steps: readonly JourneyLegendStep[] }) {
  if (steps.length === 0) return null

  return (
    <div>
      <p className="mb-3 text-[11px] tracking-wider text-muted-foreground uppercase">Steps</p>
      <ol>
        {steps.map((step, index) => {
          const first = index === 0
          const last = index === steps.length - 1
          return (
            <li key={step.ordinal} className="group/step grid grid-cols-[24px_minmax(0,1fr)] gap-x-3">
              {/* The rail. Split into the segment above the node and the one
                  below because they carry different facts: the one ABOVE is
                  the hop into this step (styled by it), the one BELOW belongs
                  to the next step and is only a lead-in, always quiet. */}
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className={cn('w-0 border-l', first ? 'h-1 border-transparent' : 'h-2', !first && connectorClass(step))}
                />
                <span
                  className={cn(
                    'grid size-6 shrink-0 place-items-center rounded-full border bg-surface font-mono text-[10.5px] tabular-nums',
                    // A hand-off is the row a reader most needs to spot: its
                    // node steps forward instead of receding with the rail.
                    step.handoff
                      ? 'border-border-strong text-foreground ring-1 ring-border-strong/50'
                      : 'border-border text-muted-foreground',
                  )}
                >
                  {step.ordinal}
                </span>
                {!last && (
                  <span aria-hidden className={cn('w-0 min-h-3 flex-1 border-l', connectorClass(steps[index + 1]))} />
                )}
              </div>

              <div
                className={cn(
                  '-mx-2 mb-1 rounded-md px-2 py-1 transition-colors group-hover/step:bg-surface-raised/40',
                  !last && 'pb-2.5',
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {step.handoff && (
                    <CornerDownRight className="size-3 shrink-0 text-muted-foreground" aria-label="hand-off" />
                  )}
                  <EntityLink target={step.actor} reference={step.actorRef} />
                  <ArrowRight className="size-3 shrink-0 text-muted-foreground/70" aria-hidden />
                  <EntityLink target={step.touches} reference={step.touchesRef} />
                  {step.protocolRef ? (
                    <>
                      <span className="text-[11px] text-muted-foreground">via</span>
                      <EntityLink target={step.protocol} reference={step.protocolRef} />
                    </>
                  ) : step.actorCarried ? (
                    <span
                      title="protocol: none — the actor carries this hop, and there is nothing to write down"
                      className="rounded border border-dotted border-border-strong px-1.5 py-[1px] font-mono text-[10.5px] text-muted-foreground"
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
                </div>
                {/* The note on its own line, always: mixed into the badge row it
                    started at a different x on every step and the ladder read
                    as noise rather than as a walk. */}
                {step.note && (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{step.note}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
