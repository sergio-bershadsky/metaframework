import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import { ADR_SECTIONS, adrDiagnostics, adrFrontmatterIssues, adrSectionIssues, normalizeAdrDate } from './adr'

/**
 * Two suites, split where kinds/adr.md splits its rules.
 *
 * The first drives the pure per-document functions with literal frontmatter and
 * literal bodies — ADR2, ADR3 and ADR4 are decidable from one file, so a fixture
 * on disk would add latency and hide the input. The second builds a hermetic
 * temp catalog, because neither of the remaining rules is answerable without a
 * second ADR: ADR6 needs the derived inverse of `supersedes` and ADR7 needs the
 * other names in the same bucket.
 */

const codes = (issues: Array<{ code: string }>) => issues.map((issue) => issue.code)

/* ------------------------------------------------------------ ADR2 — date */

describe('normalizeAdrDate — ADR2', () => {
  it('accepts the quoted spelling and returns it unchanged', () => {
    expect(normalizeAdrDate('2026-03-11')).toEqual({ date: '2026-03-11', reason: null })
  })

  it('accepts the YAML-native spelling and normalizes it', () => {
    // An unquoted `2026-03-11` is a YAML 1.2 timestamp and reaches the loader as
    // a Date. The kind document admits both spellings and asks the portal to
    // normalize, so this is the half a string-only schema cannot express.
    expect(normalizeAdrDate(new Date('2026-03-11T00:00:00Z'))).toEqual({ date: '2026-03-11', reason: null })
  })

  it('refuses a timestamp with a time of day', () => {
    const { date, reason } = normalizeAdrDate(new Date('2026-03-11T09:00:00Z'))
    expect(date).toBeNull()
    expect(reason).toContain('time of day')
  })

  it('refuses a non-ISO spelling', () => {
    expect(normalizeAdrDate('11/03/2026').reason).toContain('not a bare ISO-8601')
    expect(normalizeAdrDate('2026-3-11').reason).toContain('not a bare ISO-8601')
    expect(normalizeAdrDate('2026-03-11T09:00:00Z').reason).toContain('not a bare ISO-8601')
  })

  it('refuses a date the calendar does not have', () => {
    // The shape regex the loader carries today passes all three of these.
    expect(normalizeAdrDate('2026-02-30').reason).toContain('28 days')
    expect(normalizeAdrDate('2026-13-01').reason).toContain('twelve')
    expect(normalizeAdrDate('2026-04-31').reason).toContain('30 days')
  })

  it('knows the leap rule in both directions', () => {
    expect(normalizeAdrDate('2024-02-29').date).toBe('2024-02-29')
    expect(normalizeAdrDate('2000-02-29').date).toBe('2000-02-29')
    expect(normalizeAdrDate('2026-02-29').date).toBeNull()
    expect(normalizeAdrDate('1900-02-29').date).toBeNull()
  })

  it('refuses an absent date and a date that is not a scalar string', () => {
    expect(normalizeAdrDate(undefined).reason).toContain('missing')
    expect(normalizeAdrDate(2026).reason).toContain('number')
  })
})

/* ------------------------------------------ ADR2 and ADR3, as frontmatter */

const adr = (extra: Record<string, unknown> = {}) => ({
  name: '0001-event-sourcing',
  kind: 'adr',
  version: 1,
  'decision-status': 'accepted',
  date: '2026-03-11',
  deciders: ['team-commerce'],
  ...extra,
})

describe('adrFrontmatterIssues — ADR2 and ADR3', () => {
  it('says nothing about a legal ADR', () => {
    expect(adrFrontmatterIssues(adr())).toEqual([])
  })

  it('fires E_ADR_DATE on a malformed date', () => {
    expect(codes(adrFrontmatterIssues(adr({ date: '11/03/2026' })))).toEqual(['E_ADR_DATE'])
  })

  it('fires E_ADR_DECIDERS on an accepted decision with an empty list', () => {
    expect(codes(adrFrontmatterIssues(adr({ deciders: [] })))).toEqual(['E_ADR_DECIDERS'])
    expect(codes(adrFrontmatterIssues(adr({ deciders: undefined })))).toEqual(['E_ADR_DECIDERS'])
  })

  it('fires E_ADR_DECIDERS on a rejected decision too', () => {
    expect(codes(adrFrontmatterIssues(adr({ 'decision-status': 'rejected', deciders: [] })))).toEqual([
      'E_ADR_DECIDERS',
    ])
  })

  it('does not demand deciders of a proposed or superseded decision', () => {
    // ADR3 and the error class table both name `accepted` and `rejected`, and
    // only those two. A proposal has nobody accountable yet, and demanding the
    // list retroactively from a superseded record is a rule the kind document
    // does not state.
    expect(adrFrontmatterIssues(adr({ 'decision-status': 'proposed', deciders: undefined }))).toEqual([])
    expect(adrFrontmatterIssues(adr({ 'decision-status': 'superseded', deciders: undefined }))).toEqual([])
  })

  it('leaves a wrongly typed deciders to the frontmatter schema', () => {
    // A string is a shape error and stays E_FM_SCHEMA's; this class means
    // "nobody is recorded", and reporting one defect under two codes helps
    // nobody.
    expect(adrFrontmatterIssues(adr({ deciders: 'team-commerce' }))).toEqual([])
  })
})

