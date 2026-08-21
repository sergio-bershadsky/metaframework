import type { Catalog, Diagnostic, Entity } from '../catalog/types'
import { type SchemaNode, type SchemaRegistry, effectiveModel, isNode } from './registry'

/**
 * Config contracts — framework/spec/kinds/datamodel.md, "Config contracts —
 * `usage: config`".
 *
 * A component's configuration contract is an ordinary datamodel entity in that
 * component's own `datamodel/` bucket, carrying `usage: config`. No new role, no
 * new edge, no new component field: the link is ownership-by-placement plus the
 * `usage` value, and the entity name is free.
 *
 * This module owns both halves of that. It **reads** the contracts — one
 * flattened, joinable view per component, which is the operand
 * `lib/environment/environment.ts` was missing — and it **checks** them against
 * the discipline the kind document states, which is what
 * `E_DM_CONFIG_SHAPE` and `E_DM_CONFIG_SECRET_DEFAULT` are for.
 *
 * Why it sits beside the registry rather than inside it. `buildSchemaRegistry`
 * validates one document at a time, and three of the eight rules below cannot be
 * answered from one document: the bucket cap counts a container's siblings, and
 * both secret rules read the **flattened** contract, because a `writeOnly`
 * inherited from an `OTEL_*` mixin is as much a secret as one written in place.
 * Flattening needs the resolutions the registry only has once every entry is in
 * it. So this runs after, over the finished registry, exactly as
 * `effectiveModel` does.
 */

/** Env-var casing, on both sides of the join, so they meet by string equality. */
export const CONFIG_KEY = /^[A-Z][A-Z0-9_]*$/

/** What a config key may be typed as: a process environment holds scalars. */
const SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean'])

/** Keywords that describe a shape with something inside it, declared or not. */
const NESTING_KEYWORDS = [
  'properties',
  'patternProperties',
  'additionalProperties',
  'required',
  'items',
  'prefixItems',
  'contains',
] as const

/** Value-stating keywords. On a `writeOnly` property each is a secret in git. */
const VALUE_KEYWORDS = ['default', 'const', 'examples'] as const

/** One component's configuration contract, flattened and ready to join against. */
export interface ConfigContract {
  /** SRN of the `usage: config` datamodel entity — where a finding is filed. */
  srn: string
  /** Its `schema.json`, catalog-relative: what a reader opens. */
  file: string
  /** Every property name the conjunction declares. */
  keys: Set<string>
  /** Union of `required` across every branch. */
  required: Set<string>
  /**
   * `required` minus every key carrying a `default` — the obligation on whoever
   * deploys the component, and the only set `W_ENV_CONFIG_MISSING` reads.
   */
  mustProvide: Set<string>
  /** Keys marked `writeOnly: true` anywhere in the conjunction: the secrets. */
  secret: Set<string>
  /**
   * Does `value` satisfy this key's subschema? Returns null when it does, or a
   * reason when it does not. Unknown keys answer null — that is
   * `W_ENV_CONFIG_UNDECLARED`'s finding, not this one's.
   */
  accepts(key: string, value: unknown): string | null
}

/** Every component that publishes a contract, keyed by the component's SRN. */
export type ConfigContracts = Map<string, ConfigContract>

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/** Concrete config contracts in a container's own `datamodel/` bucket. */
function concreteContractsOf(catalog: Catalog, container: Entity): Entity[] {
  return container.children
    .map((child) => catalog.entities.get(child))
    .filter((child): child is Entity => child !== undefined)
    .filter((child) => child.kind === 'datamodel' && isConfigModel(child) && child.frontmatter.abstract !== true)
    .sort((a, b) => a.srn.localeCompare(b.srn))
}

function isConfigModel(entity: Entity): boolean {
  return entity.kind === 'datamodel' && entity.frontmatter.usage === 'config'
}

/**
 * Build the flattened contract of every component that publishes one.
 *
 * A container holding two concrete contracts is skipped rather than resolved by
 * a coin toss: the ambiguity is already `E_DM_CONFIG_SHAPE` below, and joining
 * an environment against an arbitrary one of the two would print findings whose
 * cause is this reader's tie-break rather than anything an author wrote.
 */
