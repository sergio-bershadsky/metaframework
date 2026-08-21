import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseStates, type StateChart } from '@/lib/protocol/states'
import {
  activeLeaves,
  activeStateIds,
  eventNames,
  guardNames,
  machineSource,
  offerEvents,
  toMachineConfig,
  withAncestors,
  type SimulatedStateValue,
} from './state-simulator'

/**
 * The simulator's model, tested without a DOM.
 *
 * Everything the widget decides — which config runs, which guards need stubs,
 * which events are offered and why one is refused — is a pure function of the
 * chart, so it is asserted here rather than through the panel. Two of these
 * suites run against the *shipped* catalog and the real `xstate` package: the
 * claim "the reconstructed config is the same machine" is worth nothing unless
 * `createMachine` is the one saying so.
 */

const ORDER_PLACEMENT = {
  id: 'order-placement',
  initial: 'submitted',
  description: 'State of one order-placement conversation, as seen by checkout.',
  states: {
    submitted: {
      description: 'Request accepted; stock reservation in flight.',
      entry: ['assign-order-id'],
      on: {
        STOCK_RESERVATION_RESULT: [
          { target: 'reserved', guard: 'reservation granted in full' },
          { target: 'rejected', actions: ['emit-problem'] },
        ],
        OUT_OF_STOCK: { target: 'rejected', actions: ['emit-problem'] },
      },
    },
    reserved: {
      description: 'Stock is held; payment authorization in flight.',
      on: {
        PAYMENT_AUTHORIZED: { target: 'confirmed', actions: ['capture-funds'] },
        PAYMENT_DECLINED: { target: 'rejected', actions: ['release-stock'] },
      },
    },
    confirmed: { type: 'final', tags: ['success'] },
    rejected: { type: 'final', tags: ['failure'] },
  },
}

/** A nested machine, because the ancestor rules only bite below the top level. */
const SETTLEMENT = {
  id: 'settlement',
  initial: 'awaiting-payment',
  states: {
    'awaiting-payment': { on: { ORDER_PAID: 'posting' } },
    posting: {
      initial: 'entry-pending',
      entry: ['reserve-batch-slot'],
      on: { ABANDON: '#settlement.disputed' },
      states: {
        'entry-pending': {
          on: {
            LEDGER_ENTRY_POSTED: [
              { target: 'entry-posted', guard: 'debit and credit both accepted' },
              { target: '#settlement.disputed', actions: ['raise-imbalance'] },
            ],
          },
        },
        'entry-posted': { on: { RECONCILE: { target: '#settlement.settled', guard: 'batch balances to zero' } } },
      },
    },
    settled: { type: 'final' },
    disputed: { type: 'final' },
  },
}

function chartOf(input: unknown): StateChart {
  const { chart, diagnostics } = parseStates(input)
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  expect(chart).not.toBeNull()
  return chart as StateChart
}

