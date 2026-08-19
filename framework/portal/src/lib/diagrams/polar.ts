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
  /** Arc length one node needs on its ring before the ring must grow. */
  nodeSpacing?: number
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
  nodeSpacing: 172,
  startAngle: -Math.PI / 2,
} as const

/** A ring may not grow more than this many gaps to fit a crowded wedge. */
const MAX_RING_STRETCH = 3

/**
 * How hard a subtree's size pulls on the wedge it gets.
 *
 * Straight leaf-count weighting is the textbook answer and it is the wrong one
 * here. A ring is sized by the NARROWEST wedge on it, so a product with
 * seventeen components does not merely take most of the circle — it starves its
 * two-component sibling into a sliver, and that sliver is what pushes every
 * ring outwards until the map is too small to read.
 *
 * Damping the weight keeps the ordering (a big branch still gets more room)
 * while bounding how lopsided the split may become. The exponent was chosen by
 * measuring the two real catalogs rather than by taste — fitted ring radius,
 * smaller is better:
 *
 *     exponent   1.0    0.75   0.5
 *     acme       438    461    486
 *     brass      533    365    300
 *
 * 0.75 is the value that makes the *worst* of the two as good as it gets;
 * pushing further trades acme away for a solution that is already comfortable.
 */
const WEIGHT_EXPONENT = 0.75

export function polarLayout(input: PolarInput): PolarLayout {
  const {
    nodes,
    links,
    focus,
    maxDepth = DEFAULTS.maxDepth,
    ringGap = DEFAULTS.ringGap,
    nodeSpacing = DEFAULTS.nodeSpacing,
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
  const span = new Map<string, number>([[focus, TAU]])

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
      span.set(kid, wedge)
      stack.push({ id: kid, from: cursor, to: cursor + wedge })
      cursor += wedge
    }
  }

  // --- radii ---------------------------------------------------------------
  // A ring grows until the narrowest wedge on it is wide enough to hold a node.
  // Sizing from the wedge, not from the node count, is what keeps a ring honest
  // when its nodes are bunched inside one parent's slice instead of spread
  // evenly — and the stretch is capped, because past a point a ring that has
  // grown to avoid every overlap has simply left the canvas.
  const radii = [0]
  for (let ring = 1; ring < levels.length; ring += 1) {
    let needed = 0
    for (const id of levels[ring]) {
      const wedge = Math.max(span.get(id) ?? TAU, 1e-4)
      needed = Math.max(needed, nodeSpacing / wedge)
    }
    const floor = radii[ring - 1] + ringGap
    radii.push(Math.min(Math.max(floor, needed), radii[ring - 1] + ringGap * MAX_RING_STRETCH))
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
