import { describe, expect, it } from 'vitest'
import { KIND_FRONTMATTER, ENTITY_KINDS, type EntityKind } from '../catalog/frontmatter'
import { LIFECYCLE_STAGES, LIFECYCLE_TAIL, lifecycleOf } from './lifecycle'

/**
 * The chip's stage meter counts bars, so an empty or stale stage list would
 * fail invisibly — it would simply light the wrong number of them. These tests
 * are what turn that into a red build.
 */

describe('LIFECYCLE_STAGES', () => {
  it('is read out of the schema, in the schema\'s order', () => {
    for (const kind of ['product', 'component'] as const) {
      const shape = (KIND_FRONTMATTER[kind] as { shape: Record<string, unknown> }).shape
      const options = (shape.lifecycle as { options: readonly string[] }).options
      expect(LIFECYCLE_STAGES[kind]).toEqual(options)
      expect(LIFECYCLE_STAGES[kind].length).toBeGreaterThan(0)
    }
  })

  it('covers exactly the kinds whose frontmatter declares the field', () => {
    const declaring = (ENTITY_KINDS as readonly EntityKind[]).filter((kind) => {
      const shape = (KIND_FRONTMATTER[kind] as { shape?: Record<string, unknown> }).shape
      return shape !== undefined && 'lifecycle' in shape
    })
    expect([...declaring].sort()).toEqual(Object.keys(LIFECYCLE_STAGES).sort())
  })

  it('keeps the two sets distinct — the field name is shared, the values are not', () => {
    expect(LIFECYCLE_STAGES.product).not.toEqual(LIFECYCLE_STAGES.component)
    // `status: deprecated` owns that word for the description; a component's
    // delivery states must never reuse it.
    expect(LIFECYCLE_STAGES.component).not.toContain('deprecated')
    // The two states the owner named as the minimum a component must express.
    expect(LIFECYCLE_STAGES.component).toContain('in-development')
    expect(LIFECYCLE_STAGES.component).toContain('released')
  })

  it('ends both sequences with exactly the shared decay tail', () => {
    // The chip draws the tail differently from the run-up, so this is load
    // bearing: a sixth component stage appended after `retired`, or a rename of
    // either word, would silently turn decay back into two more rungs of
    // progress. kinds/product.md names this tail and says it is the whole reason
    // the two kinds may share the field name.
    for (const kind of ['product', 'component'] as const) {
      expect(LIFECYCLE_STAGES[kind].slice(-LIFECYCLE_TAIL.length)).toEqual(LIFECYCLE_TAIL)
      // And nowhere else — `tailFrom` is computed as the first match, so a tail
      // word appearing early would cut the run-up short.
      for (const stage of LIFECYCLE_STAGES[kind].slice(0, -LIFECYCLE_TAIL.length)) {
        expect(LIFECYCLE_TAIL).not.toContain(stage)
      }
    }
  })
})

describe('lifecycleOf', () => {
  it('places a value in its kind\'s sequence', () => {
    expect(lifecycleOf('component', { lifecycle: 'released' })).toEqual({
      value: 'released',
      label: 'Released',
      index: LIFECYCLE_STAGES.component.indexOf('released'),
      total: LIFECYCLE_STAGES.component.length,
      tailFrom: LIFECYCLE_STAGES.component.indexOf('sunset'),
      inTail: false,
    })
  })

  it('separates the run-up from the decay tail, for both kinds', () => {
    // The bug this replaces: `released` lit 3 of 5 bars and `sunset` lit 4 of 5,
    // so the dying component read as the further-along one. Position is real;
    // "more is better" was not, and `inTail` is what the chip draws instead.
    expect(lifecycleOf('component', { lifecycle: 'sunset' })).toMatchObject({ index: 3, tailFrom: 3, inTail: true })
    expect(lifecycleOf('component', { lifecycle: 'released' })).toMatchObject({ index: 2, tailFrom: 3, inTail: false })
    expect(lifecycleOf('product', { lifecycle: 'maintenance' })).toMatchObject({ index: 3, tailFrom: 4, inTail: false })
    expect(lifecycleOf('product', { lifecycle: 'retired' })).toMatchObject({ index: 5, tailFrom: 4, inTail: true })
  })

  it('opens hyphens out rather than showing a kebab token', () => {
    expect(lifecycleOf('component', { lifecycle: 'in-development' })?.label).toBe('In development')
  })

  it('is null for a kind with no lifecycle, and for a document that carries none', () => {
    expect(lifecycleOf('protocol', { lifecycle: 'released' })).toBeNull()
    expect(lifecycleOf('component', {})).toBeNull()
    expect(lifecycleOf('component', { lifecycle: '' })).toBeNull()
  })

  it('shows an unknown value verbatim rather than inventing a place for it', () => {
    // A revision written against a contract this portal has not caught up with
    // still renders; the loader is what complains about the value.
    const stage = lifecycleOf('component', { lifecycle: 'mothballed' })
    expect(stage).toMatchObject({ value: 'mothballed', label: 'Mothballed', index: -1 })
  })
})
