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

export function unknownFields(raw: Record<string, unknown>): string[] {
  const known = new Set([
    'name',
    'kind',
    'version',
    'title',
    'summary',
    'status',
    'owner',
    'relations',
    'tags',
  ])
  return Object.keys(raw).filter((key) => !known.has(key) && !key.startsWith('x-'))
}
