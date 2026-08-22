import { z } from 'zod'
import type { Diagnostic } from '../catalog/types'
import { eventToMessage } from './state-chart-model'
import type { StateChart, StateChartEdge, StateChartNode } from './state-chart-model'

/**
 * `states.json` — the conversation state machine of a protocol.
 *
 * Implements framework/spec/kinds/protocol.md § states.json. The file is a real
 * XState v5 machine config (`createMachine()` must accept it verbatim), so this
 * module validates a *subset* of XState rather than a private format, then
 * flattens the nested config into the flat node/edge model the chart and the
 * text equivalent both read. Flattening happens once, here, so the renderer
 * never has to walk the config — and so the same model can be asserted on in
 * tests without a DOM.
 */

/**
 * Event keys are SCREAMING_SNAKE — protocol.md, `E_PROTO_STATES_EVENT_NAME`.
 * Exported because the generated meta-schema states the same rule in JSON
 * Schema; a second copy of the pattern there would be a second thing to forget.
 */
export const EVENT_NAME = /^[A-Z][A-Z0-9_]*$/
export const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Constructs protocol.md names as explicitly outside the subset. Listing them
 * buys a diagnostic that says *why* the key is rejected instead of the generic
 * "unrecognized key", which is the difference between a 5-second and a
 * 5-minute fix for the author.
 */
const OUT_OF_SUBSET_KEYS = new Set([
  'context',
  'assign',
  'always',
  'after',
  'invoke',
  'input',
  'output',
  'meta',
])

const actions = z.union([z.string().min(1), z.array(z.string().min(1))])

const transitionObjectSchema = z.strictObject({
  target: z.string().min(1).optional(),
  guard: z.string().min(1).optional(),
  actions: actions.optional(),
  description: z.string().optional(),
})

export type TransitionConfig = z.infer<typeof transitionObjectSchema>

/** A transition value: a bare target, one transition, or a guarded list. */
const transitionSchema = z.union([
  z.string().min(1),
  transitionObjectSchema,
  z.array(transitionObjectSchema).min(1),
])

export interface StateNodeConfig {
  states?: Record<string, StateNodeConfig>
  initial?: string
  type?: 'final'
  on?: Record<string, string | TransitionConfig | TransitionConfig[]>
  entry?: string | string[]
  exit?: string | string[]
  tags?: string[]
  description?: string
}

/**
 * Recursion goes through `z.lazy` rather than a getter so the exported
 * `StateNodeConfig` stays hand-written and readable — it is the shape the spec
 * table describes, and it is what the diagnostics messages talk about.
 */
const stateNodeSchema: z.ZodType<StateNodeConfig> = z.lazy(() =>
  z.strictObject({
    states: z.record(z.string(), stateNodeSchema).optional(),
    initial: z.string().min(1).optional(),
    type: z.literal('final').optional(),
    on: z.record(z.string(), transitionSchema).optional(),
    entry: actions.optional(),
    exit: actions.optional(),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  }),
)

/**
 * The document as authored — the pinned subset plus the dialect header of
 * ADR 0015. Exported because `./state-machine-document` generates the published
 * meta-schema from it: derivation is what keeps the schema a `states.json` names
 * and the validator that actually judges it from drifting apart.
 *
 * `$schema` is admitted here for one reason, and it is not that the parser needs
 * to tolerate it — the loader strips the key before this module is ever handed
 * the document. It is that a meta-schema whose `additionalProperties: false`
 * forbids the very key pointing at it cannot validate the file it describes.
 * That is the ground ADR 0015 rejected Stately's schema on, and it applies to
 * ours identically. It is a bare optional string, never the exact URL: an
 * unrecognised dialect is `W_ARTIFACT_DIALECT`, a warning, and pinning the value
 * here would make it an error instead — the ruling the other five framework
 * meta-schemas now encode the same way.
 *
 * The `describe()` is not decoration: it is the only route a sentence has into
 * the generated meta-schema, and that document is served to readers who will
 * never open this file.
 */
export const machineSchema = z.strictObject({
  $schema: z
    .string()
    .min(1)
    .describe(
      "The dialect discriminator (0015-artifact-dialects); the canonical value is this schema's own $id. " +
        'Deliberately unpinned rather than const: a value naming some other dialect is W_ARTIFACT_DIALECT, a ' +
        'warning, read as the legacy dialect and never broken — a const here would restate that ruling as a ' +
        'hard rejection in the one place a severity cannot be relaxed. The loader strips the key before ' +
        'parseStates is handed the document, which is why the pinned subset stays exactly an XState config ' +
        'and E_PROTO_STATES_SUBSET stays strict.',
    )
    .optional(),
  id: z.string().min(1),
  initial: z.string().min(1),
  description: z.string().optional(),
  states: z.record(z.string(), stateNodeSchema),
})

