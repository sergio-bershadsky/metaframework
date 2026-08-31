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
import { RELATION_VERB, entityPhrase, nodeButtonLabel, relationSentence } from '@/lib/diagrams/names'
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
 * Edge vocabulary. The legend draws from this same table — a legend that
 * redraws its own key is a legend that drifts from the graph.
 *
 * Every distinction here has to be carried by weight, dash and arrowhead alone,
 * because hue means "kind" and an edge type may not own one. That constraint is
 * fine until two types land close together on all three channels at once, which
 * is what happened to `realizes` and `measures`: 1.25 against 1 is a difference
 * of 0.25px at zoom 1, and a capability page opens its graph at 0.58, where the
 * pair measured 0.73px against 0.58px with seven edges converging on one node.
 * Neither the weights nor the dashes survived that reduction, so the answer is
 * one channel that does not reduce and two that are further apart:
 *
 * - `vectorEffect: non-scaling-stroke` on every edge (see `flowEdges`) takes
 *   stroke width and dash period out of the viewport transform, so what is
 *   authored here is what is drawn at any zoom.
 * - `realizes` is heavier than `implements` rather than equal to it, which is
 *   also the truer statement: realizing a capability is a claim about the whole
 *   product, satisfying a requirement is a claim about one component.
 * - `measures` is a round-capped DOT trail rather than a short dash. Against a
 *   dash-dot it differs in kind and not in rhythm — there are no line segments
 *   in it at all — which is the difference that survives being made small.
 */
const EDGE_STYLES = {
  uses: { label: RELATION_VERB.uses, width: 1.25, dash: undefined, cap: undefined, marker: MarkerType.ArrowClosed },
  exposes: { label: RELATION_VERB.exposes, width: 2, dash: undefined, cap: undefined, marker: MarkerType.ArrowClosed },
  'depends-on': {
    label: RELATION_VERB['depends-on'],
    width: 1.25,
    dash: '7 4',
    cap: undefined,
    marker: MarkerType.ArrowClosed,
  },
  implements: {
    label: RELATION_VERB.implements,
    width: 1.25,
    dash: '1.5 3.5',
    cap: undefined,
    marker: MarkerType.ArrowClosed,
  },
  // A delivery claim, like `implements` one level up — hence a dash-dot that
  // reads as a relative of it, and a place in the legend beside it. This map's
  // key order is the legend order, and it follows frontmatter.md's table
  // rather than EDGE_TYPES: that list is adoption order and grows by
  // appending, which is the wrong thing for a reader to see first.
  realizes: {
    label: RELATION_VERB.realizes,
    width: 1.9,
    dash: '6 3 1.5 3',
    cap: undefined,
    marker: MarkerType.ArrowClosed,
  },
  // An observation, not a dependency: the open arrowhead says nothing flows
  // along this edge, the same distinction `supersedes` draws. The round cap is
  // what turns the dash into a dot — a zero-length segment draws nothing under
  // a butt cap and a full circle under a round one.
  measures: { label: RELATION_VERB.measures, width: 1, dash: '0.01 4.5', cap: 'round', marker: MarkerType.Arrow },
  supersedes: { label: RELATION_VERB.supersedes, width: 1.25, dash: '11 4', cap: undefined, marker: MarkerType.Arrow },
  // Finely dotted and thin: a dependency on a belief is the weakest claim in the
  // vocabulary, and it should not read as heavily as a structural edge.
  assumes: { label: RELATION_VERB.assumes, width: 1, dash: '1 3', cap: 'round', marker: MarkerType.Arrow },
} satisfies Record<
  EdgeType,
  { label: string; width: number; dash: string | undefined; cap: 'round' | undefined; marker: MarkerType }
>

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
  /** Some drawable edge arrives here / leaves here — see {@link HANDLE_STYLE}. */
  hasIn: boolean
  hasOut: boolean
  onNavigate?: (srn: string) => void
}

type EntityFlowNode = Node<EntityNodeData, 'entity'>
type RelationFlowEdge = Edge<Record<string, unknown>>

