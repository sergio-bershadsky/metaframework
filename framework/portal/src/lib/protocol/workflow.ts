import { z } from 'zod'
import { SCHEME, SrnError, parseSrn, resolveRef } from '../srn/srn'
import { assertArtifactRole } from '../srn/artifacts'

/**
 * The workflow mini-spec — framework/spec/kinds/protocol.md, "The workflow
 * mini-spec" — plus a pure layout pass for the sequence diagram.
 *
 * Two halves, deliberately separated:
 *
 * 1. `parseWorkflow` turns raw YAML data into a typed tree, collecting spec
 *    error classes instead of throwing. Loading is fail-soft everywhere in this
 *    portal: a workflow with one bad step must still draw, with the diagnostic
 *    visible, rather than collapsing the page.
 * 2. `layoutWorkflow` turns that tree into geometry — numbers only, no DOM, no
 *    React. A sequence diagram is a strict grid (lifelines are columns, steps
 *    are ordered rows, fragments are nested boxes), which is exactly the shape
 *    a free-positioning graph library cannot express and a solver can. Keeping
 *    it pure is what makes the flagship visual unit-testable.
 */

/* ------------------------------------------------------------------ model */

export const MESSAGE_KINDS = ['call', 'return', 'event', 'error'] as const
export type MessageKind = (typeof MESSAGE_KINDS)[number]

export const FRAGMENT_TYPES = ['alt', 'opt', 'loop'] as const
export type FragmentType = (typeof FRAGMENT_TYPES)[number]

export interface MessageStep {
  type: 'message'
  /** Positional key, e.g. `steps[4].alt[0].steps[2]` — steps have no ids. */
  path: string
  /** Fragment nesting depth of the enclosing scope; 0 at the root. */
  depth: number
  message: string
  from: string
  /** Always a list; a scalar `to` is normalised to one entry. */
  to: string[]
  /** True when `to` was authored as a list — an event fan-out. */
  fanout: boolean
  kind: MessageKind
  /** The payload reference exactly as authored. */
  payload?: string
  /** Absolute SRN, present when `protocolSrn` was supplied and resolution won. */
  payloadSrn?: string
  /** `order@1` — the chip text; the tail of the reference. */
  payloadLabel?: string
  channel?: string
  condition?: string
  note?: string
}

/** One `alt` branch, an `otherwise`, or the single body of an `opt` / `loop`. */
export interface Compartment {
  path: string
  /** Guard text; empty for an `otherwise`, whose label is rendered as `else`. */
  label: string
  steps: WorkflowStep[]
}

export interface FragmentStep {
  type: FragmentType
  path: string
  depth: number
  /** Tab text: `alt`, `opt`, `loop`, `loop [≤ 3]`. */
  tab: string
  max?: number
  compartments: Compartment[]
}

export type WorkflowStep = MessageStep | FragmentStep

export interface Workflow {
  name: string
  title: string
  summary?: string
  /** `participants` as authored — a layout hint, never a restriction. */
  declared: string[]
  /** Final lifeline order: declared aliases first, then first appearance. */
  lifelines: string[]
  steps: WorkflowStep[]
}

export type IssueSeverity = 'error' | 'warning'

export interface WorkflowIssue {
  /** Spec error class, e.g. `E_PROTO_WF_DEPTH`. */
  code: string
  severity: IssueSeverity
  message: string
  /** Positional step path, or a top-level field name. */
  path: string
}

/* ----------------------------------------------------------------- schema */

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

const alias = z.string().regex(KEBAB, 'must be kebab-case').max(32)
const messageName = z.string().regex(KEBAB, 'must be kebab-case').max(64)

const messageStepSchema = z.strictObject({
  message: messageName,
  from: alias,
  to: z.union([alias, z.array(alias).min(1)]),
  kind: z.enum(MESSAGE_KINDS).optional(),
  payload: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
  condition: z.string().max(120).optional(),
  note: z.string().max(200).optional(),
})

const altBranchSchema = z.strictObject({
  when: z.string().min(1).max(120),
  steps: z.array(z.unknown()),
})

const optSchema = z.strictObject({
  when: z.string().min(1).max(120),
  steps: z.array(z.unknown()),
})

const loopSchema = z.strictObject({
  while: z.string().min(1).max(120),
  max: z.number().int().min(1).optional(),
  steps: z.array(z.unknown()),
})

