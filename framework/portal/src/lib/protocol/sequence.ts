/**
 * The workflow model, its narration, and the sequence-diagram layout — the
 * three halves of `workflows/*.yaml` that no validator is needed for.
 *
 * Split out of `./workflow`, which keeps the zod schema and `parseWorkflow`.
 * The reason is bytes, and it is the same one `lib/catalog/vocabulary` states:
 * `SequenceDiagram` is a `'use client'` component and it needs exactly
 * `layoutWorkflow` and `narrateWorkflow`, neither of which validates anything —
 * but reaching them through `./workflow` evaluated that module's zod schemas at
 * import time and pulled the whole of zod into the browser graph. Nothing in the
 * browser ever calls `parseWorkflow`: the workflow arrives already parsed, from
 * the server.
 *
 * What lives here is what the drawing is made of:
 *
 * 1. **The model** — `Workflow`, `MessageStep`, `FragmentStep` and the issue
 *    shape `parseWorkflow` reports against. It is the parser's output type, so
 *    the parser imports it from here rather than the other way round.
 * 2. **`narrateWorkflow`** — the text equivalent of the diagram, which is what a
 *    reader who cannot see the SVG actually gets.
 * 3. **`layoutWorkflow`** — geometry, numbers only, no DOM and no React. A
 *    sequence diagram is a strict grid (lifelines are columns, steps are ordered
 *    rows, fragments are nested boxes), which is exactly the shape a
 *    free-positioning graph library cannot express and a solver can. Keeping it
 *    pure is what makes the flagship visual unit-testable.
 *
 * Nothing imported from this module may import zod — `lib/client-bundle.test.ts`
 * walks the real graph and fails if it does.
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
