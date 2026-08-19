'use client'

import {
  BaseEdge,
  Background,
  BackgroundVariant,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ExpandButton } from '@/components/diagrams/expand-button'
import { useExpandable } from '@/lib/diagrams/use-expandable'
import { useGraphHighlight } from '@/lib/diagrams/use-graph-highlight'
import {
  DIAGRAM_BACKGROUND,
  DIAGRAM_CANVAS_VARS,
  fitCanvasHeight,
  layoutGraph,
  type LayoutDirection,
  type LayoutNode,
} from '@/lib/diagrams/layout'
import { stateChartSummary, type StateChart, type StateChartNode } from '@/lib/protocol/states'
import { kindColorVar } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

import '@xyflow/react/dist/style.css'

/**
 * The state chart derived from a protocol's `states.json`.
 *
 * UML conventions the spec asks for, and how they are drawn here: the initial
 * state carries the entry dot, final states are double-bordered, compound
 * states are nested regions, and every transition is labelled
 * `EVENT [guard] / actions`. The chart belongs to a protocol, so its accents
 * come from the protocol hue — colour stays ontology even inside a diagram.
 */

export interface StateChartDiagramProps {
  chart: StateChart
  /** Canvas height in pixels. Default 480. */
  height?: number
  /** `DOWN` reads as a flow of time and is the default for a conversation. */
  direction?: LayoutDirection
  className?: string
}

interface StateNodeData extends Record<string, unknown> {
  label: string
  description: string | null
  entry: string[]
  exit: string[]
  tags: string[]
  initial: boolean
  final: boolean
  compound: boolean
  direction: LayoutDirection
}

interface TransitionEdgeData extends Record<string, unknown> {
  event: string
  guard: string | null
  actions: string[]
  description: string | null
  internal: boolean
  self: boolean
  /** Rank among the transitions sharing this source and target; see buildFlow. */
  lane: number
}

type StateFlowNode = Node<StateNodeData, 'state'>
type TransitionFlowEdge = Edge<TransitionEdgeData, 'transition'>

const PROTOCOL_HUE = kindColorVar('protocol')

/** Handle ids are shared between the node chrome and the edge wiring. */
const HANDLE = { in: 'in', out: 'out', selfOut: 'self-out', selfIn: 'self-in' } as const

// Inline rather than utility classes: React Flow ships its own `.react-flow__handle`
// rules, and inline style is the only override that does not depend on the order
// the two stylesheets happen to land in.
const HANDLE_STYLE = { width: 6, height: 6, border: 'none', background: 'var(--border-strong)' } as const
const HIDDEN_HANDLE = { width: 6, height: 6, border: 'none', background: 'transparent' } as const

function StateBox({ data }: NodeProps<StateFlowNode>) {
  const flowsDown = data.direction === 'DOWN'
  const target = flowsDown ? Position.Top : Position.Left
  const source = flowsDown ? Position.Bottom : Position.Right

  return (
    <div
      className={cn(
        'relative h-full w-full rounded-md border text-left transition-colors',
        data.compound
          ? 'border-dashed border-border-strong bg-surface/40'
          : 'border-border-strong bg-surface-raised shadow-[0_1px_0_0_oklch(1_0_0/0.04)_inset]',
      )}
      style={
        data.final
          ? { borderColor: PROTOCOL_HUE, boxShadow: `inset 0 0 0 3px var(--surface-raised), inset 0 0 0 4px ${PROTOCOL_HUE}` }
          : undefined
      }
    >
      <Handle type="target" position={target} id={HANDLE.in} style={HANDLE_STYLE} />
      <Handle type="source" position={source} id={HANDLE.out} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id={HANDLE.selfOut} style={{ ...HIDDEN_HANDLE, top: '28%' }} />
      <Handle type="target" position={Position.Right} id={HANDLE.selfIn} style={{ ...HIDDEN_HANDLE, top: '72%' }} />

      <div className={cn('px-3', data.compound ? 'pt-2.5' : 'py-2.5')}>
        <p className="flex items-center gap-1.5 font-mono text-[12.5px] leading-tight tracking-tight text-foreground">
          {/* The UML initial pseudostate. It sits inside the box rather than
              floating above it: an entry dot outside a nested state lands on
              top of its parent region's header. */}
          {data.initial && (
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: PROTOCOL_HUE }}
              title="initial state"
            />
          )}
          <span className="truncate" title={data.label}>
            {data.label}
          </span>
        </p>
        {data.description && (
          <p
            className={cn(
              'mt-1 text-[11px] leading-snug text-muted-foreground',
              data.compound ? 'line-clamp-1' : 'line-clamp-2',
            )}
          >
            {data.description}
          </p>
        )}
        {(data.entry.length > 0 || data.exit.length > 0) && (
          <p className="mt-1.5 space-x-2 font-mono text-[10.5px] leading-snug text-muted-foreground">
            {data.entry.length > 0 && <span>entry / {data.entry.join(', ')}</span>}
            {data.exit.length > 0 && <span>exit / {data.exit.join(', ')}</span>}
          </p>
        )}
        {data.tags.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1">
            {data.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-border px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  )
}

function TransitionEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<TransitionFlowEdge>) {
  const self = data?.self ?? false
  const loop = 56

  let path: string
  let midX: number
  let midY: number
  if (self) {
    // Both endpoints sit on the same side of the node, so a bezier through two
    // control points pushed outwards is the only shape that reads as a loop.
    path = `M ${sourceX},${sourceY} C ${sourceX + loop},${sourceY} ${targetX + loop},${targetY} ${targetX},${targetY}`
    midX = Math.max(sourceX, targetX) + loop * 0.6
    midY = (sourceY + targetY) / 2
  } else {
    ;[path, midX, midY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke: 'var(--border-strong)', strokeDasharray: data?.internal ? '4 3' : undefined }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute whitespace-nowrap rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10.5px] leading-tight text-foreground/85"
          style={{
            // The label renderer sits below nested nodes in paint order, so the
            // chip lifts itself out; a label hidden behind a region box is worse
            // than one overlapping it.
            zIndex: 50,
            // A self-loop label hangs off the right of its own node, so it is
            // anchored by its left edge instead of centred on the curve.
            transform: `translate(${self ? '0' : '-50%'}, -50%) translate(${midX}px, ${
              midY + (data?.lane ?? 0) * 16
            }px)`,
          }}
          title={data?.description ?? undefined}
        >
          <span>{data?.event}</span>
          {data?.guard && <span className="text-muted-foreground"> [{data.guard}]</span>}
          {data && data.actions.length > 0 && (
            <span style={{ color: PROTOCOL_HUE }}> / {data.actions.join(', ')}</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes: NodeTypes = { state: StateBox }
const edgeTypes: EdgeTypes = { transition: TransitionEdge }

/** Keeps the fitted graph clear of the overlays: controls left, legend right. */
const FIT_PADDING = { top: '24px', right: '104px', bottom: '24px', left: '48px' } as const

/**
 * Sizes are estimated rather than measured: ELK needs them before anything is
 * in the DOM, and a two-pass measure-then-layout makes the chart visibly jump.
 * The constants are calibrated for IBM Plex Mono at 12.5px / Archivo at 11px.
 */
const MONO_CHAR = 7
const SANS_CHAR = 5.6
const MIN_WIDTH = 168
const MAX_WIDTH = 272

function measure(node: StateChartNode): { width: number; height: number } {
  const actions = [
    node.entry.length > 0 ? `entry / ${node.entry.join(', ')}` : '',
    node.exit.length > 0 ? `exit / ${node.exit.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('  ')

  const width = clamp(
    Math.max(
      node.key.length * MONO_CHAR + (node.initial ? 14 : 0),
      actions.length * 6,
      node.tags.join(' ').length * 6.5,
      node.description ? Math.min(node.description.length * SANS_CHAR, MAX_WIDTH) : 0,
    ) + 26,
    MIN_WIDTH,
    MAX_WIDTH,
  )

  const descriptionLines = node.description
    ? Math.min(2, Math.ceil((node.description.length * SANS_CHAR) / (width - 26)))
    : 0

  const height =
    20 + // vertical padding
    16 + // name
    descriptionLines * 14 +
    (node.entry.length > 0 || node.exit.length > 0 ? 15 : 0) +
    (node.tags.length > 0 ? 18 : 0)

  return { width, height }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * A compound state draws its own header inside its box, so its children have to
 * start below whatever that header actually contains — a fixed inset either
 * wastes space or lets the nested boxes sit on the description.
 */
function compoundHeader(node: StateChartNode): number {
  return (
    30 +
    (node.description ? 16 : 0) +
    (node.entry.length > 0 || node.exit.length > 0 ? 15 : 0) +
    (node.tags.length > 0 ? 18 : 0)
  )
}

/** Label chips are one line, so ELK only needs their run length. */
function labelSize(event: string, guard: string | null, actions: string[]): { width: number; height: number } {
  const text = [event, guard ? `[${guard}]` : '', actions.length > 0 ? `/ ${actions.join(', ')}` : ''].join(' ')
  return { width: text.length * 6.2 + 14, height: 18 }
}

interface Flow {
  nodes: StateFlowNode[]
  edges: TransitionFlowEdge[]
}

async function buildFlow(chart: StateChart, direction: LayoutDirection): Promise<Flow> {
  const layoutNodes: LayoutNode[] = chart.nodes.map((node) => ({
    id: node.id,
    ...measure(node),
    parent: node.parent,
    padding: node.compound ? { top: compoundHeader(node), right: 18, bottom: 18, left: 18 } : undefined,
  }))

  const result = await layoutGraph({
    nodes: layoutNodes,
    edges: chart.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: labelSize(edge.event, edge.guard, edge.actions),
    })),
    direction,
  })
  const placed = new Map(result.nodes.map((node) => [node.id, node]))

  const nodes: StateFlowNode[] = chart.nodes.map((node) => {
    const box = placed.get(node.id)
    return {
      id: node.id,
      type: 'state',
      position: { x: box?.x ?? 0, y: box?.y ?? 0 },
      style: { width: box?.width ?? MIN_WIDTH, height: box?.height ?? 56 },
      parentId: node.parent ?? undefined,
      extent: node.parent ? 'parent' : undefined,
      selectable: false,
      data: {
        label: node.key,
        description: node.description,
        entry: node.entry,
        exit: node.exit,
        tags: node.tags,
        initial: node.initial,
        final: node.final,
        compound: node.compound,
        direction,
      },
    }
  })

  // Two transitions between the same pair of states share one curve, so their
  // labels would land on the same pixel; the lane number stacks them instead.
  const lanes = new Map<string, number>()

  const edges: TransitionFlowEdge[] = chart.edges.map((edge) => {
    const pair = `${edge.source}->${edge.target}`
    const lane = lanes.get(pair) ?? 0
    lanes.set(pair, lane + 1)

    return {
      id: edge.id,
      type: 'transition',
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.self ? HANDLE.selfOut : HANDLE.out,
      targetHandle: edge.self ? HANDLE.selfIn : HANDLE.in,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: 'var(--border-strong)' },
      ariaLabel: `${edge.source} on ${edge.event} to ${edge.target}`,
      data: {
        event: edge.event,
        guard: edge.guard,
        actions: edge.actions,
        internal: edge.internal,
        self: edge.self,
        description: edge.description,
        lane,
      },
    }
  })

  return { nodes, edges }
}

export function StateChartDiagram({ chart, height = 480, direction = 'DOWN', className }: StateChartDiagramProps) {
  const [flow, setFlow] = useState<Flow | null>(null)
  const [failed, setFailed] = useState(false)
  const summary = useMemo(() => stateChartSummary(chart), [chart])

  // The effect keys off the chart's *content*: a caller that rebuilds the chart
  // object on every render would otherwise relayout forever.
  const signature = useMemo(() => JSON.stringify(chart), [chart])
  const latest = useRef(chart)
  // Kept in a ref so the layout effect can read the newest value without
  // re-running on every render. Written in an effect rather than during render:
  // a render-phase ref write is unsafe when React renders concurrently or
  // double-invokes in StrictMode. This effect is declared first, so the value
  // is current before the layout effect below reads it.
  useEffect(() => {
    latest.current = chart
  })

  useEffect(() => {
    const source = latest.current
    if (source.nodes.length === 0) return
    let cancelled = false
    setFlow(null)
    setFailed(false)
    buildFlow(source, direction).then(
      (result) => {
        if (!cancelled) setFlow(result)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [signature, direction])

  // Same rule as the relation graph: the canvas fits the chart, and `height`
  // only caps how tall it may grow before panning takes over.
  const canvasHeight = useMemo(() => {
    const placedNodes = flow?.nodes ?? []
    if (placedNodes.length === 0) return fitCanvasHeight(null, height)
    let top = Number.POSITIVE_INFINITY
    let bottom = Number.NEGATIVE_INFINITY
    for (const node of placedNodes) {
      const nodeHeight = Number(node.style?.height ?? 0)
      top = Math.min(top, node.position.y)
      bottom = Math.max(bottom, node.position.y + nodeHeight)
    }
    return fitCanvasHeight(bottom - top, height)
  }, [flow, height])
  const { expanded, toggle: toggleExpanded } = useExpandable()

  // Hovering a state reveals only what it connects to, and lifts that subgraph
  // above the rest so its transitions and labels stay readable.
  const highlight = useGraphHighlight(flow?.nodes ?? [], flow?.edges ?? [])
  const litNodes = useMemo(() => (flow?.nodes ?? []).map(highlight.decorate), [flow, highlight])
  const litEdges = useMemo(() => (flow?.edges ?? []).map(highlight.decorate), [flow, highlight])

  if (chart.nodes.length === 0) {
    return (
      <p className={cn('panel px-4 py-6 text-[13px] text-muted-foreground', className)}>
        This machine declares no states.
      </p>
    )
  }


  return (
    <figure
      data-expanded={expanded || undefined}
      className={cn(
        'panel diagram-surface overflow-hidden',
        expanded && 'fixed inset-0 z-50 rounded-none border-0 bg-background',
        className,
      )}
    >
      {/* A <figure> may carry exactly one <figcaption>, and the a11y text
          equivalent below is it — the machine's own description is plain prose. */}
      {chart.description && (
        <p className="border-b border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">{chart.description}</p>
      )}

      <div
        className="relative"
        style={{ height: expanded ? '100%' : canvasHeight, ...DIAGRAM_CANVAS_VARS }}
      >
        {failed ? (
          <TextFallback summary={summary} />
        ) : flow === null ? (
          <LayoutPending label="Laying out the state chart" />
        ) : (
          <ReactFlow
            nodes={litNodes}
            edges={litEdges}
            {...highlight.handlers}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode="dark"
            fitView
            fitViewOptions={{ padding: FIT_PADDING, maxZoom: 1 }}
            minZoom={0.2}
            maxZoom={2}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
            // The chart sits inside a scrolling document: hijacking the wheel
            // would trap the page. Zoom stays on the controls and on pinch.
            zoomOnScroll={false}
            panOnScroll={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: false }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={DIAGRAM_BACKGROUND.gap}
              size={DIAGRAM_BACKGROUND.size}
              color={DIAGRAM_BACKGROUND.color}
            />
            <Controls showInteractive={false} style={{ margin: 10 }} />
            <Panel position="top-right" style={{ margin: 10 }}>
              <div className="mb-1 flex justify-end">
                <ExpandButton
                  expanded={expanded}
                  onToggle={toggleExpanded}
                  className="rounded-md border border-border bg-surface/90 backdrop-blur-sm hover:bg-surface-raised"
                />
              </div>
              <ul className="flex flex-col gap-1 rounded-md border border-border bg-surface/90 px-2 py-1.5 font-mono text-[10.5px] text-muted-foreground backdrop-blur-sm">
                <li className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: PROTOCOL_HUE }} aria-hidden />
                  initial
                </li>
                <li className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-[2px] border"
                    style={{ borderColor: PROTOCOL_HUE, boxShadow: `inset 0 0 0 1px ${PROTOCOL_HUE}` }}
                    aria-hidden
                  />
                  final
                </li>
              </ul>
            </Panel>
          </ReactFlow>
        )}
      </div>

      <figcaption className="sr-only">
        <p>{summary.headline}</p>
        <ul>
          {summary.states.map((state) => (
            <li key={state}>{state}</li>
          ))}
        </ul>
        <ul>
          {summary.transitions.map((transition) => (
            <li key={transition}>{transition}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

function LayoutPending({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="grid grid-cols-3 gap-1.5" aria-hidden>
          {Array.from({ length: 6 }, (_, index) => (
            <span
              key={index}
              className="h-4 w-10 animate-pulse rounded-sm bg-muted"
              style={{ animationDelay: `${index * 90}ms` }}
            />
          ))}
        </div>
        <p className="font-mono text-[11px] tracking-tight text-muted-foreground">{label}…</p>
      </div>
    </div>
  )
}

/** Layout can only fail catastrophically (ELK failed to load); say so and still show the graph. */
function TextFallback({ summary }: { summary: ReturnType<typeof stateChartSummary> }) {
  return (
    <div className="h-full overflow-auto px-4 py-3">
      <p className="text-[12.5px] text-warning">Diagram layout unavailable — the machine is listed instead.</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">{summary.headline}</p>
      <ul className="mt-2 space-y-1 font-mono text-[11.5px] text-foreground/80">
        {summary.transitions.map((transition) => (
          <li key={transition}>{transition}</li>
        ))}
      </ul>
    </div>
  )
}
