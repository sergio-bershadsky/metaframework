import {
  effectiveModel,
  resolveSchema,
  type EffectiveProperty,
  type InheritanceEdge,
  type SchemaRegistry,
} from './registry'

/**
 * Field-to-ancestor attribution for an `allOf`-composed datamodel.
 *
 * This exists because of what a *bundled* schema loses. Every viewer worth
 * using — Stoplight's included — resolves `allOf` into one flat shape, and that
 * is the right default: it is what an instance must satisfy. But flattening
 * erases provenance, and in a catalog whose entire datamodel story is
 * composition (`base-record` → `discount` → `coupon`) the question a reviewer
 * actually arrives with is "where did `created-at` come from, and what breaks
 * if I change it there?". Nothing in a flattened document can answer that.
 *
 * So this module rebuilds the one fact the flattening dropped, and nothing
 * else. It is a companion to the schema view, not a second viewer: no types, no
 * constraints, no descriptions — those are already on screen. Two derived
 * structures, both from data the registry already computed:
 *
 *   - the composition chain, from {@link SchemaRegistry.inheritance} — a DAG,
 *     not a list, because a model may extend several bases at once
 *     (`access-grant` extends `base-record` *and* `auditable`);
 *   - which schema contributes which property name, from `effectiveModel`.
 *
 * `allOf` intersects rather than overrides, so a name contributed by more than
 * one schema in the conjunction is *narrowed* by all of them at once — never
 * replaced. That distinction is the whole reason the attribution is worth
 * showing, and it is why a field can honestly appear under two ancestors.
 */

/** Why a member of the chain may not be a plain resolved ancestor. */
export type LineageMemberStatus = 'ok' | 'cyclic' | 'unresolved'

export interface LineageField {
  name: string
  /**
   * This schema's own `required` lists the name. Attribution, not the
   * conjunction's verdict: a base may declare a name optional and a derived
   * model make it mandatory, and which of them did it is the point here.
   */
  required: boolean
  deprecated: boolean
  /** Constrained to disjoint types by the conjunction — no instance can satisfy it. */
  contradiction: boolean
  /** Also contributed by another schema in the conjunction. */
  narrowed: boolean
  /** Display names of the other contributors, for the chip's hover text. */
  alsoFrom: string[]
}

export interface LineageMember {
  /** Canonical schema URL when resolved; the authored `$ref` when it is not. */
  id: string
  srn: string | null
  /** Last SRN segment — the identifier the chain shows. */
  name: string
  title: string
  abstract: boolean
  /** The model whose page this is, rather than one of its ancestors. */
  own: boolean
  status: LineageMemberStatus
  error: { code: string; message: string } | null
  /** Property names this schema contributes, in the conjunction's order. */
  fields: LineageField[]
}

export interface LineageRelative {
  srn: string
  name: string
  title: string
}

export interface LineageView {
  /**
   * One column per inheritance level, deepest ancestors first and the model
   * itself last. A level holds more than one member when the model extends
   * several bases at the same distance.
   */
  levels: LineageMember[][]
  /** Every member, flattened in the order the levels read. */
  members: LineageMember[]
  /** The model has at least one root-`allOf` ancestor. */
  inherits: boolean
  /** Models whose own root `allOf` extends this one. */
  descendants: LineageRelative[]
}

/** What the walk knows about one schema before it becomes a {@link LineageMember}. */
interface Walked {
  id: string
  srn: string | null
  title: string
  abstract: boolean
  status: LineageMemberStatus
  error: { code: string; message: string } | null
  /** Longest path from the model — a diamond is drawn at its deepest arrival. */
  distance: number
  /** First-encounter index, which is `allOf` branch order; ties within a level. */
  order: number
}

/**
 * Build the lineage view for one datamodel, or null when `ref` names nothing.
 *
 * Returns a view even when there is no inheritance at all: a base with
 * descendants and no ancestors is exactly the case where "who extends this?" is
 * the interesting half. The caller decides whether an empty view is worth
 * rendering, via {@link LineageView.inherits} and `descendants`.
 */
