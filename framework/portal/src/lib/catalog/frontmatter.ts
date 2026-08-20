import { z } from 'zod'
import { RESERVED_KINDS } from '../srn/srn'

/**
 * The common frontmatter contract — framework/spec/frontmatter.md.
 * Kind-specific fields are layered on top by kind schemas; this module owns
 * only what every entity shares.
 */

// RESERVED_KINDS already carries product and component — they became bucket
// keywords when paths were bucketed. Listing them here as well duplicated both
// the kind filter and the per-kind counts on solution cards.
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

/** Which target kinds each edge type may point at (frontmatter.md). */
export const EDGE_TARGET_KINDS: Record<EdgeType, readonly EntityKind[] | 'same-as-source'> = {
  uses: ['datamodel', 'protocol', 'environment', 'component'],
  exposes: ['protocol', 'datamodel'],
  'depends-on': ['component', 'product'],
  implements: ['requirement'],
  supersedes: 'same-as-source',
  // A capability is the only thing that can be realized: it is the statement of
  // what the business can do, and building something is what turns it true.
  realizes: ['capability'],
  // A metric points at whatever it puts a number on. Deliberately the widest
  // target set in the table — measuring is orthogonal to the thing measured —
  // but not universal: measuring an actor, an environment or an ADR would be
  // measuring a person, a place or a past decision rather than the system.
  measures: ['capability', 'component', 'protocol', 'requirement'],
}

