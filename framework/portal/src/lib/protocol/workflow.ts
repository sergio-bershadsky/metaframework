import { z } from 'zod'
import { SCHEME, SrnError, parseSrn, resolveRef } from '../srn/srn'
import { assertArtifactRole } from '../srn/artifacts'
import type {
  Compartment,
  FragmentStep,
  MessageStep,
  Workflow,
  WorkflowIssue,
  WorkflowStep,
} from './sequence'
import { MESSAGE_KINDS, flattenMessages } from './sequence'

/**
 * The workflow mini-spec — framework/spec/kinds/protocol.md, "The workflow
 * mini-spec".
 *
 * `parseWorkflow` turns raw YAML data into a typed tree, collecting spec error
 * classes instead of throwing. Loading is fail-soft everywhere in this portal: a
 * workflow with one bad step must still draw, with the diagnostic visible,
 * rather than collapsing the page.
 *
 * The tree it produces, the narration of it, and the sequence-diagram layout
 * over it all live in `./sequence` and are re-exported below, so every existing
 * importer of this module still resolves. They are a separate module because
 * they are the half the *browser* needs, and this half builds zod schemas at
 * module scope — see `./sequence` and `lib/catalog/vocabulary` for the
 * measurement. **`SequenceDiagram` and anything else under `'use client'` must
 * import them from `./sequence`, never through this re-export.**
 */

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

export * from './sequence'