/** The pinned subset itself: the document minus its header — an XState config. */
export type MachineConfig = Omit<z.infer<typeof machineSchema>, '$schema'>

/** The residue `createMachine()` is handed. The header is not part of the config. */
function subsetOf(document: z.infer<typeof machineSchema>): MachineConfig {
  const config = { ...document }
  delete config.$schema
  return config
}


export interface ParseStatesOptions {
  /** Protocol entity `name`; enables the `E_PROTO_STATES_ID` check. */
  entityName?: string
  /** Catalog-relative path reported on every diagnostic. */
  path?: string
  /** SRN of the owning protocol, carried onto the diagnostics. */
  srn?: string
  /**
   * Message names from the protocol's `workflows/*.yaml`. Supplied ⇒ event
   * names are cross-checked (`W_PROTO_STATES_EVENT_UNKNOWN`); omitted ⇒ the
   * check is skipped rather than reported as a miss.
   */
  workflowMessages?: readonly string[]
}

export interface ParseStatesResult {
  /** Null when the file is not the pinned subset at all. */
  chart: StateChart | null
  diagnostics: Diagnostic[]
}

/**
 * Diagnostic codes.
 *
 * protocol.md closes the states.json code set at four errors and two warnings
 * and deliberately provides no generic schema code, so every shape violation —
 * missing key, wrong type, unknown key, non-kebab state name, a final state
 * carrying `on` — reports as `E_PROTO_STATES_SUBSET`: "this file is not the
 * subset the spec pins". Minting `E_PROTO_STATES_SCHEMA` here would widen a set
 * that both the spec table and the diagnostics page enumerate.
 *
 * `initial` that names no child reports as `E_PROTO_STATES_TARGET`: it is the
 * same defect class as an unresolvable transition target — a state reference
 * that points at nothing.
 */
export function parseStates(input: unknown, options: ParseStatesOptions = {}): ParseStatesResult {
  const path = options.path ?? 'states.json'
  const at = (message: string, code: string, severity: Diagnostic['severity'] = 'error'): Diagnostic => ({
    code,
    severity,
    message,
    path,
    ...(options.srn ? { srn: options.srn } : {}),
  })

  // The loader swallows JSON syntax errors into `data: null`, so the "file
  // exists but is not JSON" case has to be reported by whoever reads it.
  if (input === null || input === undefined) {
    return {
      chart: null,
      diagnostics: [at('states.json is empty or not valid JSON', 'E_PROTO_STATES_SUBSET')],
    }
  }

  const parsed = machineSchema.safeParse(input)
  if (!parsed.success) {
    return { chart: null, diagnostics: subsetDiagnostics(parsed.error, input, at) }
  }

  const machine = subsetOf(parsed.data)
  const diagnostics: Diagnostic[] = []

  if (options.entityName && machine.id !== options.entityName) {
    diagnostics.push(
      at(`machine id "${machine.id}" must equal the protocol name "${options.entityName}"`, 'E_PROTO_STATES_ID'),
    )
  }

  const nodes = flatten(machine, diagnostics, at)
  const index = new Map(nodes.map((node) => [node.id, node]))

  const initial = resolveChild(null, machine.initial, index)
  if (!initial) {
    diagnostics.push(at(`initial state "${machine.initial}" is not a key of states`, 'E_PROTO_STATES_TARGET'))
  }

  const edges = collectEdges(machine, nodes, index, diagnostics, at, options.workflowMessages)

  const chart: StateChart = {
    id: machine.id,
    description: machine.description ?? null,
    initial,
    nodes,
    edges,
  }

  for (const unreachable of unreachableStates(chart, index)) {
    diagnostics.push(
      at(`state "${unreachable}" is not reachable from the initial state`, 'W_PROTO_STATES_UNREACHABLE', 'warning'),
    )
  }

  return { chart, diagnostics }
}

