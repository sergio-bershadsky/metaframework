import type { Catalog, Diagnostic, Entity } from '../catalog/types'
import { type Workflow, type WorkflowStep, flattenMessages, parseWorkflow } from './workflow'

/**
 * The four rules `kinds/protocol.md` states about a protocol's **files** — which
 * ones may sit in the directory, which one `transport.yaml` links, and whether
 * the workflow files agree with the `style` the entity declares.
 *
 * | Code                       | The rule, in the kind document's words                                     |
 * | -------------------------- | -------------------------------------------------------------------------- |
 * | `E_PROTO_SPEC_FILE`        | `spec.file` MUST exist; MUST NOT start with `/` or contain `..`            |
 * | `W_PROTO_SPEC_ASYNCAPI`    | a mini-spec transport on an AsyncAPI-capable wire links `format: asyncapi` |
 * | `W_PROTO_ARTIFACT_UNKNOWN` | unrecognised file in the protocol entity directory                         |
 * | `W_PROTO_STYLE_MISMATCH`   | step kinds contradict the declared `style`                                 |
 *
 * ## Two of them are rules about what the loader chose not to read
 *
 * `readArtifacts` reads four extensions and drops everything else, so a
 * `pricing.proto`, a `notes.txt` and a stray subdirectory are all absent from
 * `entity.artifacts` by construction — and `W_PROTO_ARTIFACT_UNKNOWN` is
 * precisely a rule about the files that never became artifacts, while the
 * *existence* half of `E_PROTO_SPEC_FILE` asks after a file whose whole point is
 * that it is written in a foreign convention. Both therefore need a **directory
 * listing**, which is why {@link protocolArtifactDiagnostics} takes one — the
 * same shape, and for the same reason, as `lib/journey/artifacts.ts` (JRN4,
 * JRN9). A protocol the caller supplied no listing for is skipped for those two
 * questions and still judged on the three that need no filesystem: a link that
 * is absolute or escapes, the AsyncAPI-shaped link, and the style audit.
 * Inventing an empty listing would report every file of that entity as missing.
 *
 * ## Reading `transport.yaml` is not validating it
 *
 * Nothing in this framework validates a `transport.yaml` yet — the
 * `E_PROTO_TRANSPORT_*` classes have no emitter. This module does not become one
 * by accident: it reads two keys out of the parsed document (`kind`, `spec`) and
 * asserts nothing else about it. A document that is malformed in any other way
 * gets no complaint from here, and a `spec` that is not a mapping, or whose
 * `file` is not a string, is `E_PROTO_TRANSPORT_SCHEMA`'s business rather than
 * this rule's — so it is passed over rather than reported under the wrong class.
 *
 * `E_PROTO_SPEC_FILE` is dialect-independent (`kinds/protocol.md`, "Two dialects
 * of the transport role"), so the `spec` link is judged wherever it is written.
 * `W_PROTO_SPEC_ASYNCAPI` is not: it is stated over "a **mini-spec** transport on
 * an AsyncAPI-capable wire", and the wire is read from the mini-spec's own `kind`
 * key, which the AsyncAPI dialect does not have.
 */

/* ------------------------------------------------------------------ model */

/**
 * One entry of a protocol entity directory, **recursively** — `transport.yaml`,
 * `workflows`, `workflows/place-order.yaml`.
 *
 * Deliberately not `Dirent`, and deliberately a path rather than a name: a
 * protocol admits one asset subdirectory, so the rule has to speak about what is
 * inside it, and a caller synthesising a listing in a test should not have to
 * construct a `Dirent` to do so. Separators are `/` and there is no leading
 * `./`, matching `Artifact.file`.
 */
export interface ProtocolDirectoryEntry {
  path: string
  directory: boolean
}

/** A finding of one of the checks below, positioned inside the entity directory. */
export interface ProtocolIssue {
  code: string
  severity: 'error' | 'warning'
  message: string
  /** Entity-relative file the finding is about — `workflows/place-order.yaml`. */
  path: string
}

