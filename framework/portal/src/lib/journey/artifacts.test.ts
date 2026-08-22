import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import {
  type DirectoryEntry,
  journeyArtifactDiagnostics,
  journeyDirectoryIssues,
  journeyProtocolIssues,
} from './artifacts'
import { parseJourney } from './journey'

/**
 * Two suites, split where the inputs split.
 *
 * `journeyDirectoryIssues` is a pure function of a directory listing, so it is
 * driven with literal listings — a temp directory would add latency and prove
 * nothing the array does not. `journeyProtocolIssues` needs a protocol with a
 * participant list, which is a second entity, so the second suite builds a
 * hermetic temp catalog and runs the same `loadCatalog` the portal runs.
 *
 * Every code gets both halves: one input that fires it, and one legal input that
 * must stay silent. A check that cannot go green is as useless as one that
 * cannot go red — the shipped catalogs are exemplars, and every rule here has to
 * be quiet on them.
 */

const codes = (issues: Array<{ code: string }>) => issues.map((issue) => issue.code)

const file = (name: string): DirectoryEntry => ({ name, directory: false })
const dir = (name: string): DirectoryEntry => ({ name, directory: true })

/* ------------------------------------------------------- JRN4 and JRN9 */

describe('journeyDirectoryIssues — the entity directory (JRN4, JRN9)', () => {
  it('accepts the kind document’s two-file directory', () => {
    expect(journeyDirectoryIssues([file('index.md'), file('journey.yaml')])).toEqual([])
  })

  it('accepts a *.md prose sibling, which carries no machine semantics', () => {
    expect(journeyDirectoryIssues([file('index.md'), file('journey.yaml'), file('research-notes.md')])).toEqual([])
  })

  it('fires E_JRN_ARTIFACT_MISSING when journey.yaml is absent', () => {
    const issues = journeyDirectoryIssues([file('index.md')])
    expect(codes(issues)).toEqual(['E_JRN_ARTIFACT_MISSING'])
    expect(issues[0].severity).toBe('error')
    expect(issues[0].path).toBe('')
  })

  it('fires both codes on the near-miss filename — it is absent AND unrecognised', () => {
    // The failure the fixed bare name exists to prevent: the author believes the
    // path is authored and the portal has never read it.
    expect(codes(journeyDirectoryIssues([file('index.md'), file('journey.yml')]))).toEqual([
      'E_JRN_ARTIFACT_MISSING',
      'W_JRN_ARTIFACT_UNKNOWN',
    ])
    expect(codes(journeyDirectoryIssues([file('index.md'), file('place-an-order.yaml')]))).toEqual([
      'E_JRN_ARTIFACT_MISSING',
      'W_JRN_ARTIFACT_UNKNOWN',
    ])
  })

  it('fires W_JRN_ARTIFACT_UNKNOWN on an unrecognised file beside a valid pair', () => {
    const issues = journeyDirectoryIssues([file('index.md'), file('journey.yaml'), file('steps.txt')])
    expect(codes(issues)).toEqual(['W_JRN_ARTIFACT_UNKNOWN'])
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].path).toBe('steps.txt')
    expect(issues[0].message).toContain('journey.yaml')
  })

  it('fires W_JRN_ARTIFACT_UNKNOWN on a subdirectory — a journey admits none', () => {
    const issues = journeyDirectoryIssues([file('index.md'), file('journey.yaml'), dir('journeys')])
    expect(codes(issues)).toEqual(['W_JRN_ARTIFACT_UNKNOWN'])
    expect(issues[0].message).toContain('two paths are two entities')
  })

  it('says nothing about dot- and underscore-prefixed entries, as the loader does not', () => {
    expect(
      journeyDirectoryIssues([file('index.md'), file('journey.yaml'), file('.DS_Store'), dir('_scratch')]),
    ).toEqual([])
  })

  it('does not mistake a directory named journey.yaml for the artifact', () => {
    expect(codes(journeyDirectoryIssues([file('index.md'), dir('journey.yaml')]))).toEqual([
      'E_JRN_ARTIFACT_MISSING',
      'W_JRN_ARTIFACT_UNKNOWN',
    ])
  })
})

/* -------------------------------------------------------------- fixture */

let catalogDir: string
let catalog: Catalog
let diagnostics: Diagnostic[]

