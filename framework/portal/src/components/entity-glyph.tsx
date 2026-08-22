import type { EntityKind } from '@/lib/catalog'
import { componentTypeStyle } from '@/lib/ui/component-type'
import { kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

/**
 * An entity's glyph — and, on a component, its second one.
 *
 * Every surface in this console that names an entity draws the `kind` icon:
 * the sidebar row, an inline reference, the page header. That is the right
 * default, because `kind` is the register a reader navigates by. But a
 * component carries a *second* closed axis, `component-type`, which is the most
 * useful thing about it after its name, and until now the only way to read it
 * was to open the page and find the chip.
 *
 * Hovering a component cross-fades the two glyphs in place on a 2s cycle. The
 * mechanics are in `globals.css` (`glyph-swap`, `glyph-primary`,
 * `glyph-secondary`); this component only decides *whether* there is a second
 * glyph and paints each one in its own register's colour.
 *
 * ## What it is not
 *
 * It is not a general icon component. It renders the plain kind glyph — one
 * element, no wrapper, no animation — for every entity that is not a component,
 * and for a component whose `component-type` this build does not recognise.
 * That last case is deliberate and matches what `componentTypeStyle` returns:
 * an unknown value means the enum grew and `lib/ui/component-type.ts` did not,
 * and inventing a fallback glyph would hide it. Nothing animates, and the reader
 * sees exactly what they saw before the feature existed.
 *
 * ## The host
 *
 * The animation is driven from an ancestor carrying `glyph-host`, not from the
 * glyph itself. Two reasons, and both are about the reader rather than the
 * code: a 14px hover target in a dense tree is a dexterity test, and the thing
 * the reader thinks they are pointing at is the row. Call sites put
 * `glyph-host` on whatever element *is* the row — the link, the header, the
 * tree node — and get the reveal on the whole of it.
 *
 * Colour stays per register, which is the point of having two. The kind glyph
 * keeps its kind hue and the component-type glyph its own, a whole tier darker
 * ([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)),
 * so the fade reads as one thing being described two ways rather than as a
 * colour change. The two glyphs are also guaranteed to be different shapes —
 * `lib/ui/icons.test.ts` holds all 22 distinct across both registers — without
 * which this animation would sometimes cross-fade an icon into itself.
 */
export function EntityGlyph({
  kind,
  componentType,
  className,
  dim,
}: {
  kind: EntityKind
  /** The `component-type`; ignored unless `kind` is `component`. */
  componentType?: string | null
  /** Applied to both glyphs — this is where the size class goes. */
  className?: string
  /** The tree's de-emphasis for a filtered-out row. */
  dim?: boolean
}) {
  const style = kindStyle(kind)
  const KindIcon = style.icon
  const type = kind === 'component' ? componentTypeStyle(componentType ?? undefined) : null

  if (!type) {
    return <KindIcon className={cn(className, style.text, dim && 'opacity-40')} aria-hidden />
  }

  const TypeIcon = type.icon
  return (
    <span className={cn('glyph-swap shrink-0', dim && 'opacity-40')}>
      <KindIcon className={cn('glyph-primary', className, style.text)} aria-hidden />
      <TypeIcon
        className={cn('glyph-secondary', className)}
        style={{ color: `var(${type.colorVar})` }}
        aria-hidden
      />
    </span>
  )
}