describe('toMachineConfig', () => {
  it('round-trips a flat machine through parseStates unchanged', () => {
    const chart = chartOf(ORDER_PLACEMENT)
    expect(chartOf(toMachineConfig(chart))).toEqual(chart)
  })

  it('round-trips a nested machine, including cross-level targets', () => {
    const chart = chartOf(SETTLEMENT)
    expect(chartOf(toMachineConfig(chart))).toEqual(chart)
  })

  it('writes siblings as bare keys and everything else as an absolute path', () => {
    const config = toMachineConfig(chartOf(SETTLEMENT))
    const posting = config.states.posting.states as Record<string, { on?: Record<string, unknown> }>
    expect(posting['entry-pending'].on?.LEDGER_ENTRY_POSTED).toEqual([
      { target: 'entry-posted', guard: 'debit and credit both accepted' },
      { target: '#settlement.disputed', actions: ['raise-imbalance'] },
    ])
  })

  it('keeps an unconditional single transition in its bare-string form', () => {
    const config = toMachineConfig(chartOf(SETTLEMENT))
    expect(config.states['awaiting-payment'].on?.ORDER_PAID).toBe('posting')
  })

  it('carries the machine description and every state fact', () => {
    const config = toMachineConfig(chartOf(ORDER_PLACEMENT))
    expect(config.description).toBe(ORDER_PLACEMENT.description)
    expect(config.initial).toBe('submitted')
    expect(config.states.submitted.entry).toEqual(['assign-order-id'])
    expect(config.states.confirmed).toEqual({ type: 'final', tags: ['success'] })
  })

  it('falls back to the first child when a compound state names no initial', () => {
    // Authoring error (`E_PROTO_STATES_SUBSET`), but the chart still renders, so
    // the simulator must not hand createMachine a config it will throw on.
    const { chart } = parseStates({
      id: 'm',
      initial: 'a',
      states: { a: { states: { x: {}, y: {} } } },
    })
    expect(toMachineConfig(chart as StateChart).states.a.initial).toBe('x')
  })
})

describe('guardNames and eventNames', () => {
  it('lists guards once each, in declaration order', () => {
    expect(guardNames(chartOf(SETTLEMENT))).toEqual(['debit and credit both accepted', 'batch balances to zero'])
  })

  it('has no guards to stub when the machine declares none', () => {
    expect(guardNames(chartOf({ id: 'm', initial: 'a', states: { a: { on: { GO: 'b' } }, b: {} } }))).toEqual([])
  })

  it('lists every event once, in declaration order', () => {
    expect(eventNames(chartOf(SETTLEMENT))).toEqual(['ORDER_PAID', 'ABANDON', 'LEDGER_ENTRY_POSTED', 'RECONCILE'])
  })
})

describe('activeStateIds', () => {
  it('reads a flat value as one state', () => {
    expect(activeStateIds('awaiting-payment')).toEqual(['awaiting-payment'])
  })

  it('lights the ancestor chain, not only the leaf', () => {
    expect(activeStateIds({ posting: 'entry-pending' })).toEqual(['posting', 'posting.entry-pending'])
  })

  it('walks arbitrarily deep nesting', () => {
    expect(activeStateIds({ a: { b: 'c' } })).toEqual(['a', 'a.b', 'a.b.c'])
  })

  it('derives every prefix even from a flat dot path', () => {
    expect(withAncestors(['a.b.c'])).toEqual(['a.b.c', 'a.b', 'a'])
  })

  it('names the deepest states as the ones the machine is in', () => {
    expect(activeLeaves(['posting', 'posting.entry-pending'])).toEqual(['posting.entry-pending'])
  })
})

describe('offerEvents', () => {
  const chart = chartOf(SETTLEMENT)

  it('offers what the active configuration accepts', () => {
    const offers = offerEvents(chart, ['awaiting-payment'], (event) => event === 'ORDER_PAID')
    expect(offers.find((offer) => offer.event === 'ORDER_PAID')?.status).toBe('available')
  })

  it('calls an event the state never declares "unaccepted", not "guarded"', () => {
    const offers = offerEvents(chart, ['awaiting-payment'], () => false)
    expect(offers.find((offer) => offer.event === 'RECONCILE')).toEqual({
      event: 'RECONCILE',
      status: 'unaccepted',
      guards: [],
    })
  })

  it('names the guards when a declared event is the one that was blocked', () => {
    // The distinction `snapshot.can()` cannot make: this state does declare
    // RECONCILE, so refusing it is the reviewer's toggle talking, not the file.
    const offers = offerEvents(chart, ['posting', 'posting.entry-posted'], () => false)
    expect(offers.find((offer) => offer.event === 'RECONCILE')).toEqual({
      event: 'RECONCILE',
      status: 'guarded',
      guards: ['batch balances to zero'],
    })
  })

  it('counts a transition declared on an ancestor as declared here', () => {
    const offers = offerEvents(chart, ['posting', 'posting.entry-pending'], () => false)
    expect(offers.find((offer) => offer.event === 'ABANDON')?.status).toBe('guarded')
  })

  it('reports every event of the machine, whatever its status', () => {
    const offers = offerEvents(chart, ['awaiting-payment'], () => false)
    expect(offers.map((offer) => offer.event)).toEqual(eventNames(chart))
  })
})

