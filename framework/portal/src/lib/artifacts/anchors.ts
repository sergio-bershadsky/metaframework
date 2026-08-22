import type { StateChart } from '../protocol/state-chart-model'
import type { Workflow, WorkflowStep } from '../protocol/sequence'
import { type AnchorPaths, parsePositionalPath } from './source-map'

/**
 * The join between a drawn element and the lines that authored it.
 *
 * Each builder here answers one question: for this artifact, which element ids
 * does the renderer use, and where does each one live in the file? The ids are
 * the diagram's own — a workflow step's positional path, a state node's dot
 * path, a transition's edge id — so neither the diagram nor the editor has to
 * learn a translation layer. Only this module knows both vocabularies.
 */

/**
 * Workflow steps, fragments and compartments.
 *
 * The path a step carries (`steps[4].alt[0].steps[2]`) is already the path
 * through the YAML that produced it — the spec keys steps positionally because
 * they have no ids — so the mapping is a parse, not a translation. The one case
 * worth naming is `otherwise`, whose value *is* the step list: its children key
 * as `steps[4].otherwise[0]`, and the YAML agrees, because the parser was
 * written against the same file shape.
 */
export function workflowAnchors(workflow: Workflow): AnchorPaths {
  const anchors: AnchorPaths = {}

  const walk = (steps: WorkflowStep[]) => {
    for (const step of steps) {
      anchors[step.path] = parsePositionalPath(step.path)
      if (step.type === 'message') continue
      for (const compartment of step.compartments) {
        anchors[compartment.path] = parsePositionalPath(compartment.path)
        walk(compartment.steps)
      }
    }
  }

  walk(workflow.steps)
  return anchors
}

/**
 * State nodes and transitions.
 *
 * A node id is the dot path from the machine root, which becomes a path through
 * the config by interleaving the `states` key: `reserved.settled` is authored at
 * `states.reserved.states.settled`. A transition id is `<source>--<EVENT>--<n>`;
 * neither a kebab-case state path nor a SCREAMING_SNAKE event name can contain
 * a double hyphen, so splitting on it is unambiguous. The trailing ordinal is
 * only a real path segment when the event declares a guarded *list* of
 * transitions, which is what `arrayEvents` reports.
 */
export function stateChartAnchors(chart: StateChart, data: unknown): AnchorPaths {
  const anchors: AnchorPaths = {}

  for (const node of chart.nodes) {
    anchors[node.id] = statePath(node.id)
  }

  for (const edge of chart.edges) {
    const base = [...statePath(edge.source), 'on', edge.event]
    const order = edge.id.slice(edge.id.lastIndexOf('--') + 2)
    anchors[edge.id] = isTransitionList(data, base) ? [...base, order] : base
  }

  return anchors
}

/** `reserved.settled` → `states.reserved.states.settled`. */
function statePath(id: string): string[] {
  return id.split('.').flatMap((key) => ['states', key])
}

function isTransitionList(data: unknown, path: readonly string[]): boolean {
  let current: unknown = data
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return false
    current = (current as Record<string, unknown>)[segment]
  }
  return Array.isArray(current)
}
