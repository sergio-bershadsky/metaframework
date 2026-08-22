import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import { CRITERION_MAX, parseAcceptanceCriteria, requirementDiagnostics } from './requirement'

/**
 * Two suites, split where kinds/requirement.md splits its rules: REQ4 and REQ5
 * are a body parse over one document, REQ7 and REQ8 are joins against the
 * derived inverse of `implements` and need a component that claims something.
 */

const issues = (body: string) => parseAcceptanceCriteria(body).issues
const messages = (body: string) => issues(body).map((issue) => issue.message)

const LEGAL = [
  'A client that cannot tell whether its capture arrived must be able to retry.',
  '',
  '## Acceptance criteria',
  '',
  '- **AC-1** A capture repeated with the same idempotency key charges the card once.',
  '  - **Given** a capture for order `o-1` with key `k-1` that reached the gateway',
  '  - **When** the same request is replayed within the retention window',
  '  - **Then** no second authorization reaches the gateway',
  '- **AC-2** A replay returns the original capture result, byte-identical.',
  '',
  '## Rationale',
  '',
  'Incident 2026-02-14.',
  '',
].join('\n')

/* -------------------------------------------------- REQ4 and REQ5 — the body */

describe('parseAcceptanceCriteria — REQ4 and REQ5', () => {
  it('accepts the kind document’s worked example', () => {
    const { criteria, issues: found } = parseAcceptanceCriteria(LEGAL)
    expect(found).toEqual([])
    expect(criteria).toHaveLength(2)
    expect(criteria[0].text).toContain('charges the card once')
  })

  it('keeps nested content as the criterion’s detail, not as a criterion', () => {
    // "Nested content under an item is free and preserved as that criterion's
    // detail" — three Given/When/Then lines are one criterion's detail, and
    // counting them as criteria would make every nested example a violation.
    const { criteria } = parseAcceptanceCriteria(LEGAL)
    expect(criteria[0].detail).toHaveLength(3)
    expect(criteria[1].detail).toEqual([])
  })

  it('fires E_REQ_CRITERIA when the section is absent', () => {
    expect(issues('Just a statement.\n\n## Rationale\n\nWhy.\n')).toEqual([
      {
        code: 'E_REQ_CRITERIA',
        severity: 'error',
        message: expect.stringContaining('no "## Acceptance criteria" section') as unknown as string,
      },
    ])
  })

  it('fires on the wrong casing and on the wrong level, naming what was written', () => {
    expect(messages('## Acceptance Criteria\n\n- One.\n')[0]).toContain('## Acceptance Criteria')
    expect(messages('### Acceptance criteria\n\n- One.\n')[0]).toContain('### Acceptance criteria')
  })

  it('fires when the heading appears twice', () => {
    const body = '## Acceptance criteria\n\n- One.\n\n## Acceptance criteria\n\n- Two.\n'
    expect(messages(body)[0]).toContain('appears 2 times')
  })

  it('fires when the section is empty', () => {
    expect(messages('## Acceptance criteria\n\n## Rationale\n\nWhy.\n')[0]).toContain('is empty')
  })

  it('fires when prose stands where the list should be', () => {
    const body = '## Acceptance criteria\n\nIt would have had to satisfy all of these:\n\n- One.\n'
    expect(messages(body)[0]).toContain('does not open with an unordered list')
    expect(messages(body)[0]).toContain('It would have had to satisfy')
  })

  it('fires when the section opens with something else that is not prose', () => {
    expect(messages('## Acceptance criteria\n\n1. One.\n')[0]).toContain('an ordered list')
    expect(messages('## Acceptance criteria\n\n```\n- One.\n```\n')[0]).toContain('a fenced code block')
    expect(messages('## Acceptance criteria\n\n| a | b |\n')[0]).toContain('a table')
  })

  it('fires on task-list syntax', () => {
    // Completion is not catalog data: whether an obligation is claimed is the
    // incoming `implements` edges, which cannot drift the way a box does.
    const body = '## Acceptance criteria\n\n- [ ] A capture repeated with the same key charges once.\n'
    expect(messages(body)[0]).toContain('task-list syntax')
  })

  it('fires on a criterion whose first line is longer than the cap', () => {
    const long = `- ${'x'.repeat(CRITERION_MAX + 1)}`
    const message = messages(`## Acceptance criteria\n\n- Short one.\n${long}\n`)[0]
    expect(message).toContain(`${CRITERION_MAX + 1} characters`)
  })

  it('measures the criterion, not the bullet, against the cap', () => {
    // Exactly at the cap: the marker and its space are not part of the criterion.
    expect(issues(`## Acceptance criteria\n\n- ${'x'.repeat(CRITERION_MAX)}\n`)).toEqual([])
  })

  it('measures the first physical line, so a wrapped criterion passes', () => {
    // REQ5 caps the item's *first line*, and every file in this catalog is
    // wrapped at roughly eighty columns — reading the cap as the item's whole
    // first paragraph fires on 28 of the 254 criteria the catalog ships, which
    // is a wrong check rather than a dirty catalog.
    const wrapped = ['## Acceptance criteria', '', `- ${'x'.repeat(150)}`, `  ${'y'.repeat(150)}`, ''].join('\n')
    const { criteria, issues: found } = parseAcceptanceCriteria(wrapped)
    expect(found).toEqual([])
    expect(criteria).toHaveLength(1)
    expect(criteria[0].detail).toHaveLength(1)
  })

  it('reports every offending item in one pass', () => {
    const body = [
      '## Acceptance criteria',
      '',
      `- ${'x'.repeat(CRITERION_MAX + 1)}`,
      '- [x] Done.',
      `- ${'y'.repeat(CRITERION_MAX + 2)}`,
    ].join('\n')
    expect(issues(body)).toHaveLength(3)
  })

  it('does not read a list inside a fenced block as criteria', () => {
    const body = [
      '## Acceptance criteria',
      '',
      '- The capture is idempotent.',
      '',
      '  ```markdown',
      `  - ${'x'.repeat(CRITERION_MAX + 1)}`,
      '  ```',
      '',
    ].join('\n')
    const { criteria, issues: found } = parseAcceptanceCriteria(body)
    expect(found).toEqual([])
    expect(criteria).toHaveLength(1)
  })

  it('stops the section at the next heading of any level', () => {
    const body = '## Acceptance criteria\n\n- One.\n\n### Notes\n\n- Not a criterion.\n'
    expect(parseAcceptanceCriteria(body).criteria).toHaveLength(1)
  })

  it('ignores a heading quoted inside a fence', () => {
    const body = ['```markdown', '## Acceptance criteria', '', '- Example.', '```', ''].join('\n')
    expect(messages(body)[0]).toContain('no "## Acceptance criteria" section')
  })
})