export function readConfigContracts(catalog: Catalog, registry: SchemaRegistry): ConfigContracts {
  const contracts: ConfigContracts = new Map()

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'component') continue
    const concrete = concreteContractsOf(catalog, entity)
    if (concrete.length !== 1) continue

    const contract = flatten(registry, concrete[0])
    if (contract) contracts.set(entity.srn, contract)
  }

  return contracts
}

function flatten(registry: SchemaRegistry, model: Entity): ConfigContract | null {
  const effective = effectiveModel(registry, model.srn)
  if (!effective) return null

  const subschemas = new Map<string, SchemaNode[]>()
  const keys = new Set<string>()
  const secret = new Set<string>()
  const defaulted = new Set<string>()

  for (const property of effective.properties) {
    keys.add(property.name)
    subschemas.set(
      property.name,
      property.contributions.map((contribution) => contribution.schema),
    )
    // Any branch, not the nearest one. `allOf` intersects, so a `writeOnly`
    // written on a mixin constrains the deriving component exactly as one
    // written in place — and a `default` supplied by any branch is a value the
    // process has without anybody deploying it.
    if (property.contributions.some((contribution) => contribution.schema.writeOnly === true)) secret.add(property.name)
    if (property.contributions.some((contribution) => contribution.schema.default !== undefined)) {
      defaulted.add(property.name)
    }
  }

  const required = new Set(effective.required)
  const mustProvide = new Set([...required].filter((key) => !defaulted.has(key)))

  return {
    srn: model.srn,
    file: `${model.relDir}/schema.json`,
    keys,
    required,
    mustProvide,
    secret,
    accepts: (key, value) => accepts(registry, subschemas.get(key), value),
  }
}

/* -------------------------------------------------------------------------- */
/* Values                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Check one declared value against the conjunction of subschemas its key
 * collected, with the one coercion the format owes its own history.
 *
 * Every `value:` written before this release is a YAML string — a boolean
 * spelled `"false"`, an integer spelled `"8000"` — so a contract typing the key
 * `integer` would fail files that were correct when they were written. The rule
 * (kinds/environment.md) is therefore per-entry and **lexical**: where the
 * contract types the key `number`, `integer` or `boolean`, the string is also
 * read in that type's ordinary literal form, and the value passes if either
 * reading satisfies every branch.
 *
 * Lexical and never semantic, which is the whole difference: `"1"` against
 * `{"type": "boolean"}` still fails, because `1` is not a boolean literal and a
 * truthiness table belongs to a runtime's parser rather than to a catalog's
 * checker.
 *
 * **Which complaint comes back when every reading fails.** Not the first one:
 * the first is the raw string's, and against a typed key it is always the same
 * sentence — `"70000"` "must be integer" — which is this checker's coercion
 * talking, not the author's mistake. The author wrote a port, it was read as one,
 * and it broke a *bound*. So the first complaint about a constraint other than
 * the type wins, and the raw reading's is the fallback for a value that has no
 * reading at all: `"soon"` against `{"type": "integer"}` really is a type error,
 * and there is nothing else to say about it.
 */
function accepts(registry: SchemaRegistry, subschemas: SchemaNode[] | undefined, value: unknown): string | null {
  if (!subschemas || subschemas.length === 0) return null

  const candidates = [value, ...lexicalReadings(subschemas, value)]
  const failures: Complaint[] = []

  for (const candidate of candidates) {
    const complaint = rejects(registry, subschemas, candidate)
    if (complaint === null) return null
    failures.push(complaint)
  }
  return (failures.find((complaint) => complaint.keyword !== 'type') ?? failures[0]).message
}

/** Every declared `type` across the conjunction, flattened. */
function declaredTypes(subschemas: SchemaNode[]): Set<string> {
  const types = new Set<string>()
  for (const subschema of subschemas) {
    const declared = subschema.type
    if (typeof declared === 'string') types.add(declared)
    else if (Array.isArray(declared)) for (const one of declared) types.add(one)
  }
  return types
}

/** The literal readings of a quoted scalar the contract's own types license. */
function lexicalReadings(subschemas: SchemaNode[], value: unknown): unknown[] {
  if (typeof value !== 'string') return []
  const types = declaredTypes(subschemas)
  const readings: unknown[] = []

  if (types.has('boolean') && (value === 'true' || value === 'false')) readings.push(value === 'true')
  // JSON's own number grammar, so `"08"`, `"1e"` and `" 1"` are not numbers —
  // the same answer `JSON.parse` gives, reached without running it.
  if (types.has('integer') && /^-?(0|[1-9][0-9]*)$/.test(value)) readings.push(Number(value))
  if (types.has('number') && /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][-+]?[0-9]+)?$/.test(value)) readings.push(Number(value))

  return readings
}

