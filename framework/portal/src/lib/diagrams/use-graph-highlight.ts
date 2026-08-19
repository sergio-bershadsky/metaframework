'use client'

import type { Edge, Node } from '@xyflow/react'
import { useCallback, useMemo, useState } from 'react'

/**
 * Adjacency highlighting, shared by every React Flow diagram.
 *
 * Hovering a node reveals what it is connected to: the node, its transitions or
 * relations, and whatever sits at the far end stay lit, and everything else
 * recedes. On a dense graph this is the difference between "a wall of boxes"
 * and "this state can only be reached from those two".
 *
 * The highlighted set is also RAISED. React Flow paints edges beneath nodes, so
 * without an explicit z-index the very edges the reader is tracing disappear
 * behind unrelated boxes, and their labels with them. Lifting the focused
 * subgraph is what makes the answer readable rather than merely coloured.
 *
 * Hover is not the only route in: `focus` drives the same state, so the graph
 * is explorable from the keyboard rather than being a mouse-only feature.
 */

/** Everything a diagram needs to style one element for the current hover. */
export interface HighlightState {
  /** Nothing is hovered — draw everything at full strength. */
  idle: boolean
  /** This element is the hovered one, or adjacent to it. */
  lit: (id: string) => boolean
  /** This element is the hovered one itself. */
  focused: (id: string) => boolean
}

const DIMMED_OPACITY = 0.18
/** Above React Flow's own node layer, so a lit edge is never hidden by a box. */
const LIFTED = 1000

export function useGraphHighlight<N extends Node, E extends Edge>(nodes: N[], edges: E[]) {
  const [hovered, setHovered] = useState<string | null>(null)

  /** Node id → the nodes and edges that touch it, in both directions. */
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const touch = (a: string, b: string) => {
      if (!map.has(a)) map.set(a, new Set([a]))
      map.get(a)?.add(b)
    }
    for (const node of nodes) touch(node.id, node.id)
    for (const edge of edges) {
      touch(edge.source, edge.target)
      touch(edge.target, edge.source)
      touch(edge.source, edge.id)
      touch(edge.target, edge.id)
      // An edge is its own neighbourhood too, so hovering one lights both ends.
      map.set(edge.id, new Set([edge.id, edge.source, edge.target]))
    }
    return map
  }, [nodes, edges])

  const neighbourhood = hovered ? adjacency.get(hovered) : undefined

  const state = useMemo<HighlightState>(
    () => ({
      idle: hovered === null,
      lit: (id: string) => hovered === null || (neighbourhood?.has(id) ?? false),
      focused: (id: string) => hovered === id,
    }),
    [hovered, neighbourhood],
  )

  const onNodeMouseEnter = useCallback((_: unknown, node: Node) => setHovered(node.id), [])
  const onEdgeMouseEnter = useCallback((_: unknown, edge: Edge) => setHovered(edge.id), [])
  const clear = useCallback(() => setHovered(null), [])

  /**
   * Apply the current highlight to a node or edge. Returns the props React Flow
   * reads — opacity for recession, z-index for lift — leaving colour and stroke
   * to the diagram's own node and edge components, which know their own palette.
   */
  const decorate = useCallback(
    <T extends { id: string; style?: React.CSSProperties; className?: string; zIndex?: number }>(
      element: T,
    ): T => {
      const lit = state.lit(element.id)
      return {
        ...element,
        // The class carries the dimming, not `style`: React Flow forwards an
        // edge's `style` to its *path*, which a custom edge component is free
        // to ignore — and both diagrams use custom edges. A class lands on the
        // group React Flow owns, so it dims the edge, its marker and its label
        // together, whatever the component chooses to render.
        className: [element.className, lit ? undefined : 'dgm-recede'].filter(Boolean).join(' ') || undefined,
        style: { ...element.style, transition: 'opacity 140ms ease-out' },
        zIndex: state.idle ? element.zIndex : lit ? LIFTED + (state.focused(element.id) ? 1 : 0) : 0,
      }
    },
    [state],
  )

  return {
    hovered,
    state,
    decorate,
    /** Spread onto <ReactFlow> to drive highlighting from pointer and focus. */
    handlers: {
      onNodeMouseEnter,
      onNodeMouseLeave: clear,
      onEdgeMouseEnter,
      onEdgeMouseLeave: clear,
      onPaneMouseLeave: clear,
    },
    setHovered,
  }
}
