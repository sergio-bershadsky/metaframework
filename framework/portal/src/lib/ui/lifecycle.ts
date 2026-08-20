import { KIND_FRONTMATTER, type EntityKind } from '../catalog/frontmatter'

/**
 * Lifecycle, for the chip that draws it.
 *
 * The field itself — which kinds have it, which values each may take, and why
 * the two value sets differ — is defined once, in `KIND_FRONTMATTER`
 * (framework/spec/kinds/product.md and kinds/component.md). This module adds
 * only what a renderer needs and a schema cannot express: that the values are a
 * SEQUENCE, and where in it a given value sits.
 *
 * The order is read out of the zod enum rather than restated here. A second
 * copy of six words would be a second place for them to disagree, and the
 * disagreement would be invisible — the chip would simply light the wrong
 * number of bars.
 *
 * What lifecycle is NOT is worth keeping beside the code that draws it: it is
 * not `status`. `status` is the review state of the DESCRIPTION, `lifecycle`
 * the delivery state of the THING DESCRIBED, and the axes cross — an
 * **approved** description of a **planned** component is exactly what a
 * reviewed design for an unbuilt thing looks like. {@link LifecycleChip} is
 * built to make that visible; see its own note for how.
 */

/** Kinds whose frontmatter carries a `lifecycle` field. */
const LIFECYCLE_KINDS = ['product', 'component'] as const satisfies readonly EntityKind[]

type LifecycleKind = (typeof LIFECYCLE_KINDS)[number]

/**
 * The ordered values of each kind's lifecycle, straight from its schema.
 *
 * Built by mapping {@link LIFECYCLE_KINDS} rather than by listing the two kinds
 * a second time: one list of which kinds have the field, so a third kind
 * gaining a `lifecycle` cannot be added to one place and forgotten in the other.
 *
 * Both entries are plain `z.object`s, so the shape is directly reachable; a
 * kind later wrapped in `.refine()` would need the same unwrap `kindFieldNames`
 * does, and the empty fallback is what keeps a shape change from throwing at
 * module load. `lifecycle.test.ts` pins the result against the schema, so an
 * empty fallback fails loudly in CI rather than quietly at runtime.
 */
export const LIFECYCLE_STAGES = Object.fromEntries(
  LIFECYCLE_KINDS.map((kind) => [kind, enumValues(kind)]),
) as Record<LifecycleKind, readonly string[]>


function enumValues(kind: LifecycleKind): readonly string[] {
  const shape = (KIND_FRONTMATTER[kind] as { shape?: Record<string, unknown> }).shape
  const field = shape?.lifecycle as { options?: readonly string[] } | undefined
  return field?.options ?? []
}

export interface LifecycleStage {
  /** The value as authored. */
  value: string
  /** Title case, hyphens opened out: `in-development` → `In development`. */
  label: string
  /** 0-based position in the kind's sequence; -1 when the value is not one. */
  index: number
  /** How many stages the kind has. */
  total: number
}

/**
 * Read an entity's `lifecycle` frontmatter field, if it has one.
 *
 * Returns null — rather than throwing or guessing — when the kind has no
 * lifecycle or the field is absent, because a historical revision predates the
 * field and must still render. A value the kind's sequence does not contain
 * still renders, with `index: -1`: showing an unknown lifecycle verbatim is
 * more useful than hiding it, and the loader is what complains about it.
 */
export function lifecycleOf(kind: EntityKind, frontmatter: Record<string, unknown>): LifecycleStage | null {
  const stages = (LIFECYCLE_STAGES as Partial<Record<EntityKind, readonly string[]>>)[kind]
  if (!stages || stages.length === 0) return null

  const value = frontmatter.lifecycle
  if (typeof value !== 'string' || value.length === 0) return null

  return { value, label: humanise(value), index: stages.indexOf(value), total: stages.length }
}

function humanise(value: string): string {
  const opened = value.replace(/-/g, ' ')
  return opened.charAt(0).toUpperCase() + opened.slice(1)
}
