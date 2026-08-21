'use client'

import { Play } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ExpandButton } from '@/components/diagrams/expand-button'
import { CopyMachineButton, StateSimulator } from '@/components/diagrams/state-simulator'
import { useExpandable } from '@/lib/diagrams/use-expandable'
import { compileStates } from '@/lib/protocol/mermaid'
import { stateChartSummary, type StateChart } from '@/lib/protocol/states'
import { renderMermaid } from '@/lib/ui/mermaid'
import { cn } from '@/lib/utils'

/**
 * The state chart derived from a protocol's `states.json`, drawn by mermaid.
 *
 * Rebuilt from scratch per decision-record amendment 2026-08-19-e: the custom
 * React Flow renderer went through repeated legibility rounds and still grazed
 * labels; mermaid's deterministic `stateDiagram-v2` layout replaced it, always.
 * The division of labour is strict — `parseStates` stays the validator and the
 * model, `statesToMermaid` (a pure, tested function) decides every word on the
 * drawing, and this component only renders that text and dresses the SVG.
 *
 * Mermaid itself is loaded and themed by `@/lib/ui/mermaid` — one loader for
 * every derived diagram, so the state chart and the journey walk cannot drift
 * onto two theming paths.
 *
 * Interactivity is SVG post-processing, and each piece guards itself:
 *
 * - **States** are found by mermaid's stable node ids (`state-<alias>-<n>`,
 *   `stateDomId` in mermaid's dataFetcher), joined back to chart node ids via
 *   the generator's alias map. Clicking selects the state's source lines,
 *   hovering previews them — the same anchor contract the old renderer had.
 * - **Transitions** are joined *by rank*: mermaid numbers its edges
 *   (`<renderId>-edge<n>`) in statement order, but notes share the counter,
 *   so the numbers themselves index nothing — sorting the arrow paths by `n`
 *   and zipping against the generator's statement list (`edgeOrder`) is the
 *   join. It is verified by count before it is trusted — if the SVG
 *   disagrees, edge interactivity is dropped rather than mis-wired. Labels
 *   join exactly, by the `data-id="edge<n>"` they carry themselves.
 * - **Hover dimming** recedes everything not adjacent to the hovered state or
 *   transition, computed from the chart model, applied as a class.
 * - **The simulation highlight** rides the same `byAnchor` map but carries its
 *   own class, `smc-active`. It cannot share `smc-linked`: that class is
 *   rewritten in full on every anchor-hover pass, so a run would vanish the
 *   moment the pointer touched the source pane.
 *
 * `state-simulator.tsx` is statically imported and only *rendered* on the
 * Simulate click; `xstate` itself is behind a further dynamic import inside it,
 * so a page whose state chart is never simulated ships no runtime at all.
 */

export interface StateChartDiagramProps {
  chart: StateChart
  /**
   * State node ids and transition edge ids the source side is pointing at. The
   * chart's own ids are the join key — `states.json` is what it was built
   * from, and `anchors.ts` maps each id back to the lines that declared it.
   */
  activeAnchors?: readonly string[]
  /** The pointer moved onto a state or transition, or off one (null). */
  onAnchorHover?: (id: string | null) => void
  /** A state or transition was clicked; the selection outlives the pointer. */
  onAnchorSelect?: (id: string | null) => void
  /**
   * Chart node ids to light as the active configuration — leaf and ancestors.
   *
   * Separate from `activeAnchors` on purpose: that prop is the source pane's
   * pointer, rewritten several times a second, while this one is a run someone
   * is reading. Supplied here it overrides the built-in simulator, which is
   * what a driver outside this component (a live inspector receiving a running
   * app's snapshots) needs to light the same drawing.
   */
  simulatedStates?: readonly string[]
  className?: string
}

