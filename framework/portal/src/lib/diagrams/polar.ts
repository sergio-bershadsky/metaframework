/**
 * Polar layout — the solution map's own geometry.
 *
 * Everything else in the portal hands its graph to ELK, because a state chart
 * and a relation graph are *flows*: they have a direction, and layered is the
 * family that respects one. The solution map is not a flow. It answers "what is
 * around this thing", and the honest shape of that question is a centre with
 * rings around it — depth is distance, and nothing else is.
 *
 * Positions are therefore computed here, in polar coordinates, and only turned
 * into x/y at the last moment. That is not a stylistic choice: re-centring the
 * map interpolates ANGLE and RADIUS separately, so the graph swings around its
 * new centre instead of sliding across the canvas. Cartesian positions cannot
 * express that motion — the arc is only visible if the arc is what you store.
 *
 * The module is deliberately free of React and of the DOM: it takes ids and
 * links and returns numbers, which is what makes the geometry testable without
 * a browser.
 */

const TAU = Math.PI * 2

export interface PolarPoint {
  /** Distance from the focus, in flow units. Zero for the focus itself. */
  radius: number
  /** Radians, clockwise from three o'clock (SVG's own sense of rotation). */
  angle: number
}

/**
 * One connection, tagged with which of the map's two edge languages it speaks.
 *
 * `structural` is containment — the solution/product/component spine. The
 * distinction is not only drawn, it is *laid out*: containment wins when two
 * paths reach a node at the same depth, so the ring a node sits on is its
 * position in the structure whenever the structure can explain it.
 */
export interface PolarLink {
  source: string
  target: string
  structural: boolean
}

export interface PolarInput {
  /** Every node that may appear. Ids outside this set are ignored on links. */
  nodes: readonly string[]
  links: readonly PolarLink[]
  /** The node placed at the centre. */
  focus: string
  /** Rings beyond this depth are not placed at all. */
  maxDepth?: number
  /** Smallest step between successive rings. */
  ringGap?: number
  /**
   * Smallest centre-to-centre distance any two boxes may sit at.
   *
   * A straight-line distance, not an arc: what has to clear is the gap between
   * two rectangles, and no amount of angle between them says anything about
   * that. Callers pass a value larger than the box's own diagonal — two
   * axis-aligned boxes at that distance cannot overlap whatever direction the
   * offset points in, which is the property that has to survive the map being
   * re-centred and every angle in it changing.
   */
  nodeSeparation?: number
  /** Where a lone first-ring node sits. Default is straight up. */
  startAngle?: number
}

export interface PolarLayout {
  focus: string
  /** Where each placed node sits. Nodes beyond `maxDepth` are absent. */
  points: ReadonlyMap<string, PolarPoint>
  /** Ring index, 0 for the focus. */
  depth: ReadonlyMap<string, number>
  /** The node this one was reached from — the spoke it hangs off. */
  parent: ReadonlyMap<string, string | null>
  /** Radius of each ring, indexed by depth. */
  radii: readonly number[]
  /** Radius of the outermost placed ring; 0 when only the focus is placed. */
  extent: number
  maxDepth: number
}

const DEFAULTS = {
  maxDepth: 3,
  ringGap: 150,
  nodeSeparation: 182,
  startAngle: -Math.PI / 2,
} as const

/** A ring may not grow more than this many steps to fit a crowded ring. */
const MAX_RING_STRETCH = 3

/**
 * How hard a subtree's size pulls on the wedge it gets.
 *
 * Damping keeps the ordering — a big branch still gets more room — while
 * bounding how lopsided the split may become, so a product with seventeen
 * components cannot starve its two-component sibling into a sliver.
 *
 * The exponent used to be the lever that decided whether a map was readable,
 * because rings were sized by the narrowest WEDGE on them and a sliver pushed
 * every ring outwards. Under the chord rule below it is nearly inert, and the
 * measurement says so. Walking every focus of the three shipped solutions at
 * three window sizes, and summing the mean number of rings each view manages to
 * draw at the legibility floor (more is better, since the floor is held
 * either way):
 *
 *     exponent      1.0     0.75    0.5
 *     rings drawn   12.56   12.58   12.31
 *     worst zoom    0.582   0.582   0.582
 *
 * 0.75 stays because it is marginally the best of the three and because the
 * anti-sliver property is worth keeping on its own terms — not because the
 * legibility of this catalog depends on it any more. It does not.
 */
const WEIGHT_EXPONENT = 0.75

