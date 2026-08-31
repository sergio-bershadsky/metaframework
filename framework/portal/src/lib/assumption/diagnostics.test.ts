import { describe, expect, it } from 'vitest'
import type { Catalog, Entity } from '../catalog/types'
import { assumptionDiagnostics } from './diagnostics'

const BODY = '## Basis\n\nBecause.\n\n## If this is false\n\nThings break.\n'

function entity(over: Partial<Entity> & { srn: string }): Entity {
  return {
    kind: 'assumption',
    relDir: over.srn.replace('srn://', ''),
    dir: '/tmp',
    body: BODY,
    artifacts: [],
    parsed: {} as Entity['parsed'],
    frontmatter: { standing: 'holding', 'review-by': '2099-01-01' } as unknown as Entity['frontmatter'],
    ...over,
  } as Entity
}

/**
 * Builds `inbound` the way the loader does — from resolved edges — because that
 * is the map the module reads. A fixture that skipped it would test a shape the
 * portal never produces.
 */
const catalog = (...entities: Entity[]): Catalog => {
  const inbound = new Map<string, Array<{ edge: string; from: string }>>()
  for (const e of entities) {
    const rel = (e.frontmatter as unknown as { relations?: Record<string, string[]> }).relations
    for (const target of rel?.assumes ?? []) {
      const list = inbound.get(target) ?? []
      list.push({ edge: 'assumes', from: e.srn })
      inbound.set(target, list)
    }
  }
  return { entities: new Map(entities.map((e) => [e.srn, e])), diagnostics: [], inbound } as unknown as Catalog
}

const codes = (c: Catalog) => assumptionDiagnostics(c).map((d) => d.code)

/** A6: the reverse index, reported as a diagnostic. The reason the kind exists. */
describe('W_ASM_BROKEN_DEPENDENT', () => {
  const broken = entity({
    srn: 'srn://acme/assumption/settles',
    frontmatter: { standing: 'broken', 'review-by': '2099-01-01' } as unknown as Entity['frontmatter'],
  })
  const dependent = entity({
    srn: 'srn://acme/product/billing',
    kind: 'product',
    frontmatter: {
      standing: undefined,
      relations: { assumes: ['srn://acme/assumption/settles'] },
    } as unknown as Entity['frontmatter'],
  })

  it('reports every entity that still rests on a broken belief', () => {
    expect(codes(catalog(broken, dependent))).toContain('W_ASM_BROKEN_DEPENDENT')
  })

  it('names the dependent, not the assumption — that is who must act', () => {
    const found = assumptionDiagnostics(catalog(broken, dependent)).find(
      (d) => d.code === 'W_ASM_BROKEN_DEPENDENT',
    )
    expect(found?.srn).toBe('srn://acme/product/billing')
  })

  it('is silent while the belief still holds', () => {
    const holding = entity({ srn: 'srn://acme/assumption/settles' })
    expect(codes(catalog(holding, dependent))).not.toContain('W_ASM_BROKEN_DEPENDENT')
  })
})

describe('W_ASM_ORPHAN', () => {
  it('reports a belief nothing rests on', () => {
    expect(codes(catalog(entity({ srn: 'srn://acme/assumption/lonely' })))).toContain('W_ASM_ORPHAN')
  })

  it('is silent once something assumes it', () => {
    const a = entity({ srn: 'srn://acme/assumption/lonely' })
    const d = entity({
      srn: 'srn://acme/product/x',
      kind: 'product',
      frontmatter: { relations: { assumes: ['srn://acme/assumption/lonely'] } } as unknown as Entity['frontmatter'],
    })
    expect(codes(catalog(a, d))).not.toContain('W_ASM_ORPHAN')
  })
})

describe('W_ASM_STALE', () => {
  const past = (standing: string) =>
    entity({
      srn: 'srn://acme/assumption/old',
      frontmatter: { standing, 'review-by': '2000-01-01' } as unknown as Entity['frontmatter'],
    })

  it('reports a live belief past its review date', () => {
    for (const standing of ['unverified', 'holding']) {
      expect(codes(catalog(past(standing)))).toContain('W_ASM_STALE')
    }
  })

  /** A resolved belief is not stale — it has already been answered. */
  it('is silent for a broken or retired belief', () => {
    for (const standing of ['broken', 'retired']) {
      expect(codes(catalog(past(standing)))).not.toContain('W_ASM_STALE')
    }
  })
})

describe('E_ASM_REVIEW_DATE', () => {
  it('rejects a review-by that is not an ISO calendar date', () => {
    for (const bad of ['soon', '2026-13-01', '01/01/2026', 2026]) {
      const e = entity({
        srn: 'srn://acme/assumption/bad',
        frontmatter: { standing: 'holding', 'review-by': bad } as unknown as Entity['frontmatter'],
      })
      expect(codes(catalog(e)), String(bad)).toContain('E_ASM_REVIEW_DATE')
    }
  })

  it('accepts a real date', () => {
    expect(codes(catalog(entity({ srn: 'srn://acme/assumption/ok' })))).not.toContain('E_ASM_REVIEW_DATE')
  })
})

describe('E_ASM_SECTIONS', () => {
  const withBody = (body: string) => entity({ srn: 'srn://acme/assumption/b', body })

  it('reports a missing required section', () => {
    expect(codes(catalog(withBody('## Basis\n\nonly one.\n')))).toContain('E_ASM_SECTIONS')
  })

  it('reports a section written at the wrong level', () => {
    expect(codes(catalog(withBody('## Basis\n\n### If this is false\n')))).toContain('E_ASM_SECTIONS')
  })

  it('is silent when both are present at level 2', () => {
    expect(codes(catalog(withBody(BODY)))).not.toContain('E_ASM_SECTIONS')
  })
})
