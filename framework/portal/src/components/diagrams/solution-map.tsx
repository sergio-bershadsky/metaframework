'use client'

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  type EdgeTypes,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
} from '@xyflow/react'
import { ArrowUpRight, ChevronRight, Home } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { entityHref } from '@/lib/catalog/href'
import { DIAGRAM_BACKGROUND, DIAGRAM_CANVAS_VARS } from '@/lib/diagrams/layout'
import { type PolarLink, polarLayout, toCartesian } from '@/lib/diagrams/polar'
import {
  RECENTRE_MS,
  useIsHydrated,
  usePolarTransition,
  usePrefersReducedMotion,
} from '@/lib/diagrams/use-polar-transition'
import { type HighlightState, useGraphHighlight } from '@/lib/diagrams/use-graph-highlight'
import { kindColorVar, kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

import '@xyflow/react/dist/style.css'

/**
 * The solution map — structure, and only structure.
 *
 * Every other diagram in the portal is about one entity. This one is about the
 * shape of a whole solution, which is a different question and needs a
 * different answer: solutions, products and components appear, and nothing
 * else does. A protocol or a datamodel on this canvas would answer a question
 * nobody asked here and would double the node count doing it.
 *
 * Two things carry the design.
 *
 * TWO EDGE LANGUAGES. Containment is the structural spine — solid, thicker,
 * higher contrast, drawn straight, so it reads as the skeleton the map hangs
 * on. Dependency is thin, dashed, dimmer and bowed, so it reads as something
 * *crossing* that skeleton rather than being part of it. Colour is not used to
 * tell them apart, because in this console colour means kind and nothing else.
 *
 * RE-CENTRING IS THE INTERACTION. Clicking a node recomputes the neighbourhood
 * around it and the map rotates into place: positions are interpolated in polar
 * coordinates, so nodes swing along arcs. Opening the entity is deliberately a
 * separate affordance on the focused node — a map you cannot explore without
 * leaving it is not a map.
 *
 * FOCUS RECEDES THE REST, it does not remove it. Once a product or component is
 * focused, everything off its containment branch drops far back but is still
 * drawn. Hiding it outright was considered and rejected: the single most useful
 * thing this canvas shows is a dependency CROSSING branches, and deleting those
 * lines at the moment somebody signals interest in a branch would remove the
 * answer along with the clutter. Anything receded stays clickable — re-centring
 * is the only way to move sideways — and hovering brings it back to full
 * strength, so reading a box before clicking it costs a glance.
 */

export type MapKind = 'solution' | 'product' | 'component'

export interface SolutionMapNode {
  srn: string
  /** Entity `name` — the mono identifier drawn in the box. */
  name: string
  title: string
  kind: MapKind
  /** Containment parent; null for the solution root. Drives the focus trail. */
  parent: string | null
}

export interface SolutionMapLink {
  from: string
  to: string
  /** `contains` is the spine; the rest are the crossing language. */
  relation: 'contains' | 'depends-on' | 'uses'
}

export interface SolutionMapProps {
  nodes: SolutionMapNode[]
  links: SolutionMapLink[]
  /** The solution's own SRN — where the home control goes. */
  root: string
  label?: string
  className?: string
}

/**
 * One size for every box: the focus is marked by its ring, never by its bulk.
 *
 * A box carries the entity's NAME and nothing else. On an entity page there is
 * room to gloss an identifier with its title; on a map there are twenty-five of
 * them at once, and the title is the first thing that stops being read. It is
 * still on the focused node, in the tooltip, and in the caption below.
 */
const MAP_NODE = { width: 158, height: 30 } as const

/** How far past the outermost ring a departing node travels before it is dropped. */
const EXIT_MARGIN = 260

/** Clear space between the fitted ring and the canvas edge. */
const VIEW_PADDING = 40
/** Vertical room left for the trail and the legend to sit over. */
const OVERLAY_ROOM = 44

/**
 * The viewport frames the rings the map PROMISES — the focus and two steps out.
 * The third ring is context and is allowed to spill past the edge, which is the
 * honest rendering of "there is more out here, but it is not the answer".
 */
const FITTED_RINGS = 2

const MIN_ZOOM = 0.35
const MAX_ZOOM = 1

/** Gap between a box's edge and the line that reaches it. */
const EDGE_INSET = 5

/** How far a dependency edge bows off its chord, as a fraction of that chord. */
const CROSS_BOW = 0.16

interface MapNodeData extends Record<string, unknown> {
  srn: string
  name: string
  title: string
  kind: MapKind
  focused: boolean
  onRecentre: (srn: string) => void
}

type MapFlowNode = Node<MapNodeData, 'mapNode'>
type MapFlowEdge = Edge

/**
 * How far back an element sits when nothing is hovered.
 *
 * `soft` is the ring past the two the viewport frames; `far` is everything off
 * the focused branch. The opacities live in globals.css with the `.dgm-recede`
 * family, because that class is applied to the group React Flow owns — the only
 * element that dims a node, an edge, its marker and its label together. An
 * edge's `style` reaches its path, which these custom edge components never
 * read, so a value on this side would silently do nothing.
 */
type Recession = 'none' | 'soft' | 'far'

const RECEDE_CLASS: Record<Recession, string | null> = {
  none: null,
  soft: 'dgm-recede-soft',
  far: 'dgm-recede-far',
}

const RECESSION_ORDER: Record<Recession, number> = { none: 0, soft: 1, far: 2 }

/** An edge is as receded as the further-back of the two boxes it joins. */
function dimmer(a: Recession, b: Recession): Recession {
  return RECESSION_ORDER[a] >= RECESSION_ORDER[b] ? a : b
}

/**
 * Push an element back, unless the pointer is asking about it.
 *
 * Hover overrides the branch deliberately. It answers "what does this touch",
 * and an answer half of which is invisible is not an answer — a dependency from
 * the focused branch out to a sibling product has to become legible when the
 * reader points at either end. It is also what makes an off-branch box readable
 * before it is clicked, which is what keeps sideways navigation possible.
 */
function setBack<T extends { id: string; className?: string }>(
  element: T,
  level: Recession,
  state: HighlightState,
): T {
  const peeking = !state.idle && state.lit(element.id)
  const className = RECEDE_CLASS[level]
  if (!className || peeking) return element
  return { ...element, className: [element.className, className].filter(Boolean).join(' ') }
}

/**
 * The containment branch the focus sits on: the focused node itself, everything
 * it contains, and the chain of containers above it.
 *
 * Dependency edges deliberately do NOT extend the branch. A component that
 * everything depends on would otherwise drag half the solution into the
 * foreground and there would be no focus left to speak of; those neighbours are
 * what hover is for.
 */
function branchOf(focus: string, byId: ReadonlyMap<string, SolutionMapNode>): Set<string> {
  const branch = new Set<string>()

  let ancestor: string | null = focus
  while (ancestor !== null && !branch.has(ancestor)) {
    branch.add(ancestor)
    ancestor = byId.get(ancestor)?.parent ?? null
  }

  const children = new Map<string, string[]>()
  for (const node of byId.values()) {
    if (node.parent === null) continue
    children.set(node.parent, [...(children.get(node.parent) ?? []), node.srn])
  }

  const pending = [focus]
  while (pending.length > 0) {
    const id = pending.pop() as string
    for (const child of children.get(id) ?? []) {
      if (branch.has(child)) continue
      branch.add(child)
      pending.push(child)
    }
  }

  return branch
}

/**
 * Both handles sit at the node's centre, so every line is a true spoke from one
 * centre to another and the geometry below can trim it back to the box edge
 * itself. Inline style rather than a class: React Flow ships positioned
 * `.react-flow__handle` rules that a utility class would have to out-specify.
 */
const CENTRE_HANDLE = {
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: 'none',
  background: 'transparent',
  pointerEvents: 'none',
} as const

function MapBox({ data }: NodeProps<MapFlowNode>) {
  const style = kindStyle(data.kind)
  const Icon = style.icon
  const hue = kindColorVar(data.kind)

  return (
    <>
      <Handle type="target" id="in" position={Position.Top} style={CENTRE_HANDLE} isConnectable={false} />
      <Handle type="source" id="out" position={Position.Top} style={CENTRE_HANDLE} isConnectable={false} />

      <button
        type="button"
        // `nodrag nopan` is what keeps a press on this box from being taken as
        // the start of a canvas pan — d3-zoom claims the gesture on mousedown
        // and suppresses the click that would have followed.
        className="nodrag nopan focusable flex cursor-pointer items-center gap-1.5 rounded-md border px-2 text-left transition-colors hover:bg-surface-raised"
        style={{
          width: MAP_NODE.width,
          height: MAP_NODE.height,
          borderColor: `color-mix(in oklab, ${hue} 45%, transparent)`,
          backgroundColor: `color-mix(in oklab, ${hue} 7%, var(--surface))`,
          // Recession is NOT set here. It belongs to the group React Flow owns,
          // one level up, so that a box and the lines reaching it fade as one
          // thing — see the `.dgm-recede` family in globals.css.
          ...(data.focused ? { outline: '1px solid var(--primary)', outlineOffset: 3 } : {}),
        }}
        onClick={() => data.onRecentre(data.srn)}
        aria-current={data.focused ? 'true' : undefined}
        aria-label={`Centre the map on ${data.name}, ${style.label.toLowerCase()}`}
        title={`${data.name} — ${data.title}`}
      >
        <Icon className="size-3.5 shrink-0" style={{ color: hue }} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-none tracking-tight text-foreground">
          {data.name}
        </span>
      </button>

      {/* The title is worth the room for exactly one node: the one being read. */}
      {data.focused && (
        <span className="pointer-events-none absolute top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap text-[10.5px] leading-none text-muted-foreground">
          {data.title}
        </span>
      )}

      {/* Re-centring owns the click, so opening the entity needs its own target.
          A real link, not a handler: middle-click and "open in new tab" are how
          people actually leave a map they want to keep. */}
      {data.focused && (
        <Link
          href={entityHref(data.srn)}
          className="nodrag nopan focusable absolute -top-2 -right-2 grid size-5 place-items-center rounded-full border border-border-strong bg-surface-raised text-muted-foreground transition-colors hover:text-foreground"
          aria-label={`Open ${data.name}`}
          title="Open this entity"
        >
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
      )}
    </>
  )
}

/**
 * Where a line meets a box, given the direction it arrives from.
 *
 * Handles sit at node centres, so an untrimmed line would put its arrowhead
 * underneath the box it points at. `direction` need not be normalised — only
 * its ratio matters.
 */
function boxEdgePoint(
  cx: number,
  cy: number,
  direction: { x: number; y: number },
  inset: number,
): { x: number; y: number } {
  const { x: dx, y: dy } = direction
  const length = Math.hypot(dx, dy)
  if (length === 0) return { x: cx, y: cy }
  const toSide = Math.abs(dx) < 1e-6 ? Number.POSITIVE_INFINITY : MAP_NODE.width / 2 / Math.abs(dx)
  const toCap = Math.abs(dy) < 1e-6 ? Number.POSITIVE_INFINITY : MAP_NODE.height / 2 / Math.abs(dy)
  const scale = Math.min(toSide, toCap) + inset / length
  return { x: cx + dx * scale, y: cy + dy * scale }
}

/** Containment: the spine. Straight, thick, solid — the thing the map hangs on. */
function SpineEdge({ id, sourceX, sourceY, targetX, targetY }: EdgeProps<MapFlowEdge>) {
  const along = { x: targetX - sourceX, y: targetY - sourceY }
  const start = boxEdgePoint(sourceX, sourceY, along, EDGE_INSET)
  const end = boxEdgePoint(targetX, targetY, { x: -along.x, y: -along.y }, EDGE_INSET)

  return (
    <BaseEdge
      id={id}
      path={`M ${start.x},${start.y} L ${end.x},${end.y}`}
      style={{
        stroke: 'var(--border-strong)',
        strokeWidth: 2,
        // The two languages must stay distinguishable at every zoom. A scaled
        // stroke turns 2px against 1px into 1.1px against 0.6px on an overview,
        // where the browser renders both as the same hairline and the whole
        // distinction disappears at exactly the zoom that needs it most.
        vectorEffect: 'non-scaling-stroke',
      }}
    />
  )
}

/**
 * Dependency: the crossing language. Thin, dashed, dimmer and bowed off its own
 * chord, so it reads as a line travelling *over* the structure rather than as
 * one of its members. The bow is also what keeps two edges between the same
 * pair of rings from lying on top of each other.
 */
function CrossEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd }: EdgeProps<MapFlowEdge>) {
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const controlX = (sourceX + targetX) / 2 - dy * CROSS_BOW
  const controlY = (sourceY + targetY) / 2 + dx * CROSS_BOW

  // A quadratic leaves and arrives along its control point, so the trim uses
  // those directions rather than the chord — otherwise a strongly bowed edge
  // would emerge from the side of its own box.
  const start = boxEdgePoint(sourceX, sourceY, { x: controlX - sourceX, y: controlY - sourceY }, EDGE_INSET)
  const end = boxEdgePoint(targetX, targetY, { x: controlX - targetX, y: controlY - targetY }, EDGE_INSET)

  return (
    <BaseEdge
      id={id}
      path={`M ${start.x},${start.y} Q ${controlX},${controlY} ${end.x},${end.y}`}
      markerEnd={markerEnd}
      style={{
        stroke: 'var(--border)',
        strokeWidth: 1,
        strokeDasharray: '5 4',
        vectorEffect: 'non-scaling-stroke',
      }}
    />
  )
}

