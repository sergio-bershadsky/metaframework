import {
  Anchor,
  Boxes,
  CircleUser,
  FileText,
  Gauge,
  GitBranch,
  Layers,
  Package,
  Route,
  ScrollText,
  Server,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { EntityKind } from '../catalog/frontmatter'

/**
 * Colour is ontology: every kind owns one hue, defined once in globals.css and
 * referenced everywhere — tree, badges, diagram nodes. Nothing else in the UI
 * is allowed to be colourful, so hue always means "kind" and never decoration.
 *
 * Twelve kinds in two tiers. The nine structural kinds — what the system is made
 * of — are full-chroma; capability, journey and metric describe intent and are
 * set apart by BOTH lower chroma AND higher lightness. Both, deliberately: at
 * the 14–16px an icon is actually met, the brightness step separates the tiers
 * at least as strongly as the desaturation does. globals.css carries the
 * measured CIELAB numbers beside the tokens; this is only the reminder that the
 * tier is two channels, so a future kind added at low chroma and structural
 * lightness would not join the tier — it would just look washed out.
 */
export interface KindStyle {
  label: string
  /** CSS custom property holding the kind's hue. */
  cssVar: string
  /** Tailwind text colour class generated from the @theme token. */
  text: string
  /** Tailwind background class for tinted chips. */
  bg: string
  border: string
  icon: LucideIcon
  /** One line explaining what the kind is, for tooltips and empty states. */
  blurb: string
  /** The long-form gloss, written for the legend's mini-doc rather than a tooltip. */
  detail: string
}

export const KIND_STYLES: Record<EntityKind, KindStyle> = {
  solution: {
    label: 'Solution',
    cssVar: '--kind-solution',
    text: 'text-kind-solution',
    bg: 'bg-kind-solution/10',
    border: 'border-kind-solution/30',
    icon: Boxes,
    blurb: 'A sealed universe — the root catalog of one described system.',
    detail: 'The root of a catalog and the boundary of every reference — nothing inside one solution may point into another. It is the only kind the spec requires a `vision` from.',
  },
  product: {
    label: 'Product',
    cssVar: '--kind-product',
    text: 'text-kind-product',
    bg: 'bg-kind-product/10',
    border: 'border-kind-product/30',
    icon: Package,
    blurb: 'A deliverable unit that owns components.',
    detail: 'Sits directly under the solution and nowhere else. It owns components and is the unit a team ships.',
  },
  component: {
    label: 'Component',
    cssVar: '--kind-component',
    text: 'text-kind-component',
    bg: 'bg-kind-component/10',
    border: 'border-kind-component/30',
    icon: Layers,
    blurb: 'A product-owned building block; nests arbitrarily deep.',
    detail: 'Sits under a product or another component, so it nests arbitrarily deep. The only kind carrying a second axis — the component-type below.',
  },
  protocol: {
    label: 'Protocol',
    cssVar: '--kind-protocol',
    text: 'text-kind-protocol',
    bg: 'bg-kind-protocol/10',
    border: 'border-kind-protocol/30',
    icon: GitBranch,
    blurb: 'How components talk — transport, workflows, state machines.',
    detail: 'Filed at the nearest common ancestor of its participants, so an exchange between two products lands on the solution. Carries transport.yaml, workflows/*.yaml, states.json, and optional openapi.yaml and arazzo.yaml documents.',
  },
  datamodel: {
    label: 'Data model',
    cssVar: '--kind-datamodel',
    text: 'text-kind-datamodel',
    bg: 'bg-kind-datamodel/10',
    border: 'border-kind-datamodel/30',
    icon: FileText,
    blurb: 'A JSON Schema persisted in storage or exchanged over a protocol.',
    detail: 'Sits on a solution, a product or a component. Carries schema.json — JSON Schema 2020-12 under a canonical $id — plus optional examples/.',
  },
  environment: {
    label: 'Environment',
    cssVar: '--kind-environment',
    text: 'text-kind-environment',
    bg: 'bg-kind-environment/10',
    border: 'border-kind-environment/30',
    icon: Server,
    blurb: 'A deployment target that hosts components.',
    detail: 'Sits directly under the solution. Carries topology.yaml for where things run and config.yaml for what they are configured with.',
  },
  actor: {
    label: 'Actor',
    cssVar: '--kind-actor',
    text: 'text-kind-actor',
    bg: 'bg-kind-actor/10',
    border: 'border-kind-actor/30',
    icon: CircleUser,
    blurb: 'A human or system participant in the solution.',
    detail: 'Sits directly under the solution. Actors are who journeys are written about, and the outside edge of a protocol.',
  },
  requirement: {
    label: 'Requirement',
    cssVar: '--kind-requirement',
    text: 'text-kind-requirement',
    bg: 'bg-kind-requirement/10',
    border: 'border-kind-requirement/30',
    icon: Target,
    blurb: 'Something the solution must do, satisfied by components.',
    detail: 'Sits on a solution, a product or a component, and is claimed by the components that implement it. One that nothing implements is reported rather than quietly dropped.',
  },
  adr: {
    label: 'ADR',
    cssVar: '--kind-adr',
    text: 'text-kind-adr',
    bg: 'bg-kind-adr/10',
    border: 'border-kind-adr/30',
    icon: ScrollText,
    blurb: 'A decision record — why the solution is shaped the way it is.',
    detail: 'Sits on a solution, a product or a component. The only kind allowed to write a measured number, and only with the date and the command that produced it.',
  },
  capability: {
    label: 'Capability',
    cssVar: '--kind-capability',
    text: 'text-kind-capability',
    bg: 'bg-kind-capability/10',
    border: 'border-kind-capability/30',
    icon: Zap,
    blurb: 'Something the business can do, stated for the whole solution.',
    detail: 'Sits directly under the solution. What the business can do — realized by products and components rather than owned by them.',
  },
  journey: {
    label: 'Journey',
    cssVar: '--kind-journey',
    text: 'text-kind-journey',
    bg: 'bg-kind-journey/10',
    border: 'border-kind-journey/30',
    icon: Route,
    blurb: 'The ordered path one actor takes across the solution.',
    detail: 'Sits directly under the solution. Carries journey.yaml: an ordered path of steps for exactly one actor, each naming what it touches.',
  },
  metric: {
    label: 'Metric',
    cssVar: '--kind-metric',
    text: 'text-kind-metric',
    bg: 'bg-kind-metric/10',
    border: 'border-kind-metric/30',
    icon: Gauge,
    blurb: 'How the entity that owns it is measured — a number with a target.',
    detail: 'Sits on a solution, a product or a component. How the thing that owns it is known to be working.',
  },
  assumption: {
    label: 'Assumption',
    cssVar: '--kind-assumption',
    text: 'text-kind-assumption',
    bg: 'bg-kind-assumption/10',
    border: 'border-kind-assumption/30',
    icon: Anchor,
    blurb: 'Something taken as true without proof, and what rests on it.',
    detail: 'Sits on a solution, a product or a component. Carries a standing and a review date; the entities that assume it author the edge, so what breaks when it turns out false is derived.',
  },
}

export function kindStyle(kind: EntityKind): KindStyle {
  return KIND_STYLES[kind]
}

/** Resolved hue for canvas/SVG contexts that cannot use Tailwind classes. */
export function kindColorVar(kind: EntityKind): string {
  return `var(${KIND_STYLES[kind].cssVar})`
}

export const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'text-muted-foreground border-border' },
  review: { label: 'In review', className: 'text-warning border-warning/40' },
  approved: { label: 'Approved', className: 'text-kind-environment border-kind-environment/40' },
  deprecated: { label: 'Deprecated', className: 'text-destructive border-destructive/40' },
}
