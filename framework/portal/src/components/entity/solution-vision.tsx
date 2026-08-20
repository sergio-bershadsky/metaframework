import type { Entity } from '@/lib/catalog'

/**
 * A solution's `vision`, drawn as the lede of its page.
 *
 * `vision` is the one field the spec makes REQUIRED on exactly one kind
 * (kinds/solution.md: "the paragraph a newcomer reads first on the solution
 * page"), and it is the only field on any kind whose subject is the *purpose*
 * of the thing rather than a fact about it. Left to the generic Details dump it
 * rendered a thousand pixels below the fold in muted mono-labelled type,
 * typographically identical to `scope` and `contacts` — so a reader who stopped
 * at the top of a solution page learned what the repository CONTAINS and never
 * what it is FOR. Required on one kind and nothing else is a statement about
 * rank; this component is the page honouring it.
 *
 * It sits above the prose rather than inside it because the prose is authored
 * markdown and the vision is not: the body can be reorganised freely and the
 * lede must survive that. It is therefore also omitted from Details — the page
 * keeps the property that every kind field appears exactly once.
 *
 * Rendered as plain text, deliberately. The field is a YAML block scalar with
 * hard-wrapped lines, so a blank line is the author's only paragraph mark;
 * `whitespace-pre-line` would honour every accidental line break instead, and
 * running it through the markdown renderer would invite a heading in a
 * pull-quote. Paragraphs split on blank lines, wrapping is the browser's.
 */
export function SolutionVision({ entity, className }: { entity: Entity; className?: string }) {
  if (entity.kind !== 'solution') return null

  const vision = (entity.frontmatter as Record<string, unknown>).vision
  if (typeof vision !== 'string' || vision.trim().length === 0) return null

  const paragraphs = vision
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)

  return (
    <section
      aria-label="Vision"
      className={`max-w-3xl border-l-2 border-primary/45 pl-5 ${className ?? ''}`}
    >
      {/* The label is for the reader who wants to know which field this is —
          small, mono and muted like every other field name in the console, so
          the prominence belongs entirely to the sentence underneath it. */}
      <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">Vision</p>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="mt-2 text-[17px] leading-relaxed text-foreground/90">
          {paragraph}
        </p>
      ))}
    </section>
  )
}