const ENTITY_DOCUMENT = 'index.md'
const TRANSPORT_FILE = 'transport.yaml'
const WORKFLOWS_DIR = 'workflows'

/** The bare fixed sibling names, `kinds/protocol.md` "Entity directory shape". */
const FIXED_ARTIFACTS: ReadonlySet<string> = new Set([TRANSPORT_FILE, 'openapi.yaml', 'arazzo.yaml', 'states.json'])

/** The three wires whose transport role carries an AsyncAPI dialect. */
const ASYNCAPI_WIRES: ReadonlySet<string> = new Set(['kafka', 'websocket', 'amqp'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/* -------------------------------------------- the link `transport.yaml` makes */

/**
 * The path `spec.file` names, exactly as authored, or null when the document
 * makes no link this module can read.
 *
 * Exported because two checks need the same answer: the link is judged by
 * {@link transportSpecIssues}, and the file it names is *recognised by virtue of
 * being linked* — so {@link protocolDirectoryIssues} has to know about it or it
 * would report every `pricing.proto` in the catalog as an unknown artifact.
 */
export function linkedSpecFile(document: unknown): string | null {
  if (!isRecord(document) || !isRecord(document.spec)) return null
  const file = document.spec.file
  return typeof file === 'string' && file.trim().length > 0 ? file : null
}

/**
 * `E_PROTO_SPEC_FILE` and `W_PROTO_SPEC_ASYNCAPI` — the external-spec link.
 *
 * The three clauses of the first are checked in the order the field table writes
 * them, and only one is reported: a path that escapes the entity directory
 * cannot then be asked whether it exists, and answering both questions about one
 * defect prints two findings for one line.
 *
 * `..` is tested as a **substring**, which is what the field table, the bundle
 * and `transport-document/schema.json` all say ("MUST NOT ... contain `..`").
 * Segment-aware would be the more usual reading and is a slightly narrower rule;
 * the three trees agree on the literal one, so the literal one is what runs.
 *
 * `entries` is null when the caller supplied no listing, and existence is then
 * not asked — see the module docblock.
 */
export function transportSpecIssues(
  document: unknown,
  entries: readonly ProtocolDirectoryEntry[] | null,
): ProtocolIssue[] {
  const issues: ProtocolIssue[] = []
  const file = linkedSpecFile(document)
  if (file === null) return issues

  const error = (message: string) =>
    issues.push({ code: 'E_PROTO_SPEC_FILE', severity: 'error', message, path: TRANSPORT_FILE })

  if (file.startsWith('/')) {
    error(`spec.file "${file}" is absolute — the path is relative to the entity directory`)
  } else if (file.includes('..')) {
    error(`spec.file "${file}" escapes the entity directory — a linked spec sits beside index.md`)
  } else if (entries !== null && !entries.some((entry) => !entry.directory && entry.path === normalise(file))) {
    error(`spec.file "${file}" does not exist — nothing in the entity directory carries that name`)
  }

  // The wire is the mini-spec's `kind`; the AsyncAPI dialect has no `spec` and no
  // `kind`, so a document in it reaches neither branch of the condition.
  const kind = isRecord(document) ? document.kind : undefined
  const format = isRecord(document) && isRecord(document.spec) ? document.spec.format : undefined
  if (typeof kind === 'string' && ASYNCAPI_WIRES.has(kind) && format === 'asyncapi') {
    issues.push({
      code: 'W_PROTO_SPEC_ASYNCAPI',
      severity: 'warning',
      message:
        `spec links an AsyncAPI document on a ${kind} wire — write the AsyncAPI dialect of this file instead. ` +
        'A linked copy is a second description of the same wire, unaddressable, with nothing forcing the two to agree.',
      path: TRANSPORT_FILE,
    })
  }

  return issues
}

/** `./openapi.yaml` and `openapi.yaml` name one file. */
function normalise(file: string): string {
  return file.replace(/^\.\//, '')
}

/* ------------------------------------------------------------- the directory */

/**
 * `W_PROTO_ARTIFACT_UNKNOWN` — the protocol entity directory, judged.
 *
 * The recognised set is closed and short: `index.md`, the four fixed bare names,
 * any `*.md` prose sibling, the `workflows/` asset subdirectory holding one
 * `*.yaml` per workflow, and whatever `transport.yaml` links under `spec.file`.
 * Everything else warns — which is the whole point of the fixed names, because
 * `order-placement.transport.yaml`, `protocol.yaml` and `arazzo.json` are each a
 * file the portal will never read while its author believes it is authored.
 *
 * Three boundaries worth stating, because each is a place a looser reading
 * invents findings or a stricter one hides them:
 *
 * - **A workflow's stem is not judged here.** `workflows/PlaceOrder.yaml` is
 *   recognised as a workflow; that the stem is not kebab-case, or does not equal
 *   the document's own `name`, is `E_PROTO_WF_NAME`'s finding on a file this rule
 *   agrees is a workflow. The extension is a different matter — a role's file may
 *   not vary its extension (`structure.md`), so `workflows/place-order.yml` is
 *   unrecognised exactly as `arazzo.json` is.
 * - **A linked spec file may sit in a subdirectory**, and then the subdirectory
 *   is recognised too: `spec.file` is "a path relative to the entity directory",
 *   and warning about a directory the transport explicitly links into would
 *   report the link as litter.
 * - **Any other subdirectory warns**, including one holding an `index.md`. That
 *   also draws `E_STRUCT_NESTED_ENTITY`, which names the *owner* of the nested
 *   entity; this one names the entry that does not belong in a protocol
 *   directory. `lib/journey/artifacts.ts` makes the same call for JRN9.
 *
 * Dot- and underscore-prefixed entries are skipped at every depth, which is the
 * loader's own convention for every directory it walks.
 */
export function protocolDirectoryIssues(
  entries: readonly ProtocolDirectoryEntry[],
  linked: readonly string[] = [],
): ProtocolIssue[] {
  const linkedFiles = new Set(linked.map(normalise))
  const linkedDirs = new Set<string>()
  for (const file of linkedFiles) {
    const segments = file.split('/')
    for (let depth = 1; depth < segments.length; depth += 1) linkedDirs.add(segments.slice(0, depth).join('/'))
  }

  const issues: ProtocolIssue[] = []
  // Sorted rather than taken in the caller's order: `readdir` order is a fact
  // about the filesystem, and two machines listing one directory must not
  // produce two diagnostics lists. The loader sorts its artifact list for the
  // same reason.
  for (const entry of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    const segments = entry.path.split('/')
    if (segments.some((segment) => segment.startsWith('.') || segment.startsWith('_'))) continue
    if (recognised(entry, segments, linkedFiles, linkedDirs)) continue
    issues.push({
      code: 'W_PROTO_ARTIFACT_UNKNOWN',
      severity: 'warning',
      message: unknownMessage(entry, segments),
      path: entry.path,
    })
  }
  return issues
}

function recognised(
  entry: ProtocolDirectoryEntry,
  segments: readonly string[],
  linkedFiles: ReadonlySet<string>,
  linkedDirs: ReadonlySet<string>,
): boolean {
  if (entry.directory) return entry.path === WORKFLOWS_DIR || linkedDirs.has(entry.path)
  if (linkedFiles.has(entry.path)) return true
  if (segments.length === 1) {
    return entry.path === ENTITY_DOCUMENT || FIXED_ARTIFACTS.has(entry.path) || entry.path.endsWith('.md')
  }
  return segments.length === 2 && segments[0] === WORKFLOWS_DIR && segments[1].endsWith('.yaml')
}

function unknownMessage(entry: ProtocolDirectoryEntry, segments: readonly string[]): string {
  if (entry.directory) {
    return segments[0] === WORKFLOWS_DIR
      ? `"${entry.path}/" — workflows/ holds one *.yaml per workflow and nothing below it`
      : `"${entry.path}/" — workflows/ is the only asset subdirectory a protocol admits`
  }
  if (segments[0] === WORKFLOWS_DIR) {
    return segments.length > 2
      ? `"${entry.path}" — workflows/ holds one *.yaml per workflow and nothing below it`
      : `"${entry.path}" is not a workflow — workflows/ holds one *.yaml per workflow, and a role's file may not vary its extension`
  }
  return (
    `"${entry.path}" is not a file this kind defines — the sibling names are bare and fixed ` +
    `(${[...FIXED_ARTIFACTS].join(', ')}), and only *.md prose siblings and a file linked by ` +
    'transport.yaml `spec.file` may sit beside them'
  )
}

/* ------------------------------------------------------------------ the style */

/**
 * `W_PROTO_STYLE_MISMATCH` — the two cross-checks that keep `style` from being
 * dead metadata.
 *
 * `kinds/protocol.md` states exactly two, and this implements exactly two:
 *
 * 1. **`style: bus` with a `kind: call` step.** "A bus sender does not name a
 *    callee": under `bus` the sender publishes and receivers are found by
 *    subscription, so a step that invokes a named callee is the request-response
 *    shape wearing the wrong declaration. Reported per step, where the kind
 *    document's own counter-example annotates it — the reader needs the line.
 * 2. **`style: request-response` where no workflow answers.** "No `call`/`return`
 *    pair anywhere": the declaration claims a correlated reply comes back, so at
 *    least one call somewhere in the protocol's workflows must be answered.
 *    Reported once, against `index.md`, because the defect is one declaration and
 *    there is no single workflow to blame.
 *
 * `point-to-point` has **no** check. Its contradiction — a contracted reply,
 * which is the request-response row of the decision table — would be a third
 * cross-check, and the kind document says two.
 *
 * Two readings inside rule 2 that the spec does not spell out, decided here and
 * stated so a later reader can disagree with the reasoning rather than guess it:
 *
 * - **A protocol with no workflows never fires.** "No workflow ever answers"
 *   presupposes a workflow, and "a protocol with only `index.md` is legal (an
 *   intent-level protocol under design)" is the same document's rule. Five of the
 *   protocols shipped in `solutions/` are exactly that.
 * - **An `error` answers a call, as a `return` does.** `W_PROTO_WF_ORPHAN_RETURN`
 *   is defined over "`return`/`error` with no preceding counterpart `call`", so
 *   the framework already treats the two as one class of answer; a call answered
 *   only by a problem document is still a correlated reply. Making the two rules
 *   disagree about what "answers" means would be the worse defect.
 *
 * And one that it does: a pair must be **matched** ("the workflow does contain
 * matched `call`/`return` pairs"), so the answer has to be visible from the
 * call's own scope and travel in the opposite direction. That is
 * `W_PROTO_WF_ORPHAN_RETURN`'s visibility rule, restated here rather than
 * imported because `workflow.ts` keeps it private — sibling compartments do not
 * see each other, which is why the scope is threaded by value.
 */
export function styleIssues(
  style: string,
  workflows: ReadonlyArray<{ file: string; workflow: Workflow }>,
): ProtocolIssue[] {
  const issues: ProtocolIssue[] = []

  if (style === 'bus') {
    for (const { file, workflow } of workflows) {
      for (const step of flattenMessages(workflow.steps)) {
        if (step.kind !== 'call') continue
        issues.push({
          code: 'W_PROTO_STYLE_MISMATCH',
          severity: 'warning',
          message:
            `${step.path}: "${step.message}" is a call from ${step.from} to ${step.to.join(', ')}, but this ` +
            'protocol declares style: bus — a bus sender publishes and its receivers are found by subscription, ' +
            'so it does not name a callee',
          path: file,
        })
      }
    }
    return issues
  }

  if (style === 'request-response' && workflows.length > 0) {
    if (workflows.some(({ workflow }) => answersACall(workflow.steps, []))) return issues
    issues.push({
      code: 'W_PROTO_STYLE_MISMATCH',
      severity: 'warning',
      message:
        'declares style: request-response, but no workflow ever answers — no call is followed, in a scope that ' +
        `can see it, by a return or error going back the other way (${workflows.length} workflow(s) read)`,
      path: ENTITY_DOCUMENT,
    })
  }

  return issues
}

/** Does any `return`/`error` here answer a `call` that is visible from its scope? */
function answersACall(
  steps: readonly WorkflowStep[],
  visible: ReadonlyArray<{ from: string; to: readonly string[] }>,
): boolean {
  let scope = [...visible]
  for (const step of steps) {
    if (step.type !== 'message') {
      // A fragment's compartments each see the calls made before the fragment,
      // and none of each other's.
      if (step.compartments.some((compartment) => answersACall(compartment.steps, scope))) return true
      continue
    }
    if (step.kind === 'return' || step.kind === 'error') {
      if (scope.some((call) => call.to.includes(step.from) && step.to.includes(call.from))) return true
    }
    if (step.kind === 'call') scope = [...scope, { from: step.from, to: step.to }]
  }
  return false
}

/* ------------------------------------------------------------- composition */

/**
 * Every protocol file rule above, over the resolved catalog, as diagnostics.
 *
 * `listings` is keyed by entity SRN and holds the entity directory as a
 * recursive listing — see {@link ProtocolDirectoryEntry}. A protocol absent from
 * the map keeps the checks that need no filesystem, exactly as
 * `journeyArtifactDiagnostics` skips only what its listing was for.
 *
 * The workflow documents are re-parsed and every issue that parse produces is
 * discarded: `lib/catalog/artifact-checks.ts` already runs the same parser over
 * the same files and owns those findings. Only `workflow.steps` is read out of
 * them — a second copy of `E_PROTO_WF_*` would be the same disagreement the
 * artifact checks were written to end.
 */
export function protocolArtifactDiagnostics(
  catalog: Catalog,
  listings: ReadonlyMap<string, readonly ProtocolDirectoryEntry[]>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'protocol') continue

    const listing = listings.get(entity.srn) ?? null
    // An artifact that would not parse already carries the loader's own
    // complaint, and `null` data says nothing about a link or a style.
    const carried = entity.artifacts.find((artifact) => artifact.file === TRANSPORT_FILE)
    const transport = carried && !carried.error ? carried : undefined
    const linked = transport ? linkedSpecFile(transport.data) : null

    // A `transport.yaml` that did not parse takes the directory rule down with
    // it, and deliberately. What is linked is the difference between an
    // attachment and litter, so with the link unreadable this check would report
    // a legitimately linked `pricing.proto` as an unknown artifact — a second,
    // wrong complaint about a file whose real defect is already reported on the
    // transport. Silence where it cannot see.
    const judgeDirectory = listing !== null && (carried === undefined || transport !== undefined)

    const issues: ProtocolIssue[] = [
      ...(judgeDirectory && listing ? protocolDirectoryIssues(listing, linked === null ? [] : [linked]) : []),
      ...(transport ? transportSpecIssues(transport.data, listing) : []),
      ...styleIssues(declaredStyle(entity), workflowsOf(entity)),
    ]

    for (const issue of issues) {
      diagnostics.push({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        path: issue.path ? `${entity.relDir}/${issue.path}` : entity.relDir,
        srn: entity.srn,
      })
    }
  }

  return diagnostics
}

/** `style` as authored; empty when it is absent or not a string (`E_FM_SCHEMA`). */
function declaredStyle(entity: Entity): string {
  const style = (entity.frontmatter as { style?: unknown }).style
  return typeof style === 'string' ? style : ''
}

/** Every workflow of this protocol that parsed into a document with steps. */
function workflowsOf(entity: Entity): Array<{ file: string; workflow: Workflow }> {
  const workflows: Array<{ file: string; workflow: Workflow }> = []
  for (const artifact of entity.artifacts) {
    if (artifact.error) continue
    if (!artifact.file.startsWith(`${WORKFLOWS_DIR}/`)) continue
    if (artifact.extension !== '.yaml' && artifact.extension !== '.yml') continue
    // No options: the file's own contract is `artifact-checks.ts`'s business, and
    // the only thing read out of the result here is the step tree.
    const { workflow } = parseWorkflow(artifact.data)
    if (workflow) workflows.push({ file: artifact.file, workflow })
  }
  return workflows
}
