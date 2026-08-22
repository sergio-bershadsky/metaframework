import type { Artifact, Catalog, Diagnostic, Entity } from '../catalog/types'
import { type SchemaRegistry, schemaValidator } from '../schema/registry'
import { formatSrn, parseSrn, resolveRef } from '../srn/srn'

/**
 * The three datamodel rules that read a model *from the outside* —
 * framework/spec/kinds/datamodel.md, "Entity directory shape" and "Frontmatter
 * additions" — as an executable copy.
 *
 * `lib/schema/registry.ts` already reads every `schema.json` from the inside: its
 * dialect, its identity, its keywords, its `$ref` graph. What it never does is
 * ask what the rest of the catalog *does* with the model, and three codes sat in
 * the portal's debt register saying exactly that — the registry "compiles
 * validators but never runs a schema's own examples through them", `abstract` is
 * "never read back when a schema is used", and `usage` is "never compared with
 * how the schema is referenced". Each of those is a join, and a join needs the
 * catalog:
 *
 * - **`E_DM_EXAMPLE_INVALID`** needs the entity's own compiled validator, which
 *   is what {@link SchemaRegistry} is for. Nothing is re-implemented here: the
 *   registry holds one ajv instance in which every `$ref` already resolves, so
 *   validating an example is a lookup and a call.
 * - **`W_DM_ABSTRACT_USE`** and **`W_DM_USAGE_MISMATCH`** both need the set of
 *   datamodels a protocol names as a **message payload**, which is spread across
 *   two artifacts and three dialects. {@link payloadReferences} is that set, and
 *   it is deliberately the only catalog-wide scan in this module.
 *
 * What is *not* here, and why. `E_DM_NOT_ADDITIVE` was the fourth datamodel gap
 * and is now ./additive.ts, in its own module rather than a fourth branch in
 * this one, because it takes an input nothing else in the pipeline takes: it
 * compares version N read from **git** with N+1 on the filesystem (datamodel.md,
 * "What the portal checks mechanically"), so it is `async` and it spawns a
 * subprocess, and `withEvolutionChecks` is the fold that owns those two facts.
 * The half of the old note that survives is a limit on what it can see rather
 * than a reason not to run it: diffing the working tree against the commit
 * carrying the *current* version is `E_VER_UNBUMPED`'s question, not this one,
 * so a breaking edit that also forgot its bump is measured against N−1.
 */

/* --------------------------------------------------------------- payloads */

/** Where a protocol's workflow steps live, and the one file per protocol that describes the wire. */
const WORKFLOWS_DIR = 'workflows/'
const TRANSPORT_ARTIFACT = 'transport.yaml'
const EXAMPLES_DIR = 'examples/'

/**
 * The keys that carry a payload reference, per artifact — protocol.md, "Surface
 * lists" and "Payload binding to datamodels".
 *
 * The split is the reason this is a table rather than one key list. In a
 * workflow step `message:` is the **arrow label** and the SRN lives in the
 * separate `payload:` key; in a transport surface list `message:` *is* the SRN
 * (a kafka topic object, a websocket channel object, an amqp binding object).
 * One list would either miss the transport surfaces or read every arrow label as
 * a reference.
 *
 * Both transport dialects are covered without parsing either: the mini-spec
 * spells a surface entry's payload `request` / `response` / `message`, and the
 * AsyncAPI dialect spells a Message Object's payload `x-srn-payload` (ADR 0017).
 * A key scan is dialect-agnostic by construction, which is what lets these two
 * warnings land before the transport reader that the `E_PROTO_TRANSPORT_*` codes
 * are still waiting for.
 */
const PAYLOAD_KEYS: ReadonlyArray<{ artifact: (file: string) => boolean; keys: readonly string[] }> = [
  { artifact: (file) => file.startsWith(WORKFLOWS_DIR), keys: ['payload'] },
  { artifact: (file) => file === TRANSPORT_ARTIFACT, keys: ['request', 'response', 'message', 'x-srn-payload'] },
]

export interface PayloadReference {
  /** SRN of the protocol that names it. */
  protocol: string
  /** Catalog-relative file, e.g. `acme/product/shop/protocol/x/workflows/place-order.yaml`. */
  file: string
  /** RFC 6901 pointer of the key inside that document. */
  pointer: string
  /** The reference exactly as authored, version pin included. */
  ref: string
  /** Unversioned SRN of the datamodel it resolves to. */
  datamodel: string
}

/**
 * Every datamodel a protocol names as a message payload, with its site.
 *
 * A candidate counts only when it **resolves to a datamodel that exists**. That
 * filter is doing real work rather than being defensive: it is what makes a key
 * scan safe. A `message:` in a workflow step is a label, a `response:` in some
 * future binding block might be prose, and neither resolves to a registered
 * datamodel — while a broken payload reference is already somebody else's
 * finding (`E_SRN_DANGLING`, `E_PROTO_PAYLOAD_KIND`) and must not become a
 * second, differently-worded one here.
 */
