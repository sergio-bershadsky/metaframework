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

const format = (d: Diagnostic) => `${d.code} ${d.path} — ${d.message}`

let catalog: Catalog

beforeAll(async () => {
  catalog = await loadCatalog({ catalogDir: path.resolve(process.cwd(), '../../solutions') })
})

describe('shipped catalog', () => {
  it('loads with no error diagnostics', () => {
    const errors = catalog.diagnostics.filter((d) => d.severity === 'error')
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
    expect(catalog.entities.get('srn://acme/product/shop/component/checkout/component/payment')?.kind).toBe('component')
    expect(
      catalog.entities.get('srn://acme/product/shop/component/checkout/component/payment/component/psp')?.parent,
    ).toBe('srn://acme/product/shop/component/checkout/component/payment')
  })

  it('renders both status extremes, which the entity header styles differently', () => {
    const statuses = [...catalog.entities.values()].map((entity) => entity.frontmatter.status)
    expect(statuses).toContain('draft')
    expect(statuses).toContain('deprecated')
  })

  it('derives inverse edges for a component shared across two products', () => {
    const inbound = catalog.inbound.get('srn://acme/product/billing/component/ledger') ?? []
    expect(inbound.map((edge) => edge.from).sort()).toEqual([
      'srn://acme/product/billing/component/reconciliation',
      'srn://acme/product/shop',
      'srn://acme/product/shop/component/checkout',
    ])
  })

  it('keeps a supersedes chain for the swap procedure', () => {
    const successor = catalog.entities.get('srn://acme/actor/merchant-operator')
    expect(successor?.relations.find((r) => r.edge === 'supersedes')?.target).toBe('srn://acme/actor/shop-admin')
    expect(catalog.entities.get('srn://acme/actor/shop-admin')?.frontmatter.status).toBe('deprecated')
  })

  it('ships the protocol artifacts the derived diagrams are built from', () => {
    const files = (srn: string) => catalog.entities.get(srn)?.artifacts.map((a) => a.file) ?? []
    expect(files('srn://acme/product/shop/protocol/order-placement')).toEqual([
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
