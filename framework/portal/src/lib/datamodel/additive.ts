import type { Catalog, Diagnostic } from '../catalog/types'
import { type HistoryOptions, readFileAtRevision, resolveVersion } from '../history/git'
import { schemaUrlToSrn } from '../schema/url'

/**
 * `E_DM_NOT_ADDITIVE` — the instance-superset rule, made mechanical.
 *
 * ## The rule, in the spec's own words
 *
 * `framework/spec/evolution.md`, "Datamodels — the instance-superset rule":
 *
 * > Version `N+1` of a schema MUST accept every instance that version `N`
 * > accepted. Loosening is legal; tightening or reshaping is not.
 *
 * `framework/spec/kinds/datamodel.md`, "Additive evolution of schemas", restates
 * it as the test and adds what a *swap* is for:
 *
 * > The test is always the same: **version N+1 MUST accept every instance version
 * > N accepted.** Loosening is legal in place; tightening or reshaping is not
 * > legal at any version number and requires a swap (a new entity that
 * > `supersedes` this one).
 *
 * The naive reading — "additive means you may add things" — is wrong in both
 * directions, and the superset formulation is why. *Adding* a name to `required`
 * is forbidden, because it rejects an instance N accepted; *removing* one is
 * legal, because it does not. The question is never what the author typed, it is
 * which instances the two documents accept.
 *
 * One clause of the rule is not about instances at all, and it is stated in the
 * table rather than in the sentence: `evolution.md` calls removing a property
 * "reduction; referrers may depend on it", and marks it ILLEGAL even though an
 * open schema keeps accepting every instance after the declaration is dropped.
 * That row is about the **contract surface** — the principle's own subject,
 * "everything a referrer can depend on" — so a removed property is a finding here
 * even where instance acceptance is untouched.
 *
 * ## What is compared, and against what
 *
 * `datamodel.md`, "What the portal checks mechanically":
 *
 * > At build, the portal diffs the current `schema.json` against version N read
 * > from git and reports `E_DM_NOT_ADDITIVE` for the decidable subset
 *
 * So: the working tree's `schema.json` (which is version N+1, the only version on
 * disk) against the `schema.json` of the commit the version→commit index maps
 * `N` to. `currentVersion - 1` is that N. Both halves come from
 * `lib/history/git.ts`, which is the module that owns every read of the past.
 *
 * The eight decidable rows are the closed list this module implements:
 *
 * ```text
 * property present at N, absent at N+1          → E_DM_NOT_ADDITIVE
 * name added to "required"                      → E_DM_NOT_ADDITIVE
 * enum member removed                           → E_DM_NOT_ADDITIVE
 * "type" set narrowed                           → E_DM_NOT_ADDITIVE
 * numeric / length / items bound tightened      → E_DM_NOT_ADDITIVE
 * "pattern" added or tightened                  → E_DM_NOT_ADDITIVE
 * "additionalProperties" changed to false       → E_DM_NOT_ADDITIVE
 * "$ref" retargeted to another entity           → E_DM_NOT_ADDITIVE
 * ```
 *
 * and the governing sentence beneath them is the one that decides every case the
 * eight rows leave open:
 *
 * > The check is deliberately conservative: it flags only changes that are
 * > unambiguously tightening. Full schema subsumption is undecidable in general
 *
 * ## An absent keyword is its own default, not "no opinion"
 *
 * Four of the rows name a *narrowing*, and a narrowing needs a "before". Three
 * keywords have one even when the previous document did not write them, because
 * that is what the keyword denotes when absent: a schema with no `type` accepts
 * every type, one with no `maxLength` accepts every length, one with no `enum`
 * accepts every value. Going from that to a written constraint is a narrowing of
 * exactly the set the row names, and it is unambiguously tightening — which is
 * the criterion the conservatism sentence sets.
 *
 * This is the one interpretive move in the module, it is applied to `type`, the
 * bound keywords and `enum`/`const`, and it is applied nowhere else. `$ref` in
 * particular is left out of it: a reference is not a constraint with a default,
 * so an *added* `$ref` is not a "retargeted" one and is silent here.
 *
 * `integer` is the exception inside `type`, and JSON Schema's own subtyping is
 * why: every integer is a number, so `["integer"]` → `["number"]` widens while a
 * plain set difference would call it a narrowing. {@link narrowedTypes} knows the
 * one containment that exists in that vocabulary and no other.
 *
 * ## Where this is deliberately silent
 *
 * A rule that fires where it cannot see is worse than one that does not fire, so
 * each silence below is a position rather than an omission.
 *
 * 1. **A `pattern` that changed.** The row says "added or tightened", and only
 *    the first half is decidable: regular-expression containment is not a
 *    comparison this or any checker performs, and firing on every edit would
 *    report a genuine loosening as a break. Added-where-absent fires; changed
 *    does not.
 * 2. **A schema array whose length moved.** `allOf`, `anyOf`, `oneOf` and
 *    `prefixItems` are compared element-wise, and element-wise comparison needs
 *    the elements to line up. Inserting a branch at position 0 shifts every later
 *    one, so a positional walk would report each shifted `$ref` as retargeted. At
 *    unequal lengths nothing inside the array is compared. The two rows that
 *    would have covered the change itself — a removed `oneOf` branch, an `allOf`
 *    `$ref` to a base that declares `required` — are in the prose table and *not*
 *    in the eight mechanical rows, and the second needs the base document
 *    resolved.
 * 3. **`not` and `if`.** Polarity: tightening inside `not` loosens the schema
 *    around it, and a change inside `if` moves which branch applies rather than
 *    what either accepts. Every rule in this module would have the wrong sign
 *    there. `then` and `else` are walked — their polarity is ordinary.
 * 4. **A `$ref` whose target this framework cannot name.** See
 *    {@link refTarget}: the previous document may be written in a schema-identity
 *    grammar three ADRs old, and a byte comparison would report every one of
 *    those migrations as a retarget.
 * 5. **A previous document that will not parse, or is not there.** It is the
 *    commit's finding, not this version's, and `E_DM_SCHEMA_INVALID` already
 *    holds it for whichever tree still contains it.
 * 6. **Version 1, and any version whose predecessor git cannot reach.** See
 *    {@link datamodelEvolutionDiagnostics}.
 * 7. **A position where either side is a boolean schema**, and every keyword
 *    outside the eight rows — `multipleOf`, `dependentRequired`,
 *    `unevaluatedProperties: false`, an `allOf` branch added, a `oneOf` branch
 *    removed. Some of those are decidable and none of them is a row of the
 *    table; adding one is a change to what the specification promises, not to
 *    what this module happens to look at.
 */

