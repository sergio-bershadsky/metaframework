import type { MachineConfig, StateNodeConfig, TransitionConfig } from './states'

/**
 * `states.json` → XState's *normalized* JSON surface.
 *
 * The authored subset (framework/spec/kinds/protocol.md) is written in XState's
 * shorthand: a bare string target, a single action name where a list is allowed,
 * a prose guard, one transition where an array is allowed. `createMachine()`
 * expands all of that itself, so nothing in the portal needs this module to
 * *run* a machine.
 *
 * What it is for: the published XState JSON Schema
 * (`https://stately.ai/schemas/xstate.json`, vendored under `vendor/`) describes
 * only the expanded surface and closes every object with
 * `additionalProperties: false`, so it admits no shorthand at all. Normalizing
 * here is what turns that schema into a usable conformance target — the proof
 * that our subset really is XState — without weakening our own validator, which
 * stays strict on the authored form.
 *
 * The result is built key by key from the authored keys, never by spreading the
 * input, so the artifact dialect discriminator (`$schema`, ADR 0015) can never
 * leak into an export that XState's own schema would then reject.
 *
 * The same function used forward is the export-to-XState-JSON action. It is one
 * way out and never a way back in: the shorthand an author wrote is not
 * recoverable from the expansion, and guard/action names stay *prose references*
 * — a consumer still has to `.provide({ guards, actions })` before the machine
 * will take a guarded transition.
 */

/** XState's `{ type }` form — one entry of `entry`/`exit`/`actions`, or a guard. */
export interface XStateParameterizedObject {
  type: string
}

export interface XStateTransitionObject {
  /** Always an array in the normalized form, even for a single target. */
  target?: string[]
  guard?: XStateParameterizedObject
  actions?: XStateParameterizedObject[]
  description?: string
}

export interface XStateNodeJson {
  type?: 'final'
  initial?: string
  states?: Record<string, XStateNodeJson>
  /** Always an array of transition objects, even for a single transition. */
  on?: Record<string, XStateTransitionObject[]>
  entry?: XStateParameterizedObject[]
  exit?: XStateParameterizedObject[]
  tags?: string[]
  description?: string
}

/**
 * `initial` stays optional here although the subset requires it: this type
 * describes XState JSON, where an atomic machine legitimately has none.
 */
export interface XStateMachineJson extends XStateNodeJson {
  id: string
}

/** The machine config as XState JSON — shorthand expanded, nothing else changed. */
export function toXStateJson(machine: MachineConfig): XStateMachineJson {
  return { id: machine.id, ...node(machine) }
}

function node(config: StateNodeConfig): XStateNodeJson {
  const entry = parameterized(config.entry)
  const exit = parameterized(config.exit)
  return {
    ...(config.type !== undefined ? { type: config.type } : {}),
    ...(config.initial !== undefined ? { initial: config.initial } : {}),
    ...(config.states ? { states: mapValues(config.states, node) } : {}),
    ...(config.on ? { on: mapValues(config.on, transitions) } : {}),
    ...(entry ? { entry } : {}),
    ...(exit ? { exit } : {}),
    ...(config.tags ? { tags: config.tags } : {}),
    ...(config.description !== undefined ? { description: config.description } : {}),
  }
}

/** The three transition shorthands collapse to one array of transition objects. */
function transitions(value: string | TransitionConfig | TransitionConfig[]): XStateTransitionObject[] {
  const branches = typeof value === 'string' ? [{ target: value }] : Array.isArray(value) ? value : [value]

  return branches.map((branch) => {
    const actions = parameterized(branch.actions)
    return {
      ...(branch.target !== undefined ? { target: [branch.target] } : {}),
      ...(branch.guard !== undefined ? { guard: { type: branch.guard } } : {}),
      ...(actions ? { actions } : {}),
      ...(branch.description !== undefined ? { description: branch.description } : {}),
    }
  })
}

function parameterized(value: string | string[] | undefined): XStateParameterizedObject[] | undefined {
  if (value === undefined) return undefined
  return (typeof value === 'string' ? [value] : value).map((type) => ({ type }))
}

function mapValues<In, Out>(record: Record<string, In>, fn: (value: In) => Out): Record<string, Out> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(value)]))
}