export function StateChartDiagram({
  chart,
  activeAnchors,
  onAnchorHover,
  onAnchorSelect,
  simulatedStates,
  className,
}: StateChartDiagramProps) {
  const compiled = useMemo(() => compileStates(chart), [chart])
  const summary = useMemo(() => stateChartSummary(chart), [chart])
  const { expanded, toggle: toggleExpanded } = useExpandable()

  const hostRef = useRef<HTMLDivElement>(null)
  /** The SVG→chart join, rebuilt on every render pass; null between passes. */
  const joinRef = useRef<SvgJoin | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [rendered, setRendered] = useState(false)
  /** How many chart states the SVG actually yielded elements for. */
  const [mappedStates, setMappedStates] = useState(0)
  const [simulating, setSimulating] = useState(false)
  const [simulated, setSimulated] = useState<readonly string[]>([])
  const renderId = `smc${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  // The callbacks live in a ref so the render effect keys on the chart alone:
  // a parent handing down a fresh closure per render must not re-run mermaid.
  const callbacks = useRef({ onAnchorHover, onAnchorSelect })
  useEffect(() => {
    callbacks.current = { onAnchorHover, onAnchorSelect }
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host || chart.nodes.length === 0) return
    let cancelled = false

    renderMermaid(renderId, compiled.text)
      .then((root) => {
        if (cancelled) return
        host.replaceChildren(root)
        const join = decorate(host, chart, compiled, renderId, callbacks.current)
        joinRef.current = join
        setMappedStates(join.states.size)
        setFailure(null)
        setRendered(true)
      })
      .catch((error: unknown) => {
        // A failed render can leave mermaid's scratch element in the document.
        document.getElementById(renderId)?.remove()
        if (cancelled) return
        setMappedStates(0)
        setFailure(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
      joinRef.current = null
    }
  }, [chart, compiled, renderId])

  // The source pane's pointer, reflected into the SVG. A separate effect from
  // the render pass: hovering a line of YAML must not re-run mermaid.
  useEffect(() => {
    const join = joinRef.current
    if (!join) return
    const linked = new Set(activeAnchors ?? [])
    for (const [id, elements] of join.byAnchor) {
      for (const element of elements) element.classList.toggle('smc-linked', linked.has(id))
    }
  }, [activeAnchors, rendered])

  // The simulation's active configuration, on its own class and its own pass —
  // a run has to survive every hover the anchor effect above processes.
  const lit = simulatedStates ?? simulated
  useEffect(() => {
    const join = joinRef.current
    if (!join) return
    const active = new Set(lit)
    for (const [id, elements] of join.byAnchor) {
      for (const element of elements) element.classList.toggle('smc-active', active.has(id))
    }
  }, [lit, rendered])

  const closeSimulation = useCallback(() => {
    setSimulating(false)
    setSimulated([])
  }, [])

  // What the panel is told about its own highlight. While mermaid is still
  // drawing there is nothing to join to yet, and reporting the empty join then
  // would be a false alarm — so the shortfall is only real once a pass landed.
  const highlight = useMemo(() => {
    const total = chart.nodes.length
    if (failure) return { mapped: 0, total }
    return { mapped: rendered ? mappedStates : total, total }
  }, [chart.nodes.length, failure, rendered, mappedStates])

  if (chart.nodes.length === 0) {
    return (
      <p className={cn('panel px-4 py-6 text-[13px] text-muted-foreground', className)}>
        This machine declares no states.
      </p>
    )
  }

  return (
    <figure
      data-expanded={expanded || undefined}
      className={cn(
        'panel diagram-surface overflow-hidden',
        expanded && 'fixed inset-0 z-50 flex flex-col rounded-none border-0 bg-background',
        className,
      )}
    >
      {chart.description && (
        <p className="border-b border-border px-4 py-2.5 text-[12.5px] text-muted-foreground">{chart.description}</p>
      )}

      <div className={cn('relative', expanded && 'min-h-0 flex-1')}>
        {failure ? (
          <TextFallback summary={summary} />
        ) : (
          <>
            <div
              ref={hostRef}
              className={cn('smc-host overflow-auto p-4', expanded && 'absolute inset-0')}
              // The drawing is a duplicate of the figcaption below, and every
              // interactive element in it duplicates the source pane's lines —
              // hiding it keeps a screen reader from hearing the machine twice.
              aria-hidden
            />
            {!rendered && (
              <div className="absolute inset-0 grid place-items-center bg-surface" role="status" aria-live="polite">
                <p className="font-mono text-[11px] tracking-tight text-muted-foreground">Drawing the state chart…</p>
              </div>
            )}
          </>
        )}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
          <CopyMachineButton
            chart={chart}
            className="rounded-md border border-border bg-surface/90 backdrop-blur-sm hover:bg-surface-raised"
          />
          <button
            type="button"
            onClick={() => (simulating ? closeSimulation() : setSimulating(true))}
            aria-pressed={simulating}
            aria-label={simulating ? 'Close the simulation' : 'Simulate this machine in the browser'}
            title="Simulate"
            className={cn(
              'focusable rounded-md border border-border bg-surface/90 p-1 backdrop-blur-sm transition',
              'text-muted-foreground hover:bg-surface-raised hover:text-foreground aria-pressed:text-primary',
            )}
          >
            <Play className="size-3.5" aria-hidden />
          </button>
          <ExpandButton
            expanded={expanded}
            onToggle={toggleExpanded}
            className="rounded-md border border-border bg-surface/90 backdrop-blur-sm hover:bg-surface-raised"
          />
        </div>
      </div>

      {simulating && (
        <StateSimulator
          chart={chart}
          onStatesChange={setSimulated}
          highlight={highlight}
          onClose={closeSimulation}
          className={cn(expanded && 'max-h-[45%]')}
        />
      )}

      <figcaption className="sr-only">
        <p>{summary.headline}</p>
        <ul>
          {summary.states.map((state) => (
            <li key={state}>{state}</li>
          ))}
        </ul>
        <ul>
          {summary.transitions.map((transition) => (
            <li key={transition}>{transition}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

/* -------------------------------------------------------- post-processing */

interface SvgJoin {
  /** Anchor id (state node id or transition edge id) → its SVG elements. */
  byAnchor: Map<string, Element[]>
  /**
   * Chart node ids that resolved to at least one SVG element. Counted rather
   * than assumed: the simulation highlight is the one feature whose silent
   * failure is indistinguishable from "the machine is not moving", so the panel
   * compares this against the chart and says which of the two it is.
   */
  states: Set<string>
}

/**
 * Dress mermaid's SVG and wire it to the anchor contract.
 *
 * Everything here works from the two joins the generator guarantees — the
 * alias map for states, statement order for transitions — and degrades by
 * dropping a feature when the SVG breaks a guarantee, never by guessing.
 */
function decorate(
  host: HTMLElement,
  chart: StateChart,
  compiled: ReturnType<typeof compileStates>,
  renderId: string,
  callbacks: { onAnchorHover?: (id: string | null) => void; onAnchorSelect?: (id: string | null) => void },
): SvgJoin {
  const svg = host.querySelector('svg')
  const byAnchor = new Map<string, Element[]>()
  if (!svg) return { byAnchor, states: new Set<string>() }

  svg.classList.add('smc-svg')

  // ---- states, by mermaid's stable dom ids -------------------------------
  // `stateDomId` in mermaid's dataFetcher: `<renderId>-state-<alias>-<n>`,
  // for leaves and composite clusters alike. The `-\d+$` anchor is what keeps
  // an alias from matching its own note satellites (`…----note-1`), and
  // aliases never contain `-`, so one alias cannot prefix-match another.
  const byAlias = new Map<string, string>()
  for (const [nodeId, alias] of compiled.aliases) byAlias.set(alias, nodeId)
  const stateElements = new Map<string, Element[]>()
  const statePattern = new RegExp(`^${renderId}-state-(.+)-\\d+$`)
  for (const element of svg.querySelectorAll(`[id^="${renderId}-state-"]`)) {
    const alias = element.id.match(statePattern)?.[1]
    const nodeId = alias ? byAlias.get(alias) : undefined
    if (nodeId === undefined) continue
    const elements = stateElements.get(nodeId) ?? []
    elements.push(element)
    stateElements.set(nodeId, elements)
    byAnchor.set(nodeId, elements)
  }

  for (const node of chart.nodes) {
    const elements = stateElements.get(node.id) ?? []
    // The double border on a named final state keeps the protocol hue —
    // carried over from the old renderer, where colour stays ontology.
    if (node.final) for (const element of elements) element.classList.add('smc-final')
  }

  // ---- transitions, by mermaid's edge numbering --------------------------
  // Every arrow statement becomes one `<renderId>-edge<n>` path, with `n`
  // increasing in statement order — but not *equal* to it: note edges share
  // the counter (their paths carry a different id shape and drop out of the
  // match, yet they consume a number), so the join sorts the arrow paths by
  // `n` and zips them against the generator's `edgeOrder` by rank. The zip is
  // verified by count before it is trusted — a mismatch (a mermaid upgrade
  // reshaping its DOM) drops edge wiring whole rather than mis-wiring it.
  // Labels need no such care: each carries its path's own token in
  // `data-id="edge<n>"`, an exact join.
  const paths = [...svg.querySelectorAll('.edgePaths > *')]
  const labels = [...svg.querySelectorAll('.edgeLabels > *')]
  const edgePattern = new RegExp(`^${renderId}-edge(\\d+)$`)

  const labelByToken = new Map<string, Element>()
  for (const label of labels) {
    const token = label.querySelector('[data-id]')?.getAttribute('data-id')
    if (token) labelByToken.set(token, label)
  }

  const numbered = paths
    .map((path) => ({ path, order: Number(path.id.match(edgePattern)?.[1] ?? NaN) }))
    .filter((entry) => Number.isFinite(entry.order))
    .sort((a, b) => a.order - b.order)

  const edgeElements = new Map<string, Element[]>()
  if (numbered.length === compiled.edgeOrder.length) {
    compiled.edgeOrder.forEach((edgeIds, index) => {
      if (!edgeIds) return
      const entry = numbered[index]
      const label = labelByToken.get(`edge${entry.order}`)
      const elements = [entry.path, ...(label ? [label] : [])]
      // One statement can stand for several chart edges — the generator merges
      // parallel self loops, because mermaid draws only the last of them — so
      // every id of the statement anchors to the same drawn elements.
      for (const edgeId of edgeIds) {
        edgeElements.set(edgeId, elements)
        byAnchor.set(edgeId, elements)
      }
    })
  }

  // Mermaid's one legibility gap: labels of parallel edges between the same
  // pair of states land on top of each other. Resolved deterministically here.
  separateEdgeLabels(svg, labels)

  // ---- adjacency ---------------------------------------------------------
  const neighbours = new Map<string, Set<string>>()
  const touch = (a: string, b: string) => {
    const set = neighbours.get(a) ?? new Set()
    set.add(b)
    neighbours.set(a, set)
  }
  for (const edge of chart.edges) {
    if (edge.internal) continue
    touch(edge.source, edge.target)
    touch(edge.target, edge.source)
    touch(edge.source, edge.id)
    touch(edge.target, edge.id)
    touch(edge.id, edge.source)
    touch(edge.id, edge.target)
  }

  const dimmables: Element[][] = [...stateElements.values(), ...edgeElements.values()]
  const litSets = new Map<string, Set<Element>>()
  for (const [id, elements] of byAnchor) {
    const lit = new Set(elements)
    for (const neighbour of neighbours.get(id) ?? []) {
      for (const element of byAnchor.get(neighbour) ?? []) lit.add(element)
    }
    litSets.set(id, lit)
  }

  const dim = (id: string | null) => {
    const lit = id ? litSets.get(id) : undefined
    for (const elements of dimmables) {
      for (const element of elements) element.classList.toggle('smc-dim', Boolean(lit && !lit.has(element)))
    }
  }

  // ---- pointer wiring ----------------------------------------------------
  // Merged parallel self loops give several anchor ids the same elements; the
  // first id wired wins the pointer, so one hover reports one anchor rather
  // than a burst of them.
  const wired = new Set<Element>()
  for (const [id, elements] of byAnchor) {
    for (const element of elements) {
      if (wired.has(element)) continue
      wired.add(element)
      element.classList.add('smc-hit')
      element.addEventListener('mouseenter', () => {
        dim(id)
        callbacks.onAnchorHover?.(id)
      })
      element.addEventListener('mouseleave', () => {
        dim(null)
        callbacks.onAnchorHover?.(null)
      })
      element.addEventListener('click', () => callbacks.onAnchorSelect?.(id))
    }
  }

  return { byAnchor, states: new Set(stateElements.keys()) }
}

/**
 * Nudge overlapping edge labels apart, vertically, smallest move that clears.
 *
 * Dagre gives parallel edges between one pair of states distinct curves but
 * near-identical label anchors, so their labels collide — the single residue
 * of the layout problem the mermaid rebuild retired. This is not a layout
 * solver: labels only slide down, in overlap-sized steps, and everything else
 * stays exactly where mermaid put it. Measured in screen space (the SVG is
 * width-scaled in its pane), applied in user space through the scale factor.
 */
function separateEdgeLabels(svg: SVGSVGElement, labels: Element[]): void {
  const viewWidth = svg.viewBox.baseVal?.width
  const width = svg.getBoundingClientRect().width
  if (!viewWidth || width === 0) return
  const scale = width / viewWidth

  const entries = labels
    .filter((element) => (element.textContent ?? '').trim().length > 0)
    .map((element) => ({ element, shift: 0, base: element.getAttribute('transform') ?? '' }))

  // What a label may not sit on, beyond its peers: every state box, and a
  // region's *title bar* — its interior stays open, a label between two of a
  // region's children belongs there. The same rule the old renderer's solver
  // enforced, kept because it is about the diagram, not about the renderer.
  const obstacles = [
    ...[...svg.querySelectorAll('g.node')].map((element) => element.getBoundingClientRect()),
    ...[...svg.querySelectorAll('g.cluster .cluster-label, g.cluster-label')].map((element) =>
      element.getBoundingClientRect(),
    ),
  ]

  const push = (entry: (typeof entries)[number], dy: number) => {
    entry.shift += dy
    entry.element.setAttribute('transform', `translate(0 ${entry.shift}) ${entry.base}`.trim())
  }

  const overlap = (a: DOMRect, b: DOMRect): number => {
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    return x > 1 && y > 1 ? y : 0
  }

  for (let sweep = 0; sweep < 4; sweep++) {
    let moved = false
    const boxes = entries
      .map((entry) => ({ entry, rect: entry.element.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top)
    for (let lower = 0; lower < boxes.length; lower++) {
      for (const fixed of obstacles) {
        const y = overlap(fixed, boxes[lower].rect)
        if (y === 0) continue
        push(boxes[lower].entry, (y + 3) / scale)
        boxes[lower].rect = boxes[lower].entry.element.getBoundingClientRect()
        moved = true
      }
      for (let upper = 0; upper < lower; upper++) {
        const y = overlap(boxes[upper].rect, boxes[lower].rect)
        if (y === 0) continue
        push(boxes[lower].entry, (y + 3) / scale)
        boxes[lower].rect = boxes[lower].entry.element.getBoundingClientRect()
        moved = true
      }
    }
    if (!moved) break
  }
}

/** Rendering can only fail catastrophically; say so and still show the machine. */
function TextFallback({ summary }: { summary: ReturnType<typeof stateChartSummary> }) {
  return (
    <div className="max-h-[480px] overflow-auto px-4 py-3">
      <p className="text-[12.5px] text-warning">Diagram unavailable — the machine is listed instead.</p>
      <p className="mt-2 text-[12.5px] text-muted-foreground">{summary.headline}</p>
      <ul className="mt-2 space-y-1 font-mono text-[11.5px] text-foreground/80">
        {summary.transitions.map((transition) => (
          <li key={transition}>{transition}</li>
        ))}
      </ul>
    </div>
  )
}
