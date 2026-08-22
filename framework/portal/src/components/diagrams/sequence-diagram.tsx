'use client'

import { useId, useMemo, useState } from 'react'
import { ExpandButton } from '@/components/diagrams/expand-button'
import { useExpandable } from '@/lib/diagrams/use-expandable'
import type { EntityKind } from '@/lib/catalog/frontmatter'
import type {
  FragmentLayout,
  LifelineLayout,
  MessageKind,
  MessageLayout,
  SequenceLayout,
  Workflow,
} from '@/lib/protocol/sequence'
import { layoutWorkflow, narrateWorkflow } from '@/lib/protocol/sequence'
import { kindColorVar } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

/**
 * The sequence diagram — hand-rolled SVG over a pure layout pass.
 *
 * React Flow is deliberately absent: it positions nodes freely and routes edges
 * between them, which is the opposite of what a sequence diagram is. Here the
 * geometry is a grid — lifelines are columns, steps are ordered rows, fragments
 * are nested boxes — so the drawing is a projection of `layoutWorkflow`, and
 * this file owns nothing but paint and interaction.
 *
 * Accessibility and AI-readability are the same requirement: the SVG is marked
 * decorative and the ordered list below it *is* the diagram in words. A picture
 * the catalog cannot state in prose is a picture the catalog cannot review.
 */

export interface SequenceParticipant {
  /** SRN of the component / product / actor behind the alias. */
  srn: string
  kind: EntityKind
  /** The entity's title — the lifeline header line. */
  label: string
  /** Free-form display role from the protocol's participant list. */
  role?: string
}

export interface SequenceDiagramProps {
  workflow: Workflow
  /** Alias → the entity the lifeline stands for. */
  participants: Record<string, SequenceParticipant>
  /** Called with a payload datamodel's absolute SRN. */
  onNavigate?: (srn: string) => void
  /**
   * Step and fragment paths the source side is pointing at. The path a step
   * carries *is* its position in the YAML, so no translation happens here — the
   * diagram lights whatever it is handed by the same key it already owns.
   */
  activeAnchors?: readonly string[]
  /** The pointer moved onto a row, or off every row (null). */
  onAnchorHover?: (path: string | null) => void
  /** A row was clicked; the selection outlives the pointer. */
  onAnchorSelect?: (path: string | null) => void
  className?: string
}

interface ArrowStyle {
  stroke: string
  strokeOpacity: number
  dash?: string
  head: 'filled' | 'open'
  headTone: 'default' | 'error'
}

/**
 * protocol.md's rendering mapping, one row per `kind`. Only `error` carries a
 * hue, and it is the semantic destructive token rather than an ontology colour:
 * a failure reply is not an entity kind.
 */
const ARROW_STYLES: Record<MessageKind, ArrowStyle> = {
  call: { stroke: 'var(--foreground)', strokeOpacity: 0.8, head: 'filled', headTone: 'default' },
  return: { stroke: 'var(--foreground)', strokeOpacity: 0.7, dash: '5 4', head: 'open', headTone: 'default' },
  event: { stroke: 'var(--foreground)', strokeOpacity: 0.8, head: 'open', headTone: 'default' },
  error: { stroke: 'var(--destructive)', strokeOpacity: 1, dash: '5 4', head: 'open', headTone: 'error' },
}

const DATAMODEL_COLOR = kindColorVar('datamodel')

