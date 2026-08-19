import { describe, expect, it } from 'vitest'
import { eventToMessage, parseStates, stateChartSummary, type StateChart } from './states'

/**
 * The fixture is the worked example from framework/spec/kinds/protocol.md, and
 * every counter-example printed in that document has a case here — the spec is
 * the test oracle, so a spec change that this suite still passes is a bug in
 * the suite.
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
        OUT_OF_STOCK: {
          target: 'rejected',
          actions: ['emit-problem'],
          description: 'Inventory exhausted after the retry budget.',
        },
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

/** Deep clone so a mutation in one case cannot leak into the next. */
function machine(mutate: (config: Record<string, never>) => void = () => {}): unknown {
  const copy = structuredClone(ORDER_PLACEMENT) as unknown as Record<string, never>
  mutate(copy)
  return copy
}

function chartOf(input: unknown): StateChart {
  const { chart, diagnostics } = parseStates(input)
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  expect(chart).not.toBeNull()
  return chart as StateChart
}

function codes(input: unknown, options = {}): string[] {
  return parseStates(input, options).diagnostics.map((d) => d.code)
}

describe('parseStates — the worked example', () => {
  it('accepts it without a single diagnostic', () => {
    expect(parseStates(machine(), { entityName: 'order-placement' }).diagnostics).toEqual([])
  })

  it('flattens four states, marking the initial and the finals', () => {
    const chart = chartOf(machine())
    expect(chart.id).toBe('order-placement')
    expect(chart.initial).toBe('submitted')
    expect(chart.nodes.map((n) => n.id)).toEqual(['submitted', 'reserved', 'confirmed', 'rejected'])
    expect(chart.nodes.filter((n) => n.initial).map((n) => n.id)).toEqual(['submitted'])
    expect(chart.nodes.filter((n) => n.final).map((n) => n.id)).toEqual(['confirmed', 'rejected'])
    expect(chart.nodes.every((n) => !n.compound)).toBe(true)
  })

  it('keeps entry actions, tags and descriptions', () => {
    const chart = chartOf(machine())
    const submitted = chart.nodes.find((n) => n.id === 'submitted')
    expect(submitted?.entry).toEqual(['assign-order-id'])
    expect(submitted?.description).toBe('Request accepted; stock reservation in flight.')
    expect(chart.nodes.find((n) => n.id === 'confirmed')?.tags).toEqual(['success'])
  })

  it('expands a guarded transition array in declaration order', () => {
    const chart = chartOf(machine())
    const branches = chart.edges.filter((e) => e.event === 'STOCK_RESERVATION_RESULT')
    expect(branches).toHaveLength(2)
    expect(branches[0]).toMatchObject({ source: 'submitted', target: 'reserved', guard: 'reservation granted in full' })
    expect(branches[1]).toMatchObject({ target: 'rejected', guard: null, actions: ['emit-problem'] })
    expect(new Set(chart.edges.map((e) => e.id)).size).toBe(chart.edges.length)
  })

  it('normalises a single-string action to a list', () => {
    const chart = chartOf(
      machine((config) => {
        // @ts-expect-error — fixture is deliberately untyped
        config.states.reserved.on.PAYMENT_AUTHORIZED.actions = 'capture-funds'
      }),
    )
    expect(chart.edges.find((e) => e.event === 'PAYMENT_AUTHORIZED')?.actions).toEqual(['capture-funds'])
  })
})

