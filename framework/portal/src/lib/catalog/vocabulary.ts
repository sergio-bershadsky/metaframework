import { RESERVED_KINDS } from '../srn/srn'

/**
 * The closed word lists of the frontmatter contract — and nothing else.
 *
 * ## Why this is a module of its own
 *
 * These five arrays are the *values* half of `./frontmatter`, and they are the
 * only part of it the browser has any use for: the sidebar's Kind and Status
 * filters iterate them, the rail's persisted settings validate against them,
 * and the component-type chip reads its ten values off one. The other half of
 * `./frontmatter` — `commonFrontmatterSchema`, `KIND_FRONTMATTER` — is a tree of
 * zod schemas **built at module scope**, so importing so much as a four-element
 * const array from there used to evaluate `z.object(...)` and drag the whole of
 * zod into the client graph.
 *
 * Measured, before the split: 272.7 KB of zod in the client chunks of all five
 * page routes — 30.2% of the 901.8 KB shared first-load JS — of which 127.2 KB
 * was `zod/v4/locales`, every translation of zod's error messages. Nothing in
 * the browser ever called a schema; `grep '\.parse(|\.safeParse('` over
 * `components/`, `lib/ui/`, `lib/diagrams/` and `lib/artifacts/` found only
 * `JSON.parse`. The bytes were pure import-time cost.
 *
 * So the direction of the dependency is inverted rather than duplicated: the
 * plain arrays live here, `./frontmatter` imports them and builds `z.enum(...)`
 * over them. There is still exactly one copy of every list, and a client module
 * that needs a list no longer reaches a module that evaluates zod.
 *
 * **The rule this module exists to keep: nothing imported from here may import
 * zod, transitively or otherwise.** `lib/client-bundle.test.ts` walks the real
 * import graph from every `'use client'` module and fails if it does.
 */

// RESERVED_KINDS already carries product and component — they became bucket
// keywords when paths were bucketed. Listing them here as well duplicated both
// the kind filter and the per-kind counts on solution cards.
//
// THE RULE, because there are two orderings of these twelve words and getting
// them the wrong way round is invisible: this list is ADOPTION order and grows
// by appending, which is what makes it a faithful record of what the ontology
// reserved and when. `KIND_ORDER` (./tree) is READING order — containers, then
// behaviour, participants, intent, paperwork. Anything a reader sees iterates
// KIND_ORDER; this list is for membership tests, the zod enum built over it in
// ./frontmatter, and the reserved vocabulary itself, and is never rendered as a
// sequence. The two were being shown side by side — the Kind filter menu from
// here, the Kind lens's buckets from there — which is how one viewport came to
// hold two different orders of the same twelve kinds.
export const ENTITY_KINDS = ['solution', ...RESERVED_KINDS] as const
export type EntityKind = (typeof ENTITY_KINDS)[number]

export const CONTAINER_KINDS = ['solution', 'product', 'component'] as const satisfies readonly EntityKind[]

export const STATUSES = ['draft', 'review', 'approved', 'deprecated'] as const
export type Status = (typeof STATUSES)[number]

/**
 * Forward edge types. Inverse edges are derived by the graph, never authored.
 *
 * Like RESERVED_KINDS this list grows by APPENDING: `realizes` and `measures`
 * arrived with the capability/journey/metric kinds, and putting them at the end
 * rather than beside the edges they read like keeps the order a record of
 * adoption. Nothing existing moved.
 */
export const EDGE_TYPES = [
  'uses',
  'exposes',
  'depends-on',
  'implements',
  'supersedes',
  'realizes',
  'measures',
] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

/**
 * The `component-type` values, in the spec's adoption order.
 *
 * ADOPTION order, grown by appending like every closed enum here: the original
 * seven, then `content`/`application`/`specification` (kinds/component.md v5,
 * decision-record amendment 2026-08-20-g). The three arrivals are the recorded
 * strains, not Compass's completeness — each names a thing an entity in a
 * shipped catalog already is and the old seven could only approximate with the
 * mismatch parked in prose.
 *
 * `KIND_FRONTMATTER.component` builds its enum from this array and
 * `lib/ui/component-type.ts` draws a chip per value from the same array, so the
 * validator and the chip cannot disagree — which was already true when the chip
 * read the values back off the zod enum, and stays true now that both read the
 * array the enum is made of.
 */
export const COMPONENT_TYPES = [
  'service',
  'library',
  'ui',
  'job',
  'datastore',
  'gateway',
  'external',
  'content',
  'application',
  'specification',
] as const
export type ComponentType = (typeof COMPONENT_TYPES)[number]