export function payloadReferences(catalog: Catalog): PayloadReference[] {
  const references: PayloadReference[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'protocol') continue
    for (const artifact of entity.artifacts) {
      if (artifact.error) continue
      const row = PAYLOAD_KEYS.find((candidate) => candidate.artifact(artifact.file))
      if (!row) continue

      for (const site of scanKeys(artifact.data, row.keys)) {
        const target = resolvedEntityRef(entity.srn, site.ref)
        if (!target) continue
        if (catalog.entities.get(target)?.kind !== 'datamodel') continue
        references.push({
          protocol: entity.srn,
          file: `${entity.relDir}/${artifact.file}`,
          pointer: site.pointer,
          ref: site.ref,
          datamodel: target,
        })
      }
    }
  }

  return references
}

/** Every string value sitting under one of `keys`, anywhere in the document. */
function scanKeys(node: unknown, keys: readonly string[], pointer = ''): Array<{ pointer: string; ref: string }> {
  const found: Array<{ pointer: string; ref: string }> = []

  if (Array.isArray(node)) {
    node.forEach((item, index) => found.push(...scanKeys(item, keys, `${pointer}/${index}`)))
    return found
  }
  if (node === null || typeof node !== 'object') return found

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const at = `${pointer}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`
    // A matching key whose value is *not* a string is not a reference — an
    // AsyncAPI Message Object's `payload` is a Schema Object — so it is walked
    // like any other node rather than skipped.
    if (keys.includes(key) && typeof value === 'string') found.push({ pointer: at, ref: value })
    else found.push(...scanKeys(value, keys, at))
  }
  return found
}

/**
 * One reference as its canonical unversioned SRN, or null.
 *
 * Null covers three different facts on purpose — unparseable, cross-solution, or
 * an artifact address — because each of them is a diagnostic somebody else
 * already files against the same surface, and this module's job is a join, not a
 * second opinion about references.
 */
function resolvedEntityRef(base: string, reference: string): string | null {
  try {
    const parsed = parseSrn(resolveRef(base, reference))
    if (parsed.artifact !== null) return null
    return formatSrn({ ...parsed, version: null })
  } catch {
    return null
  }
}

/* ------------------------------------------------------------ diagnostics */

/**
 * Every datamodel rule that needs more than the schema document.
 *
 * Composed into the catalog after {@link SchemaRegistry} exists, for the reason
 * `withEnvironmentChecks` is composed there too: the example check is a call
 * into the registry's ajv, and the registry needs the catalog.
 */
export function datamodelDiagnostics(catalog: Catalog, registry: SchemaRegistry): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const payloads = payloadReferences(catalog)

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'datamodel') continue
    const named = payloads.filter((payload) => payload.datamodel === entity.srn)
    diagnostics.push(...exampleDiagnostics(entity, registry))
    diagnostics.push(...abstractUseDiagnostics(catalog, entity, named))
    diagnostics.push(...usageMismatchDiagnostics(entity, named))
  }

  return diagnostics
}

/** `examples/*.json` on one entity, in file order. */
function examplesOf(entity: Entity): Artifact[] {
  return entity.artifacts.filter(
    (artifact) => artifact.file.startsWith(EXAMPLES_DIR) && artifact.extension === '.json',
  )
}

/**
 * `E_DM_EXAMPLE_INVALID` — every file in `examples/` validates against the
 * entity's own `schema.json`.
 *
 * "They are documentation the build keeps honest" (datamodel.md): an example is
 * the one artifact whose whole purpose is to be a true instance, and a
 * downstream test suite may pin `…​.examples.canonical` and receive bytes the
 * build claims to have validated. Until this ran, that claim was unbacked.
 *
 * One diagnostic per file rather than per ajv error. An instance that drifted
 * from its schema usually fails in several places at once, and the reader's unit
 * of work is the file — `/diagnostics` listing eleven rows for one example is a
 * page nobody finishes reading.
 *
 * A schema that could not be compiled yields no validator and therefore nothing
 * here: the registry has already said why, in `E_DM_*` codes pathed at the
 * schema, and "your example is invalid" would be a misleading second complaint
 * about a file that is fine.
 */
