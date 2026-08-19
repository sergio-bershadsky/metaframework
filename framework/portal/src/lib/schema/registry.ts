/**
 * The datamodel schema registry — framework/spec/kinds/datamodel.md.
 *
 * A `schema.json` is identified by its catalog-relative **file path**, and every
 * cross-entity `$ref` is a relative file path to another entity's `schema.json`.
 * That is not a stylistic choice: `json-schema-to-typescript`, `ajv-cli` and
 * `quicktype` resolve relative file references off the filesystem and fail
 * outright on a private URI scheme, so an `srn://` `$ref` makes the artifact
 * unusable outside this portal (decision-record 2026-08-19-b). The documents
 * carry no `$id` for the same reason — JSON Schema resolves a relative `$ref`
 * against `$id` when it is present, which would re-break the same tooling.
 *
 * The portal's graph is still a graph of SRNs, so a resolved path is mapped back
 * to its owning entity through SRN ≡ path — via lib/srn, never by hand.
 *
 * ajv is registered under the same paths beneath a synthetic `file:///` base, so
 * validation resolves `$ref` with stock RFC 3986 rules and no custom resolver.
 *
 * The module is server-side: it is built from a loaded Catalog and hands
 * client components a plain serialisable {@link SchemaBundle}. Client code must
 * import only *types* from here, or ajv lands in the browser bundle.
 */

import { Ajv2020 } from 'ajv/dist/2020'
import type { ValidateFunction } from 'ajv'
import type { Catalog, Diagnostic, Entity } from '../catalog/types'
import { dirToSrn, formatSrn } from '../srn/srn'

export const DIALECT_2020_12 = 'https://json-schema.org/draft/2020-12/schema'

/** The bare filename is fixed by the kind spec; never prefixed with the entity name. */
export const SCHEMA_ARTIFACT = 'schema.json'

/** Optional provenance annotation: the owning entity's unversioned SRN. */
export const SRN_ANNOTATION = 'x-srn'

/**
 * ajv needs an absolute base URI to apply RFC 3986 resolution; a catalog-relative
 * path is not one. Mirroring the catalog under `file:///` makes ajv's arithmetic
 * identical to {@link resolveRefPath}'s, so validation and the portal graph can
 * never disagree about where a `$ref` lands.
 */
const AJV_BASE = 'file:///'

function ajvKey(id: string): string {
  return `${AJV_BASE}${id}`
}

/** Late-bound or second-addressing keywords, forbidden so the graph stays static. */
const FORBIDDEN_KEYWORDS = ['$dynamicRef', '$dynamicAnchor', '$anchor', '$vocabulary'] as const

/**
 * A JSON Schema node. Deliberately open: the dialect is fixed but the keyword
 * set is not ours to close, and unknown keywords must survive round-tripping
 * into the raw view.
 */
export interface SchemaNode {
  $schema?: string
  /** Never legal in this framework; typed only so a stray one can be reported. */
  $id?: string
  $ref?: string
  $comment?: string
  $defs?: Record<string, SchemaNode>
  type?: string | string[]
  format?: string
  title?: string
  description?: string
  deprecated?: boolean
  default?: unknown
  examples?: unknown[]
  enum?: unknown[]
  const?: unknown
  properties?: Record<string, SchemaNode>
  patternProperties?: Record<string, SchemaNode>
  additionalProperties?: SchemaNode | boolean
  required?: string[]
  items?: SchemaNode
  prefixItems?: SchemaNode[]
  contains?: SchemaNode
  allOf?: SchemaNode[]
  anyOf?: SchemaNode[]
  oneOf?: SchemaNode[]
  not?: SchemaNode
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  minProperties?: number
  maxProperties?: number
  [keyword: string]: unknown
}

/** One `$ref` occurrence inside a document, located by JSON Pointer. */
export interface RefSite {
  /** RFC 6901 pointer from the document root, `''` for the root itself. */
  pointer: string
  ref: string
  /** True for a root-level `allOf` branch — the only inheritance edge there is. */
  inheritance: boolean
}

export interface SchemaMeta {
  /**
   * Canonical registry key: the schema's catalog-relative file path, e.g.
   * `acme/datamodel/money/schema.json`. It is both the document's identity and
   * the base its own `$ref`s resolve against — and, being a path, it doubles as
   * the `path` of every diagnostic raised against the document.
   */
  id: string
  /** Unversioned SRN of the owning entity, derived from the path (SRN ≡ path). */
  srn: string
  version: number | null
  title: string
  abstract: boolean
  usage: string | null
}

export interface SchemaEntry extends SchemaMeta {
  summary: string | null
  document: SchemaNode
  /** Verbatim file text, so the raw view shows what the author actually wrote. */
  raw: string
  refs: RefSite[]
}

export type RefKind = 'entity' | 'local'

export interface RefResolution {
  /** The `$ref` exactly as authored. */
  ref: string
  kind: RefKind
  /** Path of the document the ref lands in; null when unresolvable. */
  targetId: string | null
  /** Unversioned SRN of the target entity — the navigation target. */
  targetSrn: string | null
  /**
   * Version the ref currently resolves to. A `$ref` carries no pin any more
   * (decision-record 2026-08-19-b): pinning lives in frontmatter `relations`.
   */
  version: number | null
  /** JSON Pointer inside the target document, `''` for the whole document. */
  pointer: string
  /** Key into {@link SchemaBundle.documents} for the node this ref lands on. */
  targetKey: string | null
  title: string | null
  abstract: boolean
  error: { code: string; message: string } | null
}

