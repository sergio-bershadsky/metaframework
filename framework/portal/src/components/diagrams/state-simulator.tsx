'use client'

import { Check, Copy, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Actor, AnyStateMachine, InspectionEvent } from 'xstate'
import type { MachineConfig, StateNodeConfig, TransitionConfig } from '@/lib/protocol/states'
import type { StateChart, StateChartEdge, StateChartNode } from '@/lib/protocol/state-chart-model'
import { cn } from '@/lib/utils'

/**
 * Walk a protocol's `states.json` as a real XState machine, in the browser.
 *
 * **Nothing leaves the browser.** No Stately package is involved, no inspector
 * transport is opened, no request is made: the machine is built from the chart
 * already on the page and run in this tab. That is the whole reason the widget
 * exists rather than an "Open in Stately" button — a private catalog cannot
 * publish its architecture to a third party to get a picture back.
 *
 * `xstate` is reached by a **dynamic import inside the mount effect**, never a
 * top-level one. It is 31.6 kB gz over its real transitive chunk set, and this
 * component is only mounted once a reader clicks Simulate, so a protocol page
 * that nobody simulates pays nothing — the same discipline `navigable.tsx`
 * applies to React Flow, for the same measured reason.
 *
 * Three properties of XState v5 shape the design, all verified against the
 * shipped bundle rather than assumed:
 *
 * - **An unimplemented guard throws**, and it throws *asynchronously* — past
 *   any `try`/`catch` around `send` — taking the page with it. Every guard name
 *   in the file therefore gets a stub. Coverage is exact because the config and
 *   the guard list are built from the same chart.
 * - **An unimplemented action no-ops** and still reports through `inspect` as
 *   `@xstate.action`, which is how the run log is populated without providing
 *   a single action implementation.
 * - **`snapshot.can()` conflates two answers** — "this state does not accept
 *   that event" and "it does, but a guard said no". They are different facts
 *   for a reviewer, so the model answers the first (`offerEvents`) and `can()`
 *   only decides between the second pair.
 *
 * Guards are **prose** in `states.json` (`"batch balances to zero"`), so the
 * toggles below are not evidence about the system — they are the branch the
 * reviewer chose to look at. The panel says so, in those words.
 */

/* ------------------------------------------------------------------ model */

/** XState's `StateValue` shape, restated so the model is testable without it. */
export type SimulatedStateValue = string | { [key: string]: SimulatedStateValue }

export type EventStatus = 'available' | 'guarded' | 'unaccepted'

export interface EventOffer {
  event: string
  status: EventStatus
  /** For `guarded`: the guards standing between the event and a transition. */
  guards: string[]
}

/**
 * Rebuild the `createMachine` config from the flat chart model.
 *
 * The component is handed a `StateChart`, not the bytes it was parsed from, and
 * the flat model is lossless over the pinned subset — every key `machineSchema`
 * admits survives into a node or an edge — so the config can be reconstructed
 * rather than threaded through another prop. Reconstruction also buys the
 * property the whole widget rests on: the machine that runs and the graph that
 * is drawn are the *same* graph, so "declared here" and `snapshot.can()` can
 * never disagree about which transitions exist.
 *
 * Target expressions are re-derived, not remembered: a sibling is written as
 * its bare key, anything else as `#machine.dot.path`. Both round-trip through
 * `parseStates` to the identical chart, which is what the tests assert.
 */