export function buildLineage(registry: SchemaRegistry, ref: string): LineageView | null {
  const root = resolveSchema(registry, ref)
  if (!root) return null

  const model = effectiveModel(registry, root.id)
  if (!model) return null

  const edgesByChild = new Map<string, InheritanceEdge[]>()
  for (const edge of registry.inheritance.edges) {
    edgesByChild.set(edge.child, [...(edgesByChild.get(edge.child) ?? []), edge])
  }

  const walked = new Map<string, Walked>()
  let discovered = 0

  /**
   * Place a schema at `distance`, keeping the deepest arrival. `deeper` says
   * whether this arrival moved it — which is also the signal that its own
   * ancestors have to be re-walked, and what makes the recursion terminate: a
   * distance only ever increases, and is bounded by the number of schemas.
   */
  const place = (
    seed: Omit<Walked, 'order' | 'distance'>,
    distance: number,
  ): { member: Walked; deeper: boolean } => {
    const existing = walked.get(seed.id)
    if (!existing) {
      const created: Walked = { ...seed, distance, order: discovered++ }
      walked.set(seed.id, created)
      return { member: created, deeper: true }
    }
    if (distance <= existing.distance) return { member: existing, deeper: false }
    existing.distance = distance
    return { member: existing, deeper: true }
  }

  /** Walk *up* the root-`allOf` edges; the path guard cuts inheritance cycles. */
  const visit = (id: string, distance: number, path: string[]): void => {
    for (const edge of edgesByChild.get(id) ?? []) {
      if (edge.base === null) {
        // The `$ref` did not resolve. It is still part of the composition the
        // author wrote, so it stays in the chain, named by what they wrote —
        // dropping it would make the chain quietly disagree with the file.
        const resolution = registry.resolutions.get(id)?.get(edge.ref)
        place(
          {
            id: edge.ref,
            srn: resolution?.targetSrn ?? null,
            title: edge.ref,
            abstract: false,
            status: 'unresolved',
            error: resolution?.error ?? { code: 'E_SRN_DANGLING', message: `"${edge.ref}" could not be resolved` },
          },
          distance + 1,
        )
        continue
      }

      const base = registry.entries.get(edge.base)
      if (!base) continue

      const cyclic = path.includes(base.id) || registry.inheritance.cyclic.has(base.id)
      const { member, deeper } = place(
        {
          id: base.id,
          srn: base.srn,
          title: base.title,
          abstract: base.abstract,
          status: cyclic ? 'cyclic' : 'ok',
          error: null,
        },
        distance + 1,
      )

      if (cyclic) {
        member.status = 'cyclic'
        continue
      }
      if (deeper) visit(base.id, distance + 1, [...path, base.id])
    }
  }

  place(
    { id: root.id, srn: root.srn, title: root.title, abstract: root.abstract, status: 'ok', error: null },
    0,
  )
  visit(root.id, 0, [root.id])

  const fields = attribute(registry, root.id, model.properties)
  const deepest = Math.max(...[...walked.values()].map((member) => member.distance))
  const levels: LineageMember[][] = Array.from({ length: deepest + 1 }, () => [])

  for (const member of [...walked.values()].sort((a, b) => a.order - b.order)) {
    levels[deepest - member.distance].push({
      id: member.id,
      srn: member.srn,
      name: member.srn ? lastSegment(member.srn) : member.id,
      title: member.title,
      abstract: member.abstract,
      own: member.id === root.id,
      status: member.status,
      error: member.error,
      fields: fields.get(member.id) ?? [],
    })
  }

  const descendants = (registry.inheritance.derived.get(root.id) ?? [])
    .map((id) => registry.entries.get(id))
    .filter((entry) => entry !== undefined)
    .map((entry) => ({ srn: entry.srn, name: lastSegment(entry.srn), title: entry.title }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return { levels, members: levels.flat(), inherits: walked.size > 1, descendants }
}

/**
 * Property name → contributing schema, keyed by the contributor's canonical id.
 *
 * A name contributed by two schemas is emitted under both: that is not a
 * duplicated row, it *is* the conjunction, and seeing it twice is how a reader
 * learns the derived model narrows rather than replaces.
 *
 * Requiring a name is itself a contribution to the conjunction, so a schema
 * that only lists an inherited name in `required` is a contributor too. That
 * covers both the useful case — a base leaves a field optional and a derived
 * model makes it mandatory, which is invisible in a flattened document — and
 * the degenerate one, a name required and never given a shape, which would
 * otherwise disappear from the table entirely.
 */
function attribute(
  registry: SchemaRegistry,
  rootId: string,
  properties: EffectiveProperty[],
): Map<string, LineageField[]> {
  const byOrigin = new Map<string, LineageField[]>()
  const label = (id: string): string => {
    const entry = registry.entries.get(id)
    return entry ? lastSegment(entry.srn) : id
  }

  for (const property of properties) {
    const declared = property.contributions.map((contribution) => contribution.origin)
    const origins = [...new Set([...declared, ...property.requiredBy])]
    if (origins.length === 0) origins.push(rootId)

    for (const origin of origins) {
      const list = byOrigin.get(origin) ?? []
      list.push({
        name: property.name,
        required: property.requiredBy.includes(origin),
        deprecated: property.deprecated,
        contradiction: property.contradiction,
        narrowed: origins.length > 1,
        alsoFrom: origins.filter((other) => other !== origin).map(label),
      })
      byOrigin.set(origin, list)
    }
  }

  return byOrigin
}

/** The entity's own name — SRNs are `srn://solution/(kind/name)+`, so it is last. */
function lastSegment(srn: string): string {
  return srn.split('/').pop() ?? srn
}
