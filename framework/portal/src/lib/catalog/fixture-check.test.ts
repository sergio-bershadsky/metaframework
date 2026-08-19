import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from './load'
import type { Catalog, Diagnostic } from './types'

/**
 * Regression guard on the *shipped* catalog under `solutions/`.
 *
 * The other suites build hermetic temp fixtures to exercise the loader; this one
 * does the opposite and asserts that the real content the portal renders stays
 * spec-clean. It is the only test that fails when an author breaks a placement
 * rule, a relation target, or an SRN in a solution file.
 */

/**
 * Kind-specific frontmatter fields are normative (framework/spec/kinds/*.md),
 * but the loader currently validates only the common contract, so it reports
 * every one of them as an unknown top-level field. Until per-kind schemas land
 * there, those diagnostics are expected noise rather than fixture defects.
 *
 * The allow-list is the exact closed set the kind documents define — a typo
 * (`usag:`, `prioroty:`) still fails, and the filter goes dead of its own
 * accord once the loader knows these fields.
 */
const KIND_FRONTMATTER_FIELDS = new Set([
  // solution.md
  'vision',
  'scope',
  'contacts',
  // product.md
  'lifecycle',
  'primary-actors',
  // component.md
  'component-type',
  // datamodel.md
  'usage',
  'abstract',
  // protocol.md
  'participants',
  'style',
  'conforms-to',
  // actor.md
  'actor-type',
  'goals',
  // environment.md
  'environment-type',
  // adr.md
  'decision-status',
  'date',
  'deciders',
  // requirement.md
  'requirement-type',
  'priority',
])

function isKnownKindField(diagnostic: Diagnostic): boolean {
  if (diagnostic.code !== 'E_FM_UNKNOWN_FIELD') return false
  const field = diagnostic.message.match(/unknown top-level field "([^"]+)"/)?.[1]
  return field !== undefined && KIND_FRONTMATTER_FIELDS.has(field)
}

const format = (d: Diagnostic) => `${d.code} ${d.path} — ${d.message}`

let catalog: Catalog

beforeAll(async () => {
  catalog = await loadCatalog({ catalogDir: path.resolve(process.cwd(), '../../solutions') })
})

describe('shipped catalog', () => {
  it('loads with no error diagnostics', () => {
    const errors = catalog.diagnostics.filter((d) => d.severity === 'error' && !isKnownKindField(d))
    expect(errors.map(format)).toEqual([])
  })

  it('exposes exactly the acme solution root', () => {
    expect(catalog.solutions).toEqual(['srn://acme'])
  })

  it('carries every ontology kind, so the portal has something of each to render', () => {
    const kinds = new Set([...catalog.entities.values()].map((entity) => entity.kind))
    expect([...kinds].sort()).toEqual([
      'actor',
      'adr',
      'component',
      'datamodel',
      'environment',
      'product',
      'protocol',
      'requirement',
      'solution',
    ])
  })

  it('nests components at least two levels below a product', () => {
    expect(catalog.entities.get('srn://acme/shop/checkout/payment')?.kind).toBe('component')
    expect(catalog.entities.get('srn://acme/shop/checkout/payment/psp')?.parent).toBe(
      'srn://acme/shop/checkout/payment',
    )
  })

  it('renders both status extremes, which the entity header styles differently', () => {
    const statuses = [...catalog.entities.values()].map((entity) => entity.frontmatter.status)
    expect(statuses).toContain('draft')
    expect(statuses).toContain('deprecated')
  })

  it('derives inverse edges for a component shared across two products', () => {
    const inbound = catalog.inbound.get('srn://acme/billing/ledger') ?? []
    expect(inbound.map((edge) => edge.from).sort()).toEqual([
      'srn://acme/billing/reconciliation',
      'srn://acme/shop',
      'srn://acme/shop/checkout',
    ])
  })

  it('keeps a supersedes chain for the swap procedure', () => {
    const successor = catalog.entities.get('srn://acme/actor/merchant-operator')
    expect(successor?.relations.find((r) => r.edge === 'supersedes')?.target).toBe('srn://acme/actor/shop-admin')
    expect(catalog.entities.get('srn://acme/actor/shop-admin')?.frontmatter.status).toBe('deprecated')
  })

  it('ships the protocol artifacts the derived diagrams are built from', () => {
    const files = (srn: string) => catalog.entities.get(srn)?.artifacts.map((a) => a.file) ?? []
    expect(files('srn://acme/shop/protocol/order-placement')).toEqual([
      'states.json',
      'transport.yaml',
      'workflows/cancel-order.yaml',
      'workflows/place-order.yaml',
    ])
    expect(files('srn://acme/protocol/settlement')).toEqual([
      'states.json',
      'transport.yaml',
      'workflows/settle-order.yaml',
    ])
  })

  it('keeps every datamodel schema generically resolvable — no $id, x-srn matches its path', () => {
    const datamodels = [...catalog.entities.values()].filter((entity) => entity.kind === 'datamodel')
    expect(datamodels.length).toBeGreaterThanOrEqual(6)

    for (const entity of datamodels) {
      const schema = entity.artifacts.find((artifact) => artifact.file === 'schema.json')
      const data = schema?.data as { $id?: string; 'x-srn'?: string } | undefined
      // $id would re-anchor relative $ref resolution into srn:// space and break
      // stock validators and generators (decision record amendment 2026-08-19-b).
      expect(data?.$id, `${entity.srn} schema.json must not carry $id`).toBeUndefined()
      expect(data?.['x-srn'], `${entity.srn} schema.json x-srn`).toBe(entity.srn)
    }
  })

  it('uses only relative file-path $refs, each pointing at an existing schema.json', async () => {
    const { readFile } = await import('node:fs/promises')
    const nodePath = await import('node:path')
    const { existsSync } = await import('node:fs')

    const datamodels = [...catalog.entities.values()].filter((entity) => entity.kind === 'datamodel')
    let checked = 0

    for (const entity of datamodels) {
      const file = nodePath.join(entity.dir, 'schema.json')
      if (!existsSync(file)) continue
      const raw = await readFile(file, 'utf8')
      for (const [, ref] of raw.matchAll(/"\$ref"\s*:\s*"([^"]+)"/g)) {
        if (ref.startsWith('#')) continue
        expect(ref, `${entity.srn}: $ref must be a relative path`).not.toMatch(/^srn:\/\/|^\//)
        expect(ref, `${entity.srn}: $ref must name a schema.json`).toMatch(/schema\.json$/)
        expect(
          existsSync(nodePath.resolve(entity.dir, ref)),
          `${entity.srn}: $ref "${ref}" must resolve to an existing file`,
        ).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(10)
  })
})
