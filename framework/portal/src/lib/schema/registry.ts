/**
 * The datamodel schema registry — framework/spec/kinds/datamodel.md.
 *
 * A `schema.json` states its identity twice, in two spellings of one derived
 * fact:
 *
 *     "$id":   "https://schemas.metaframework.dev/acme/datamodel/money"
 *     "x-srn": "srn://acme/datamodel/money"
 *
 * and every cross-entity `$ref` is the canonical schema URL of its target.
 *
 * That is not decoration. The retired form — no `$id`, relative-path `$ref` —
 * was *well-formed* for stock tooling but only ever resolvable by a tool sitting
 * in a clone of this repository. A canonical URL is **dereferenceable**: any
 * validator or generator, on any machine, can follow it once the host resolves
 * (decision-record 2026-08-19-c). `lib/schema/url.ts` owns the canonical host —
 * it is a stable constant, never `SCHEMA_BASE_URL`, which says only where *this*
 * portal serves schemas from (`src/app/schemas/[...path]/route.ts`). Identity
 * must not vary between a laptop and production.
 *
 * `x-srn` is required alongside it. Without it the SRN vanishes from schema
 * files entirely and identity becomes implicit in a URL-parsing rule; a schema
 * lifted out of the catalog must still say where it came from, in the
 * framework's own vocabulary. Both fields are *derived and checked* against the
 * file's own directory, so they cannot drift from each other or from the path.
 *
 * The portal's graph is still a graph of SRNs. A URL is mapped back to its
 * owning entity through SRN ≡ path ≡ URL path — via lib/schema/url, never by
 * hand.
 *
 * ajv holds every document under its own `$id`, so validation resolves each
 * `$ref` out of the in-memory registry with stock RFC 3986 rules, no custom
 * resolver, and — importantly — **no network access at build or render time**.
 * The URLs are dereferenceable for outsiders; the portal never dereferences
 * them, because it already has the files.
 *
 * The module is server-side: it is built from a loaded Catalog and hands
 * client components a plain serialisable {@link SchemaBundle}. Client code must
 * import only *types* from here, or ajv lands in the browser bundle.
 */

import { Ajv2020 } from 'ajv/dist/2020'
import type { ValidateFunction } from 'ajv'
import type { Catalog, Diagnostic, Entity } from '../catalog/types'
import {
  CANONICAL_SCHEMA_HOST,
  isSchemaServingUrl,
  schemaUrlToPath,
  schemaUrlToSrn,
  srnToSchemaUrl,
} from './url'

export const DIALECT_2020_12 = 'https://json-schema.org/draft/2020-12/schema'

/** The bare filename is fixed by the kind spec; never prefixed with the entity name. */
export const SCHEMA_ARTIFACT = 'schema.json'

/**
 * The keyword carrying the entity's unversioned SRN. Required, and validated
 * against the file's own path, so it can never drift from `$id` or from disk.
 * It exists because without it identity would be implicit in a URL-parsing rule:
 * a schema copied out of the catalog must still say where it came from.
 */
export const SRN_ANNOTATION = 'x-srn'

/** Late-bound or second-addressing keywords, forbidden so the graph stays static. */
const FORBIDDEN_KEYWORDS = ['$dynamicRef', '$dynamicAnchor', '$anchor', '$vocabulary'] as const

/**
 * A JSON Schema node. Deliberately open: the dialect is fixed but the keyword
 * set is not ours to close, and unknown keywords must survive round-tripping
 * into the raw view.
 */
export interface SchemaNode {
  $schema?: string
  /** The document's identity — its canonical schema URL. Required at the root only. */
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
   * Canonical registry key: the schema's canonical URL, e.g.
   * `https://schemas.metaframework.dev/acme/datamodel/money`. It is the document's
   * `$id`, the key ajv holds it under, and the base its own `$ref`s resolve
   * against — one identity for the portal and for every outside consumer.
   */
  id: string
  /**
   * Catalog-relative file path, e.g. `acme/datamodel/money/schema.json`. Not an
   * identity any more, but still where the bytes are — so it is what a
   * diagnostic points an author at. A URL is not something you can open in an
   * editor.
   */
  file: string
  /** Unversioned SRN of the owning entity, derived from the URL (SRN ≡ path). */
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
  /** Schema URL of the document the ref lands in; null when unresolvable. */
  targetId: string | null
  /** Unversioned SRN of the target entity — the navigation target. */
  targetSrn: string | null
  /**
   * Version the ref currently resolves to. A `$ref` carries no pin — the URL
   * addresses the current schema (decision-record 2026-08-19-c): pinning lives
   * in frontmatter `relations`.
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
  /** Derived model, by canonical id (schema URL). */
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
  /** Canonical id (schema URL) → entry. */
  entries: Map<string, SchemaEntry>
  /** Every lookup key — schema URL, entity SRN, versioned SRN, file path — → canonical id. */
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
    // The file path is not an identity any more, but it is what a reviewer has
    // in hand when reading a diff, so it stays a lookup key.
    index.set(entry.file, entry.id)