export interface InheritanceEdge {
  /** Derived model, by canonical id. */
  child: string
  /** Base model, by canonical id; null when the ref could not be resolved. */
  base: string | null
  ref: string
}

export interface InheritanceGraph {
  edges: InheritanceEdge[]
  /** child id → base ids, in document order. */
  bases: Map<string, string[]>
  /** base id → derived ids. */
  derived: Map<string, string[]>
  /** Ids on a root-`allOf` cycle (E_DM_INHERIT_CYCLE). */
  cyclic: Set<string>
}

export interface SchemaRegistry {
  /** The ajv instance every schema is registered in; validation is stock. */
  ajv: Ajv2020
  /** Canonical id → entry. */
  entries: Map<string, SchemaEntry>
  /** Every lookup key — file path, entity SRN, versioned SRN — → canonical id. */
  index: Map<string, string>
  /** doc id → (`$ref` as authored → resolution). */
  resolutions: Map<string, Map<string, RefResolution>>
  inheritance: InheritanceGraph
  diagnostics: Diagnostic[]
}

/* -------------------------------------------------------------------------- */
/* Building                                                                    */
/* -------------------------------------------------------------------------- */

export function buildSchemaRegistry(catalog: Catalog): SchemaRegistry {
  const ajv = new Ajv2020({
    strict: false,
    allErrors: true,
    // datamodel.md: `format` is annotation-only, so adding one can never reject
    // an instance that validated before. Asserting formats would break that.
    validateFormats: false,
    allowUnionTypes: true,
  })

  const entries = new Map<string, SchemaEntry>()
  const index = new Map<string, string>()
  const diagnostics: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'datamodel') continue
    const entry = readEntry(entity, ajv, diagnostics)
    if (!entry) continue

    entries.set(entry.id, entry)
    index.set(entry.id, entry.id)
    // SRN aliases: the portal navigates by entity, and a frontmatter relation
    // may carry a pin, so both SRN forms must find the current document.
    index.set(entry.srn, entry.id)
    if (entry.version !== null) index.set(`${entry.srn}@${entry.version}`, entry.id)

    try {
      ajv.addSchema(entry.document, ajvKey(entry.id), false, false)
    } catch (error) {
      diagnostics.push({
        code: 'E_DM_SCHEMA_INVALID',
        severity: 'error',
        message: `ajv rejected the document: ${message(error)}`,
        path: entry.id,
        srn: entry.srn,
      })
    }
  }

  const resolutions = resolveAllRefs(entries, diagnostics)
  const inheritance = buildInheritanceGraph(entries, resolutions, diagnostics)

  return { ajv, entries, index, resolutions, inheritance, diagnostics }
}

function readEntry(entity: Entity, ajv: Ajv2020, diagnostics: Diagnostic[]): SchemaEntry | null {
  const artifact = entity.artifacts.find((candidate) => candidate.file === SCHEMA_ARTIFACT)
  const id = `${entity.relDir}/${SCHEMA_ARTIFACT}`

  if (!artifact) {
    diagnostics.push({
      code: 'E_DM_SCHEMA_MISSING',
      severity: 'error',
      message: 'datamodel entity has no schema.json — a datamodel with no schema is prose',
      path: entity.relDir,
      srn: entity.srn,
    })
    return null
  }

  if (!isNode(artifact.data)) {
    diagnostics.push({
      code: 'E_DM_SCHEMA_INVALID',
      severity: 'error',
      message: 'schema.json is not a JSON object',
      path: id,
      srn: entity.srn,
    })
    return null
  }

  const document = artifact.data

  const dialect = typeof document.$schema === 'string' ? document.$schema : null
  if (dialect !== DIALECT_2020_12) {
    diagnostics.push({
      code: 'E_DM_DIALECT',
      severity: 'error',
      message: dialect
        ? `$schema is "${dialect}", not the 2020-12 dialect`
        : '$schema is missing — the dialect must be declared',
      path: id,
      srn: entity.srn,
    })
  }

  // Only meta-validate against a dialect ajv actually holds; an unknown $schema
  // makes ajv throw, and E_DM_DIALECT already reports that case.
  if (dialect === null || dialect === DIALECT_2020_12) {
    try {
      if (!ajv.validateSchema(document, false)) {
        for (const error of ajv.errors ?? []) {
          diagnostics.push({
            code: 'E_DM_SCHEMA_INVALID',
            severity: 'error',
            message: `${error.instancePath || '(root)'}: ${error.message ?? 'invalid'}`,
            path: id,
            srn: entity.srn,
          })
        }
      }
    } catch (error) {
      diagnostics.push({
        code: 'E_DM_SCHEMA_INVALID',
        severity: 'error',
        message: message(error),
        path: id,
        srn: entity.srn,
      })
    }
  }

  for (const keyword of forbiddenKeywordsIn(document)) {
    diagnostics.push({
      code: 'E_DM_KEYWORD',
      severity: 'error',
      message: `forbidden keyword "${keyword}" — inheritance is allOf + $ref, and local shapes are addressed by #/$defs pointers`,
      path: id,
      srn: entity.srn,
    })
  }

  // A nested `$id` re-bases every relative `$ref` under it, so the rule is the
  // same at any depth as it is at the root.
  for (const pointer of idSitesIn(document)) {
    diagnostics.push({
      code: 'E_DM_ID_FORBIDDEN',
      severity: 'error',
      message: `${pointer || '(root)'}: $id must be omitted — a relative $ref resolves against it, which is exactly what stops stock tooling from finding "../money/schema.json"`,
      path: id,
      srn: entity.srn,
    })
  }

  // entity.srn is the entity directory turned into an SRN, so comparing against
  // it *is* comparing the annotation against the file's actual path.
  const provenance = document[SRN_ANNOTATION]
  if (provenance !== undefined && provenance !== entity.srn) {
    diagnostics.push({
      code: 'E_DM_SRN_MISMATCH',
      severity: 'error',
      message: `${SRN_ANNOTATION} is ${JSON.stringify(provenance)} but the file's path is ${entity.srn}`,
      path: id,
      srn: entity.srn,
    })
  }

  return {
    id,
    srn: entity.srn,
    version: entity.frontmatter.version,
    title: entity.frontmatter.title,
    summary: entity.frontmatter.summary ?? null,
    abstract: entity.frontmatter.abstract === true,
    usage: typeof entity.frontmatter.usage === 'string' ? entity.frontmatter.usage : null,
    document,
    raw: artifact.raw,
    refs: collectRefSites(document),
  }
}

