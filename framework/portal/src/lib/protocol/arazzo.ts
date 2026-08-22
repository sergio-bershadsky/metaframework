/**
 * A read-only view of an Arazzo Description, and the step graph drawn from it.
 *
 * ## What this module is allowed to be
 *
 * `arazzo.yaml` is **grammar-free**: `kinds/protocol.md` states no field table
 * for it, so no shape rule can be broken in one, and the file is served to
 * `/artifacts` exactly as authored. Exactly one rule reaches it —
 * `W_PROTO_ARAZZO_UNGROUNDED`, which asks where the document's references *land*
 * — and it lives next door in `./arazzo-grounding.ts`, deliberately sharing not
 * one function with this file. That is the line this module must stay on the far
 * side of: **reading is not validating**.
 *
 * The distinction is the whole design. A validator asserts a grammar, and this
 * framework has no Arazzo grammar to assert — no published JSON Schema for
 * Arazzo 1.1 was located, which is the ground ADR 0020 rejected *parsing*
 * `arazzo.yaml` the way the AsyncAPI dialect of `transport.yaml` is specified to
 * be parsed. A reader asserts nothing. It recognises the fields it knows, draws
 * those, silently passes over everything else, and never turns a surprise into a
 * complaint. So this module:
 *
 * - returns `null` rather than throwing, for any input at all;
 * - emits no diagnostic, ever, and is reachable from no diagnostic path;
 * - treats every field as optional, including the ones the specification marks
 *   REQUIRED — a step with no `stepId` is drawn as an unnamed step rather than
 *   reported. The specification's own 1.1 prose marks only `stepId` REQUIRED and
 *   states the four reference fields to be mutually exclusive without saying one
 *   MUST be present, so "a step must reference something" is not a claim this
 *   file is entitled to make;
 * - reports what it did *not* draw ({@link ArazzoWorkflow.omitted}) instead of
 *   pretending the drawing is the document. The source pane beside it is.
 *
 * Field spellings come from the Arazzo Specification 1.1.0, Step Object /
 * Success Action Object / Failure Action Object / Criterion Object fixed-field
 * tables, read from the OAI repository rather than from memory.
 *
 * ## The two halves
 *
 * 1. {@link readArazzo} turns raw YAML data into a typed tree.
 * 2. {@link arazzoGraph} turns one workflow of that tree into nodes and edges —
 *    numbers and ids only, no DOM, no React, which is what makes the drawing
 *    unit-testable without a browser.
 */

/* ------------------------------------------------------------------ model */

/** How a step names the thing it drives. Exactly the four the spec defines. */
export type StepReference =
  | { kind: 'operationId'; value: string; source: string | null }
  | { kind: 'operationPath'; value: string; source: string | null }
  | { kind: 'channelPath'; value: string; source: string | null }
  /** `workflowId` — a nested Arazzo workflow, not an operation. */
  | { kind: 'workflow'; value: string; source: null }
  /** The step references nothing this reader recognises. */
  | { kind: 'none'; value: null; source: null }

/** `successCriteria[]`, and the `criteria[]` of a success or failure action. */
export interface ArazzoCriterion {
  condition: string
  /** `simple` (the spec's default), `regex`, `jsonpath`, `xpath`. */
  type?: string
  context?: string
}

/**
 * One `onSuccess` or `onFailure` entry.
 *
 * The two objects differ only in which `type` values are legal — `end`/`goto`
 * for success, `end`/`retry`/`goto` for failure — so one shape carries both and
 * `outcome` records which list it came from. `type` is kept as the authored
 * string rather than narrowed to a union: an unknown value is a document this
 * reader does not understand, not a document it may reject.
 */
export interface ArazzoAction {
  outcome: 'success' | 'failure'
  name: string | null
  type: string | null
  /** Target step within this workflow. Mutually exclusive with `workflowId`. */
  stepId: string | null
  workflowId: string | null
  criteria: ArazzoCriterion[]
  /** `retryLimit`, for a `retry` action that declares one. */
  retryLimit: number | null
}

export interface ArazzoStep {
  /** As authored; null when the step declares none. */
  stepId: string | null
  /** Position in `steps[]`, 0-based. The identity a step without an id has. */
  index: number
  description: string | null
  reference: StepReference
  /** AsyncAPI message-flow intent. `send` | `receive` as the spec defines them. */
  action: string | null
  /** `dependsOn[]` — stepIds that must complete first. */
  dependsOn: string[]
  successCriteria: ArazzoCriterion[]
  actions: ArazzoAction[]
}