export function SequenceDiagram({
  workflow,
  participants,
  onNavigate,
  activeAnchors,
  onAnchorHover,
  onAnchorSelect,
  className,
}: SequenceDiagramProps) {
  // SVG marker ids must be unique per instance and valid in a url(#…) reference.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [hoveredLane, setHoveredLane] = useState<number | null>(null)
  const { expanded, toggle: toggleExpanded } = useExpandable()

  const lit = useMemo(() => new Set(activeAnchors ?? []), [activeAnchors])
  const linked = Boolean(onAnchorHover || onAnchorSelect)

  const labelOf = useMemo(
    () => (alias: string) => participants[alias]?.label ?? alias,
    [participants],
  )

  const layout: SequenceLayout = useMemo(
    () => layoutWorkflow(workflow, { label: labelOf }),
    [workflow, labelOf],
  )

  const narration = useMemo(() => narrateWorkflow(workflow, labelOf), [workflow, labelOf])

  // One entry per distinct datamodel, in first-use order — the keyboard-reachable
  // counterpart of the chips drawn on the arrows.
  const payloads = useMemo(() => {
    const seen = new Map<string, string>()
    for (const message of layout.messages) {
      const { chip } = message
      if (chip?.srn && !seen.has(chip.srn)) seen.set(chip.srn, chip.label)
    }
    return [...seen].map(([srn, label]) => ({ srn, label }))
  }, [layout])

  const laneOpacity = (index: number) => (hoveredLane !== null && hoveredLane !== index ? 0.28 : 1)
  const rowOpacity = (message: MessageLayout) =>
    hoveredLane !== null && !message.lanes.includes(hoveredLane) ? 0.22 : 1

  const clearHover = () => {
    setHoveredRow(null)
    setHoveredLane(null)
    onAnchorHover?.(null)
  }

  const enterRow = (path: string) => {
    setHoveredRow(path)
    onAnchorHover?.(path)
  }

  return (
    <figure
      data-expanded={expanded || undefined}
      className={cn(
        'panel overflow-hidden',
        expanded && 'fixed inset-0 z-50 flex flex-col rounded-none border-0 bg-background',
        className,
      )}
      // A figure is named by `aria-label` and by nothing else — a `figcaption`,
      // visible or not, does not name it (verified in Chrome against a
      // three-figure control page). Without this the figure is anonymous in the
      // accessibility tree, and a page carrying two sequence diagrams offers two
      // unnamed figures. The visible caption below still reads as content.
      aria-label={`Sequence diagram: ${workflow.title}`}
    >
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <h3 className="text-[13px] font-medium text-foreground">{workflow.title}</h3>
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">{workflow.name}</span>
        {/* In the caption rather than floating over the drawing, as the two
            mermaid diagrams do it: this figure has a header bar and they do not,
            and the corner an overlay would take is where the rightmost lifeline
            header sits. */}
        <ExpandButton expanded={expanded} onToggle={toggleExpanded} className="ml-auto self-center" />
        {workflow.summary && (
          <p className="basis-full text-[12.5px] leading-5 text-muted-foreground">{workflow.summary}</p>
        )}
      </figcaption>

      {/*
        Fit the drawing to the pane, up to its natural size.

        This used to hold the grid at `minWidth: layout.width` and let the frame
        scroll, on the argument that a squashed diagram is worse than a scrolled
        one. In the artifact block that argument loses: the drawing gets 1.1fr of
        a split column — around 570px against a place-order layout of 1120 — so
        the first thing a reader saw was a drawing sliced down the middle, with
        the half that names the participants off-screen. Nothing was lost (the
        pane scrolled), but a cut-off picture reads as a broken one.

        The fit is CSS rather than a measured transform: `width: 100%` against a
        viewBox scales the whole drawing, text and hit targets alike, and it is
        already right on the server's first paint — no ResizeObserver, no frame
        where the untruncated width flashes. `maxWidth` is the natural width, so
        a pane wider than the drawing draws it at 1:1 rather than blowing it up.
        Scrolling survives for the case CSS cannot help with: expanded, where the
        drawing is capped at 1:1 and may be taller than the window.
      */}
      <div className={cn('overflow-auto overscroll-x-contain', expanded && 'min-h-0 flex-1')}>
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ width: '100%', maxWidth: layout.width, height: 'auto' }}
          className="block select-none"
          aria-hidden="true"
          focusable="false"
          onMouseLeave={clearHover}
        >
          <defs>
            <marker
              id={`${uid}-filled`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M0,0.5 L10,5 L0,9.5 Z" fill="var(--foreground)" fillOpacity="0.85" />
            </marker>
            <marker
              id={`${uid}-open`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M0.8,0.8 L9.2,5 L0.8,9.2"
                fill="none"
                stroke="var(--foreground)"
                strokeOpacity="0.85"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
            <marker
              id={`${uid}-open-error`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path
                d="M0.8,0.8 L9.2,5 L0.8,9.2"
                fill="none"
                stroke="var(--destructive)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>

          {/* Fragments first: they are the substrate the rows sit on. */}
          <g>
            {layout.fragments.map((fragment) => (
              <FragmentBox key={fragment.path} fragment={fragment} lit={lit.has(fragment.path)} />
            ))}
          </g>

          {/* Hover bands double as the hit targets for the whole row. */}
          <g>
            {layout.messages.map((message) => (
              <rect
                key={`band-${message.path}`}
                x={0}
                y={message.rowTop}
                width={layout.width}
                height={message.rowHeight}
                fill="var(--surface-raised)"
                opacity={hoveredRow === message.path || lit.has(message.path) ? 1 : 0}
                pointerEvents="all"
                className={cn(
                  'transition-opacity duration-150 motion-reduce:transition-none',
                  linked && 'cursor-pointer',
                )}
                onMouseEnter={() => enterRow(message.path)}
                onClick={() => onAnchorSelect?.(message.path)}
              />
            ))}
          </g>

          {/* The marker for "these are the lines the caret is in". A bar in the
              margin rather than a tint on the row: the row tint already means
              hover, and one channel may carry one meaning. */}
          <g pointerEvents="none">
            {layout.messages
              .filter((message) => lit.has(message.path))
              .map((message) => (
                <rect
                  key={`lit-${message.path}`}
                  x={0}
                  y={message.rowTop}
                  width={3}
                  height={message.rowHeight}
                  fill="var(--primary)"
                />
              ))}
          </g>

          <g pointerEvents="none">
            {layout.lifelines.map((lifeline) => (
              <Lifeline
                key={lifeline.alias}
                lifeline={lifeline}
                participant={participants[lifeline.alias]}
                opacity={laneOpacity(lifeline.index)}
                onEnter={() => setHoveredLane(lifeline.index)}
                onLeave={() => setHoveredLane(null)}
              />
            ))}
          </g>

          <g pointerEvents="none">
            {layout.messages.map((message) => (
              <Message
                key={message.path}
                message={message}
                uid={uid}
                opacity={rowOpacity(message)}
                onNavigate={onNavigate}
                onEnter={() => enterRow(message.path)}
              />
            ))}
          </g>
        </svg>
      </div>

      {payloads.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Payloads</span>
          {payloads.map((payload) =>
            onNavigate ? (
              <button
                key={payload.srn}
                type="button"
                onClick={() => onNavigate(payload.srn)}
                title={payload.srn}
                className="focusable rounded border border-kind-datamodel/30 bg-kind-datamodel/10 px-1.5 py-0.5
                           font-mono text-[11px] text-kind-datamodel transition hover:bg-kind-datamodel/20
                           motion-reduce:transition-none"
              >
                {payload.label}
              </button>
            ) : (
              <span
                key={payload.srn}
                title={payload.srn}
                className="rounded border border-kind-datamodel/30 bg-kind-datamodel/10 px-1.5 py-0.5
                           font-mono text-[11px] text-kind-datamodel"
              >
                {payload.label}
              </span>
            ),
          )}
        </div>
      )}

      {/*
        The text equivalent. Visually hidden, but it is the canonical reading of
        the diagram for screen readers, for grep, and for a model given the DOM.
      */}
      <ol className="sr-only">
        {narration.map((line) => (
          <li key={`${line.kind}-${line.path}`}>{line.text}</li>
        ))}
      </ol>
    </figure>
  )
}