/* --------------------------------------------------------------- utilities */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** RFC 6901 escaping, so a property named `a/b` does not read as two segments. */
function child(pointer: string, token: string): string {
  return `${pointer}/${token.replace(/~/g, '~0').replace(/\//g, '~1')}`
}

/**
 * A value as one comparable string, with object keys ordered.
 *
 * `enum` members are values of any JSON type, and two members are the same member
 * when they are the same value — `{"a":1,"b":2}` and `{"b":2,"a":1}` are one
 * member written twice. Plain `JSON.stringify` would call them different and
 * report a removal that did not happen.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/* ------------------------------------------------------------------ the rows */

/**
 * Every type the `type` vocabulary names. An absent `type` denotes this whole
 * set, which is what makes "narrowed" answerable against a document that never
 * wrote the keyword.
 */
const ALL_TYPES = ['null', 'boolean', 'object', 'array', 'number', 'string', 'integer'] as const

function typeSet(schema: Record<string, unknown>): Set<string> {
  const declared = typeof schema.type === 'string' ? [schema.type] : strings(schema.type)
  return declared.length === 0 ? new Set(ALL_TYPES) : new Set(declared)
}

/**
 * The types the previous document accepted that the current one does not.
 *
 * `integer` is the single containment in this vocabulary: every integer is a
 * number, so a set that lost `integer` while gaining or keeping `number` lost
 * nothing. Nothing else in the seven contains anything else.
 */
function narrowedTypes(previous: Set<string>, current: Set<string>): string[] {
  return [...previous].filter((type) => {
    if (current.has(type)) return false
    return !(type === 'integer' && current.has('number'))
  })
}

/**
 * The bound keywords, each with the value its absence denotes.
 *
 * `minContains` defaults to 1 and every other lower bound to its floor; upper
 * bounds are unbounded when absent. `multipleOf` is deliberately not here: it is
 * a divisibility constraint rather than a bound, and deciding whether one
 * multiple-of tightens another is a question about rationals in binary floating
 * point that this module declines to answer.
 */
