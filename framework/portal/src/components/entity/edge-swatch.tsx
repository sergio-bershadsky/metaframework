import type { EdgeType } from '@/lib/catalog/vocabulary'
import { EDGE_GEOMETRY, EDGE_STROKE_WORDS } from '@/lib/ui/edge-style'

/**
 * One edge, drawn the way the canvas draws it — line and arrowhead both.
 *
 * The arrowhead is not decoration here. The legend used to draw the line and
 * drop the head, which left `realizes` and `measures` differing by a dash
 * pattern alone in the one place a reader goes to tell them apart. Every
 * channel the canvas uses is carried, so a swatch and an edge are the same
 * statement at two sizes.
 *
 * Shared by the relation graph's legend and the front page's authoring guide.
 * The geometry comes from `lib/ui/edge-style`, which knows nothing about React
 * Flow, so the guide can draw an edge without the flow renderer behind it.
 */
export function EdgeSwatch({
  edge,
  stroke = 'var(--border-strong)',
  className,
  decorative = false,
}: {
  edge: EdgeType
  stroke?: string
  className?: string
  /**
   * Hide from assistive tech, for a caller that already prints the stroke in
   * words beside it. The guide does; the graph's legend shows only the verb, so
   * there the swatch is the ONLY carrier of "dashed" and must be announced.
   */
  decorative?: boolean
}) {
  const geometry = EDGE_GEOMETRY[edge]
  const closed = geometry.arrow === 'closed'

  return (
    <svg
      width="26"
      height="8"
      viewBox="0 0 26 8"
      className={className}
      {...(decorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': `${edge}: ${EDGE_STROKE_WORDS[edge]}` })}
    >
      <line
        x1="0"
        y1="4"
        x2={closed ? 18 : 20}
        y2="4"
        stroke={stroke}
        strokeWidth={geometry.width}
        strokeDasharray={geometry.dash}
        strokeLinecap={geometry.cap}
      />
      {closed ? (
        <path d="M18 1 L25 4 L18 7 Z" fill={stroke} />
      ) : (
        <path
          d="M19 1 L25 4 L19 7"
          fill="none"
          stroke={stroke}
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}
