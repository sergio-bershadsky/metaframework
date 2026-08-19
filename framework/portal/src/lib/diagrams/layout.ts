import type { ELK, ElkNode, LayoutOptions } from 'elkjs/lib/elk.bundled.js'

/**
 * Shared elkjs layout for every derived diagram.
 *
 * Both graphs in the portal — the protocol state chart and the entity relation
 * graph — run through this one module so they come out looking like siblings:
 * same algorithm, same spacing rhythm, same canvas chrome. A second set of ELK
 * options living next to a component is how two diagrams in one product start
 * to look like two products.
 *
 * ELK computes *placement only*. Edge routing is left to React Flow, which
 * already knows where the handles are and re-routes for free while a node is
 * dragged — routing twice would fight itself the moment the user touches the
 * canvas.
 */

export type LayoutDirection = 'RIGHT' | 'DOWN'

export interface LayoutNode {
  id: string
  /** Measured or estimated size. Ignored for a node that turns out to have children. */
  width: number
  height: number
  /** Parent id for compound graphs; the node is laid out inside its parent. */
  parent?: string | null
  /**
   * Inner padding of a compound node — the top value is what leaves room for
   * its header label, so it is per-diagram rather than global.
   */
  padding?: { top: number; right: number; bottom: number; left: number }
}

export interface LayoutEdge {
  id: string
  source: string
  target: string
  /**
   * Size of the label the renderer will draw on this edge. ELK reserves the
   * space between layers, which is what keeps transition labels off the state
   * boxes — the label itself is still positioned by the renderer.
   */
  label?: { width: number; height: number }
}

export interface LayoutInput {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  /** `DOWN` reads as a flow of time (state charts); `RIGHT` as dependency. */
  direction?: LayoutDirection
  /** Merged over the shared options. Use for one knob, not for a second style. */
  options?: LayoutOptions
}

export interface PlacedNode {
  id: string
  /** Position relative to the parent node — the coordinate React Flow wants. */
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutResult {
  nodes: PlacedNode[]
  /** Bounds of the laid-out graph, for fitting the viewport. */
  width: number
  height: number
}

/**
 * Diagram spacing — the rule, defined once.
 *
 * Every derived diagram reads these numbers, so spacing is a property of the
 * system rather than something re-tuned per component. Change a value here and
 * every diagram, including ones not yet written, moves with it.
 *
 * The scale is deliberately generous: these diagrams are read, not glanced at,
 * and crowded nodes make edges ambiguous exactly when a reviewer is trying to
 * follow one. Values step roughly 1.5× apart so the hierarchy stays legible —
 * gaps between layers read as "further apart" than gaps within one.
 */
export const DIAGRAM_SPACING = {
  /** Between successive layers — the dominant sense of depth. */
  betweenLayers: 120,
  /** Between siblings inside one layer. */
  betweenNodes: 52,
  /** Keeps edges off the boxes they pass. */
  edgeToNode: 32,
  /** Keeps parallel edges distinguishable where they run together. */
  edgeToEdge: 18,
  /** Room reserved between layers for an edge label. */
  edgeLabel: 14,
  /** Breathing room inside the canvas, before the first node. */
  canvasPadding: 32,
} as const

/**
 * The one place the two diagrams agree on rhythm. Layered is the right family
 * for both: a state chart is a flow, and a relation graph is a DAG with the
 * occasional cycle, which `layered` handles by reversing back edges rather than
 * collapsing into a hairball the way force-directed layouts do.
 */
const SHARED_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.layered.spacing.nodeNodeBetweenLayers': String(DIAGRAM_SPACING.betweenLayers),
  'elk.layered.spacing.edgeNodeBetweenLayers': String(DIAGRAM_SPACING.edgeToNode),
  'elk.spacing.edgeLabel': String(DIAGRAM_SPACING.edgeLabel),
  'elk.spacing.nodeNode': String(DIAGRAM_SPACING.betweenNodes),
  'elk.spacing.edgeNode': String(DIAGRAM_SPACING.edgeToNode),
  'elk.spacing.edgeEdge': String(DIAGRAM_SPACING.edgeToEdge),
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  // Authoring order is meaningful in both sources (the order states and
  // relations are written in), so ties break towards it instead of arbitrarily.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  // Nested states are laid out together with the states around them; without
  // this a compound state is placed as an opaque box and the edges into its
  // children cross it.
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.padding': `[top=${DIAGRAM_SPACING.canvasPadding},left=${DIAGRAM_SPACING.canvasPadding},bottom=${DIAGRAM_SPACING.canvasPadding},right=${DIAGRAM_SPACING.canvasPadding}]`,
}

/** Smallest canvas worth drawing; below this the chrome outweighs the graph. */
const MIN_CANVAS_HEIGHT = 220

/**
 * Canvas height that fits the graph instead of a fixed guess.
 *
 * A fixed height leaves a small graph sitting in a large empty panel, which
 * reads as "something failed to load". The supplied height becomes a *ceiling*:
 * short graphs shrink to their content, tall ones stop growing and pan instead.
 */
