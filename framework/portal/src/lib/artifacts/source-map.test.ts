import { describe, expect, it } from 'vitest'
import { stateChartAnchors, workflowAnchors } from './anchors'
import { anchorsAt, formatPositionalPath, lineCount, parsePositionalPath } from './source-map'
import { buildSourceIndex } from './source-index'
import { parseStates } from '../protocol/states'
import { parseWorkflow } from '../protocol/workflow'

const WORKFLOW = `name: place-order
title: Place an order
participants: [customer, checkout]
steps:
  - message: submit-order
    from: customer
    to: checkout
    kind: call
    payload: /product/shop/datamodel/order-request@1

  - loop:
      while: inventory answers retry
      max: 3
      steps:
        - message: reserve-stock
          from: checkout
          to: checkout
          kind: call

  - alt:
      - when: stock reserved
        steps:
          - message: order-confirmed
            from: checkout
            to: customer
            kind: return
    otherwise:
      - message: order-rejected
        from: checkout
        to: customer
        kind: error
`

const STATES = `{
  "id": "order-placement",
  "initial": "draft",
  "states": {
    "draft": {
      "on": {
        "SUBMIT_ORDER": "reserving"
      }
    },
    "reserving": {
      "on": {
        "STOCK_RESERVATION_RESULT": [
          { "target": "authorizing", "guard": "held" },
          { "target": "rejected" }
        ]
      }
    },
    "authorizing": {
      "states": { "waiting": {} },
      "initial": "waiting",
      "on": { "PAYMENT_AUTHORIZED": "confirmed" }
    },
    "confirmed": { "type": "final" },
    "rejected": { "type": "final" }
  }
}
`

describe('buildSourceIndex', () => {
  it('spans a mapping entry from its key to the end of its value', () => {
    const index = buildSourceIndex(WORKFLOW)
    // `title` is a one-line scalar entry.
    expect(index.spanOf(['title'])).toEqual({ startLine: 2, endLine: 2 })
  })

  it('spans a sequence item over every line it occupies', () => {
    const index = buildSourceIndex(WORKFLOW)
    // The first step runs from `- message:` through its `payload:` line.
    expect(index.spanOf(['steps', '0'])).toEqual({ startLine: 5, endLine: 9 })
  })

  it('reaches nodes nested inside fragments', () => {
    const index = buildSourceIndex(WORKFLOW)
    const span = index.spanOf(['steps', '1', 'loop', 'steps', '0'])
    expect(span).not.toBeNull()
    expect(WORKFLOW.split('\n')[(span as { startLine: number }).startLine - 1]).toContain('reserve-stock')
  })

  it('returns null for a path the document does not carry', () => {
    expect(buildSourceIndex(WORKFLOW).spanOf(['steps', '9'])).toBeNull()
  })

  it('reports the deepest path covering a line', () => {
    const index = buildSourceIndex(WORKFLOW)
    const payloadLine = WORKFLOW.split('\n').findIndex((line) => line.includes('payload:')) + 1
    expect(index.pathAt(payloadLine)).toEqual(['steps', '0', 'payload'])
  })

  it('reads JSON, because YAML 1.2 is a superset of it', () => {
    const index = buildSourceIndex(STATES)
    const span = index.spanOf(['states', 'draft', 'on', 'SUBMIT_ORDER'])
    expect(span).not.toBeNull()
    expect(STATES.split('\n')[(span as { startLine: number }).startLine - 1]).toContain('SUBMIT_ORDER')
  })

  it('survives a document that does not parse', () => {
    const index = buildSourceIndex('steps:\n  - [unclosed\n')
    expect(index.pathAt(1)).toBeDefined()
    expect(index.lines).toBe(3)
  })
})

/**
 * `lineCount` exists so the artifact block can size its source pane without
 * loading a YAML parser — the pane's height is read on every render, open or
 * closed, and `SourceIndex.lines` costs 99.8 KB of `yaml` to obtain. The whole
 * substitution rests on the two numbers being the same number, so that is what
 * is asserted, on the real fixtures and on the edge cases a hand-rolled scan
 * gets wrong: no newline at all, a trailing newline, an empty string.
 */
describe('lineCount', () => {
  it('agrees with the index it stands in for', () => {
    for (const source of [WORKFLOW, STATES]) {
      expect(lineCount(source)).toBe(buildSourceIndex(source).lines)
    }
  })

  it('agrees at the boundaries', () => {
    for (const source of ['', 'one line', 'trailing\n', 'a\nb\nc', '\n\n']) {
      expect(lineCount(source)).toBe(buildSourceIndex(source).lines)
    }
  })
})

describe('positional paths', () => {
  it('round-trips the spec’s step key', () => {
    const key = 'steps[4].alt[0].steps[2]'
    expect(parsePositionalPath(key)).toEqual(['steps', '4', 'alt', '0', 'steps', '2'])
    expect(formatPositionalPath(parsePositionalPath(key))).toBe(key)
  })

  it('round-trips an otherwise branch, whose value is the step list', () => {
    const key = 'steps[2].otherwise[0]'
    expect(parsePositionalPath(key)).toEqual(['steps', '2', 'otherwise', '0'])
    expect(formatPositionalPath(parsePositionalPath(key))).toBe(key)
  })
})

