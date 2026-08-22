'use client'

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react'
import { ArrowDownLeft, ArrowUpRight, Scan, Unlink, Workflow } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExpandButton } from '@/components/diagrams/expand-button'
import { MeasureProbe, type MeasuredGeometry } from '@/components/diagrams/measure-probe'
import { useExpandable } from '@/lib/diagrams/use-expandable'
import { useGraphHighlight } from '@/lib/diagrams/use-graph-highlight'
import {
  DIAGRAM_BACKGROUND,
  DIAGRAM_CANVAS_VARS,
  fitCanvasHeight,
  layoutGraph,
  type PlacedNode,
} from '@/lib/diagrams/layout'
import {
  END_NODE,
  arazzoGraph,
  arazzoSummary,
  type ArazzoDescription,
  type ArazzoEdgeKind,
  type ArazzoStep,
  type ArazzoWorkflow,
} from '@/lib/protocol/arazzo'
import { cn } from '@/lib/utils'

import '@xyflow/react/dist/style.css'

/**
 * The step graph of an `arazzo.yaml` — one Arazzo workflow, drawn.
 *
 * ## Why the portal draws this itself
 *
 * Arazzo has no visualizer to defer to. The survey behind the 0.2.0 plan found
 * Redocly's visualization not started and the only renderer in existence a VS
 * Code extension, so an artifact this catalog ships would otherwise be a wall
 * of YAML — while `states.json` and `workflows/*.yaml` beside it both draw.
 *
 * ## What it is NOT
 *
 * Drawing is not validating, and this component is downstream of a reader that
 * makes no claim about Arazzo's grammar ({@link readArazzo}). Nothing here can
 * raise a diagnostic, fail a gate, or reject a document. A file it cannot make
 * a picture of still serves its bytes in the pane beside this one, which is why
 * the failure mode throughout is "draw less", never "show nothing".
 *
 * It is also not the choreography. `workflows/*.yaml` stays the authoritative
 * source and keeps its sequence diagram; an Arazzo Description is one
 * executor's path through an API surface, which is a different picture of a
 * different thing ([0020](srn://metaframework/adr/0020-arazzo-as-a-sibling-role)).
 *
 * ## The one rule that shapes the drawing
 *
 * Colour is ontology, so no element here owns a hue — a step is not a kind
 * ([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)).
 * Edge kinds are told apart by weight, dash and arrowhead exactly as the
 * relation graph tells its seven apart, and the legend shows those samples.
 * The two exceptions are the two the console already sanctions: `--primary`
 * for "this is what you are pointing at", and `--destructive` for failure —
 * status, which is what a red edge means everywhere else in this portal.
 *
 * The sharpest distinction it draws is between what the document SAYS and what
 * the reader INFERRED. `dependsOn` is a declared prerequisite and is drawn
 * solid; consecutive steps with no `dependsOn` are joined by a dashed edge,
 * because "these run in order" is read off their position rather than stated.
 * Rendering an inference identically to a declaration is how a diagram starts
 * asserting things its source never did.
 */

export interface ArazzoGraphProps {
  description: ArazzoDescription
  /**
   * Source-description name → where that source leads: the sibling artifact
   * block on this page, addressed by the source's own `url`. Only the caller
   * knows which artifacts the entity actually carries, and a name with no entry
   * renders as plain text rather than a dead link.
   *
   * A plain object rather than a lookup function, deliberately: the call site is
   * a server component, and a function cannot cross that boundary.
   */
  sourceHrefs?: Record<string, string>
  /**
   * Canvas height ceiling in pixels. Default 560 — taller than the relation
   * graph's 420 because this diagram grows in the direction it is capped in:
   * a step graph gains a layer per step, where a neighbourhood gains width.
   * It is still a ceiling, so the one-step workflows this catalog is full of
   * shrink to their content rather than sitting in an empty panel.
   */
  height?: number
  label?: string
  className?: string
}

/**
 * The edge vocabulary, and the legend's key — one table, so the legend cannot
 * drift from the canvas. Every distinction is carried by weight, dash and
 * arrowhead; `failure` additionally takes the destructive token, which is
 * status rather than ontology.
 */
