import { describe, expect, it } from 'vitest'
import { artifactDiagnostics } from './artifact-checks'
import type { Artifact, Catalog, Entity } from './types'

/**
 * The fold is what these tests are about, not the parsers — those have their own
 * suites in lib/journey and lib/protocol. What has to hold here is that a
 * finding produced by a parser *arrives* as a Diagnostic, addressed to the file
 * and the entity, with a severity /diagnostics can group by. That is the whole
 * of what was missing: the parsers were correct and nobody was listening.
 */

function entity(partial: Partial<Entity> & Pick<Entity, 'srn' | 'kind' | 'relDir'>): Entity {
  return {
    parsed: { solution: 'acme', path: [], version: null } as unknown as Entity['parsed'],
    dir: `/tmp/${partial.relDir}`,
    frontmatter: { name: 'x', title: 'X', kind: partial.kind, version: 1, status: 'draft', summary: '' } as Entity['frontmatter'],
    body: '',
    artifacts: [],
    relations: [],
    parent: null,
    children: [],
    ...partial,
  }
}

function catalogOf(...entities: Entity[]): Catalog {
  return {
    entities: new Map(entities.map((e) => [e.srn, e])),
    solutions: ['srn://acme'],
    diagnostics: [],
    inbound: new Map(),
  }
}

const artifact = (file: string, data: unknown, dialect?: Artifact['dialect']): Artifact => ({
  file,
  extension: file.endsWith('.json') ? '.json' : '.yaml',
  data,
  raw: '',
  ...(dialect ? { dialect } : {}),
})

/**
 * What `adoptDialect` records for an AsyncAPI `transport.yaml`.
 *
 * Hand-built entities skip the loader, so a fixture that omits this is not a
 * smaller version of a real artifact — it is a *different* one. The transport
 * reader branches on `dialect`, and an AsyncAPI document arriving without one is
 * read as the mini-spec, which is the documented fallback and the right answer
 * for a file whose header nobody looked at.
 */
const ASYNCAPI: Artifact['dialect'] = { role: 'transport', key: 'asyncapi', declared: '3.1.0', known: true }

/**
 * A `transport.yaml` that satisfies the AsyncAPI profile, so that the two tests
 * below say what they mean.
 *
 * It is scenery — the subject there is `arazzo.yaml`'s grounding, and this file
 * is the sibling the grounding rule reads `channels` out of. It has to be
 * *valid* scenery all the same: since the transport reader joined this fold, an
 * invalid one would put three `E_PROTO_TRANSPORT_ASYNCAPI` errors beside the
 * grounding warning and the assertion would be about the wrong artifact. The
 * host is a server variable rather than a machine, which is also what keeps
 * `W_PROTO_TRANSPORT_HOST` off it.
 */
const asyncapiTransport = {
  asyncapi: '3.1.0',
  'x-srn': 'srn://acme/protocol/settlement',
  info: { version: 'unversioned' },
  servers: { broker: { protocol: 'kafka', host: '{host}' } },
  channels: { 'order-paid': {} },
}

const journeyData = {
  name: 'place-an-order',
  steps: [
    { actor: '/actor/customer', touches: '/product/shop/component/cart' },
    { actor: '/actor/customer', touches: '/product/shop/component/checkout' },
  ],
}

