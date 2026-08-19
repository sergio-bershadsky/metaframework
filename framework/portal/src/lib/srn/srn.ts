/**
 * SRN — Solution Resource Name.
 *
 * Implements framework/spec/srn.md. The SRN is the framework's only identity
 * and reference syntax; it is a hierarchical URI whose path is identical to the
 * entity's directory under `solutions/`.
 *
 *     srn://{solution}/{product}/{components...}/{kind}/{name}[@{version}]
 */

export const RESERVED_KINDS = [
  'datamodel',
  'protocol',
  'actor',
  'environment',
  'adr',
  'requirement',
] as const

export type ReservedKind = (typeof RESERVED_KINDS)[number]

const RESERVED = new Set<string>(RESERVED_KINDS)

export type SrnErrorCode =
  | 'E_SRN_SYNTAX'
  | 'E_SRN_RESERVED'
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

export interface Srn {
  /** Authority position — the sealed universe this entity belongs to. */
  solution: string
  /** `[product, ...componentPath]`; empty for a solution, for solution-level entities. */
  containers: string[]
  /** `null` when the SRN addresses a container rather than an owned entity. */
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

  const containers: string[] = []
  for (let i = 0; i < rest.length; i++) {
    const segment = rest[i]
    if (!RESERVED.has(segment)) {
      containers.push(segment)
      continue
    }
    // First reserved keyword ends the container path and starts the entity.
    const tail = rest.slice(i + 1)
    if (tail.length !== 1) {
      throw new SrnError(
        'E_SRN_SYNTAX',
        tail.length === 0
          ? 'kind bucket is not addressable — a name must follow the kind'
          : 'exactly one name segment must follow the kind',
        ref,
      )
    }
    const [name] = tail
    if (RESERVED.has(name)) {
      throw new SrnError('E_SRN_RESERVED', `reserved keyword "${name}" as entity name`, ref)
    }
    return { solution, containers, kind: segment as ReservedKind, name, version }
  }

  return { solution, containers, kind: null, name: null, version }
}

export function formatSrn(srn: Srn): string {
  const parts = [srn.solution, ...srn.containers]
  if (srn.kind) parts.push(srn.kind, srn.name as string)
  const suffix = srn.version === null ? '' : `@${srn.version}`
  return `${SCHEME}${parts.join('/')}${suffix}`
}

/** Same SRN ignoring the version pin — the identity of the entity itself. */
export function unversioned(srn: Srn): string {
  return formatSrn({ ...srn, version: null })
}

/**
 * Resolve an SRN to its entity directory, relative to the catalog root.
 * The `@version` suffix never appears on disk.
 */
export function srnToDir(srn: Srn, catalogDir = 'solutions'): string {
  const parts = [catalogDir, srn.solution, ...srn.containers]
  if (srn.kind) parts.push(srn.kind, srn.name as string)
  return parts.join('/')
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

interface ResolveOptions {
  /**
   * How to treat `base`:
   * - `entity` (default) — an entity SRN, resolved with directory semantics, so
   *   `datamodel/cart` is a child of the base entity. Used by frontmatter
   *   relations, workflow YAML and prose links.
   * - `document` — a file URI, resolved with stock RFC 3986 last-segment
   *   replacement. Used by JSON Schema `$ref` against a schema's `$id`, which
   *   is what lets standard validators resolve refs without a custom resolver.
   */
  baseKind?: 'entity' | 'document'
}

/**
 * Resolve a reference (absolute or relative) against a base, per srn.md.
 * Returns an absolute SRN string; throws SrnError on any violation.
 */
export function resolveRef(base: string, ref: string, options: ResolveOptions = {}): string {
  const { baseKind = 'entity' } = options

  if (typeof ref !== 'string' || ref.length === 0) {
    throw new SrnError('E_SRN_SYNTAX', 'empty reference', String(ref))
  }

  const baseSrn = parseSrn(base)

  // Absolute reference: legal only inside the same solution (sealed universes).
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

  let merged: string[]
  if (refBody.startsWith('/')) {
    // Path-absolute: relative to the solution root.
    merged = refBody.slice(1).split('/')
  } else {
    const basePath = [...baseSrn.containers]
    if (baseSrn.kind) basePath.push(baseSrn.kind, baseSrn.name as string)
    // Document semantics drop the final segment (the file); entity semantics
    // keep the whole path and descend from it, as if `cd`-ing into it.
    if (baseKind === 'document') basePath.pop()
    merged = [...basePath, ...refBody.split('/')]
  }

  const segments = removeDotSegments(merged, ref)
  for (const segment of segments) assertSegment(segment, ref)

  const suffix = version === null ? '' : `@${version}`
  return formatSrn(parseSrn(`${SCHEME}${[baseSrn.solution, ...segments].join('/')}${suffix}`))
}

/**
 * Resolve a JSON Schema `$ref` against the referring schema's `$id`.
 * Stock RFC 3986 semantics — the same resolution a standard validator performs.
 */
export function resolveSchemaRef(baseId: string, ref: string): string {
  return resolveRef(baseId, ref, { baseKind: 'document' })
}
