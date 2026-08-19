'use client'

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import { Crosshair, Scan } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExpandButton } from '@/components/diagrams/expand-button'
import { MeasureProbe, type MeasuredGeometry } from '@/components/diagrams/measure-probe'
import { useExpandable } from '@/lib/diagrams/use-expandable'
import { useGraphHighlight } from '@/lib/diagrams/use-graph-highlight'
import type { EdgeType, EntityKind } from '@/lib/catalog/frontmatter'
import {
  DIAGRAM_BACKGROUND,
  DIAGRAM_CANVAS_VARS,
  fitCanvasHeight,
  layoutGraph,
  type LayoutDirection,
  type PlacedNode,
} from '@/lib/diagrams/layout'
import { kindColorVar, kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

import '@xyflow/react/dist/style.css'

/**
 * The entity relation graph — the semantic edges of frontmatter.md drawn as a
 * graph.
 *
 * The one rule that shapes the whole design: colour is ontology, so an edge
 * type may not own a hue. Edge types are told apart by stroke weight, dash
 * pattern and arrowhead, and the legend shows those samples rather than colour
 * chips. The accent hue is reserved for one thing the reader actually needs —
 * which edges touch the entity the page is about.
 */

export interface RelationGraphNode {
  srn: string
  /** Entity `name` — the mono identifier shown in the box. */
  name: string
  title: string
  kind: EntityKind
}

export interface RelationGraphEdge {
  /** Source SRN; must match a node's `srn`. */
  from: string
  /** Target SRN; must match a node's `srn`. */
  to: string
  edge: EdgeType
}

export interface RelationGraphProps {
  nodes: RelationGraphNode[]
  edges: RelationGraphEdge[]
  /** The entity the graph is about: accented, and the target of "centre". */
  focus?: string
  /** Called when a node is activated by click or keyboard. */
  onNavigate?: (srn: string) => void
  /** Canvas height in pixels. Default 420. */
  height?: number
  /** `RIGHT` reads as dependency direction and is the default. */
  direction?: LayoutDirection
  /** Names the graph for assistive technology. */
  label?: string
  className?: string
}

/**
 * Edge vocabulary. `sample` is the legend swatch, and it is the same dash
 * pattern the canvas draws — a legend that redraws its own key is a legend that
 * drifts from the graph.
 */
const EDGE_STYLES = {
  uses: { label: 'uses', width: 1.25, dash: undefined, marker: MarkerType.ArrowClosed },
  exposes: { label: 'exposes', width: 2, dash: undefined, marker: MarkerType.ArrowClosed },
  'depends-on': { label: 'depends on', width: 1.25, dash: '7 4', marker: MarkerType.ArrowClosed },
  implements: { label: 'implements', width: 1.25, dash: '1.5 3.5', marker: MarkerType.ArrowClosed },
  supersedes: { label: 'supersedes', width: 1.25, dash: '11 4', marker: MarkerType.Arrow },
} satisfies Record<EdgeType, { label: string; width: number; dash: string | undefined; marker: MarkerType }>

const EDGE_ORDER = Object.keys(EDGE_STYLES) as EdgeType[]

const EDGE_STROKE = 'var(--border-strong)'
const FOCUS_STROKE = 'var(--primary)'

interface EntityNodeData extends Record<string, unknown> {
  srn: string
  name: string
  title: string
  kind: EntityKind
  focused: boolean
  direction: LayoutDirection
  onNavigate?: (srn: string) => void
}

type EntityFlowNode = Node<EntityNodeData, 'entity'>
type RelationFlowEdge = Edge<Record<string, unknown>>

// Inline rather than utility classes: React Flow ships `.react-flow__handle`
// rules of its own, and inline style is the only override that does not depend
// on the order the two stylesheets happen to land in.
const HANDLE_STYLE = { width: 6, height: 6, border: 'none', background: 'var(--border-strong)' } as const
const HIDDEN_HANDLE = { width: 6, height: 6, border: 'none', background: 'transparent' } as const

function EntityBox({ data }: NodeProps<EntityFlowNode>) {
  const style = kindStyle(data.kind)
  const Icon = style.icon
  const hue = kindColorVar(data.kind)
  const flowsRight = data.direction === 'RIGHT'
  const navigate = data.onNavigate

  const body = (
    <>
      <Icon className="size-3.5 shrink-0" style={{ color: hue }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono text-[12px] leading-tight tracking-tight text-foreground">
          {data.name}
        </span>
        <span className="block truncate text-[11px] leading-tight text-muted-foreground">{data.title}</span>
      </span>
    </>
  )

  // No explicit size: the box is sized by its own content, which is what makes
  // the measurement React Flow takes of it worth re-running the layout on.
  const chrome = cn(
    'flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors',
    navigate && 'hover:bg-surface-raised',
  )
  const tint = {
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    borderColor: `color-mix(in oklab, ${hue} 45%, transparent)`,
    backgroundColor: `color-mix(in oklab, ${hue} 7%, var(--surface))`,
    ...(data.focused ? { outline: `1px solid ${FOCUS_STROKE}`, outlineOffset: 2 } : {}),
  }

  return (
    <>
      <Handle
        type="target"
        position={flowsRight ? Position.Left : Position.Top}
        id="in"
        style={HANDLE_STYLE}
      />
      <Handle
        type="source"
        position={flowsRight ? Position.Right : Position.Bottom}
        id="out"
        style={HANDLE_STYLE}
      />
      <Handle type="source" position={Position.Top} id="self-out" style={{ ...HIDDEN_HANDLE, left: '30%' }} />
      <Handle type="target" position={Position.Top} id="self-in" style={{ ...HIDDEN_HANDLE, left: '70%' }} />

      {navigate ? (
        <button
          type="button"
          // `nodrag` keeps a click from being swallowed by the pan gesture.
          className={cn(chrome, 'nodrag focusable cursor-pointer')}
          style={tint}
          onClick={() => navigate(data.srn)}
          title={data.srn}
        >
          {body}
        </button>
      ) : (
        <div className={chrome} style={tint} title={data.srn}>
          {body}
        </div>
      )}
    </>
  )
}

const nodeTypes: NodeTypes = { entity: EntityBox }

/** Keeps the fitted graph clear of the overlays: controls left, legend right. */
const FIT_PADDING = { top: '24px', right: '188px', bottom: '24px', left: '48px' } as const

/**
 * Estimates for the first pass only.
 *
 * ELK needs sizes before anything reaches the DOM, so the graph is laid out
 * once on these, rendered but not shown, measured by React Flow, and laid out
 * again on the truth. Being a few pixels out here therefore costs nothing.
 */
const MONO_CHAR = 7
const SANS_CHAR = 5.6
const NODE_HEIGHT = 47
const MIN_WIDTH = 156
const MAX_WIDTH = 268

function estimateBox(node: RelationGraphNode): { width: number; height: number } {
  const width = Math.min(
    MAX_WIDTH,
    Math.max(MIN_WIDTH, Math.max(node.name.length * MONO_CHAR, node.title.length * SANS_CHAR) + 42),
  )
  return { width, height: NODE_HEIGHT }
}

interface GraphLayout {
  placed: Map<string, PlacedNode>
  /** Height of the laid-out graph, for fitting the canvas to it. */
  contentHeight: number
  /** 1 = laid out on estimates, 2 = laid out on what the browser drew. */
  pass: 1 | 2
}

export function RelationGraph({
  nodes,
  edges,
  focus,
  onNavigate,
  height = 420,
  direction = 'RIGHT',
  label = 'Entity relation graph',
  className,
}: RelationGraphProps) {
  // Every piece of layout state is tagged with the layout it belongs to and
  // read back by comparison, rather than being cleared when the inputs change:
  // clearing means a setState inside an effect, and a cascade of renders.
  const [built, setBuilt] = useState<{ key: string; layout: GraphLayout } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<EdgeType>>(() => new Set())

  // Callers commonly build these arrays inline, so the effect keys off the
  // graph's *content*; keying off array identity would relayout every render.
  const signature = useMemo(
    () =>
      JSON.stringify([
        nodes.map((node) => [node.srn, node.name, node.title, node.kind]),
        edges.map((edge) => [edge.from, edge.to, edge.edge]),
      ]),
    [nodes, edges],
  )
  const input = useRef({ nodes, edges })
  // Kept in a ref so the layout effect can read the newest value without
  // re-running on every render. Written in an effect rather than during render:
  // a render-phase ref write is unsafe when React renders concurrently or
  // double-invokes in StrictMode. This effect is declared first, so the value
  // is current before the layout effect below reads it.
  useEffect(() => {
    input.current = { nodes, edges }
  })

  // One key for "this is a different layout problem"; a measurement is only
  // valid for the layout it was taken from.
  const layoutKey = `${signature}|${direction}`
  const [measured, setMeasured] = useState<{ key: string; geometry: MeasuredGeometry } | null>(null)
  const reported = useRef<string | null>(null)

  const onMeasure = useCallback(
    (geometry: MeasuredGeometry) => {
      // The probe has no memory by design, so the guard lives here: one
      // measurement per layout, or the second pass would re-measure itself.
      if (reported.current === layoutKey) return
      reported.current = layoutKey
      setMeasured({ key: layoutKey, geometry })
    },
    [layoutKey],
  )

  useEffect(() => {
    const { nodes: current, edges: currentEdges } = input.current
    if (current.length === 0) return
    let cancelled = false
    const geometry = measured?.key === layoutKey ? measured.geometry : null

    layoutGraph({
      nodes: current.map((node) => ({
        id: node.srn,
        ...(geometry?.nodes.get(node.srn) ?? estimateBox(node)),
      })),
      edges: currentEdges.map((edge, index) => ({
        id: `${edge.from}--${edge.edge}--${edge.to}--${index}`,
        source: edge.from,
        target: edge.to,
      })),
      direction,
    }).then(
      (result) => {
        if (cancelled) return
        const top = result.nodes.length > 0 ? Math.min(...result.nodes.map((node) => node.y)) : 0
        const bottom = result.nodes.length > 0 ? Math.max(...result.nodes.map((node) => node.y + node.height)) : 0
        setBuilt({
          key: layoutKey,
          layout: {
            placed: new Map(result.nodes.map((node) => [node.id, node])),
            contentHeight: bottom - top,
            pass: geometry ? 2 : 1,
          },
        })
      },
      () => {
        // A failed second pass is not worth throwing the first one away for.
        if (!cancelled && !geometry) setFailure(layoutKey)
      },
    )

    return () => {
      cancelled = true
    }
  }, [layoutKey, direction, measured])

  const layout = built?.key === layoutKey ? built.layout : null
  const failed = failure === layoutKey

  // Nothing is shown until the measured pass lands, so the reader never sees
  // the estimate correct itself. The timer is the escape hatch: if measurement
  // never arrives, an approximate graph beats a permanent skeleton.
  const [timedOutFor, setTimedOutFor] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setTimedOutFor(layoutKey), 900)
    return () => clearTimeout(timer)
  }, [layoutKey])
  const settled = layout !== null && (layout.pass === 2 || timedOutFor === layoutKey)

  const known = useMemo(() => new Set(nodes.map((node) => node.srn)), [nodes])
  /** Edges pointing outside the supplied node set cannot be drawn. */
  const drawable = useMemo(
    () => edges.filter((edge) => known.has(edge.from) && known.has(edge.to)),
    [edges, known],
  )

  const flowNodes = useMemo<EntityFlowNode[]>(() => {
    if (!layout) return []
    return nodes.map((node) => {
      const box = layout.placed.get(node.srn)
      return {
        id: node.srn,
        type: 'entity',
        position: { x: box?.x ?? 0, y: box?.y ?? 0 },
        data: {
          srn: node.srn,
          name: node.name,
          title: node.title,
          kind: node.kind,
          focused: node.srn === focus,
          direction,
          onNavigate,
        },
      }
    })
  }, [nodes, layout, focus, direction, onNavigate])

  // Visibility is a filter on drawn edges only: toggling a type must never
  // reshuffle the graph, or the reader loses the map they had just learned.
  const flowEdges = useMemo<RelationFlowEdge[]>(
    () =>
      drawable.map((edge, index) => {
        const style = EDGE_STYLES[edge.edge]
        const touchesFocus = focus !== undefined && (edge.from === focus || edge.to === focus)
        const stroke = touchesFocus ? FOCUS_STROKE : EDGE_STROKE
        const self = edge.from === edge.to
        return {
          id: `${edge.from}--${edge.edge}--${edge.to}--${index}`,
          source: edge.from,
          target: edge.to,
          sourceHandle: self ? 'self-out' : 'out',
          targetHandle: self ? 'self-in' : 'in',
          hidden: hiddenTypes.has(edge.edge),
          style: { stroke, strokeWidth: style.width, strokeDasharray: style.dash },
          markerEnd: { type: style.marker, width: 14, height: 14, color: stroke },
          ariaLabel: `${edge.from} ${style.label} ${edge.to}`,
        }
      }),
    [drawable, focus, hiddenTypes],
  )

  const counts = useMemo(() => {
    const map = new Map<EdgeType, number>()
    for (const edge of drawable) map.set(edge.edge, (map.get(edge.edge) ?? 0) + 1)
    return map
  }, [drawable])

  const text = useMemo(() => describe(nodes, drawable), [nodes, drawable])

  // Fit the canvas to the graph. `height` is a ceiling, not a fixed size: a
  // small neighbourhood in a large empty panel reads as a failed render.
  const canvasHeight = useMemo(() => fitCanvasHeight(layout?.contentHeight ?? null, height), [layout, height])
  const { expanded, toggle: toggleExpanded } = useExpandable()

  // Same rule as the state chart: hovering an entity lights its relations and
  // whatever sits at the far end, and lifts them clear of everything else.
  const highlight = useGraphHighlight(flowNodes, flowEdges)
  const litNodes = useMemo(() => flowNodes.map(highlight.decorate), [flowNodes, highlight])
  const litEdges = useMemo(() => flowEdges.map(highlight.decorate), [flowEdges, highlight])

  if (nodes.length === 0) {
    return (
      <p className={cn('panel px-4 py-6 text-[13px] text-muted-foreground', className)}>
        Nothing to draw — this entity has no relations.
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
      aria-label={label}
    >
      <div
        className="relative"
        style={{ height: expanded ? '100%' : canvasHeight, ...DIAGRAM_CANVAS_VARS }}
      >
        {failed ? (
          <TextFallback lines={text} />
        ) : (
          <>
            {layout !== null && (
              // Hidden rather than unmounted: the first pass has to be in the
              // DOM to be measurable, and `visibility` keeps layout running
              // where `display: none` would report every node as zero.
              <div className="absolute inset-0" style={{ visibility: settled ? undefined : 'hidden' }}>
                <ReactFlow
                  nodes={litNodes}
                  edges={litEdges}
                  {...highlight.handlers}
                  nodeTypes={nodeTypes}
                  colorMode="dark"
                  fitView
                  fitViewOptions={{ padding: FIT_PADDING, maxZoom: 1 }}
                  minZoom={0.2}
                  maxZoom={2}
                  nodesConnectable={false}
                  // The node itself carries a button, so the wrapper must not be
                  // a second tab stop for the same target.
                  nodesFocusable={false}
                  edgesFocusable={false}
                  elementsSelectable={false}
                  zoomOnDoubleClick={false}
                  // The graph sits inside a scrolling document: hijacking the
                  // wheel would trap the page. Zoom stays on the controls and on
                  // pinch.
                  zoomOnScroll={false}
                  panOnScroll={false}
                  preventScrolling={false}
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={DIAGRAM_BACKGROUND.gap}
                    size={DIAGRAM_BACKGROUND.size}
                    color={DIAGRAM_BACKGROUND.color}
                  />
                  <Controls showInteractive={false} style={{ margin: 10 }} />
                  <MeasureProbe onMeasure={onMeasure} />
                  <Panel position="top-right" style={{ margin: 10 }}>
                    <GraphToolbar
                      counts={counts}
                      hiddenTypes={hiddenTypes}
                      onToggle={(type) =>
                        setHiddenTypes((current) => {
                          const next = new Set(current)
                          if (next.has(type)) next.delete(type)
                          else next.add(type)
                          return next
                        })
                      }
                      focus={focus}
                      expanded={expanded}
                      onToggleExpanded={toggleExpanded}
                      refitOn={`${layout.pass}`}
                    />
                  </Panel>
                </ReactFlow>
              </div>
            )}
            {!settled && <LayoutPending />}
          </>
        )}
      </div>

      <figcaption className="sr-only">
        <p>{`${label}: ${nodes.length} entities, ${drawable.length} relations.`}</p>
        <ul>
          {text.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

function GraphToolbar({
  counts,
  hiddenTypes,
  onToggle,
  focus,
  expanded,
  onToggleExpanded,
  refitOn,
}: {
  counts: Map<EdgeType, number>
  hiddenTypes: ReadonlySet<EdgeType>
  onToggle: (type: EdgeType) => void
  focus?: string
  expanded: boolean
  onToggleExpanded: () => void
  /** Changes whenever the graph is re-laid-out under the viewport. */
  refitOn: string
}) {
  const { fitView } = useReactFlow()
  const present = EDGE_ORDER.filter((type) => counts.has(type))

  const duration = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320

  useEffect(() => {
    // Instant, not animated: this runs while the canvas is still hidden, on the
    // measured pass. An animation here would be motion nobody asked for.
    const frame = requestAnimationFrame(() => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 0 }))
    return () => cancelAnimationFrame(frame)
  }, [refitOn, fitView])

  return (
    <div className="w-[168px] rounded-md border border-border bg-surface/90 p-1.5 backdrop-blur-sm">
      <div className="flex items-center gap-1 px-0.5 pb-1.5">
        <span className="flex-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Edges</span>
        <button
          type="button"
          onClick={() => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: duration() })}
          className="focusable rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          aria-label="Fit the whole graph in view"
          title="Fit graph"
        >
          <Scan className="size-3" aria-hidden />
        </button>
        <ExpandButton
          expanded={expanded}
          onToggle={() => {
            onToggleExpanded()
            // The canvas changes size, so the old viewport no longer frames the
            // graph; re-fit once the new box has been laid out.
            requestAnimationFrame(() => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: duration() }))
          }}
          className="p-1 hover:bg-surface-raised"
        />
        {focus && (
          <button
            type="button"
            onClick={() => void fitView({ nodes: [{ id: focus }], maxZoom: 1.1, duration: duration() })}
            className="focusable rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
            aria-label="Centre on this entity"
            title="Centre on this entity"
          >
            <Crosshair className="size-3" aria-hidden />
          </button>
        )}
      </div>

      <ul className="space-y-px">
        {present.map((type) => {
          const style = EDGE_STYLES[type]
          const on = !hiddenTypes.has(type)
          return (
            <li key={type}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(type)}
                className={cn(
                  'focusable flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-raised',
                  !on && 'opacity-40',
                )}
              >
                <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden className="shrink-0">
                  <line
                    x1="0"
                    y1="3"
                    x2="22"
                    y2="3"
                    stroke="var(--border-strong)"
                    strokeWidth={style.width}
                    strokeDasharray={style.dash}
                  />
                </svg>
                <span className="flex-1 truncate font-mono text-[10.5px] text-foreground/80">{style.label}</span>
                <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{counts.get(type)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The graph in words — same content the canvas draws, for readers and scrapers. */
function describe(nodes: RelationGraphNode[], edges: RelationGraphEdge[]): string[] {
  const byId = new Map(nodes.map((node) => [node.srn, node]))
  const name = (srn: string) => {
    const node = byId.get(srn)
    return node ? `${node.name} (${node.kind})` : srn
  }

  const lines = edges.map((edge) => `${name(edge.from)} ${EDGE_STYLES[edge.edge].label} ${name(edge.to)}.`)
  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]))
  const isolated = nodes.filter((node) => !connected.has(node.srn))
  if (isolated.length > 0) {
    lines.push(`No relations: ${isolated.map((node) => name(node.srn)).join(', ')}.`)
  }
  return lines
}

function LayoutPending() {
  return (
    <div className="absolute inset-0 grid place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2" aria-hidden>
          <span className="h-6 w-16 animate-pulse rounded-sm bg-muted" />
          <span className="h-px w-6 bg-border-strong" />
          <span className="h-6 w-16 animate-pulse rounded-sm bg-muted" style={{ animationDelay: '120ms' }} />
          <span className="h-px w-6 bg-border-strong" />
          <span className="h-6 w-16 animate-pulse rounded-sm bg-muted" style={{ animationDelay: '240ms' }} />
        </div>
        <p className="font-mono text-[11px] tracking-tight text-muted-foreground">Laying out the graph…</p>
      </div>
    </div>
  )
}

/** Layout can only fail catastrophically (ELK failed to load); say so, still show the graph. */
function TextFallback({ lines }: { lines: string[] }) {
  return (
    <div className="h-full overflow-auto px-4 py-3">
      <p className="text-[12.5px] text-warning">Diagram layout unavailable — the relations are listed instead.</p>
      <ul className="mt-2 space-y-1 font-mono text-[11.5px] text-foreground/80">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