/**
 * One rejection: the sentence a reader gets, and the keyword whose constraint
 * the candidate actually broke. The keyword is ajv's own, and it is carried
 * rather than parsed back out of the message because it is what {@link accepts}
 * separates the coercion's artifact from the finding by.
 */
interface Complaint {
  keyword: string
  message: string
}

/** Null when every branch accepts, otherwise the first branch's complaint. */
function rejects(registry: SchemaRegistry, subschemas: SchemaNode[], value: unknown): Complaint | null {
  for (const subschema of subschemas) {
    let validate: ReturnType<SchemaRegistry['ajv']['compile']>
    try {
      // ajv memoises on the schema object's identity, so the compile happens
      // once per subschema for the whole run however many entries cite the key.
      validate = registry.ajv.compile(subschema)
    } catch {
      // An uncompilable subschema is a defect in the contract, already reported
      // by the registry or by E_DM_CONFIG_SHAPE below. Reporting it a second
      // time against every environment that declares the key would put one
      // author's mistake on every other author's page.
      continue
    }
    if (validate(value)) continue
    const first = validate.errors?.[0]
    return first
      ? { keyword: first.keyword, message: `${first.instancePath || 'value'} ${first.message ?? 'is invalid'}` }
      : { keyword: '', message: 'fails the key’s subschema' }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* The discipline                                                              */
/* -------------------------------------------------------------------------- */

/**
 * `E_DM_CONFIG_SHAPE` and `E_DM_CONFIG_SECRET_DEFAULT` over every `usage: config`
 * model in the catalog, abstract mixins included.
 *
 * A mixin is checked exactly like a contract because every rule here is about
 * the *keys*, and a mixin's keys become somebody's contract the moment it is
 * `allOf`-referenced. The one rule that treats them differently is the bucket
 * cap, which counts concrete models only — a mixin has no component to be the
 * contract of, so any number may sit in any bucket.
 */
export function configContractDiagnostics(catalog: Catalog, registry: SchemaRegistry): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (isConfigModel(entity)) diagnostics.push(...shapeOf(entity, registry))
    if (entity.children.length > 0) diagnostics.push(...bucketCap(catalog, entity))
  }

  return diagnostics.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code))
}

/** At most one concrete config contract per `datamodel/` bucket. */
function bucketCap(catalog: Catalog, container: Entity): Diagnostic[] {
  const concrete = concreteContractsOf(catalog, container)
  if (concrete.length < 2) return []

  return concrete.map((model) => ({
    code: 'E_DM_CONFIG_SHAPE',
    severity: 'error' as const,
    message:
      `${container.srn} holds ${concrete.length} concrete config contracts (${concrete.map((one) => one.frontmatter.name).join(', ')}) — ` +
      'a container has one, or none; a surface several components share is `abstract: true` and reached with allOf',
    path: `${model.relDir}/index.md`,
    srn: model.srn,
  }))
}

