import { z } from 'zod'
import { RESERVED_KINDS } from '../srn/srn'

/**
 * The common frontmatter contract — framework/spec/frontmatter.md.
 * Kind-specific fields are layered on top by kind schemas; this module owns
 * only what every entity shares.
 */

export const ENTITY_KINDS = ['solution', 'product', 'component', ...RESERVED_KINDS] as const
export type EntityKind = (typeof ENTITY_KINDS)[number]

export const CONTAINER_KINDS = ['solution', 'product', 'component'] as const satisfies readonly EntityKind[]

export const STATUSES = ['draft', 'review', 'approved', 'deprecated'] as const
export type Status = (typeof STATUSES)[number]

/** Forward edge types. Inverse edges are derived by the graph, never authored. */
export const EDGE_TYPES = ['uses', 'exposes', 'depends-on', 'implements', 'supersedes'] as const
export type EdgeType = (typeof EDGE_TYPES)[number]

/** Which target kinds each edge type may point at (frontmatter.md). */
export const EDGE_TARGET_KINDS: Record<EdgeType, readonly EntityKind[] | 'same-as-source'> = {
  uses: ['datamodel', 'protocol', 'environment', 'component'],
  exposes: ['protocol', 'datamodel'],
  'depends-on': ['component', 'product'],
  implements: ['requirement'],
  supersedes: 'same-as-source',
}

/** Which source kinds may author each edge type (frontmatter.md). */
export const EDGE_SOURCE_KINDS: Record<EdgeType, readonly EntityKind[] | 'any'> = {
  uses: 'any',
  exposes: ['component', 'product'],
  'depends-on': ['component', 'product'],
  implements: ['component', 'product'],
  supersedes: 'any',
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
} as const satisfies Record<EntityKind, z.ZodType>

/** Field names a given kind legitimately adds on top of the common contract. */
export function kindFieldNames(kind: EntityKind): string[] {
  const schema = KIND_FRONTMATTER[kind]
  const shape = (schema as { shape?: Record<string, unknown> }).shape
  // `.refine()` wraps the object, so unwrap when the shape is not directly present.
  const inner = shape ?? (schema as unknown as { def?: { innerType?: { shape?: Record<string, unknown> } } }).def?.innerType?.shape
  return Object.keys(inner ?? {})
}

export function unknownFields(raw: Record<string, unknown>, kind?: EntityKind): string[] {
  const known = new Set<string>([...COMMON_FIELDS, ...(kind ? kindFieldNames(kind) : [])])
  return Object.keys(raw).filter((key) => !known.has(key) && !key.startsWith('x-'))
}