const EDGE_STYLES = {
  depends: {
    label: 'dependsOn',
    gloss: 'a prerequisite the document states',
    width: 2,
    dash: undefined,
    stroke: 'var(--border-strong)',
    marker: MarkerType.ArrowClosed,
  },
  order: {
    label: 'in order',
    gloss: 'inferred from the order the steps are written in',
    width: 1.25,
    dash: '5 4',
    stroke: 'var(--border-strong)',
    marker: MarkerType.ArrowClosed,
  },
  success: {
    label: 'onSuccess',
    gloss: 'a branch taken when the criteria hold',
    width: 1.5,
    dash: '9 3 1.5 3',
    stroke: 'var(--border-strong)',
    marker: MarkerType.ArrowClosed,
  },
  failure: {
    label: 'onFailure',
    gloss: 'a branch taken when the step fails',
    width: 1.5,
    dash: '2 3',
    stroke: 'var(--destructive)',
    marker: MarkerType.ArrowClosed,
  },
} satisfies Record<
  ArazzoEdgeKind,
  { label: string; gloss: string; width: number; dash: string | undefined; stroke: string; marker: MarkerType }
>

const EDGE_ORDER = Object.keys(EDGE_STYLES) as ArazzoEdgeKind[]

/** How a step's reference is captioned. The spec's own field names, verbatim. */
const REFERENCE_LABELS: Record<ArazzoStep['reference']['kind'], string> = {
  operationId: 'operationId',
  operationPath: 'operationPath',
  channelPath: 'channelPath',
  workflow: 'workflowId',
  none: 'no reference',
}

interface StepNodeData extends Record<string, unknown> {
  step: ArazzoStep
  ordinal: number
  href?: string
  onOpenWorkflow?: (workflowId: string) => void
}

type StepFlowNode = Node<StepNodeData, 'step'>
type EndFlowNode = Node<Record<string, unknown>, 'end'>
type ArazzoFlowNode = StepFlowNode | EndFlowNode

// Inline for the same reason the relation graph gives: React Flow ships its own
// `.react-flow__handle` rules, and inline style is the only override that does
// not depend on stylesheet order.
const HANDLE_STYLE = { width: 6, height: 6, border: 'none', background: 'var(--border-strong)' } as const

const MIN_WIDTH = 208
const MAX_WIDTH = 320