describe('parseStates — transition shapes', () => {
  const twoStates = (on: unknown) => ({
    id: 'p',
    initial: 'a',
    states: { a: { on }, b: {} },
  })

  it('accepts a bare target string', () => {
    const chart = chartOf(twoStates({ GO: 'b' }))
    expect(chart.edges[0]).toMatchObject({ source: 'a', target: 'b', internal: false, self: false })
  })

  it('treats a targetless transition as an internal self-transition', () => {
    const chart = chartOf(twoStates({ PING: { actions: ['touch'] } }))
    expect(chart.edges[0]).toMatchObject({ source: 'a', target: 'a', internal: true, self: true, actions: ['touch'] })
  })

  it('marks an explicit self-transition as self but not internal', () => {
    const chart = chartOf(twoStates({ RETRY: 'a' }))
    expect(chart.edges[0]).toMatchObject({ target: 'a', internal: false, self: true })
  })

  it('resolves an absolute #id.path target across the hierarchy', () => {
    const chart = chartOf({
      id: 'p',
      initial: 'group',
      states: {
        group: { initial: 'inner', states: { inner: { on: { DONE: '#p.done' } } } },
        done: { type: 'final' },
      },
    })
    expect(chart.edges[0]).toMatchObject({ source: 'group.inner', target: 'done' })
  })

  it('nests compound states and reports their children', () => {
    const chart = chartOf({
      id: 'p',
      initial: 'group',
      states: { group: { initial: 'inner', states: { inner: {}, other: { on: { X: 'inner' } } } } },
    })
    const group = chart.nodes.find((n) => n.id === 'group')
    expect(group).toMatchObject({ compound: true, depth: 0, children: ['group.inner', 'group.other'] })
    expect(chart.nodes.find((n) => n.id === 'group.inner')).toMatchObject({ parent: 'group', depth: 1, initial: true })
    // A sibling key resolves inside the parent, never from the root.
    expect(chart.edges[0]).toMatchObject({ source: 'group.other', target: 'group.inner' })
  })
})

describe('parseStates — subset violations', () => {
  it('rejects context', () => {
    expect(codes({ ...ORDER_PLACEMENT, context: { attempts: 0 } })).toEqual(['E_PROTO_STATES_SUBSET'])
  })

  it('rejects after', () => {
    const result = parseStates(
      machine((config) => {
        // @ts-expect-error — fixture is deliberately untyped
        config.states.reserved.after = { 5000: 'rejected' }
      }),
    )
    expect(result.chart).toBeNull()
    expect(result.diagnostics[0].code).toBe('E_PROTO_STATES_SUBSET')
    expect(result.diagnostics[0].message).toContain('outside the supported subset')
  })

  it('rejects type: parallel with a message naming the construct', () => {
    const result = parseStates({ id: 'p', initial: 'root', states: { root: { type: 'parallel' } } })
    expect(result.chart).toBeNull()
    expect(result.diagnostics[0]).toMatchObject({ code: 'E_PROTO_STATES_SUBSET' })
    expect(result.diagnostics[0].message).toContain('parallel')
  })

  it('rejects an object-form guard', () => {
    expect(
      codes({ id: 'p', initial: 'a', states: { a: { on: { GO: { target: 'b', guard: { type: 'x' } } } }, b: {} } }),
    ).toEqual(['E_PROTO_STATES_SUBSET'])
  })

  it('rejects a missing root key', () => {
    expect(codes({ id: 'p', states: { a: {} } })).toEqual(['E_PROTO_STATES_SUBSET'])
  })

  it('reports a non-JSON artifact rather than staying silent', () => {
    expect(codes(null)).toEqual(['E_PROTO_STATES_SUBSET'])
  })

  it('reports a wildcard event as out of subset, not as a bad event name', () => {
    expect(codes({ id: 'p', initial: 'a', states: { a: { on: { '*': 'b' } }, b: {} } })).toEqual([
      'E_PROTO_STATES_SUBSET',
    ])
  })

  it('reports a final state that declares transitions but still charts it', () => {
    const result = parseStates({ id: 'p', initial: 'a', states: { a: { type: 'final', on: { GO: 'a' } } } })
    expect(result.diagnostics.map((d) => d.code)).toEqual(['E_PROTO_STATES_SUBSET'])
    expect(result.chart?.edges).toHaveLength(1)
  })

  it('reports a non-kebab state name without discarding the chart', () => {
    const result = parseStates({ id: 'p', initial: 'Submitted', states: { Submitted: {} } })
    expect(result.diagnostics.map((d) => d.code)).toEqual(['E_PROTO_STATES_SUBSET'])
    expect(result.chart?.nodes).toHaveLength(1)
  })
})