describe('machineSource', () => {
  it('is a createMachine call whose argument is the reconstructed config', () => {
    const chart = chartOf(ORDER_PLACEMENT)
    const source = machineSource(chart)
    expect(source).toContain("import { createMachine } from 'xstate'")
    expect(source).toContain('export const orderPlacementMachine = createMachine({')
    const body = source.slice(source.indexOf('createMachine(') + 'createMachine('.length, source.lastIndexOf('}).'))
    expect(JSON.parse(`${body}}`)).toEqual(toMachineConfig(chart))
  })

  it('stubs every guard, because an unimplemented one throws at send time', () => {
    const source = machineSource(chartOf(SETTLEMENT))
    expect(source).toContain('}).provide({')
    for (const guard of guardNames(chartOf(SETTLEMENT))) {
      expect(source).toContain(`${JSON.stringify(guard)}: () => true,`)
    }
  })

  it('omits the provide() block when there is nothing to stub', () => {
    const source = machineSource(chartOf({ id: 'm', initial: 'a', states: { a: { on: { GO: 'b' } }, b: {} } }))
    expect(source).not.toContain('provide')
    expect(source).toContain('export const mMachine = createMachine({')
  })
})

/* ------------------------------------------------------ the real catalog */

const CATALOG = path.resolve(process.cwd(), '../../solutions')

function catalogMachines(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) return catalogMachines(full)
      return entry.name === 'states.json' ? [full] : []
    })
    .sort()
}

describe('the shipped catalog', () => {
  const files = catalogMachines(CATALOG)

  it('has machines to simulate', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files.map((file) => [path.relative(CATALOG, file), file]))(
    'reconstructs %s to the identical chart',
    (_relative, file) => {
      const chart = chartOf(JSON.parse(fs.readFileSync(file, 'utf8')))
      expect(chartOf(toMachineConfig(chart))).toEqual(chart)
    },
  )

  it.each(files.map((file) => [path.relative(CATALOG, file), file]))(
    'runs %s under real xstate with stubbed guards',
    async (_relative, file) => {
      const { createActor, createMachine } = await import('xstate')
      const chart = chartOf(JSON.parse(fs.readFileSync(file, 'utf8')))

      const fired: string[] = []
      const machine = createMachine(toMachineConfig(chart)).provide({
        guards: Object.fromEntries(guardNames(chart).map((guard) => [guard, () => true])),
      })
      const actor = createActor(machine, {
        inspect: (event) => {
          if (event.type === '@xstate.action') fired.push(event.action.type)
        },
      })
      actor.start()

      // The chart's own initial configuration is what the machine starts in —
      // if those two ever disagree, the highlight is lighting the wrong box.
      const active = activeStateIds(actor.getSnapshot().value as SimulatedStateValue)
      expect(active).toContain(chart.initial)

      // Every event the model offers has to be one the machine really accepts:
      // this is the join that lets the panel blame a guard rather than the file.
      const snapshot = actor.getSnapshot()
      const offers = offerEvents(chart, active, (event) => snapshot.can({ type: event }))
      for (const offer of offers.filter((entry) => entry.status === 'available')) {
        expect(snapshot.can({ type: offer.event })).toBe(true)
      }
      // Entry actions report through inspect without a single implementation.
      const entry = chart.nodes.filter((node) => active.includes(node.id)).flatMap((node) => node.entry)
      expect(fired).toEqual(expect.arrayContaining(entry))

      actor.stop()
    },
  )
})