export function fitCanvasHeight(laidOutHeight: number | null, maxHeight: number): number {
  if (laidOutHeight === null || laidOutHeight <= 0) return Math.min(maxHeight, MIN_CANVAS_HEIGHT)
  const withChrome = laidOutHeight + DIAGRAM_SPACING.canvasPadding * 2
  return Math.round(Math.min(maxHeight, Math.max(MIN_CANVAS_HEIGHT, withChrome)))
}

/**
 * React Flow's own CSS variables, re-pointed at the console's design tokens.
 * Exported from here rather than from globals.css because the diagrams are the
 * only consumers, and because both must inherit exactly the same canvas.
 * Spread onto the wrapper element's `style`.
 */
export const DIAGRAM_CANVAS_VARS: Record<string, string> = {
  '--xy-background-color': 'transparent',
  '--xy-edge-stroke': 'var(--border-strong)',
  '--xy-edge-stroke-selected': 'var(--primary)',
  '--xy-edge-stroke-width': '1.25',
  '--xy-connectionline-stroke': 'var(--primary)',
  '--xy-attribution-background-color': 'transparent',
  '--xy-handle-background-color': 'var(--border-strong)',
  '--xy-handle-border-color': 'transparent',
  '--xy-selection-background-color': 'oklch(0.68 0.19 274 / 0.08)',
  '--xy-selection-border': '1px dotted var(--primary)',
  '--xy-controls-button-background-color': 'var(--surface)',
  '--xy-controls-button-background-color-hover': 'var(--surface-raised)',
  '--xy-controls-button-color': 'var(--muted-foreground)',
  '--xy-controls-button-color-hover': 'var(--foreground)',
  '--xy-controls-button-border-color': 'var(--border)',
  '--xy-controls-box-shadow': '0 0 0 1px var(--border)',
  '--xy-minimap-background-color': 'var(--surface)',
  '--xy-minimap-mask-background-color': 'oklch(0.155 0.009 268 / 0.72)',
  '--xy-minimap-node-stroke-width': '0',
  '--xy-node-border-radius': '6px',
}

/** The dotted substrate, subtle enough to stay behind the graph. */
export const DIAGRAM_BACKGROUND = {
  gap: 18,
  size: 1,
  color: 'var(--border)',
} as const

let elkInstance: Promise<ELK> | null = null

/**
 * ELK is loaded on demand: the bundle is ~1.4 MB of GWT output, and it must
 * never be evaluated during SSR — layout only ever runs from an effect.
 */
async function elk(): Promise<ELK> {
  elkInstance ??= import('elkjs/lib/elk.bundled.js').then((module) => new module.default())
  return elkInstance
}

export async function layoutGraph(input: LayoutInput): Promise<LayoutResult> {
  const { nodes, edges, direction = 'DOWN', options } = input
  if (nodes.length === 0) return { nodes: [], width: 0, height: 0 }

  const byId = new Map<string, ElkNode>()
  for (const node of nodes) byId.set(node.id, { id: node.id, width: node.width, height: node.height })

  const roots: ElkNode[] = []
  for (const node of nodes) {
    const elkNode = byId.get(node.id) as ElkNode
    const parent = node.parent ? byId.get(node.parent) : undefined
    if (!parent) {
      roots.push(elkNode)
      continue
    }
    parent.children ??= []
    parent.children.push(elkNode)
  }

  for (const node of nodes) {
    const elkNode = byId.get(node.id) as ElkNode
    if (!elkNode.children) continue
    // A compound node is sized by its contents; keeping the estimated size
    // would clip the children ELK just placed inside it.
    delete elkNode.width
    delete elkNode.height
    const pad = node.padding ?? { top: 40, right: 20, bottom: 20, left: 20 }
    elkNode.layoutOptions = {
      'elk.padding': `[top=${pad.top},left=${pad.left},bottom=${pad.bottom},right=${pad.right}]`,
    }
  }

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: { ...SHARED_OPTIONS, 'elk.direction': direction, ...options },
    children: roots,
    edges: edges
      // Self-loops carry no layout constraint but do cost ELK a spurious layer;
      // React Flow draws them as a loop on the node itself.
      .filter((edge) => edge.source !== edge.target && byId.has(edge.source) && byId.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        sources: [edge.source],
        targets: [edge.target],
        ...(edge.label ? { labels: [{ text: '', width: edge.label.width, height: edge.label.height }] } : {}),
      })),
  }

  const laid = await (await elk()).layout(graph)

  const placed: PlacedNode[] = []
  const collect = (children: ElkNode[] | undefined) => {
    for (const child of children ?? []) {
      placed.push({
        id: child.id,
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? 0,
        height: child.height ?? 0,
      })
      collect(child.children)
    }
  }
  collect(laid.children)

  // ELK's own label coordinates are deliberately ignored: they are expressed
  // against a routing this module never asked ELK to produce, so they land
  // nowhere near the curve React Flow draws. Only the *space* they reserved
  // between layers is used — the renderer places the label on its own edge,
  // and `spreadEdgeLabels` below is what keeps two of those apart.
  return { nodes: placed, width: laid.width ?? 0, height: laid.height ?? 0 }
}

