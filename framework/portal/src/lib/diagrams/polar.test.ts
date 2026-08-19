import { describe, expect, it } from 'vitest'
import {
  easeOutCubic,
  interpolatePolar,
  polarLayout,
  type PolarLink,
  shortestTurn,
  toCartesian,
} from './polar'

/**
 * The map's geometry is asserted here rather than by looking at the canvas:
 * the layout is pure arithmetic over ids, so every claim the component makes
 * about rings, wedges and arc motion is checkable without a browser.
 */

const TAU = Math.PI * 2

function contains(source: string, target: string): PolarLink {
  return { source, target, structural: true }
}

function dependsOn(source: string, target: string): PolarLink {
  return { source, target, structural: false }
}

/** A solution with two products, each owning two components. */
const STRUCTURE: PolarLink[] = [
  contains('sol', 'p1'),
  contains('sol', 'p2'),
  contains('p1', 'c1'),
  contains('p1', 'c2'),
  contains('p2', 'c3'),
  contains('p2', 'c4'),
]

const NODES = ['sol', 'p1', 'p2', 'c1', 'c2', 'c3', 'c4']

describe('polarLayout', () => {
  it('puts the focus at the centre and its neighbours on the first ring', () => {
    const layout = polarLayout({ nodes: NODES, links: STRUCTURE, focus: 'sol' })

    expect(layout.points.get('sol')).toEqual({ radius: 0, angle: -Math.PI / 2 })
    expect(layout.depth.get('p1')).toBe(1)
    expect(layout.depth.get('c1')).toBe(2)
    expect(layout.points.get('p1')?.radius).toBe(layout.points.get('p2')?.radius)
    expect(layout.points.get('c1')?.radius).toBeGreaterThan(layout.points.get('p1')?.radius ?? 0)
  })

  it('places a lone first-ring node on the start angle rather than opposite it', () => {
    const layout = polarLayout({ nodes: ['a', 'b'], links: [contains('a', 'b')], focus: 'a' })
    expect(layout.points.get('b')?.angle).toBeCloseTo(-Math.PI / 2, 10)
  })

  it('keeps a child inside its parent wedge, so the spine reads as spokes', () => {
    const layout = polarLayout({ nodes: NODES, links: STRUCTURE, focus: 'sol' })
    const p1 = layout.points.get('p1')?.angle ?? 0
    const c1 = layout.points.get('c1')?.angle ?? 0
    const c2 = layout.points.get('c2')?.angle ?? 0

    // Two children split their parent's half-circle wedge; both sit within a
    // quarter turn of it, and their mean is the parent's own angle.
    expect(Math.abs(shortestTurn(p1, c1))).toBeLessThan(Math.PI / 2)
    expect(Math.abs(shortestTurn(p1, c2))).toBeLessThan(Math.PI / 2)
    expect((c1 + c2) / 2).toBeCloseTo(p1, 10)
  })

  it('does not let a dense branch starve its sibling into a sliver', () => {
    // Sixteen components against one: leaf-count weighting would hand the small
    // product 1/17 of the circle, and the ring radius is set by the NARROWEST
    // wedge on it, so that sliver is what makes the whole map unreadable.
    const big = Array.from({ length: 16 }, (_, index) => `b${index}`)
    const links = [
      contains('sol', 'big'),
      contains('sol', 'small'),
      ...big.map((id) => contains('big', id)),
      contains('small', 's0'),
    ]
    const layout = polarLayout({
      nodes: ['sol', 'big', 'small', 's0', ...big],
      links,
      focus: 'sol',
      ringGap: 150,
      nodeSpacing: 172,
    })

    // Leaf weighting hands the small product one seventeenth of the circle, and
    // 172 units of arc across 0.37 radians needs a radius of 465. The damped
    // split gets the same ring under 300.
    expect(layout.radii[1]).toBeLessThan(300)

    // Ordering survives: the dense branch still spans more than half the map.
    const centre = layout.points.get('big')?.angle ?? 0
    const offsets = big.map((id) => shortestTurn(centre, layout.points.get(id)?.angle ?? 0))
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(Math.PI)
  })

  it('caps depth, so the map never draws the whole solution', () => {
    const chain = ['a', 'b', 'c', 'd', 'e']
    const links = [contains('a', 'b'), contains('b', 'c'), contains('c', 'd'), contains('d', 'e')]

    const capped = polarLayout({ nodes: chain, links, focus: 'a', maxDepth: 2 })
    expect(capped.points.has('c')).toBe(true)
    expect(capped.points.has('d')).toBe(false)

    const deeper = polarLayout({ nodes: chain, links, focus: 'a', maxDepth: 3 })
    expect(deeper.points.has('d')).toBe(true)
  })

  it('prefers containment over dependency when both reach a node at one depth', () => {
    // `c` hangs off its product `p`, even though `other` also touches it and
    // was authored first.
    const links = [dependsOn('other', 'c'), contains('sol', 'other'), contains('sol', 'p'), contains('p', 'c')]
    const layout = polarLayout({ nodes: ['sol', 'p', 'c', 'other'], links, focus: 'sol' })

    expect(layout.depth.get('c')).toBe(2)
    expect(layout.parent.get('c')).toBe('p')
  })

  it('reaches a node through a dependency when no containment path is shorter', () => {
    const links = [contains('sol', 'p'), dependsOn('p', 'far')]
    const layout = polarLayout({ nodes: ['sol', 'p', 'far'], links, focus: 'sol' })

    expect(layout.parent.get('far')).toBe('p')
    expect(layout.depth.get('far')).toBe(2)
  })

  it('grows a ring until its narrowest wedge can hold a node', () => {
    // Ten siblings on one ring: at the default gap they would overlap, so the
    // ring must be pushed out beyond it.
    const many = Array.from({ length: 10 }, (_, index) => `n${index}`)
    const links = many.map((id) => contains('root', id))
    const layout = polarLayout({ nodes: ['root', ...many], links, focus: 'root', ringGap: 100, nodeSpacing: 120 })

    const radius = layout.points.get('n0')?.radius ?? 0
    expect(radius).toBeGreaterThan(100)
    // Arc length between neighbours now clears the demanded spacing.
    expect((radius * TAU) / 10).toBeGreaterThanOrEqual(120 - 1e-6)
  })

  it('caps how far a ring may be pushed out', () => {
    const many = Array.from({ length: 200 }, (_, index) => `n${index}`)
    const links = many.map((id) => contains('root', id))
    const layout = polarLayout({ nodes: ['root', ...many], links, focus: 'root', ringGap: 100, nodeSpacing: 120 })

    expect(layout.points.get('n0')?.radius).toBe(300)
  })

  it('ignores links whose endpoints are not on the map', () => {
    const layout = polarLayout({
      nodes: ['a', 'b'],
      links: [contains('a', 'b'), contains('b', 'ghost'), contains('a', 'a')],
      focus: 'a',
    })
    expect([...layout.points.keys()].sort()).toEqual(['a', 'b'])
  })

  it('returns an empty layout when the focus is not a node', () => {
    const layout = polarLayout({ nodes: NODES, links: STRUCTURE, focus: 'nobody' })
    expect(layout.points.size).toBe(0)
    expect(layout.extent).toBe(0)
  })
})