export function polarLayout(input: PolarInput): PolarLayout {
  const {
    nodes,
    links,
    focus,
    maxDepth = DEFAULTS.maxDepth,
    ringGap = DEFAULTS.ringGap,
    nodeSeparation = DEFAULTS.nodeSeparation,
    startAngle = DEFAULTS.startAngle,
  } = input

  const present = new Set(nodes)
  const empty: PolarLayout = {
    focus,
    points: new Map(),
    depth: new Map(),
    parent: new Map(),
    radii: [0],
    extent: 0,
    maxDepth,
  }
  if (!present.has(focus)) return empty

  const { structural, associative } = adjacency(links, present)

  // --- rings ---------------------------------------------------------------
  // Breadth-first, one whole level at a time, containment before dependency.
  // Expanding by language rather than by node is what guarantees the spine
  // wins: a component reachable both from its product and from something that
  // merely depends on it hangs off the product.
  const depth = new Map<string, number>([[focus, 0]])
  const parent = new Map<string, string | null>([[focus, null]])
  const levels: string[][] = [[focus]]

  for (let ring = 1; ring <= maxDepth; ring += 1) {
    const next: string[] = []
    for (const neighbours of [structural, associative]) {
      for (const from of levels[ring - 1]) {
        for (const to of neighbours.get(from) ?? []) {
          if (depth.has(to)) continue
          depth.set(to, ring)
          parent.set(to, from)
          next.push(to)
        }
      }
    }
    if (next.length === 0) break
    levels.push(next)
  }

  // --- wedges --------------------------------------------------------------
  // A node's children share its wedge, split by how many leaves each subtree
  // carries — damped, see WEIGHT_EXPONENT. Children therefore always sit inside
  // their parent's slice, which is what makes containment read as spokes.
  const children = new Map<string, string[]>()
  for (let ring = 1; ring < levels.length; ring += 1) {
    for (const id of levels[ring]) {
      const owner = parent.get(id)
      if (!owner) continue
      const list = children.get(owner)
      if (list) list.push(id)
      else children.set(owner, [id])
    }
  }

  const leaves = new Map<string, number>()
  for (let ring = levels.length - 1; ring >= 0; ring -= 1) {
    for (const id of levels[ring]) {
      const kids = children.get(id) ?? []
      leaves.set(id, kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + (leaves.get(kid) ?? 1), 0))
    }
  }
  const share = (id: string) => (leaves.get(id) ?? 1) ** WEIGHT_EXPONENT

  const angle = new Map<string, number>([[focus, startAngle]])

  // The focus owns the wedge *centred* on `startAngle`, not one beginning
  // there, so a single first-ring node lands exactly on it rather than
  // half a turn away.
  const stack: Array<{ id: string; from: number; to: number }> = [
    { id: focus, from: startAngle - Math.PI, to: startAngle + Math.PI },
  ]
  while (stack.length > 0) {
    const { id, from, to } = stack.pop() as { id: string; from: number; to: number }
    const kids = children.get(id) ?? []
    if (kids.length === 0) continue
    const total = kids.reduce((sum, kid) => sum + share(kid), 0) || 1
    let cursor = from
    for (const kid of kids) {
      const wedge = (to - from) * (share(kid) / total)
      angle.set(kid, cursor + wedge / 2)
      stack.push({ id: kid, from: cursor, to: cursor + wedge })
      cursor += wedge
    }
  }

  // --- radii ---------------------------------------------------------------
  // A ring grows until the two CLOSEST boxes on it are far enough apart.
  //
  // Closest in straight-line distance, which is the only thing a box can
  // overlap along. Sizing a ring from the narrowest WEDGE on it — the obvious
  // reading of "give every node room" — measures the wrong quantity twice over.
  // It is too generous when a wedge is narrow but its owner's neighbours are
  // half a turn away, and too mean when a wedge is wide: two products on a
  // three-node map each own a half-circle, and a half-circle of angle says
  // nothing about whether 158px of box fits between their centres. It did not.
  // The solution and both its products overlapped at every window size.
  //
  // The constraint is the chord. Two nodes on ring r separated by Δ radians sit
  //
  //     2 · r · sin(Δ/2)
  //
  // apart, so the ring must satisfy 2·r·sin(Δ/2) ≥ nodeSeparation for its
  // smallest Δ. Sorting the ring by angle makes that pair adjacent — on a
  // circle the closest pair always is — so one pass over the sorted gaps finds
  // it.
  //
  // Two more pairs exist and neither needs its own rule. The focus sits at the
  // origin, so its distance to any ring-1 node is exactly r₁; and any two nodes
  // on different rings are at least (rₖ − rₖ₋₁) apart, by the triangle
  // inequality. Both are covered by making the step between rings — and hence
  // the first ring's radius — never smaller than the separation.
  //
  // The stretch stays capped: past a point a ring that has grown to avoid every
  // overlap has simply left the canvas, and a crowded ring is answered by
  // drawing fewer rings (see the map's own depth rule) rather than by pushing
  // this one out to the horizon.
  const step = Math.max(ringGap, nodeSeparation)
  const radii = [0]
  for (let ring = 1; ring < levels.length; ring += 1) {
    const closest = closestGap(levels[ring], angle)
    const needed = closest === undefined ? 0 : nodeSeparation / (2 * Math.sin(closest / 2))
    const floor = radii[ring - 1] + step
    radii.push(Math.min(Math.max(floor, needed), radii[ring - 1] + step * MAX_RING_STRETCH))
  }

  const points = new Map<string, PolarPoint>()
  for (const [id, ring] of depth) {
    points.set(id, { radius: radii[ring] ?? 0, angle: angle.get(id) ?? startAngle })
  }

  return {
    focus,
    points,
    depth,
    parent,
    radii,
    extent: radii[radii.length - 1] ?? 0,
    maxDepth,
  }
}