export interface ArazzoWorkflow {
  workflowId: string | null
  index: number
  summary: string | null
  description: string | null
  steps: ArazzoStep[]
  /**
   * Step-level fields present in this workflow that the graph does not draw,
   * de-duplicated and sorted — `outputs`, `requestBody`, `parameters`,
   * `timeout`, `correlationId`, and anything else a document carries.
   *
   * Derived from the document rather than listed by hand, so it cannot fall
   * behind what the drawing actually covers, and so a reader is told what is in
   * the file but not in the picture instead of having to compare the two.
   */
  omitted: string[]
}

export interface ArazzoSource {
  name: string | null
  /** `openapi` | `asyncapi` | `arazzo`, as authored. */
  type: string | null
  url: string | null
}

export interface ArazzoDescription {
  /** The `arazzo:` version string — the dialect key, as authored. */
  version: string | null
  title: string | null
  summary: string | null
  description: string | null
  sources: ArazzoSource[]
  workflows: ArazzoWorkflow[]
}

/* ----------------------------------------------------------------- readers */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A string, or nothing. Numbers are not coerced — `1.1` is not `'1.1'`. */
function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * The source a reference is attributed to, or null.
 *
 * Arazzo writes a cross-source reference as `{$sourceDescriptions.<name>.url}`
 * inside `operationPath`/`channelPath`, and as `$sourceDescriptions.<name>.<id>`
 * for an `operationId`. Both spellings name the source, so both are read.
 *
 * A bare `operationId` names no source. It is attributed to the only source
 * when the document declares exactly one — which is unambiguous, and is every
 * file in this catalog — and to nothing at all when there are several. Guessing
 * which of two sources a bare id came from is exactly the kind of plausible
 * invention this reader is built not to make.
 */
function attribute(reference: string, sources: ArazzoSource[]): string | null {
  const named = reference.match(/\$sourceDescriptions\.([A-Za-z0-9_\-.]+?)(?:\.url\}|\.)/)
  if (named) return named[1]
  const only = sources.length === 1 ? sources[0].name : null
  return only
}

function readCriteria(value: unknown): ArazzoCriterion[] {
  const criteria: ArazzoCriterion[] = []
  for (const entry of list(value)) {
    if (!isRecord(entry)) continue
    const condition = str(entry.condition)
    if (condition === null) continue
    criteria.push({
      condition,
      ...(str(entry.type) ? { type: str(entry.type) as string } : {}),
      ...(str(entry.context) ? { context: str(entry.context) as string } : {}),
    })
  }
  return criteria
}

function readActions(value: unknown, outcome: 'success' | 'failure'): ArazzoAction[] {
  const actions: ArazzoAction[] = []
  for (const entry of list(value)) {
    if (!isRecord(entry)) continue
    actions.push({
      outcome,
      name: str(entry.name),
      type: str(entry.type),
      stepId: str(entry.stepId),
      workflowId: str(entry.workflowId),
      criteria: readCriteria(entry.criteria),
      retryLimit: typeof entry.retryLimit === 'number' ? entry.retryLimit : null,
    })
  }
  return actions
}

/**
 * The four reference fields, in the order the specification lists them.
 *
 * They are mutually exclusive, so a document carrying two is already outside the
 * standard — the first is taken and the second ignored, because dropping the
 * step or complaining about it would both be this reader judging a grammar it
 * does not own.
 */
const REFERENCE_FIELDS = ['operationId', 'operationPath', 'channelPath', 'workflowId'] as const

function readReference(step: Record<string, unknown>, sources: ArazzoSource[]): StepReference {
  for (const field of REFERENCE_FIELDS) {
    const value = str(step[field])
    if (value === null) continue
    if (field === 'workflowId') return { kind: 'workflow', value, source: null }
    return { kind: field, value, source: attribute(value, sources) }
  }
  return { kind: 'none', value: null, source: null }
}

/** Step-level fields the graph draws. Everything else lands in `omitted`. */
const DRAWN_STEP_FIELDS = new Set<string>([
  'stepId',
  'description',
  ...REFERENCE_FIELDS,
  'action',
  'dependsOn',
  'successCriteria',
  'onSuccess',
  'onFailure',
])

/**
 * Read an Arazzo Description.
 *
 * Returns null only when there is nothing a step graph could be drawn from: a
 * document that is not a mapping, or one carrying no `workflows` array. Both are
 * "the picture has no subject", not "the file is wrong" — the file is still
 * served, and the source pane still shows it.
 */