describe('shortestTurn', () => {
  it('takes the short way across the seam', () => {
    expect(shortestTurn(0.1, TAU - 0.1)).toBeCloseTo(-0.2, 10)
    expect(shortestTurn(TAU - 0.1, 0.1)).toBeCloseTo(0.2, 10)
  })

  it('never travels more than half a circle', () => {
    for (const [from, to] of [
      [0, Math.PI],
      [0, -Math.PI],
      [1, 5],
      [-3, 3],
    ]) {
      expect(Math.abs(shortestTurn(from, to))).toBeLessThanOrEqual(Math.PI + 1e-9)
    }
  })
})

describe('interpolatePolar', () => {
  it('swings along an arc instead of sliding across the chord', () => {
    const from = { radius: 200, angle: 0 }
    const to = { radius: 200, angle: Math.PI }
    const half = interpolatePolar(from, to, 0.5)

    expect(half.radius).toBe(200)
    // A cartesian tween would have passed through the origin at the half-way
    // point; the arc is still out on the ring.
    const { x, y } = toCartesian(half)
    expect(Math.hypot(x, y)).toBeCloseTo(200, 6)
  })

  it('moves radius and angle independently', () => {
    const half = interpolatePolar({ radius: 100, angle: 0 }, { radius: 300, angle: Math.PI / 2 }, 0.5)
    expect(half.radius).toBeCloseTo(200, 10)
    expect(half.angle).toBeCloseTo(Math.PI / 4, 10)
  })

  it('borrows the angle at the centre, so nothing spins on the spot', () => {
    const out = interpolatePolar({ radius: 0, angle: 3 }, { radius: 200, angle: 1 }, 0.5)
    expect(out.angle).toBe(1)

    const back = interpolatePolar({ radius: 200, angle: 1 }, { radius: 0, angle: 3 }, 0.5)
    expect(back.angle).toBe(1)
  })

  it('is the identity at both ends', () => {
    const from = { radius: 40, angle: 0.3 }
    const to = { radius: 260, angle: 2.9 }
    expect(interpolatePolar(from, to, 0)).toEqual(from)
    expect(interpolatePolar(from, to, 1).radius).toBeCloseTo(to.radius, 10)
    expect(Math.abs(shortestTurn(interpolatePolar(from, to, 1).angle, to.angle))).toBeLessThan(1e-9)
  })
})

describe('easeOutCubic', () => {
  it('starts fast, ends stopped, and clamps outside the unit interval', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })
})