function Lifeline({
  lifeline,
  participant,
  opacity,
  onEnter,
  onLeave,
}: {
  lifeline: LifelineLayout
  participant?: SequenceParticipant
  opacity: number
  onEnter: () => void
  onLeave: () => void
}) {
  const color = participant ? kindColorVar(participant.kind) : 'var(--border-strong)'
  const titleChars = Math.floor((lifeline.headWidth - 24) / (12.5 * 0.53))
  const aliasChars = Math.floor((lifeline.headWidth - 24) / (10.5 * 0.6))

  return (
    <g
      opacity={opacity}
      className="transition-opacity duration-150 motion-reduce:transition-none"
    >
      <line
        x1={lifeline.x}
        x2={lifeline.x}
        y1={lifeline.top}
        y2={lifeline.bottom}
        stroke="var(--border-strong)"
        strokeWidth={1}
        strokeDasharray="3 6"
      />
      <g pointerEvents="all" onMouseEnter={onEnter} onMouseLeave={onLeave}>
        <rect
          x={lifeline.headX}
          y={lifeline.headY}
          width={lifeline.headWidth}
          height={lifeline.headHeight}
          rx={6}
          fill={color}
          fillOpacity={0.12}
          stroke={color}
          strokeOpacity={0.45}
        />
        <text
          x={lifeline.x}
          y={lifeline.headY + 19}
          textAnchor="middle"
          fontSize={12.5}
          fill="var(--foreground)"
          className="font-sans"
        >
          {truncate(lifeline.label, titleChars)}
        </text>
        <text
          x={lifeline.x}
          y={lifeline.headY + 34}
          textAnchor="middle"
          fontSize={10.5}
          fill={color}
          className="font-mono"
        >
          {truncate(lifeline.alias, aliasChars)}
        </text>
      </g>
    </g>
  )
}