export function readArazzo(data: unknown): ArazzoDescription | null {
  if (!isRecord(data)) return null
  if (!Array.isArray(data.workflows)) return null

  const sources: ArazzoSource[] = list(data.sourceDescriptions)
    .filter(isRecord)
    .map((entry) => ({ name: str(entry.name), type: str(entry.type), url: str(entry.url) }))

  const info = isRecord(data.info) ? data.info : {}

  const workflows = data.workflows.filter(isRecord).map((raw, index): ArazzoWorkflow => {
    const omitted = new Set<string>()
    const steps = list(raw.steps)
      .filter(isRecord)
      .map((step, stepIndex): ArazzoStep => {
        for (const key of Object.keys(step)) {
          if (!DRAWN_STEP_FIELDS.has(key)) omitted.add(key)
        }
        return {
          stepId: str(step.stepId),
          index: stepIndex,
          description: str(step.description),
          reference: readReference(step, sources),
          action: str(step.action),
          dependsOn: list(step.dependsOn).filter((entry): entry is string => typeof entry === 'string'),
          successCriteria: readCriteria(step.successCriteria),
          actions: [...readActions(step.onSuccess, 'success'), ...readActions(step.onFailure, 'failure')],
        }
      })

    return {
      workflowId: str(raw.workflowId),
      index,
      summary: str(raw.summary),
      description: str(raw.description),
      steps,
      omitted: [...omitted].sort(),
    }
  })

  return {
    version: str(data.arazzo),
    title: str(info.title),
    summary: str(info.summary),
    description: str(info.description),
    sources,
    workflows,
  }
}

/* ------------------------------------------------------------------ graph */

export type ArazzoEdgeKind =
  /** Implicit sequence — the order the steps are written in. Inferred. */
  | 'order'
  /** `dependsOn` — a prerequisite the document states. Declared. */
  | 'depends'
  /** `onSuccess` — `goto` to a step, or `end`. */
  | 'success'
  /** `onFailure` — `goto`, `retry`, or `end`. */
  | 'failure'

export interface ArazzoGraphNode {
  id: string
  /** `end` is the synthetic terminal an `end` action points at. */
  kind: 'step' | 'end'
  /** Absent on the terminal node. */
  step?: ArazzoStep
  /** 1-based position, for the ordinal drawn on the box. */
  ordinal: number
}

export interface ArazzoGraphEdge {
  id: string
  source: string
  target: string
  kind: ArazzoEdgeKind
  /** The action's `name`, or nothing — what the reader calls this branch. */
  name?: string
  /** Criterion conditions, joined; drawn as the edge label. */
  label?: string
  /** `goto` | `retry` | `end`, for an action edge. */
  action?: string
}

export interface ArazzoGraph {
  nodes: ArazzoGraphNode[]
  edges: ArazzoGraphEdge[]
  /**
   * `goto`/`workflowId` targets naming a workflow rather than a step. They are
   * not edges of THIS graph — the target lives in another one — so they are
   * reported for the canvas to offer as navigation.
   */
  crossings: Array<{ from: string; workflowId: string; kind: ArazzoEdgeKind }>
  /**
   * References the document makes that resolve to no step in this workflow.
   * Reported rather than dropped: a `dependsOn` naming a step that is not there
   * is the single most useful thing a reader of this drawing could be told, and
   * the drawing cannot show an edge to a node that does not exist.
   */
  dangling: Array<{ from: string; ref: string; kind: ArazzoEdgeKind }>
}

/** The terminal node's id. Never a legal `stepId` target, because of the space. */
export const END_NODE = 'end of workflow'

/** A stable node id for a step, which may legally have no `stepId`. */
function nodeId(step: ArazzoStep): string {
  return step.stepId ?? `#${step.index}`
}

function conditions(criteria: ArazzoCriterion[]): string | undefined {
  const text = criteria.map((criterion) => criterion.condition).join(' AND ')
  return text.length > 0 ? text : undefined
}

/**
 * One workflow as a graph.
 *
 * Four edge kinds, and the difference between two of them is the point:
 *
 * - **`depends`** is drawn because the document says so. Arazzo's `dependsOn`
 *   names the steps that must complete first, so it is a statement of order.
 * - **`order`** is drawn because nothing else says otherwise. Steps execute in
 *   the order they are written unless something reorders them, so consecutive
 *   steps are joined — but ONLY where the later step declares no `dependsOn`.
 *   Where it does, the document has already stated its own order, and drawing a
 *   sequence edge beside it would assert a second, weaker prerequisite the file
 *   never claimed. The two are drawn differently for the same reason: one is
 *   read off the page, the other is inferred from position, and a diagram that
 *   renders an inference identically to a declaration is lying about its source.
 *
 * `onSuccess` and `onFailure` become edges to their `stepId` target, or to the
 * synthetic terminal for `end`. A `retry` naming no step is a self-loop, which
 * is what retrying a step is.
 */