const workflowFileSchema = z.strictObject({
  /**
   * The dialect header (ADR 0015). The loader strips it before this parser runs,
   * so nothing in the catalog depends on the admission; it is here so a caller
   * holding raw file bytes — a fixture, an external consumer — gets the legacy
   * dialect read rather than an unknown-key error on a file the spec told the
   * author to write. `x-` stays the hatch for *authors'* keys; a
   * framework-owned key is admitted by name or not at all.
   */
  $schema: z.string().min(1).optional(),
  name: messageName,
  title: z.string().min(1).max(80),
  summary: z
    .string()
    .max(200)
    .refine((s) => !s.includes('\n'), 'summary must be a single line')
    .optional(),
  participants: z.array(alias).optional(),
  steps: z.array(z.unknown()),
})

function zodMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ')
}

/* ------------------------------------------------------------------ parse */

export interface ParseWorkflowOptions {
  /** Filename stem; `name` must equal it (W2). */
  fileStem?: string
  /** The protocol's declared aliases; every alias used must be one of them (W4). */
  aliases?: readonly string[]
  /** The protocol entity's SRN — enables payload reference resolution (W8, syntax half). */
  protocolSrn?: string
}

export interface ParseWorkflowResult {
  /** Null only when the file shape is unusable; otherwise best-effort. */
  workflow: Workflow | null
  issues: WorkflowIssue[]
}

/** Maximum fragment nesting depth — beyond this a sequence diagram stops reading. */
export const MAX_FRAGMENT_DEPTH = 3