describe('parseStates — references', () => {
  it('flags an id that is not the protocol name', () => {
    expect(codes(machine(), { entityName: 'order-events' })).toEqual(['E_PROTO_STATES_ID'])
  })

  it('flags a bad event name', () => {
    expect(codes({ id: 'p', initial: 'a', states: { a: { on: { payment_ok: 'b' } }, b: {} } })).toEqual([
      'E_PROTO_STATES_EVENT_NAME',
    ])
  })

  it('flags an unresolvable transition target and drops the edge', () => {
    const result = parseStates({ id: 'p', initial: 'a', states: { a: { on: { GO: 'nowhere' } } } })
    expect(result.diagnostics.map((d) => d.code)).toEqual(['E_PROTO_STATES_TARGET'])
    expect(result.chart?.edges).toEqual([])
  })

  it('rejects relative descent, the form that silently hits the wrong node', () => {
    const result = parseStates({
      id: 'p',
      initial: 'a',
      states: { a: { on: { GO: 'group.inner' } }, group: { initial: 'inner', states: { inner: {} } } },
    })
    expect(result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)).toEqual([
      'E_PROTO_STATES_TARGET',
    ])
  })

  it('flags an #id path whose machine id does not match', () => {
    expect(codes({ id: 'p', initial: 'a', states: { a: { on: { GO: '#q.a' } } } })).toEqual(['E_PROTO_STATES_TARGET'])
  })

  it('flags an initial that names no child', () => {
    expect(codes({ id: 'p', initial: 'ghost', states: { a: {} } })).toContain('E_PROTO_STATES_TARGET')
  })

  it('flags a compound state without initial', () => {
    expect(codes({ id: 'p', initial: 'group', states: { group: { states: { inner: {} } } } })).toContain(
      'E_PROTO_STATES_SUBSET',
    )
  })
})

describe('parseStates — warnings', () => {
  it('warns about an unreachable state', () => {
    const result = parseStates({ id: 'p', initial: 'a', states: { a: {}, orphan: {} } })
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'W_PROTO_STATES_UNREACHABLE', severity: 'warning' }),
    ])
    expect(result.diagnostics[0].message).toContain('orphan')
  })

  it('counts a state reached only through a compound parent as reachable', () => {
    const result = parseStates({
      id: 'p',
      initial: 'group',
      states: {
        group: { initial: 'inner', states: { inner: {}, second: {} }, on: { JUMP: '#p.group.second' } },
      },
    })
    expect(result.diagnostics).toEqual([])
  })

  it('warns when an event has no workflow message, and stays quiet when it does', () => {
    const messages = [
      'stock-reservation-result',
      'out-of-stock',
      'payment-authorized',
      'payment-declined',
      'submit-order',
    ]
    expect(codes(machine(), { entityName: 'order-placement', workflowMessages: messages })).toEqual([])
    expect(codes(machine(), { entityName: 'order-placement', workflowMessages: ['submit-order'] })).toEqual([
      'W_PROTO_STATES_EVENT_UNKNOWN',
      'W_PROTO_STATES_EVENT_UNKNOWN',
      'W_PROTO_STATES_EVENT_UNKNOWN',
      'W_PROTO_STATES_EVENT_UNKNOWN',
    ])
  })

  it('skips the workflow cross-check when no messages are supplied', () => {
    expect(codes(machine(), { entityName: 'order-placement' })).toEqual([])
  })

  it('carries the artifact path and srn onto every diagnostic', () => {
    const [diagnostic] = parseStates({ id: 'p' }, { path: 'acme/shop/protocol/x/states.json', srn: 'srn://acme/shop' })
      .diagnostics
    expect(diagnostic).toMatchObject({ path: 'acme/shop/protocol/x/states.json', srn: 'srn://acme/shop' })
  })
})

describe('eventToMessage', () => {
  it('maps the spec correspondences', () => {
    expect(eventToMessage('STOCK_RESERVATION_RESULT')).toBe('stock-reservation-result')
    expect(eventToMessage('PAYMENT_DECLINED')).toBe('payment-declined')
  })
})

describe('stateChartSummary', () => {
  it('describes the machine, its states and every transition in words', () => {
    const summary = stateChartSummary(chartOf(machine()))
    expect(summary.headline).toContain('4 states, 5 transitions')
    expect(summary.headline).toContain('Initial state submitted')
    expect(summary.headline).toContain('Final states: confirmed, rejected')
    expect(summary.transitions).toContain(
      'From submitted, on STOCK_RESERVATION_RESULT when reservation granted in full go to reserved.',
    )
    expect(summary.transitions).toContain('From reserved, on PAYMENT_AUTHORIZED go to confirmed, performing capture-funds.')
    expect(summary.states).toHaveLength(4)
  })

  it('words an internal transition as staying put', () => {
    const chart = chartOf({ id: 'p', initial: 'a', states: { a: { on: { PING: { actions: 'touch' } } } } })
    expect(stateChartSummary(chart).transitions).toEqual(['In a, on PING stay, performing touch.'])
  })
})
