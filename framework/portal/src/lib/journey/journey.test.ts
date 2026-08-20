import { describe, expect, it } from 'vitest'
import { MAX_JOURNEY_STEPS, MIN_JOURNEY_STEPS, journeySummary, owningProductOf, parseJourney } from './journey'

/**
 * The parser is the executable copy of the journey.yaml mini-spec
 * (framework/spec/kinds/journey.md), so every rule it owns — JRN5 to JRN8, plus
 * the two of JRN13/JRN14 that need only the grammar — is pinned by code class,
 * not by message text.
 */

const SRN = 'srn://acme/journey/place-an-order'

function file(steps: unknown[], name = 'place-an-order') {
  return { name, steps }
}

const shopStep = {
  actor: '/actor/customer',
  touches: '/product/shop/component/checkout',
}

const billingStep = {
  actor: '/actor/customer',
  touches: '/product/billing/component/ledger',
}

function codes(issues: ReadonlyArray<{ code: string }>): string[] {
  return issues.map((issue) => issue.code)
}

describe('parseJourney', () => {
  it('accepts a two-step walk and numbers the steps from one', () => {
    const { journey, issues } = parseJourney(file([shopStep, { ...shopStep, touches: '/product/shop' }]), {
      entityName: 'place-an-order',
      journeySrn: SRN,
    })

    expect(issues).toEqual([])
    expect(journey?.steps.map((step) => step.ordinal)).toEqual([1, 2])
    expect(journey?.steps.map((step) => step.path)).toEqual(['steps[0]', 'steps[1]'])
    expect(journey?.steps[0].touchesSrn).toBe('srn://acme/product/shop/component/checkout')
  })

  it('rejects a file whose name is not the entity directory name', () => {
    const { issues } = parseJourney(file([shopStep, billingStep], 'return-a-parcel'), {
      entityName: 'place-an-order',
      journeySrn: SRN,
    })
    expect(codes(issues)).toContain('E_JRN_NAME')
  })

  it('rejects both ends of the step cap, and the bounds are errors', () => {
    const one = parseJourney(file([shopStep]), { journeySrn: SRN })
    expect(codes(one.issues)).toContain('E_JRN_STEP_COUNT')
    expect(one.issues.every((issue) => issue.severity === 'error')).toBe(true)

    const many = parseJourney(
      file(Array.from({ length: MAX_JOURNEY_STEPS + 1 }, () => shopStep)),
      { journeySrn: SRN },
    )
    expect(codes(many.issues)).toContain('E_JRN_STEP_COUNT')
    // Surplus steps are still parsed: hiding them would hide the reason.
    expect(many.journey?.steps).toHaveLength(MAX_JOURNEY_STEPS + 1)
  })

  it('gives a branch-shaped key its own class, because the code is the lesson', () => {
    const { issues } = parseJourney(
      file([shopStep, { ...billingStep, alt: [{ when: 'card declined', steps: [] }] }]),
      { journeySrn: SRN },
    )
    expect(codes(issues)).toContain('E_JRN_BRANCH')
    expect(codes(issues)).not.toContain('E_JRN_SCHEMA')
  })

  it('tolerates x- keys at both levels and rejects every other unknown one', () => {
    const { issues } = parseJourney(
      { name: 'place-an-order', 'x-source': 'workshop', steps: [{ ...shopStep, 'x-lane': 2 }, billingStep] },
      { journeySrn: SRN },
    )
    expect(codes(issues).filter((code) => code === 'E_JRN_SCHEMA')).toEqual([])

    const rejected = parseJourney(file([{ ...shopStep, channel: 'mobile' }, billingStep]), { journeySrn: SRN })
    expect(codes(rejected.issues)).toContain('E_JRN_SCHEMA')
  })

  it('detects a product crossing from the SRN grammar alone, and flags an undocumented one', () => {
    const { journey, issues } = parseJourney(file([shopStep, billingStep]), { journeySrn: SRN })

    expect(journey?.steps.map((step) => step.owningProduct)).toEqual(['product/shop', 'product/billing'])
    expect(journey?.steps.map((step) => step.crossing)).toEqual([false, true])
    expect(journey?.crossings).toEqual({ total: 1, undocumented: 1 })
    expect(codes(issues)).toContain('W_JRN_UNDOCUMENTED_INTEGRATION')
  })

  it('silences the crossing warning for a named protocol and for the documented negative', () => {
    const named = parseJourney(file([shopStep, { ...billingStep, protocol: '/protocol/settlement' }]), {
      journeySrn: SRN,
    })
    expect(codes(named.issues)).not.toContain('W_JRN_UNDOCUMENTED_INTEGRATION')
    expect(named.journey?.steps[1].protocolLabel).toBe('settlement')
    expect(named.journey?.steps[1].protocolNone).toBe(false)

    const carried = parseJourney(file([shopStep, { ...billingStep, protocol: 'none' }]), { journeySrn: SRN })
    expect(codes(carried.issues)).not.toContain('W_JRN_UNDOCUMENTED_INTEGRATION')
    expect(carried.journey?.steps[1].protocolNone).toBe(true)
    // `none` is a claim, not a reference — it must never resolve to an entity.
    expect(carried.journey?.steps[1].protocolSrn).toBeUndefined()
  })

  it('warns when the frontmatter protagonist takes none of the steps', () => {
    const absent = parseJourney(file([shopStep, billingStep]), {
      journeySrn: SRN,
      protagonist: '/actor/courier',
    })
    expect(codes(absent.issues)).toContain('W_JRN_ACTOR_ABSENT')

    // The comparison is between resolved SRNs, so the relative and absolute
    // spellings of one actor are the same actor.
    const present = parseJourney(file([shopStep, billingStep]), {
      journeySrn: SRN,
      protagonist: 'srn://acme/actor/customer',
    })
    expect(codes(present.issues)).not.toContain('W_JRN_ACTOR_ABSENT')
  })

  it('marks a hand-off on the step that changes actor', () => {
    const { journey } = parseJourney(
      file([shopStep, { ...shopStep, actor: '/actor/courier' }, { ...shopStep, actor: '/actor/courier' }]),
      { journeySrn: SRN },
    )
    expect(journey?.steps.map((step) => step.handoff)).toEqual([false, true, false])
    expect(journey?.actors).toEqual(['/actor/customer', '/actor/courier'])
  })

  it('returns no journey at all only when the file shape is unusable', () => {
    expect(parseJourney({ steps: [] }).journey).toBeNull() // no name
    expect(parseJourney('not a mapping').journey).toBeNull()
    expect(parseJourney(file([shopStep, billingStep])).journey).not.toBeNull()
  })
})