describe('workflowAnchors', () => {
  const { workflow } = parseWorkflow(
    {
      name: 'place-order',
      title: 'Place an order',
      participants: ['customer', 'checkout'],
      steps: [
        { message: 'submit-order', from: 'customer', to: 'checkout', kind: 'call' },
        {
          alt: [{ when: 'ok', steps: [{ message: 'a', from: 'customer', to: 'checkout' }] }],
          otherwise: [{ message: 'b', from: 'checkout', to: 'customer', kind: 'error' }],
        },
      ],
    },
    { fileStem: 'place-order', aliases: ['customer', 'checkout'] },
  )

  it('anchors every step, fragment and compartment', () => {
    expect(workflow).not.toBeNull()
    const anchors = workflowAnchors(workflow!)
    expect(anchors['steps[0]']).toEqual(['steps', '0'])
    expect(anchors['steps[1]']).toEqual(['steps', '1'])
    expect(anchors['steps[1].alt[0]']).toEqual(['steps', '1', 'alt', '0'])
    expect(anchors['steps[1].alt[0].steps[0]']).toEqual(['steps', '1', 'alt', '0', 'steps', '0'])
    expect(anchors['steps[1].otherwise[0]']).toEqual(['steps', '1', 'otherwise', '0'])
  })

  it('lands on real lines of the file the parser read', () => {
    const parsed = parseWorkflow(
      {
        name: 'place-order',
        title: 'Place an order',
        participants: ['customer', 'checkout'],
        steps: [
          { message: 'submit-order', from: 'customer', to: 'checkout', kind: 'call', payload: 'x' },
          { loop: { while: 'retry', max: 3, steps: [{ message: 'reserve-stock', from: 'checkout', to: 'checkout' }] } },
          {
            alt: [{ when: 'stock reserved', steps: [{ message: 'order-confirmed', from: 'checkout', to: 'customer' }] }],
            otherwise: [{ message: 'order-rejected', from: 'checkout', to: 'customer' }],
          },
        ],
      },
      { fileStem: 'place-order' },
    )
    const anchors = workflowAnchors(parsed.workflow!)
    const index = buildSourceIndex(WORKFLOW)
    const lines = WORKFLOW.split('\n')

    const lineFor = (anchor: string) => {
      const span = index.spanOf(anchors[anchor])
      return span ? lines[span.startLine - 1] : null
    }

    expect(lineFor('steps[0]')).toContain('submit-order')
    expect(lineFor('steps[1].loop.steps[0]')).toContain('reserve-stock')
    expect(lineFor('steps[2].alt[0].steps[0]')).toContain('order-confirmed')
    expect(lineFor('steps[2].otherwise[0]')).toContain('order-rejected')
  })
})

describe('stateChartAnchors', () => {
  const data = JSON.parse(STATES)
  const { chart } = parseStates(data, { entityName: 'order-placement' })

  it('interleaves the states key for a nested node', () => {
    const anchors = stateChartAnchors(chart!, data)
    expect(anchors['authorizing.waiting']).toEqual(['states', 'authorizing', 'states', 'waiting'])
  })

  it('anchors a single transition on its event key', () => {
    const anchors = stateChartAnchors(chart!, data)
    expect(anchors['draft--SUBMIT_ORDER--0']).toEqual(['states', 'draft', 'on', 'SUBMIT_ORDER'])
  })

  it('anchors each branch of a guarded list on its own element', () => {
    const anchors = stateChartAnchors(chart!, data)
    expect(anchors['reserving--STOCK_RESERVATION_RESULT--0']).toEqual([
      'states',
      'reserving',
      'on',
      'STOCK_RESERVATION_RESULT',
      '0',
    ])
    expect(anchors['reserving--STOCK_RESERVATION_RESULT--1']?.at(-1)).toBe('1')
  })

  it('resolves to the lines that declare the transition', () => {
    const anchors = stateChartAnchors(chart!, data)
    const index = buildSourceIndex(STATES)
    const span = index.spanOf(anchors['reserving--STOCK_RESERVATION_RESULT--1'])
    expect(span).not.toBeNull()
    expect(STATES.split('\n')[(span as { startLine: number }).startLine - 1]).toContain('rejected')
  })
})

describe('anchorsAt', () => {
  it('returns every enclosing anchor, deepest first', () => {
    const anchors = {
      'steps[1]': ['steps', '1'],
      'steps[1].alt[0]': ['steps', '1', 'alt', '0'],
      'steps[1].alt[0].steps[0]': ['steps', '1', 'alt', '0', 'steps', '0'],
      'steps[0]': ['steps', '0'],
    }
    expect(anchorsAt(anchors, ['steps', '1', 'alt', '0', 'steps', '0', 'payload'])).toEqual([
      'steps[1].alt[0].steps[0]',
      'steps[1].alt[0]',
      'steps[1]',
    ])
  })

  it('is empty when the cursor is above every anchor', () => {
    expect(anchorsAt({ 'steps[0]': ['steps', '0'] }, ['title'])).toEqual([])
    expect(anchorsAt({ 'steps[0]': ['steps', '0'] }, null)).toEqual([])
  })
})
