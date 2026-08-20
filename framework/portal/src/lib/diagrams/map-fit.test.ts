import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SolutionMapLink, SolutionMapNode } from '@/components/diagrams/solution-map'
import { loadCatalog } from '../catalog/load'
import { projectStructure } from '../catalog/map-projection'
import type { Catalog } from '../catalog/types'
import {
  drawnExtent,
  fittedLayout,
  fitZoom,
  LABEL_PX,
  LEGIBLE_ZOOM,
  MAP_NODE,
  MAX_DEPTH,
  NODE_SEPARATION,
} from './map-fit'
import { polarLayout, type PolarLink, toCartesian } from './polar'

/**
 * The map's two promises, asserted over the whole shipped catalog.
 *
 *   1. NOTHING OVERLAPS. Not at any window size, not from any focus.
 *   2. NOTHING IS UNREADABLE. Every view a reader can click their way to holds
 *      the legibility floor, or is named here as one that cannot.
 *
 * Both used to be claims made about one screenshot. They are properties of
 * arithmetic — a layout of ids and a canvas of pixels — so they are checked the
 * way arithmetic is checked: exhaustively. Every entity of every solution is
 * taken as a focus, at three window sizes, which is 100-odd views per size and
 * more than anyone will ever look at by hand.
 *
 * The canvas sizes below are the ONE thing here that a browser had to supply.
 * They were read off `.react-flow`'s own bounding box in a headless Chromium at
 * each window size, so the arithmetic runs against the box the map really gets
 * rather than against a guess at the page chrome around it.
 */

const CATALOG = path.resolve(process.cwd(), '../../solutions')

/**
 * Canvas the map is given, per window size — measured, not derived.
 *
 * The three solutions differ by a pixel or two in header height; the smallest
 * canvas of the three is used for all of them, so the assertions run against
 * the worst case rather than an average.
 */
const CANVASES = [
  { window: '1024x720', width: 670, height: 486 },
  { window: '1440x900', width: 1086, height: 666 },
  { window: '1920x1080', width: 1566, height: 846 },
] as const

let catalog: Catalog

beforeAll(async () => {
  catalog = await loadCatalog({ catalogDir: CATALOG })
})

function shape(root: string): { nodes: SolutionMapNode[]; links: SolutionMapLink[] } {
  return projectStructure(catalog, root)
}

/** The component's own ladder of candidate depths, for one focus. */
function candidates(nodes: SolutionMapNode[], links: SolutionMapLink[], focus: string) {
  const ids = nodes.map((node) => node.srn)
  const polarLinks: PolarLink[] = links.map((link) => ({
    source: link.from,
    target: link.to,
    structural: link.relation === 'contains',
  }))
  return Array.from({ length: MAX_DEPTH }, (_, index) =>
    polarLayout({ nodes: ids, links: polarLinks, focus, maxDepth: index + 1, nodeSeparation: NODE_SEPARATION }),
  )
}

/** The smallest clearance between any two boxes, in layout units. Negative overlaps. */
function tightest(layout: ReturnType<typeof polarLayout>): { pair: string; clear: number } {
  const placed = [...layout.points].map(([id, point]) => ({ id, ...toCartesian(point) }))
  let worst = { pair: '—', clear: Number.POSITIVE_INFINITY }

  for (let a = 0; a < placed.length; a += 1) {
    for (let b = a + 1; b < placed.length; b += 1) {
      const clear = Math.max(
        Math.abs(placed[a].x - placed[b].x) - MAP_NODE.width,
        Math.abs(placed[a].y - placed[b].y) - MAP_NODE.height,
      )
      if (clear < worst.clear) {
        worst = { pair: `${short(placed[a].id)}/${short(placed[b].id)}`, clear }
      }
    }
  }

  return worst
}

const short = (srn: string) => srn.split('/').pop() ?? srn

/** Every view the map can reach: every entity, as a focus, at every canvas. */
function everyView(root: string) {
  const { nodes, links } = shape(root)
  return CANVASES.flatMap((canvas) =>
    nodes.map((node) => {
      const layout = fittedLayout(candidates(nodes, links, node.srn), canvas)
      const extent = drawnExtent(layout)
      return {
        window: canvas.window,
        focus: short(node.srn),
        rings: Math.max(0, ...layout.depth.values()),
        neighbours: [...layout.depth.values()].filter((depth) => depth === 1).length,
        boxes: layout.points.size,
        zoom: fitZoom(extent, canvas),
        label: fitZoom(extent, canvas) * LABEL_PX,
        clear: tightest(layout).clear,
        pair: tightest(layout).pair,
      }
    }),
  )
}

/**
 * The views this catalog cannot make legible, and why each one is unavoidable.
 *
 * Every entry is a focus with nine or more immediate neighbours seen on the
 * smallest window. The first ring is the map's minimum — a focus with no
 * neighbours drawn is not a map of anything — so these are the floor of what
 * the rule can do, not a failure to apply it. They are listed rather than
 * waved through: if a fourth one appears, or an existing one gets worse, this
 * assertion is what says so.
 */
const KNOWN_TIGHT: Record<string, string[]> = {
  'srn://brass': [
    '1024x720 focus=rules: 9 neighbours, zoom 0.69 (8.2px)',
    '1024x720 focus=web-client: 11 neighbours, zoom 0.58 (7.0px)',
  ],
  'srn://acme': [],
  'srn://metaframework': [
    '1024x720 focus=portal: 11 neighbours, zoom 0.58 (7.0px)',
    '1024x720 focus=catalog-loader: 10 neighbours, zoom 0.66 (7.9px)',
  ],
}

describe.each(['srn://brass', 'srn://acme', 'srn://metaframework'])('the map of %s', (root) => {
  it('never overlaps two boxes, from any focus, at any window size', () => {
    const overlapping = everyView(root)
      .filter((view) => view.clear <= 0)
      .map((view) => `${view.window} focus=${view.focus}: ${view.pair} by ${(-view.clear).toFixed(1)}px`)

    expect(overlapping).toEqual([])
  })

  it('holds the legibility floor everywhere depth can still be traded for size', () => {
    const below = everyView(root).filter((view) => view.zoom < LEGIBLE_ZOOM)

    // The rule can only ever give up rings, so the one thing it cannot fix is a
    // focus whose OWN neighbours will not fit: at one ring there is nothing
    // left to drop. Every view under the floor must be one of those, and this
    // is the assertion that says so — a view under the floor with rings to
    // spare would mean the rule simply failed to apply.
    expect(below.filter((view) => view.rings > 1)).toEqual([])

    // And the exceptions are named, not merely tolerated. The list is the
    // catalog's own worst cases at the smallest window, and it is short: nine
    // to eleven boxes around one centre, which 670x486 cannot hold at 9px type
    // however they are arranged.
    expect(
      below.map(
        (view) =>
          `${view.window} focus=${view.focus}: ${view.neighbours} neighbours, zoom ${view.zoom.toFixed(2)} (${view.label.toFixed(1)}px)`,
      ),
    ).toEqual(KNOWN_TIGHT[root])
  })

  it('drops rings rather than zoom when a neighbourhood is too big for the canvas', () => {
    // The rule has to have teeth somewhere, or it is not a rule: on the small
    // window at least one focus must be showing fewer rings than the large one
    // does. Without this a depth limit that never binds would pass every other
    // assertion in this file.
    const views = everyView(root)
    const small = views.filter((view) => view.window === '1024x720')
    const large = views.filter((view) => view.window === '1920x1080')
    const shallower = small.filter((view, index) => view.rings < large[index].rings)

    expect(shallower.length).toBeGreaterThan(0)
  })
})