/* -------------------------------------------------------------------------- */
/* Reference resolution                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a `$ref` exactly as a stock validator does: relative-path arithmetic
 * from the directory of the referring file. Returns the target's
 * catalog-relative path, or the diagnostic that stops it.
 */
function resolveRefPath(fromId: string, ref: string): { path: string } | { code: string; message: string } {
  if (ref.includes('://') || ref.startsWith('/')) {
    return {
      code: 'E_DM_REF_TARGET',
      message: `"${ref}" is not a relative file path — a cross-entity $ref is a path to another entity's ${SCHEMA_ARTIFACT}, e.g. "../money/${SCHEMA_ARTIFACT}"`,
    }
  }

  const from = fromId.split('/')
  const segments = from.slice(0, -1)

  for (const segment of ref.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) {
        return { code: 'E_DM_REF_ESCAPE', message: `"${ref}" climbs above the catalog root` }
      }
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  if (segments.length < 2 || segments[segments.length - 1] !== SCHEMA_ARTIFACT) {
    return {
      code: 'E_DM_REF_TARGET',
      message: `"${ref}" does not name a ${SCHEMA_ARTIFACT} — schemas are addressed by file, not by directory`,
    }
  }

  if (segments[0] !== from[0]) {
    return {
      code: 'E_SRN_CROSS_SOLUTION',
      message: `"${ref}" leaves solution "${from[0]}" for "${segments[0]}" — solutions are sealed universes`,
    }
  }

  return { path: segments.join('/') }
}

/** Owning entity of a schema file. SRN ≡ path, so the directory is the SRN. */
function srnOfSchemaPath(schemaPath: string): string | null {
  try {
    const dir = schemaPath.split('/').slice(0, -1).join('/')
    return formatSrn({ ...dirToSrn(dir), version: null })
  } catch {
    // The path is inside the catalog but is not a legal entity address; the
    // dangling-ref diagnostic still names the path, which is what an author needs.
    return null
  }
}

function resolveAllRefs(
  entries: Map<string, SchemaEntry>,
  diagnostics: Diagnostic[],
): Map<string, Map<string, RefResolution>> {
  const resolutions = new Map<string, Map<string, RefResolution>>()

  for (const entry of entries.values()) {
    const perDocument = new Map<string, RefResolution>()
    resolutions.set(entry.id, perDocument)

    for (const site of entry.refs) {
      if (perDocument.has(site.ref)) continue
      const resolution = resolveOne(entry, site.ref, entries)
      perDocument.set(site.ref, resolution)

      if (!resolution.error) continue
      diagnostics.push({
        code: resolution.error.code,
        severity: 'error',
        message: `${site.pointer || '(root)'}: ${resolution.error.message}`,
        path: entry.id,
        srn: entry.srn,
      })
    }
  }

  return resolutions
}

