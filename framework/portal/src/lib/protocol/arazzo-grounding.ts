import type { Diagnostic } from '../catalog/types'

/**
 * `W_PROTO_ARAZZO_UNGROUNDED` — the one rule this framework states about an
 * `arazzo.yaml`, and the only thing in `src/` that judges one.
 *
 * ## Why this is not in `arazzo.ts`
 *
 * The reader beside this file opens with a promise: it "emits no diagnostic,
 * ever, and is reachable from no diagnostic path", and ADR 0020's consequences
 * call that promise the executable form of decision 3. Putting a code literal
 * in it would falsify its own docblock; *importing* it from here would falsify
 * the second half of the sentence. So this module shares no function with the
 * reader and walks the raw document itself. The duplication is small and the
 * separation is the point: one module draws the file and asserts nothing, the
 * other asserts one thing and draws nothing.
 *
 * It also has to walk the raw document for a reason of its own. `readArazzo`
 * returns `null` when there is no `workflows` array — "the picture has no
 * subject" — and a document with no workflows can still name a source that is
 * not there. The clause about `sourceDescriptions` is decided before any step
 * is looked at.
 *
 * ## What the rule says, and what it deliberately does not
 *
 * `kinds/protocol.md`, "It MUST be grounded in this entity's own artifacts",
 * has two clauses and both are this one warning class:
 *
 * 1. `sourceDescriptions[].url` MUST be a relative URI-reference naming a
 *    **sibling artifact of this entity**. A leading `./` is conventional and
 *    not required; anything that is not the bare name of a file the entity
 *    carries — an absolute URL, a `../` escape, a document that is simply not
 *    there — fails.
 * 2. Every operation, channel or workflow **a step names** MUST resolve, into a
 *    document `sourceDescriptions` names or into a workflow of this same file.
 *
 * "A step names" is the four mutually-exclusive reference fields, and nothing
 * else. `dependsOn`, and the `stepId`/`workflowId` of an `onSuccess` or
 * `onFailure` action, are intra-workflow control flow rather than references
 * between artifacts; the step graph reports an unresolved one as a note under
 * the drawing, which is a different claim from a diagnostic on the catalog.
 *
 * ## Silence is a position, and it is taken four times
 *
 * A rule that fires where it cannot see is worse than one that does not fire.
 * The four are the four `kinds/protocol.md` lists, in its order.
 *
 * 1. **A source whose document is in a grammar this module does not read** —
 *    anything that is not OpenAPI or AsyncAPI — grounds clause 1 and judges no
 *    step reference. Two documents arrive that way: the mini-spec
 *    `transport.yaml` of a `grpc` or `in-process` protocol, whose `channels` is
 *    a surface list rather than AsyncAPI's map, and a sibling that failed to
 *    parse, whose `data` is null and whose complaint the loader already carries.
 *    Resolving against either would report `arazzo.yaml` for a defect in the
 *    other file, if it is a defect at all.
 * 2. **A `sourceDescriptions` entry naming no `url`** names no document, so
 *    there is nothing for grounding to be true or false about.
 * 3. **A source that already failed clause 1** takes one finding, not one per
 *    step that names it. One defect, one diagnostic.
 * 4. **`dependsOn`, and an action's `stepId`/`workflowId`** — see above.
 *
 * ## How a reference resolves, per grammar
 *
 * | Reference       | OpenAPI source                         | AsyncAPI source                       |
 * | --------------- | -------------------------------------- | ------------------------------------- |
 * | `operationId`   | an `operationId` under `paths`         | a key of the `operations` map         |
 * | `operationPath` | a pointer at `paths.<route>.<verb>`    | a pointer at a member of `operations` |
 * | `channelPath`   | nothing — OpenAPI declares no channels | a pointer at a member of `channels`   |
 * | `workflowId`    | a `workflowId` of **this** file        | a `workflowId` of **this** file       |
 *
 * The AsyncAPI cell of the first row is the one resolution rule the framework
 * had to mint: Arazzo says an `operationId` names an operation of the source
 * description, and AsyncAPI 3 names its operations by the keys of a top-level
 * `operations` map rather than by a field inside them. `kinds/protocol.md`
 * states it, so this checker is not the only place it is written down.
 *
 * **A pointer that walks is not a pointer that lands.** The two pointer rows say
 * *a member of a named collection*, and not "any node of the document", because
 * those are different questions and only one of them is the rule. `#/info/title`
 * walks fine; `#/channels/<id>/messages` walks fine and is a real subtree of a
 * real channel. Neither is a channel, and a check that accepted them would print
 * "resolves to no channel" on the day it finally failed while having never
 * looked for one. Membership is decided by identity against the collection the
 * grammar keys its channels or operations by — see {@link collection}.
 *
 * A pointer may also be written bare, `#/channels/<id>`, with no
 * `{$sourceDescriptions.<name>.url}` in front of it. That names no source, and is
 * resolved the way a bare `operationId` is: against every source, satisfied by
 * any one of them. `kinds/protocol.md` states both halves of that symmetry.
 */