const nodeTypes: NodeTypes = { mapNode: MapBox }
const edgeTypes: EdgeTypes = { spine: SpineEdge, cross: CrossEdge }

export function SolutionMap({ nodes, links, root, label = 'Solution map', className }: SolutionMapProps) {
  const [requested, setRequested] = useState(root)
  const reduced = usePrefersReducedMotion()

  const byId = useMemo(() => new Map(nodes.map((node) => [node.srn, node])), [nodes])
  // Derived, not corrected in an effect: a focus that no longer exists (a
  // different solution arrived under the same component) falls back to the root
  // during the same render rather than after a second one.
  const focus = byId.has(requested) ? requested : root

  const ids = useMemo(() => nodes.map((node) => node.srn), [nodes])
  const polarLinks = useMemo<PolarLink[]>(
    () => links.map((link) => ({ source: link.from, target: link.to, structural: link.relation === 'contains' })),
    [links],
  )

  const layout = useMemo(() => polarLayout({ nodes: ids, links: polarLinks, focus }), [ids, polarLinks, focus])
  const frame = usePolarTransition(layout, layout.extent + EXIT_MARGIN)
  const fitRadius = layout.radii[Math.min(FITTED_RINGS, layout.radii.length - 1)] ?? 0

  const recentre = useCallback((srn: string) => setRequested(srn), [])

  // Rebuilt when the neighbourhood changes, NOT per frame: React Flow re-renders
  // a custom node when its data identity changes, and at sixty frames a second
  // that would re-render every box for the whole transition.
  const nodeData = useMemo(() => {
    const map = new Map<string, MapNodeData>()
    for (const node of nodes) {
      map.set(node.srn, {
        srn: node.srn,
        name: node.name,
        title: node.title,
        kind: node.kind,
        focused: node.srn === focus,
        onRecentre: recentre,
      })
    }
    return map
  }, [nodes, focus, recentre])

  /**
   * How far back each box sits. Off the focused branch wins over merely being
   * past the framed rings, because the two say different things and the further
   * one is the one worth saying.
   *
   * At the solution root the branch is the whole containment tree, so nothing is
   * pushed to `far` and the home view still shows the solution's full shape —
   * which is the view's entire reason for existing.
   */
  const recession = useMemo(() => {
    const branch = branchOf(focus, byId)
    const levels = new Map<string, Recession>()
    for (const node of nodes) {
      const depth = layout.depth.get(node.srn)
      const beyondFramedRings = depth === undefined || depth >= layout.maxDepth
      levels.set(node.srn, !branch.has(node.srn) ? 'far' : beyondFramedRings ? 'soft' : 'none')
    }
    return levels
  }, [nodes, byId, layout, focus])

  const flowNodes = useMemo<MapFlowNode[]>(() => {
    const placed: MapFlowNode[] = []
    for (const id of frame.visible) {
      const point = frame.points.get(id)
      const data = nodeData.get(id)
      if (!point || !data) continue
      placed.push({
        id,
        type: 'mapNode',
        position: toCartesian(point),
        data,
        draggable: false,
        selectable: false,
        // `measured` is stated, not left to React Flow, and this is load-bearing.
        // A frame of the animation hands React Flow brand-new node objects; when
        // one carries no `measured`, `adoptUserNodes` treats it as never having
        // been sized, renders it `visibility: hidden` and throws away its handle
        // bounds — so a re-centring animation played out with every box
        // invisible and every edge unrouted. The boxes are a fixed size by
        // design, so saying so is both honest and the fix.
        measured: MAP_NODE,
      })
    }
    return placed
  }, [frame, nodeData])

  const flowEdges = useMemo<MapFlowEdge[]>(() => {
    const drawn: MapFlowEdge[] = []
    for (const link of links) {
      if (!frame.visible.has(link.from) || !frame.visible.has(link.to)) continue
      const spine = link.relation === 'contains'
      drawn.push({
        id: `${link.from}--${link.relation}--${link.to}`,
        source: link.from,
        target: link.to,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: spine ? 'spine' : 'cross',
        ...(spine
          ? {}
          : { markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: 'var(--border-strong)' } }),
        ariaLabel: `${link.from} ${spine ? 'contains' : link.relation} ${link.to}`,
      })
    }
    return drawn
  }, [links, frame.visible])

  // Two recessions compose here, and the order matters: the branch decides what
  // is drawn back, then hover overrides it for whatever the pointer is asking
  // about. Applied after `decorate` so both land as classes on the group React
  // Flow owns rather than fighting over one inline `opacity`.
  const highlight = useGraphHighlight(flowNodes, flowEdges)
  const litNodes = useMemo(
    () =>
      flowNodes.map((node) => setBack(highlight.decorate(node), recession.get(node.id) ?? 'none', highlight.state)),
    [flowNodes, highlight, recession],
  )
  const litEdges = useMemo(
    () =>
      flowEdges.map((edge) =>
        setBack(
          highlight.decorate(edge),
          dimmer(recession.get(edge.source) ?? 'none', recession.get(edge.target) ?? 'none'),
          highlight.state,
        ),
      ),
    [flowEdges, highlight, recession],
  )

  const trail = useMemo(() => {
    const chain: SolutionMapNode[] = []
    const seen = new Set<string>()
    let id: string | null = focus
    while (id && !seen.has(id)) {
      seen.add(id)
      const node = byId.get(id)
      if (!node) break
      chain.unshift(node)
      id = node.parent
    }
    return chain
  }, [focus, byId])

  const summary = useMemo(() => describe(byId, layout, links, recession), [byId, layout, links, recession])
  const hydrated = useIsHydrated()

  if (nodes.length <= 1) {
    return (
      <p className={cn('panel px-4 py-6 text-[13px] text-muted-foreground', className)}>
        Nothing to map — this solution has no products yet.
      </p>
    )
  }

  return (
    <figure
      className={cn('panel diagram-surface overflow-hidden', className)}
      aria-label={label}
      aria-busy={frame.animating || undefined}
    >
      <div className="relative h-full w-full" style={DIAGRAM_CANVAS_VARS}>
        {/* Overlaid rather than mounted as React Flow panels, which render after
            the nodes: a keyboard reader must not have to walk twenty-five boxes
            to reach the control that would have taken them out of there. */}
        {/* Extra room at the bottom clears React Flow's own attribution, which
            the legend would otherwise sit on top of. */}
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-2.5 pb-6">
          <FocusTrail trail={trail} root={root} onRecentre={recentre} />
          <div className="flex justify-end">
            <EdgeLegend />
          </div>
        </div>

        {!hydrated ? (
          <MapPending />
        ) : (
        <ReactFlow
          nodes={litNodes}
          edges={litEdges}
          {...highlight.handlers}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          // Positions ARE the centres: the layout is polar and its origin is the
          // focus, so letting React Flow keep its top-left convention would put
          // every ring half a box off its own radius.
          nodeOrigin={[0.5, 0.5]}
          colorMode="dark"
          minZoom={MIN_ZOOM}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          // Each box carries its own button, so React Flow's wrapper must not be
          // a second tab stop for the same target.
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={DIAGRAM_BACKGROUND.gap}
            size={DIAGRAM_BACKGROUND.size}
            color={DIAGRAM_BACKGROUND.color}
          />
          <Controls showInteractive={false} style={{ margin: 10 }} />
          <ViewportKeeper radius={fitRadius} focus={focus} reduced={reduced} />
        </ReactFlow>
        )}
      </div>

      <figcaption className="sr-only">
        <p>{summary.headline}</p>
        <ul>
          {summary.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

/** What the server sends: the shape of a map, before the canvas exists. */
function MapPending() {
  return (
    <div className="absolute inset-0 grid place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2" aria-hidden>
          <span className="h-5 w-20 animate-pulse rounded-sm bg-muted" />
          <span className="h-px w-8 bg-border-strong" />
          <span className="h-5 w-24 animate-pulse rounded-sm bg-muted" style={{ animationDelay: '120ms' }} />
        </div>
        <p className="font-mono text-[11px] tracking-tight text-muted-foreground">Drawing the map…</p>
      </div>
    </div>
  )
}

/**
 * Keeps the focus in the middle of the canvas.
 *
 * The polar layout always puts the focus at the flow origin, so "centred" is a
 * property of the viewport, not of the nodes — which is exactly what makes the
 * re-centring animation a rotation about a fixed point rather than a pan. Zoom
 * is derived from how far the outermost ring reaches, so a dense neighbourhood
 * pulls back and a sparse one does not sit lost in a large canvas.
 */
function ViewportKeeper({ radius, focus, reduced }: { radius: number; focus: string; reduced: boolean }) {
  const { setViewport } = useReactFlow()
  const width = useStore((state) => state.width)
  const height = useStore((state) => state.height)
  const settled = useRef(false)

  useEffect(() => {
    if (width === 0 || height === 0) return
    const span = (radius + MAP_NODE.width / 2 + VIEW_PADDING) * 2
    const usable = Math.max(Math.min(width, height - OVERLAY_ROOM), 120)
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, usable / span))
    // The first placement must not animate: there is nothing to travel from,
    // and a map that zooms itself on arrival reads as a page still loading.
    const duration = settled.current && !reduced ? RECENTRE_MS : 0
    settled.current = true
    void setViewport({ x: width / 2, y: height / 2, zoom }, { duration })
  }, [width, height, radius, focus, reduced, setViewport])

  return null
}