/** Which source kinds may author each edge type (frontmatter.md). */
export const EDGE_SOURCE_KINDS: Record<EdgeType, readonly EntityKind[] | 'any'> = {
  uses: 'any',
  exposes: ['component', 'product'],
  'depends-on': ['component', 'product'],
  implements: ['component', 'product'],
  supersedes: 'any',
  // Only a built thing realizes a capability — the same two kinds that may
  // `implements` a requirement, and for the same reason: a claim to deliver is
  // only meaningful from something that ships.
  realizes: ['product', 'component'],
  // `measures` is the metric's own edge and nothing else's. The inverse
  // (`measured-by`) is what a capability or component page shows, derived.
  measures: ['metric'],
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

const kebab = z
  .string()
  .regex(KEBAB, 'must be kebab-case ([a-z0-9] words joined by single hyphens)')
  .max(64)

/** A reference is validated as an SRN by the loader, which knows the base entity. */
const srnRef = z.string().min(1)

export const commonFrontmatterSchema = z
  .object({
    name: kebab,
    kind: z.enum(ENTITY_KINDS),
    version: z.number().int().min(1),
    title: z.string().min(1).max(80),
    summary: z
      .string()
      .min(1)
      .max(200)
      .refine((s) => !s.includes('\n'), 'summary must be a single line'),
    status: z.enum(STATUSES),
    owner: z.string().min(1).optional(),
    relations: z.partialRecord(z.enum(EDGE_TYPES), z.array(srnRef)).optional(),
    tags: z.array(kebab).optional(),
  })
  // `x-` prefixed keys are the documented escape hatch; any other unknown
  // top-level field is E_FM_UNKNOWN_FIELD, reported by the loader.
  .catchall(z.unknown())

export type CommonFrontmatter = z.infer<typeof commonFrontmatterSchema>

const COMMON_FIELDS = [
  'name',
  'kind',
  'version',
  'title',
  'summary',
  'status',
  'owner',
  'relations',
  'tags',
] as const

/**
 * Kind-specific frontmatter, per framework/spec/kinds/*.md. The common contract
 * explicitly delegates these fields to the kind documents, so the loader is only
 * a faithful validator once it knows them — without this, every normative kind
 * field reads as an unknown field.
 *
 * Each schema layers ON TOP of the common contract; none may redefine a common
 * field (frontmatter.md forbids it).
 */
const oneLine = (max: number) =>
  z.string().min(1).max(max).refine((value) => !value.includes('\n'), 'must be a single line')

export const KIND_FRONTMATTER = {
  solution: z.object({
    vision: z.string().min(1).max(1000),
    scope: z.object({ in: z.array(oneLine(200)), out: z.array(oneLine(200)).optional() }).optional(),
    contacts: z
      .array(z.object({ role: kebab, handle: z.string().min(1), channel: z.string().optional() }))
      .optional(),
  }),

  product: z.object({
    lifecycle: z.enum(['concept', 'incubating', 'active', 'maintenance', 'sunset', 'retired']),
    'primary-actors': z.array(z.string().min(1)).optional(),
  }),

  component: z.object({
    'component-type': z.enum(['service', 'library', 'ui', 'job', 'datastore', 'gateway', 'external']),
    // Delivery state of the thing described, never the review state of the
    // description — that is `status`, and the two axes cross: an approved
    // description of a `planned` component is the design-first normal case.
    //
    // The field NAME is product's, deliberately, so one word means "where is
    // this in the real world" on every kind that has a real world. The VALUE
    // SET is not, and the divergence is the point: product's enum reads
    // concept → incubating → active → maintenance → sunset → retired because a
    // product is *positioned in a portfolio* — those are investment states,
    // answering "is this a committed bet?". A component is *built and shipped*,
    // so its states answer "does this exist yet, and is it still running?".
    // Hence no `concept`/`incubating` (a component inside a funded product is
    // not a bet), no `active` (the delivery fact is `released`), and no
    // `maintenance` (a component under maintenance is still released — that
    // would be one delivery state spelled two ways). `sunset` and `retired`
    // keep product's exact meaning, which is what earns the shared field name.
    //
    // Coarse and global on purpose: released-in-staging-but-not-production is a
    // per-environment fact and stays in environment declarations and
    // topology.yaml. Folding environments in here would make the field
    // unanswerable for any component that ships to more than one.
    lifecycle: z.enum(['planned', 'in-development', 'released', 'sunset', 'retired']),
  }),

  datamodel: z.object({
    usage: z.enum(['storage', 'exchange', 'both']),
    abstract: z.boolean().optional(),
  }),

  protocol: z.object({
    participants: z
      .array(
        z.object({
          alias: kebab.max(32),
          ref: z.string().min(1),
          role: kebab.max(32).optional(),
        }),
      )
      .min(2, 'a protocol needs at least two participants'),
    style: z.enum(['point-to-point', 'bus', 'request-response']),
    'conforms-to': z
      .array(z.object({ standard: z.string().min(1), version: z.string().optional(), url: z.string().optional() }))
      .optional(),
  }),

  actor: z.object({
    'actor-type': z.enum(['human', 'system', 'external-system', 'service-account']),
    goals: z.array(oneLine(200)).min(1),
  }),

  environment: z.object({
    'environment-type': z.enum(['dev', 'staging', 'production', 'edge', 'local']),
  }),

  adr: z
    .object({
      'decision-status': z.enum(['proposed', 'accepted', 'rejected', 'superseded']),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO-8601 date, YYYY-MM-DD'),
      deciders: z.array(z.string().min(1)).optional(),
    })
    // Who decided is only meaningful once a decision has actually been taken.
    .refine(
      (value) =>
        !['accepted', 'rejected', 'superseded'].includes(value['decision-status']) ||
        (value.deciders?.length ?? 0) > 0,
      { error: 'deciders is required and non-empty once a decision is accepted, rejected or superseded' },
    ),

  requirement: z.object({
    'requirement-type': z.enum(['functional', 'non-functional']),
    priority: z.enum(['must', 'should', 'could', 'wont']),
  }),

  // A capability adds NOTHING to the common contract, and that is a decision
  // rather than a placeholder. What the business can do is stated by `title`
  // and `summary`; whether it is real is answered by the incoming `realizes`
  // edges, not by a field an author would have to keep in step with them. A
  // kind that arrives with six speculative fields teaches authors to fill in
  // noise, and additive-only evolution means a field added later costs nothing
  // while a field removed later cannot happen at all.
  capability: z.object({}),

  // A journey declares exactly one field. Its steps are the substance and they
  // live in `journey.yaml` — order does not survive in frontmatter the way it
  // survives in an artifact — but the protagonist is the entity's defining
  // relationship, and the catalog list, the actor page and every search facet
  // need it without parsing a second file (kinds/journey.md).
  journey: z.object({
    actor: srnRef,
  }),

  // metric's four scalars (kinds/metric.md). `target` and `window` are plain
  // strings HERE and literal grammars in `kindDiagnostics` below, because the
  // spec gives their violations their own codes — `E_MET_TARGET` and
  // `E_MET_WINDOW` — and everything this schema rejects is `E_FM_SCHEMA`.
  // Keeping them as strings is also what makes an unquoted `target: 1200` fail
  // as a type error, which is the one case quoting is load-bearing for.
  metric: z.object({
    'metric-type': z.enum(['ratio', 'duration', 'count', 'amount']),
    target: oneLine(40),
    window: oneLine(40),
    // Spelled out rather than `higher`/`lower`: on its own "higher" invites the
    // question "higher than what?", and this field answers a different one.
    direction: z.enum(['higher-is-better', 'lower-is-better']),
  }),
} as const satisfies Record<EntityKind, z.ZodType>

/** Field names a given kind legitimately adds on top of the common contract. */
export function kindFieldNames(kind: EntityKind): string[] {
  const schema = KIND_FRONTMATTER[kind]
  const shape = (schema as { shape?: Record<string, unknown> }).shape
  // `.refine()` wraps the object, so unwrap when the shape is not directly present.
  const inner = shape ?? (schema as unknown as { def?: { innerType?: { shape?: Record<string, unknown> } } }).def?.innerType?.shape
  return Object.keys(inner ?? {})
}

/**
 * Literal grammars from kinds/metric.md. `metric-type` selects the grammar its
 * `target` must be written in, which is why the unit lives inside the literal
 * rather than in a `unit:` field — one scalar, one truth, and the two can never
 * disagree.
 */
const METRIC_TARGET_GRAMMAR: Record<string, { pattern: RegExp; shape: string }> = {
  // A ratio carries its `%` — without it, 0.999 is unreadable: 99.9% or 0.999%?
  ratio: { pattern: /^\d+(\.\d+)?%$/, shape: 'decimal followed by "%", e.g. "99.9%"' },
  // Durations stop at days: a month is not a fixed duration.
  duration: { pattern: /^\d+(\.\d+)?(ms|s|m|h|d)$/, shape: 'decimal and one of ms/s/m/h/d, e.g. "400ms"' },
  // The only signed literal, because bounded indices that go below zero (NPS is
  // the standing example) are counts.
  count: { pattern: /^-?\d+(\.\d+)?$/, shape: 'a bare decimal, optionally negative, e.g. "1200"' },
  // A three-letter code separated by a space, never a symbol: $ is at least
  // four currencies, and a code greps cleanly.
  amount: { pattern: /^\d+(\.\d+)? [A-Z]{3}$/, shape: 'decimal, a space, and an ISO 4217 code, e.g. "12.50 EUR"' },
}

/** `instant` for a gauge, or a rolling duration ending now. No calendar tokens. */
const METRIC_WINDOW = /^(instant|\d+(\.\d+)?(ms|s|m|h|d))$/

export interface KindDiagnostic {
  /** The spec's own code for this violation, not the generic E_FM_SCHEMA. */
  code: string
  message: string
}

/**
 * Kind rules a zod schema cannot carry, because the spec gives them their own
 * error codes and everything a kind schema rejects is reported as E_FM_SCHEMA.
 *
 * Only rules checkable from the document alone live here; anything needing the
 * resolved catalog is a graph check in the loader.
 */
export function kindDiagnostics(kind: EntityKind, raw: Record<string, unknown>): KindDiagnostic[] {
  if (kind !== 'metric') return []
  const issues: KindDiagnostic[] = []

  const type = raw['metric-type']
  const target = raw.target
  const grammar = typeof type === 'string' ? METRIC_TARGET_GRAMMAR[type] : undefined
  // A target can only be judged against a grammar its type actually selects; a
  // bad enum is already E_FM_SCHEMA and saying so twice helps nobody.
  if (grammar && typeof target === 'string' && !grammar.pattern.test(target)) {
    issues.push({
      code: 'E_MET_TARGET',
      message: `target "${target}" is not a ${type} literal — expected ${grammar.shape}`,
    })
  }

  const window = raw.window
  if (typeof window === 'string' && !METRIC_WINDOW.test(window)) {
    issues.push({
      code: 'E_MET_WINDOW',
      message: `window "${window}" is neither "instant" nor a rolling duration (ms/s/m/h/d), e.g. "30d"`,
    })
  }

  return issues
}

export function unknownFields(raw: Record<string, unknown>, kind?: EntityKind): string[] {
  const known = new Set<string>([...COMMON_FIELDS, ...(kind ? kindFieldNames(kind) : [])])
  return Object.keys(raw).filter((key) => !known.has(key) && !key.startsWith('x-'))
}