    try {
      // The key is the URL we derived, which the document's own `$id` must
      // equal (E_DM_ID_MISMATCH above). Passing it explicitly means a document
      // whose `$id` is wrong is still reachable under the right key, so one
      // mistake produces one diagnostic instead of cascading dangling refs.
      ajv.addSchema(entry.document, entry.id, false, false)
    } catch (error) {
      diagnostics.push({
        code: 'E_DM_SCHEMA_INVALID',
        severity: 'error',
        message: `ajv rejected the document: ${message(error)}`,
        path: entry.file,
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
  const file = `${entity.relDir}/${SCHEMA_ARTIFACT}`
  // Identity is computed from the entity, never read out of the document: that
  // is what lets the loader tell an author their `$id` is wrong.
  const id = srnToSchemaUrl(entity.srn)

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
      path: file,
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
      path: file,
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
            path: file,
            srn: entity.srn,
          })
        }
      }
    } catch (error) {
      diagnostics.push({
        code: 'E_DM_SCHEMA_INVALID',
        severity: 'error',
        message: message(error),
        path: file,
        srn: entity.srn,
      })
    }
  }

  for (const keyword of forbiddenKeywordsIn(document)) {
    diagnostics.push({
      code: 'E_DM_KEYWORD',
      severity: 'error',
      message: `forbidden keyword "${keyword}" — inheritance is allOf + $ref, and local shapes are addressed by #/$defs pointers`,
      path: file,
      srn: entity.srn,
    })
  }

  // --- identity ---------------------------------------------------------
  //
  // The root `$id` is the document's identity and the base URI its own refs
  // resolve against, so it must be exactly this entity's canonical schema URL.
  // `id` was computed from the entity's SRN and the canonical host, so this
  // check catches a stale path and a hand-typed host alike — including the
  // tempting mistake of writing the address the portal *serves* from.
  const declared = document.$id
  if (declared === undefined) {
    diagnostics.push({
      code: 'E_DM_ID_MISSING',
      severity: 'error',
      message: `$id is missing — it must be ${id}, this entity's canonical schema URL`,
      path: file,
      srn: entity.srn,
    })
  } else if (typeof declared !== 'string' || declared !== id) {
    diagnostics.push({
      code: 'E_DM_ID_MISMATCH',
      severity: 'error',
      message:
        `$id is ${JSON.stringify(declared)} but this entity's canonical schema URL is ${id}` +
        (typeof declared === 'string' && isSchemaServingUrl(declared)
          ? ' — that is where this portal serves the schema (SCHEMA_BASE_URL), not what it is;' +
            ` identity is always ${CANONICAL_SCHEMA_HOST}/{srn-path}`
          : ''),
      path: file,
      srn: entity.srn,
    })
  }

  // A *nested* `$id` re-bases every reference under it onto a second identity,
  // which is how one document quietly becomes two. Still forbidden at any depth
  // below the root.
  for (const pointer of idSitesIn(document)) {
    if (pointer === '') continue
    diagnostics.push({
      code: 'E_DM_ID_FORBIDDEN',
      severity: 'error',
      message: `${pointer}: a nested $id re-bases every $ref beneath it onto a second identity — address local shapes with #/$defs pointers`,
      path: file,
      srn: entity.srn,
    })
  }

  // `x-srn` states the SRN in the framework's own vocabulary. Like `$id` it is
  // checked against the file's directory rather than trusted, so the two can
  // never disagree without a diagnostic — they are two spellings of one derived
  // fact, not two hand-maintained fields.
  const srn = document[SRN_ANNOTATION]
  if (srn === undefined) {
    diagnostics.push({
      code: 'E_DM_SRN_MISSING',
      severity: 'error',
      message: `${SRN_ANNOTATION} is missing — it must be ${entity.srn}, this entity's unversioned SRN`,
      path: file,
      srn: entity.srn,
    })
  } else if (typeof srn !== 'string' || srn !== entity.srn) {
    diagnostics.push({
      code: 'E_DM_SRN_MISMATCH',
      severity: 'error',
      message:
        `${SRN_ANNOTATION} is ${JSON.stringify(srn)} but this entity's SRN is ${entity.srn}` +
        (typeof srn === 'string' && srn.includes('@') ? ' — x-srn is always unversioned' : ''),
      path: file,
      srn: entity.srn,
    })
  }

  return {
    id,
    file,
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
 * Resolve a cross-entity `$ref`, which is always a canonical schema URL.
 *
 * There is no arithmetic left to do — that is the point of the URL form. The
 * work is entirely rejection: naming *what kind* of wrong address this is, so
 * the author gets a code they can act on rather than a bare "unresolved".
 *
 * Returns the target's canonical schema URL, or the diagnostic that stops it.
 */
function resolveRefUrl(fromId: string, ref: string): { url: string } | { code: string; message: string } {
  const example = `${CANONICAL_SCHEMA_HOST}/acme/datamodel/money`

  if (!/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    // A relative ref would resolve against `$id` and could even be legal JSON
    // Schema — but two spellings of one edge is one too many, so the catalog
    // keeps a single form. Resolving it anyway costs one line and turns the
    // rejection into a fix-it.
    let suggestion = ''
    try {
      const resolved = new URL(ref, fromId).href
      if (schemaUrlToSrn(resolved)) suggestion = ` — did you mean "${resolved}"?`
    } catch {
      // Not resolvable against the base either; the generic message stands.
    }
    return {
      code: 'E_DM_REF_TARGET',
      message: `"${ref}" is not a canonical schema URL — a cross-entity $ref is its target's canonical URL, e.g. "${example}"${suggestion}`,
    }
  }

  if (schemaUrlToPath(ref) === null) {
    if (isSchemaServingUrl(ref)) {
      // A retrieval address, not an identity. It may well fetch; it still says
      // nothing about what the target *is*, and it varies by deployment.
      const path = ref.slice(ref.indexOf('/schemas/') + '/schemas/'.length)
      return {
        code: 'E_DM_REF_TARGET',
        message: `"${ref}" is where this portal serves a schema (SCHEMA_BASE_URL), not what it is — write "${CANONICAL_SCHEMA_HOST}/${path}"`,
      }
    }
    return {
      code: 'E_DM_REF_TARGET',
      message: `"${ref}" is not a canonical schema URL (${CANONICAL_SCHEMA_HOST}/…) — every schema in every solution is identified on that one host`,
    }
  }

  const targetSrn = schemaUrlToSrn(ref)
  if (targetSrn === null) {
    return {
      code: 'E_DM_REF_TARGET',
      message: `"${ref}" has a path after the host that is not a legal entity address — it must be an SRN path, {solution}/({kind}/{name})+, with no version pin`,
    }
  }

  const fromSolution = solutionOf(fromId)
  const toSolution = solutionOf(ref)
  if (fromSolution && toSolution && fromSolution !== toSolution) {
    return {
      code: 'E_SRN_CROSS_SOLUTION',
      message: `"${ref}" leaves solution "${fromSolution}" for "${toSolution}" — solutions are sealed universes`,
    }
  }

  return { url: ref }
}

/** First path segment of a schema URL — the solution that owns the document. */
function solutionOf(url: string): string | null {
  return schemaUrlToPath(url)?.split('/')[0] ?? null
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
        path: entry.file,
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

  const resolved = resolveRefUrl(entry.id, body)
  if ('code' in resolved) return { ...base, error: resolved }

  const target = entries.get(resolved.url)
  if (!target) {
    // The URL is well-formed and names a possible entity, so the author is told
    // *which* entity is missing rather than being handed the URL back.
    const targetSrn = schemaUrlToSrn(resolved.url)
    return {
      ...base,
      targetSrn,
      error: {
        code: 'E_SRN_DANGLING',
        message: `"${ref}" addresses ${targetSrn ?? resolved.url}, which is not a datamodel schema in the catalog`,
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
      path: entry.file,
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
        path: entry.file,
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
 * Resolve a schema by any of its keys: its schema URL, the owning entity's SRN
 * (with or without a version pin), or its catalog-relative file path.
 *
 * There is no `base` parameter any more — a `$ref` is absolute, so nothing is
 * resolved *relative to* anything. Returns null rather than throwing: a dangling
 * reference is a diagnostic, not a crash, and the portal still has to render the
 * page.
 */
export function resolveSchema(registry: SchemaRegistry, ref: string): SchemaEntry | null {
  const canonical = registry.index.get(ref)
  return canonical ? (registry.entries.get(canonical) ?? null) : null
}

/**
 * The compiled validator, straight from ajv. Nothing framework-specific happens
 * at validation time — that is the payoff of registering every document under
 * the same `$id` a stock validator would read out of it. Returns null when the
 * schema cannot be compiled (an unresolvable `$ref`).
 */
export function schemaValidator(registry: SchemaRegistry, ref: string): ValidateFunction | null {
  const entry = resolveSchema(registry, ref)
  if (!entry) return null
  try {
    return (registry.ajv.getSchema(entry.id) as ValidateFunction | undefined) ?? null
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
        path: from.file,
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
        path: root.file,
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
      file: entry.file,
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
      path: root.file,
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
    file: entry.file,
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
