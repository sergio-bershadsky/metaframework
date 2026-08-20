import { stateChartSummary, type StateChart, type StateChartEdge, type StateChartNode } from './states'

/**
 * `StateChart` → mermaid `stateDiagram-v2` text.
 *
 * Decision-record amendment 2026-08-19-e: state diagrams render with mermaid,
 * always. `parseStates` remains the validator and the model; this module is the
 * renderer's first half — a pure function from the flattened chart to diagram
 * text, so the wording of every label can be asserted on without a DOM.
 *
 * The shapes chosen for each construct, and why:
 *
 * - **Compound states** are composite states: `state "key" as alias { … }`.
 *   The quoted form is required — it is what lets the drawn title be the state
 *   key while the alias stays a token mermaid's lexer can digest.
 * - **State ids are aliased.** A chart id is a dot path of kebab keys
 *   (`evaluating.validating-coupon`), and mermaid's bare-id token is
 *   `[^:\n\s\-{]+` — a dash or a dot splits the id mid-token. Aliases keep to
 *   `[a-z0-9_]`, via an encoding that is injective for the kebab-and-dot ids
 *   `parseStates` accepts, plus a collision suffix for anything it is not.
 * - **Initial states** get `[*] --> child` at their own level — inside the
 *   composite block for a nested initial, at the root for the machine's.
 * - **Final states** stay named boxes (they carry names, tags and incoming
 *   edge labels) and each additionally flows `alias --> [*]`, so the UML
 *   terminal dot marks where the conversation ends.
 * - **Edge labels** word themselves exactly as the old renderer did:
 *   `EVENT [guard] / action, action`.
 * - **Internal transitions** (no target: actions fire, the machine stays) are
 *   description lines inside their state's box — the UML internal-transition
 *   compartment — because an arrow that leaves and re-enters would say
 *   "exit and entry actions run", which is precisely what `internal` denies.
 * - **Self transitions** are real arrows `alias --> alias`, which mermaid
 *   draws as a loop. *Parallel* self transitions on one state collapse into a
 *   single arrow statement, one transition per label line: mermaid keys a
 *   state's loop edges by their shared endpoints, so of N separate loop
 *   statements only the last is drawn (verified against mermaid 11.17) — the
 *   others would silently vanish from the diagram.
 * - **Entry/exit actions** are description lines too (`entry / …`, `exit / …`).
 *   On a *compound* state they become a `note right of` block instead:
 *   mermaid renders description lines by swapping the state to a
 *   title-plus-compartment shape, and a cluster cannot take that shape.
 * - **`accTitle`/`accDescr`** carry the chart's text equivalent, so the SVG
 *   mermaid produces is named without post-processing.
 */

export interface CompiledStateDiagram {
  /** The `stateDiagram-v2` source. */
  text: string
  /** Chart node id → the mermaid alias it is declared as. */
  aliases: ReadonlyMap<string, string>
  /**
   * Chart edge ids per transition statement, in the order the statements
   * appear in `text`, with `null` for the pseudo-transitions ([*] arrows)
   * interleaved among them. One statement usually carries one edge; a merged
   * parallel-self-loop statement carries every edge it stands for. Mermaid
   * assigns DOM ids to edges in statement order, so this is the join key for
   * any SVG post-processing.
   */
  edgeOrder: ReadonlyArray<readonly string[] | null>
}

export function statesToMermaid(chart: StateChart): string {
  return compileStates(chart).text
}