function Message({
  message,
  uid,
  opacity,
  onNavigate,
  onEnter,
}: {
  message: MessageLayout
  uid: string
  opacity: number
  onNavigate?: (srn: string) => void
  onEnter: () => void
}) {
  const style = ARROW_STYLES[message.step.kind]
  const marker =
    style.head === 'filled'
      ? `url(#${uid}-filled)`
      : style.headTone === 'error'
        ? `url(#${uid}-open-error)`
        : `url(#${uid}-open)`
  const textColor = message.step.kind === 'error' ? 'var(--destructive)' : 'var(--foreground)'

  return (
    <g opacity={opacity} className="transition-opacity duration-150 motion-reduce:transition-none">
      {message.arrows.map((arrow, index) =>
        arrow.self ? (
          <path
            key={index}
            d={`M ${arrow.fromX} ${arrow.y} H ${arrow.loopX} V ${arrow.loopBottomY} H ${arrow.fromX + 4}`}
            fill="none"
            stroke={style.stroke}
            strokeOpacity={style.strokeOpacity}
            strokeWidth={1.4}
            strokeDasharray={style.dash}
            markerEnd={marker}
          />
        ) : (
          <line
            key={index}
            x1={arrow.fromX}
            x2={arrow.toX}
            y1={arrow.y}
            y2={arrow.y}
            stroke={style.stroke}
            strokeOpacity={style.strokeOpacity}
            strokeWidth={1.4}
            strokeDasharray={style.dash}
            markerEnd={marker}
          />
        ),
      )}

      <text
        x={message.labelX}
        y={message.labelY}
        textAnchor={message.labelAnchor === 'middle' ? 'middle' : 'start'}
        fontSize={11.5}
        fill={textColor}
        fillOpacity={message.step.kind === 'error' ? 1 : 0.9}
        className="font-sans"
      >
        {message.label}
        {message.channel && (
          <tspan dx={6} fontSize={10} fill="var(--muted-foreground)" className="font-mono">
            {message.channel}
          </tspan>
        )}
      </text>

      {message.chip && (
        <g
          pointerEvents={onNavigate && message.chip.srn ? 'all' : 'none'}
          onMouseEnter={onEnter}
          onClick={() => {
            if (onNavigate && message.chip?.srn) onNavigate(message.chip.srn)
          }}
          className={onNavigate && message.chip.srn ? 'cursor-pointer' : undefined}
        >
          <rect
            x={message.chip.x}
            y={message.chip.y}
            width={message.chip.width}
            height={message.chip.height}
            rx={3}
            fill={DATAMODEL_COLOR}
            fillOpacity={0.14}
            stroke={DATAMODEL_COLOR}
            strokeOpacity={0.35}
          />
          <text
            x={message.chip.x + message.chip.width / 2}
            y={message.chip.y + message.chip.height - 4}
            textAnchor="middle"
            fontSize={10.5}
            fill={DATAMODEL_COLOR}
            className="font-mono"
          >
            {message.chip.label}
          </text>
        </g>
      )}

      {message.note && (
        <g>
          <line
            x1={message.note.anchorX}
            x2={message.note.x}
            y1={message.note.anchorY}
            y2={message.note.y + message.note.height / 2}
            stroke="var(--border-strong)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
          {/* UML note: a folded top-right corner, drawn rather than iconified. */}
          <path
            d={`M ${message.note.x} ${message.note.y}
                H ${message.note.x + message.note.width - 10}
                L ${message.note.x + message.note.width} ${message.note.y + 10}
                V ${message.note.y + message.note.height}
                H ${message.note.x} Z`}
            fill="var(--surface-raised)"
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
          <path
            d={`M ${message.note.x + message.note.width - 10} ${message.note.y}
                V ${message.note.y + 10}
                H ${message.note.x + message.note.width}`}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={1}
          />
          {message.note.lines.map((line, index) => (
            <text
              key={index}
              x={message.note!.x + 8}
              y={message.note!.y + 8 + (index + 1) * 14 - 3}
              fontSize={11}
              fill="var(--muted-foreground)"
              className="font-sans"
            >
              {line}
            </text>
          ))}
        </g>
      )}
    </g>
  )
}

