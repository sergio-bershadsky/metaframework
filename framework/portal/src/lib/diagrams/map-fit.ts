import { type PolarLayout, toCartesian } from './polar'

/**
 * How much of a solution the map draws, and at what zoom.
 *
 * This is the arithmetic behind one rule:
 *
 *   THE MAP DRAWS EVERY RING IT CAN FRAME LEGIBLY, AND COUNTS WHAT IS LEFT OUT.
 *
 * The rule replaces a special case. The root view used to stop at the products
 * while every other focus kept three rings, which fixed the root and moved the
 * problem one click away: clicking a product restored full depth and landed the
 * reader back at a zoom where 12px type renders at four. A reader following the
 * affordance the root view offers must not arrive at the thing the root view
 * exists to avoid, so the depth limit belongs to the VIEW, not to one node.
 *
 * Depth is chosen by measurement, not by taste. A view reaches a known distance
 * on each axis, the canvas is a known box, and the zoom that fits one into the
 * other is division. Ask for three rings, keep dropping the outermost while the
 * resulting zoom would put the labels below `LEGIBLE_ZOOM`, and stop. Whatever
 * is dropped is already reported: every box carries a `+n` count of what it
 * contains that the current view is not drawing, which is the mechanism the old
 * root view introduced and the only part of it worth keeping.
 *
 * Living in `lib` rather than in the component is what makes the promise
 * testable: `map-fit.test.ts` walks every focus of every shipped solution at
 * three window sizes, asserts that no two boxes overlap in any of them, and
 * either clears the floor or names the view that cannot — which nothing that
 * needed a browser could do at that coverage.
 */

/**
 * One size for every box: the focus is marked by its ring, never by its bulk.
 *
 * A box carries the entity's NAME and nothing else. On an entity page there is
 * room to gloss an identifier with its title; on a map there are twenty-five of
 * them at once, and the title is the first thing that stops being read. It is
 * still on the focused node, in the tooltip, and in the caption below.
 */
export const MAP_NODE = { width: 158, height: 30 } as const

/** Type size of the name in a box, in CSS pixels before zoom. */
export const LABEL_PX = 12

/** Clear space demanded between the two closest boxes on the canvas. */
const NODE_GAP = 22

/**
 * Smallest centre-to-centre distance the layout may place two boxes at.
 *
 * The DIAGONAL plus a gap, not the width plus a gap. Two equal axis-aligned
 * boxes overlap exactly when their centres differ by less than a full width
 * horizontally AND less than a full height vertically, so the offsets that
 * collide fill a rectangle — and a rectangle's farthest corner, not its widest
 * edge, is what a single distance has to clear if it is to hold at every angle.
 * hypot(158, 30) is 160.8; a 158 rule would leave a diagonal pair touching.
 *
 * One distance for all directions is worth the ~2px it costs over an
 * angle-aware rule: the map re-centres, every angle in it changes as it does,
 * and a guarantee that depends on the current angles is not a guarantee.
 */
export const NODE_SEPARATION = Math.hypot(MAP_NODE.width, MAP_NODE.height) + NODE_GAP

/** Clear space between the fitted ring and the canvas edge. */
const VIEW_PADDING = 40

/** Vertical room left for the trail and the legend to sit over. */
const OVERLAY_ROOM = 44

export const MIN_ZOOM = 0.35
export const MAX_ZOOM = 1

/**
 * The zoom below which a box is present but not read.
 *
 * 0.75 renders the 12px name at 9px. The number is anchored at both ends by
 * measurement rather than by preference: the three-ring views this replaces
 * measured 0.36 at 1024x720 — 4.3px, a grey smear — and the root view that was
 * accepted as legible measured 0.82, or 9.9px. 0.75 sits just under the good
 * end, which is where a floor belongs: high enough that nothing near the bad
 * end can pass, low enough that it does not throw away a ring that reads
 * perfectly well.
 *
 * It is a floor the rule aims at, not one it can always reach. Depth is the
 * only thing there is to trade, and the first ring cannot be traded away — a
 * focus drawn with no neighbours is not a map. So a focus with nine or more
 * immediate neighbours on a 670x486 canvas lands under the floor and stays
 * there; `map-fit.test.ts` names every such view in this catalog and asserts
 * that nothing else joins them.
 */
export const LEGIBLE_ZOOM = 0.75

/** The most rings any view draws, before legibility takes some away. */
export const MAX_DEPTH = 3

export interface CanvasSize {
  width: number
  height: number
}

/** Half the width and half the height the drawn boxes need, focus at centre. */
export interface MapExtent {
  halfWidth: number
  halfHeight: number
}

