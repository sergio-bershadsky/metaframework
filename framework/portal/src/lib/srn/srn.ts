/**
 * SRN — Solution Resource Name.
 *
 * Implements framework/spec/srn.md. The SRN is the framework's identity and
 * reference syntax; it is a hierarchical URI whose path is identical to the
 * entity's directory under `solutions/`.
 *
 *     srn://{solution}( /{kind}/{name} )*  [@{version}]
 *
 * Every entity below the solution sits in a **kind bucket**, so the path is a
 * strict alternation of bucket and name. That uniformity is the point: an
 * entity's kind is stated at every level instead of inferred from depth, any
 * directory listing shows buckets rather than a mix of buckets and names, and
 * parsing needs no lookahead or reserved-word scan.
 *
 * One artifact is outside this scheme: `schema.json` references other schemas
 * by relative file path so stock JSON Schema tooling can resolve them
 * (decision-record 2026-08-19-b). A schema's identity is still the SRN of the
 * entity whose directory holds it, which {@link dirToSrn} derives.
 */

/** Buckets that may hold entities. */
export const RESERVED_KINDS = [
  'product',
  'component',
  'datamodel',
  'protocol',
  'actor',
  'environment',
  'adr',
  'requirement',
] as const

export type ReservedKind = (typeof RESERVED_KINDS)[number]

const RESERVED = new Set<string>(RESERVED_KINDS)

/** Kinds that may contain further entities. */
export const CONTAINER_KINDS = ['product', 'component'] as const
const CONTAINERS = new Set<string>(CONTAINER_KINDS)

/** Kinds describing the solution as a whole; they may only sit at its root. */
export const SOLUTION_LEVEL_KINDS = ['actor', 'environment'] as const
const SOLUTION_LEVEL = new Set<string>(SOLUTION_LEVEL_KINDS)

export type SrnErrorCode =
  | 'E_SRN_SYNTAX'
  | 'E_SRN_RESERVED'
  | 'E_SRN_PLACEMENT'
  | 'E_SRN_CROSS_SOLUTION'
  | 'E_SRN_DANGLING'
  | 'E_SRN_VERSION'

export class SrnError extends Error {
  readonly code: SrnErrorCode
  readonly ref: string

  constructor(code: SrnErrorCode, message: string, ref = '') {
    super(ref ? `${code}: ${message} (${ref})` : `${code}: ${message}`)
    this.name = 'SrnError'
    this.code = code
    this.ref = ref
  }
}

/** One `{kind}/{name}` pair — the atom of an SRN path. */
export interface SrnSegment {
  kind: ReservedKind
  name: string
}

export interface Srn {
  /** Authority position — the sealed universe this entity belongs to. */
  solution: string
  /** The full alternating chain; empty when the SRN addresses the solution. */
  path: SrnSegment[]
  /** Kind of the addressed entity; `null` only for the solution root. */
  kind: ReservedKind | null
  /** `null` exactly when `kind` is null. */
  name: string | null
  /** `null` means "latest". */
  version: number | null
}

export const SCHEME = 'srn://'

const SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/
const VERSION = /^[1-9][0-9]*$/
const MAX_SEGMENT_LENGTH = 64

function assertSegment(segment: string, ref: string): void {
  if (!SEGMENT.test(segment) || segment.length > MAX_SEGMENT_LENGTH) {
    throw new SrnError('E_SRN_SYNTAX', `bad segment "${segment}"`, ref)
  }
}

/**
 * Split a trailing `@version` off the final segment. A `@` anywhere else is a
 * syntax error — the suffix may only pin the entity the SRN addresses.
 */
function splitVersion(body: string, ref: string): { body: string; version: number | null } {
  const at = body.lastIndexOf('@')
  if (at === -1) return { body, version: null }

  const raw = body.slice(at + 1)
  if (raw.includes('/') || !VERSION.test(raw)) {
    throw new SrnError('E_SRN_SYNTAX', '@version must be a positive integer on the final segment', ref)
  }
  const head = body.slice(0, at)
  if (head.includes('@')) {
    throw new SrnError('E_SRN_SYNTAX', 'multiple @version suffixes', ref)
  }
  return { body: head, version: Number(raw) }
}

/**
 * Structural placement, enforced by the grammar rather than by the loader: a
 * product is always a direct child of the solution, components nest only inside
 * products or components, and actors and environments describe the solution as
 * a whole so nothing smaller may own them.
 */
function assertPlacement(path: SrnSegment[], ref: string): void {
  path.forEach((segment, index) => {
    const parent = index === 0 ? null : path[index - 1].kind

    if (parent !== null && !CONTAINERS.has(parent)) {
      throw new SrnError('E_SRN_PLACEMENT', `a ${parent} cannot own a ${segment.kind}`, ref)
    }
    if (segment.kind === 'product' && parent !== null) {
      throw new SrnError('E_SRN_PLACEMENT', 'a product must be a direct child of the solution', ref)
    }
    if (segment.kind === 'component' && parent === null) {
      throw new SrnError('E_SRN_PLACEMENT', 'a component must live inside a product', ref)
    }
    if (SOLUTION_LEVEL.has(segment.kind) && parent !== null) {
      throw new SrnError('E_SRN_PLACEMENT', `${segment.kind} may only live at solution level`, ref)
    }
  })
}