const DISCRIMINATORS = ['message', 'alt', 'opt', 'loop'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Resolve a payload reference authored inside `workflows/<name>.yaml`.
 *
 * The file sits one directory below the entity, so a dot-relative reference
 * climbs one level less far than the same text in a sibling artifact — the trap
 * protocol.md calls out explicitly. Modelled by resolving from a synthetic
 * `workflows/` child rather than by re-deriving RFC 3986 semantics here.
 */
export function resolveWorkflowRef(protocolSrn: string, ref: string): string {
  if (ref.startsWith(SCHEME) || ref.startsWith('/')) return resolveRef(protocolSrn, ref)
  return resolveRef(protocolSrn, `workflows/${ref}`)
}

/** `srn://acme/shop/datamodel/order@1` → `order@1`; `/shop/datamodel/x` → `x`. */
function payloadTail(ref: string): string {
  const body = ref.startsWith(SCHEME) ? ref.slice(SCHEME.length) : ref
  const slash = body.lastIndexOf('/')
  return slash === -1 ? body : body.slice(slash + 1)
}

export function parseWorkflow(data: unknown, options: ParseWorkflowOptions = {}): ParseWorkflowResult {
  const issues: WorkflowIssue[] = []
  const error = (code: string, path: string, message: string) =>
    issues.push({ code, severity: 'error', message, path })
  const warn = (code: string, path: string, message: string) =>
    issues.push({ code, severity: 'warning', message, path })

  const file = workflowFileSchema.safeParse(data)
  if (!file.success) {
    error('E_PROTO_WF_SCHEMA', '', zodMessage(file.error))
    return { workflow: null, issues }
  }

  const raw = file.data

  if (options.fileStem !== undefined && raw.name !== options.fileStem) {
    error('E_PROTO_WF_NAME', 'name', `name "${raw.name}" must equal the filename stem "${options.fileStem}"`)
  }

  const declaredAliases = options.aliases ? new Set(options.aliases) : null
  const checkAlias = (value: string, path: string) => {
    if (declaredAliases && !declaredAliases.has(value)) {
      error('E_PROTO_WF_ALIAS', path, `alias "${value}" is not declared by the protocol`)
    }
  }

  const declared = raw.participants ?? []
  declared.forEach((value, index) => checkAlias(value, `participants[${index}]`))

  if (raw.steps.length === 0) {
    error('E_PROTO_WF_EMPTY_BRANCH', 'steps', 'steps must contain at least one step')
  }

  function parseStepList(nodes: unknown[], prefix: string, depth: number): WorkflowStep[] {
    const out: WorkflowStep[] = []
    nodes.forEach((node, index) => {
      const step = parseStep(node, `${prefix}[${index}]`, depth)
      if (step) out.push(step)
    })
    return out
  }

  function parseStep(node: unknown, path: string, depth: number): WorkflowStep | null {
    if (!isRecord(node)) {
      error('E_PROTO_WF_STEP_SHAPE', path, 'a step node must be a mapping')
      return null
    }

    const present = DISCRIMINATORS.filter((key) => key in node)
    if (present.length !== 1) {
      error(
        'E_PROTO_WF_STEP_SHAPE',
        path,
        present.length === 0
          ? 'no discriminator key — expected one of message, alt, opt, loop'
          : `${present.length} discriminator keys (${present.join(', ')}) — exactly one is allowed`,
      )
      return null
    }

    const [discriminator] = present
    if ('otherwise' in node && discriminator !== 'alt') {
      error('E_PROTO_WF_STEP_SHAPE', path, '`otherwise` is only permitted alongside `alt`')
      return null
    }

    if (discriminator === 'message') return parseMessage(node, path, depth)

    const fragmentDepth = depth + 1
    if (fragmentDepth > MAX_FRAGMENT_DEPTH) {
      error(
        'E_PROTO_WF_DEPTH',
        path,
        `fragment nesting depth ${fragmentDepth} exceeds the maximum of ${MAX_FRAGMENT_DEPTH}`,
      )
    }

    if (discriminator === 'alt') return parseAlt(node, path, fragmentDepth)
    if (discriminator === 'opt') return parseOpt(node, path, fragmentDepth)
    return parseLoop(node, path, fragmentDepth)
  }

  function parseMessage(node: Record<string, unknown>, path: string, depth: number): MessageStep | null {
    const parsed = messageStepSchema.safeParse(node)
    if (!parsed.success) {
      error('E_PROTO_WF_SCHEMA', path, zodMessage(parsed.error))
      return null
    }

    const value = parsed.data
    const kind = value.kind ?? 'call'
    const fanout = Array.isArray(value.to)
    const to = Array.isArray(value.to) ? value.to : [value.to]

    if (fanout && kind !== 'event') {
      error('E_PROTO_WF_FANOUT', path, `a list-valued \`to\` is only legal on kind: event, not "${kind}"`)
    }

    checkAlias(value.from, `${path}.from`)
    to.forEach((target, index) => checkAlias(target, `${path}.to[${index}]`))

    const step: MessageStep = {
      type: 'message',
      path,
      depth,
      message: value.message,
      from: value.from,
      to,
      fanout,
      kind,
      channel: value.channel,
      condition: value.condition,
      note: value.note,
    }

    if (value.payload) {
      step.payload = value.payload
      step.payloadLabel = payloadTail(value.payload)
      if (options.protocolSrn) {
        try {
          const resolved = resolveWorkflowRef(options.protocolSrn, value.payload)
          // A payload names a datamodel entity, and an artifact has no kind. An
          // illegal role fails here as E_SRN_ARTIFACT; a legal one survives the
          // role table and is protocol.md's E_PROTO_PAYLOAD_KIND, which needs
          // the resolved catalog this pure parser is not given — so the shape
          // is refused on the one ground that is decidable from the SRN alone.
          const parsed = parseSrn(resolved)
          if (parsed.artifact !== null) assertArtifactRole(parsed.kind, parsed.artifact, value.payload)
          step.payloadSrn = resolved
          step.payloadLabel = payloadTail(step.payloadSrn)
        } catch (cause) {
          const code = cause instanceof SrnError ? cause.code : 'E_SRN_SYNTAX'
          error(code, `${path}.payload`, cause instanceof Error ? cause.message : String(cause))
        }
      }
    }

    return step
  }

  /**
   * `stepsPath` differs from `path` for every compartment but `otherwise`,
   * whose value *is* the step list — so its children key as
   * `steps[4].otherwise[0]`, not `steps[4].otherwise.steps[0]`.
   */
  function compartment(
    steps: unknown,
    path: string,
    label: string,
    depth: number,
    stepsPath = `${path}.steps`,
  ): Compartment {
    if (!Array.isArray(steps)) {
      error('E_PROTO_WF_SCHEMA', path, '`steps` must be a list')
      return { path, label, steps: [] }
    }
    if (steps.length === 0) {
      error('E_PROTO_WF_EMPTY_BRANCH', path, 'a steps list must contain at least one step')
    }
    return { path, label, steps: parseStepList(steps, stepsPath, depth) }
  }

  function parseAlt(node: Record<string, unknown>, path: string, depth: number): FragmentStep | null {
    const branches = node.alt
    if (!Array.isArray(branches) || branches.length === 0) {
      error('E_PROTO_WF_SCHEMA', path, '`alt` must be a non-empty list of branch objects')
      return null
    }

    const compartments: Compartment[] = []
    branches.forEach((branch, index) => {
      const branchPath = `${path}.alt[${index}]`
      const parsed = altBranchSchema.safeParse(branch)
      if (!parsed.success) {
        error('E_PROTO_WF_SCHEMA', branchPath, zodMessage(parsed.error))
        return
      }
      compartments.push(compartment(parsed.data.steps, branchPath, parsed.data.when, depth))
    })

    if ('otherwise' in node) {
      const otherwisePath = `${path}.otherwise`
      compartments.push(compartment(node.otherwise, otherwisePath, '', depth, otherwisePath))
    }

    // `alt` with one compartment and no `otherwise` is an `opt` wearing the
    // wrong name, and the two mean different things to a reader.
    if (compartments.length < 2) {
      error('E_PROTO_WF_SCHEMA', path, 'an alt fragment needs at least two compartments — use opt for a skippable block')
    }

    return { type: 'alt', path, depth, tab: 'alt', compartments }
  }

  function parseOpt(node: Record<string, unknown>, path: string, depth: number): FragmentStep | null {
    const parsed = optSchema.safeParse(node.opt)
    if (!parsed.success) {
      error('E_PROTO_WF_SCHEMA', path, zodMessage(parsed.error))
      return null
    }
    return {
      type: 'opt',
      path,
      depth,
      tab: 'opt',
      compartments: [compartment(parsed.data.steps, `${path}.opt`, parsed.data.when, depth)],
    }
  }

  function parseLoop(node: Record<string, unknown>, path: string, depth: number): FragmentStep | null {
    const parsed = loopSchema.safeParse(node.loop)
    if (!parsed.success) {
      error('E_PROTO_WF_SCHEMA', path, zodMessage(parsed.error))
      return null
    }
    return {
      type: 'loop',
      path,
      depth,
      tab: parsed.data.max === undefined ? 'loop' : `loop [≤ ${parsed.data.max}]`,
      max: parsed.data.max,
      compartments: [compartment(parsed.data.steps, `${path}.loop`, parsed.data.while, depth)],
    }
  }

  const steps = parseStepList(raw.steps, 'steps', 0)

  // Lifelines: declared order first — it is a hint, so aliases only reached by
  // a step are appended rather than rejected.
  const lifelines: string[] = []
  const seen = new Set<string>()
  for (const value of declared) {
    if (!seen.has(value)) {
      seen.add(value)
      lifelines.push(value)
    }
  }
  for (const step of flattenMessages(steps)) {
    for (const value of [step.from, ...step.to]) {
      if (!seen.has(value)) {
        seen.add(value)
        lifelines.push(value)
      }
    }
  }

  checkOrphanReturns(steps, [], warn)

  return {
    workflow: {
      name: raw.name,
      title: raw.title,
      summary: raw.summary,
      declared,
      lifelines,
      steps,
    },
    issues,
  }
}

/**
 * W10 — a `return`/`error` must answer a `call` in the opposite direction that
 * is visible from its scope: a preceding sibling, or one in an enclosing
 * fragment. Sibling compartments do not see each other, which is why `visible`
 * is threaded down by value rather than kept in one mutable list.
 */
function checkOrphanReturns(
  steps: WorkflowStep[],
  visible: ReadonlyArray<{ from: string; to: string[] }>,
  warn: (code: string, path: string, message: string) => void,
): void {
  let scope = [...visible]
  for (const step of steps) {
    if (step.type !== 'message') {
      for (const branch of step.compartments) checkOrphanReturns(branch.steps, scope, warn)
      continue
    }
    if (step.kind === 'return' || step.kind === 'error') {
      const answered = scope.some((call) => call.to.includes(step.from) && step.to.includes(call.from))
      if (!answered) {
        warn(
          'W_PROTO_WF_ORPHAN_RETURN',
          step.path,
          `${step.kind} "${step.message}" answers no call from ${step.to.join(', ')} to ${step.from}`,
        )
      }
    }
    if (step.kind === 'call') scope = [...scope, { from: step.from, to: step.to }]
  }
}

/** Every message step in document order — the diagram's row sequence. */
export function flattenMessages(steps: WorkflowStep[]): MessageStep[] {
  const out: MessageStep[] = []
  const walk = (list: WorkflowStep[]) => {
    for (const step of list) {
      if (step.type === 'message') out.push(step)
      else for (const branch of step.compartments) walk(branch.steps)
    }
  }
  walk(steps)
  return out
}

/* -------------------------------------------------------------- narration */

export interface NarrationLine {
  kind: 'fragment' | 'compartment' | 'message'
  depth: number
  /** 1-based ordinal across the whole workflow; only on message lines. */
  index?: number
  text: string
  path: string
}

const ARROW = '→'

/**
 * The text equivalent of the diagram. It is not a courtesy: the framework's
 * stated principle is that everything reads to humans *and* machines, and an
 * SVG of lines and boxes reads to neither a screen reader nor a model.
 */
export function narrateWorkflow(workflow: Workflow, labelOf: (alias: string) => string = (a) => a): NarrationLine[] {
  const lines: NarrationLine[] = []
  let ordinal = 0

  const walk = (steps: WorkflowStep[], depth: number) => {
    for (const step of steps) {
      if (step.type === 'message') {
        ordinal += 1
        const parts = [
          `${ordinal}. ${labelOf(step.from)} ${ARROW} ${step.to.map(labelOf).join(', ')}: ${step.message} (${step.kind}${
            step.fanout ? ', fan-out' : ''
          })`,
        ]
        if (step.condition) parts.push(`guard ${step.condition}`)
        if (step.payloadLabel) parts.push(`payload ${step.payloadLabel}`)
        if (step.channel) parts.push(`channel ${step.channel}`)
        if (step.note) parts.push(`note: ${step.note}`)
        lines.push({ kind: 'message', depth, index: ordinal, text: parts.join(', '), path: step.path })
        continue
      }

      lines.push({ kind: 'fragment', depth, text: `${step.tab} fragment`, path: step.path })
      for (const branch of step.compartments) {
        lines.push({
          kind: 'compartment',
          depth: depth + 1,
          text: compartmentLabel(step, branch),
          path: branch.path,
        })
        walk(branch.steps, depth + 2)
      }
    }
  }

  walk(workflow.steps, 0)
  return lines
}

function compartmentLabel(fragment: FragmentStep, branch: Compartment): string {
  if (branch.label === '') return 'else'
  if (fragment.type === 'loop') return `while ${branch.label}`
  return `when ${branch.label}`
}

/** UML compartment guard — the bracketed form the diagram draws. */
function guardLabel(branch: Compartment): string {
  return branch.label === '' ? '[else]' : `[${branch.label}]`
}

/* ----------------------------------------------------------------- layout */

export interface SequenceMetrics {
  marginX: number
  marginTop: number
  marginBottom: number
  headHeight: number
  headMinWidth: number
  headMaxWidth: number
  headPadX: number
  /** Slack between two adjacent header boxes. */
  headGapX: number
  /** Minimum lifeline pitch, centre to centre. */
  minGap: number
  /** Slack around a message label spanning a gap. */
  labelPad: number
  /** Vertical distance from the header box to the first arrow row. */
  headerGap: number
  rowBase: number
  rowPayloadExtra: number
  selfBase: number
  selfWidth: number
  selfDrop: number
  /** Distance from an arrow baseline to the bottom of its row. */
  arrowFoot: number
  labelLift: number
  chipHeight: number
  fragTabHeight: number
  fragLabelHeight: number
  fragPadX: number
  fragPadBottom: number
  fragGapAfter: number
  fragMinWidth: number
  noteWidth: number
  noteGapX: number
  noteLineHeight: number
  notePadY: number
  /** Approximate advance width per character, as a fraction of the font size. */
  charWidthSans: number
  charWidthMono: number
  labelFontSize: number
  headFontSize: number
  aliasFontSize: number
  noteFontSize: number
}

export const DEFAULT_METRICS: SequenceMetrics = {
  marginX: 28,
  marginTop: 14,
  marginBottom: 30,
  headHeight: 46,
  headMinWidth: 112,
  headMaxWidth: 224,
  headPadX: 18,
  headGapX: 26,
  minGap: 152,
  labelPad: 40,
  headerGap: 32,
  rowBase: 42,
  rowPayloadExtra: 18,
  selfBase: 62,
  selfWidth: 44,
  selfDrop: 26,
  arrowFoot: 12,
  labelLift: 9,
  chipHeight: 15,
  fragTabHeight: 20,
  fragLabelHeight: 20,
  fragPadX: 16,
  fragPadBottom: 12,
  fragGapAfter: 16,
  fragMinWidth: 120,
  noteWidth: 190,
  noteGapX: 28,
  noteLineHeight: 14,
  notePadY: 8,
  charWidthSans: 0.53,
  charWidthMono: 0.6,
  labelFontSize: 11.5,
  headFontSize: 12.5,
  aliasFontSize: 10.5,
  noteFontSize: 11,
}

export interface LifelineLayout {
  alias: string
  index: number
  label: string
  /** Centre of the lifeline — the column's x. */
  x: number
  headX: number
  headY: number
  headWidth: number
  headHeight: number
  /** y range of the dashed lifeline. */
  top: number
  bottom: number
}

export interface ArrowLayout {
  fromX: number
  toX: number
  y: number
  self: boolean
  /** Right edge of the self-call loop. */
  loopX?: number
  /** y the self-call returns on. */
  loopBottomY?: number
}

export interface NoteLayout {
  x: number
  y: number
  width: number
  height: number
  lines: string[]
  /** Where the leader line meets the diagram. */
  anchorX: number
  anchorY: number
}

export interface ChipLayout {
  x: number
  y: number
  width: number
  height: number
  label: string
  srn?: string
}

export interface MessageLayout {
  step: MessageStep
  path: string
  /** 1-based ordinal, matching the narration. */
  index: number
  rowTop: number
  rowHeight: number
  /** Baseline the arrows sit on. */
  y: number
  /** `[guard] message`, already composed. */
  label: string
  channel?: string
  labelX: number
  labelY: number
  labelAnchor: 'start' | 'middle'
  arrows: ArrowLayout[]
  chip?: ChipLayout
  note?: NoteLayout
  /** Lifeline indices this row touches — hover dimming reads this. */
  lanes: number[]
}

export interface FragmentCompartmentLayout {
  path: string
  label: string
  labelX: number
  labelY: number
  /** y of the dashed separator above this compartment; null for the first. */
  separatorY: number | null
}

export interface FragmentLayout {
  step: FragmentStep
  path: string
  type: FragmentType
  depth: number
  tab: string
  tabWidth: number
  x: number
  y: number
  width: number
  height: number
  compartments: FragmentCompartmentLayout[]
}

export interface SequenceLayout {
  width: number
  height: number
  metrics: SequenceMetrics
  lifelines: LifelineLayout[]
  messages: MessageLayout[]
  fragments: FragmentLayout[]
  /** Alias → column index. */
  laneIndex: Record<string, number>
}

export interface LayoutOptions {
  /** Lifeline header text; defaults to the alias itself. */
  label?: (alias: string) => string
  metrics?: Partial<SequenceMetrics>
}

/**
 * Text measurement without a DOM. An average advance width is enough here
 * because every consumer of the number is a *minimum* — columns only ever grow,
 * so a 10% under-estimate costs a little tightness, never an overlap of two
 * boxes. Exact measurement would make the layout untestable outside a browser.
 */
export function estimateTextWidth(text: string, fontSize: number, charWidth: number): number {
  return text.length * fontSize * charWidth
}

/** Greedy word wrap; long words are left intact rather than broken mid-token. */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let line = words[0]
  for (const word of words.slice(1)) {
    if (line.length + 1 + word.length <= maxChars) line = `${line} ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  lines.push(line)
  return lines
}

export function messageLabel(step: MessageStep): string {
  return step.condition ? `[${step.condition}] ${step.message}` : step.message
}

interface Extent {
  minX: number
  maxX: number
}

const EMPTY_EXTENT: Extent = { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY }

function merge(a: Extent, b: Extent): Extent {
  return { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX) }
}

export function layoutWorkflow(workflow: Workflow, options: LayoutOptions = {}): SequenceLayout {
  const m: SequenceMetrics = { ...DEFAULT_METRICS, ...options.metrics }
  const labelOf = options.label ?? ((alias: string) => alias)

  const aliases = workflow.lifelines
  const laneIndex: Record<string, number> = {}
  aliases.forEach((value, index) => {
    laneIndex[value] = index
  })

  const messages = flattenMessages(workflow.steps)

  /* --- columns ---------------------------------------------------------- */

  const labels = aliases.map(labelOf)
  const headWidths = aliases.map((value, index) => {
    const title = estimateTextWidth(labels[index], m.headFontSize, m.charWidthSans)
    const sub = estimateTextWidth(value, m.aliasFontSize, m.charWidthMono)
    return clamp(Math.max(title, sub) + m.headPadX * 2, m.headMinWidth, m.headMaxWidth)
  })

  const gaps: number[] = []
  for (let i = 0; i < aliases.length - 1; i++) {
    gaps.push(Math.max(m.minGap, headWidths[i] / 2 + headWidths[i + 1] / 2 + m.headGapX))
  }

  // Columns widen until every label fits between the lifelines it spans; a
  // squashed sequence diagram is unreadable, and horizontal scroll is cheap.
  let extraRight = 0
  for (const step of messages) {
    const from = laneIndex[step.from]
    const primary = laneIndex[step.to[0]]
    if (from === undefined || primary === undefined) continue
    const width = labelWidth(step, m) + m.labelPad

    if (step.to.some((target) => laneIndex[target] === from)) {
      const need = m.selfWidth + width + 12
      if (from < gaps.length) gaps[from] = Math.max(gaps[from], need)
      else extraRight = Math.max(extraRight, need)
    }

    if (primary !== from) {
      const lo = Math.min(from, primary)
      const hi = Math.max(from, primary)
      let span = 0
      for (let i = lo; i < hi; i++) span += gaps[i]
      if (width > span) {
        const add = (width - span) / (hi - lo)
        for (let i = lo; i < hi; i++) gaps[i] += add
      }
    }
  }

  const xs: number[] = []
  for (let i = 0; i < aliases.length; i++) {
    xs.push(i === 0 ? m.marginX + headWidths[0] / 2 : xs[i - 1] + gaps[i - 1])
  }

  const lifelinesTop = m.marginTop + m.headHeight

  /* --- rows ------------------------------------------------------------- */

  const messageLayouts: MessageLayout[] = []
  const fragmentLayouts: FragmentLayout[] = []
  let y = lifelinesTop + m.headerGap
  let ordinal = 0
  let diagramMaxX = xs.length > 0 ? xs[xs.length - 1] + headWidths[headWidths.length - 1] / 2 + extraRight : m.marginX

  const noteMaxChars = Math.max(
    12,
    Math.floor((m.noteWidth - 16) / (m.noteFontSize * m.charWidthSans)),
  )

  function layoutMessage(step: MessageStep): Extent {
    const from = laneIndex[step.from]
    // An alias the loader failed to resolve still occupies a row; dropping it
    // would silently shorten the sequence.
    const fromX = from === undefined ? m.marginX : xs[from]
    const isSelf = step.to.some((target) => laneIndex[target] === from)

    const content = (isSelf ? m.selfBase : m.rowBase) + (step.payload ? m.rowPayloadExtra : 0)
    const rowTop = y
    const arrowY = isSelf ? rowTop + 18 : rowTop + content - m.arrowFoot

    const arrows: ArrowLayout[] = []
    const lanes = new Set<number>()
    if (from !== undefined) lanes.add(from)

    for (const target of step.to) {
      const to = laneIndex[target]
      if (to === undefined) continue
      lanes.add(to)
      if (to === from) {
        arrows.push({
          fromX,
          toX: fromX,
          y: arrowY,
          self: true,
          loopX: fromX + m.selfWidth,
          loopBottomY: arrowY + m.selfDrop,
        })
      } else {
        arrows.push({ fromX, toX: xs[to], y: arrowY, self: false })
      }
    }

    const primary = arrows[0]
    const label = messageLabel(step)
    const labelAnchor: 'start' | 'middle' = primary?.self ? 'start' : 'middle'
    const labelX = primary
      ? primary.self
        ? (primary.loopX as number) + 10
        : (primary.fromX + primary.toX) / 2
      : fromX
    // Above the line normally; beside the loop for a self-call. A payload chip
    // takes the slot directly under the label, so the label lifts to make room.
    const labelBaselineY = primary?.self
      ? arrowY + m.selfDrop / 2 + (step.payload ? -6 : 4)
      : arrowY - (step.payload ? m.labelLift + m.chipHeight + 4 : m.labelLift)

    let chip: ChipLayout | undefined
    if (step.payloadLabel) {
      const chipWidth = estimateTextWidth(step.payloadLabel, 10.5, m.charWidthMono) + 16
      chip = {
        x: labelAnchor === 'start' ? labelX : labelX - chipWidth / 2,
        y: labelBaselineY + 4,
        width: chipWidth,
        height: m.chipHeight,
        label: step.payloadLabel,
        srn: step.payloadSrn,
      }
    }

    let extent: Extent = { minX: fromX, maxX: fromX }
    for (const arrow of arrows) {
      extent = merge(extent, {
        minX: Math.min(arrow.fromX, arrow.toX),
        maxX: Math.max(arrow.fromX, arrow.toX, arrow.loopX ?? Number.NEGATIVE_INFINITY),
      })
    }
    const labelHalf = estimateTextWidth(label, m.labelFontSize, m.charWidthSans) / 2
    extent = merge(extent, {
      minX: labelAnchor === 'middle' ? labelX - labelHalf : labelX,
      maxX: labelAnchor === 'middle' ? labelX + labelHalf : labelX + labelHalf * 2,
    })

    // Notes live in a margin column past the last lifeline: they annotate the
    // exchange rather than take part in it, so they must not cover the grid —
    // and they are excluded from the returned extent, which keeps fragment
    // boxes shaped by the lifelines they span rather than by an annotation.
    let note: NoteLayout | undefined
    if (step.note) {
      const lines = wrapText(step.note, noteMaxChars)
      const height = lines.length * m.noteLineHeight + m.notePadY * 2
      const margin = xs.length > 0 ? xs[xs.length - 1] + headWidths[headWidths.length - 1] / 2 : extent.maxX
      const noteX = Math.max(extent.maxX, margin) + m.noteGapX
      note = {
        x: noteX,
        y: rowTop + 2,
        width: m.noteWidth,
        height,
        lines,
        anchorX: extent.maxX,
        anchorY: arrowY,
      }
      diagramMaxX = Math.max(diagramMaxX, noteX + m.noteWidth)
    }

    const rowHeight = Math.max(content, note ? note.height + 10 : 0)

    ordinal += 1
    messageLayouts.push({
      step,
      path: step.path,
      index: ordinal,
      rowTop,
      rowHeight,
      y: arrowY,
      label,
      channel: step.channel,
      labelX,
      labelY: labelBaselineY,
      labelAnchor,
      arrows,
      chip,
      note,
      lanes: [...lanes].sort((a, b) => a - b),
    })

    y = rowTop + rowHeight
    diagramMaxX = Math.max(diagramMaxX, extent.maxX)
    return extent
  }

  function layoutFragment(step: FragmentStep): Extent {
    const top = y
    const layout: FragmentLayout = {
      step,
      path: step.path,
      type: step.type,
      depth: step.depth,
      tab: step.tab,
      tabWidth: estimateTextWidth(step.tab, m.labelFontSize, m.charWidthSans) + 22,
      x: 0,
      y: top,
      width: 0,
      height: 0,
      compartments: [],
    }
    fragmentLayouts.push(layout)

    const firstFragment = fragmentLayouts.length
    let extent = EMPTY_EXTENT

    y = top + m.fragTabHeight + m.fragLabelHeight
    step.compartments.forEach((branch, index) => {
      let separatorY: number | null = null
      if (index > 0) {
        separatorY = y
        y += m.fragLabelHeight
      }
      layout.compartments.push({
        path: branch.path,
        label: guardLabel(branch),
        labelX: 0,
        labelY: (separatorY ?? top + m.fragTabHeight) + m.fragLabelHeight - 6,
        separatorY,
      })
      extent = merge(extent, layoutSteps(branch.steps))
    })

    y += m.fragPadBottom
    const bottom = y
    y += m.fragGapAfter

    // The box hugs what it contains, which makes nesting self-evident: a child
    // fragment's own box is part of the parent's extent, so the parent is
    // always strictly wider.
    for (const nested of fragmentLayouts.slice(firstFragment)) {
      extent = merge(extent, { minX: nested.x, maxX: nested.x + nested.width })
    }
    if (extent.minX > extent.maxX) {
      const first = xs[0] ?? m.marginX
      const last = xs[xs.length - 1] ?? m.marginX
      extent = { minX: first, maxX: last }
    }

    layout.x = extent.minX - m.fragPadX
    layout.width = Math.max(extent.maxX - extent.minX + m.fragPadX * 2, m.fragMinWidth, layout.tabWidth + 24)
    layout.height = bottom - top
    for (const branch of layout.compartments) branch.labelX = layout.x + 10

    diagramMaxX = Math.max(diagramMaxX, layout.x + layout.width)
    return { minX: layout.x, maxX: layout.x + layout.width }
  }

  function layoutSteps(steps: WorkflowStep[]): Extent {
    let extent = EMPTY_EXTENT
    for (const step of steps) {
      extent = merge(extent, step.type === 'message' ? layoutMessage(step) : layoutFragment(step))
    }
    return extent
  }

  layoutSteps(workflow.steps)

  const bottom = Math.max(y, lifelinesTop + m.headerGap) + m.marginBottom
  const lifelines: LifelineLayout[] = aliases.map((alias, index) => ({
    alias,
    index,
    label: labels[index],
    x: xs[index],
    headX: xs[index] - headWidths[index] / 2,
    headY: m.marginTop,
    headWidth: headWidths[index],
    headHeight: m.headHeight,
    top: lifelinesTop,
    bottom: bottom - m.marginBottom / 2,
  }))

  return {
    width: Math.ceil(diagramMaxX + m.marginX),
    height: Math.ceil(bottom),
    metrics: m,
    lifelines,
    messages: messageLayouts,
    fragments: fragmentLayouts,
    laneIndex,
  }
}

function labelWidth(step: MessageStep, m: SequenceMetrics): number {
  const text = estimateTextWidth(messageLabel(step), m.labelFontSize, m.charWidthSans)
  const channel = step.channel ? estimateTextWidth(step.channel, 10, m.charWidthMono) + 8 : 0
  const chip = step.payloadLabel ? estimateTextWidth(step.payloadLabel, 10.5, m.charWidthMono) + 16 : 0
  return Math.max(text + channel, chip)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