/* -------------------------------------------------- REQ7 and REQ8 — the joins */

let catalogDir: string
let catalog: Catalog
let diagnostics: Diagnostic[]

async function entity(relDir: string, frontmatter: Record<string, unknown>, prose: string) {
  const dir = path.join(catalogDir, relDir)
  await mkdir(dir, { recursive: true })
  const yaml = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
      typeof value === 'object' && value !== null
        ? `${key}:\n${JSON.stringify(value, null, 2)
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')}`
        : `${key}: ${JSON.stringify(value)}`,
    )
    .join('\n')
  await writeFile(path.join(dir, 'index.md'), `---\n${yaml}\n---\n\n${prose}`)
}

const base = (name: string, kind: string, extra: Record<string, unknown> = {}) => ({
  name,
  kind,
  version: 1,
  title: name,
  summary: `The ${name} ${kind}.`,
  status: 'approved',
  ...({
    solution: { vision: 'Sell things reliably.' },
    product: { lifecycle: 'active' },
    component: { 'component-type': 'service', lifecycle: 'released' },
    requirement: { 'requirement-type': 'functional', priority: 'must' },
  }[kind] ?? {}),
  ...extra,
})

const CRITERIA = '## Acceptance criteria\n\n- The obligation holds.\n'

const requirement = (relDir: string, name: string, extra: Record<string, unknown> = {}) =>
  entity(relDir, base(name, 'requirement', extra), CRITERIA)

/**
 * One product with four requirements and one component. `checkout` implements
 * the claimed `must` and, wrongly, the recorded non-goal.
 */
beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-requirement-'))

  await entity('acme', base('acme', 'solution'), 'Prose.\n')
  await entity('acme/product/shop', base('shop', 'product'), 'Prose.\n')

  await requirement('acme/product/shop/requirement/idem-cap', 'idem-cap')
  await requirement('acme/product/shop/requirement/guest-checkout', 'guest-checkout')
  await requirement('acme/product/shop/requirement/nice-to-have', 'nice-to-have', { priority: 'should' })
  await requirement('acme/product/shop/requirement/personalized-pricing', 'personalized-pricing', {
    priority: 'wont',
  })

  await entity(
    'acme/product/shop/component/checkout',
    base('checkout', 'component', {
      relations: {
        implements: ['/product/shop/requirement/idem-cap', '/product/shop/requirement/personalized-pricing'],
      },
    }),
    'Prose.\n',
  )

  catalog = await loadCatalog({ catalogDir })
  diagnostics = requirementDiagnostics(catalog)
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

describe('requirementDiagnostics — REQ7 and REQ8', () => {
  it('loads the fixture with no diagnostics of its own', () => {
    expect(catalog.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  })

  it('reports exactly the two findings the fixture is built for', () => {
    expect(diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.srn}`).sort()).toEqual([
      'W_REQ_UNIMPLEMENTED srn://acme/product/shop/requirement/guest-checkout',
      'W_REQ_WONT_IMPLEMENTED srn://acme/product/shop/requirement/personalized-pricing',
    ])
  })

  it('fires W_REQ_UNIMPLEMENTED on a must nothing implements', () => {
    const found = diagnostics.find((diagnostic) => diagnostic.code === 'W_REQ_UNIMPLEMENTED')
    expect(found?.severity).toBe('warning')
    expect(found?.path).toBe('acme/product/shop/requirement/guest-checkout/index.md')
  })

  it('says nothing about a must that is implemented', () => {
    expect(diagnostics.filter((diagnostic) => diagnostic.srn?.endsWith('/idem-cap'))).toEqual([])
  })

  it('says nothing about an unimplemented should', () => {
    // REQ7 is about `must` alone: a `should` the solution ships without is the
    // priority doing its job, not a gap.
    expect(diagnostics.filter((diagnostic) => diagnostic.srn?.endsWith('/nice-to-have'))).toEqual([])
  })

  it('fires W_REQ_WONT_IMPLEMENTED and names the claimant', () => {
    const found = diagnostics.find((diagnostic) => diagnostic.code === 'W_REQ_WONT_IMPLEMENTED')
    expect(found?.message).toContain('srn://acme/product/shop/component/checkout')
  })
})