async function entity(relDir: string, frontmatter: Record<string, unknown>) {
  const target = path.join(catalogDir, relDir)
  await mkdir(target, { recursive: true })
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) =>
      typeof value === 'object' && value !== null
        ? `${key}:\n${JSON.stringify(value, null, 2)
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')}`
        : `${key}: ${JSON.stringify(value)}`,
    )
    .join('\n')
  await writeFile(path.join(target, 'index.md'), `---\n${yaml}\n---\n\nProse.\n`)
}

async function artifact(relDir: string, name: string, raw: string) {
  await mkdir(path.join(catalogDir, relDir), { recursive: true })
  await writeFile(path.join(catalogDir, relDir, name), raw)
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
    actor: { 'actor-type': 'human', goals: ['Buy a thing.'] },
    protocol: { style: 'request-response' },
  }[kind] ?? {}),
  ...extra,
})

const steps = (rows: string[]) => `name: cross-products\nsteps:\n${rows.join('\n')}\n`

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-journey-artifacts-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/actor/customer', base('customer', 'actor'))
  await entity('acme/product/shop', base('shop', 'product'))
  await entity('acme/product/shop/component/checkout', base('checkout', 'component'))
  await entity('acme/product/billing', base('billing', 'product'))
  await entity('acme/product/billing/component/ledger', base('ledger', 'component'))
  await entity('acme/product/warehouse', base('warehouse', 'product'))

  // The protocol that documents the shop → billing hop, naming the *product* on
  // one side and the *component* on the other: containment matches in both
  // directions, which is the half of the rule a naive equality check would miss.
  await entity(
    'acme/protocol/settlement',
    base('settlement', 'protocol', {
      participants: [
        { alias: 'shop', ref: '/product/shop' },
        { alias: 'ledger', ref: '/product/billing/component/ledger' },
      ],
    }),
  )

  // A protocol about neither end — the copy-paste JRN15 is written to catch.
  await entity(
    'acme/protocol/stock-check',
    base('stock-check', 'protocol', {
      participants: [
        { alias: 'customer', ref: '/actor/customer' },
        { alias: 'warehouse', ref: '/product/warehouse' },
      ],
    }),
  )

  await entity('acme/journey/documented', base('documented', 'journey', { actor: '/actor/customer' }))
  await artifact(
    'acme/journey/documented',
    'journey.yaml',
    steps([
      '  - actor: /actor/customer',
      '    touches: /product/shop/component/checkout',
      '  - actor: /actor/customer',
      '    touches: /product/billing/component/ledger',
      '    protocol: /protocol/settlement',
    ]).replace('name: cross-products', 'name: documented'),
  )

  await entity('acme/journey/copy-pasted', base('copy-pasted', 'journey', { actor: '/actor/customer' }))
  await artifact(
    'acme/journey/copy-pasted',
    'journey.yaml',
    steps([
      '  - actor: /actor/customer',
      '    touches: /product/shop/component/checkout',
      '  - actor: /actor/customer',
      '    touches: /product/billing/component/ledger',
      '    protocol: /protocol/stock-check',
    ]).replace('name: cross-products', 'name: copy-pasted'),
  )

  // No artifact at all, plus a file that is not one.
  await entity('acme/journey/artifactless', base('artifactless', 'journey', { actor: '/actor/customer' }))
  await artifact('acme/journey/artifactless', 'journey.yml', 'name: artifactless\nsteps: []\n')

  catalog = await loadCatalog({ catalogDir })
  diagnostics = journeyArtifactDiagnostics(catalog, listingsFor(catalog))
})

/** What the integrator threads in: one `readdir` per journey entity. */
function listingsFor(loaded: Catalog): Map<string, DirectoryEntry[]> {
  const listings = new Map<string, DirectoryEntry[]>()
  for (const journey of loaded.entities.values()) {
    if (journey.kind !== 'journey') continue
    listings.set(journey.srn, [
      file('index.md'),
      ...journey.artifacts.map((candidate) => file(candidate.file)),
    ])
  }
  return listings
}

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

const found = (code: string) => diagnostics.filter((diagnostic) => diagnostic.code === code)

/* ------------------------------------------------------------- JRN15 */

