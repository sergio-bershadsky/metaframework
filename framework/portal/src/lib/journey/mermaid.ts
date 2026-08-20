/**
 * `Journey` → mermaid `flowchart TD` text.
 *
 * Decision-record amendment 2026-08-19-e and the owner's follow-up: mermaid
 * renders derived artifact diagrams; React Flow is kept for the neighbourhood
 * graph and the solution map. A journey is a derived artifact diagram, so it is
 * mermaid — through the same loader, the same theme and the same
 * render-then-decorate shape the state chart uses. A second loader or a second
 * theming path would be drift by construction.
 *
 * **Why `flowchart TD`, and not the alternatives.** kinds/journey.md describes
 * the derived view as "the ladder drawn with a band per product, so a crossing
 * is a visible change of band". What has to read at a glance is therefore
 * *order* and *which product each step is in*.
 *
 * - Mermaid's own `journey` type was the obvious candidate and is wrong: its
 *   syntax requires a satisfaction score per task (`Task: 5: Actor`). The
 *   catalog has no score — journey.md rules emotion and satisfaction scoring
 *   out by name — and inventing one would put a number on the drawing that
 *   nothing backs.
 * - `sequenceDiagram` fits the data — actors as lifelines, steps as ordered
 *   messages — but the portal already draws protocol exchanges in exactly that
 *   shape, and journey.md's first job is to be *not* a protocol. A step that
 *   touches a component is not a message.
 * - `stateDiagram-v2` would make a journey look like a protocol's conversation
 *   state machine, for the same reason and at the same cost.
 * - `flowchart LR` reads as time-flows-right, the conventional journey drawing
 *   — but the artifact pane is a tall, narrow column shared with the source,
 *   and twelve boxes side by side is a horizontal scrollbar with a picture
 *   behind it.
 *
 * `flowchart TD` gives every step full label width, scrolls the way the source
 * beside it scrolls, and — with branching ruled out by the format and length
 * bounded at 12 — is a straight chain, the one layout that is always legible.
 * Subgraphs supply the bands.
 *
 * What each part of the drawing carries:
 *
 * - **A band is a contiguous run of steps in one product**, titled with the
 *   product's name. Per *run*, not per product: a walk that returns to a
 *   product later gets a second band with the same title, which is the truth
 *   ("it came back") and keeps the chain linear. One subgraph per distinct
 *   product would force the layout to fold the sequence back on itself, which
 *   is the one thing this format exists to prevent.
 * - **A node is a step**: `n · actor` over the *name* of the entity it touches,
 *   plus `via <protocol>` when the step names one, or `actor-carried` for the
 *   documented negative. Names, not titles: an SRN tail is the console's
 *   identity register, and it is what the ladder beneath repeats as a link.
 *
 *   The protocol sits in the node rather than on the hop, which is where
 *   journey.md's sketch of this view puts it. The field is per-step and a step
 *   may name a protocol without crossing anything; splitting it between the
 *   node and the arrow by whether the step also happens to cross would make one
 *   field appear in two places depending on a fact about its neighbour.
 * - **An arrow is "then"**, and says only what the boxes cannot: whether the
 *   actor changed (a hand-off), and what kind of product crossing this is —
 *   documented (thick), actor-carried (dotted), or a gap nobody has written
 *   down (labelled, and coloured by the caller's decorate pass).
 * - **Notes are not drawn.** They are up to 200 characters and would set the
 *   width of every box in the chain. The ladder beneath carries them, in full.
 * - **`accTitle`/`accDescr`** carry the walk's text equivalent, so the SVG is
 *   named without post-processing.
 *
 * Node ids are positional (`js0`, `js1`, …) rather than derived from a
 * reference: steps have no ids in the format, two steps may touch the same
 * entity, and position is the only thing unique by construction.
 */

/** What an arrow between two steps says about the hop. */
export type JourneyHop =
  /** Same product, nothing to report. */
  | 'plain'
  /** A product boundary, with a protocol naming how it is crossed. */
  | 'crossing'
  /** A product boundary the actor carries themselves (`protocol: none`). */
  | 'carried'
  /** A product boundary nobody has written a protocol for. */
  | 'gap'

/** One step, as the drawing needs it — resolved labels, no catalog types. */
export interface JourneyDrawStep {
  /** 1-based position, as the ladder numbers it too. */
  ordinal: number
  /** Who acts: the resolved entity name, or the tail of the raw reference. */
  actor: string
  /** What is touched: the resolved entity name, or the tail of the reference. */
  touches: string
  /** The protocol the step goes through, when it names one. */
  via?: string
  /** The step wrote `protocol: none`. */
  actorCarried?: boolean
  /** `shop` — the owning product's name, or null when it is unknowable. */
  band: string | null
  /** This step's owning product differs from the previous step's. */
  crossing?: boolean
  /** This step's actor differs from the previous step's. */
  handoff?: boolean
}

