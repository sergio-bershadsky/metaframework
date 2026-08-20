import { describe, expect, it } from 'vitest'
import { KIND_FRONTMATTER, ENTITY_KINDS, type EntityKind } from '../catalog/frontmatter'
import { LIFECYCLE_STAGES, lifecycleOf } from './lifecycle'

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
})

describe('lifecycleOf', () => {
  it('places a value in its kind\'s sequence', () => {
    expect(lifecycleOf('component', { lifecycle: 'released' })).toEqual({
      value: 'released',
      label: 'Released',
      index: LIFECYCLE_STAGES.component.indexOf('released'),
      total: LIFECYCLE_STAGES.component.length,
    })
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
