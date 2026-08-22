import {
  AppWindow,
  Binary,
  BookText,
  Container,
  Database,
  Globe,
  type LucideIcon,
  Library,
  Newspaper,
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
 *    That second clause was a claim rather than a fact until it was measured.
 *    Three glyphs were shared with the *kind* register — `Server` with
 *    `environment`, `ScrollText` with `adr`, `Package` with `product` — so a
 *    reader who had learned the sidebar met the same silhouette meaning
 *    something else, at a lower chroma they were being asked not to read as
 *    significant. It is the exact failure the two-tier hue design was built to
 *    prevent, arriving through the channel nobody was watching. The three moved
 *    to `Container`, `Newspaper` and `Binary`, and the register that yielded was
 *    this one: `kind` is drawn by the sidebar, the badges, the entity links and
 *    both graphs, so its glyphs are the ones a reader has already learned.
 *    `icons.test.ts` now holds all 22 distinct, across both registers.
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
  /** The long-form gloss, written for the legend's mini-doc rather than a tooltip. */
  detail: string
}

export const COMPONENT_TYPE_STYLES: Record<ComponentType, ComponentTypeStyle> = {
  service: {
    icon: Container,
    colorVar: '--ctype-service',
    blurb: 'Independently deployed process with an inbound surface it exposes.',
    detail: 'Has its own process and an address others call. Expect a protocol edge into it and an environment that places it.',
  },
  library: {
    icon: Library,
    colorVar: '--ctype-library',
    blurb: 'Build-time artifact with no runtime of its own; it runs inside its consumers.',
    detail: 'Ships as a build-time artifact and runs inside whatever imports it, so it never appears in a topology of its own.',
  },
  ui: {
    icon: AppWindow,
    colorVar: '--ctype-ui',
    blurb: 'Human-facing client — web, mobile, desktop, CLI.',
    detail: 'The surface a person actually touches. Usually the first step of a journey rather than the target of a protocol.',
  },
  job: {
    icon: Timer,
    colorVar: '--ctype-job',
    blurb: 'Scheduled or event-triggered worker with no inbound surface.',
    detail: 'Runs on a clock or a trigger and exposes nothing inbound, so its edges all point outward.',
  },
  datastore: {
    icon: Database,
    colorVar: '--ctype-datastore',
    blurb: 'Holder of persistent state, addressed as infrastructure.',
    detail: 'Holds state and is described as infrastructure; the datamodels it persists are the part worth reading.',
  },
  gateway: {
    icon: Waypoints,
    colorVar: '--ctype-gateway',
    blurb: 'Edge component that fronts, routes, or adapts others rather than owning behaviour.',
    detail: 'Sits at an edge and fronts, routes or adapts what is behind it. Behaviour belongs to the things it covers, not to it.',
  },
  external: {
    icon: Globe,
    colorVar: '--ctype-external',
    blurb: 'A system this solution does not own, described locally so edges can point at it.',
    detail: 'Not owned here. Described locally only so edges have something real to point at, and never given a topology.',
  },
  content: {
    icon: Newspaper,
    colorVar: '--ctype-content',
    blurb: 'A versioned content artifact, consumed by being read by a person or a model.',
    detail: 'Versioned material consumed by being read — by a person or by a model — rather than executed.',
  },
  application: {
    icon: Binary,
    colorVar: '--ctype-application',
    blurb: 'A fully-packaged program a user installs and runs as one unit.',
    detail: 'A packaged program installed and run as one unit, rather than a service someone else calls.',
  },
  specification: {
    icon: BookText,
    colorVar: '--ctype-specification',
    blurb: 'Normative documents whose contract surface is the text itself; never executed.',
    detail: 'Normative text whose contract surface is the words themselves. Never executed; consumed by reference.',
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