export interface CompiledJourney {
  /** The `flowchart TD` source. */
  text: string
  /** Mermaid node id per step, in step order — the join key for the SVG. */
  nodeIds: string[]
  /**
   * One entry per arrow statement, in the order the statements appear — which
   * is the order mermaid numbers its edges. The join key for styling the hops
   * a theme variable cannot reach.
   */
  hops: JourneyHop[]
}

export function journeyToMermaid(steps: readonly JourneyDrawStep[]): string {
  return compileJourney(steps).text
}

export function compileJourney(steps: readonly JourneyDrawStep[]): CompiledJourney {
  const nodeIds = steps.map((_, index) => `js${index}`)
  const lines: string[] = ['flowchart TD']

  lines.push('  accTitle: Journey walk')
  lines.push(`  accDescr: ${escapeLabel(describe(steps))}`)

  // Declarations first, banded — a node exists before anything points at it.
  for (const run of bands(steps)) {
    if (run.band === null) {
      for (const index of run.indexes) lines.push(`  ${node(nodeIds[index], steps[index])}`)
      continue
    }
    lines.push(`  subgraph ${run.id}["${escapeLabel(run.band)}"]`)
    lines.push('    direction TB')
    for (const index of run.indexes) lines.push(`    ${node(nodeIds[index], steps[index])}`)
    lines.push('  end')
  }

  const hops: JourneyHop[] = []
  for (let index = 1; index < steps.length; index++) {
    const step = steps[index]
    const hop: JourneyHop = !step.crossing
      ? 'plain'
      : step.via
        ? 'crossing'
        : step.actorCarried
          ? 'carried'
          : 'gap'
    hops.push(hop)

    const parts = [
      ...(step.handoff ? ['hand-off'] : []),
      ...(hop === 'carried' ? ['carried by the actor'] : []),
      ...(hop === 'gap' ? ['no protocol'] : []),
    ]
    const label = parts.length > 0 ? `"${parts.map(escapeLabel).join(' · ')}"` : ''
    lines.push(`  ${nodeIds[index - 1]} ${arrow(hop, label)} ${nodeIds[index]}`)
  }

  return { text: lines.join('\n'), nodeIds, hops }
}

/** Contiguous runs of steps sharing one owning product. */
function bands(steps: readonly JourneyDrawStep[]): Array<{ id: string; band: string | null; indexes: number[] }> {
  const runs: Array<{ id: string; band: string | null; indexes: number[] }> = []
  steps.forEach((step, index) => {
    const last = runs[runs.length - 1]
    if (last && last.band === step.band && step.band !== null) {
      last.indexes.push(index)
      return
    }
    runs.push({ id: `jb${runs.length}`, band: step.band, indexes: [index] })
  })
  return runs
}

function node(id: string, step: JourneyDrawStep): string {
  const label = [
    `${step.ordinal} · ${step.actor}`,
    step.touches,
    ...(step.via ? [`via ${step.via}`] : step.actorCarried ? ['actor-carried'] : []),
  ]
    // `<br/>` is mermaid's own line break; each line is escaped on its own, so
    // the separator cannot be forged from inside a label.
    .map(escapeLabel)
    .join('<br/>')
  return `${id}("${label}")`
}

/** Thick for a documented crossing, dotted for an actor-carried one. */
function arrow(hop: JourneyHop, label: string): string {
  if (hop === 'crossing') return label ? `== ${label} ==>` : '==>'
  if (hop === 'carried') return label ? `-. ${label} .->` : '-.->'
  return label ? `-- ${label} -->` : '-->'
}

function describe(steps: readonly JourneyDrawStep[]): string {
  if (steps.length === 0) return 'This journey has no steps.'
  // Joined with a comma rather than a semicolon: `escapeLabel` has to flatten
  // `;` for mermaid's lexer, and the entity code it becomes would be read out
  // verbatim by whatever consumes the accessible description.
  return `${steps.length} step${steps.length === 1 ? '' : 's'}, in order: ${steps
    .map((step) => `${step.ordinal} ${step.actor} at ${step.touches}`)
    .join(', ')}`
}

/**
 * Mermaid's line-oriented lexer, not XSS, is what this guards against: a
 * newline ends a statement, a `;` ends one too in flowchart syntax, a `"` ends
 * a quoted label, and `{`/`}` open and close a node shape. All of them are
 * legal inside a title or a name, so they are flattened to spelling mermaid can
 * carry (`#59;` is mermaid's own entity syntax). The same guard the state-chart
 * generator applies, for the same reason.
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