/* --------------------------------------------------------- ADR4 — sections */

const body = (sections: string[]) => `${sections.map((section) => `## ${section}\n\nProse.\n`).join('\n')}`

describe('adrSectionIssues — ADR4', () => {
  it('accepts the four canonical sections', () => {
    expect(adrSectionIssues(body([...ADR_SECTIONS]))).toEqual([])
  })

  it('accepts them in any order, and with extra sections after', () => {
    // The kind document is explicit that order is not enforced and that any
    // number of extra level-2 sections may follow.
    expect(
      adrSectionIssues(
        body(['Consequences', 'Alternatives considered', 'Context', 'Decision', 'References', 'Migration notes']),
      ),
    ).toEqual([])
  })

  it('fires E_ADR_SECTIONS once per missing section', () => {
    const issues = adrSectionIssues(body(['Context', 'Decision']))
    expect(codes(issues)).toEqual(['E_ADR_SECTIONS', 'E_ADR_SECTIONS'])
    expect(issues[0].message).toContain('Consequences')
    expect(issues[1].message).toContain('Alternatives considered')
  })

  it('fires on a heading at the wrong level, and says which line', () => {
    const issues = adrSectionIssues(body(['Context', 'Decision', 'Consequences']) + '### Alternatives considered\n')
    expect(codes(issues)).toEqual(['E_ADR_SECTIONS'])
    expect(issues[0].message).toContain('level 3')
  })

  it('fires on altered casing, and quotes what was written', () => {
    const issues = adrSectionIssues(body(['Context', 'Decision', 'Consequences', 'Alternatives Considered']))
    expect(codes(issues)).toEqual(['E_ADR_SECTIONS'])
    expect(issues[0].message).toContain('"Alternatives Considered"')
  })

  it('does not count a section quoted inside a fenced block', () => {
    const quoted = ['## Context', '', '```markdown', '## Decision', '## Consequences', '```', ''].join('\n')
    expect(codes(adrSectionIssues(quoted))).toEqual(['E_ADR_SECTIONS', 'E_ADR_SECTIONS', 'E_ADR_SECTIONS'])
  })

  it('is structural, never a content check', () => {
    // "A draft ADR may legitimately hold `_TBD_` under a heading."
    expect(adrSectionIssues(ADR_SECTIONS.map((section) => `## ${section}\n\n_TBD_\n`).join('\n'))).toEqual([])
  })

  it('accepts a duplicated section', () => {
    // Presence is what ADR4 enforces; a section appearing twice is untidy and
    // the kind document assigns it no class.
    expect(adrSectionIssues(body([...ADR_SECTIONS, 'Context']))).toEqual([])
  })
})

/* ----------------------------------------------- ADR6 and ADR7 — the joins */

let catalogDir: string
let catalog: Catalog
let diagnostics: Diagnostic[]

const FULL_BODY = ADR_SECTIONS.map((section) => `## ${section}\n\nProse.\n`).join('\n')

async function entity(relDir: string, frontmatter: Record<string, unknown>, prose = 'Prose.\n') {
  const dir = path.join(catalogDir, relDir)
  await mkdir(dir, { recursive: true })
  const yaml = Object.entries(frontmatter)
    // An explicit `undefined` means "omit this field", not "write the word".
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
    adr: { 'decision-status': 'accepted', date: '2026-03-11', deciders: ['team-commerce'] },
  }[kind] ?? {}),
  ...extra,
})

const record = (relDir: string, name: string, extra: Record<string, unknown> = {}) =>
  entity(relDir, base(name, 'adr', extra), FULL_BODY)

