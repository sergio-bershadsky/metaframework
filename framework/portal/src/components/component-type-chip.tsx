import { componentTypeStyle } from '@/lib/ui/component-type'
import { cn } from '@/lib/utils'

/**
 * What kind of thing this component *is* — the second most useful fact about it
 * after its name, and until now readable only by opening the frontmatter.
 *
 * It sits in the header row beside the kind badge, the status chip and the
 * lifecycle chip, and it has to be told apart from all three. Each of those
 * three is one channel, so this one takes the channels they left:
 *
 * | chip           | shape             | case      | colour                    | glyph          |
 * | -------------- | ----------------- | --------- | ------------------------- | -------------- |
 * | kind           | rounded rectangle | UPPERCASE | kind hue, full chroma     | kind icon      |
 * | status         | rounded rectangle | UPPERCASE | alert registers           | none           |
 * | lifecycle      | pill              | Title     | none — neutral            | stage marker   |
 * | component-type | pill              | lowercase | component-type hue, dim   | per-type icon  |
 *
 * A pill like lifecycle's, because both are facets of the same subject and the
 * pair should read as a pair. Lowercase because the value is written lowercase
 * in the frontmatter and this chip is quoting a field, not labelling a
 * category — `service`, not SERVICE.
 *
 * The hue is dim by construction (see --ctype-* in globals.css): the whole
 * register sits below both kind tiers in lightness, so the eye resolves "this
 * is a facet, not a kind" before it resolves which hue. Tinting the border and
 * the icon rather than flooding the chip keeps it quieter still — this is the
 * fourth chip in a row that already has three, and a fourth solid block would
 * make the row read as a warning strip.
 */
export function ComponentTypeChip({ value, className }: { value: string | undefined; className?: string }) {
  const style = componentTypeStyle(value)
  // Null when the enum grew and lib/ui/component-type.ts did not. Drawing
  // nothing is the point — a plausible-looking default would hide the gap.
  if (!style) return null

  const Icon = style.icon

  return (
    <span
      title={`component-type: ${value} — ${style.blurb}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5',
        'font-mono text-[11px] font-medium',
        className,
      )}
      style={{
        color: `var(${style.colorVar})`,
        borderColor: `color-mix(in oklch, var(${style.colorVar}) 40%, transparent)`,
        backgroundColor: `color-mix(in oklch, var(${style.colorVar}) 12%, transparent)`,
      }}
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="sr-only">Component type: </span>
      {value}
    </span>
  )
}