/**
 * The smallest angle between any two nodes on one ring, or `undefined` when
 * there are fewer than two of them and nothing on the ring can collide.
 *
 * Sorting is what makes this one pass rather than n²: on a circle the closest
 * pair is always adjacent in angular order, so only the consecutive gaps — the
 * wrap-around one included — can win. The result never exceeds π, because the
 * gaps sum to a full turn, so `sin(gap / 2)` is on its rising arm and the chord
 * it feeds is monotone in the gap.
 *
 * The floor guards a degenerate ring: two nodes sharing an angle would demand
 * an infinite radius, and an infinity here propagates into every position on
 * the map. The caller's stretch cap turns the large-but-finite number this
 * returns into a bounded ring instead.
 */
function closestGap(ids: readonly string[], angle: ReadonlyMap<string, number>): number | undefined {
  if (ids.length < 2) return undefined

  const sorted = ids
    .map((id) => (((angle.get(id) ?? 0) % TAU) + TAU) % TAU)
    .sort((a, b) => a - b)

  let smallest = TAU - (sorted[sorted.length - 1] - sorted[0])
  for (let index = 1; index < sorted.length; index += 1) {
    smallest = Math.min(smallest, sorted[index] - sorted[index - 1])
  }
  return Math.max(smallest, 1e-4)
}

/** Undirected neighbour lists per edge language, in authoring order. */
function adjacency(links: readonly PolarLink[], present: ReadonlySet<string>) {
  const structural = new Map<string, string[]>()
  const associative = new Map<string, string[]>()

  const join = (map: Map<string, string[]>, from: string, to: string) => {
    const list = map.get(from)
    if (!list) map.set(from, [to])
    else if (!list.includes(to)) list.push(to)
  }

  for (const link of links) {
    if (link.source === link.target) continue
    if (!present.has(link.source) || !present.has(link.target)) continue
    const map = link.structural ? structural : associative
    join(map, link.source, link.target)
    join(map, link.target, link.source)
  }

  return { structural, associative }
}

export function toCartesian(point: PolarPoint): { x: number; y: number } {
  return { x: Math.cos(point.angle) * point.radius, y: Math.sin(point.angle) * point.radius }
}

/**
 * The signed turn from one angle to another, never more than half a circle.
 *
 * Without this a node re-centring from 350° to 10° would take the long way
 * round — 340 degrees of travel to move twenty. The short way is both the
 * shorter animation and the one that matches what the reader expects to see.
 */
export function shortestTurn(from: number, to: number): number {
  const delta = (to - from) % TAU
  if (delta > Math.PI) return delta - TAU
  if (delta < -Math.PI) return delta + TAU
  return delta
}

/**
 * A point part-way from one polar position to another.
 *
 * Radius and angle move independently, which is the whole point: the node
 * travels along an arc. A node leaving or arriving at the exact centre has no
 * meaningful angle of its own, so it takes the other end's — otherwise it would
 * spin on the spot before setting off.
 */
export function interpolatePolar(from: PolarPoint, to: PolarPoint, t: number): PolarPoint {
  const fromAngle = from.radius === 0 ? to.angle : from.angle
  const toAngle = to.radius === 0 ? fromAngle : to.angle
  return {
    radius: from.radius + (to.radius - from.radius) * t,
    angle: fromAngle + shortestTurn(fromAngle, toAngle) * t,
  }
}

/** Decelerating, so the map settles into its new centre rather than stopping dead. */
export function easeOutCubic(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t
  return 1 - (1 - clamped) ** 3
}