describe('owningProductOf', () => {
  it('takes the product pair at the head of the chain, however deep the target', () => {
    expect(owningProductOf('srn://acme/product/shop')).toBe('product/shop')
    expect(owningProductOf('srn://acme/product/shop/component/checkout')).toBe('product/shop')
    expect(owningProductOf('srn://acme/product/shop/component/checkout/component/payment')).toBe('product/shop')
  })

  it('is null where no product owns the target, rather than guessing', () => {
    expect(owningProductOf('srn://acme/actor/customer')).toBeNull()
    expect(owningProductOf('srn://acme')).toBeNull()
    expect(owningProductOf('not an srn')).toBeNull()
  })
})

describe('journeySummary', () => {
  it('is the walk in words — the only thing a screen reader gets', () => {
    const { journey } = parseJourney(
      file([shopStep, { ...billingStep, actor: '/actor/courier', note: 'Settles the order.' }]),
      { journeySrn: SRN },
    )
    const summary = journeySummary(journey!)

    expect(summary.headline).toContain('2 steps')
    expect(summary.headline).toContain('customer and courier')
    expect(summary.headline).toContain('1 product boundary')
    expect(summary.steps).toEqual([
      '1. customer at checkout',
      '2. courier at ledger — Settles the order.',
    ])
  })
})

describe('the step cap', () => {
  it('is 2 to 12 — the bounds kinds/journey.md states', () => {
    expect([MIN_JOURNEY_STEPS, MAX_JOURNEY_STEPS]).toEqual([2, 12])
  })
})