const BOUNDS: ReadonlyArray<{ key: string; tightens: 'up' | 'down'; absent: number }> = [
  { key: 'minimum', tightens: 'up', absent: Number.NEGATIVE_INFINITY },
  { key: 'exclusiveMinimum', tightens: 'up', absent: Number.NEGATIVE_INFINITY },
  { key: 'maximum', tightens: 'down', absent: Number.POSITIVE_INFINITY },
  { key: 'exclusiveMaximum', tightens: 'down', absent: Number.POSITIVE_INFINITY },
  { key: 'minLength', tightens: 'up', absent: 0 },
  { key: 'maxLength', tightens: 'down', absent: Number.POSITIVE_INFINITY },
  { key: 'minItems', tightens: 'up', absent: 0 },
  { key: 'maxItems', tightens: 'down', absent: Number.POSITIVE_INFINITY },
  { key: 'minProperties', tightens: 'up', absent: 0 },
  { key: 'maxProperties', tightens: 'down', absent: Number.POSITIVE_INFINITY },
  { key: 'minContains', tightens: 'up', absent: 1 },
  { key: 'maxContains', tightens: 'down', absent: Number.POSITIVE_INFINITY },
]

/**
 * What a `$ref` names, as something two documents can be compared on — or null
 * when this framework cannot say what it names.
 *
 * The row is `"$ref" retargeted **to another entity**`, and datamodel.md adds
 * that the comparison is "now a literal string comparison" because "a URL does
 * not encode the referrer's position … there is nothing to normalize". Both
 * halves of that are true of two documents written under the *current* grammar,
 * and the historical half of this comparison need not be: this catalog's own
 * `$ref`s have been spelled three ways in three ADRs — a relative path
 * ([0005](srn://metaframework/adr/0005-relative-path-schema-refs-without-id)), a
 * serving address
 * ([0006](srn://metaframework/adr/0006-dereferenceable-schema-urls)) and the
 * canonical URL
 * ([0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored))
 * — and every one of those migrations rewrote the bytes without moving a single
 * target. A byte comparison calls all three a retarget; the rule asks about the
 * entity.
 *
 * So the target is resolved to the thing the rule names. {@link schemaUrlToSrn}
 * is the framework's own mapper and the same one the registry uses to record an
 * edge — "Edge SRNs are computed from URL paths, never read out of the
 * documents" (datamodel.md). A document-local fragment is compared as written:
 * it addresses a shape inside this same file, so no host and no migration can
 * touch it.
 *
 * Null for everything else, which means silence. A ref in a superseded grammar
 * names no entity this framework can compute, so "retargeted to another entity"
 * has no truth value about it — and a ref written in one *today* is already
 * `E_DM_REF_TARGET`, an error on the current document rather than a claim about
 * the previous one.
 */
function refTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (value.startsWith('#')) return value
  return schemaUrlToSrn(value)
}

/** The accepted-value set a schema names explicitly, or null when it names none. */
function valueSet(schema: Record<string, unknown>): { members: string[]; keyword: 'enum' | 'const' } | null {
  if (Array.isArray(schema.enum)) return { members: schema.enum.map(canonical), keyword: 'enum' }
  // A `const` is an enum of one, and is judged by the enum row for that reason:
  // both name the closed set of values the schema accepts.
  if ('const' in schema) return { members: [canonical(schema.const)], keyword: 'const' }
  return null
}

/* -------------------------------------------------------------------- walk */

/** Positions holding one subschema, walked with ordinary polarity. */
const SINGLE_SUBSCHEMA = [
  'items',
  'contains',
  'propertyNames',
  'then',
  'else',
  'additionalProperties',
  'unevaluatedItems',
  'unevaluatedProperties',
] as const

/** Positions holding a map of name → subschema. */
const SUBSCHEMA_MAPS = ['properties', 'patternProperties', '$defs', 'dependentSchemas'] as const

/** Positions holding an array of subschemas, compared element-wise. */
const SUBSCHEMA_ARRAYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const

interface Finding {
  pointer: string
  message: string
}