/** Every zod issue becomes one "not the subset" diagnostic, with its location. */
function subsetDiagnostics(
  error: z.ZodError,
  input: unknown,
  at: (message: string, code: string, severity?: Diagnostic['severity']) => Diagnostic,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const issue of error.issues) {
    const where = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)'

    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) diagnostics.push(at(`${where}: ${unknownKey(key)}`, 'E_PROTO_STATES_SUBSET'))
      continue
    }

    // zod does not carry the offending value on the issue, so it is read back
    // out of the input — without it "expected final" cannot say "parallel".
    const received = valueAt(input, issue.path)
    if (issue.path.at(-1) === 'type' && (received === 'parallel' || received === 'history')) {
      diagnostics.push(at(`${where}: type "${received}" is outside the supported subset`, 'E_PROTO_STATES_SUBSET'))
      continue
    }

    if (issue.code === 'invalid_union') {
      // Every transition is a three-way union, whose collapsed message is the
      // useless "Invalid input". The transition-object branch is what the author
      // almost always meant, so its issues are the ones worth reporting.
      const branch = issue.errors[1] ?? issue.errors[0] ?? []
      const detail = branch
        .map((sub) => {
          if (sub.code === 'unrecognized_keys') return sub.keys.map(unknownKey).join('; ')
          return [...sub.path.map(String), sub.message].join(': ')
        })
        .join('; ')
      diagnostics.push(
        at(
          `${where}: not a transition — expected a target string, a transition object, or a list of them${
            detail ? ` (${detail})` : ''
          }`,
          'E_PROTO_STATES_SUBSET',
        ),
      )
      continue
    }

    diagnostics.push(at(`${where}: ${issue.message}`, 'E_PROTO_STATES_SUBSET'))
  }

  return diagnostics
}

function unknownKey(key: string): string {
  return OUT_OF_SUBSET_KEYS.has(key)
    ? `"${key}" is an XState construct outside the supported subset`
    : `unknown key "${key}"`
}

function valueAt(root: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let current: unknown = root
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<PropertyKey, unknown>)[key]
  }
  return current
}

/** Depth-first walk producing parents before children — the order React Flow needs. */
function flatten(
  machine: MachineConfig,
  diagnostics: Diagnostic[],
  at: (message: string, code: string, severity?: Diagnostic['severity']) => Diagnostic,
): StateChartNode[] {
  const nodes: StateChartNode[] = []

  const walk = (
    states: Record<string, StateNodeConfig>,
    parent: string | null,
    parentInitial: string | undefined,
    depth: number,
  ) => {
    for (const [key, config] of Object.entries(states)) {
      const id = parent ? `${parent}.${key}` : key

      if (!KEBAB.test(key)) {
        diagnostics.push(at(`state name "${key}" must be kebab-case`, 'E_PROTO_STATES_SUBSET'))
      }
      const final = config.type === 'final'
      if (final && config.on && Object.keys(config.on).length > 0) {
        diagnostics.push(at(`final state "${id}" must not declare transitions`, 'E_PROTO_STATES_SUBSET'))
      }

      const children = config.states ? Object.keys(config.states).map((child) => `${id}.${child}`) : []
      nodes.push({
        id,
        key,
        parent,
        depth,
        initial: parentInitial === key,
        final,
        compound: children.length > 0,
        children,
        entry: list(config.entry),
        exit: list(config.exit),
        tags: config.tags ?? [],
        description: config.description ?? null,
      })

      if (config.states) {
        if (config.initial === undefined) {
          diagnostics.push(at(`compound state "${id}" must declare an initial state`, 'E_PROTO_STATES_SUBSET'))
        } else if (!(config.initial in config.states)) {
          diagnostics.push(
            at(`initial state "${config.initial}" is not a key of "${id}".states`, 'E_PROTO_STATES_TARGET'),
          )
        }
        walk(config.states, id, config.initial, depth + 1)
      } else if (config.initial !== undefined) {
        diagnostics.push(at(`state "${id}" declares initial but has no nested states`, 'E_PROTO_STATES_SUBSET'))
      }
    }
  }

  walk(machine.states, null, machine.initial, 0)
  return nodes
}