// Inline rather than utility classes: React Flow ships `.react-flow__handle`
// rules of its own, and inline style is the only override that does not depend
// on the order the two stylesheets happen to land in.
//
// A dot is the END of a line, so it is painted only when a line actually
// arrives there. The handle itself is always rendered — React Flow resolves an
// edge against a handle that must exist, and a leaf node still owns the anchor
// its future edges would use — but an unconnected one is transparent. Drawing
// it regardless left a stud on the side of every terminal node, promising a
// connection that was not there.
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
        style={data.hasIn ? HANDLE_STYLE : HIDDEN_HANDLE}
      />
      <Handle
        type="source"
        position={flowsRight ? Position.Right : Position.Bottom}
        id="out"
        style={data.hasOut ? HANDLE_STYLE : HIDDEN_HANDLE}
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
          // Both of these are facts the box states in a channel that does not
          // survive being read out. The KIND is the icon and the hue, so a
          // button named by its own text content announces "ledgerDouble-entry
          // books" and drops it; and `data.focused` — the entity this page is
          // about, the subject of the whole drawing — is a 1px outline in
          // `tint` above and nothing else at all. The solution map's node gets
          // both right; this one is the same control.
          aria-label={nodeButtonLabel(data.name, style.label, data.title)}
          aria-current={data.focused ? 'true' : undefined}
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

  /**
   * Which sides of each box a line actually reaches.
   *
   * Derived from `drawable` rather than from the visible subset: a type hidden
   * from the legend is a reading preference, and handles blinking in and out as
   * the reader toggles one would be a second, noisier answer to a question they
   * did not ask. A self-edge is excluded because it lands on its own pair of
   * handles at the top of the box, never on these two.
   */
  const anchored = useMemo(() => {
    const sides = new Map<string, { hasIn: boolean; hasOut: boolean }>()
    const side = (srn: string) => {
      const existing = sides.get(srn)
      if (existing) return existing
      const created = { hasIn: false, hasOut: false }
      sides.set(srn, created)
      return created
    }
    for (const edge of drawable) {
      if (edge.from === edge.to) continue
      side(edge.from).hasOut = true
      side(edge.to).hasIn = true
    }
    return sides
  }, [drawable])

  const flowNodes = useMemo<EntityFlowNode[]>(() => {
    if (!layout) return []
    // What the browser drew, once the probe has reported it — and nothing
    // before that. See the `measured` note below.
    const sizes = measured?.key === layoutKey ? measured.geometry.nodes : null
    return nodes.map((node) => {
      const box = layout.placed.get(node.srn)
      const sides = anchored.get(node.srn)
      const size = sizes?.get(node.srn)
      return {
        id: node.srn,
        type: 'entity',
        position: { x: box?.x ?? 0, y: box?.y ?? 0 },
        /**
         * State the size once it is known — the same rule `solution-map.tsx`
         * documents, reached the other way round because these boxes are
         * content-sized rather than fixed.
         *
         * React Flow reads `measured` off the USER node object. Highlighting
         * rebuilds those objects on every hover (`decorate` returns `{...node,
         * className, zIndex}`), and `adoptUserNodes` treats a node that says
         * nothing about its size as one that has never been sized: it renders
         * it `visibility: hidden` and discards its handle bounds until a
         * ResizeObserver reports again. Hidden boxes take no pointer events, so
         * the pointer immediately "leaves" the node it is sitting on, the hover
         * clears, the objects are rebuilt again, and the graph oscillates —
         * measured here at 3240 style mutations over 8.5s from one hover, with
         * every node hidden for the duration. That is both the blink the reader
         * sees and the blank canvas it settles into.
         *
         * Only AFTER the probe reports, though. Handing React Flow the first
         * pass's estimate would make the probe read that estimate back out of
         * the store, and the second pass would lay out on the guess it exists
         * to replace — restoring the clipped text the two passes were built to
         * fix.
         */
        ...(size ? { measured: size } : {}),
        data: {
          srn: node.srn,
          name: node.name,
          title: node.title,
          kind: node.kind,
          focused: node.srn === focus,
          direction,
          hasIn: sides?.hasIn ?? false,
          hasOut: sides?.hasOut ?? false,
          onNavigate,
        },
      }
    })
  }, [nodes, layout, focus, direction, anchored, onNavigate, measured, layoutKey])

  // The caption's name for a box, reachable from the edge builder below so the
  // two describe the same drawing. Memoised on `nodes` alone: it must not be a
  // fresh closure per render, or every edge object is rebuilt on every render.
  const byId = useMemo(() => {
    const index = new Map(nodes.map((node) => [node.srn, node]))
    return (srn: string) => phraseFor(index, srn)
  }, [nodes])

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
          // `non-scaling-stroke` is the reason the vocabulary is legible at all:
          // the viewport is a CSS transform, so without it a 1px edge is drawn
          // at 0.58px on a capability page, and the dash periods shrink with it.
          style: {
            stroke,
            strokeWidth: style.width,
            strokeDasharray: style.dash,
            strokeLinecap: style.cap,
            vectorEffect: 'non-scaling-stroke',
          },
          markerEnd: { type: style.marker, width: 14, height: 14, color: stroke },
          // The caption's sentence, verbatim — not the SRN pair the model holds.
          // React Flow exposes every edge as a `role="img"` carrying this
          // string, so it is a second, independent reading of the same picture:
          // it has to be a reading of the picture that is actually drawn, whose
          // boxes say `ledger`, not `srn://acme/product/billing/component/ledger`.
          ariaLabel: relationSentence(byId(edge.from), style.label, byId(edge.to)),
        }
      }),
    [drawable, focus, hiddenTypes, byId],
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
  // Keyed on `decorate`, not on the hook's return value: that is a fresh object
  // literal every render, so depending on it rebuilt every node object on every
  // render — a re-adoption per keystroke of unrelated state, for no change.
  const { decorate } = highlight
  const litNodes = useMemo(() => flowNodes.map(decorate), [flowNodes, decorate])
  const litEdges = useMemo(() => flowEdges.map(decorate), [flowEdges, decorate])

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
                  // React Flow puts `role="application"` on its own container
                  // and does not let a prop override it (verified in the
                  // installed 12.11.3: `role` is written after the prop spread).
                  // An application region takes a screen reader out of browse
                  // mode, so the least it can do is say what it is; unnamed, the
                  // reader is dropped into an anonymous box. `aria-label` DOES
                  // pass through — it is inside the spread — so this is the half
                  // of the problem the app can fix from outside.
                  aria-label={`${label} — drawing`}
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
                {/* The swatch carries every channel the canvas uses, arrowhead
                    included. It used to draw the line and drop the head, which
                    left `realizes` and `measures` differing by a dash pattern
                    alone in the one place a reader goes to tell them apart. */}
                <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden className="shrink-0">
                  <line
                    x1="0"
                    y1="4"
                    x2={style.marker === MarkerType.ArrowClosed ? 18 : 20}
                    y2="4"
                    stroke="var(--border-strong)"
                    strokeWidth={style.width}
                    strokeDasharray={style.dash}
                    strokeLinecap={style.cap}
                  />
                  {style.marker === MarkerType.ArrowClosed ? (
                    <path d="M18 1 L25 4 L18 7 Z" fill="var(--border-strong)" />
                  ) : (
                    <path
                      d="M19 1 L25 4 L19 7"
                      fill="none"
                      stroke="var(--border-strong)"
                      strokeWidth="1.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
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
  const name = (srn: string) => phraseFor(byId, srn)

  const lines = edges.map((edge) => relationSentence(name(edge.from), EDGE_STYLES[edge.edge].label, name(edge.to)))
  const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]))
  const isolated = nodes.filter((node) => !connected.has(node.srn))
  if (isolated.length > 0) {
    lines.push(`No relations: ${isolated.map((node) => name(node.srn)).join(', ')}.`)
  }
  return lines
}

/**
 * One endpoint of an edge, in the caption's words — falling back to the SRN
 * only where the graph holds no node for it, which is the one case where the
 * SRN really is all that is known.
 */
function phraseFor(byId: ReadonlyMap<string, RelationGraphNode>, srn: string): string {
  const node = byId.get(srn)
  return node ? entityPhrase(node.name, node.kind) : srn
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