function compare(previous: unknown, current: unknown, pointer: string, out: Finding[]): void {
  if (!isRecord(previous) || !isRecord(current)) return

  const at = (message: string) => out.push({ pointer, message })

  /* --- property present at N, absent at N+1 ------------------------------- */

  const previousProperties = isRecord(previous.properties) ? previous.properties : {}
  const currentProperties = isRecord(current.properties) ? current.properties : {}
  for (const name of Object.keys(previousProperties)) {
    if (name in currentProperties) continue
    out.push({
      pointer: child(child(pointer, 'properties'), name),
      message: `property "${name}" was declared and is gone — a property is never removed; mark it "deprecated": true and stop writing it`,
    })
  }

  /* --- name added to "required" ------------------------------------------- */

  const wasRequired = new Set(strings(previous.required))
  const added = strings(current.required).filter((name) => !wasRequired.has(name))
  if (added.length > 0) {
    at(
      `"required" gained ${added.map((name) => `"${name}"`).join(', ')} — an instance without ${added.length === 1 ? 'it' : 'them'} was valid before and is not now`,
    )
  }

  /* --- enum member removed ------------------------------------------------ */

  const before = valueSet(previous)
  const after = valueSet(current)
  if (after !== null) {
    if (before === null) {
      at(
        `"${after.keyword}" restricts a position that accepted any value — every instance outside the ${after.members.length === 1 ? 'single permitted value' : `${after.members.length} permitted values`} is now rejected`,
      )
    } else {
      const kept = new Set(after.members)
      const lost = before.members.filter((member) => !kept.has(member))
      if (lost.length > 0) {
        at(`${lost.join(', ')} no longer accepted — a value the previous version admitted is not a value this one does`)
      }
    }
  }

  /* --- "type" set narrowed ------------------------------------------------ */

  const lostTypes = narrowedTypes(typeSet(previous), typeSet(current))
  if (lostTypes.length > 0) {
    at(`"type" no longer admits ${lostTypes.join(', ')} — every instance of ${lostTypes.length === 1 ? 'that type' : 'those types'} is rejected now`)
  }

  /* --- numeric / length / items bound tightened --------------------------- */

  for (const bound of BOUNDS) {
    const was = num(previous[bound.key]) ?? bound.absent
    const now = num(current[bound.key]) ?? bound.absent
    if (bound.tightens === 'up' ? now > was : now < was) {
      // An infinite "before" is the unwritten keyword; a finite one is the value
      // the keyword denotes when absent, and printing it is the whole point.
      at(`"${bound.key}" tightened ${Number.isFinite(was) ? was : 'unbounded'} → ${now}`)
    }
  }

  /* --- "pattern" added ----------------------------------------------------- */

  // Added only. A pattern that CHANGED may be a loosening, and no checker
  // decides which — see the docblock.
  if (typeof current.pattern === 'string' && typeof previous.pattern !== 'string') {
    at(`"pattern" ${JSON.stringify(current.pattern)} constrains a string that was unconstrained — every value it does not match is rejected now`)
  }

  /* --- "additionalProperties" changed to false ----------------------------- */

  if (current.additionalProperties === false && previous.additionalProperties !== false) {
    at('"additionalProperties": false closes a schema that was open — an instance carrying anything else is rejected now')
  }

  /* --- "$ref" retargeted --------------------------------------------------- */

  const wasTarget = refTarget(previous.$ref)
  const nowTarget = refTarget(current.$ref)
  if (wasTarget !== null && nowTarget !== null && wasTarget !== nowTarget) {
    at(`"$ref" retargeted ${wasTarget} → ${nowTarget} — a different entity is a different shape, whatever the two have in common`)
  }

  /* --- recurse ------------------------------------------------------------- */

  for (const key of SUBSCHEMA_MAPS) {
    const was = previous[key]
    const now = current[key]
    if (!isRecord(was) || !isRecord(now)) continue
    for (const name of Object.keys(was)) {
      // A `$defs` shape may be removed when nothing references it, and a
      // `properties` removal is already reported above. Only shared names recur.
      if (name in now) compare(was[name], now[name], child(child(pointer, key), name), out)
    }
  }

  for (const key of SINGLE_SUBSCHEMA) {
    compare(previous[key], current[key], child(pointer, key), out)
  }

  for (const key of SUBSCHEMA_ARRAYS) {
    const was = previous[key]
    const now = current[key]
    // Unequal lengths mean the elements do not line up — see the docblock.
    if (!Array.isArray(was) || !Array.isArray(now) || was.length !== now.length) continue
    was.forEach((element, index) => compare(element, now[index], child(child(pointer, key), String(index)), out))
  }
}

/* -------------------------------------------------------------------- entry */

const CODE = 'E_DM_NOT_ADDITIVE'

export interface AdditiveOptions {
  /** Catalog-relative path reported on every diagnostic. */
  path?: string
  /** SRN of the owning datamodel, carried onto the diagnostics. */
  srn?: string
  /** The version the previous document carried, for the message. */
  previousVersion?: number
  /** The version on disk. */
  currentVersion?: number
}

