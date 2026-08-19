import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  type FragmentLayout,
  type MessageStep,
  type Workflow,
  flattenMessages,
  layoutWorkflow,
  narrateWorkflow,
  parseWorkflow,
  resolveWorkflowRef,
  wrapText,
} from './workflow'

/**
 * Cases come from framework/spec/kinds/protocol.md, "The workflow mini-spec".
 * Every row of its validation table (W1–W7, W10) has a case here, and the
 * layout half is pinned by invariants rather than by pixel values — the
 * geometry is allowed to be retuned, the guarantees are not.
 */

const PLACE_ORDER = `
name: place-order
title: Place an order
summary: Customer submits a cart; checkout reserves stock, authorizes payment, confirms.
participants: [customer, checkout, inventory, payment]
steps:
  - message: submit-order
    from: customer
    to: checkout
    payload: /product/shop/datamodel/order-request@1
  - loop:
      while: inventory answers RETRY
      max: 3
      steps:
        - message: reserve-stock
          from: checkout
          to: inventory
        - message: stock-reserved
          from: inventory
          to: checkout
          kind: return
  - alt:
      - when: stock reserved
        steps:
          - message: authorize-payment
            from: checkout
            to: payment
            condition: cart total > 0
          - message: payment-authorized
            from: payment
            to: checkout
            kind: return
    otherwise:
      - message: out-of-stock
        from: checkout
        to: customer
        kind: error
        note: The reservation window expired before payment could start.
  - message: order-placed
    from: checkout
    to: [customer, inventory, payment]
    kind: event
    channel: acme.shop.order.placed.v1
`

const ALIASES = ['customer', 'checkout', 'inventory', 'payment'] as const

function parse(yaml: string, options: Parameters<typeof parseWorkflow>[1] = {}) {
  return parseWorkflow(parseYaml(yaml), options)
}

function codes(result: ReturnType<typeof parseWorkflow>): string[] {
  return result.issues.map((issue) => issue.code)
}

function ok(yaml: string, options: Parameters<typeof parseWorkflow>[1] = {}): Workflow {
  const result = parse(yaml, options)
  expect(result.issues).toEqual([])
  expect(result.workflow).not.toBeNull()
  return result.workflow as Workflow
}

/* ------------------------------------------------------------------ parse */

describe('parseWorkflow — the happy path', () => {
  it('accepts the spec worked example', () => {
    const workflow = ok(PLACE_ORDER, { fileStem: 'place-order', aliases: ALIASES })
    expect(workflow.title).toBe('Place an order')
    expect(workflow.lifelines).toEqual(['customer', 'checkout', 'inventory', 'payment'])
    expect(workflow.steps.map((step) => step.type)).toEqual(['message', 'loop', 'alt', 'message'])
  })

  it('keys every step by its positional path', () => {
    const workflow = ok(PLACE_ORDER, { aliases: ALIASES })
    expect(flattenMessages(workflow.steps).map((step) => step.path)).toEqual([
      'steps[0]',
      'steps[1].loop.steps[0]',
      'steps[1].loop.steps[1]',
      'steps[2].alt[0].steps[0]',
      'steps[2].alt[0].steps[1]',
      'steps[2].otherwise[0]',
      'steps[3]',
    ])
  })

  it('normalises a scalar `to` and marks a list as fan-out', () => {
    const workflow = ok(PLACE_ORDER, { aliases: ALIASES })
    const messages = flattenMessages(workflow.steps)
    expect(messages[0]).toMatchObject({ to: ['checkout'], fanout: false, kind: 'call' })
    expect(messages[6]).toMatchObject({
      to: ['customer', 'inventory', 'payment'],
      fanout: true,
      kind: 'event',
      channel: 'acme.shop.order.placed.v1',
    })
  })

  it('renders a loop `max` into the fragment tab', () => {
    const workflow = ok(PLACE_ORDER, { aliases: ALIASES })
    const loop = workflow.steps[1]
    expect(loop.type).toBe('loop')
    if (loop.type === 'message') throw new Error('unreachable')
    expect(loop.tab).toBe('loop [≤ 3]')
    expect(loop.compartments[0].label).toBe('inventory answers RETRY')
  })

  it('counts `otherwise` as a compartment of the alt', () => {
    const workflow = ok(PLACE_ORDER, { aliases: ALIASES })
    const alt = workflow.steps[2]
    if (alt.type === 'message') throw new Error('unreachable')
    expect(alt.compartments.map((compartment) => compartment.label)).toEqual(['stock reserved', ''])
    expect(alt.depth).toBe(1)
  })

  it('orders lifelines by declaration first, then by first appearance', () => {
    const workflow = ok(
      `
name: partial
title: Partial participant hint
participants: [checkout]
steps:
  - message: ping
    from: customer
    to: checkout
  - message: pong
    from: checkout
    to: audit
`,
    )
    expect(workflow.lifelines).toEqual(['checkout', 'customer', 'audit'])
  })
})