function resolveOne(entry: SchemaEntry, ref: string, entries: Map<string, SchemaEntry>): RefResolution {
  const base: RefResolution = {
    ref,
    kind: 'entity',
    targetId: null,
    targetSrn: null,
    version: null,
    pointer: '',
    targetKey: null,
    title: null,
    abstract: false,
    error: null,
  }

  const hash = ref.indexOf('#')
  const body = hash === -1 ? ref : ref.slice(0, hash)
  const fragment = hash === -1 ? '' : ref.slice(hash + 1)

  if (body === '') {
    // Local JSON Pointer into this document's own $defs — entity-private scratch,
    // and the one ref form that stock editors can already navigate.
    const node = nodeAtPointer(entry.document, fragment)
    if (!node) {
      return {
        ...base,
        kind: 'local',
        error: { code: 'E_SRN_DANGLING', message: `"${ref}" points at nothing in this document` },
      }
    }
    return {
      ...base,
      kind: 'local',
      targetId: entry.id,
      targetSrn: entry.srn,
      pointer: fragment,
      targetKey: nodeKey(entry.id, fragment),
      title: typeof node.title === 'string' ? node.title : null,
    }
  }

  if (fragment !== '') {
    // $defs is entity-private: the moment a shape is shared it becomes an entity.
    return {
      ...base,
      error: { code: 'E_DM_FOREIGN_DEFS', message: `"${ref}" points into another entity's $defs` },
    }
  }

  const resolved = resolveRefPath(entry.id, body)
  if ('code' in resolved) return { ...base, error: resolved }

  const target = entries.get(resolved.path)
  if (!target) {
    const targetSrn = srnOfSchemaPath(resolved.path)
    return {
      ...base,
      targetSrn,
      error: {
        code: 'E_SRN_DANGLING',
        message: `"${ref}" resolves to ${resolved.path}, which is not a datamodel schema in the catalog`,
      },
    }
  }

  return {
    ...base,
    targetId: target.id,
    targetSrn: target.srn,
    version: target.version,
    targetKey: target.id,
    title: target.title,
    abstract: target.abstract,
  }
}

/* -------------------------------------------------------------------------- */
/* Inheritance graph                                                           */
/* -------------------------------------------------------------------------- */

function buildInheritanceGraph(
  entries: Map<string, SchemaEntry>,
  resolutions: Map<string, Map<string, RefResolution>>,
  diagnostics: Diagnostic[],
): InheritanceGraph {
  const edges: InheritanceEdge[] = []
  const bases = new Map<string, string[]>()
  const derived = new Map<string, string[]>()

  for (const entry of entries.values()) {
    bases.set(entry.id, [])
    for (const site of entry.refs) {
      if (!site.inheritance) continue
      const resolution = resolutions.get(entry.id)?.get(site.ref)
      const baseId = resolution?.targetId ?? null
      edges.push({ child: entry.id, base: baseId, ref: site.ref })
      if (!baseId || baseId === entry.id) continue
      bases.get(entry.id)?.push(baseId)
      derived.set(baseId, [...(derived.get(baseId) ?? []), entry.id])
    }
  }

  const cyclic = findCycles(bases)
  for (const id of cyclic) {
    const entry = entries.get(id)
    if (!entry) continue
    diagnostics.push({
      code: 'E_DM_INHERIT_CYCLE',
      severity: 'error',
      message: 'root-allOf inheritance cycle — the conjunction cannot be flattened or drawn as a tree',
      path: entry.id,
      srn: entry.srn,
    })
  }

  // A closed base rejects every property its descendants add, because allOf
  // branches are evaluated independently — the classic composition trap.
  for (const [baseId, children] of derived) {
    const entry = entries.get(baseId)
    if (!entry || children.length === 0) continue
    if (entry.document.additionalProperties === false) {
      diagnostics.push({
        code: 'E_DM_CLOSED_BASE',
        severity: 'error',
        message: `"additionalProperties": false on a schema used as an allOf base by ${children.length} model(s)`,
        path: entry.id,
        srn: entry.srn,
      })
    }
  }

  return { edges, bases, derived, cyclic }
}

/** Iterative three-colour DFS; a self-loop counts, and nothing recurses forever. */
function findCycles(bases: Map<string, string[]>): Set<string> {
  const OPEN = 1
  const DONE = 2
  const state = new Map<string, number>()
  const stack: string[] = []
  const cyclic = new Set<string>()

  const visit = (id: string): void => {
    if (state.get(id) === DONE) return
    if (state.get(id) === OPEN) {
      for (const member of stack.slice(stack.lastIndexOf(id))) cyclic.add(member)
      return
    }
    state.set(id, OPEN)
    stack.push(id)
    for (const base of bases.get(id) ?? []) visit(base)
    stack.pop()
    state.set(id, DONE)
  }

  for (const id of bases.keys()) visit(id)
  return cyclic
}

/* -------------------------------------------------------------------------- */
/* Lookup                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a schema by file path or by entity SRN (versioned or not); a relative
 * file path resolves against `base`, which may itself be either form. Returns
 * null rather than throwing: a dangling reference is a diagnostic, not a crash,
 * and the portal still has to render the page.
 */
export function resolveSchema(registry: SchemaRegistry, ref: string, base?: string): SchemaEntry | null {
  const direct = registry.index.get(ref)
  if (direct) return registry.entries.get(direct) ?? null

  if (!base) return null
  const from = registry.index.get(base)
  if (!from) return null

  const resolved = resolveRefPath(from, ref)
  if ('code' in resolved) return null
  const canonical = registry.index.get(resolved.path)
  return canonical ? (registry.entries.get(canonical) ?? null) : null
}

/**
 * The compiled validator, straight from ajv. Nothing framework-specific happens
 * at validation time — that is the payoff of keying the registry the same way
 * the filesystem does. Returns null when the schema cannot be compiled (an
 * unresolvable `$ref`).
 */