export function compileStates(chart: StateChart): CompiledStateDiagram {
  const aliases = stateAliases(chart)
  const alias = (id: string) => aliases.get(id) as string
  const byParent = new Map<string | null, StateChartNode[]>()
  for (const node of chart.nodes) {
    const siblings = byParent.get(node.parent) ?? []
    siblings.push(node)
    byParent.set(node.parent, siblings)
  }

  const lines: string[] = ['stateDiagram-v2', '  direction TB']

  const summary = stateChartSummary(chart)
  lines.push(`  accTitle: State machine ${escapeLabel(chart.id)}`)
  lines.push(`  accDescr: ${escapeLabel(summary.headline)}`)

  const edgeOrder: Array<string[] | null> = []
  const internals = internalsBySource(chart.edges)

  /** Declarations first — a state exists before anything points at it. */
  const declare = (node: StateChartNode, depth: number) => {
    const pad = '  '.repeat(depth + 1)
    const head = `${pad}state "${escapeLabel(title(node))}" as ${alias(node.id)}`

    if (!node.compound) {
      lines.push(head)
      for (const line of compartmentLines(node, internals.get(node.id) ?? [])) {
        lines.push(`${pad}${alias(node.id)} : ${escapeLabel(line)}`)
      }
      return
    }

    lines.push(`${head} {`)
    const children = byParent.get(node.id) ?? []
    const initial = children.find((child) => child.initial)
    if (initial) {
      lines.push(`${pad}  [*] --> ${alias(initial.id)}`)
      edgeOrder.push(null)
    }
    for (const child of children) declare(child, depth + 1)
    lines.push(`${pad}}`)

    // A cluster cannot render the description compartment, so its actions and
    // internal transitions hang beside it as a note.
    const noteLines = compartmentLines(node, internals.get(node.id) ?? [])
    if (noteLines.length > 0) {
      lines.push(`${pad}note right of ${alias(node.id)}`)
      for (const line of noteLines) lines.push(`${pad}  ${escapeLabel(line)}`)
      lines.push(`${pad}end note`)
    }
  }

  for (const root of byParent.get(null) ?? []) declare(root, 0)

  if (chart.initial) {
    lines.push(`  [*] --> ${alias(chart.initial)}`)
    edgeOrder.push(null)
  }

  // Parallel self loops, grouped up front so the loop below can spend a
  // state's whole group in one statement when it reaches the first of them.
  const selfLoops = new Map<string, StateChartEdge[]>()
  for (const edge of chart.edges) {
    if (edge.internal || edge.source !== edge.target) continue
    const group = selfLoops.get(edge.source) ?? []
    group.push(edge)
    selfLoops.set(edge.source, group)
  }

  const merged = new Set<string>()
  for (const edge of chart.edges) {
    if (edge.internal) continue // rendered inside the state's compartment
    const group = edge.source === edge.target ? (selfLoops.get(edge.source) as StateChartEdge[]) : null
    if (group && group.length > 1) {
      if (merged.has(edge.source)) continue // spent by the group's first edge
      merged.add(edge.source)
      // `<br/>` is mermaid's own line break; each line is escaped on its own,
      // so the separator cannot be forged from inside a label.
      const label = group.map((loop) => escapeLabel(edgeLabel(loop))).join('<br/>')
      lines.push(`  ${alias(edge.source)} --> ${alias(edge.target)} : ${label}`)
      edgeOrder.push(group.map((loop) => loop.id))
      continue
    }
    lines.push(`  ${alias(edge.source)} --> ${alias(edge.target)} : ${escapeLabel(edgeLabel(edge))}`)
    edgeOrder.push([edge.id])
  }

  for (const node of chart.nodes) {
    if (!node.final) continue
    lines.push(`  ${alias(node.id)} --> [*]`)
    edgeOrder.push(null)
  }

  return { text: lines.join('\n'), aliases, edgeOrder }
}

/** `EVENT [guard] / action, action` — the old renderer's wording, verbatim. */
export function edgeLabel(edge: Pick<StateChartEdge, 'event' | 'guard' | 'actions'>): string {
  const guard = edge.guard ? ` [${edge.guard}]` : ''
  const actions = edge.actions.length > 0 ? ` / ${edge.actions.join(', ')}` : ''
  return `${edge.event}${guard}${actions}`
}

/**
 * Chart node id → mermaid alias, for every node in the chart.
 *
 * The encoding is injective on kebab-and-dot ids — `.` → `__`, `-` → `_`,
 * anything else non-alphanumeric → `_x{hex}x` — so two legal ids can never
 * share an alias. Ids `parseStates` merely diagnosed (a `--` inside a key can
 * collide with a dot) fall back to a counting suffix rather than a collision.
 */
export function stateAliases(chart: StateChart): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>()
  const taken = new Set<string>()
  for (const node of chart.nodes) {
    let alias = encodeAlias(node.id)
    for (let n = 2; taken.has(alias); n++) alias = `${encodeAlias(node.id)}_${n}`
    taken.add(alias)
    aliases.set(node.id, alias)
  }
  return aliases
}

function encodeAlias(id: string): string {
  // The `s_` prefix keeps an alias from ever being a grammar keyword and from
  // starting with a digit.
  return `s_${id.replace(/[^a-zA-Z0-9]/g, (char) =>
    char === '.' ? '__' : char === '-' ? '_' : `_x${char.charCodeAt(0).toString(16)}x`,
  )}`
}

/** What the box is titled: the local key, dot-crumbed only at the root level. */
function title(node: StateChartNode): string {
  return node.key
}

/**
 * The UML compartment under the state name: entry, exit, then each internal
 * transition, worded like an edge label — because that is what it is, minus
 * the arrow.
 */
function compartmentLines(node: StateChartNode, internals: StateChartEdge[]): string[] {
  const lines: string[] = []
  if (node.entry.length > 0) lines.push(`entry / ${node.entry.join(', ')}`)
  if (node.exit.length > 0) lines.push(`exit / ${node.exit.join(', ')}`)
  for (const edge of internals) lines.push(edgeLabel(edge))
  return lines
}

function internalsBySource(edges: StateChartEdge[]): Map<string, StateChartEdge[]> {
  const map = new Map<string, StateChartEdge[]>()
  for (const edge of edges) {
    if (!edge.internal) continue
    const list = map.get(edge.source) ?? []
    list.push(edge)
    map.set(edge.source, list)
  }
  return map
}

/**
 * Mermaid's line-oriented lexer, not XSS, is what this guards against: a
 * newline ends a statement, a `;` ends a description token, a `"` ends a
 * quoted label, and `{`/`}` open and close composite blocks. All of them are
 * legal inside a guard or a description, so they are flattened to spelling
 * mermaid can carry (`#59;` is mermaid's own entity syntax).
 */
function escapeLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/;/g, '#59;')
    .replace(/"/g, '#quot;')
    .replace(/\{/g, '#123;')
    .replace(/\}/g, '#125;')
    .trim()
}
