import {
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
  },
  product: {
    label: 'Product',
    cssVar: '--kind-product',
    text: 'text-kind-product',
    bg: 'bg-kind-product/10',
    border: 'border-kind-product/30',
    icon: Package,
    blurb: 'A deliverable unit that owns components.',
  },
  component: {
    label: 'Component',
    cssVar: '--kind-component',
    text: 'text-kind-component',
    bg: 'bg-kind-component/10',
    border: 'border-kind-component/30',
    icon: Layers,
    blurb: 'A product-owned building block; nests arbitrarily deep.',
  },
  protocol: {
    label: 'Protocol',
    cssVar: '--kind-protocol',
    text: 'text-kind-protocol',
    bg: 'bg-kind-protocol/10',
    border: 'border-kind-protocol/30',
    icon: GitBranch,
    blurb: 'How components talk — transport, workflows, state machines.',
  },
  datamodel: {
    label: 'Data model',
    cssVar: '--kind-datamodel',
    text: 'text-kind-datamodel',
    bg: 'bg-kind-datamodel/10',
    border: 'border-kind-datamodel/30',
    icon: FileText,
    blurb: 'A JSON Schema persisted in storage or exchanged over a protocol.',
  },
  environment: {
    label: 'Environment',
    cssVar: '--kind-environment',
    text: 'text-kind-environment',
    bg: 'bg-kind-environment/10',
    border: 'border-kind-environment/30',
    icon: Server,
    blurb: 'A deployment target that hosts components.',
  },
  actor: {
    label: 'Actor',
    cssVar: '--kind-actor',
    text: 'text-kind-actor',
    bg: 'bg-kind-actor/10',
    border: 'border-kind-actor/30',
    icon: CircleUser,
    blurb: 'A human or system participant in the solution.',
  },
  requirement: {
    label: 'Requirement',
    cssVar: '--kind-requirement',
    text: 'text-kind-requirement',
    bg: 'bg-kind-requirement/10',
    border: 'border-kind-requirement/30',
    icon: Target,
    blurb: 'Something the solution must do, satisfied by components.',
  },
  adr: {
    label: 'ADR',
    cssVar: '--kind-adr',
    text: 'text-kind-adr',
    bg: 'bg-kind-adr/10',
    border: 'border-kind-adr/30',
    icon: ScrollText,
    blurb: 'A decision record — why the solution is shaped the way it is.',
  },
  capability: {
    label: 'Capability',
    cssVar: '--kind-capability',
    text: 'text-kind-capability',
    bg: 'bg-kind-capability/10',
    border: 'border-kind-capability/30',
    icon: Zap,
    blurb: 'Something the business can do, stated for the whole solution.',
  },
  journey: {
    label: 'Journey',
    cssVar: '--kind-journey',
    text: 'text-kind-journey',
    bg: 'bg-kind-journey/10',
    border: 'border-kind-journey/30',
    icon: Route,
    blurb: 'The ordered path one actor takes across the solution.',
  },
  metric: {
    label: 'Metric',
    cssVar: '--kind-metric',
    text: 'text-kind-metric',
    bg: 'bg-kind-metric/10',
    border: 'border-kind-metric/30',
    icon: Gauge,
    blurb: 'How the entity that owns it is measured — a number with a target.',
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