describe('artifactDiagnostics', () => {
  it('reports a journey.yaml violation the loader never opens', () => {
    const catalog = catalogOf(
      entity({
        srn: 'srn://acme/journey/place-an-order',
        kind: 'journey',
        relDir: 'acme/journey/place-an-order',
        frontmatter: { name: 'place-an-order' } as Entity['frontmatter'],
        artifacts: [artifact('journey.yaml', { ...journeyData, 'bogus-key': 1 })],
      }),
    )

    expect(artifactDiagnostics(catalog)).toEqual([
      {
        code: 'E_JRN_SCHEMA',
        severity: 'error',
        message: 'bogus-key: unknown top-level key "bogus-key" (prefix it x- to keep it)',
        path: 'acme/journey/place-an-order/journey.yaml',
        srn: 'srn://acme/journey/place-an-order',
      },
    ])
  })

  it('keeps the in-document position, which is the only way to find the line', () => {
    const catalog = catalogOf(
      entity({
        srn: 'srn://acme/journey/place-an-order',
        kind: 'journey',
        relDir: 'acme/journey/place-an-order',
        frontmatter: { name: 'place-an-order' } as Entity['frontmatter'],
        artifacts: [
          artifact('journey.yaml', {
            ...journeyData,
            steps: [journeyData.steps[0], { ...journeyData.steps[1], alt: [] }],
          }),
        ],
      }),
    )

    const [diagnostic] = artifactDiagnostics(catalog)
    expect(diagnostic.code).toBe('E_JRN_BRANCH')
    expect(diagnostic.message).toMatch(/^steps\[1\]\.alt: /)
  })

  it('reports a states.json id that disagrees with the protocol name', () => {
    const catalog = catalogOf(
      entity({
        srn: 'srn://acme/protocol/settlement',
        kind: 'protocol',
        relDir: 'acme/protocol/settlement',
        frontmatter: { name: 'settlement' } as Entity['frontmatter'],
        artifacts: [
          artifact('states.json', { id: 'other', initial: 'a', states: { a: { type: 'final' } } }),
        ],
      }),
    )

    expect(artifactDiagnostics(catalog).map((d) => [d.code, d.path])).toEqual([
      ['E_PROTO_STATES_ID', 'acme/protocol/settlement/states.json'],
    ])
  })

  it('reports a workflow finding even though the workflow still draws', () => {
    // The case that had no reader anywhere: `parseWorkflow` returns a usable
    // workflow *and* an issue list, and the entity page used to keep only the
    // first of the two.
    const catalog = catalogOf(
      entity({
        srn: 'srn://acme/protocol/settlement',
        kind: 'protocol',
        relDir: 'acme/protocol/settlement',
        frontmatter: {
          name: 'settlement',
          participants: [
            { alias: 'a', ref: '/x' },
            { alias: 'b', ref: '/y' },
          ],
        } as unknown as Entity['frontmatter'],
        artifacts: [
          artifact('workflows/settle.yaml', {
            name: 'settle',
            participants: ['a', 'b'],
            steps: [{ message: 'pay', from: 'a', to: 'b', kind: 'call', note: 'n'.repeat(201) }],
          }),
        ],
      }),
    )

    const diagnostics = artifactDiagnostics(catalog)
    expect(diagnostics.map((d) => d.code)).toEqual(['E_PROTO_WF_SCHEMA'])
    expect(diagnostics[0].path).toBe('acme/protocol/settlement/workflows/settle.yaml')
  })

  it('reports an arazzo.yaml whose source names no artifact this entity carries', () => {
    // The grounding rule reaching the fold. The branch is handed the whole
    // entity because the rule is about references BETWEEN artifacts: the sibling
    // filenames answer the source clause and the sibling documents answer the
    // reference clause, both out of `entity.artifacts` and neither out of a file.
    const catalog = catalogOf(
      entity({
        srn: 'srn://acme/protocol/settlement',
        kind: 'protocol',
        relDir: 'acme/protocol/settlement',
        frontmatter: { name: 'settlement' } as Entity['frontmatter'],
        artifacts: [
          artifact('arazzo.yaml', {
            arazzo: '1.1.0',
            sourceDescriptions: [{ name: 'orders', type: 'openapi', url: 'https://api.example.com/openapi.yaml' }],
            workflows: [{ workflowId: 'settle', steps: [{ stepId: 'a', operationId: 'requestRefund' }] }],
          }),
          artifact('transport.yaml', asyncapiTransport, ASYNCAPI),
        ],
      }),
    )

    const diagnostics = artifactDiagnostics(catalog)
    expect(diagnostics.map((d) => [d.code, d.path, d.severity])).toEqual([
      ['W_PROTO_ARAZZO_UNGROUNDED', 'acme/protocol/settlement/arazzo.yaml', 'warning'],
    ])
  })

  it('says nothing about a protocol that carries no arazzo.yaml', () => {
    // The role is optional (ADR 0020), so its absence asserts nothing. A gate
    // that fired on every protocol without an Arazzo Description would make
    // authoring one the only way to a clean catalog, which is the opposite of
    // what an optional role means.
    const catalog = catalogOf(
      entity({
        srn: 'srn://acme/protocol/settlement',
        kind: 'protocol',
        relDir: 'acme/protocol/settlement',
        frontmatter: { name: 'settlement' } as Entity['frontmatter'],
        artifacts: [artifact('transport.yaml', asyncapiTransport, ASYNCAPI)],
      }),
    )

    expect(artifactDiagnostics(catalog)).toEqual([])
  })

  it('leaves alone the files no parser claims', () => {
    // `schema.json` on a protocol is a JSON file, and a datamodel's belongs to
    // the schema registry. Neither is this module's to complain about.
    const catalog = catalogOf(
      entity({
        srn: 'srn://acme/datamodel/money',
        kind: 'datamodel',
        relDir: 'acme/datamodel/money',
        artifacts: [artifact('schema.json', { nonsense: true }), artifact('notes.yaml', { also: 'nonsense' })],
      }),
    )

    expect(artifactDiagnostics(catalog)).toEqual([])
  })

  it('does not re-report a file the loader already failed to parse', () => {
    const catalog = catalogOf(
      entity({
        srn: 'srn://acme/journey/place-an-order',
        kind: 'journey',
        relDir: 'acme/journey/place-an-order',
        artifacts: [{ ...artifact('journey.yaml', null), error: 'unexpected token' }],
      }),
    )

    expect(artifactDiagnostics(catalog)).toEqual([])
  })
})