/* ----------------------------------------------------------- error classes */

describe('parseWorkflow — error classes', () => {
  it('W1 E_PROTO_WF_SCHEMA — unknown top-level key', () => {
    const result = parse(`
name: x
title: X
version: 2
steps:
  - message: a
    from: p
    to: q
`)
    expect(codes(result)).toEqual(['E_PROTO_WF_SCHEMA'])
    expect(result.workflow).toBeNull()
  })

  it('W1 E_PROTO_WF_SCHEMA — an alt with a single compartment is an opt', () => {
    const result = parse(`
name: x
title: X
steps:
  - alt:
      - when: only
        steps:
          - message: a
            from: p
            to: q
`)
    expect(codes(result)).toEqual(['E_PROTO_WF_SCHEMA'])
    expect(result.issues[0].path).toBe('steps[0]')
  })

  it('W1 E_PROTO_WF_SCHEMA — unknown key on a message step', () => {
    const result = parse(`
name: x
title: X
steps:
  - message: a
    from: p
    to: q
    retries: 3
`)
    expect(codes(result)).toEqual(['E_PROTO_WF_SCHEMA'])
  })

  it('W2 E_PROTO_WF_NAME — name must equal the filename stem', () => {
    const result = parse(
      `
name: place-order
title: X
steps:
  - message: a
    from: p
    to: q
`,
      { fileStem: 'placeorder' },
    )
    expect(codes(result)).toEqual(['E_PROTO_WF_NAME'])
    expect(result.workflow?.name).toBe('place-order')
  })

  it('W3 E_PROTO_WF_STEP_SHAPE — two discriminators', () => {
    const result = parse(`
name: x
title: X
steps:
  - message: a
    from: p
    to: q
    loop:
      while: retrying
      steps:
        - message: b
          from: p
          to: q
`)
    expect(codes(result)).toEqual(['E_PROTO_WF_STEP_SHAPE'])
  })

  it('W3 E_PROTO_WF_STEP_SHAPE — no discriminator', () => {
    const result = parse(`
name: x
title: X
steps:
  - from: p
    to: q
`)
    expect(codes(result)).toEqual(['E_PROTO_WF_STEP_SHAPE'])
  })

  it('W3 E_PROTO_WF_STEP_SHAPE — `otherwise` without `alt`', () => {
    const result = parse(`
name: x
title: X
steps:
  - opt:
      when: maybe
      steps:
        - message: a
          from: p
          to: q
    otherwise:
      - message: b
        from: p
        to: q
`)
    expect(codes(result)).toEqual(['E_PROTO_WF_STEP_SHAPE'])
  })

  it('W4 E_PROTO_WF_ALIAS — an alias the protocol does not declare', () => {
    const result = parse(
      `
name: x
title: X
participants: [checkout]
steps:
  - message: stock-reserved
    from: warehouse
    to: checkout
`,
      { aliases: ['checkout', 'inventory'] },
    )
    expect(codes(result)).toEqual(['E_PROTO_WF_ALIAS'])
    expect(result.issues[0].path).toBe('steps[0].from')
  })

  it('W5 E_PROTO_WF_EMPTY_BRANCH — an empty branch and an empty root', () => {
    const branch = parse(`
name: x
title: X
steps:
  - alt:
      - when: a
        steps:
          - message: m
            from: p
            to: q
      - when: d
        steps: []
`)
    expect(codes(branch)).toEqual(['E_PROTO_WF_EMPTY_BRANCH'])

    const root = parse(`
name: x
title: X
steps: []
`)
    expect(codes(root)).toEqual(['E_PROTO_WF_EMPTY_BRANCH'])
  })

  it('W6 E_PROTO_WF_DEPTH — depth 3 is legal, depth 4 is not', () => {
    const nested = (depth: number): string => {
      let body = `- message: m
  from: p
  to: q`
      for (let level = 0; level < depth; level++) {
        body = `- opt:
    when: c${level}
    steps:
${body
  .split('\n')
  .map((line) => `      ${line}`)
  .join('\n')}`
      }
      return `name: x
title: X
steps:
${body
  .split('\n')
  .map((line) => `  ${line}`)
  .join('\n')}
`
    }

    expect(codes(parse(nested(3)))).toEqual([])
    expect(codes(parse(nested(4)))).toEqual(['E_PROTO_WF_DEPTH'])
  })

  it('W7 E_PROTO_WF_FANOUT — a list-valued `to` on a non-event step', () => {
    const result = parse(`
name: x
title: X
steps:
  - message: a
    from: p
    to: [q, r]
`)
    expect(codes(result)).toEqual(['E_PROTO_WF_FANOUT'])
    // Fail-soft: the step still renders, so the reader can see what is wrong.
    expect(flattenMessages(result.workflow!.steps)[0].to).toEqual(['q', 'r'])
  })

  it('W10 W_PROTO_WF_ORPHAN_RETURN — a return answering nothing', () => {
    const result = parse(`
name: x
title: X
steps:
  - message: stock-reserved
    from: inventory
    to: checkout
    kind: return
`)
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'W_PROTO_WF_ORPHAN_RETURN', severity: 'warning', path: 'steps[0]' }),
    ])
  })

  it('W10 — an enclosing call is visible, a sibling compartment is not', () => {
    const result = parse(`
name: x
title: X
steps:
  - message: reserve
    from: checkout
    to: inventory
  - opt:
      when: answered
      steps:
        - message: reserved
          from: inventory
          to: checkout
          kind: return
  - alt:
      - when: a
        steps:
          - message: quote
            from: checkout
            to: pricing
      - when: b
        steps:
          - message: quoted
            from: pricing
            to: checkout
            kind: return
`)
    expect(result.issues.map((issue) => issue.path)).toEqual(['steps[2].alt[1].steps[0]'])
  })

  it('reports several failures at once rather than stopping at the first', () => {
    const result = parse(
      `
name: x
title: X
steps:
  - from: p
    to: q
  - message: a
    from: nope
    to: [q, r]
`,
      { aliases: ['q', 'r'] },
    )
    expect(codes(result).sort()).toEqual(['E_PROTO_WF_ALIAS', 'E_PROTO_WF_FANOUT', 'E_PROTO_WF_STEP_SHAPE'])
  })
})