function collectEdges(
  machine: MachineConfig,
  nodes: StateChartNode[],
  index: Map<string, StateChartNode>,
  diagnostics: Diagnostic[],
  at: (message: string, code: string, severity?: Diagnostic['severity']) => Diagnostic,
  workflowMessages?: readonly string[],
): StateChartEdge[] {
  const edges: StateChartEdge[] = []
  const messages = workflowMessages ? new Set(workflowMessages) : null

  for (const node of nodes) {
    const config = configOf(machine, node.id)
    if (!config?.on) continue

    for (const [event, value] of Object.entries(config.on)) {
      if (event === '*') {
        diagnostics.push(at(`${node.id}: wildcard events are outside the supported subset`, 'E_PROTO_STATES_SUBSET'))
      } else if (!EVENT_NAME.test(event)) {
        diagnostics.push(at(`event "${event}" must match ^[A-Z][A-Z0-9_]*$`, 'E_PROTO_STATES_EVENT_NAME'))
      } else if (messages && !messages.has(eventToMessage(event))) {
        diagnostics.push(
          at(
            `event ${event} has no matching workflow message "${eventToMessage(event)}"`,
            'W_PROTO_STATES_EVENT_UNKNOWN',
            'warning',
          ),
        )
      }

      const branches = typeof value === 'string' ? [{ target: value }] : Array.isArray(value) ? value : [value]

      branches.forEach((branch, order) => {
        let target = node.id
        let internal = true

        if (branch.target !== undefined) {
          const resolved = resolveTarget(branch.target, node, machine.id, index)
          if (!resolved) {
            diagnostics.push(
              at(
                `${node.id}: transition target "${branch.target}" is neither a sibling state key nor a #${machine.id}.path`,
                'E_PROTO_STATES_TARGET',
              ),
            )
            return
          }
          target = resolved
          internal = false
        }

        edges.push({
          id: `${node.id}--${event}--${order}`,
          source: node.id,
          target,
          event,
          guard: branch.guard ?? null,
          actions: list(branch.actions),
          description: branch.description ?? null,
          internal,
          self: target === node.id,
        })
      })
    }
  }

  return edges
}

/**
 * Two target forms only, per protocol.md: a sibling key, or an absolute
 * `#machine-id.path`. Relative descent (`reserved.settled`) is rejected on
 * purpose — it is the form that silently resolves to the wrong node.
 */
function resolveTarget(
  target: string,
  source: StateChartNode,
  machineId: string,
  index: Map<string, StateChartNode>,
): string | null {
  if (target.startsWith('#')) {
    const [id, ...rest] = target.slice(1).split('.')
    if (id !== machineId || rest.length === 0) return null
    return index.has(rest.join('.')) ? rest.join('.') : null
  }
  if (target.includes('.')) return null
  return resolveChild(source.parent, target, index)
}

function resolveChild(parent: string | null, key: string, index: Map<string, StateChartNode>): string | null {
  const id = parent ? `${parent}.${key}` : key
  return index.has(id) ? id : null
}

/** The state node config at a dot path, or null when the path is bogus. */
function configOf(machine: MachineConfig, id: string): StateNodeConfig | null {
  let states: Record<string, StateNodeConfig> | undefined = machine.states
  let config: StateNodeConfig | null = null
  for (const key of id.split('.')) {
    const next: StateNodeConfig | undefined = states?.[key]
    if (!next) return null
    config = next
    states = next.states
  }
  return config
}

/**
 * Reachability follows XState's entry semantics: entering a compound state
 * enters its initial descendant chain, and entering any state activates its
 * ancestors — which is also why a transition declared on a compound parent is
 * live while a child is active, so its edges are traversed from the parent.
 */
function unreachableStates(chart: StateChart, index: Map<string, StateChartNode>): string[] {
  const reachable = new Set<string>()
  const queue: string[] = []

  const visit = (id: string) => {
    if (reachable.has(id)) return
    reachable.add(id)
    queue.push(id)
  }

  const enter = (id: string | null) => {
    let current = id
    while (current) {
      const node = index.get(current)
      if (!node) return
      // Ancestors are queued too: a transition declared on a compound parent is
      // live while any of its children is active.
      for (const ancestor of ancestors(node)) visit(ancestor)
      visit(current)
      current = node.compound ? (node.children.find((child) => index.get(child)?.initial) ?? null) : null
    }
  }

  enter(chart.initial)
  while (queue.length > 0) {
    const id = queue.shift() as string
    for (const edge of chart.edges) {
      if (edge.source === id) enter(edge.target)
    }
  }

  return chart.nodes.filter((node) => !reachable.has(node.id)).map((node) => node.id)
}

function ancestors(node: StateChartNode): string[] {
  const out: string[] = []
  let parent = node.parent
  while (parent) {
    out.push(parent)
    const cut = parent.lastIndexOf('.')
    parent = cut === -1 ? null : parent.slice(0, cut)
  }
  return out
}

function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return typeof value === 'string' ? [value] : value
}

/**
 * The chart model and its narration, re-exported so every existing importer of
 * this module still resolves. They live in `./state-chart-model` because that is
 * the half the *browser* needs and this half builds zod schemas at module scope.
 * **`StateChartDiagram`, `./mermaid` and anything else on the client side must
 * import them from `./state-chart-model`, never through this re-export.**
 */
export {
  eventToMessage,
  stateChartSummary,
  type StateChart,
  type StateChartEdge,
  type StateChartNode,
  type StateChartSummary,
} from './state-chart-model'