function shapeOf(model: Entity, registry: SchemaRegistry): Diagnostic[] {
  const entry = registry.entries.get(registry.index.get(model.srn) ?? '')
  if (!entry) return []

  const document = entry.document
  const file = entry.file
  const diagnostics: Diagnostic[] = []
  const at = (code: string, message: string) =>
    diagnostics.push({ code, severity: 'error' as const, message, path: file, srn: model.srn })

  // An instance of a config contract is one process environment: a flat map of
  // key to value. Every rule below is that sentence, stated in JSON Schema.
  if (document.type !== 'object') {
    at(
      'E_DM_CONFIG_SHAPE',
      `root type is ${JSON.stringify(document.type ?? null)} — a configuration is a map of keys to values, so the root is an object`,
    )
  }

  for (const site of entry.refs) {
    if (site.inheritance) continue
    at(
      'E_DM_CONFIG_SHAPE',
      `${site.pointer || '(root)'}: "${site.ref}" — a $ref below the root is a nested object wearing a URL; ` +
        'the only $ref a contract carries is a root allOf branch naming another contract',
    )
  }

  for (const [name, subschema] of Object.entries(document.properties ?? {})) {
    if (!isNode(subschema)) continue

    if (!CONFIG_KEY.test(name)) {
      at(
        'E_DM_CONFIG_SHAPE',
        `property "${name}" is not SCREAMING_SNAKE_CASE — these names are the runtime's, not the catalog's, ` +
          'and the environment side has required that casing since v1',
      )
    }

    const nonScalar = nonScalarReason(subschema)
    if (nonScalar) {
      at(
        'E_DM_CONFIG_SHAPE',
        `property "${name}" ${nonScalar} — a key of a process environment holds one scalar, and nesting has no flattening ` +
          'convention this framework is willing to guess',
      )
    }

    if (subschema.writeOnly !== true) continue
    for (const keyword of VALUE_KEYWORDS) {
      if (subschema[keyword] === undefined) continue
      at(
        'E_DM_CONFIG_SECRET_DEFAULT',
        `property "${name}" is writeOnly and carries "${keyword}" — that is a secret value in git, ` +
          'whatever the environment it was meant for',
      )
    }
    if (Array.isArray(subschema.enum) && subschema.enum.length === 1) {
      at(
        'E_DM_CONFIG_SECRET_DEFAULT',
        `property "${name}" is writeOnly and its enum admits exactly one member — a one-member enum states the value`,
      )
    }
  }

  diagnostics.push(...secretExamples(model, registry))
  return diagnostics
}

/** Why this subschema is not a scalar, or null when nothing says it is not. */
function nonScalarReason(subschema: SchemaNode): string | null {
  const types = declaredTypes([subschema])
  const foreign = [...types].filter((type) => !SCALAR_TYPES.has(type))
  if (foreign.length > 0) return `is typed ${foreign.map((type) => `"${type}"`).join(', ')}`

  const nesting = NESTING_KEYWORDS.filter((keyword) => subschema[keyword] !== undefined)
  if (nesting.length > 0) return `carries ${nesting.map((keyword) => `"${keyword}"`).join(', ')}, which describes a shape with something inside it`

  for (const keyword of ['enum', 'const'] as const) {
    const stated = keyword === 'enum' ? subschema.enum : subschema.const === undefined ? undefined : [subschema.const]
    if (!Array.isArray(stated)) continue
    if (stated.some((member) => typeof member === 'object' && member !== null)) {
      return `has a ${keyword} whose members are not scalars`
    }
  }

  // A property that declares no type at all is deliberately NOT flagged. The
  // rule exists to refuse a nested shape, and the three tests above catch every
  // way of writing one; an annotation-only subschema (`{ "description": … }`)
  // constrains nothing, joins by name like any other key, and rejecting it would
  // be this reader being stricter than the document it implements.
  return null
}

/**
 * An `examples/` instance carrying a key the contract marks `writeOnly`.
 *
 * The flattened secret set, not the document's own: a mixin's `writeOnly` key
 * appearing in a deriving contract's example is the same credential in the same
 * public repository. The instance's own validity against the schema is
 * `E_DM_EXAMPLE_INVALID`'s business and stays unimplemented; this reads top-level
 * key names and nothing else, which is all a flat contract has.
 */
function secretExamples(model: Entity, registry: SchemaRegistry): Diagnostic[] {
  const effective = effectiveModel(registry, model.srn)
  if (!effective) return []

  const secret = new Set(
    effective.properties
      .filter((property) => property.contributions.some((contribution) => contribution.schema.writeOnly === true))
      .map((property) => property.name),
  )
  if (secret.size === 0) return []

  const diagnostics: Diagnostic[] = []
  for (const artifact of model.artifacts) {
    if (!artifact.file.startsWith('examples/') || !artifact.file.endsWith('.json')) continue
    if (!isNode(artifact.data)) continue

    const leaked = Object.keys(artifact.data).filter((key) => secret.has(key))
    if (leaked.length === 0) continue
    diagnostics.push({
      code: 'E_DM_CONFIG_SECRET_DEFAULT',
      severity: 'error',
      message:
        `carries ${leaked.map((key) => `"${key}"`).join(', ')}, which the contract marks writeOnly — ` +
        'an example of a config contract is a set of values, and a secret one is a secret in git',
      path: `${model.relDir}/${artifact.file}`,
      srn: model.srn,
    })
  }
  return diagnostics
}