/** Parse an absolute SRN. Relative references must be resolved first. */
export function parseSrn(ref: string): Srn {
  if (typeof ref !== 'string' || !ref.startsWith(SCHEME)) {
    throw new SrnError('E_SRN_SYNTAX', 'missing srn:// scheme', String(ref))
  }
  if (ref.includes('?') || ref.includes('#') || ref.includes('%')) {
    throw new SrnError('E_SRN_SYNTAX', 'query, fragment and percent-encoding are not allowed', ref)
  }

  const { body, version } = splitVersion(ref.slice(SCHEME.length), ref)
  if (body.length === 0) throw new SrnError('E_SRN_SYNTAX', 'empty SRN', ref)

  const segments = body.split('/')
  for (const segment of segments) assertSegment(segment, ref)

  const [solution, ...rest] = segments
  if (RESERVED.has(solution)) {
    throw new SrnError('E_SRN_RESERVED', `reserved keyword "${solution}" as solution name`, ref)
  }

  if (rest.length % 2 !== 0) {
    // An odd tail is a bucket with nothing in it; buckets are not addressable.
    throw new SrnError(
      'E_SRN_SYNTAX',
      RESERVED.has(rest[rest.length - 1])
        ? 'kind bucket is not addressable — a name must follow the kind'
        : 'path must alternate {kind}/{name}',
      ref,
    )
  }

  const path: SrnSegment[] = []
  for (let i = 0; i < rest.length; i += 2) {
    const kind = rest[i]
    const name = rest[i + 1]
    if (!RESERVED.has(kind)) {
      throw new SrnError('E_SRN_SYNTAX', `"${kind}" is not a kind bucket`, ref)
    }
    if (RESERVED.has(name)) {
      throw new SrnError('E_SRN_RESERVED', `reserved keyword "${name}" as entity name`, ref)
    }
    path.push({ kind: kind as ReservedKind, name })
  }

  assertPlacement(path, ref)

  const last = path[path.length - 1]
  return {
    solution,
    path,
    kind: last?.kind ?? null,
    name: last?.name ?? null,
    version,
  }
}

export function formatSrn(srn: Srn): string {
  const parts = [srn.solution, ...srn.path.flatMap((segment) => [segment.kind, segment.name])]
  const suffix = srn.version === null ? '' : `@${srn.version}`
  return `${SCHEME}${parts.join('/')}${suffix}`
}

/** Same SRN ignoring the version pin — the identity of the entity itself. */
export function unversioned(srn: Srn): string {
  return formatSrn({ ...srn, version: null })
}

/** The SRN of the entity that owns this one; `null` for a solution root. */
export function parentSrn(srn: Srn): string | null {
  if (srn.path.length === 0) return null
  const path = srn.path.slice(0, -1)
  const last = path[path.length - 1]
  return formatSrn({
    solution: srn.solution,
    path,
    kind: last?.kind ?? null,
    name: last?.name ?? null,
    version: null,
  })
}

/**
 * Resolve an SRN to its entity directory, relative to the catalog root.
 * The `@version` suffix never appears on disk.
 */
export function srnToDir(srn: Srn, catalogDir = 'solutions'): string {
  return [catalogDir, srn.solution, ...srn.path.flatMap((s) => [s.kind, s.name])].join('/')
}

/** The entity document — `index.md` inside the entity directory. */
export function srnToDocument(srn: Srn, catalogDir = 'solutions'): string {
  return `${srnToDir(srn, catalogDir)}/index.md`
}

/** Inverse of {@link srnToDir}: derive an SRN from a catalog-relative path. */
export function dirToSrn(dir: string, catalogDir = 'solutions'): Srn {
  const parts = dir.split('/').filter(Boolean)
  const start = parts[0] === catalogDir ? 1 : 0
  return parseSrn(`${SCHEME}${parts.slice(start).join('/')}`)
}

/**
 * RFC 3986 §5.2.4 remove_dot_segments, with the framework's stricter rule:
 * a `..` that would climb above the solution root is an error rather than
 * being silently clamped, because a clamped reference is almost always a bug.
 */
function removeDotSegments(segments: string[], ref: string): string[] {
  const out: string[] = []
  for (const segment of segments) {
    if (segment === '.') continue
    if (segment === '..') {
      if (out.length === 0) {
        throw new SrnError('E_SRN_SYNTAX', '".." climbs above the solution root', ref)
      }
      out.pop()
      continue
    }
    out.push(segment)
  }
  return out
}

/**
 * Resolve a reference (absolute or relative) against a base entity SRN.
 *
 * Relative references are path arithmetic from the base entity's directory, so
 * one `..` pops one segment — and a bucket plus a name is two segments. Because
 * bucketed paths are longer, solution-absolute references
 * (`/product/shop/datamodel/money`) usually read better than deep `../../..`
 * chains; the spec recommends them for anything outside the current entity.
 */
export function resolveRef(base: string, ref: string): string {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new SrnError('E_SRN_SYNTAX', 'empty reference', String(ref))
  }

  const baseSrn = parseSrn(base)

  if (ref.startsWith(SCHEME)) {
    const target = parseSrn(ref)
    if (target.solution !== baseSrn.solution) {
      throw new SrnError(
        'E_SRN_CROSS_SOLUTION',
        `reference into solution "${target.solution}" from "${baseSrn.solution}"`,
        ref,
      )
    }
    return formatSrn(target)
  }

  // Network-path reference — changes the authority, i.e. the solution.
  if (ref.startsWith('//')) {
    throw new SrnError('E_SRN_CROSS_SOLUTION', 'network-path reference changes the solution', ref)
  }

  const { body: refBody, version } = splitVersion(ref, ref)

  const merged = refBody.startsWith('/')
    ? refBody.slice(1).split('/')
    : [...baseSrn.path.flatMap((s) => [s.kind, s.name]), ...refBody.split('/')]

  const segments = removeDotSegments(merged, ref)
  for (const segment of segments) assertSegment(segment, ref)

  const suffix = version === null ? '' : `@${version}`
  return formatSrn(parseSrn(`${SCHEME}${[baseSrn.solution, ...segments].join('/')}${suffix}`))
}