/**
 * One solution with two ADR buckets. `acme/adr` holds a clean swap, an orphan
 * superseded record, and a swap caught mid-procedure; `acme/product/shop/adr`
 * holds an ordinal collision and re-uses ordinal 1, which the solution bucket
 * also uses and which must not collide across buckets.
 */
beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-adr-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/product/shop', base('shop', 'product'))

  // The clean swap: predecessor superseded, successor accepted and authoring the
  // edge. Neither is a finding.
  await record('acme/adr/0001-event-sourcing', '0001-event-sourcing', { 'decision-status': 'superseded' })
  await record('acme/adr/0009-change-data-capture', '0009-change-data-capture', {
    relations: { supersedes: ['../0001-event-sourcing'] },
  })

  // Superseded by nobody.
  await record('acme/adr/0002-orphan', '0002-orphan', { 'decision-status': 'superseded' })

  // The step-2 bump nobody made: the target is still accepted.
  await record('acme/adr/0003-still-accepted', '0003-still-accepted')
  await record('acme/adr/0004-successor', '0004-successor', {
    'decision-status': 'proposed',
    deciders: undefined,
    relations: { supersedes: ['../0003-still-accepted'] },
  })

  // Ordinal 1 twice in one bucket, and once more in the other, which is legal.
  await record('acme/product/shop/adr/0001-again', '0001-again')
  await record('acme/product/shop/adr/0001-clash', '0001-clash')

  catalog = await loadCatalog({ catalogDir })
  diagnostics = adrDiagnostics(catalog)
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

describe('adrDiagnostics — the joins', () => {
  it('loads the fixture with no diagnostics of its own', () => {
    // Nothing here is malformed in a way the loader owns; every finding below is
    // this module's.
    expect(catalog.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  })

  it('reports exactly the three findings the fixture is built for', () => {
    expect(
      diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.srn}`).sort(),
    ).toEqual([
      'W_ADR_ORDINAL srn://acme/product/shop/adr/0001-clash',
      'W_ADR_SUPERSESSION srn://acme/adr/0002-orphan',
      'W_ADR_SUPERSESSION srn://acme/adr/0003-still-accepted',
    ])
  })

  it('fires W_ADR_SUPERSESSION on a superseded ADR nothing supersedes', () => {
    const found = diagnostics.find(
      (diagnostic) => diagnostic.code === 'W_ADR_SUPERSESSION' && diagnostic.srn === 'srn://acme/adr/0002-orphan',
    )
    expect(found?.severity).toBe('warning')
    expect(found?.message).toContain('no ADR supersedes it')
    expect(found?.path).toBe('acme/adr/0002-orphan/index.md')
  })

  it('fires W_ADR_SUPERSESSION on a target that was never marked superseded', () => {
    const found = diagnostics.find(
      (diagnostic) => diagnostic.code === 'W_ADR_SUPERSESSION' && diagnostic.srn === 'srn://acme/adr/0003-still-accepted',
    )
    // The successor's own standing is in the message, because between step 1 and
    // step 2 of the swap this state is legitimate and a reader has to be able to
    // tell a decision in flight from a bump nobody made.
    expect(found?.message).toContain('srn://acme/adr/0004-successor (proposed)')
    expect(found?.message).toContain('"accepted"')
  })

  it('says nothing about either side of a completed swap', () => {
    const swap = ['srn://acme/adr/0001-event-sourcing', 'srn://acme/adr/0009-change-data-capture']
    expect(diagnostics.filter((diagnostic) => swap.includes(diagnostic.srn ?? ''))).toEqual([])
  })

  it('fires W_ADR_ORDINAL on the later of two ADRs sharing an ordinal', () => {
    const found = diagnostics.find((diagnostic) => diagnostic.code === 'W_ADR_ORDINAL')
    expect(found?.srn).toBe('srn://acme/product/shop/adr/0001-clash')
    expect(found?.message).toContain('0001-again')
  })

  it('does not collide ordinals across buckets', () => {
    // `srn://acme/adr/0001-event-sourcing` and
    // `srn://acme/product/shop/adr/0001-again` are two different ADR-0001s, and
    // the SRN already tells them apart.
    expect(
      diagnostics.filter(
        (diagnostic) => diagnostic.code === 'W_ADR_ORDINAL' && diagnostic.srn === 'srn://acme/adr/0001-event-sourcing',
      ),
    ).toEqual([])
  })
})
