/**
 * The flattened state chart — the model the drawing and its text equivalent are
 * both made of — and nothing that validates.
 *
 * Split out of `./states`, which keeps the zod subset schema and `parseStates`.
 * Same reason as `./sequence` and `lib/catalog/vocabulary`: `StateChartDiagram`
 * and `lib/protocol/mermaid` are on the client side of the boundary and need
 * exactly the chart shape and `stateChartSummary`, neither of which validates
 * anything — but reaching them through `./states` evaluated that module's zod
 * schemas at import time and pulled the whole of zod into the browser graph. The
 * chart arrives on the client already parsed, from the server.
 *
 * Nothing imported from this module may import zod — `lib/client-bundle.test.ts`
 * walks the real graph and fails if it does.
 */

export interface StateChartNode {
  /** Dot path from the machine root — `reserved.settled`. The chart's node id. */
  id: string
  /** Local key inside the parent's `states`. */
  key: string
  /** Parent node id; null for a top-level state. */
  parent: string | null
  /** 0 for a top-level state. */
  depth: number
  /** This node is its parent's (or the machine's) `initial` state. */
  initial: boolean
  final: boolean
  /** Carries `states` — rendered as a nested region rather than a box. */
  compound: boolean
  children: string[]
  entry: string[]
  exit: string[]
  tags: string[]
  description: string | null
}

export interface StateChartEdge {
  id: string
  source: string
  /** Equals `source` for a self- or internal transition. */
  target: string
  event: string
  guard: string | null
  actions: string[]
  description: string | null
  /** No `target`: actions fire, the machine does not move. */
  internal: boolean
  self: boolean
}

export interface StateChart {
  /** Machine id — equals the protocol entity `name`. */
  id: string
  description: string | null
  /** Node id of the machine's initial state. */
  initial: string | null
  nodes: StateChartNode[]
  edges: StateChartEdge[]
}

/** `STOCK_RESERVATION_RESULT` ⇔ `stock-reservation-result` (protocol.md). */
export function eventToMessage(event: string): string {
  return event.toLowerCase().replace(/_/g, '-')
}

export interface StateChartSummary {
  headline: string
  states: string[]
  transitions: string[]
}

/**
 * The chart in words. Rendered visually hidden next to the canvas so a screen
 * reader — or anything scraping the page — gets the same graph the diagram
 * draws, which is the framework's stated human-plus-AI readability principle.
 */
export function stateChartSummary(chart: StateChart): StateChartSummary {
  const label = (id: string) => id.split('.').join(' › ')
  const finals = chart.nodes.filter((node) => node.final).map((node) => label(node.id))

  const headline = [
    `State machine ${chart.id}: ${chart.nodes.length} states, ${chart.edges.length} transitions.`,
    chart.initial ? `Initial state ${label(chart.initial)}.` : 'No resolvable initial state.',
    finals.length > 0 ? `Final states: ${finals.join(', ')}.` : 'No final states.',
  ].join(' ')

  const states = chart.nodes.map((node) => {
    const facts = [
      node.compound ? `contains ${node.children.length} nested states` : null,
      node.initial ? 'initial' : null,
      node.final ? 'final' : null,
      node.entry.length > 0 ? `entry ${node.entry.join(', ')}` : null,
      node.exit.length > 0 ? `exit ${node.exit.join(', ')}` : null,
      node.tags.length > 0 ? `tags ${node.tags.join(', ')}` : null,
    ].filter(Boolean)
    return `${label(node.id)}${facts.length > 0 ? ` — ${facts.join('; ')}` : ''}.`
  })

  const transitions = chart.edges.map((edge) => {
    const guard = edge.guard ? ` when ${edge.guard}` : ''
    const doing = edge.actions.length > 0 ? `, performing ${edge.actions.join(', ')}` : ''
    if (edge.internal) return `In ${label(edge.source)}, on ${edge.event}${guard} stay${doing}.`
    return `From ${label(edge.source)}, on ${edge.event}${guard} go to ${label(edge.target)}${doing}.`
  })

  return { headline, states, transitions }
}
