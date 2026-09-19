import { describe, expect, it } from 'vitest'
import { EDGE_MEANING } from '@/components/entity/authoring-guide'
import { EDGE_GEOMETRY, EDGE_STROKE_WORDS, EDGE_VISUAL_ORDER } from '@/lib/ui/edge-style'
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

  /* The guide draws these and the canvas draws these; one copy, so a legend can
     never quietly disagree with the picture it explains. */
  it('every edge has geometry and a spoken stroke', () => {
    for (const edge of EDGE_TYPES) {
      expect(EDGE_GEOMETRY[edge], `${edge} geometry`).toBeDefined()
      expect(EDGE_STROKE_WORDS[edge], `${edge} stroke words`).toBeTruthy()
    }
  })

  it('reading order is a permutation of the edge set, not a subset of it', () => {
    expect([...EDGE_VISUAL_ORDER].sort()).toEqual([...EDGE_TYPES].sort())
  })

  /* The distinctions the comments in edge-style.ts argue for. If one of these
     flips, the prose beside it became a lie. */
  it('keeps the distinctions the stroke vocabulary is built on', () => {
    // A public surface is the strongest claim, so it is the heaviest solid.
    expect(EDGE_GEOMETRY.exposes.dash).toBeUndefined()
    expect(EDGE_GEOMETRY.uses.dash).toBeUndefined()
    expect(EDGE_GEOMETRY.exposes.width).toBeGreaterThan(EDGE_GEOMETRY.uses.width)

    // Realizing a capability outweighs satisfying one requirement.
    expect(EDGE_GEOMETRY.realizes.width).toBeGreaterThan(EDGE_GEOMETRY.implements.width)

    // A dot trail differs in KIND from a dash: round cap, zero-length segment.
    for (const edge of ['measures', 'assumes'] as const) {
      expect(EDGE_GEOMETRY[edge].cap).toBe('round')
    }

    // An open head says nothing flows along the edge.
    expect(EDGE_GEOMETRY.measures.arrow).toBe('open')
    expect(EDGE_GEOMETRY.supersedes.arrow).toBe('open')
    expect(EDGE_GEOMETRY.assumes.arrow).toBe('open')
    expect(EDGE_GEOMETRY.uses.arrow).toBe('closed')
  })
})
