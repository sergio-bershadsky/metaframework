import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { arazzoGraph, readArazzo } from '../protocol/arazzo'
import { CANONICAL_SCHEMA_HOST, schemaServingUrl, schemaUrlToSrn, srnToSchemaUrl } from '../schema/url'
import { artifactDiagnostics } from './artifact-checks'
import { ENTITY_KINDS } from './frontmatter'
import { withArtifactChecks, withSchemaRegistry } from './index'
import { loadCatalog } from './load'
import type { Artifact, Catalog, Diagnostic, Entity } from './types'

/**
 * Regression guard on the *shipped* catalog under `solutions/`.
 *
 * The other suites build hermetic temp fixtures to exercise the loader; this one
 * does the opposite and asserts that the real content the portal renders stays
 * spec-clean. It is the only test that fails when an author breaks a placement
 * rule, a relation target, or an SRN in a solution file.
 */

const format = (d: Diagnostic) => `${d.code} ${d.path} — ${d.message}`

const CATALOG = path.resolve(process.cwd(), '../../solutions')

let catalog: Catalog

beforeAll(async () => {
  catalog = await loadCatalog({ catalogDir: CATALOG })
})

describe('shipped catalog', () => {
  it('loads with no error diagnostics', () => {
    const errors = catalog.diagnostics.filter((d) => d.severity === 'error')
    expect(errors.map(format)).toEqual([])
  })

  it('surfaces datamodel schema diagnostics through the catalog the portal renders', () => {
    // `getCatalog` composes these two, so /diagnostics and the header indicator
    // see E_DM_* beside E_FM_* and E_SRN_*. Before that composition existed the
    // registry ran only in this suite, and a broken `$id` or a dangling `$ref`
    // reached the portal as a silently empty schema view.
    const { catalog: merged, registry } = withSchemaRegistry(catalog)

    expect(registry.entries.size).toBe(
      [...catalog.entities.values()].filter((entity) => entity.kind === 'datamodel').length,
    )
    expect(registry.diagnostics.map(format)).toEqual([])
    expect(merged.diagnostics.length).toBe(catalog.diagnostics.length + registry.diagnostics.length)
    for (const diagnostic of catalog.diagnostics) expect(merged.diagnostics).toContain(diagnostic)
  })

  it('surfaces artifact mini-spec diagnostics through the catalog the portal renders', () => {
    // The same hole the assertion above closed for datamodels, one artifact
    // class later: `journey.yaml`, `workflows/*.yaml` and `states.json` each
    // have a parser, and every one of them was reachable only from a rendering
    // component. This assertion is the reason the shipped catalog's seventeen
    // over-cap notes and one mismatched machine id were found at all — the
    // "loads with no error diagnostics" test above never saw them, because
    // `loadCatalog` does not open an artifact past parsing it.
    const withArtifacts = withArtifactChecks(catalog)
    const errors = withArtifacts.diagnostics.filter((d) => d.severity === 'error')

    expect(errors.map(format)).toEqual([])
    for (const diagnostic of catalog.diagnostics) expect(withArtifacts.diagnostics).toContain(diagnostic)
  })

  it('checks every artifact the entity page draws, and only those', () => {
    // The dispatch table is duplicated between this module and
    // `entity-artifacts.tsx` — one by kind and filename, one by kind and
    // filename — so the two must agree on which files are validated at all. A
    // count derived from the catalog rather than written down catches an
    // artifact class that gained a parser on one side only.
    const drawn = [...catalog.entities.values()].flatMap((entity) =>
      entity.artifacts
        .filter(
          (artifact) =>
            (entity.kind === 'journey' && artifact.file === 'journey.yaml') ||
            (entity.kind === 'protocol' && artifact.file.startsWith('workflows/')) ||
            (entity.kind === 'protocol' && artifact.file === 'states.json'),
        )
        .map((artifact) => `${entity.relDir}/${artifact.file}`),
    )

    expect(drawn.length).toBeGreaterThan(0)
    for (const diagnostic of artifactDiagnostics(catalog)) expect(drawn).toContain(diagnostic.path)
  })

  it('exposes exactly one solution root per catalog directory', async () => {
    const { readdir } = await import('node:fs/promises')
    const entries = await readdir(CATALOG, { withFileTypes: true })
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => `srn://${entry.name}`)
      .sort()

    // Derived from disk rather than hard-coded, so adding a solution is not a
    // red test — but a directory the loader silently skipped, or a root it
    // invented, still is. `acme` is asserted by name because the spec's worked
    // example is written against it.
    expect([...catalog.solutions].sort()).toEqual(directories)
    expect(catalog.solutions).toContain('srn://acme')
  })

  it('carries every ontology kind, so the portal has something of each to render', () => {
    const kinds = new Set([...catalog.entities.values()].map((entity) => entity.kind))
    // Read out of ENTITY_KINDS rather than restated, so the ontology growing is
    // not a red test on its own — but a kind nobody wrote a fixture entity for
    // still is, which is the whole point of this assertion.
    expect([...kinds].sort()).toEqual([...ENTITY_KINDS].sort())
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
    // `arazzo.yaml` is here because the shipped catalog now carries one, and it
    // is listed for the same reason every other row is: this assertion is the
    // guard that a role the loader recognises actually reaches an entity. It
    // feeds a step graph of its own and no sequence diagram — those derive from
    // `workflows/` alone, and the mini-spec stays the choreography source
    // ([0020](srn://metaframework/adr/0020-arazzo-as-a-sibling-role)).
    expect(files('srn://acme/protocol/settlement')).toEqual([
      'arazzo.yaml',
      'states.json',
      'transport.yaml',
      'workflows/settle-order.yaml',
    ])
  })

  it('draws a step graph from every Arazzo description the catalog ships', () => {
    // The renderer's oracle is the shipped corpus, because there is no other
    // one: no published JSON Schema for Arazzo 1.1 was located, so nothing can
    // tell this portal that a document is well formed. What CAN be asserted is
    // that the reader reaches every file, that each yields a drawable workflow,
    // and that every reference inside a workflow resolves to a step of it — a
    // `dependsOn` or a `goto` naming a step that is not there is the one defect
    // the drawing itself cannot show, so it is pinned here instead.
    //
    // This asserts nothing about Arazzo's grammar and raises no diagnostic. The
    // artifact stays unvalidated; it is only now also read.
    const described = [...catalog.entities.values()]
      .map((entity) => ({ entity, artifact: entity.artifacts.find((a) => a.file === 'arazzo.yaml') }))
      .filter((pair): pair is { entity: Entity; artifact: Artifact } => pair.artifact !== undefined)

    // A floor, never a snapshot. The catalog grows, and the roadmap already
    // names a thirteenth groundable protocol deliberately left unwritten — an
    // exact total would go red the day somebody authors it, with no defect
    // present, and a suite that cries wolf on growth gets its numbers edited
    // rather than read. What must never happen is the reader reaching FEWER
    // files than it does today, and that is what this catches. Same form as the
    // datamodel floor below.
    expect(described.length).toBeGreaterThanOrEqual(12)

    const findings: string[] = []
    let workflows = 0
    let steps = 0
    for (const { entity, artifact } of described) {
      const description = readArazzo(artifact.data)
      if (description === null) {
        findings.push(`${entity.relDir} — nothing drawable`)
        continue
      }
      if (description.workflows.length === 0) findings.push(`${entity.relDir} — no workflows`)
      for (const workflow of description.workflows) {
        workflows += 1
        steps += workflow.steps.length
        if (workflow.steps.length === 0) findings.push(`${entity.relDir} ${workflow.workflowId} — no steps`)
        for (const miss of arazzoGraph(workflow).dangling) {
          findings.push(`${entity.relDir} ${workflow.workflowId} — ${miss.from} → ${miss.ref} (${miss.kind})`)
        }
      }
    }

    // `findings` is the assertion that carries the signal: it is empty only if
    // every description yielded a workflow, every workflow yielded a step, and
    // every reference inside one resolved. It says all of that per file, by
    // name, and it stays true at any catalog size.
    expect(findings).toEqual([])
    // The totals are therefore already implied, and are asserted as relations
    // rather than as digits — enough to prove the loop ran and not so much that
    // a thirteenth file is a failure.
    expect(workflows).toBeGreaterThanOrEqual(described.length)
    expect(steps).toBeGreaterThanOrEqual(workflows)
  })

  it('identifies every datamodel schema by its canonical URL and its SRN', () => {
    const datamodels = [...catalog.entities.values()].filter((entity) => entity.kind === 'datamodel')
    expect(datamodels.length).toBeGreaterThanOrEqual(6)

    for (const entity of datamodels) {
      const schema = entity.artifacts.find((artifact) => artifact.file === 'schema.json')
      const data = schema?.data as { $id?: string; 'x-srn'?: string } | undefined
      // $id is the identity: a canonical URL on a constant host, so a schema
      // means the same thing on a laptop and in production (decision record
      // amendment 2026-08-19-d, which moved the host off SCHEMA_BASE_URL).
      expect(data?.$id, `${entity.srn} schema.json $id`).toBe(srnToSchemaUrl(entity.srn))
      // x-srn says the same fact in the framework's own vocabulary, so a schema
      // lifted out of the catalog still states where it came from.
      expect(data?.['x-srn'], `${entity.srn} schema.json x-srn`).toBe(entity.srn)
    }
  })

  it('never lets a serving address into an artifact', async () => {
    const { readFile } = await import('node:fs/promises')
    const nodePath = await import('node:path')

    // SCHEMA_BASE_URL says where this deployment serves schemas; it is not
    // identity and must appear in no file. A catalog that baked it in would mean
    // something different on every machine.
    for (const entity of [...catalog.entities.values()].filter((e) => e.kind === 'datamodel')) {
      const raw = await readFile(nodePath.join(entity.dir, 'schema.json'), 'utf8')
      expect(raw, `${entity.srn} schema.json must not name a serving origin`).not.toContain('/schemas/')
    }
  })

  it('uses only canonical schema URLs as $refs, each naming an entity that exists', async () => {
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

        expect(ref, `${entity.srn}: $ref must be a canonical schema URL`).toMatch(
          new RegExp(`^${CANONICAL_SCHEMA_HOST}/`),
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

  it('serves each canonical identity from this deployment’s own route', async () => {
    const { GET } = await import('../../app/schemas/[...path]/route')
    const money = catalog.entities.get('srn://acme/datamodel/money')
    const identity = srnToSchemaUrl(money?.srn as string)
    const serving = schemaServingUrl(money?.srn as string)

    // Identity and retrieval are two different strings by design: one is fixed,
    // the other is a property of wherever this portal happens to run.
    expect(serving).not.toBe(identity)

    const response = await GET(new Request(serving), {
      params: Promise.resolve({ path: ['acme', 'datamodel', 'money'] }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/schema+json')
    // The document this route hands over is the document whose $id is the
    // canonical URL — which is what closes the loop between the two.
    expect(((await response.json()) as { $id: string }).$id).toBe(identity)
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
