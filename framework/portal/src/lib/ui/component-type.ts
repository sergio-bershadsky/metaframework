import {
  AppWindow,
  BookText,
  Database,
  Globe,
  type LucideIcon,
  Library,
  Package,
  ScrollText,
  Server,
  Timer,
  Waypoints,
} from 'lucide-react'
import { KIND_FRONTMATTER } from '../catalog/frontmatter'

/**
 * `component-type`, for the chip that draws it.
 *
 * The field is defined once in `KIND_FRONTMATTER`
 * (framework/spec/kinds/component.md) and the ten values are read out of that
 * zod enum rather than restated here — a second copy of a closed enum is a
 * second place for it to fall behind, and the failure would be silent: a new
 * value would simply render without an icon.
 *
 * ## Why these get a hue when lifecycle deliberately does not
 *
 * `LifecycleChip` refuses colour, and its reasoning binds here too: colour is
 * ontology in this console, hue means "which kind", and every borrower of that
 * channel makes it answer one more question
 * ([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)).
 * Lifecycle also had a better encoding available — it is a *sequence*, and a
 * position marker says more than a colour could.
 *
 * `component-type` has neither escape. It is a flat set of ten with no order,
 * so there is no marker to draw; and it is the single most useful fact about a
 * component after its name, which is why it is worth a chip at all. So it takes
 * hue, and the cost is paid down two ways:
 *
 * 1. **A third register, below both kind tiers.** The kind hues run
 *    `oklch(0.72–0.78, 0.14–0.15)` (structural) and `oklch(0.80, 0.08)`
 *    (conceptual). These run `oklch(0.70, 0.09)` — darker than either and less
 *    chromatic than the structural tier — so a component-type chip cannot be
 *    mistaken for a kind badge even out of the corner of an eye.
 * 2. **Hue never carries the identity alone.** The label is always rendered and
 *    the icon is always distinct, so colour is reinforcement. That is the
 *    honest defence for putting ten hues at 36° on a wheel the ADR already
 *    called crowded at nine: at this spacing hue groups, and the word
 *    disambiguates.
 *
 * `external` is the deliberate exception and the one hue worth arguing about:
 * it is near-achromatic, because "a system this solution does not own" is
 * exactly the thing that should recede. Greying it says what a tenth hue could
 * not.
 */

/** The ten values, in the spec's adoption order. Read, never restated. */
export const COMPONENT_TYPES = KIND_FRONTMATTER.component.shape['component-type'].options

export type ComponentType = (typeof COMPONENT_TYPES)[number]

export interface ComponentTypeStyle {
  /** The icon, chosen so the ten are separable at 12px without their labels. */
  icon: LucideIcon
  /** CSS custom property holding this type's hue. */
  colorVar: string
  /** One line, shown on hover — the spec's own definition, compressed. */
  blurb: string
}

export const COMPONENT_TYPE_STYLES: Record<ComponentType, ComponentTypeStyle> = {
  service: {
    icon: Server,
    colorVar: '--ctype-service',
    blurb: 'Independently deployed process with an inbound surface it exposes.',
  },
  library: {
    icon: Library,
    colorVar: '--ctype-library',
    blurb: 'Build-time artifact with no runtime of its own; it runs inside its consumers.',
  },
  ui: {
    icon: AppWindow,
    colorVar: '--ctype-ui',
    blurb: 'Human-facing client — web, mobile, desktop, CLI.',
  },
  job: {
    icon: Timer,
    colorVar: '--ctype-job',
    blurb: 'Scheduled or event-triggered worker with no inbound surface.',
  },
  datastore: {
    icon: Database,
    colorVar: '--ctype-datastore',
    blurb: 'Holder of persistent state, addressed as infrastructure.',
  },
  gateway: {
    icon: Waypoints,
    colorVar: '--ctype-gateway',
    blurb: 'Edge component that fronts, routes, or adapts others rather than owning behaviour.',
  },
  external: {
    icon: Globe,
    colorVar: '--ctype-external',
    blurb: 'A system this solution does not own, described locally so edges can point at it.',
  },
  content: {
    icon: ScrollText,
    colorVar: '--ctype-content',
    blurb: 'A versioned content artifact, consumed by being read by a person or a model.',
  },
  application: {
    icon: Package,
    colorVar: '--ctype-application',
    blurb: 'A fully-packaged program a user installs and runs as one unit.',
  },
  specification: {
    icon: BookText,
    colorVar: '--ctype-specification',
    blurb: 'Normative documents whose contract surface is the text itself; never executed.',
  },
}

/**
 * The style for a value, or null when the frontmatter carries something this
 * table has not been taught.
 *
 * Null rather than a fallback entry on purpose: a missing value means the enum
 * grew and this file did not, and a chip that renders a plausible default would
 * hide that. The caller draws nothing, which is visible in review.
 */
export function componentTypeStyle(value: string | undefined): ComponentTypeStyle | null {
  if (!value) return null
  return COMPONENT_TYPE_STYLES[value as ComponentType] ?? null
}
