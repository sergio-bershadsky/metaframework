import { describe, expect, it } from 'vitest'
import { KIND_FRONTMATTER } from '../catalog/frontmatter'
import { EDGE_TYPES, ENTITY_KINDS } from '../catalog/vocabulary'
import { RESERVED_KINDS } from '../srn/srn'

/**
 * The twelfth kind (ADR 0022). Every list it joins is closed and grows by
 * appending, so these assertions are about membership and position.
 */
describe('the assumption kind joins the closed vocabularies', () => {
  it('is a reserved word in the path grammar', () => {
    expect(RESERVED_KINDS).toContain('assumption')
  })

  it('is appended, not inserted — the list is a record of adoption order', () => {
    expect(RESERVED_KINDS[RESERVED_KINDS.length - 1]).toBe('assumption')
  })

  it('is an entity kind, which it gets for free from RESERVED_KINDS', () => {
    expect(ENTITY_KINDS).toContain('assumption')
  })

  it('brings the `assumes` edge, appended to the edge vocabulary', () => {
    expect(EDGE_TYPES).toContain('assumes')
    expect(EDGE_TYPES[EDGE_TYPES.length - 1]).toBe('assumes')
  })
})

describe('assumption frontmatter', () => {
  const parse = (extra: Record<string, unknown>) =>
    (KIND_FRONTMATTER as Record<string, { safeParse: (v: unknown) => { success: boolean } }>).assumption.safeParse(extra)

  it('accepts a standing and a review date', () => {
    expect(parse({ standing: 'holding', 'review-by': '2026-12-01' }).success).toBe(true)
  })

  it('accepts every value of the closed standing enum', () => {
    for (const standing of ['unverified', 'holding', 'broken', 'retired']) {
      expect(parse({ standing, 'review-by': '2026-12-01' }).success).toBe(true)
    }
  })

  it('rejects a standing outside the enum', () => {
    expect(parse({ standing: 'maybe', 'review-by': '2026-12-01' }).success).toBe(false)
  })

  /** Ruled at acceptance: required on every assumption, `retired` included. */
  it('requires review-by, with no exception for a retired belief', () => {
    expect(parse({ standing: 'holding' }).success).toBe(false)
    expect(parse({ standing: 'retired' }).success).toBe(false)
  })

  it('requires standing', () => {
    expect(parse({ 'review-by': '2026-12-01' }).success).toBe(false)
  })
})