/**
 * Compare two parsed `schema.json` documents and report every decidable
 * instance-superset violation between them.
 *
 * Pure: two documents in, diagnostics out, no filesystem, no catalog and no git.
 * The git-backed half is {@link datamodelEvolutionDiagnostics}, and this is the
 * half a test can drive with two object literals.
 */
export function additiveDiagnostics(
  previous: unknown,
  current: unknown,
  options: AdditiveOptions = {},
): Diagnostic[] {
  const findings: Finding[] = []
  compare(previous, current, '#', findings)

  const span =
    options.previousVersion !== undefined && options.currentVersion !== undefined
      ? `v${options.previousVersion} → v${options.currentVersion}: `
      : ''

  return findings.map((finding) => ({
    code: CODE,
    severity: 'error' as const,
    message: `${span}${finding.pointer} — ${finding.message}. Version N+1 must accept every instance version N accepted; a tightening is a swap, not a bump.`,
    path: options.path ?? 'schema.json',
    ...(options.srn ? { srn: options.srn } : {}),
  }))
}

/* ------------------------------------------------------------ the git half */

const SCHEMA_FILE = 'schema.json'

/**
 * Every datamodel in the catalog, compared against its own previous version.
 *
 * The one check in the framework that cannot be answered from the working tree,
 * so the one that spawns git. Three situations produce silence rather than a
 * finding, and each is a statement about what can be known:
 *
 * - **Version 1.** `evolution.md` starts `version` at 1 and increments by
 *   exactly 1, so v1 has no predecessor by construction — there is no pair of
 *   documents for the superset rule to be true or false about. No git call is
 *   made for one, which is also why the check costs a walk of the 21 versioned
 *   datamodels rather than of all 104.
 * - **A predecessor git cannot reach** — no repository, no git binary, a shallow
 *   clone whose history stops above N−1, an entity whose directory was created
 *   in the working tree and never committed. `catalog-renders-without-git`
 *   makes history an enrichment rather than a precondition, and an accusation
 *   the accuser cannot support is worse than no accusation. `E_SRN_VERSION` is
 *   deliberately NOT raised here: that class is about a pin somebody *wrote*
 *   (`srn.md`), and nobody wrote this comparison's `@N`.
 * - **A predecessor that is not parseable JSON, or holds no `schema.json` at
 *   all.** The finding belongs to the commit that holds the file.
 *
 * ## The one blind spot, and why it is not this check's to close
 *
 * The comparison is v(N−1)-in-git against the working tree, where N is the
 * version on disk. An author who makes a breaking edit and *forgets the bump*
 * is therefore compared against N−1 rather than against N, and a break that is
 * only a break relative to N goes unreported. That is exactly the situation
 * `E_VER_UNBUMPED` exists for, and the reason it is not fixed here is the reason
 * that check compares two commits and never the working tree: editing a file
 * before committing it is authoring, not a violation, so there is no version of
 * this check that could tell the two apart.
 */
export async function datamodelEvolutionDiagnostics(
  catalog: Catalog,
  options: HistoryOptions = {},
): Promise<Diagnostic[]> {
  const datamodels = [...catalog.entities.values()].filter(
    (entity) => entity.kind === 'datamodel' && typeof entity.frontmatter.version === 'number',
  )

  const perEntity = await Promise.all(
    datamodels.map(async (entity) => {
      const currentVersion = entity.frontmatter.version
      if (!Number.isInteger(currentVersion) || currentVersion < 2) return []

      const current = entity.artifacts.find((artifact) => artifact.file === SCHEMA_FILE)
      // No schema on disk is `E_DM_SCHEMA_MISSING`, and an unparseable one is
      // `E_DM_SCHEMA_INVALID`. Neither is restated here.
      if (!current || current.error || !isRecord(current.data)) return []

      const previousVersion = currentVersion - 1
      const resolved = await resolveVersion(entity.relDir, previousVersion, options)
      if (resolved.commit === null) return []

      const blob = await readFileAtRevision(`${entity.relDir}/${SCHEMA_FILE}`, resolved.commit, options)
      if (blob.content === null) return []

      let previous: unknown
      try {
        previous = JSON.parse(blob.content)
      } catch {
        return []
      }

      return additiveDiagnostics(previous, current.data, {
        path: `${entity.relDir}/${SCHEMA_FILE}`,
        srn: entity.srn,
        previousVersion,
        currentVersion,
      })
    }),
  )

  return perEntity.flat()
}