function FocusTrail({
  trail,
  root,
  onRecentre,
}: {
  trail: SolutionMapNode[]
  root: string
  onRecentre: (srn: string) => void
}) {
  const atRoot = trail.length === 1 && trail[0]?.srn === root

  return (
    <nav
      aria-label="Map focus"
      className="pointer-events-auto flex w-fit max-w-[min(52vw,540px)] items-center gap-0.5 rounded-md border border-border bg-surface/90 px-1.5 py-1 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={() => onRecentre(root)}
        disabled={atRoot}
        className="focusable rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
        aria-label="Centre the map on the solution"
        title="Back to the solution"
      >
        <Home className="size-3" aria-hidden />
      </button>

      {trail.map((node, index) => {
        const last = index === trail.length - 1
        return (
          <span key={node.srn} className="flex min-w-0 items-center gap-0.5">
            <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" aria-hidden />
            {last ? (
              <span aria-current="true" className="truncate font-mono text-[11px] text-foreground">
                {node.name}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onRecentre(node.srn)}
                className="focusable truncate rounded px-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
              >
                {node.name}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}

/**
 * The two languages, drawn the way the canvas draws them. A legend that redraws
 * its own key with different numbers is a legend that drifts from the graph, so
 * the samples below use the same widths and dash pattern as the edges.
 */
function EdgeLegend() {
  return (
    <dl className="pointer-events-auto w-[152px] rounded-md border border-border bg-surface/90 p-1.5 backdrop-blur-sm">
      <div className="flex items-center gap-2 px-0.5 py-0.5">
        <svg width="24" height="6" viewBox="0 0 24 6" aria-hidden className="shrink-0">
          <line x1="0" y1="3" x2="24" y2="3" stroke="var(--border-strong)" strokeWidth="2" />
        </svg>
        <dt className="font-mono text-[10.5px] text-foreground/80">contains</dt>
        <dd className="sr-only">Containment — the structural spine.</dd>
      </div>
      <div className="flex items-center gap-2 px-0.5 py-0.5">
        <svg width="24" height="6" viewBox="0 0 24 6" aria-hidden className="shrink-0">
          <path d="M 0 5 Q 12 -1 24 5" fill="none" stroke="var(--border)" strokeWidth="1" strokeDasharray="5 4" />
        </svg>
        <dt className="font-mono text-[10.5px] text-muted-foreground">depends on</dt>
        <dd className="sr-only">Dependency — crosses the structure rather than forming it.</dd>
      </div>
    </dl>
  )
}

/** The map in words: same content, for readers who are not looking at a canvas. */
function describe(
  byId: ReadonlyMap<string, SolutionMapNode>,
  layout: ReturnType<typeof polarLayout>,
  links: readonly SolutionMapLink[],
  recession: ReadonlyMap<string, Recession>,
): { headline: string; lines: string[] } {
  const name = (srn: string) => byId.get(srn)?.name ?? srn
  const rings = new Map<number, string[]>()
  for (const [srn, depth] of layout.depth) {
    if (depth === 0) continue
    rings.set(depth, [...(rings.get(depth) ?? []), name(srn)])
  }

  const lines = [...rings.entries()]
    .sort(([a], [b]) => a - b)
    .map(([depth, names]) => `${depth} step${depth === 1 ? '' : 's'} away: ${names.sort().join(', ')}.`)

  const crossing = links.filter(
    (link) => link.relation !== 'contains' && layout.depth.has(link.from) && layout.depth.has(link.to),
  )
  for (const link of crossing) {
    lines.push(`${name(link.from)} ${link.relation === 'uses' ? 'uses' : 'depends on'} ${name(link.to)}.`)
  }

  // Visual recession has to be said out loud, or a reader who is not looking at
  // the canvas gets a flat list where a sighted reader sees a subject and its
  // context.
  const offBranch = [...layout.depth.keys()].filter((srn) => recession.get(srn) === 'far')
  if (offBranch.length > 0) {
    lines.push(
      `Shown as context, off the focused branch: ${offBranch.map(name).sort().join(', ')}.`,
    )
  }

  return {
    headline: `Structure around ${name(layout.focus)}: ${layout.depth.size - 1} entities within ${layout.maxDepth} steps.`,
    lines,
  }
}
