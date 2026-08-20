import { describe, expect, it } from 'vitest'
import {
  EDGE_SOURCE_KINDS,
  EDGE_TARGET_KINDS,
  EDGE_TYPES,
  ENTITY_KINDS,
  KIND_FRONTMATTER,
  kindDiagnostics,
  kindFieldNames,
} from './frontmatter'
import { RESERVED_KINDS } from '../srn/srn'

/**
 * The frontmatter contract as a unit, without a catalog on disk. `load.test.ts`
 * covers what the loader *does* with these; this file covers what they *say*.
 */

describe('ENTITY_KINDS', () => {
  it('is the reserved buckets plus solution, and lists nothing twice', () => {
    // This exact spot has produced a real defect: product and component were
    // once written out here as well as being reserved words, so the kind filter
    // offered them twice and solution cards double-counted every one of them.
    // Deriving is the fix; the assertion is what keeps it derived.
    expect(ENTITY_KINDS).toEqual(['solution', ...RESERVED_KINDS])
    expect(new Set(ENTITY_KINDS).size).toBe(ENTITY_KINDS.length)
  })

  it('picks up a newly reserved kind without being edited', () => {
    for (const kind of ['capability', 'journey', 'metric'] as const) {
      expect(ENTITY_KINDS).toContain(kind)
      expect(ENTITY_KINDS.filter((k) => k === kind)).toHaveLength(1)
    }
  })

  it('gives every kind a frontmatter layer, so no kind is validated by accident', () => {
    expect(Object.keys(KIND_FRONTMATTER).sort()).toEqual([...ENTITY_KINDS].sort())
  })
})

describe('edge table', () => {
  it('grows by appending — an earlier edge never moves for a later one', () => {
    expect(EDGE_TYPES.slice(0, 5)).toEqual(['uses', 'exposes', 'depends-on', 'implements', 'supersedes'])
    expect(EDGE_TYPES.slice(5)).toEqual(['realizes', 'measures'])
    expect(new Set(EDGE_TYPES).size).toBe(EDGE_TYPES.length)
  })

  it('states a source rule and a target rule for every edge', () => {
    for (const edge of EDGE_TYPES) {
      expect(EDGE_SOURCE_KINDS[edge], edge).toBeDefined()
      expect(EDGE_TARGET_KINDS[edge], edge).toBeDefined()
    }
  })

  it('lets only the kinds that ship something realize a capability', () => {
    expect(EDGE_SOURCE_KINDS.realizes).toEqual(['product', 'component'])
    expect(EDGE_TARGET_KINDS.realizes).toEqual(['capability'])
  })

  it('makes "measures" the metric’s own edge and nothing else’s', () => {
    expect(EDGE_SOURCE_KINDS.measures).toEqual(['metric'])
    expect(EDGE_TARGET_KINDS.measures).toEqual(['capability', 'component', 'protocol', 'requirement'])
  })

  it('names no inverse edge — those are derived, never authored', () => {
    for (const edge of EDGE_TYPES) expect(edge).not.toMatch(/-by$/)
  })
})

describe('component lifecycle', () => {
  const parse = (value: unknown) =>
    KIND_FRONTMATTER.component.safeParse({ 'component-type': 'service', lifecycle: value })

  it('is required — a component is a built thing and must say what state it is built in', () => {
    expect(KIND_FRONTMATTER.component.safeParse({ 'component-type': 'service' }).success).toBe(false)
  })

  it('accepts the delivery states a component actually passes through', () => {
    for (const value of ['planned', 'in-development', 'released', 'sunset', 'retired']) {
      expect(parse(value).success, value).toBe(true)
    }
  })

  it('does not borrow product’s investment states', () => {
    // `concept`/`incubating`/`active` answer "is this a committed bet?", which
    // is a portfolio question. A component inside a funded product is not a bet.
    for (const value of ['concept', 'incubating', 'active', 'maintenance']) {
      expect(parse(value).success, value).toBe(false)
    }
  })

  it('never overlaps status — the two axes cross', () => {
    // An approved description of an unbuilt component is the design-first
    // normal case, so no status word may leak into the lifecycle enum.
    for (const value of ['draft', 'review', 'approved', 'deprecated']) {
      expect(parse(value).success, value).toBe(false)
    }
  })

  it('leaves lifecycle off every kind that is not built or positioned', () => {
    expect(kindFieldNames('component')).toContain('lifecycle')
    expect(kindFieldNames('product')).toContain('lifecycle')
    for (const kind of ['datamodel', 'protocol', 'actor', 'capability', 'journey', 'metric'] as const) {
      expect(kindFieldNames(kind), kind).not.toContain('lifecycle')
    }
  })
})

describe('capability and journey frontmatter', () => {
  it('gives a capability nothing on top of the common contract', () => {
    // kinds/capability.md rejects every candidate by one test: does some portal
    // behaviour or validation rule change with the value? None did. `maturity`
    // is the field somebody will reach for, and it is a measurement — which has
    // a kind of its own.
    expect(kindFieldNames('capability')).toEqual([])
  })

  it('gives a journey exactly one — its protagonist', () => {
    // The steps are the substance and they live in journey.yaml; the actor is
    // the defining relationship, and the catalog list and actor page need it
    // without parsing a second file.
    expect(kindFieldNames('journey')).toEqual(['actor'])
    expect(KIND_FRONTMATTER.journey.safeParse({ actor: '/actor/customer' }).success).toBe(true)
    expect(KIND_FRONTMATTER.journey.safeParse({}).success).toBe(false)
    expect(KIND_FRONTMATTER.journey.safeParse({ actor: ['/actor/customer'] }).success).toBe(false)
  })
})