export function toMachineConfig(chart: StateChart): MachineConfig {
  const byId = new Map(chart.nodes.map((node) => [node.id, node]))
  const childrenOf = new Map<string | null, StateChartNode[]>()
  for (const node of chart.nodes) {
    const siblings = childrenOf.get(node.parent) ?? []
    siblings.push(node)
    childrenOf.set(node.parent, siblings)
  }

  const edgesBySource = new Map<string, StateChartEdge[]>()
  for (const edge of chart.edges) {
    const outgoing = edgesBySource.get(edge.source) ?? []
    outgoing.push(edge)
    edgesBySource.set(edge.source, outgoing)
  }

  const target = (edge: StateChartEdge): string => {
    const source = byId.get(edge.source)
    const destination = byId.get(edge.target)
    if (source && destination && source.parent === destination.parent) return destination.key
    return `#${chart.id}.${edge.target}`
  }

  const branch = (edge: StateChartEdge): TransitionConfig => {
    const config: TransitionConfig = {}
    if (!edge.internal) config.target = target(edge)
    if (edge.guard !== null) config.guard = edge.guard
    if (edge.actions.length > 0) config.actions = [...edge.actions]
    if (edge.description !== null) config.description = edge.description
    return config
  }

  const transitions = (node: StateChartNode): StateNodeConfig['on'] => {
    const grouped = new Map<string, StateChartEdge[]>()
    for (const edge of edgesBySource.get(node.id) ?? []) {
      const branches = grouped.get(edge.event) ?? []
      branches.push(edge)
      grouped.set(edge.event, branches)
    }
    if (grouped.size === 0) return undefined

    const on: NonNullable<StateNodeConfig['on']> = {}
    for (const [event, edges] of grouped) {
      const branches = edges.map(branch)
      if (branches.length > 1) {
        on[event] = branches
        continue
      }
      // A bare target string is the form the catalog authors reach for, so an
      // unconditional single transition is written back the way it was written.
      const only = branches[0]
      on[event] = only.target !== undefined && Object.keys(only).length === 1 ? only.target : only
    }
    return on
  }

  // Key order is chosen for the reader of the copied snippet, not for the
  // parser: it is the order the catalog's own files use.
  const stateConfig = (node: StateChartNode): StateNodeConfig => {
    const config: StateNodeConfig = {}
    if (node.description !== null) config.description = node.description
    if (node.final) config.type = 'final'
    if (node.tags.length > 0) config.tags = [...node.tags]

    const children = childrenOf.get(node.id) ?? []
    if (children.length > 0) {
      // A compound state with no child marked initial is already a reported
      // error (`E_PROTO_STATES_SUBSET`), but the chart still renders, so the
      // simulator falls back to the first child rather than handing
      // `createMachine` a config it will throw on.
      config.initial = (children.find((child) => child.initial) ?? children[0]).key
    }
    if (node.entry.length > 0) config.entry = [...node.entry]
    if (node.exit.length > 0) config.exit = [...node.exit]

    const on = transitions(node)
    if (on) config.on = on
    if (children.length > 0) config.states = states(node.id)
    return config
  }

  function states(parent: string | null): Record<string, StateNodeConfig> {
    const out: Record<string, StateNodeConfig> = {}
    for (const node of childrenOf.get(parent) ?? []) out[node.key] = stateConfig(node)
    return out
  }

  const roots = childrenOf.get(null) ?? []
  const initial = (chart.initial ? byId.get(chart.initial)?.key : undefined) ?? roots[0]?.key ?? ''

  return {
    id: chart.id,
    initial,
    ...(chart.description !== null ? { description: chart.description } : {}),
    states: states(null),
  }
}

/** Guard names in the order the machine declares them; each needs a stub. */
export function guardNames(chart: StateChart): string[] {
  const names = chart.edges.map((edge) => edge.guard).filter((guard): guard is string => guard !== null)
  return [...new Set(names)]
}

/** Every event the machine mentions, in declaration order. */
export function eventNames(chart: StateChart): string[] {
  return [...new Set(chart.edges.map((edge) => edge.event))]
}

/**
 * The full active configuration as chart node ids — leaf *and* ancestors.
 *
 * XState reports a nested value (`{ posting: 'entry-pending' }`), so the
 * nesting already is the ancestor chain; `withAncestors` re-derives it anyway
 * so a flat dot path answers the same. Lighting only the leaf looks broken on
 * the catalog's nested machines: the region containing it stays unlit while the
 * machine is plainly inside it.
 */