/* --------------------------------------------------------------- utilities */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * The four reference fields, in the order the Arazzo Specification lists them.
 *
 * Deliberately a second copy of the list in `arazzo.ts` rather than an import —
 * see the docblock. They are mutually exclusive, so a step carrying two is
 * already outside the standard and the first is taken, which is what the reader
 * does too.
 */
const REFERENCE_FIELDS = ['operationId', 'operationPath', 'channelPath', 'workflowId'] as const

type ReferenceField = (typeof REFERENCE_FIELDS)[number]

interface Reference {
  field: ReferenceField
  value: string
  /** Position in the document — `workflows[0].steps[2]`. */
  where: string
}

/** `{$sourceDescriptions.<name>.url}#/…` — the pointer form. */
const POINTER_SOURCE = /^\{\$sourceDescriptions\.([A-Za-z0-9_\-.]+)\.url\}(#.*)$/
/** `$sourceDescriptions.<name>.<id>` — the operationId form. */
const NAMED_ID = /^\$sourceDescriptions\.([A-Za-z0-9_\-.]+)\.(.+)$/

/**
 * A JSON pointer walked into a document, RFC 6901.
 *
 * Percent-decoding first, then `~1` → `/` and `~0` → `~`, which is the order
 * the two specifications compose in: the pointer arrives inside a URI fragment,
 * so it is URI-decoded before it is a pointer at all. `#/paths/~1refunds/post`
 * is the spelling an OpenAPI-sourced `operationPath` uses.
 */
function pointer(document: unknown, fragment: string): unknown {
  const body = fragment.slice(1).replace(/^\//, '')
  if (body === '') return document
  let cursor: unknown = document
  for (const raw of body.split('/')) {
    let token: string
    try {
      token = decodeURIComponent(raw)
    } catch {
      // A stray `%` is not a pointer this reader can walk. Unresolvable, which
      // is what the caller reports.
      return undefined
    }
    token = token.replace(/~1/g, '/').replace(/~0/g, '~')
    if (isRecord(cursor) && token in cursor) cursor = cursor[token]
    else if (Array.isArray(cursor) && /^\d+$/.test(token) && Number(token) < cursor.length) cursor = cursor[Number(token)]
    else return undefined
  }
  return cursor
}

/* ------------------------------------------------------------------ sources */

/** The grammars whose operation names this module knows how to look up. */
type Grammar = 'openapi' | 'asyncapi' | 'unreadable'

/**
 * Which grammar a grounding document is written in, decided by its own native
 * version key rather than by shape.
 *
 * Shape-sniffing would be wrong here in a way that matters: a *mini-spec*
 * `transport.yaml` also carries a `channels` key, holding a surface list rather
 * than AsyncAPI's channel map, and reading one as the other would resolve
 * nothing and blame the wrong file. `openapi:` and `asyncapi:` are native keys
 * that `lib/catalog/dialects.ts` deliberately never strips, so they are still
 * in `artifact.data` when this runs.
 */
function grammarOf(document: unknown): Grammar {
  if (!isRecord(document)) return 'unreadable'
  if (str(document.openapi) !== null) return 'openapi'
  if (str(document.asyncapi) !== null) return 'asyncapi'
  return 'unreadable'
}

/** Every operation name a grounding document offers. */
function operationNames(document: unknown, grammar: Grammar): Set<string> {
  const names = new Set<string>()
  if (!isRecord(document)) return names
  if (grammar === 'openapi') {
    for (const item of Object.values(isRecord(document.paths) ? document.paths : {})) {
      if (!isRecord(item)) continue
      for (const operation of Object.values(item)) {
        const id = isRecord(operation) ? str(operation.operationId) : null
        if (id !== null) names.add(id)
      }
    }
    return names
  }
  if (grammar === 'asyncapi') {
    // AsyncAPI 3 keys its operations by name; the object under the key carries
    // `action`, `channel` and the rest, and no id of its own.
    for (const key of Object.keys(isRecord(document.operations) ? document.operations : {})) names.add(key)
  }
  return names
}

interface GroundingSource {
  name: string | null
  /** The parsed sibling this source names, or null when it names none. */
  document: unknown
  grammar: Grammar
  /** False when clause 1 already reported this source. */
  grounded: boolean
}

/* -------------------------------------------------------------------- entry */

export interface ArazzoGroundingOptions {
  /**
   * Every artifact the owning entity carries — the same list the entity page
   * joins against to decide whether a source description gets a link. `data` is
   * the loader's parse product, which is why nothing here opens a file.
   */
  siblings: ReadonlyArray<{ file: string; data: unknown }>
  /** Catalog-relative path reported on every diagnostic. */
  path?: string
  /** SRN of the owning protocol, carried onto the diagnostics. */
  srn?: string
}

const CODE = 'W_PROTO_ARAZZO_UNGROUNDED'

/**
 * Check one `arazzo.yaml` against the artifacts its entity carries.
 *
 * Pure: the parsed document in, diagnostics out, no filesystem and no catalog.
 * Every finding is a warning — an Arazzo Description that has drifted is a
 * document that is wrong rather than a catalog that is broken (ADR 0020).
 */
export function arazzoGroundingDiagnostics(data: unknown, options: ArazzoGroundingOptions): Diagnostic[] {
  const path = options.path ?? 'arazzo.yaml'
  const at = (where: string, message: string): Diagnostic => ({
    code: CODE,
    severity: 'warning',
    message: `${where}: ${message}`,
    path,
    ...(options.srn ? { srn: options.srn } : {}),
  })

  // Not a mapping is not an Arazzo Description, and nothing here is entitled to
  // say so — the file's dialect header is somebody else's finding.
  if (!isRecord(data)) return []

  const diagnostics: Diagnostic[] = []
  const carried = new Map(options.siblings.map((sibling) => [sibling.file, sibling.data]))

  /* --- clause 1: every source names a sibling this entity carries ---------- */

  const sources: GroundingSource[] = []
  list(data.sourceDescriptions).forEach((entry, index) => {
    if (!isRecord(entry)) return
    const name = str(entry.name)
    const url = str(entry.url)
    // Arazzo makes `url` REQUIRED and this framework validates none of Arazzo's
    // own fields. A source with no url names no document, so there is nothing
    // for the grounding rule to be true or false about.
    if (url === null) return

    const file = url.replace(/^\.\//, '')
    if (!carried.has(file)) {
      diagnostics.push(
        at(
          `sourceDescriptions[${index}]`,
          `url "${url}" is not a sibling artifact of this entity — name a file the protocol carries, relative and without a host`,
        ),
      )
      sources.push({ name, document: null, grammar: 'unreadable', grounded: false })
      return
    }
    const document = carried.get(file)
    sources.push({ name, document, grammar: grammarOf(document), grounded: true })
  })

  /* --- clause 2: every reference a step names resolves --------------------- */

  const workflows = list(data.workflows).filter(isRecord)
  const workflowIds = new Set(
    workflows.map((workflow) => str(workflow.workflowId)).filter((id): id is string => id !== null),
  )
  const references = collectReferences(workflows)
  /** Whether the "nothing to ground against" finding has already been filed. */
  let groundless = false

  for (const reference of references) {
    if (reference.field === 'workflowId') {
      // A nested workflow resolves inside this same file — ADR 0020 decision 8
      // forbids a split Description, so there is nowhere else it could live.
      if (!workflowIds.has(reference.value)) {
        diagnostics.push(at(reference.where, `workflowId "${reference.value}" is not a workflow of this document`))
      }
      continue
    }

    // Nothing to ground against at all. Reported once, on the missing list,
    // rather than once per step: the defect is the list, and repeating it per
    // step would bury it.
    //
    // Once, and not `break`. Stopping the walk here would silence every later
    // reference too, including a `workflowId` — which resolves inside this same
    // document and needs no source description to be judged at all. A defect
    // that hides a second, unrelated defect is a worse gate than a noisy one.
    if (sources.length === 0) {
      if (!groundless) {
        diagnostics.push(
          at(
            'sourceDescriptions',
            'the document names an operation or channel and declares no source description that names a document,' +
              ' so nothing in this entity grounds it',
          ),
        )
        groundless = true
      }
      continue
    }

    const attributed = attribute(reference, sources)
    // The reference names a source and there is no such source description.
    // That is the reference failing to name a document, not a source failing to
    // be carried, so it is reported where it is written.
    if (attributed.named !== null && attributed.candidates.length === 0) {
      diagnostics.push(
        at(reference.where, `${reference.field} names source "${attributed.named}", which this document does not declare`),
      )
      continue
    }
    // Every candidate either already carries its own clause-1 finding or is a
    // document in a grammar this module does not read. No second complaint.
    const readable = attributed.candidates.filter((source) => source.grounded && source.grammar !== 'unreadable')
    if (readable.length === 0) continue

    if (readable.some((source) => resolves(reference, source))) continue
    diagnostics.push(at(reference.where, unresolved(reference, readable)))
  }

  return diagnostics
}

/* ----------------------------------------------------------------- helpers */

/** Every step's single reference, in document order, with its position. */
function collectReferences(workflows: ReadonlyArray<Record<string, unknown>>): Reference[] {
  const references: Reference[] = []
  workflows.forEach((workflow, workflowIndex) => {
    list(workflow.steps)
      .filter(isRecord)
      .forEach((step, stepIndex) => {
        for (const field of REFERENCE_FIELDS) {
          const value = str(step[field])
          if (value === null) continue
          references.push({ field, value, where: `workflows[${workflowIndex}].steps[${stepIndex}]` })
          return
        }
      })
  })
  return references
}

/**
 * Which sources a reference is resolved against.
 *
 * A reference that names a source names exactly that one. A bare `operationId`
 * names none, and is searched across **all** of them — which is deliberately
 * not what the drawing does. `arazzo.ts` attributes a bare id to the only source
 * when there is exactly one and to nothing when there are several, because a
 * picture that guesses is a picture that invents. A checker has the opposite
 * obligation: the rule says the reference must resolve into *a* document
 * `sourceDescriptions` names, so finding it in any of them satisfies the rule
 * and only finding it in none of them breaks it. Two jobs, two right answers.
 */
function attribute(
  reference: Reference,
  sources: readonly GroundingSource[],
): { named: string | null; candidates: GroundingSource[] } {
  const match = reference.value.match(reference.field === 'operationId' ? NAMED_ID : POINTER_SOURCE)
  if (match === null) return { named: null, candidates: [...sources] }
  const named = match[1]
  return { named, candidates: sources.filter((source) => source.name === named) }
}

/** The methods an OpenAPI path item may key an Operation Object by. */
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'])

/**
 * The nodes a pointer of this field is entitled to land on — the members of the
 * collection the source's grammar keys its channels, or its operations, by.
 *
 * Existence is not the question. `#/info/title` walks, `#/` walks, and
 * `#/channels/<id>/messages` walks into a real subtree of a real channel; none of
 * the three is a channel, and accepting them would make the message this module
 * prints — "resolves to no channel" — a sentence it had never actually tested.
 * So a resolved node is compared, by identity, against the collection it is
 * supposed to be a member of.
 *
 * Which collection is a fact about the grammar rather than about Arazzo:
 * AsyncAPI 3 keys channels under a top-level `channels` map and operations under
 * a top-level `operations` map, and OpenAPI keys an operation by the method verb
 * beneath its path item. An OpenAPI description declares no channels at all, so
 * a `channelPath` naming an OpenAPI source lands on nothing by construction.
 */
function collection(source: GroundingSource, field: 'operationPath' | 'channelPath'): unknown[] {
  const document = source.document
  if (!isRecord(document)) return []
  const members = (value: unknown) => (isRecord(value) ? Object.values(value) : [])

  if (field === 'channelPath') return source.grammar === 'asyncapi' ? members(document.channels) : []
  if (source.grammar === 'asyncapi') return members(document.operations)
  return members(document.paths)
    .filter(isRecord)
    .flatMap((item) => Object.entries(item).filter(([method]) => HTTP_METHODS.has(method)).map(([, operation]) => operation))
}

/** Does this reference land on a channel or an operation of this source's document? */
function resolves(reference: Reference, source: GroundingSource): boolean {
  if (reference.field === 'operationId') {
    const match = reference.value.match(NAMED_ID)
    const id = match === null ? reference.value : match[2]
    return operationNames(source.document, source.grammar).has(id)
  }
  if (reference.field === 'workflowId') return false
  // `operationPath` and `channelPath` are JSON pointers. Arazzo spells a
  // cross-source one with the `{$sourceDescriptions.<name>.url}` prefix; a bare
  // `#/…` is the same pointer with the source left implicit, and is resolved
  // against every source exactly as a bare `operationId` is.
  const match = reference.value.match(POINTER_SOURCE)
  const fragment = match !== null ? match[2] : reference.value.startsWith('#') ? reference.value : null
  // Anything else names a document by URL, which is the form the grounding rule
  // refuses outright — it cannot resolve into a sibling by construction.
  if (fragment === null) return false
  const node = pointer(source.document, fragment)
  if (node === undefined) return false
  return collection(source, reference.field).some((member) => member === node)
}

function unresolved(reference: Reference, sources: readonly GroundingSource[]): string {
  const where =
    sources.length === 1 && sources[0].name !== null
      ? `source "${sources[0].name}"`
      : 'any document this entity carries'
  const what = reference.field === 'channelPath' ? 'channel' : 'operation'
  return `${reference.field} "${reference.value}" resolves to no ${what} in ${where}`
}
