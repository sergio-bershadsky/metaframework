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
 * The one place the two diagrams agree on rhythm. Layered is the right family
 * for both: a state chart is a flow, and a relation graph is a DAG with the
 * occasional cycle, which `layered` handles by reversing back edges rather than
 * collapsing into a hairball the way force-directed layouts do.
 */
const SHARED_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.layered.spacing.nodeNodeBetweenLayers': '84',
  'elk.layered.spacing.edgeNodeBetweenLayers': '28',
  'elk.spacing.edgeLabel': '10',
  'elk.spacing.nodeNode': '32',
  'elk.spacing.edgeNode': '24',
  'elk.spacing.edgeEdge': '14',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  // Authoring order is meaningful in both sources (the order states and
  // relations are written in), so ties break towards it instead of arbitrarily.
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  // Nested states are laid out together with the states around them; without
  // this a compound state is placed as an opaque box and the edges into its
  // children cross it.
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.padding': '[top=24,left=24,bottom=24,right=24]',
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
  // between layers is used — the renderer places the label on its own edge.
  return { nodes: placed, width: laid.width ?? 0, height: laid.height ?? 0 }
}