export function arazzoGraph(workflow: ArazzoWorkflow): ArazzoGraph {
  const nodes: ArazzoGraphNode[] = workflow.steps.map((step, index) => ({
    id: nodeId(step),
    kind: 'step',
    step,
    ordinal: index + 1,
  }))
  const known = new Set(nodes.map((node) => node.id))

  const edges: ArazzoGraphEdge[] = []
  const crossings: ArazzoGraph['crossings'] = []
  const dangling: ArazzoGraph['dangling'] = []
  let needsTerminal = false

  workflow.steps.forEach((step, index) => {
    const from = nodeId(step)

    // Declared prerequisites.
    for (const required of step.dependsOn) {
      if (!known.has(required)) {
        dangling.push({ from, ref: required, kind: 'depends' })
        continue
      }
      edges.push({ id: `depends:${required}->${from}`, source: required, target: from, kind: 'depends' })
    }

    // Inferred sequence, only where the step states no order of its own.
    const previous = index > 0 ? workflow.steps[index - 1] : null
    if (previous && step.dependsOn.length === 0) {
      const source = nodeId(previous)
      edges.push({ id: `order:${source}->${from}`, source, target: from, kind: 'order' })
    }

    // A step whose reference IS another workflow: navigation, not an edge.
    if (step.reference.kind === 'workflow') {
      crossings.push({ from, workflowId: step.reference.value, kind: 'order' })
    }

    for (const action of step.actions) {
      const kind: ArazzoEdgeKind = action.outcome === 'success' ? 'success' : 'failure'
      const shared = {
        kind,
        ...(action.name ? { name: action.name } : {}),
        ...(conditions(action.criteria) ? { label: conditions(action.criteria) as string } : {}),
        ...(action.type ? { action: action.type } : {}),
      }
      const id = `${kind}:${from}:${action.name ?? action.type ?? 'action'}:${edges.length}`

      if (action.workflowId !== null) {
        crossings.push({ from, workflowId: action.workflowId, kind })
        continue
      }
      if (action.stepId !== null) {
        if (!known.has(action.stepId)) {
          dangling.push({ from, ref: action.stepId, kind })
          continue
        }
        edges.push({ id, source: from, target: action.stepId, ...shared })
        continue
      }
      if (action.type === 'retry') {
        // Retrying names no target: the target is this step.
        edges.push({ id, source: from, target: from, ...shared })
        continue
      }
      // `end`, and any action naming no target at all — both terminate the path
      // this reader can follow, which is what the terminal node stands for.
      needsTerminal = true
      edges.push({ id, source: from, target: END_NODE, ...shared })
    }
  })

  if (needsTerminal) {
    nodes.push({ id: END_NODE, kind: 'end', ordinal: nodes.length + 1 })
  }

  return { nodes, edges, crossings, dangling }
}

/**
 * The graph in words — the same content the canvas draws.
 *
 * Every diagram in this portal carries one, because the drawing is `aria-hidden`
 * and a figcaption is what a screen reader, and a text-only reader, gets
 * instead. It is generated from the same model the picture is, so the two
 * cannot describe different workflows.
 *
 * A step line carries every step-level field this reader keeps, and that is a
 * contract with {@link DRAWN_STEP_FIELDS} rather than a matter of taste. A field
 * listed there is excluded from `omitted`, so the "not drawn, and in the file
 * beside this" note stays silent about it — which is only honest if something
 * else says it. `successCriteria` is painted on the box and `description` is
 * painted nowhere, so for a reader who is not looking at the box, this line is
 * the only place either of them exists.
 */
export function arazzoSummary(workflow: ArazzoWorkflow): string[] {
  const lines: string[] = []
  const graph = arazzoGraph(workflow)

  for (const node of graph.nodes) {
    if (node.kind !== 'step' || !node.step) continue
    const step = node.step
    const reference =
      step.reference.kind === 'none'
        ? 'references nothing'
        : `${step.reference.kind} ${step.reference.value}`
    const act = step.action ? `, ${step.action}` : ''
    const succeeds = conditions(step.successCriteria)
    const when = succeeds ? `, succeeds when ${succeeds}` : ''
    // Folded YAML (`>-`) arrives as one line already, but an author may have
    // written a literal block; a caption is one flow of text, so the newlines go.
    const note = step.description ? ` ${step.description.replace(/\s+/g, ' ').trim()}` : ''
    lines.push(`Step ${node.ordinal}, ${node.id}: ${reference}${act}${when}.${note}`)
  }

  for (const edge of graph.edges) {
    const target = edge.target === END_NODE ? 'the end of the workflow' : edge.target
    const because = edge.label ? ` when ${edge.label}` : ''
    const verb = {
      order: 'is followed by',
      depends: 'must complete before',
      success: `on success${edge.name ? ` (${edge.name})` : ''} continues to`,
      failure: `on failure${edge.name ? ` (${edge.name})` : ''} continues to`,
    }[edge.kind]
    lines.push(`${edge.source} ${verb} ${target}${because}.`)
  }

  for (const miss of graph.dangling) {
    lines.push(`${miss.from} references ${miss.ref}, which is not a step of this workflow.`)
  }

  return lines
}
