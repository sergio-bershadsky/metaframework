import { describe, expect, it } from 'vitest'
import { findMeasurements, measurementDiagnostics } from './measurements'
import type { Catalog, Entity } from './types'

/**
 * Two properties, and the second one is the whole reason this check is
 * shippable.
 *
 * *It fires on the population that actually drifted* — the shapes ADR 0018's
 * census pulled out of the catalog, quoted here verbatim rather than invented,
 * so a regression in the patterns fails against real prose.
 *
 * *And it stays silent on everything else.* A check on English sentences earns
 * its place by what it does **not** report: a target, a design constant, a
 * domain figure and a version string all read like "a number in front of a
 * noun", and a check that could not tell them apart would drown twelve real
 * findings in a hundred non-findings and be turned off inside a week. The
 * silence cases below are therefore not a courtesy suite — they are the
 * contract.
 */

function entity(partial: Partial<Entity> & Pick<Entity, 'kind' | 'body'>): Entity {
  const relDir = partial.relDir ?? 'acme/product/shop'
  return {
    srn: `srn://${relDir}`,
    parsed: { solution: 'acme', path: [], version: null } as unknown as Entity['parsed'],
    relDir,
    dir: `/tmp/${relDir}`,
    frontmatter: { name: 'x', title: 'X', kind: partial.kind, version: 1, status: 'draft', summary: '' } as Entity['frontmatter'],
    artifacts: [],
    relations: [],
    parent: null,
    children: [],
    ...partial,
  }
}

function catalogOf(...entities: Entity[]): Catalog {
  return {
    entities: new Map(entities.map((one) => [one.srn, one])),
    solutions: ['srn://acme'],
    diagnostics: [],
    inbound: new Map(),
  }
}

const codes = (...entities: Entity[]) => measurementDiagnostics(catalogOf(...entities)).map((d) => d.code)

describe('findMeasurements — what counts as a measured quantity', () => {
  it('reads a line count with no subject at all', () => {
    // `lines` is a unit only a command produces: nobody sets a target in lines.
    expect(findMeasurements('The module runs to 1,178 lines today.')).toMatchObject([
      { count: '1,178', unit: 'lines', subject: null },
    ])
  })

  it.each([
    ['commits', 'The repository is 52 commits old.'],
    ['insertions', 'It landed as 10,768 insertions.'],
    ['deletions', 'The swap was 431 deletions.'],
  ])('reads %s the same way', (unit, body) => {
    expect(findMeasurements(body)).toMatchObject([{ unit }])
  })

  it('reads a spelled-out count', () => {
    expect(findMeasurements('The server is twenty-six lines of configuration.')).toMatchObject([
      { count: 'six', unit: 'lines' },
    ])
  })

  it('takes the backticked path in front of a count as its subject', () => {
    expect(findMeasurements('`src/lib/diagrams/polar.ts` (300 lines) does the trigonometry.')).toMatchObject([
      { count: '300', unit: 'lines', subject: '`src/lib/diagrams/polar.ts`' },
    ])
  })

  it('takes the path behind a count too — both orders occur', () => {
    expect(findMeasurements('9,832 lines of `framework/spec/` say so.')).toMatchObject([
      { count: '9,832', unit: 'lines', subject: '`framework/spec/`' },
    ])
  })

  it('needs that path before a unit that doubles as a design noun', () => {
    // "three components" is the shape of most design prose in this catalog. The
    // path is the evidence that somebody ran a command instead of deciding.
    expect(findMeasurements('The kit ships three documents.')).toEqual([])
    expect(findMeasurements('`skills/_shared/references/` holds ten documents.')).toMatchObject([
      { count: 'ten', unit: 'documents', subject: '`skills/_shared/references/`' },
    ])
  })

  it('reports one finding per site, not one per pattern that matched it', () => {
    // `git.ts`, 1,178 lines is both "path then count" and "count then path".
    expect(findMeasurements('`src/lib/history/git.ts`, 1,178 lines, is the largest.')).toHaveLength(1)
  })

  it('numbers the line so an author can find the sentence', () => {
    expect(findMeasurements('One.\n\nTwo — 300 lines.\n')).toMatchObject([{ line: 3 }])
  })

  it('blanks fenced blocks rather than dropping them, so line numbers survive', () => {
    const body = 'Prose.\n\n```text\nwc -l → 895 lines\n```\n\nMore — 300 lines.\n'
    expect(findMeasurements(body)).toMatchObject([{ count: '300', line: 7 }])
  })
})