/* ---------------------------------------------------------------- payload */

describe('payload references', () => {
  const PROTOCOL = 'srn://acme/product/shop/protocol/order-placement'

  it('resolves the recommended path-absolute form', () => {
    expect(resolveWorkflowRef(PROTOCOL, '/product/shop/datamodel/order@1')).toBe(
      'srn://acme/product/shop/datamodel/order@1',
    )
  })

  it('resolves a dot-relative form from inside workflows/, one level deeper', () => {
    // Three pops leave `product/shop`: `workflows/`, the protocol name, and its
    // `protocol/` bucket — a bucket is a path segment like any other.
    expect(resolveWorkflowRef(PROTOCOL, '../../../datamodel/order@1')).toBe(
      'srn://acme/product/shop/datamodel/order@1',
    )
  })

  it('rejects the miscounted form the spec calls a trap', () => {
    // One `..` short lands on `product/shop/protocol/datamodel/order` — an odd
    // tail, i.e. a bucket where a name belongs.
    expect(() => resolveWorkflowRef(PROTOCOL, '../../datamodel/order@1')).toThrow(/E_SRN_SYNTAX/)
  })

  it('attaches the resolved SRN and a chip label to the step', () => {
    const workflow = ok(
      `
name: x
title: X
steps:
  - message: submit-order
    from: customer
    to: checkout
    payload: /product/shop/datamodel/order-request@1
`,
      { protocolSrn: PROTOCOL },
    )
    expect(flattenMessages(workflow.steps)[0]).toMatchObject({
      payload: '/product/shop/datamodel/order-request@1',
      payloadSrn: 'srn://acme/product/shop/datamodel/order-request@1',
      payloadLabel: 'order-request@1',
    })
  })

  it('reports an unresolvable payload with the SRN error class', () => {
    const result = parse(
      `
name: x
title: X
steps:
  - message: a
    from: p
    to: q
    payload: srn://other/product/shop/datamodel/order@1
`,
      { protocolSrn: PROTOCOL },
    )
    expect(codes(result)).toEqual(['E_SRN_CROSS_SOLUTION'])
  })
})

