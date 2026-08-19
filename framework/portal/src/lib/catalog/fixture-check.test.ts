import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { schemaBaseUrl, schemaUrlToSrn, srnToSchemaUrl } from '../schema/url'
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

  it('identifies every datamodel schema by the URL the portal serves it at', () => {
    const datamodels = [...catalog.entities.values()].filter((entity) => entity.kind === 'datamodel')
    expect(datamodels.length).toBeGreaterThanOrEqual(6)

    for (const entity of datamodels) {
      const schema = entity.artifacts.find((artifact) => artifact.file === 'schema.json')
      const data = schema?.data as { $id?: string; 'x-srn'?: string } | undefined
      // $id is the identity now, and it must be dereferenceable: the URL below is
      // one this portal answers (decision record amendment 2026-08-19-c).
      expect(data?.$id, `${entity.srn} schema.json $id`).toBe(srnToSchemaUrl(entity.srn))
      // x-srn said the same thing in a keyword no validator acts on. Two identity
      // fields is one too many, so the annotation is retired.
      expect(data?.['x-srn'], `${entity.srn} schema.json must not carry x-srn`).toBeUndefined()
    }
  })

  it('uses only absolute schema URLs as $refs, each naming an entity that exists', async () => {
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
        // Local JSON Pointers are untouched by the reference form — they resolve
        // inside the document and always did.
        if (ref.startsWith('#')) continue

        expect(ref, `${entity.srn}: $ref must be an absolute schema URL`).toMatch(
          new RegExp(`^${schemaBaseUrl()}/schemas/`),
        )
        // Not merely well-formed: the URL must name a real datamodel entity, and
        // the file behind it must be on disk — otherwise "dereferenceable" is a
        // claim rather than a fact.
        const target = schemaUrlToSrn(ref)
        expect(target, `${entity.srn}: $ref "${ref}" must be a legal entity address`).not.toBeNull()

        const targetEntity = catalog.entities.get(target as string)
        expect(targetEntity?.kind, `${entity.srn}: $ref "${ref}" must name a datamodel`).toBe('datamodel')
        expect(
          existsSync(nodePath.join(targetEntity?.dir ?? '', 'schema.json')),
          `${entity.srn}: $ref "${ref}" must have a schema.json behind it`,
        ).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('serves each of those URLs from the route that backs them', async () => {
    const { GET } = await import('../../app/schemas/[...path]/route')
    const money = catalog.entities.get('srn://acme/datamodel/money')
    const url = srnToSchemaUrl(money?.srn as string)

    const response = await GET(new Request(url), {
      params: Promise.resolve({ path: ['acme', 'datamodel', 'money'] }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/schema+json')
    // The document the route serves is the document whose $id is that URL —
    // which is what closes the loop between identity and retrieval.
    expect(((await response.json()) as { $id: string }).$id).toBe(url)
  })

  it('refuses a schema URL that climbs out of the catalog', async () => {
    const { GET } = await import('../../app/schemas/[...path]/route')
    for (const segments of [
      ['acme', '..', '..', 'framework', 'spec'],
      ['..', 'framework'],
      ['.git', 'config'],
      // A real entity, but not one that owns a schema.
      ['acme', 'actor', 'customer'],
    ]) {
      const response = await GET(new Request('http://localhost:3000/schemas/x'), {
        params: Promise.resolve({ path: segments }),
      })
      expect(response.status, segments.join('/')).toBeGreaterThanOrEqual(400)
    }
  })
})