export function activeStateIds(value: SimulatedStateValue): string[] {
  const leaves: string[] = []
  const walk = (node: SimulatedStateValue, prefix: string) => {
    if (typeof node === 'string') {
      leaves.push(prefix ? `${prefix}.${node}` : node)
      return
    }
    for (const [key, child] of Object.entries(node)) {
      const id = prefix ? `${prefix}.${key}` : key
      leaves.push(id)
      walk(child, id)
    }
  }
  walk(value, '')
  return withAncestors(leaves)
}

/** Every dot-path prefix of every id — the ancestor walk `states.ts` does. */
export function withAncestors(ids: readonly string[]): string[] {
  const out = new Set<string>()
  for (const id of ids) {
    let path = id
    while (path.length > 0) {
      out.add(path)
      const cut = path.lastIndexOf('.')
      path = cut === -1 ? '' : path.slice(0, cut)
    }
  }
  return [...out]
}

/** The deepest ids in an active configuration — what "now in" names. */
export function activeLeaves(ids: readonly string[]): string[] {
  return ids.filter((id) => !ids.some((other) => other !== id && other.startsWith(`${id}.`)))
}

/**
 * Why each event is or is not sendable, with the two "no"s kept apart.
 *
 * `can` answers "would this move the machine". The chart answers "does any
 * active state declare this event at all" — and it is the chart's answer that
 * separates *the machine does not listen for this here* from *it does, and a
 * guard you turned off is what stopped it*. Reporting both as one greyed-out
 * button would tell a reviewer their own toggle was a property of the system.
 */
export function offerEvents(
  chart: StateChart,
  activeIds: readonly string[],
  can: (event: string) => boolean,
): EventOffer[] {
  const active = new Set(activeIds)
  return eventNames(chart).map((event) => {
    if (can(event)) return { event, status: 'available', guards: [] }
    const declared = chart.edges.filter((edge) => edge.event === event && active.has(edge.source))
    if (declared.length === 0) return { event, status: 'unaccepted', guards: [] }
    const guards = [...new Set(declared.map((edge) => edge.guard).filter((guard): guard is string => guard !== null))]
    return { event, status: 'guarded', guards }
  })
}

/**
 * The machine as a paste-ready `createMachine()` call.
 *
 * This is what an "Open in Stately" button would have been for, minus the
 * network and minus a baked-in destination: the snippet serves Stately Studio,
 * an editor, or a test file equally. The guard stubs are not decoration — a
 * pasted machine throws on the first guarded event without them, and prose
 * guards cannot be implemented by guessing, so the stubs are the honest
 * placeholder and say so.
 */
export function machineSource(chart: StateChart): string {
  const config = toMachineConfig(chart)
  const guards = guardNames(chart)
  const body = JSON.stringify(config, null, 2)
  const lines = ["import { createMachine } from 'xstate'", '']

  if (guards.length === 0) return `${lines.join('\n')}\nexport const ${identifier(chart.id)} = createMachine(${body})\n`

  const stubs = guards.map((guard) => `    ${JSON.stringify(guard)}: () => true,`).join('\n')
  return [
    ...lines,
    '// Guards are prose in states.json. These stubs stand in for the real',
    '// predicates — an unimplemented guard throws the first time its event',
    '// is sent, so every one of them has to be answered before this runs.',
    `export const ${identifier(chart.id)} = createMachine(${body}).provide({`,
    '  guards: {',
    stubs,
    '  },',
    '})',
    '',
  ].join('\n')
}

/** `order-placement` → `orderPlacementMachine`. */
function identifier(id: string): string {
  const camel = id.replace(/[^a-zA-Z0-9]+(.)?/g, (_, next: string | undefined) => (next ?? '').toUpperCase())
  return /^[A-Za-z_$]/.test(camel) ? `${camel}Machine` : `_${camel}Machine`
}

/** A state path as the summary and the diagram both spell it. */
export function statePath(id: string): string {
  return id.split('.').join(' › ')
}

/* -------------------------------------------------------------- component */