/* ----------------------------------------------------------------- layout */

function layoutOf(yaml: string) {
  return layoutWorkflow(ok(yaml, { aliases: ALIASES }))
}

function contains(outer: FragmentLayout, inner: FragmentLayout): boolean {
  return (
    inner.x > outer.x &&
    inner.x + inner.width < outer.x + outer.width &&
    inner.y >= outer.y &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

describe('layoutWorkflow — grid invariants', () => {
  const layout = layoutWorkflow(
    parse(PLACE_ORDER, { aliases: ALIASES }).workflow as Workflow,
    { label: (alias) => alias.toUpperCase() },
  )

  it('places lifelines left to right in workflow order, without overlapping headers', () => {
    expect(layout.lifelines.map((lifeline) => lifeline.alias)).toEqual([
      'customer',
      'checkout',
      'inventory',
      'payment',
    ])
    for (let i = 1; i < layout.lifelines.length; i++) {
      const previous = layout.lifelines[i - 1]
      const current = layout.lifelines[i]
      expect(current.x).toBeGreaterThan(previous.x)
      expect(current.headX).toBeGreaterThan(previous.headX + previous.headWidth)
    }
  })

  it('keeps every lifeline inside the canvas', () => {
    for (const lifeline of layout.lifelines) {
      expect(lifeline.headX).toBeGreaterThanOrEqual(0)
      expect(lifeline.headX + lifeline.headWidth).toBeLessThanOrEqual(layout.width)
      expect(lifeline.bottom).toBeLessThanOrEqual(layout.height)
    }
  })

  it('orders rows top to bottom in document order, with no overlap', () => {
    const messages = layout.messages
    expect(messages.map((message) => message.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i].rowTop).toBeGreaterThanOrEqual(messages[i - 1].rowTop + messages[i - 1].rowHeight)
      expect(messages[i].y).toBeGreaterThan(messages[i - 1].y)
    }
    const first = messages[0]
    expect(first.rowTop).toBeGreaterThan(layout.lifelines[0].headY + layout.lifelines[0].headHeight)
  })

  it('draws one arrow per fan-out target, all on one row', () => {
    const fanout = layout.messages.find((message) => message.step.fanout)
    expect(fanout).toBeDefined()
    expect(fanout!.arrows).toHaveLength(3)
    expect(new Set(fanout!.arrows.map((arrow) => arrow.y)).size).toBe(1)
    expect(fanout!.lanes).toEqual([0, 1, 2, 3])
  })

  it('anchors the payload chip under the label and carries the SRN through', () => {
    const wf = ok(PLACE_ORDER, { aliases: ALIASES, protocolSrn: 'srn://acme/product/shop/protocol/order-placement' })
    const withPayload = layoutWorkflow(wf).messages[0]
    expect(withPayload.chip).toBeDefined()
    expect(withPayload.chip!.srn).toBe('srn://acme/product/shop/datamodel/order-request@1')
    expect(withPayload.chip!.y).toBeGreaterThan(withPayload.labelY)
    expect(withPayload.chip!.y + withPayload.chip!.height).toBeLessThan(withPayload.y)
  })

  it('gives a note its own box to the right of the arrows', () => {
    const noted = layout.messages.find((message) => message.step.note)
    expect(noted?.note).toBeDefined()
    expect(noted!.note!.lines.length).toBeGreaterThan(0)
    expect(noted!.note!.x).toBeGreaterThan(noted!.note!.anchorX)
    expect(noted!.note!.x + noted!.note!.width).toBeLessThanOrEqual(layout.width)
  })

  it('boxes each fragment around the rows it owns', () => {
    expect(layout.fragments.map((fragment) => fragment.type)).toEqual(['loop', 'alt'])
    for (const fragment of layout.fragments) {
      const owned = layout.messages.filter((message) => message.path.startsWith(`${fragment.path}.`))
      expect(owned.length).toBeGreaterThan(0)
      for (const message of owned) {
        expect(message.rowTop).toBeGreaterThan(fragment.y)
        expect(message.rowTop + message.rowHeight).toBeLessThanOrEqual(fragment.y + fragment.height)
        for (const arrow of message.arrows) {
          expect(arrow.fromX).toBeGreaterThan(fragment.x)
          expect(Math.max(arrow.fromX, arrow.toX)).toBeLessThan(fragment.x + fragment.width)
        }
      }
    }
  })

  it('separates alt compartments below the first', () => {
    const alt = layout.fragments.find((fragment) => fragment.type === 'alt')!
    expect(alt.compartments.map((compartment) => compartment.label)).toEqual(['[stock reserved]', '[else]'])
    expect(alt.compartments[0].separatorY).toBeNull()
    expect(alt.compartments[1].separatorY).toBeGreaterThan(alt.compartments[0].labelY)
    expect(alt.compartments[1].separatorY).toBeLessThan(alt.y + alt.height)
  })
})

describe('layoutWorkflow — self-calls', () => {
  const layout = layoutOf(`
name: x
title: X
participants: [checkout, payment]
steps:
  - message: recalculate-total
    from: checkout
    to: checkout
  - message: charge
    from: checkout
    to: payment
`)

  it('draws the looping arrow to the right of its own lifeline', () => {
    const self = layout.messages[0]
    expect(self.arrows).toHaveLength(1)
    const [arrow] = self.arrows
    expect(arrow.self).toBe(true)
    expect(arrow.fromX).toBe(arrow.toX)
    expect(arrow.loopX).toBeGreaterThan(arrow.fromX)
    expect(arrow.loopBottomY).toBeGreaterThan(arrow.y)
    expect(self.labelAnchor).toBe('start')
    expect(self.labelX).toBeGreaterThan(arrow.loopX!)
  })

  it('reserves a taller row than a plain message', () => {
    expect(layout.messages[0].rowHeight).toBeGreaterThan(layout.messages[1].rowHeight)
  })

  it('keeps the loop and its label clear of the next lifeline', () => {
    const [arrow] = layout.messages[0].arrows
    expect(layout.lifelines[1].x).toBeGreaterThan(arrow.loopX!)
    expect(layout.lifelines[1].x).toBeGreaterThan(layout.messages[0].labelX)
  })

  it('widens the canvas when the self-call sits on the last lifeline', () => {
    const trailing = layoutOf(`
name: x
title: X
participants: [checkout, payment]
steps:
  - message: settle-internally
    from: payment
    to: payment
`)
    const last = trailing.lifelines[trailing.lifelines.length - 1]
    const [arrow] = trailing.messages[0].arrows
    expect(trailing.width).toBeGreaterThan(last.x + arrow.loopX! - arrow.fromX)
  })
})

describe('layoutWorkflow — nested fragments', () => {
  const layout = layoutOf(`
name: x
title: X
participants: [customer, checkout, inventory]
steps:
  - alt:
      - when: a
        steps:
          - loop:
              while: b
              steps:
                - opt:
                    when: c
                    steps:
                      - message: reserve-stock
                        from: checkout
                        to: inventory
      - when: d
        steps:
          - message: reject
            from: checkout
            to: customer
            kind: event
`)

  it('nests boxes strictly inside their parent', () => {
    const [alt, loop, opt] = layout.fragments
    expect([alt.type, loop.type, opt.type]).toEqual(['alt', 'loop', 'opt'])
    expect(alt.depth).toBe(1)
    expect(loop.depth).toBe(2)
    expect(opt.depth).toBe(3)
    expect(contains(alt, loop)).toBe(true)
    expect(contains(loop, opt)).toBe(true)
  })

  it('sizes the alt to span both compartments', () => {
    const [alt] = layout.fragments
    const reject = layout.messages.find((message) => message.step.message === 'reject')!
    expect(reject.rowTop).toBeGreaterThan(alt.y)
    expect(reject.rowTop + reject.rowHeight).toBeLessThanOrEqual(alt.y + alt.height)
    expect(alt.x + alt.width).toBeLessThanOrEqual(layout.width)
  })
})

/* -------------------------------------------------------------- narration */

describe('narrateWorkflow', () => {
  it('describes every step in words, numbered in document order', () => {
    const workflow = ok(PLACE_ORDER, {
      aliases: ALIASES,
      protocolSrn: 'srn://acme/product/shop/protocol/order-placement',
    })
    const lines = narrateWorkflow(workflow)

    expect(lines[0]).toMatchObject({ kind: 'message', depth: 0, index: 1 })
    expect(lines[0].text).toBe('1. customer → checkout: submit-order (call), payload order-request@1')

    expect(lines.find((line) => line.kind === 'fragment')?.text).toBe('loop [≤ 3] fragment')
    expect(lines.find((line) => line.kind === 'compartment')?.text).toBe('while inventory answers RETRY')
    expect(lines.some((line) => line.text === 'else')).toBe(true)

    const fanout = lines.at(-1)!
    expect(fanout.text).toContain('checkout → customer, inventory, payment: order-placed (event, fan-out)')
    expect(fanout.text).toContain('channel acme.shop.order.placed.v1')

    expect(lines.filter((line) => line.kind === 'message')).toHaveLength(7)
  })

  it('uses the supplied label function for participant names', () => {
    const workflow = ok(PLACE_ORDER, { aliases: ALIASES })
    const lines = narrateWorkflow(workflow, (alias) => alias.toUpperCase())
    expect(lines[0].text).toContain('CUSTOMER → CHECKOUT')
  })

  it('mentions the guard and the note', () => {
    const workflow = ok(PLACE_ORDER, { aliases: ALIASES })
    const text = narrateWorkflow(workflow)
      .map((line) => line.text)
      .join('\n')
    expect(text).toContain('guard cart total > 0')
    expect(text).toContain('note: The reservation window expired')
  })
})

describe('wrapText', () => {
  it('wraps on word boundaries and keeps long tokens intact', () => {
    expect(wrapText('the quick brown fox jumps', 10)).toEqual(['the quick', 'brown fox', 'jumps'])
    expect(wrapText('acme.shop.order.placed.v1 topic', 10)).toEqual(['acme.shop.order.placed.v1', 'topic'])
    expect(wrapText('   ', 10)).toEqual([])
  })
})

describe('layoutWorkflow — degenerate input', () => {
  it('lays out a single-lifeline workflow without collapsing', () => {
    const layout = layoutOf(`
name: x
title: X
participants: [checkout]
steps:
  - message: tick
    from: checkout
    to: checkout
`)
    expect(layout.lifelines).toHaveLength(1)
    expect(layout.width).toBeGreaterThan(layout.lifelines[0].headWidth)
    expect(layout.height).toBeGreaterThan(layout.messages[0].rowTop + layout.messages[0].rowHeight)
  })

  it('survives a step whose alias is missing from the lifelines', () => {
    const workflow: Workflow = {
      name: 'x',
      title: 'X',
      declared: [],
      lifelines: ['a'],
      steps: [
        {
          type: 'message',
          path: 'steps[0]',
          depth: 0,
          message: 'm',
          from: 'a',
          to: ['ghost'],
          fanout: false,
          kind: 'call',
        } satisfies MessageStep,
      ],
    }
    const layout = layoutWorkflow(workflow)
    expect(layout.messages).toHaveLength(1)
    expect(layout.messages[0].arrows).toHaveLength(0)
  })
})