describe('metric frontmatter', () => {
  const metric = (extra: Record<string, unknown> = {}) =>
    KIND_FRONTMATTER.metric.safeParse({
      'metric-type': 'ratio',
      target: '99.9%',
      window: '30d',
      direction: 'higher-is-better',
      ...extra,
    })

  it('accepts a well-formed metric', () => {
    expect(metric().success).toBe(true)
  })

  it('requires all four fields — three of the four is not under-specified, it is unusable', () => {
    expect(kindFieldNames('metric').sort()).toEqual(['direction', 'metric-type', 'target', 'window'])
    for (const field of ['metric-type', 'target', 'window', 'direction']) {
      expect(metric({ [field]: undefined }).success, field).toBe(false)
    }
  })

  it('closes metric-type over four literal grammars', () => {
    for (const value of ['ratio', 'duration', 'count', 'amount']) {
      expect(metric({ 'metric-type': value }).success, value).toBe(true)
    }
    // `percentage` is a ratio and `rate` is a count over a window that `window`
    // already carries — both are E_FM_SCHEMA, not a fifth value.
    for (const value of ['percentage', 'rate', 'score']) {
      expect(metric({ 'metric-type': value }).success, value).toBe(false)
    }
  })

  it('takes target and window as strings, so an unquoted count fails as a type error', () => {
    // The one case quoting is load-bearing for: YAML turns 1200 into an integer
    // before validation ever sees it.
    expect(metric({ target: 1200 }).success).toBe(false)
    expect(metric({ 'metric-type': 'count', target: '1200' }).success).toBe(true)
  })

  it('spells the direction out, because "higher" alone invites "than what?"', () => {
    expect(metric({ direction: 'lower-is-better' }).success).toBe(true)
    expect(metric({ direction: 'higher' }).success).toBe(false)
  })
})

describe('metric literal grammars', () => {
  const issues = (extra: Record<string, unknown>) =>
    kindDiagnostics('metric', {
      'metric-type': 'ratio',
      target: '99.9%',
      window: '30d',
      direction: 'higher-is-better',
      ...extra,
    }).map((issue) => issue.code)

  it('passes a literal of the grammar its metric-type selects', () => {
    expect(issues({})).toEqual([])
    expect(issues({ 'metric-type': 'duration', target: '400ms' })).toEqual([])
    expect(issues({ 'metric-type': 'count', target: '1200' })).toEqual([])
    expect(issues({ 'metric-type': 'amount', target: '12.50 EUR' })).toEqual([])
  })

  it('insists a ratio carry its % — 0.999 is unreadable without it', () => {
    expect(issues({ target: '99.9' })).toEqual(['E_MET_TARGET'])
  })

  it('stops durations at days, because a month is not a fixed duration', () => {
    expect(issues({ 'metric-type': 'duration', target: '7d' })).toEqual([])
    expect(issues({ 'metric-type': 'duration', target: '1mo' })).toEqual(['E_MET_TARGET'])
  })

  it('makes count the only signed literal', () => {
    // A bounded index that goes below zero — NPS is the standing example — is a
    // count. A negative duration, ratio or amount is not a thing.
    expect(issues({ 'metric-type': 'count', target: '-20' })).toEqual([])
    expect(issues({ 'metric-type': 'duration', target: '-400ms' })).toEqual(['E_MET_TARGET'])
    expect(issues({ target: '-5%' })).toEqual(['E_MET_TARGET'])
  })

  it('takes money as a code and a space, never a symbol', () => {
    expect(issues({ 'metric-type': 'amount', target: '€12.50' })).toEqual(['E_MET_TARGET'])
    expect(issues({ 'metric-type': 'amount', target: '12.50 eur' })).toEqual(['E_MET_TARGET'])
  })

  it('judges a target only against a grammar its type actually selects', () => {
    // A bad enum is already E_FM_SCHEMA; saying so twice helps nobody.
    expect(issues({ 'metric-type': 'percentage', target: 'whatever' })).toEqual([])
  })

  it('accepts instant or a rolling window, and no calendar period', () => {
    for (const window of ['instant', '30d', '5m', '1h', '250ms', '1.5s']) {
      expect(issues({ window }), window).toEqual([])
    }
    for (const window of ['1 month', 'calendar-month', 'P30D', '30', 'monthly', '1w']) {
      expect(issues({ window }), window).toEqual(['E_MET_WINDOW'])
    }
  })

  it('reports target and window independently — two fields, two codes', () => {
    expect(issues({ target: '99.9', window: 'monthly' })).toEqual(['E_MET_TARGET', 'E_MET_WINDOW'])
  })

  it('has nothing to say about the kinds whose whole contract is their schema', () => {
    for (const kind of ['capability', 'journey', 'component', 'product'] as const) {
      expect(kindDiagnostics(kind, {}), kind).toEqual([])
    }
  })
})