function StepBox({ data }: NodeProps<StepFlowNode>) {
  const { step, ordinal, href, onOpenWorkflow } = data
  const reference = step.reference
  const Direction = step.action === 'send' ? ArrowUpRight : step.action === 'receive' ? ArrowDownLeft : null

  const referenceBody = (
    <>
      <span className="text-muted-foreground">{REFERENCE_LABELS[reference.kind]}</span>
      {reference.value !== null && <span className="truncate text-foreground/85">{shorten(reference.value)}</span>}
    </>
  )

  return (
    <>
      <Handle type="target" position={Position.Top} id="in" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} id="out" style={HANDLE_STYLE} />

      <div
        className="rounded-md border border-border bg-surface px-2.5 py-2 text-left"
        style={{ minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH }}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{ordinal}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] leading-tight text-foreground">
            {step.stepId ?? <span className="text-muted-foreground italic">unnamed step</span>}
          </span>
          {/* `action` is the executor's intent, not the operation's — a seat
              `send`s what the server `receive`s. The arrow is the executor's. */}
          {Direction && step.action && (
            <span
              className="flex shrink-0 items-center gap-0.5 rounded border border-border px-1
                         font-mono text-[9.5px] tracking-tight text-muted-foreground"
              title={`action: ${step.action}`}
            >
              <Direction className="size-2.5" aria-hidden />
              {step.action}
            </span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-1.5 font-mono text-[10.5px] leading-tight">
          {reference.kind === 'workflow' && onOpenWorkflow && reference.value !== null ? (
            <button
              type="button"
              className="nodrag focusable flex min-w-0 items-center gap-1.5 rounded text-left
                         hover:text-foreground"
              onClick={() => onOpenWorkflow(reference.value as string)}
              title={`Open workflow ${reference.value}`}
            >
              <Workflow className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />
              {referenceBody}
            </button>
          ) : href ? (
            <a
              href={href}
              className="nodrag focusable flex min-w-0 items-center gap-1.5 rounded hover:text-foreground"
              title={reference.value ?? undefined}
            >
              {referenceBody}
            </a>
          ) : (
            <span className="flex min-w-0 items-center gap-1.5" title={reference.value ?? undefined}>
              {referenceBody}
            </span>
          )}
        </div>

        {step.successCriteria.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
            {step.successCriteria.map((criterion, index) => (
              <li key={index} className="truncate font-mono text-[10px] text-muted-foreground">
                {criterion.condition}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

/**
 * Where an `end` action lands.
 *
 * Synthetic — Arazzo has no terminal object — which is why it is drawn as a
 * dashed pill rather than as a step: it is the reader's punctuation, not a line
 * of the document.
 */
function EndPill() {
  return (
    <>
      <Handle type="target" position={Position.Top} id="in" style={HANDLE_STYLE} />
      <span
        className="block rounded-full border border-dashed border-border-strong bg-surface px-3 py-1
                   font-mono text-[10.5px] tracking-wider text-muted-foreground uppercase"
      >
        end
      </span>
    </>
  )
}

const nodeTypes: NodeTypes = { step: StepBox, end: EndPill }

/** Keeps the fitted graph clear of the overlays: controls left, legend right. */
const FIT_PADDING = { top: '24px', right: '196px', bottom: '24px', left: '48px' } as const

/**
 * First-pass estimates. ELK needs sizes before anything is in the DOM, so the
 * graph is laid out on these, rendered hidden, measured, and laid out again on
 * the truth — being a few pixels out here costs nothing.
 */
const MONO_CHAR = 6.6
const BASE_HEIGHT = 52
const CRITERION_HEIGHT = 14

function estimateBox(step: ArazzoStep): { width: number; height: number } {
  const longest = Math.max(
    (step.stepId ?? 'unnamed step').length + (step.action?.length ?? 0) + 6,
    REFERENCE_LABELS[step.reference.kind].length + shorten(step.reference.value ?? '').length + 2,
    ...step.successCriteria.map((criterion) => criterion.condition.length),
  )
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, longest * MONO_CHAR + 28))
  const criteria = step.successCriteria.length
  return { width, height: BASE_HEIGHT + (criteria > 0 ? criteria * CRITERION_HEIGHT + 9 : 0) }
}

/** A JSON-Pointer channelPath is mostly boilerplate; the tail is the content. */
function shorten(reference: string): string {
  const pointer = reference.indexOf('#/')
  return pointer === -1 ? reference : reference.slice(pointer + 2).replace(/^channels\//, '')
}

interface GraphLayout {
  placed: Map<string, PlacedNode>
  contentHeight: number
  /** 1 = laid out on estimates, 2 = laid out on what the browser drew. */
  pass: 1 | 2
}

export function ArazzoGraph({
  description,
  sourceHrefs,
  height = 560,
  label = 'Arazzo step graph',
  className,
}: ArazzoGraphProps) {
  const workflows = description.workflows
  const [selected, setSelected] = useState(0)
  const workflow: ArazzoWorkflow | undefined = workflows[Math.min(selected, workflows.length - 1)]

  const openWorkflow = useCallback(
    (workflowId: string) => {
      const index = workflows.findIndex((candidate) => candidate.workflowId === workflowId)
      if (index >= 0) setSelected(index)
    },
    [workflows],
  )

  if (workflow === undefined) {
    return (
      <p className={cn('panel px-4 py-6 text-[13px] text-muted-foreground', className)}>
        This Arazzo description declares no workflows.
      </p>
    )
  }

  return (
    <WorkflowCanvas
      // Remounting per workflow is deliberate: every piece of layout state below
      // belongs to one graph, and switching workflows is a different graph
      // rather than a change to this one.
      key={workflow.workflowId ?? workflow.index}
      workflow={workflow}
      workflows={workflows}
      selected={selected}
      onSelect={setSelected}
      onOpenWorkflow={openWorkflow}
      sourceHrefs={sourceHrefs}
      height={height}
      label={label}
      className={className}
    />
  )
}

function WorkflowCanvas({
  workflow,
  workflows,
  selected,
  onSelect,
  onOpenWorkflow,
  sourceHrefs,
  height,
  label,
  className,
}: {
  workflow: ArazzoWorkflow
  workflows: ArazzoWorkflow[]
  selected: number
  onSelect: (index: number) => void
  onOpenWorkflow: (workflowId: string) => void
  sourceHrefs?: Record<string, string>
  height: number
  label: string
  className?: string
}) {
  const graph = useMemo(() => arazzoGraph(workflow), [workflow])
  const summary = useMemo(() => arazzoSummary(workflow), [workflow])
  const { expanded, toggle: toggleExpanded } = useExpandable()

  const [built, setBuilt] = useState<{ key: string; layout: GraphLayout } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [hiddenKinds, setHiddenKinds] = useState<ReadonlySet<ArazzoEdgeKind>>(() => new Set())

  // Keyed off the graph's CONTENT, so a parent rebuilding props does not relayout.
  const layoutKey = useMemo(
    () =>
      JSON.stringify([
        graph.nodes.map((node) => [node.id, node.kind, node.step ? estimateBox(node.step) : null]),
        graph.edges.map((edge) => [edge.id, edge.source, edge.target, edge.kind, edge.label ?? null]),
      ]),
    [graph],
  )

  const [measured, setMeasured] = useState<{ key: string; geometry: MeasuredGeometry } | null>(null)
  const reported = useRef<string | null>(null)
  const onMeasure = useCallback(
    (geometry: MeasuredGeometry) => {
      // The probe has no memory by design, so the guard lives here: one
      // measurement per layout, or the second pass would re-measure itself.
      if (reported.current === layoutKey) return
      reported.current = layoutKey
      setMeasured({ key: layoutKey, geometry })
    },
    [layoutKey],
  )

  // Read directly rather than through a ref, unlike the relation graph. That
  // one keeps its inputs in a ref because callers build its `nodes`/`edges`
  // arrays inline, so a fresh identity arrives on every render; here `graph` is
  // memoised on one `workflow` object out of a description the server parsed
  // once, and the canvas is remounted per workflow anyway — so the identity is
  // already stable and the indirection would only hide that.
  useEffect(() => {
    const current = graph
    if (current.nodes.length === 0) return
    let cancelled = false
    const geometry = measured?.key === layoutKey ? measured.geometry : null

    layoutGraph({
      nodes: current.nodes.map((node) => ({
        id: node.id,
        ...(geometry?.nodes.get(node.id) ?? (node.step ? estimateBox(node.step) : { width: 74, height: 26 })),
      })),
      edges: current.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        // Reserve the space the criterion label will occupy between layers;
        // without it a `$statusCode == 409` sits on the box below it.
        ...(edge.label ? { label: { width: Math.min(edge.label.length * 6, 190), height: 16 } } : {}),
      })),
      // A workflow is a sequence, so it reads downward — the same direction the
      // state chart flows, and for the same reason: time.
      direction: 'DOWN',
      // The one knob this diagram turns, and it is turned for a measured reason
      // rather than to have a style of its own. `DIAGRAM_SPACING.betweenLayers`
      // is 120px, tuned for boxes that vary in height and for graphs that fan
      // out; a step graph is neither. Its nodes are a uniform ~50px and most of
      // its edges are a single-parent chain, so 120px of clearance separates
      // nothing that was in danger of touching — it just makes the drawing tall.
      // Measured on `brass/protocol/game-transport`, the deepest workflow in
      // this catalog: seven steps came to 932px, which the canvas then fitted at
      // scale 0.46 and rendered 12px labels at five and a half pixels. Halving
      // the layer pitch is what buys those labels back.
      options: { 'elk.layered.spacing.nodeNodeBetweenLayers': '58' },
    }).then(
      (result) => {
        if (cancelled) return
        const top = result.nodes.length > 0 ? Math.min(...result.nodes.map((node) => node.y)) : 0
        const bottom = result.nodes.length > 0 ? Math.max(...result.nodes.map((node) => node.y + node.height)) : 0
        setBuilt({
          key: layoutKey,
          layout: {
            placed: new Map(result.nodes.map((node) => [node.id, node])),
            contentHeight: bottom - top,
            pass: geometry ? 2 : 1,
          },
        })
      },
      () => {
        // A failed second pass is not worth throwing the first one away for.
        if (!cancelled && !geometry) setFailure(layoutKey)
      },
    )

    return () => {
      cancelled = true
    }
  }, [graph, layoutKey, measured])

  const layout = built?.key === layoutKey ? built.layout : null
  const failed = failure === layoutKey

  // Nothing is shown until the measured pass lands, so the reader never sees the
  // estimate correct itself; the timer is the escape hatch.
  const [timedOutFor, setTimedOutFor] = useState<string | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setTimedOutFor(layoutKey), 900)
    return () => clearTimeout(timer)
  }, [layoutKey])
  const settled = layout !== null && (layout.pass === 2 || timedOutFor === layoutKey)

  const flowNodes = useMemo<ArazzoFlowNode[]>(() => {
    if (!layout) return []
    const sizes = measured?.key === layoutKey ? measured.geometry.nodes : null
    return graph.nodes.map((node) => {
      const box = layout.placed.get(node.id)
      const size = sizes?.get(node.id)
      const source = node.step?.reference.source
      return {
        id: node.id,
        type: node.kind,
        position: { x: box?.x ?? 0, y: box?.y ?? 0 },
        // Stated only once the probe has reported — the rule `relation-graph.tsx`
        // documents at length: handing React Flow the estimate would make the
        // probe read that estimate back out of the store, and the second pass
        // would lay out on the guess it exists to replace.
        ...(size ? { measured: size } : {}),
        data: node.step
          ? {
              step: node.step,
              ordinal: node.ordinal,
              ...(source && sourceHrefs?.[source] ? { href: sourceHrefs[source] } : {}),
              onOpenWorkflow,
            }
          : {},
      } as ArazzoFlowNode
    })
  }, [graph, layout, measured, layoutKey, sourceHrefs, onOpenWorkflow])

  const flowEdges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => {
        const style = EDGE_STYLES[edge.kind]
        const caption = [edge.name, edge.label].filter(Boolean).join(' — ')
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: 'out',
          targetHandle: 'in',
          hidden: hiddenKinds.has(edge.kind),
          // A self-loop (a `retry` naming no step) needs a curve, not a straight
          // line back into the box it left.
          type: edge.source === edge.target ? 'smoothstep' : 'default',
          style: {
            stroke: style.stroke,
            strokeWidth: style.width,
            strokeDasharray: style.dash,
            // The viewport is a CSS transform, so without this a 1.25px edge is
            // drawn at 0.7px on a tall workflow and the dash periods shrink with
            // it — the reason the relation graph's vocabulary is legible at all.
            vectorEffect: 'non-scaling-stroke',
          },
          markerEnd: { type: style.marker, width: 13, height: 13, color: style.stroke },
          ...(caption
            ? {
                label: caption,
                labelStyle: {
                  fill: edge.kind === 'failure' ? 'var(--destructive)' : 'var(--muted-foreground)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                },
                labelShowBg: true,
                labelBgStyle: { fill: 'var(--surface)' },
                labelBgPadding: [4, 2] as [number, number],
                labelBgBorderRadius: 3,
              }
            : {}),
          ariaLabel: `${edge.source} ${style.label} ${edge.target === END_NODE ? 'end of workflow' : edge.target}`,
        }
      }),
    [graph, hiddenKinds],
  )

  const counts = useMemo(() => {
    const map = new Map<ArazzoEdgeKind, number>()
    for (const edge of graph.edges) map.set(edge.kind, (map.get(edge.kind) ?? 0) + 1)
    return map
  }, [graph])

  const canvasHeight = useMemo(() => fitCanvasHeight(layout?.contentHeight ?? null, height), [layout, height])

  const highlight = useGraphHighlight(flowNodes, flowEdges)
  const { decorate } = highlight
  const litNodes = useMemo(() => flowNodes.map(decorate), [flowNodes, decorate])
  const litEdges = useMemo(() => flowEdges.map(decorate), [flowEdges, decorate])

  return (
    <figure
      data-expanded={expanded || undefined}
      className={cn(
        'panel diagram-surface overflow-hidden',
        expanded && 'fixed inset-0 z-50 flex flex-col rounded-none border-0 bg-background',
        className,
      )}
      aria-label={label}
    >
      <WorkflowTabs workflows={workflows} selected={selected} onSelect={onSelect} />

      <div
        className={cn('relative', expanded && 'min-h-0 flex-1')}
        style={{ height: expanded ? undefined : canvasHeight, ...DIAGRAM_CANVAS_VARS }}
      >
        {failed ? (
          <TextFallback lines={summary} />
        ) : (
          <>
            {layout !== null && (
              // Hidden rather than unmounted: the first pass has to be in the DOM
              // to be measurable, and `visibility` keeps layout running where
              // `display: none` would report every node as zero.
              <div className="absolute inset-0" style={{ visibility: settled ? undefined : 'hidden' }}>
                <ReactFlow
                  nodes={litNodes}
                  edges={litEdges}
                  {...highlight.handlers}
                  nodeTypes={nodeTypes}
                  colorMode="dark"
                  fitView
                  fitViewOptions={{ padding: FIT_PADDING, maxZoom: 1 }}
                  minZoom={0.2}
                  maxZoom={2}
                  nodesConnectable={false}
                  // The box carries its own link or button, so the wrapper must
                  // not be a second tab stop for the same target.
                  nodesFocusable={false}
                  edgesFocusable={false}
                  elementsSelectable={false}
                  zoomOnDoubleClick={false}
                  // The graph sits inside a scrolling document: hijacking the
                  // wheel would trap the page.
                  zoomOnScroll={false}
                  panOnScroll={false}
                  preventScrolling={false}
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={DIAGRAM_BACKGROUND.gap}
                    size={DIAGRAM_BACKGROUND.size}
                    color={DIAGRAM_BACKGROUND.color}
                  />
                  <Controls showInteractive={false} style={{ margin: 10 }} />
                  <MeasureProbe onMeasure={onMeasure} />
                  <Panel position="top-right" style={{ margin: 10 }}>
                    <GraphToolbar
                      counts={counts}
                      hiddenKinds={hiddenKinds}
                      onToggle={(kind) =>
                        setHiddenKinds((current) => {
                          const next = new Set(current)
                          if (next.has(kind)) next.delete(kind)
                          else next.add(kind)
                          return next
                        })
                      }
                      expanded={expanded}
                      onToggleExpanded={toggleExpanded}
                      refitOn={`${layout.pass}`}
                    />
                  </Panel>
                </ReactFlow>
              </div>
            )}
            {!settled && <LayoutPending />}
          </>
        )}
      </div>

      <GraphNotes workflow={workflow} graph={graph} onOpenWorkflow={onOpenWorkflow} />

      <figcaption className="sr-only">
        <p>{`${label}: ${workflow.workflowId ?? 'unnamed workflow'}, ${workflow.steps.length} steps.`}</p>
        <ul>
          {summary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}

/**
 * One tab per workflow. An Arazzo Description holds N of them, and the address
 * `.arazzo` reaches the file rather than any one workflow — so the file is the
 * unit and the workflow is a selection inside it.
 *
 * Suppressed at one workflow: a tab strip with a single tab is chrome that
 * answers no question.
 */
function WorkflowTabs({
  workflows,
  selected,
  onSelect,
}: {
  workflows: ArazzoWorkflow[]
  selected: number
  onSelect: (index: number) => void
}) {
  if (workflows.length <= 1) return null
  return (
    <div className="flex flex-wrap gap-1 border-b border-border px-2 py-1.5" role="tablist" aria-label="Workflows">
      {workflows.map((workflow, index) => (
        <button
          key={workflow.workflowId ?? index}
          type="button"
          role="tab"
          aria-selected={index === selected}
          onClick={() => onSelect(index)}
          title={workflow.summary ?? undefined}
          className={cn(
            'focusable rounded px-2 py-0.5 font-mono text-[11px] transition-colors',
            index === selected
              ? 'bg-surface-raised text-foreground'
              : 'text-muted-foreground hover:bg-surface-raised hover:text-foreground',
          )}
        >
          {workflow.workflowId ?? `workflow ${index + 1}`}
        </button>
      ))}
    </div>
  )
}

function GraphToolbar({
  counts,
  hiddenKinds,
  onToggle,
  expanded,
  onToggleExpanded,
  refitOn,
}: {
  counts: Map<ArazzoEdgeKind, number>
  hiddenKinds: ReadonlySet<ArazzoEdgeKind>
  onToggle: (kind: ArazzoEdgeKind) => void
  expanded: boolean
  onToggleExpanded: () => void
  /** Changes whenever the graph is re-laid-out under the viewport. */
  refitOn: string
}) {
  const { fitView } = useReactFlow()
  const present = EDGE_ORDER.filter((kind) => counts.has(kind))

  const duration = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320

  /**
   * The canvas's own size, as one string.
   *
   * The relation graph refits on its layout pass alone, and that is enough for
   * it: it sits in a panel that is on the page from the first paint. This
   * canvas is not. It lives inside a collapsible artifact block, so it mounts
   * when a reader opens the block, and it mounts into a pane whose height
   * `fitCanvasHeight` is still deciding — 220px until the first ELK pass lands,
   * then whatever the graph needs. A fit computed against the placeholder frames
   * the wrong box and is never revisited, because the layout pass it keys on has
   * already happened.
   *
   * So the container's measured size joins the trigger, which also buys the
   * expand toggle and a window resize for free. Deliberately NOT joined by
   * `nodesInitialized`, tempting as it looks: that flag is computed from the
   * caller's node objects, and a diagram that owns its own layout never feeds a
   * measurement back there — the same trap `measure-probe.tsx` documents at
   * length, which is why the probe reads `nodeLookup` instead. It reads false
   * here forever, so keying on it would pin the fit to a constant.
   */
  const canvasSize = useStore((state) => `${Math.round(state.width)}x${Math.round(state.height)}`)

  useEffect(() => {
    // Instant, not animated: this runs while the canvas is still hidden, on the
    // measured pass. An animation here would be motion nobody asked for.
    const frame = requestAnimationFrame(() => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: 0 }))
    return () => cancelAnimationFrame(frame)
  }, [refitOn, canvasSize, fitView])

  return (
    <div className="w-[176px] rounded-md border border-border bg-surface/90 p-1.5 backdrop-blur-sm">
      <div className="flex items-center gap-1 px-0.5 pb-1.5">
        <span className="flex-1 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Steps</span>
        <button
          type="button"
          onClick={() => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: duration() })}
          className="focusable rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          aria-label="Fit the whole graph in view"
          title="Fit graph"
        >
          <Scan className="size-3" aria-hidden />
        </button>
        <ExpandButton
          expanded={expanded}
          onToggle={() => {
            onToggleExpanded()
            // The canvas changes size, so the old viewport no longer frames the
            // graph; re-fit once the new box has been laid out.
            requestAnimationFrame(() => void fitView({ padding: FIT_PADDING, maxZoom: 1, duration: duration() }))
          }}
          className="p-1 hover:bg-surface-raised"
        />
      </div>

      <ul className="space-y-px">
        {present.map((kind) => {
          const style = EDGE_STYLES[kind]
          const on = !hiddenKinds.has(kind)
          return (
            <li key={kind}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(kind)}
                title={style.gloss}
                className={cn(
                  'focusable flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-raised',
                  !on && 'opacity-40',
                )}
              >
                {/* The swatch carries every channel the canvas uses, arrowhead
                    included — the relation graph's rule, for its reason: the
                    legend is where a reader goes to tell two edges apart. */}
                <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden className="shrink-0">
                  <line
                    x1="0"
                    y1="4"
                    x2="18"
                    y2="4"
                    stroke={style.stroke}
                    strokeWidth={style.width}
                    strokeDasharray={style.dash}
                  />
                  <path d="M18 1 L25 4 L18 7 Z" fill={style.stroke} />
                </svg>
                <span className="flex-1 truncate font-mono text-[10.5px] text-foreground/80">{style.label}</span>
                <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{counts.get(kind)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * What the drawing does not carry, said under the drawing.
 *
 * Three separate admissions, and all three are derived from the document rather
 * than written down, so none of them can fall behind what the canvas draws:
 *
 * - **crossings** — a `workflowId` target is a jump into another graph, so it
 *   cannot be an edge of this one. It becomes a button that goes there.
 * - **dangling** — a `dependsOn` or `goto` naming a step that is not in this
 *   workflow. The canvas cannot draw an edge to a node that does not exist, and
 *   silently dropping it would hide the one defect a reader most needs.
 * - **omitted** — step fields present in the file and absent from the picture.
 *   Naming them is what keeps the drawing from being mistaken for the document.
 */
function GraphNotes({
  workflow,
  graph,
  onOpenWorkflow,
}: {
  workflow: ArazzoWorkflow
  graph: ReturnType<typeof arazzoGraph>
  onOpenWorkflow: (workflowId: string) => void
}) {
  const crossings = [...new Map(graph.crossings.map((crossing) => [crossing.workflowId, crossing])).values()]
  if (crossings.length === 0 && graph.dangling.length === 0 && workflow.omitted.length === 0) return null

  return (
    <div className="space-y-1.5 border-t border-border px-3 py-2">
      {crossings.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">continues into</span>
          {crossings.map((crossing) => (
            <button
              key={crossing.workflowId}
              type="button"
              onClick={() => onOpenWorkflow(crossing.workflowId)}
              className="focusable flex items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5
                         font-mono text-[11px] text-foreground/80 transition hover:border-border-strong hover:text-foreground"
            >
              <Workflow className="size-3" aria-hidden />
              {crossing.workflowId}
            </button>
          ))}
        </div>
      )}

      {graph.dangling.length > 0 && (
        <ul className="space-y-0.5">
          {graph.dangling.map((miss, index) => (
            <li key={index} className="flex items-center gap-1.5 font-mono text-[11px] text-warning">
              <Unlink className="size-3 shrink-0" aria-hidden />
              {miss.from} references {miss.ref}, which is not a step of this workflow
            </li>
          ))}
        </ul>
      )}

      {workflow.omitted.length > 0 && (
        <p className="text-[11.5px] text-muted-foreground">
          Not drawn, and in the file beside this:{' '}
          <span className="font-mono text-[11px]">{workflow.omitted.join(', ')}</span>.
        </p>
      )}
    </div>
  )
}

function LayoutPending() {
  return (
    <div className="absolute inset-0 grid place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="flex flex-col items-center gap-2" aria-hidden>
          <span className="h-6 w-24 animate-pulse rounded-sm bg-muted" />
          <span className="h-4 w-px bg-border-strong" />
          <span className="h-6 w-24 animate-pulse rounded-sm bg-muted" style={{ animationDelay: '120ms' }} />
        </div>
        <p className="font-mono text-[11px] tracking-tight text-muted-foreground">Laying out the steps…</p>
      </div>
    </div>
  )
}

/** Layout can only fail catastrophically (ELK failed to load); say so, still show the steps. */
function TextFallback({ lines }: { lines: string[] }) {
  return (
    <div className="h-full overflow-auto px-4 py-3">
      <p className="text-[12.5px] text-warning">Diagram layout unavailable — the steps are listed instead.</p>
      <ul className="mt-2 space-y-1 font-mono text-[11.5px] text-foreground/80">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}
