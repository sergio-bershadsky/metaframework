import { cn } from '@/lib/utils'

/**
 * The label of a section the *portal* adds to an entity page.
 *
 * An entity page prints two documents at once. The first is `index.md` — prose
 * the author wrote, whose `##` headings are that document's outline. The second
 * is everything the portal derives and draws around it: Details, Artifacts,
 * Relations, Neighbourhood, Contents, Realized by. Both were plain `<h2>`s, so
 * the two outlines were spliced into one flat list of peers, and the moment an
 * author wrote `## Artifacts` — which twelve protocol documents do, to explain
 * what their sibling files are for — the page carried two level-2 headings
 * reading "Artifacts" with nothing to tell them apart.
 *
 * Nothing was wrong with the pixels. Measured on carrier-booking: the authored
 * heading renders at 16px, no transform, letter-spacing −0.4px, in `foreground`
 * (lab L* 94.2); the portal's at 12px, uppercase, letter-spacing +1.68px, in
 * `muted-foreground` (lab L* 57.0). Four axes apart — a sighted reader was never
 * confused. The *accessible name* was identical, byte for byte: Chrome does not
 * fold `text-transform` into name computation, so the accessibility tree held
 * `heading "Artifacts" [level=2]` twice. That is what a screen reader navigates
 * by, and what a document-outline tool lists.
 *
 * So the distinction is made where it was missing, and only there:
 *
 * - **A qualifier in the accessible name.** Visually hidden, so the page is
 *   unchanged to the pixel, and part of the heading's text rather than an
 *   `aria-label` override, so a plain `textContent` outline sees it too.
 * - **A named region.** A `<section>` with an accessible name is a `region`
 *   landmark, so the portal's sections become reachable — and skippable — as
 *   landmarks, which the entity's own prose is not. That is the structural half
 *   of the same statement: these are not sections of the document.
 *
 * Fixing it here rather than renaming twelve `## Artifacts` is what makes it
 * stay fixed: the next author to write `## Details` collides with nothing. And
 * renaming would have cost real content — those sections say why the artifacts
 * are shaped as they are, which no generated list can say.
 *
 * Not tried: demoting authored headings a level so the outlines nest. That was
 * settled against on 2026-08-20-d — the markdown diff is the review surface, and
 * a renderer that draws `##` as `<h3>` puts the file and the page in two
 * different documents.
 */

/** Read aloud after the visible label; never painted. */
const QUALIFIER = ' — portal section'

/**
 * `relative` is load-bearing and not cosmetic: `sr-only` is `position: absolute`,
 * so without a positioned ancestor the hidden span lands in the initial
 * containing block and extends `documentElement`'s scroll box by its static
 * offset — measured at +492px on carrier-booking, a phantom scroll region on a
 * page whose real scroller is the shell's inner one. Containing it in the
 * heading costs nothing: the heading's own box is unchanged (verified — all nine
 * `<h2>` rects on that page are identical with the spans shown and hidden).
 */
const SECTION_HEADING = 'relative text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground'

export function SectionHeading({
  children,
  id,
  level = 2,
  className,
}: {
  /** The visible label — the only part a sighted reader sees. */
  children: React.ReactNode
  /** Set it when the enclosing `<section>` names itself with `aria-labelledby`. */
  id?: string
  level?: 2 | 3
  /** Overrides the shared type scale; used only where a section nests inside a panel. */
  className?: string
}) {
  const Tag = level === 2 ? 'h2' : 'h3'
  return (
    <Tag id={id} className={cn(SECTION_HEADING, className)}>
      {children}
      <span className="sr-only">{QUALIFIER}</span>
    </Tag>
  )
}