export function schemaValidator(registry: SchemaRegistry, ref: string): ValidateFunction | null {
  const entry = resolveSchema(registry, ref)
  if (!entry) return null
  try {
    return (registry.ajv.getSchema(ajvKey(entry.id)) as ValidateFunction | undefined) ?? null
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Effective (flattened) fields                                                */
/* -------------------------------------------------------------------------- */

export interface PropertyContribution {
  /** Canonical id of the schema that contributed this subschema. */
  origin: string
  /** Unversioned SRN of the contributing entity, for navigation. */
  originSrn: string
  originTitle: string
  /** True when the contributor is the model itself rather than an ancestor. */
  own: boolean
  /** Inheritance depth of the contributor; 0 is the model itself. */
  depth: number
  /** JSON Pointer of this subschema inside `origin` — the base for its own refs. */
  pointer: string
  schema: SchemaNode
}

export interface EffectiveProperty {
  name: string
  /** Every (origin, subschema) pair, nearest first. */
  contributions: PropertyContribution[]
  required: boolean
  /** Canonical ids whose `required` array lists this name. */
  requiredBy: string[]
  /** Contributed more than once — a derived model restricting an inherited shape. */
  restricted: boolean
  /** Origin of the nearest contribution; the row's provenance chip. */
  origin: string
  own: boolean
  /** Disjoint `type` sets across contributions — can never validate. */
  contradiction: boolean
  deprecated: boolean
  description: string | null
}

export type LineageStatus = 'ok' | 'repeated' | 'cyclic' | 'unresolved'

export interface LineageNode {
  /** Canonical id when resolved, otherwise the authored ref (so it still renders). */
  id: string
  srn: string | null
  version: number | null
  title: string
  abstract: boolean
  /** 0 is the model itself; each root-`allOf` hop adds one. */
  depth: number
  /** The `$ref` as authored on the deriving schema; null for the model itself. */
  ref: string | null
  status: LineageStatus
  error: { code: string; message: string } | null
  /** How many property names this schema contributes to the conjunction. */
  contributes: number
}

export interface EffectiveModel {
  id: string
  srn: string
  properties: EffectiveProperty[]
  /** Union of every `required` array across every branch. */
  required: string[]
  lineage: LineageNode[]
  /** `additionalProperties: false` somewhere in the conjunction. */
  closed: boolean
  diagnostics: Diagnostic[]
}

/**
 * Flatten the root `allOf` conjunction into one field table.
 *
 * This is a *presentation of the conjunction*, not an override chain: `allOf`
 * intersects, so a derived model never replaces a base constraint, it adds to
 * it. Rows are ordered own-first, then by ancestor in expansion order — the
 * question a reader opens the page with is "what does this model add?".
 */
export function effectiveModel(registry: SchemaRegistry, ref: string): EffectiveModel | null {
  const root = resolveSchema(registry, ref)
  if (!root) return null

  const contributions = new Map<string, PropertyContribution[]>()
  const requiredBy = new Map<string, string[]>()
  const lineage: LineageNode[] = []
  const diagnostics: Diagnostic[] = []
  const visited = new Set<string>([root.id])
  const contributed = new Map<string, number>()
  let closed = false

  const absorb = (node: SchemaNode, origin: SchemaEntry, depth: number, basePointer: string): void => {
    if (node.additionalProperties === false) closed = true
    for (const [name, subschema] of Object.entries(node.properties ?? {})) {
      if (!isNode(subschema)) continue
      const list = contributions.get(name) ?? []
      list.push({
        origin: origin.id,
        originSrn: origin.srn,
        originTitle: origin.title,
        own: origin.id === root.id,
        depth,
        pointer: `${basePointer}/properties/${escapeToken(name)}`,
        schema: subschema,
      })
      contributions.set(name, list)
      contributed.set(origin.id, (contributed.get(origin.id) ?? 0) + 1)
    }
    for (const name of node.required ?? []) {
      const list = requiredBy.get(name) ?? []
      if (!list.includes(origin.id)) list.push(origin.id)
      requiredBy.set(name, list)
    }
  }

  const expandBranches = (
    node: SchemaNode,
    origin: SchemaEntry,
    depth: number,
    path: string[],
    basePointer: string,
  ): void => {
    ;(node.allOf ?? []).forEach((branch, position) => {
      if (!isNode(branch)) return
      const branchPointer = `${basePointer}/allOf/${position}`
      if (typeof branch.$ref === 'string') {
        follow(branch.$ref, origin, depth + 1, path)
        return
      }
      // An inline root branch is part of the containing document's own shape.
      absorb(branch, origin, depth, branchPointer)
      expandBranches(branch, origin, depth, path, branchPointer)
    })
  }

  const follow = (refString: string, from: SchemaEntry, depth: number, path: string[]): void => {
    const resolution = registry.resolutions.get(from.id)?.get(refString)

    if (!resolution || resolution.error) {
      const error = resolution?.error ?? { code: 'E_SRN_DANGLING', message: `"${refString}" could not be resolved` }
      lineage.push({
        id: refString,
        srn: resolution?.targetSrn ?? null,
        version: resolution?.version ?? null,
        title: refString,
        abstract: false,
        depth,
        ref: refString,
        status: 'unresolved',
        error,
        contributes: 0,
      })
      diagnostics.push({
        code: error.code,
        severity: 'error',
        message: `inherited base "${refString}" is unresolvable: ${error.message}`,
        path: from.id,
        srn: from.srn,
      })
      return
    }

    if (resolution.kind === 'local') {
      // A root branch pointing at own $defs: still this document's own shape.
      const node = nodeAtPointer(from.document, resolution.pointer)
      if (node) {
        absorb(node, from, depth - 1, resolution.pointer)
        expandBranches(node, from, depth - 1, path, resolution.pointer)
      }
      return
    }

    const targetId = resolution.targetId as string
    const target = registry.entries.get(targetId)
    if (!target) return

    if (path.includes(targetId)) {
      lineage.push({
        id: targetId,
        srn: target.srn,
        version: target.version,
        title: target.title,
        abstract: target.abstract,
        depth,
        ref: refString,
        status: 'cyclic',
        error: null,
        contributes: 0,
      })
      return
    }

    if (visited.has(targetId)) {
      // Diamond inheritance: the conjunction already holds this contribution.
      lineage.push({
        id: targetId,
        srn: target.srn,
        version: target.version,
        title: target.title,
        abstract: target.abstract,
        depth,
        ref: refString,
        status: 'repeated',
        error: null,
        contributes: 0,
      })
      return
    }

    visited.add(targetId)
    const node: LineageNode = {
      id: targetId,
      srn: target.srn,
      version: target.version,
      title: target.title,
      abstract: target.abstract,
      depth,
      ref: refString,
      status: 'ok',
      error: null,
      contributes: 0,
    }
    lineage.push(node)
    absorb(target.document, target, depth, '')
    expandBranches(target.document, target, depth, [...path, targetId], '')
    node.contributes = contributed.get(targetId) ?? 0
  }

  const self: LineageNode = {
    id: root.id,
    srn: root.srn,
    version: root.version,
    title: root.title,
    abstract: root.abstract,
    depth: 0,
    ref: null,
    status: 'ok',
    error: null,
    contributes: 0,
  }
  lineage.push(self)
  absorb(root.document, root, 0, '')
  expandBranches(root.document, root, 0, [root.id], '')
  self.contributes = contributed.get(root.id) ?? 0

  const names = [...contributions.keys()]
  for (const name of requiredBy.keys()) if (!names.includes(name)) names.push(name)

  const properties: EffectiveProperty[] = names.map((name) => {
    const list = contributions.get(name) ?? []
    const owners = requiredBy.get(name) ?? []
    const nearest = list[0]
    const contradiction = hasDisjointTypes(list)

    if (contradiction) {
      diagnostics.push({
        code: 'W_DM_CONTRADICTION',
        severity: 'warning',
        message: `"${name}" is constrained to disjoint types by ${list.length} schemas — no instance can satisfy the conjunction`,
        path: root.id,
        srn: root.srn,
      })
    }

    return {
      name,
      contributions: list,
      required: owners.length > 0,
      requiredBy: owners,
      restricted: list.length > 1,
      origin: nearest?.origin ?? root.id,
      own: nearest ? nearest.own : false,
      contradiction,
      deprecated: list.some((contribution) => contribution.schema.deprecated === true),
      description:
        list.find((contribution) => typeof contribution.schema.description === 'string')?.schema.description ?? null,
    }
  })

  return {
    id: root.id,
    srn: root.srn,
    properties,
    required: [...requiredBy.keys()].sort(),
    lineage,
    closed,
    diagnostics,
  }
}

/** Only the decidable case: disjoint `type` sets can never validate (W_DM_CONTRADICTION). */
function hasDisjointTypes(contributions: PropertyContribution[]): boolean {
  let intersection: string[] | null = null
  for (const contribution of contributions) {
    const declared = contribution.schema.type
    if (declared === undefined) continue
    const types: string[] = Array.isArray(declared) ? declared : [declared]
    intersection = intersection === null ? types : intersection.filter((type) => types.includes(type))
  }
  return intersection !== null && intersection.length === 0
}

/* -------------------------------------------------------------------------- */
/* Discriminated unions                                                        */
/* -------------------------------------------------------------------------- */

export interface UnionVariant {
  /** Canonical id when the branch is a `$ref`; null for an inline branch. */
  id: string | null
  srn: string | null
  ref: string | null
  title: string
  /** The tag's `const` value; null when the branch carries no derivable tag. */
  tag: unknown
  /** Key into {@link SchemaBundle.documents} for the branch body. */
  key: string | null
  /** Base document id the branch's own `$ref`s resolve against. */
  docId: string
  /** Pointer of the branch inside `docId`. */
  pointer: string
  abstract: boolean
  error: { code: string; message: string } | null
}

export interface DiscriminatedUnion {
  /** The shared `const` property name; null when no tag could be derived. */
  tag: string | null
  variants: UnionVariant[]
  /** False → rendered as an opaque oneOf and reported as W_DM_UNION_TAG. */
  derivable: boolean
}

/* -------------------------------------------------------------------------- */
/* Client bundle                                                               */
/* -------------------------------------------------------------------------- */

/** Key of one node in {@link SchemaBundle.documents}. */
export function nodeKey(docId: string, pointer: string): string {
  return pointer ? `${docId}#${pointer}` : docId
}

export interface SchemaBundle {
  id: string
  srn: string
  version: number | null
  title: string
  summary: string | null
  abstract: boolean
  usage: string | null
  /** Verbatim `schema.json` text. */
  raw: string
  /** Node key → schema node; the root document plus every reachable target. */
  documents: Record<string, SchemaNode>
  /** Canonical id → identity of the owning entity. */
  meta: Record<string, SchemaMeta>
  /** doc id → (`$ref` as authored → resolution). */
  refs: Record<string, Record<string, RefResolution>>
  /** Node key → derived union, for every node carrying `oneOf`. */
  unions: Record<string, DiscriminatedUnion>
  /**
   * Canonical id → its own flattened property list. A nested `$ref` into a
   * derived model must expand to that model's *effective* fields, so every
   * reachable document is flattened here, not only the root.
   */
  flat: Record<string, EffectiveProperty[]>
  effective: EffectiveModel
  /** Models whose root `allOf` extends this one. */
  descendants: SchemaMeta[]
  diagnostics: Diagnostic[]
}

/**
 * Project the registry into the plain, serialisable slice one datamodel page
 * needs. Everything the explorer must follow — refs, union tags, ancestor
 * documents — is precomputed here, so the client component neither resolves
 * paths nor imports ajv.
 */
export function buildSchemaBundle(registry: SchemaRegistry, ref: string): SchemaBundle | null {
  const root = resolveSchema(registry, ref)
  if (!root) return null

  const effective = effectiveModel(registry, root.id) as EffectiveModel
  const documents: Record<string, SchemaNode> = {}
  const meta: Record<string, SchemaMeta> = {}
  const refs: Record<string, Record<string, RefResolution>> = {}
  const unions: Record<string, DiscriminatedUnion> = {}
  const flat: Record<string, EffectiveProperty[]> = { [root.id]: effective.properties }

  const queue: string[] = [root.id]
  const seen = new Set<string>()

  while (queue.length > 0) {
    const id = queue.shift() as string
    if (seen.has(id)) continue
    seen.add(id)

    const entry = registry.entries.get(id)
    if (!entry) continue

    documents[id] = entry.document
    meta[id] = {
      id: entry.id,
      srn: entry.srn,
      version: entry.version,
      title: entry.title,
      abstract: entry.abstract,
      usage: entry.usage,
    }
    flat[id] ??= effectiveModel(registry, id)?.properties ?? []

    const perDocument = registry.resolutions.get(id)
    const plain: Record<string, RefResolution> = {}
    for (const [refString, resolution] of perDocument ?? []) {
      plain[refString] = resolution
      if (resolution.kind === 'local' && resolution.targetKey) {
        const node = nodeAtPointer(entry.document, resolution.pointer)
        if (node) documents[resolution.targetKey] = node
      }
      if (resolution.targetId && !seen.has(resolution.targetId)) queue.push(resolution.targetId)
    }
    refs[id] = plain

    for (const [pointer, node] of walkNodes(entry.document)) {
      if (!Array.isArray(node.oneOf)) continue
      const union = deriveUnion(registry, entry, pointer, node)
      unions[nodeKey(id, pointer)] = union
      for (const variant of union.variants) {
        // An inline branch is its own document's shape, reachable only by pointer.
        if (!variant.key || !variant.pointer || variant.docId !== id) continue
        const branch = nodeAtPointer(entry.document, variant.pointer)
        if (branch) documents[variant.key] = branch
      }
    }
  }

  const descendants = (registry.inheritance.derived.get(root.id) ?? [])
    .map((id) => meta[id] ?? metaOf(registry, id))
    .filter((candidate): candidate is SchemaMeta => candidate !== null)

  const diagnostics = [
    ...registry.diagnostics.filter((diagnostic) => diagnostic.srn === root.srn),
    ...effective.diagnostics,
  ]

  for (const [key, union] of Object.entries(unions)) {
    if (union.derivable) continue
    diagnostics.push({
      code: 'W_DM_UNION_TAG',
      severity: 'warning',
      message: `oneOf at ${key} has no shared const tag — rendered as an opaque union`,
      path: root.id,
      srn: root.srn,
    })
  }

  return {
    id: root.id,
    srn: root.srn,
    version: root.version,
    title: root.title,
    summary: root.summary,
    abstract: root.abstract,
    usage: root.usage,
    raw: root.raw,
    documents,
    meta,
    refs,
    unions,
    flat,
    effective,
    descendants,
    diagnostics,
  }
}

function metaOf(registry: SchemaRegistry, id: string): SchemaMeta | null {
  const entry = registry.entries.get(id)
  if (!entry) return null
  return {
    id: entry.id,
    srn: entry.srn,
    version: entry.version,
    title: entry.title,
    abstract: entry.abstract,
    usage: entry.usage,
  }
}

/**
 * Derive a variant map from a `oneOf`. The spec's conditions are all four
 * required: object branches, the same tag property in every branch, distinct
 * `const` values, and the tag in each branch's `required`. Anything else is
 * still valid JSON Schema — it just cannot be drawn as a switcher.
 */
function deriveUnion(
  registry: SchemaRegistry,
  entry: SchemaEntry,
  pointer: string,
  node: SchemaNode,
): DiscriminatedUnion {
  interface Branch {
    variant: UnionVariant
    properties: Map<string, SchemaNode>
    required: Set<string>
  }

  const branches: Branch[] = []

  ;(node.oneOf ?? []).forEach((raw, position) => {
    const branchPointer = `${pointer}/oneOf/${position}`
    if (!isNode(raw)) return

    if (typeof raw.$ref === 'string') {
      const resolution = registry.resolutions.get(entry.id)?.get(raw.$ref)
      const target = resolution?.targetId ? registry.entries.get(resolution.targetId) : null
      if (!target) {
        branches.push({
          variant: {
            id: null,
            srn: resolution?.targetSrn ?? null,
            ref: raw.$ref,
            title: raw.$ref,
            tag: null,
            key: null,
            docId: entry.id,
            pointer: branchPointer,
            abstract: false,
            error: resolution?.error ?? { code: 'E_SRN_DANGLING', message: `"${raw.$ref}" could not be resolved` },
          },
          properties: new Map(),
          required: new Set(),
        })
        return
      }
      // A branch may inherit its tag from a base, so flatten before looking.
      const flattened = effectiveModel(registry, target.id)
      const properties = new Map<string, SchemaNode>()
      for (const property of flattened?.properties ?? []) {
        const nearest = property.contributions[0]
        if (nearest) properties.set(property.name, nearest.schema)
      }
      branches.push({
        variant: {
          id: target.id,
          srn: target.srn,
          ref: raw.$ref,
          title: target.title,
          tag: null,
          key: target.id,
          docId: target.id,
          pointer: '',
          abstract: target.abstract,
          error: null,
        },
        properties,
        required: new Set(flattened?.required ?? []),
      })
      return
    }

    const properties = new Map<string, SchemaNode>()
    for (const [name, subschema] of Object.entries(raw.properties ?? {})) {
      if (isNode(subschema)) properties.set(name, subschema)
    }
    branches.push({
      variant: {
        id: null,
        srn: null,
        ref: null,
        title: typeof raw.title === 'string' ? raw.title : `variant ${position + 1}`,
        tag: null,
        key: nodeKey(entry.id, branchPointer),
        docId: entry.id,
        pointer: branchPointer,
        abstract: false,
        error: null,
      },
      properties,
      required: new Set(raw.required ?? []),
    })
  })

  const candidates = [...(branches[0]?.properties.keys() ?? [])].filter((name) =>
    branches.every(
      (branch) =>
        branch.required.has(name) && branch.properties.get(name)?.const !== undefined && branch.variant.error === null,
    ),
  )

  const tag =
    candidates.find((name) => {
      const values = branches.map((branch) => JSON.stringify(branch.properties.get(name)?.const))
      return new Set(values).size === branches.length
    }) ?? null

  const variants = branches.map((branch) => ({
    ...branch.variant,
    tag: tag ? branch.properties.get(tag)?.const : null,
  }))

  return { tag, variants, derivable: tag !== null && branches.length > 0 }
}

/* -------------------------------------------------------------------------- */
/* Traversal helpers                                                           */
/* -------------------------------------------------------------------------- */

export function isNode(value: unknown): value is SchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** RFC 6901 escaping — property names are kebab-case by convention, not by rule. */
function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

function nodeAtPointer(document: SchemaNode, pointer: string): SchemaNode | null {
  if (pointer === '' || pointer === '/') return document
  let node: unknown = document
  for (const raw of pointer.split('/').slice(1)) {
    const token = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (node === null || typeof node !== 'object') return null
    node = (node as Record<string, unknown>)[token]
  }
  return isNode(node) ? node : null
}

/** Every schema-shaped object in a document, with its JSON Pointer. */
function* walkNodes(document: SchemaNode, pointer = ''): Generator<[string, SchemaNode]> {
  yield [pointer, document]
  for (const [key, value] of Object.entries(document)) {
    if (key === 'const' || key === 'enum' || key === 'default' || key === 'examples') continue
    const childPointer = `${pointer}/${escapeToken(key)}`
    if (Array.isArray(value)) {
      for (const [position, item] of value.entries()) {
        if (isNode(item)) yield* walkNodes(item, `${childPointer}/${position}`)
      }
      continue
    }
    if (isNode(value)) yield* walkNodes(value, childPointer)
  }
}

function collectRefSites(document: SchemaNode): RefSite[] {
  const sites: RefSite[] = []
  for (const [pointer, node] of walkNodes(document)) {
    if (typeof node.$ref !== 'string') continue
    sites.push({ pointer, ref: node.$ref, inheritance: /^\/allOf\/\d+$/.test(pointer) })
  }
  return sites
}

function forbiddenKeywordsIn(document: SchemaNode): string[] {
  const found = new Set<string>()
  for (const [, node] of walkNodes(document)) {
    for (const keyword of FORBIDDEN_KEYWORDS) {
      if (keyword in node) found.add(keyword)
    }
  }
  return [...found]
}

function idSitesIn(document: SchemaNode): string[] {
  const pointers: string[] = []
  for (const [pointer, node] of walkNodes(document)) {
    if (typeof node.$id === 'string') pointers.push(pointer)
  }
  return pointers
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
