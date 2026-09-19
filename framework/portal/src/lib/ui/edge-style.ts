import type { EdgeType } from '@/lib/catalog/vocabulary'

/**
 * How each edge is DRAWN — the stroke geometry, and nothing about React Flow.
 *
 * ## Why this is a module of its own
 *
 * Two surfaces draw the same eight lines: the relation graph's canvas and
 * legend, and the front page's authoring guide, which shows a reader what each
 * edge will look like before they have authored one. They must not drift — a
 * legend that disagrees with the canvas is worse than no legend — and until
 * this file existed the only copy lived inside `relation-graph.tsx` next to
 * `MarkerType`, which is `@xyflow/react`. Importing it from the guide would
 * have pulled the whole flow renderer onto the front page for four numbers.
 *
 * So the geometry lives here, dependency-free, and `relation-graph.tsx` maps
 * `arrow` onto `MarkerType` at the one place that already owns that import.
 *
 * ## The channels, and why each is what it is
 *
 * - `exposes` is the heaviest solid line: a public surface is the strongest
 *   claim a component makes.
 * - `realizes` is heavier than `implements` rather than equal to it, which is
 *   the truer statement: realizing a capability is a claim about the whole
 *   product, satisfying a requirement is a claim about one component. The
 *   dash-dot reads as a relative of `implements`'s fine dash.
 * - `measures` is a round-capped DOT trail, not a short dash. Against a
 *   dash-dot it differs in KIND and not in rhythm — there are no line segments
 *   in it at all — which is the difference that survives being made small.
 *   A zero-length segment draws nothing under a butt cap and a full circle
 *   under a round one, which is what turns the dash into a dot.
 * - `assumes` is finely dotted and thin: a dependency on a belief is the
 *   weakest claim in the vocabulary and should not read as a structural edge.
 * - An OPEN arrowhead says nothing flows along the edge. `measures`,
 *   `supersedes` and `assumes` are observations or replacements, not conduits.
 */
export interface EdgeGeometry {
  /** Stroke width in px, at any zoom — edges use `non-scaling-stroke`. */
  width: number
  /** SVG `stroke-dasharray`, or undefined for a solid line. */
  dash: string | undefined
  /** `round` is what makes a zero-length dash render as a dot. */
  cap: 'round' | undefined
  /** Filled head = something flows. Open head = an assertion about the pair. */
  arrow: 'closed' | 'open'
}

export const EDGE_GEOMETRY: Record<EdgeType, EdgeGeometry> = {
  uses: { width: 1.25, dash: undefined, cap: undefined, arrow: 'closed' },
  exposes: { width: 2, dash: undefined, cap: undefined, arrow: 'closed' },
  'depends-on': { width: 1.25, dash: '7 4', cap: undefined, arrow: 'closed' },
  implements: { width: 1.25, dash: '1.5 3.5', cap: undefined, arrow: 'closed' },
  realizes: { width: 1.9, dash: '6 3 1.5 3', cap: undefined, arrow: 'closed' },
  measures: { width: 1, dash: '0.01 4.5', cap: 'round', arrow: 'open' },
  supersedes: { width: 1.25, dash: '11 4', cap: undefined, arrow: 'open' },
  assumes: { width: 1, dash: '1 3', cap: 'round', arrow: 'open' },
}

/**
 * Reading order, which is NOT `EDGE_TYPES`.
 *
 * `EDGE_TYPES` is adoption order and grows by appending — the right shape for a
 * closed set that must never reorder, and the wrong thing to show a reader
 * first. This follows `frontmatter.md`'s table, which groups the edges that are
 * relatives of each other: the two solid structural edges, then the two delivery
 * claims, then the three that assert rather than carry.
 */
export const EDGE_VISUAL_ORDER: readonly EdgeType[] = [
  'uses',
  'exposes',
  'depends-on',
  'implements',
  'realizes',
  'measures',
  'supersedes',
  'assumes',
]

/** How the stroke reads in words, for the guide and for a screen reader. */
export const EDGE_STROKE_WORDS: Record<EdgeType, string> = {
  uses: 'solid',
  exposes: 'solid, heavy',
  'depends-on': 'dashed',
  implements: 'finely dashed',
  realizes: 'dash-dot, heavy',
  measures: 'dotted, open head',
  supersedes: 'long-dashed, open head',
  assumes: 'finely dotted, open head',
}