/**
 * How much room a view needs on each axis, measured on the boxes it draws.
 *
 * NOT a disc of the outermost radius, which is the obvious thing to fit and
 * throws away most of the canvas. A solution and two products is three boxes in
 * a row — 524 units across and 30 tall — and treating that as a 524-wide circle
 * asks a 670x486 canvas for room it has no reason to give: measured, the disc
 * fit put that view at zoom 0.73 where the real shape fits at 1.0. The rings
 * are round; what is drawn on them almost never is.
 *
 * Half-extents rather than a bounding box because the focus stays pinned to the
 * middle of the canvas — that is what makes re-centring a rotation about a
 * fixed point — so the room a view needs is twice its furthest reach from the
 * origin, in each direction, and half a box on top for the box itself.
 */
export function drawnExtent(layout: PolarLayout): MapExtent {
  let x = 0
  let y = 0
  for (const point of layout.points.values()) {
    const at = toCartesian(point)
    x = Math.max(x, Math.abs(at.x))
    y = Math.max(y, Math.abs(at.y))
  }
  return {
    halfWidth: x + MAP_NODE.width / 2 + VIEW_PADDING,
    halfHeight: y + MAP_NODE.height / 2 + VIEW_PADDING,
  }
}

/** The zoom at which a view's own extent fits the canvas. */
export function fitZoom({ halfWidth, halfHeight }: MapExtent, { width, height }: CanvasSize): number {
  const across = Math.max(width, 120) / (halfWidth * 2)
  const down = Math.max(height - OVERLAY_ROOM, 120) / (halfHeight * 2)
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(across, down)))
}

/**
 * The deepest of the offered layouts that still frames legibly.
 *
 * `candidates` are the same neighbourhood cut at one, two and three rings, in
 * that order. The search runs from the outside in and returns the first that
 * clears the floor; when even the shallowest does not — a solution with more
 * products than a circle can hold at this size — it returns that shallowest one
 * anyway. Refusing to draw would be worse than drawing something small, and the
 * failure is at least reported: the caption and the `+n` counts say what is
 * missing either way.
 *
 * The returned value is one of the candidate objects, unchanged. That identity
 * is load-bearing: it is what lets a resize that does not change the answer
 * leave the layout — and therefore the transition, the node data and every
 * memo hanging off them — untouched.
 */
export function fittedLayout<T extends PolarLayout>(candidates: readonly T[], size: CanvasSize): T {
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const candidate = candidates[index]
    if (fitZoom(drawnExtent(candidate), size) >= LEGIBLE_ZOOM) return candidate
  }
  return candidates[0]
}

/** Containment children per node, in the order the catalog listed them. */
export function childrenOf(
  nodes: readonly { srn: string; parent: string | null }[],
): Map<string, string[]> {
  const children = new Map<string, string[]>()
  for (const node of nodes) {
    if (node.parent === null) continue
    children.set(node.parent, [...(children.get(node.parent) ?? []), node.srn])
  }
  return children
}

/**
 * How many boxes are missing from this view, charged to the nearest box that
 * IS drawn.
 *
 * Each absent entity is counted exactly once, by walking up from it until a
 * drawn ancestor is found. So the badges across the canvas sum to the number of
 * boxes actually missing, and a box only carries a marker when the gap is
 * directly beneath it.
 *
 * It used to count each box's whole subtree, which double-reported: with three
 * components missing under `acme`, the canvas drew six markers summing to ten —
 * `+3` on the solution, and the same absences again on every product and
 * component above them. The solution reading `+3` while all five of its
 * products were plainly drawn is what made it look like a miscount. It was not
 * a miscount; it was the same three boxes reported four times.
 *
 * The original intent survives intact, because it was never about ancestors.
 * A product whose one missing component holds four of its own still reads `+5`:
 * none of those five has a drawn ancestor nearer than the product, so all five
 * charge to it. What changed is only that boxes ABOVE a drawn child stop
 * repeating what that child already says.
 *
 * Lives here rather than beside the node component so it can be tested without
 * a DOM: it is arithmetic over the projection, like everything else here.
 */
export function hiddenCounts(
  nodes: readonly { srn: string; parent: string | null }[],
  placed: ReadonlySet<string>,
): Map<string, number> {
  const parent = new Map(nodes.map((node) => [node.srn, node.parent]))
  const counts = new Map<string, number>(nodes.map((node) => [node.srn, 0]))

  for (const node of nodes) {
    if (placed.has(node.srn)) continue
    let ancestor = parent.get(node.srn) ?? null
    while (ancestor !== null && !placed.has(ancestor)) ancestor = parent.get(ancestor) ?? null
    // No drawn ancestor at all: the box is outside this view entirely, and
    // there is nothing on screen it could sensibly be charged to.
    if (ancestor !== null) counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1)
  }

  return counts
}
