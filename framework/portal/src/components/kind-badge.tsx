import type { EntityKind } from '@/lib/catalog'
import { componentTypeStyle } from '@/lib/ui/component-type'
import { STATUS_STYLES, kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

/**
 * The badge shape, monospaced.
 *
 * Every chip in an entity header states a *keyword* — a kind, a status, a
 * lifecycle stage, a component-type, a version. Monospace is the console's
 * register for a value read out of a file rather than a phrase written for a
 * reader, and these are all the former. It also makes the row scan as one
 * family: proportional and monospaced chips side by side read as two systems.
 */
const BADGE = 'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider'

/**
 * The kind badge, and on a component the component-type nested inside it.
 *
 * A component's header used to carry two chips saying two halves of one answer
 * — `COMPONENT` and, three chips later, `job`. Passing `componentType` nests
 * the second inside the first: one badge, reading `COMPONENT ▸ job`, with the
 * type drawn as a smaller pill within the kind's field.
 *
 * Nested rather than cross-faded, and that is the whole point of the shape.
 * Both facts are true at once and neither is a detail of the other, so both are
 * on screen at once: nothing is behind a hover, which means a touch device, a
 * printout and a screen reader all get the same badge a mouse user gets. The
 * hover cross-fade belongs to the surfaces that have room for one glyph and no
 * room for a word — the tree row and the inline reference, via `EntityGlyph`.
 *
 * Each half keeps its own register's colour: the kind's tinted rectangle
 * outside, the component-type's darker pill inside
 * ([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)).
 * Containment carries the relationship the two hues cannot — a component-type
 * is a second axis *of* a component, not a peer chip that happened to land
 * beside it.
 */
export function KindBadge({
  kind,
  className,
  showLabel = true,
  componentType,
}: {
  kind: EntityKind
  className?: string
  showLabel?: boolean
  /** The `component-type`; ignored unless `kind` is `component`. */
  componentType?: string | null
}) {
  const style = kindStyle(kind)
  const Icon = style.icon
  const type = kind === 'component' ? componentTypeStyle(componentType ?? undefined) : null

  const kindFace = (
    <span className={cn(BADGE, style.bg, style.border, style.text, className)}>
      <Icon className="size-3" aria-hidden />
      {showLabel && style.label}
    </span>
  )

  // Null when the value is absent, or when the enum grew and
  // lib/ui/component-type.ts did not. Either way the badge is the plain one it
  // has always been, which keeps the gap visible instead of inventing a face.
  if (!type) return kindFace

  const TypeIcon = type.icon
  return (
    <span
      title={`${style.label} · ${componentType} — ${type.blurb}`}
      // `pr-0`: the type block runs flush to the badge's right border. The
      // padding is the flat badge's, untouched, which is what keeps this badge
      // the same height as the StatusBadge and the chips beside it; the block
      // reclaims those pixels itself, below.
      // `overflow-hidden` so the block's square left edge is clipped by the
      // badge's own radius instead of needing to guess the inner curve.
      // `relative` contains the sr-only span: it is absolutely positioned, and
      // without a positioned ancestor it escapes to the initial containing
      // block and extends the document's scroll box — the same trap documented
      // on SectionHeading.
      // Neither half sets a line-height, and that is the fix rather than an
      // omission: the label inherited a normal one while the type block carried
      // `leading-none`, so `items-center` was faithfully centring two boxes of
      // *different heights* and the two words sat a pixel apart in opposite
      // directions. Pinning both to `leading-none` aligned them but shrank the
      // badge below its neighbours. Letting both inherit the same line-height
      // aligns them and leaves every height alone.
      className={cn(
        BADGE,
        'relative overflow-hidden pr-0',
        style.bg,
        style.border,
        style.text,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {showLabel && style.label}
      <span className="sr-only">, component type</span>
      {/* `self-stretch -my-1`, not a height of its own: stretch fills the
          badge's content box and the negative margin reclaims the whole of its
          vertical padding (`py-0.5` outside, `-my-0.5` here — the pair must
          always match), so the block runs edge to edge inside the border —
          derived from the badge's own box rather than from a pixel figure that
          would have to be kept in step with it. Negative margins do not feed
          back into the flex line, so the badge's height is unchanged.

          No border of its own: it is a region *of* the badge, not a chip that
          landed inside one, and the fill alone says that. A second border here
          drew a box-in-a-box and made the two look like peers. */}
      <span
        className="-my-0.5 inline-flex select-none items-center gap-1 self-stretch px-1.5 text-[11px] font-medium uppercase tracking-wider"
        style={{
          color: `var(${type.colorVar})`,
          backgroundColor: `color-mix(in oklch, var(${type.colorVar}) 18%, transparent)`,
        }}
      >
        <TypeIcon className="size-3 shrink-0" aria-hidden />
        {componentType}
      </span>
    </span>
  )
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? { label: status, className: 'text-muted-foreground border-border' }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider',
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  )
}

/**
 * The version chip's shape, split out from the badge so an interactive control
 * can wear it without cloning the class list. The version picker is a button
 * that must read as *the same chip* — a second, near-identical style would make
 * "v4" mean one thing in the header and another in a revision list.
 */
export const VERSION_CHIP =
  'inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-medium'

/** Current version: the primary hue, as everywhere else in the console. */
export const VERSION_CHIP_CURRENT = 'border-primary/35 bg-primary/10 text-primary'

/** A version that is not what is on disk — the console's warning register. */
export const VERSION_CHIP_HISTORICAL = 'border-warning/35 bg-warning/[0.07] text-warning'

export function VersionBadge({
  version,
  historical = false,
  className,
}: {
  version: number
  /** Render in the warning register — the version shown is not the current one. */
  historical?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(VERSION_CHIP, historical ? VERSION_CHIP_HISTORICAL : VERSION_CHIP_CURRENT, className)}
    >
      v{version}
    </span>
  )
}
