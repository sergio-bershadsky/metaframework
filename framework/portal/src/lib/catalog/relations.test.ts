import { describe, expect, it } from 'vitest'
import { EDGE_MEANING } from '@/components/entity/authoring-guide'
import {
  EDGE_INVERSES,
  EDGE_SOURCE_KINDS,
  EDGE_TARGET_KINDS,
  EDGE_TYPES,
  ENTITY_KINDS,
} from './vocabulary'

/**
 * The edge vocabulary is what the console's authoring guide explains, so it has
 * to be readable without dragging zod into the browser — the same reason the
 * lifecycle arrays live in ./vocabulary. These assertions exist so the maps, the
 * guide's prose and the loader can never drift apart.
 */
describe('edge vocabulary', () => {
  it('is the eight edges, in the spec’s adoption order', () => {
    expect(EDGE_TYPES).toEqual([
      'uses', 'exposes', 'depends-on', 'implements',
      'supersedes', 'realizes', 'measures', 'assumes',
    ])
  })

  /* Every map is total. A new edge that reached EDGE_TYPES and nothing else
     would render a row with no ends and no sentence, which is the failure the
     guide's `?? no note yet` fallback admits it cannot catch on its own. */
  it('every edge declares a source set, a target set, an inverse and a meaning', () => {
    for (const edge of EDGE_TYPES) {
      expect(EDGE_SOURCE_KINDS[edge], `${edge} source`).toBeDefined()
      expect(EDGE_TARGET_KINDS[edge], `${edge} target`).toBeDefined()
      expect(EDGE_INVERSES[edge], `${edge} inverse`).toBeTruthy()
      expect(EDGE_MEANING[edge], `${edge} meaning`).toBeTruthy()
    }
  })

  it('names one inverse per edge, and they are distinct', () => {
    const inverses = Object.values(EDGE_INVERSES)
    expect(inverses).toHaveLength(EDGE_TYPES.length)
    expect(new Set(inverses).size).toBe(EDGE_TYPES.length)
  })

  /* The whole point of the section: an inverse is derived, so it must never be
     a thing an author could type into `relations`. */
  it('no inverse collides with an authored edge name', () => {
    for (const inverse of Object.values(EDGE_INVERSES)) {
      expect(EDGE_TYPES).not.toContain(inverse)
    }
  })

  it('every declared kind is a real kind', () => {
    for (const edge of EDGE_TYPES) {
      const source = EDGE_SOURCE_KINDS[edge]
      if (source !== 'any') for (const kind of source) expect(ENTITY_KINDS).toContain(kind)
      const target = EDGE_TARGET_KINDS[edge]
      if (target !== 'same-as-source') for (const kind of target) expect(ENTITY_KINDS).toContain(kind)
    }
  })

  /** ADR 0022: anything may rest on a belief, except another belief. */
  it('refuses an assumption that assumes', () => {
    expect(EDGE_SOURCE_KINDS.assumes).not.toContain('assumption')
    expect(EDGE_TARGET_KINDS.assumes).toEqual(['assumption'])
  })

  /** `measures` is the metric's own edge and nothing else's. */
  it('lets only a metric measure', () => {
    expect(EDGE_SOURCE_KINDS.measures).toEqual(['metric'])
  })
})