describe('journeyProtocolIssues — the participant join (JRN15)', () => {
  const parsed = (srn: string) => {
    const journey = catalog.entities.get(srn)
    if (!journey) throw new Error(`fixture missing ${srn}`)
    const artifactData = journey.artifacts.find((candidate) => candidate.file === 'journey.yaml')?.data
    const { journey: model } = parseJourney(artifactData, { journeySrn: srn })
    if (!model) throw new Error(`fixture ${srn} did not parse`)
    return model
  }

  it('stays silent when a participant contains, or is contained by, an end of the hop', () => {
    // `/product/shop` contains the touched checkout; `/product/billing/component/ledger`
    // *is* the other end. Either alone would satisfy the rule.
    expect(journeyProtocolIssues(catalog, parsed('srn://acme/journey/documented'))).toEqual([])
  })

  it('fires W_JRN_PROTOCOL_UNRELATED when the protocol touches neither end', () => {
    const issues = journeyProtocolIssues(catalog, parsed('srn://acme/journey/copy-pasted'))
    expect(codes(issues)).toEqual(['W_JRN_PROTOCOL_UNRELATED'])
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].path).toBe('steps[1].protocol')
    expect(issues[0].message).toContain('srn://acme/protocol/stock-check')
  })

  it('judges step 0 on its own end, having no predecessor', () => {
    const { journey } = parseJourney(
      {
        name: 'first-step',
        steps: [
          { actor: '/actor/customer', touches: '/product/shop/component/checkout', protocol: '/protocol/settlement' },
          { actor: '/actor/customer', touches: '/product/shop/component/checkout' },
        ],
      },
      { journeySrn: 'srn://acme/journey/first-step' },
    )
    expect(journey).not.toBeNull()
    // settlement lists /product/shop, which contains checkout — so the one end
    // step 0 has is enough, and no predecessor is invented for it.
    expect(journeyProtocolIssues(catalog, journey!)).toEqual([])
  })

  it('says nothing when the protocol reference does not resolve — that is E_SRN_DANGLING’s finding', () => {
    const { journey } = parseJourney(
      {
        name: 'dangling',
        steps: [
          { actor: '/actor/customer', touches: '/product/shop/component/checkout' },
          { actor: '/actor/customer', touches: '/product/billing/component/ledger', protocol: '/protocol/nowhere' },
        ],
      },
      { journeySrn: 'srn://acme/journey/dangling' },
    )
    expect(journeyProtocolIssues(catalog, journey!)).toEqual([])
  })

  it('says nothing when the reference resolves to something that is not a protocol', () => {
    const { journey } = parseJourney(
      {
        name: 'wrong-kind',
        steps: [
          { actor: '/actor/customer', touches: '/product/shop/component/checkout' },
          { actor: '/actor/customer', touches: '/product/billing/component/ledger', protocol: '/product/warehouse' },
        ],
      },
      { journeySrn: 'srn://acme/journey/wrong-kind' },
    )
    expect(journeyProtocolIssues(catalog, journey!)).toEqual([])
  })
})

/* -------------------------------------------------------- composition */

describe('journeyArtifactDiagnostics — over the resolved catalog', () => {
  it('loads the fixture with no errors of its own', () => {
    expect(catalog.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  })

  it('fires E_JRN_ARTIFACT_MISSING at the entity directory', () => {
    expect(found('E_JRN_ARTIFACT_MISSING')).toEqual([
      expect.objectContaining({ path: 'acme/journey/artifactless', srn: 'srn://acme/journey/artifactless' }),
    ])
  })

  it('fires W_JRN_ARTIFACT_UNKNOWN at the offending file', () => {
    expect(found('W_JRN_ARTIFACT_UNKNOWN')).toEqual([
      expect.objectContaining({ path: 'acme/journey/artifactless/journey.yml' }),
    ])
  })

  it('fires W_JRN_PROTOCOL_UNRELATED at journey.yaml, with the step in the message', () => {
    expect(found('W_JRN_PROTOCOL_UNRELATED')).toEqual([
      expect.objectContaining({
        path: 'acme/journey/copy-pasted/journey.yaml',
        srn: 'srn://acme/journey/copy-pasted',
        message: expect.stringContaining('steps[1].protocol:'),
      }),
    ])
  })

  it('says nothing about the well-formed journey', () => {
    expect(diagnostics.filter((diagnostic) => diagnostic.srn === 'srn://acme/journey/documented')).toEqual([])
  })

  it('skips a journey the caller supplied no listing for, rather than calling it artifact-less', () => {
    expect(journeyArtifactDiagnostics(catalog, new Map()).map((diagnostic) => diagnostic.code)).toEqual([
      'W_JRN_PROTOCOL_UNRELATED',
    ])
  })
})
