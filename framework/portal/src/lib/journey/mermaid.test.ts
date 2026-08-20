import { describe, expect, it } from 'vitest'
import { compileJourney, journeyToMermaid, type JourneyDrawStep } from './mermaid'

/**
 * The generator is the whole contract between the model and mermaid — the
 * component only pipes its output through `mermaid.render` — so the golden test
 * pins the exact text, wording and all. When it changes on purpose, the diff
 * *is* the review. Same discipline as `protocol/mermaid.test.ts`.
 */

const walk: JourneyDrawStep[] = [
  { ordinal: 1, actor: 'customer', touches: 'catalogue', band: 'shop' },
  { ordinal: 2, actor: 'customer', touches: 'checkout', via: 'order-placement', band: 'shop' },
  { ordinal: 3, actor: 'customer', touches: 'ledger', band: 'billing', crossing: true, via: 'settlement' },
  { ordinal: 4, actor: 'courier', touches: 'dispatch', band: 'logistics', crossing: true, handoff: true },
  { ordinal: 5, actor: 'courier', touches: 'catalogue', band: 'shop', crossing: true, actorCarried: true },
]

describe('compileJourney', () => {
  it('draws the walk as a banded top-down chain', () => {
    expect(journeyToMermaid(walk)).toBe(
      [
        'flowchart TD',
        '  accTitle: Journey walk',
        '  accDescr: 5 steps, in order: 1 customer at catalogue, 2 customer at checkout, 3 customer at ledger, 4 courier at dispatch, 5 courier at catalogue',
        '  subgraph jb0["shop"]',
        '    direction TB',
        '    js0("1 · customer<br/>catalogue")',
        '    js1("2 · customer<br/>checkout<br/>via order-placement")',
        '  end',
        '  subgraph jb1["billing"]',
        '    direction TB',
        '    js2("3 · customer<br/>ledger<br/>via settlement")',
        '  end',
        '  subgraph jb2["logistics"]',
        '    direction TB',
        '    js3("4 · courier<br/>dispatch")',
        '  end',
        '  subgraph jb3["shop"]',
        '    direction TB',
        '    js4("5 · courier<br/>catalogue<br/>actor-carried")',
        '  end',
        '  js0 --> js1',
        '  js1 ==> js2',
        '  js2 -- "hand-off · no protocol" --> js3',
        '  js3 -. "carried by the actor" .-> js4',
      ].join('\n'),
    )
  })

  it('reports one hop per arrow, in statement order — the join key for the SVG', () => {
    const { hops, nodeIds } = compileJourney(walk)
    expect(nodeIds).toEqual(['js0', 'js1', 'js2', 'js3', 'js4'])
    expect(hops).toEqual(['plain', 'crossing', 'gap', 'carried'])
  })

  it('bands by contiguous run, so a walk that comes back gets a second band', () => {
    // jb0 and jb3 above are both "shop": one subgraph per distinct product
    // would have folded the sequence back on itself.
    const text = journeyToMermaid(walk)
    expect(text.match(/subgraph jb\d+\["shop"\]/g)).toHaveLength(2)
  })

  it('leaves a step with no owning product outside every band', () => {
    const text = journeyToMermaid([
      { ordinal: 1, actor: 'customer', touches: 'somewhere', band: null },
      { ordinal: 2, actor: 'customer', touches: 'checkout', band: 'shop' },
    ])
    expect(text).toContain('  js0("1 · customer<br/>somewhere")')
    expect(text).not.toContain('subgraph jb0["null"]')
  })

  it('flattens what mermaid\'s lexer would otherwise read as syntax', () => {
    const text = journeyToMermaid([
      { ordinal: 1, actor: 'a"b;c', touches: 'x{y}z', band: null },
      { ordinal: 2, actor: 'plain', touches: 'plain', band: null },
    ])
    expect(text).toContain('js0("1 · a#quot;b#59;c<br/>x#123;y#125;z")')
  })

  it('emits a chain with no arrows for a single step, rather than failing', () => {
    const { text, hops } = compileJourney([{ ordinal: 1, actor: 'customer', touches: 'checkout', band: 'shop' }])
    expect(hops).toEqual([])
    expect(text).toContain('js0("1 · customer<br/>checkout")')
  })
})