function FragmentBox({ fragment, lit = false }: { fragment: FragmentLayout; lit?: boolean }) {
  const tabHeight = 20

  return (
    <g>
      <rect
        x={fragment.x}
        y={fragment.y}
        width={fragment.width}
        height={fragment.height}
        rx={5}
        fill="var(--surface)"
        fillOpacity={0.4}
        stroke={lit ? 'var(--primary)' : 'var(--border-strong)'}
        strokeWidth={lit ? 1.5 : 1}
      />
      <path
        d={`M ${fragment.x} ${fragment.y}
            H ${fragment.x + fragment.tabWidth}
            L ${fragment.x + fragment.tabWidth - 9} ${fragment.y + tabHeight}
            H ${fragment.x} Z`}
        fill="var(--surface-raised)"
        stroke="var(--border-strong)"
        strokeWidth={1}
      />
      <text
        x={fragment.x + 9}
        y={fragment.y + tabHeight - 6}
        fontSize={10.5}
        fill="var(--muted-foreground)"
        className="font-sans"
        style={{ letterSpacing: '0.06em' }}
      >
        {fragment.tab}
      </text>

      {fragment.compartments.map((compartment) => (
        <g key={compartment.path}>
          {compartment.separatorY !== null && (
            <line
              x1={fragment.x}
              x2={fragment.x + fragment.width}
              y1={compartment.separatorY}
              y2={compartment.separatorY}
              stroke="var(--border-strong)"
              strokeWidth={1}
              strokeDasharray="5 5"
            />
          )}
          <text
            x={compartment.labelX}
            y={compartment.labelY}
            fontSize={10.5}
            fill="var(--muted-foreground)"
            className="font-mono"
          >
            {compartment.label}
          </text>
        </g>
      ))}
    </g>
  )
}

function truncate(text: string, maxChars: number): string {
  if (maxChars < 4 || text.length <= maxChars) return text
  return `${text.slice(0, maxChars - 1)}…`
}
