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

const artifact = (file: string, data: unknown): Artifact => ({
  file,
  extension: file.endsWith('.json') ? '.json' : '.yaml',
  data,
  raw: '',
})

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