export interface StateSimulatorProps {
  chart: StateChart
  /** The active configuration, leaf and ancestors, for the diagram to light. */
  onStatesChange: (ids: readonly string[]) => void
  /**
   * How much of the chart the drawing can actually highlight. The panel says so
   * out loud when the count is short: a simulation that silently lights nothing
   * is worse than one that admits the drawing is not following along.
   */
  highlight: { mapped: number; total: number }
  onClose: () => void
  className?: string
}

interface RunState {
  /** Active configuration as chart node ids, leaf and ancestors. */
  active: string[]
  /** The machine reached a top-level final state; only Reset moves now. */
  done: boolean
  /** Events `snapshot.can()` accepts at this instant, under the toggles. */
  enabled: string[]
}

interface RunEntry {
  /** The event sent, or null for the actor's own start-up step. */
  event: string | null
  to: string
  actions: string[]
}

/** Every guard holds until the reviewer says otherwise. */
const NO_GUARDS: ReadonlySet<string> = new Set()

export function StateSimulator({ chart, onStatesChange, highlight, onClose, className }: StateSimulatorProps) {
  const config = useMemo(() => toMachineConfig(chart), [chart])
  const guards = useMemo(() => guardNames(chart), [chart])
  const events = useMemo(() => eventNames(chart), [chart])

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [run, setRun] = useState<RunState | null>(null)
  const [log, setLog] = useState<RunEntry[]>([])
  const [generation, setGeneration] = useState(0)

  // The toggles live in a ref because the guard stubs close over them: flipping
  // one has to change the *next* evaluation without rebuilding the machine and
  // throwing away the run so far. `failing` is the same set, for rendering.
  const failingRef = useRef<ReadonlySet<string>>(NO_GUARDS)
  const [failing, setFailing] = useState<ReadonlySet<string>>(NO_GUARDS)

  const actorRef = useRef<Actor<AnyStateMachine> | null>(null)
  /** Actions reported by `inspect` since the last send, in fire order. */
  const fired = useRef<string[]>([])

  const readRun = useCallback(
    (actor: Actor<AnyStateMachine>): RunState => {
      const snapshot = actor.getSnapshot()
      return {
        active: activeStateIds(snapshot.value as SimulatedStateValue),
        done: snapshot.status !== 'active',
        enabled: events.filter((event) => snapshot.can({ type: event })),
      }
    },
    [events],
  )

  useEffect(() => {
    let cancelled = false
    let actor: Actor<AnyStateMachine> | null = null
    // The restart key: bumping it tears this actor down and builds a fresh one
    // from the same config, which is what Reset means. `restart` is what puts
    // the panel back into its loading state — an effect body may not.
    void generation

    // The second lazy import. Only a reader who clicked Simulate pays for it.
    import('xstate')
      .then(({ createActor, createMachine }) => {
        if (cancelled) return
        fired.current = []
        const machine = createMachine(config).provide({
          guards: Object.fromEntries(guards.map((guard) => [guard, () => !failingRef.current.has(guard)])),
        })
        actor = createActor(machine, {
          inspect: (event: InspectionEvent) => {
            if (event.type === '@xstate.action') fired.current.push(event.action.type)
          },
        })
        actor.subscribe({
          error: (cause: unknown) => {
            if (cancelled) return
            setError(messageOf(cause))
            setStatus('failed')
          },
        })
        actor.start()
        actorRef.current = actor

        const started = readRun(actor)
        setRun(started)
        setLog([{ event: null, to: leafLabel(started.active), actions: fired.current }])
        setStatus('ready')
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(messageOf(cause))
        setStatus('failed')
      })

    return () => {
      cancelled = true
      actorRef.current = null
      actor?.stop()
    }
  }, [config, guards, readRun, generation])

  useEffect(() => {
    onStatesChange(run?.active ?? [])
  }, [run, onStatesChange])

  const restart = useCallback(() => {
    setStatus('loading')
    setError(null)
    setGeneration((count) => count + 1)
  }, [])

  const send = useCallback(
    (event: string) => {
      const actor = actorRef.current
      if (!actor) return
      fired.current = []
      try {
        actor.send({ type: event })
      } catch (cause) {
        setError(messageOf(cause))
        setStatus('failed')
        return
      }
      const next = readRun(actor)
      setRun(next)
      setLog((entries) => [...entries, { event, to: leafLabel(next.active), actions: fired.current }])
    },
    [readRun],
  )

  const toggleGuard = useCallback(
    (guard: string) => {
      const next = new Set(failingRef.current)
      if (next.has(guard)) next.delete(guard)
      else next.add(guard)
      // The ref first: `readRun` re-evaluates every guard through it, and state
      // set in the same tick would not be visible to that call.
      failingRef.current = next
      setFailing(next)
      const actor = actorRef.current
      if (actor) setRun(readRun(actor))
    },
    [readRun],
  )

  const offers = useMemo(
    () => (run ? offerEvents(chart, run.active, (event) => run.enabled.includes(event)) : []),
    [chart, run],
  )

  const headingId = useId()
  const unmapped = highlight.total - highlight.mapped

  return (
    <section
      aria-labelledby={headingId}
      className={cn('shrink-0 overflow-auto border-t border-border bg-surface', className)}
    >
      <header className="flex items-start gap-3 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="font-mono text-[11px] tracking-tight text-foreground">
            Simulation — hypothetical
          </h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            The machine runs in this tab and nothing leaves the browser. Guards are prose, so the branches below are the
            ones you chose, not claims about the system.
          </p>
        </div>
        <button
          type="button"
          onClick={restart}
          className="focusable shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          aria-label="Restart the simulation from the initial state"
          title="Restart"
        >
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="focusable shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          aria-label="Close the simulation"
          title="Close"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </header>

      <div className="space-y-3 px-4 pt-3 pb-4">
        {/*
         * The live region. The SVG host above is `aria-hidden` — it duplicates
         * the source pane — so a simulation expressed only as SVG classes would
         * be invisible to a screen reader. This paragraph and the log below are
         * the simulation, and the drawing is the illustration of it.
         */}
        <p aria-live="polite" aria-atomic className="text-[12.5px] text-foreground">
          {status === 'loading' && 'Loading the state machine runtime…'}
          {status === 'failed' && <span className="text-warning">Simulation unavailable — {error}</span>}
          {status === 'ready' && run && (
            <>
              <span className="text-muted-foreground">Now in </span>
              <span className="font-mono text-[11.5px] tracking-tight">{leafLabel(run.active)}</span>
              {run.done && <span className="text-muted-foreground"> — final state, nothing more is accepted.</span>}
            </>
          )}
        </p>

        {status === 'ready' && unmapped > 0 && (
          <p className="text-[12px] text-warning">
            {highlight.mapped === 0
              ? 'The drawing cannot be highlighted — its states did not join to the chart. The readout here is the simulation.'
              : `${unmapped} of ${highlight.total} states could not be located on the drawing; the readout here is the simulation.`}
          </p>
        )}

        {status === 'ready' && (
          <>
            <EventBar offers={offers} done={run?.done ?? false} onSend={send} />
            {guards.length > 0 && <GuardPanel guards={guards} failing={failing} onToggle={toggleGuard} />}
            <RunLog entries={log} />
          </>
        )}
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- sections */

const OFFER_ORDER: Record<EventStatus, number> = { available: 0, guarded: 1, unaccepted: 2 }

function EventBar({ offers, done, onSend }: { offers: EventOffer[]; done: boolean; onSend: (event: string) => void }) {
  const sorted = useMemo(
    () => [...offers].sort((a, b) => OFFER_ORDER[a.status] - OFFER_ORDER[b.status] || a.event.localeCompare(b.event)),
    [offers],
  )

  return (
    <div>
      <h4 className="font-mono text-[10.5px] tracking-tight text-muted-foreground uppercase">Events</h4>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {sorted.map((offer) => {
          const sendable = !done && offer.status === 'available'
          return (
            <li key={offer.event}>
              {/*
               * `aria-disabled`, not `disabled`: the refusal carries a reason
               * worth reading, and a `disabled` button cannot be reached to
               * read it.
               */}
              <button
                type="button"
                aria-disabled={!sendable}
                onClick={() => sendable && onSend(offer.event)}
                title={reason(offer, done)}
                className={cn(
                  'focusable rounded border px-2 py-1 font-mono text-[11px] tracking-tight transition-colors',
                  sendable && 'border-border-strong text-foreground hover:bg-surface-raised',
                  // The two "no"s look different because they *are* different:
                  // a guard the reviewer switched off is their edit, not a fact.
                  !sendable && offer.status === 'guarded' && 'cursor-default border-warning/60 text-warning',
                  !sendable &&
                    offer.status !== 'guarded' &&
                    'cursor-default border-border text-muted-foreground opacity-60',
                )}
              >
                {offer.event}
                <span className="sr-only"> — {reason(offer, done)}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-1.5 text-[11.5px] text-muted-foreground">
        Amber: this state declares the event and a guard you switched off blocked it. Grey: this state does not accept
        the event at all.
      </p>
    </div>
  )
}

function reason(offer: EventOffer, done: boolean): string {
  if (done) return 'the machine is in a final state'
  if (offer.status === 'available') return `Send ${offer.event}`
  if (offer.status === 'unaccepted') return 'not accepted in this state'
  return `blocked by a guard you turned off: ${offer.guards.join('; ')}`
}

function GuardPanel({
  guards,
  failing,
  onToggle,
}: {
  guards: string[]
  failing: ReadonlySet<string>
  onToggle: (guard: string) => void
}) {
  return (
    <fieldset>
      <legend className="font-mono text-[10.5px] tracking-tight text-muted-foreground uppercase">
        Guards — your hypothesis
      </legend>
      <ul className="mt-1.5 space-y-px">
        {guards.map((guard) => {
          const passes = !failing.has(guard)
          return (
            <li key={guard}>
              <button
                type="button"
                aria-pressed={passes}
                onClick={() => onToggle(guard)}
                className="focusable flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-raised"
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-2.5 shrink-0 rounded-full border',
                    passes ? 'border-primary bg-primary' : 'border-border-strong',
                  )}
                />
                <span className={cn('text-[12px]', passes ? 'text-foreground' : 'text-muted-foreground line-through')}>
                  {guard}
                </span>
                <span className="sr-only">{passes ? ' — holds' : ' — does not hold'}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}

function RunLog({ entries }: { entries: RunEntry[] }) {
  return (
    <div>
      <h4 className="font-mono text-[10.5px] tracking-tight text-muted-foreground uppercase">Run</h4>
      {/*
       * `role="log"` is a live region by definition, so an appended step is
       * announced without the current-state paragraph and this list competing
       * to say the same thing twice.
       */}
      <ol role="log" className="mt-1.5 space-y-0.5 font-mono text-[11px] tracking-tight">
        {entries.map((entry, index) => (
          <li key={index} className="text-muted-foreground">
            <span className="text-foreground">{entry.event ?? 'start'}</span>
            {' → '}
            {entry.to}
            {entry.actions.length > 0 && <span className="text-primary"> · {entry.actions.join(', ')}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}

function leafLabel(active: readonly string[]): string {
  const leaves = activeLeaves(active)
  return leaves.length > 0 ? leaves.map(statePath).join(', ') : '—'
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/* --------------------------------------------------------------- clipboard */

/**
 * Copy the machine as a `createMachine()` call. Deliberately available without
 * opening the simulator — it is the feature that gets a machine into a real
 * editor, and it costs no runtime at all.
 */
export function CopyMachineButton({ chart, className }: { chart: StateChart; className?: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(machineSource(chart)).then(
          () => setCopied(true),
          () => setCopied(false),
        )
      }}
      aria-label={copied ? 'Machine copied' : `Copy ${chart.id} as a createMachine() call`}
      title="Copy as createMachine()"
      className={cn('focusable rounded p-1 text-muted-foreground transition hover:text-foreground', className)}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  )
}