export function exampleDiagnostics(entity: Entity, registry: SchemaRegistry): Diagnostic[] {
  const examples = examplesOf(entity)
  if (examples.length === 0) return []

  const diagnostics: Diagnostic[] = []
  const validate = schemaValidator(registry, entity.srn)

  for (const example of examples) {
    const file = `${entity.relDir}/${example.file}`
    // A file that is not JSON cannot be an instance of anything. The loader kept
    // the parser's message; without this branch the most broken example in the
    // catalog would be the one file this check said nothing about.
    if (example.error) {
      diagnostics.push({
        code: 'E_DM_EXAMPLE_INVALID',
        severity: 'error',
        message: `does not parse as JSON: ${example.error}`,
        path: file,
        srn: entity.srn,
      })
      continue
    }
    if (!validate) continue
    if (validate(example.data)) continue

    const reasons = (validate.errors ?? [])
      .map((error) => `${error.instancePath || '(root)'}: ${error.message ?? 'invalid'}`)
      .join('; ')
    diagnostics.push({
      code: 'E_DM_EXAMPLE_INVALID',
      severity: 'error',
      message: `fails ${entity.srn}: ${reasons || 'the instance does not validate'}`,
      path: file,
      srn: entity.srn,
    })
  }

  return diagnostics
}

/**
 * `W_DM_ABSTRACT_USE` — a base nobody instantiates, instantiated.
 *
 * The kind document names exactly three ways to get this wrong, and the class
 * table repeats them as one line: an abstract model "used as a payload/`exposes`
 * target, or carrying `examples/`". All three are the same mistake seen from
 * different sides — something outside the schema layer is treating a base as a
 * thing there can be an instance of.
 *
 * What is deliberately **not** flagged is the fourth case an over-eager reading
 * would add: a `relations.uses` edge toward an abstract model. `allOf` inheritance
 * is "the intended use and is never flagged", and a `uses` edge is the
 * frontmatter spelling of the same relationship — the shipped catalog has a
 * product declaring `uses: /datamodel/base-record@1` precisely so a pinned
 * review target exists that the URL `$ref` cannot carry (datamodel.md, "Do not
 * mirror schema references in relations"). Flagging it would make correct
 * authoring red.
 *
 * Pathed at the datamodel's own `index.md`, where `abstract:` is declared,
 * because that is where the two possible fixes meet: either this model is not
 * really a base, or the referrer should be pointing at a concrete descendant.
 */
export function abstractUseDiagnostics(
  catalog: Catalog,
  entity: Entity,
  named: readonly PayloadReference[],
): Diagnostic[] {
  if (entity.frontmatter.abstract !== true) return []

  const diagnostics: Diagnostic[] = []
  const at = (message: string) =>
    diagnostics.push({
      code: 'W_DM_ABSTRACT_USE',
      severity: 'warning',
      message,
      path: `${entity.relDir}/index.md`,
      srn: entity.srn,
    })

  const examples = examplesOf(entity)
  if (examples.length > 0) {
    at(
      `abstract, and carries ${examples.map((example) => `"${example.file}"`).join(', ')} — ` +
        'an example is an instance, and a base is never instantiated on its own; move it to a concrete descendant',
    )
  }

  for (const payload of named) {
    at(
      `abstract, and named as a message payload by ${payload.protocol} (${payload.file}) — ` +
        'a wire payload is an instance; point it at a concrete descendant',
    )
  }

  for (const edge of catalog.inbound.get(entity.srn) ?? []) {
    if (edge.edge !== 'exposes') continue
    at(
      `abstract, and an "exposes" target of ${edge.from} — ` +
        'what a container exposes is a model something can be an instance of, not the base it shares',
    )
  }

  return diagnostics
}

/** The two `usage` values that contradict being carried on a wire. */
const NOT_EXCHANGEABLE: Record<string, string> = {
  storage: 'a model that crosses a boundary is "exchange" or "both"',
  config: 'a component’s configuration is not a wire payload — either the protocol names the wrong model, or a process is sending its own settings to somebody',
}

/**
 * `W_DM_USAGE_MISMATCH` — the declared destination and the observed one disagree.
 *
 * A warning rather than an error because the protocol may legitimately be ahead
 * of the datamodel's review (datamodel.md, "Frontmatter additions"): the field
 * cannot be inferred, so the catalog can be mid-edit in either direction. On a
 * `usage: config` model the same document says the warning "is rarely the
 * protocol's fault and almost always a real finding", which is why the message
 * differs by value rather than being one sentence for both.
 *
 * One diagnostic per datamodel, listing every protocol that names it, because
 * the fix is a single field and the reader needs the whole case for it at once.
 */
export function usageMismatchDiagnostics(entity: Entity, named: readonly PayloadReference[]): Diagnostic[] {
  const usage = entity.frontmatter.usage
  if (typeof usage !== 'string') return []
  const because = NOT_EXCHANGEABLE[usage]
  if (!because || named.length === 0) return []

  const sites = [...new Set(named.map((payload) => `${payload.protocol} (${payload.file})`))].sort()
  return [
    {
      code: 'W_DM_USAGE_MISMATCH',
      severity: 'warning',
      message: `declares usage: ${usage} and is named as a message payload by ${sites.join(', ')} — ${because}`,
      path: `${entity.relDir}/index.md`,
      srn: entity.srn,
    },
  ]
}