describe('findMeasurements — the silences it is built on', () => {
  it.each([
    ['an SLO', 'Availability is 99.9% over a 30d window.'],
    ['a design constant', 'A coupon code is four characters.'],
    ['a domain figure', 'Payment retries three times before giving up.'],
    ['a closed ontology', 'The ontology is eleven kinds and does not grow.'],
    ['a bare count of things', 'The product has three components and one protocol.'],
    ['a semantic version', '`transport.yaml` gains an AsyncAPI 3.1.0 document as a second dialect.'],
    ['a quoted rule', '`index.md` fixes the direction: "Where two documents disagree, the record wins."'],
    ['a count of one', 'Exactly one entry per host, on one line.'],
  ])('says nothing about %s', (_case, body) => {
    expect(findMeasurements(body)).toEqual([])
  })

  it('does not adopt a path three clauses away as a subject', () => {
    const body = '`framework/spec/structure.md` is the layout contract, and the ontology it fixes is eleven kinds.'
    expect(findMeasurements(body)).toEqual([])
  })

  it.each([
    ['at most 200 commits'],
    ['up to 200 commits'],
    ['no more than 50 commits'],
  ])('leaves a cap alone — "%s" is a decision denominated in a measured unit', (phrase) => {
    expect(findMeasurements(`The version→commit index reads ${phrase}.`)).toEqual([])
  })

  it('reads a spelled count after "the" as anaphora, not as a census', () => {
    // "the two commits" points back at two commits already named. A census never
    // arrives with a definite article in front of it.
    expect(findMeasurements('The window between the two commits is a warning.')).toEqual([])
    expect(findMeasurements('The repository is 52 commits old.')).toHaveLength(1)
  })

  it('leaves the hyphenated adjectival form to the author', () => {
    // Deliberate: that form is where the catalog's hypotheticals live, and a
    // number inside an illustration is not something anybody counted.
    expect(findMeasurements('Rejected because a 200-line schema with four `$ref`s is unreadable.')).toEqual([])
  })
})

describe('measurementDiagnostics — which bucket the number is in', () => {
  it('warns W_PROSE_MEASUREMENT on a current-state entity', () => {
    const found = measurementDiagnostics(
      catalogOf(entity({ kind: 'component', body: '`src/lib/catalog/load.ts` is 745 lines.' })),
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      code: 'W_PROSE_MEASUREMENT',
      severity: 'warning',
      path: 'acme/product/shop/index.md',
      srn: 'srn://acme/product/shop',
    })
    expect(found[0].message).toContain('line 1')
    expect(found[0].message).toContain('745 lines')
  })

  it.each(['component', 'datamodel', 'requirement', 'capability', 'solution', 'product'] as const)(
    'applies to %s — every kind that is not an adr is a current-state description',
    (kind) => {
      expect(codes(entity({ kind, body: 'It is 300 lines.' }))).toEqual(['W_PROSE_MEASUREMENT'])
    },
  )

  it('warns W_ADR_MEASUREMENT instead when the bucket is adr', () => {
    const found = measurementDiagnostics(entityCatalog('adr', 'The suite grew to 924 lines.'))
    expect(found).toMatchObject([{ code: 'W_ADR_MEASUREMENT', severity: 'warning' }])
    expect(found[0].message).toContain('MUST say when it was measured')
  })

  it('accepts an ADR measurement anchored by a commit', () => {
    const body = '## Context\n\nbrass landed as `ec0f4be` — 10,768 insertions.\n'
    expect(codes(entity({ kind: 'adr', body }))).toEqual([])
  })

  it('accepts an ADR measurement anchored by a date', () => {
    const body = '## Context\n\nMeasured 2026-08-21: the bundle is 5,072 lines.\n'
    expect(codes(entity({ kind: 'adr', body }))).toEqual([])
  })

  it('lets a heading anchor every number under it', () => {
    // How the records that get this right actually read: the commit is stated
    // once and the rows below carry bare digits.
    const body = '### The census, counted at commit `8e7a16c`\n\n- 95 lines\n- 108 lines\n'
    expect(codes(entity({ kind: 'adr', body }))).toEqual([])
  })

  it('stops the anchor at the next heading', () => {
    const body = '## Context\n\nAt `8e7a16c`, 895 lines.\n\n## Consequences\n\nNow 1,178 lines.\n'
    const found = measurementDiagnostics(entityCatalog('adr', body))
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('1,178 lines')
  })

  it('anchors an ADR that dates itself before its first heading', () => {
    const body = 'Measured 2026-08-21.\n\nThe module is 300 lines.\n\n## Context\n\nProse.\n'
    expect(codes(entity({ kind: 'adr', body }))).toEqual([])
  })

  it('says nothing at all about an entity with no measured quantity', () => {
    expect(codes(entity({ kind: 'component', body: 'The largest module in `src/lib`.' }))).toEqual([])
  })
})

function entityCatalog(kind: Entity['kind'], body: string): Catalog {
  return catalogOf(entity({ kind, body }))
}
