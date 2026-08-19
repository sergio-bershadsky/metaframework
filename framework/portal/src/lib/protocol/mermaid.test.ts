import { describe, expect, it } from 'vitest'
import { compileStates, statesToMermaid, stateAliases } from './mermaid'
import { parseStates, type StateChart } from './states'

/**
 * The generator is the whole contract between the model and mermaid — the
 * component only pipes its output through `mermaid.render` — so the golden
 * test pins the exact text, wording and all. When it changes on purpose, the
 * diff *is* the review.
 */

function chartOf(input: unknown): StateChart {
  const { chart, diagnostics } = parseStates(input)
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([])
  expect(chart).not.toBeNull()
  return chart as StateChart
}

/** A compound region, a guard, an internal transition, a final state. */
const machine = {
  id: 'quote-flow',
  initial: 'evaluating',
  description: 'One quote, end to end.',
  states: {
    evaluating: {
      initial: 'scanning',
      exit: ['stop-timer'],
      states: {
        scanning: {
          on: {
            EXHAUSTED: [
              { target: 'validating-coupon', guard: 'a code was presented' },
              { target: '#quote-flow.quoted' },
            ],
          },
        },
        'validating-coupon': {
          on: {
            COUPON_VALID: { target: '#quote-flow.quoted', actions: ['append-applied'] },
          },
        },
      },
    },
    quoted: {
      entry: ['publish-quote'],
      on: {
        TICK: { actions: ['refresh-ttl'] },
        RETRY: { target: 'quoted' },
        ORDER_PLACED: { target: 'committed', actions: ['burn-coupon', 'publish-redemption'] },
      },
    },
    committed: { type: 'final' },
  },
}

describe('statesToMermaid', () => {
  it('renders the golden chart exactly', () => {
    expect(statesToMermaid(chartOf(machine))).toBe(
      [
        'stateDiagram-v2',
        '  direction TB',
        '  accTitle: State machine quote-flow',
        '  accDescr: State machine quote-flow: 5 states, 6 transitions. Initial state evaluating. Final states: committed.',
        '  state "evaluating" as s_evaluating {',
        '    [*] --> s_evaluating__scanning',
        '    state "scanning" as s_evaluating__scanning',
        '    state "validating-coupon" as s_evaluating__validating_coupon',
        '  }',
        '  note right of s_evaluating',
        '    exit / stop-timer',
        '  end note',
        '  state "quoted" as s_quoted',
        '  s_quoted : entry / publish-quote',
        '  s_quoted : TICK / refresh-ttl',
        '  state "committed" as s_committed',
        '  [*] --> s_evaluating',
        '  s_evaluating__scanning --> s_evaluating__validating_coupon : EXHAUSTED [a code was presented]',
        '  s_evaluating__scanning --> s_quoted : EXHAUSTED',
        '  s_evaluating__validating_coupon --> s_quoted : COUPON_VALID / append-applied',
        '  s_quoted --> s_quoted : RETRY',
        '  s_quoted --> s_committed : ORDER_PLACED / burn-coupon, publish-redemption',
        '  s_committed --> [*]',
      ].join('\n'),
    )
  })

  it('keeps internal transitions out of the arrow list and inside the box', () => {
    const text = statesToMermaid(chartOf(machine))
    expect(text).not.toMatch(/-->.*TICK/)
    expect(text).toContain('s_quoted : TICK / refresh-ttl')
  })

  it('draws a self transition as a real loop arrow', () => {
    expect(statesToMermaid(chartOf(machine))).toContain('s_quoted --> s_quoted : RETRY')
  })

  it('flattens label text mermaid cannot carry through its lexer', () => {
    const chart = chartOf({
      id: 'm',
      initial: 'a',
      states: {
        a: {
          description: 'irrelevant',
          on: { GO: { target: 'b', guard: 'x; y "quoted" {brace}\nnewline' } },
        },
        b: { type: 'final' },
      },
    })
    expect(statesToMermaid(chart)).toContain(
      's_a --> s_b : GO [x#59; y #quot;quoted#quot; #123;brace#125; newline]',
    )
  })
})

describe('stateAliases', () => {
  it('is injective for dot-and-kebab ids', () => {
    // "a-b.c" and "a.b-c" must never share an alias: the dot and the dash map
    // through different widths.
    const chart = chartOf({
      id: 'm',
      initial: 'a-b',
      states: {
        'a-b': { initial: 'c', states: { c: {} } },
        a: { initial: 'b-c', states: { 'b-c': {} } },
      },
    })
    const aliases = stateAliases(chart)
    expect(aliases.get('a-b.c')).toBe('s_a_b__c')
    expect(aliases.get('a.b-c')).toBe('s_a__b_c')
    expect(new Set(aliases.values()).size).toBe(chart.nodes.length)
  })

  it('suffixes rather than collides on ids outside the kebab subset', () => {
    // parseStates diagnoses "a--b" as non-kebab but still builds the node, so
    // the alias map has to survive it anyway.
    // "a--b" is not kebab (diagnosed, node still built) and its encoding
    // lands exactly on nested "a.b"'s — the suffix is what keeps them apart.
    const { chart } = parseStates({
      id: 'm',
      initial: 'a--b',
      states: { 'a--b': {}, a: { initial: 'b', states: { b: {} } } },
    })
    expect(chart).not.toBeNull()
    const aliases = stateAliases(chart as StateChart)
    expect(new Set(aliases.values()).size).toBe((chart as StateChart).nodes.length)
  })
})

describe('compileStates', () => {
  it('reports transition statement order, pseudo-edges as null', () => {
    const chart = chartOf(machine)
    const { text, edgeOrder } = compileStates(chart)

    // One entry per arrow statement, in text order: the nested [*], the root
    // [*], the five real transitions minus the internal one, the final [*].
    expect(edgeOrder).toEqual([
      null, // [*] --> scanning (inside evaluating)
      null, // [*] --> evaluating
      'evaluating.scanning--EXHAUSTED--0',
      'evaluating.scanning--EXHAUSTED--1',
      'evaluating.validating-coupon--COUPON_VALID--0',
      'quoted--RETRY--0',
      'quoted--ORDER_PLACED--0',
      null, // committed --> [*]
    ])

    // The count of arrow statements in the text equals the edgeOrder length.
    const arrows = text.split('\n').filter((line) => line.includes('-->')).length
    expect(arrows).toBe(edgeOrder.length)
  })
})