/**
 * One edge label, described where the renderer will actually draw it.
 *
 * The anchor is the point React Flow hands the edge component — for every
 * bezier this module produces that is the chord midpoint, because the two
 * control offsets are equal and cancel in `getBezierEdgeCenter`. Keeping the
 * description in the renderer's own terms is what lets the solver run without a
 * DOM, and therefore be tested.
 */
export interface EdgeLabelBox {
  id: string
  /** Where the renderer anchors the chip, in flow coordinates. */
  anchor: { x: number; y: number }
  /** Top-left of the drawn chip relative to the anchor — a centred chip is (-w/2, -h/2). */
  origin: { x: number; y: number }
  width: number
  height: number
  /** Direction the chip may slide in; normalised by the solver. */
  along: { x: number; y: number }
  /** Length of the edge, so a label is never pushed off its own curve. */
  span: number
}

export interface SpreadLabelsOptions {
  /** Distance between successive candidate positions. */
  step?: number
  /** Clear space demanded between two chips. */
  gap?: number
  /** How many steps out, in each direction, the solver may try. */
  shifts?: number
  /**
   * Rectangles already on the canvas — the node boxes the labels are drawn
   * over. Without them the solver will happily slide a chip off one label and
   * straight onto a state's name, which is a worse collision than the one it
   * was fixing.
   */
  obstacles?: readonly Rect[]
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Push overlapping edge labels apart *along their own edges*.
 *
 * Labels are the densest thing on a state chart and the only thing on it with
 * no layout of its own: ELK reserves space between layers for them, then the
 * renderer drops each one at its edge's midpoint, and two edges whose midpoints
 * land together produce two chips stacked on the same pixels. Sliding a chip
 * along its edge is the one displacement that cannot lie about which edge the
 * label belongs to — moving it sideways would.
 *
 * Placement is greedy in the given order (authoring order, which is meaningful
 * in the source), and the shift is capped at a third of the edge so a label
 * never drifts far enough to read as another edge's. Node boxes are passed in
 * as `obstacles`: on a crowded chart the least-bad slot is taken rather than
 * none, and without the boxes "least bad" would happily mean *on top of a
 * state's name*.
 */
export function spreadEdgeLabels(
  boxes: readonly EdgeLabelBox[],
  { step = 22, gap = 4, shifts = 5, obstacles = [] }: SpreadLabelsOptions = {},
): Map<string, { x: number; y: number }> {
  const placed: Rect[] = [...obstacles]
  const offsets = new Map<string, { x: number; y: number }>()

  for (const box of boxes) {
    const length = Math.hypot(box.along.x, box.along.y)
    const unit = length > 0 ? { x: box.along.x / length, y: box.along.y / length } : { x: 0, y: 1 }
    const limit = box.span / 3
    // A stride shorter than the chip itself cannot clear a chip at the same
    // anchor on a vertical edge, which is the case this exists for.
    const stride = Math.max(step, box.height + gap)

    let chosen = { x: 0, y: 0 }
    let least = Number.POSITIVE_INFINITY
    for (const distance of candidates(stride, shifts)) {
      if (Math.abs(distance) > limit) continue
      const offset = { x: unit.x * distance, y: unit.y * distance }
      const rect = rectOf(box, offset)
      const cost = placed.reduce((total, other) => total + overlap(rect, other, gap), 0)
      if (cost === 0) {
        chosen = offset
        least = 0
        break
      }
      // A crowded chart runs out of free slots. Falling back to the midpoint
      // then would put the chip exactly where the collision was worst; the
      // least bad position it can legally reach is the honest answer.
      if (cost < least) {
        chosen = offset
        least = cost
      }
    }

    offsets.set(box.id, chosen)
    // Recorded whatever was chosen: a chip that could not get clear still
    // occupies its pixels, and the labels after it must know.
    placed.push(rectOf(box, chosen))
  }

  return offsets
}

/** 0, +step, −step, +2·step, −2·step, … — nearest first, so nothing moves without cause. */
function candidates(step: number, shifts: number): number[] {
  const out = [0]
  for (let index = 1; index <= shifts; index += 1) out.push(index * step, -index * step)
  return out
}

function rectOf(box: EdgeLabelBox, offset: { x: number; y: number }): Rect {
  return {
    x: box.anchor.x + box.origin.x + offset.x,
    y: box.anchor.y + box.origin.y + offset.y,
    width: box.width,
    height: box.height,
  }
}

/** Area the two chips would share, with the demanded gap counted as occupied. */
function overlap(a: Rect, b: Rect, gap: number): number {
  const across = Math.min(a.x + a.width, b.x + b.width + gap) - Math.max(a.x, b.x - gap)
  const down = Math.min(a.y + a.height, b.y + b.height + gap) - Math.max(a.y, b.y - gap)
  return across > 0 && down > 0 ? across * down : 0
}
