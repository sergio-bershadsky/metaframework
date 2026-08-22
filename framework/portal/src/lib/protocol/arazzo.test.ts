import { describe, expect, it } from 'vitest'
import { END_NODE, arazzoGraph, arazzoSummary, readArazzo, type ArazzoWorkflow } from './arazzo'

/**
 * The fixtures are the catalog's own Arazzo documents, reduced.
 *
 * Both shapes the 2026-08-22 authoring pass produced are represented, because
 * they exercise different halves of the reader: the OpenAPI-grounded shape
 * (`operationId`, `successCriteria`, `onFailure`) and the AsyncAPI-grounded one
 * (`channelPath`, `action`, `dependsOn`). Field spellings are the Arazzo
 * Specification 1.1.0's, not this reader's invention — which is why a fixture
 * that drifts from the standard is a broken test rather than a broken reader.
 */

/** `acme/…/protocol/carrier-booking`, reduced to one workflow. */
const CARRIER_BOOKING = {
  arazzo: '1.1.0',
  info: { title: 'Carrier booking', summary: "The orchestrator's path.", version: 'unversioned' },
  sourceDescriptions: [{ name: 'openapi', type: 'openapi', url: './openapi.yaml' }],
  workflows: [
    {
      workflowId: 'book-shipment',
      summary: 'Ask for one parcel to be taken.',
      inputs: { type: 'object' },
      steps: [
        {
          stepId: 'book-shipment',
          description: 'POST /.',
          operationId: 'bookShipment',
          parameters: [{ name: 'Idempotency-Key', in: 'header', value: '$inputs.shipment-id' }],
          successCriteria: [{ condition: '$statusCode == 201' }],
          onFailure: [
            { name: 'idempotency-key-reused', type: 'end', criteria: [{ condition: '$statusCode == 409' }] },
            { name: 'no-carrier-available', type: 'end', criteria: [{ condition: '$statusCode == 502' }] },
          ],
        },
      ],
    },
  ],
}

/** `brass/protocol/game-transport`, reduced — the AsyncAPI `dependsOn` shape. */
const GAME_TRANSPORT = {
  arazzo: '1.1.0',
  info: { title: 'Game transport' },
  sourceDescriptions: [{ name: 'transport', type: 'asyncapi', url: './transport.yaml' }],
  workflows: [
    {
      workflowId: 'seat-and-start',
      steps: [
        { stepId: 'sync', operationId: 'sync-request', action: 'send' },
        { stepId: 'receive-sync-response', operationId: 'sync-response', action: 'receive', dependsOn: ['sync'] },
        { stepId: 'receive-match-data', operationId: 'match-data', action: 'receive', dependsOn: ['sync'] },
        { stepId: 'sit-down', operationId: 'move-submit', action: 'send', dependsOn: ['receive-sync-response'] },
      ],
    },
  ],
}

function workflowOf(document: unknown, index = 0): ArazzoWorkflow {
  const read = readArazzo(document)
  expect(read).not.toBeNull()
  return (read as NonNullable<typeof read>).workflows[index]
}

describe('readArazzo — the document', () => {
  it('reads the root, the info block and the source descriptions', () => {
    const read = readArazzo(CARRIER_BOOKING)
    expect(read?.version).toBe('1.1.0')
    expect(read?.title).toBe('Carrier booking')
    expect(read?.summary).toBe("The orchestrator's path.")
    expect(read?.sources).toEqual([{ name: 'openapi', type: 'openapi', url: './openapi.yaml' }])
  })

  it('reads a step by every field the graph draws', () => {
    const step = workflowOf(CARRIER_BOOKING).steps[0]
    expect(step.stepId).toBe('book-shipment')
    expect(step.reference).toEqual({ kind: 'operationId', value: 'bookShipment', source: 'openapi' })
    expect(step.successCriteria).toEqual([{ condition: '$statusCode == 201' }])
    expect(step.actions).toEqual([
      {
        outcome: 'failure',
        name: 'idempotency-key-reused',
        type: 'end',
        stepId: null,
        workflowId: null,
        criteria: [{ condition: '$statusCode == 409' }],
        retryLimit: null,
      },
      {
        outcome: 'failure',
        name: 'no-carrier-available',
        type: 'end',
        stepId: null,
        workflowId: null,
        criteria: [{ condition: '$statusCode == 502' }],
        retryLimit: null,
      },
    ])
  })

  it('reports what it did not draw rather than pretending the drawing is the file', () => {
    // `parameters` is in the document and not in the picture. The reader says
    // so, from the document, so the list cannot fall behind the drawing.
    expect(workflowOf(CARRIER_BOOKING).omitted).toEqual(['parameters'])
    expect(workflowOf(GAME_TRANSPORT).omitted).toEqual([])
  })

  it('takes the source name out of a channelPath, and off the only source for a bare id', () => {
    // `{$sourceDescriptions.<name>.url}#/channels/<key>` — the spelling every
    // AsyncAPI-grounded file in this catalog uses.
    const pointered = workflowOf({
      workflows: [
        {
          workflowId: 'w',
          steps: [{ stepId: 's', channelPath: '{$sourceDescriptions.transport.url}#/channels/order-paid' }],
        },
      ],
      sourceDescriptions: [
        { name: 'transport', type: 'asyncapi', url: './transport.yaml' },
        { name: 'other', type: 'openapi', url: './openapi.yaml' },
      ],
    })
    expect(pointered.steps[0].reference).toEqual({
      kind: 'channelPath',
      value: '{$sourceDescriptions.transport.url}#/channels/order-paid',
      source: 'transport',
    })

    // A bare id names no source. With one source that is unambiguous; with two
    // it is a guess, and the reader declines to make it.
    expect(workflowOf(GAME_TRANSPORT).steps[0].reference.source).toBe('transport')
    const ambiguous = workflowOf({
      workflows: [{ workflowId: 'w', steps: [{ stepId: 's', operationId: 'doThing' }] }],
      sourceDescriptions: [{ name: 'a', url: './a.yaml' }, { name: 'b', url: './b.yaml' }],
    })
    expect(ambiguous.steps[0].reference.source).toBeNull()
  })

  it('takes the first reference field in the spec’s order when a step carries two', () => {
    // Mutually exclusive per the specification, so this document is already
    // outside the standard. The reader is not the thing that judges that.
    const step = workflowOf({
      workflows: [{ steps: [{ stepId: 's', operationPath: '/paths/~1a', channelPath: '#/channels/c' }] }],
    }).steps[0]
    expect(step.reference.kind).toBe('operationPath')
  })
})

describe('readArazzo — reading is not validating', () => {
  it('never throws, and returns null only when there is nothing to draw', () => {
    for (const input of [null, undefined, 42, 'arazzo', [], {}, { arazzo: '1.1.0' }, { workflows: 'no' }]) {
      expect(() => readArazzo(input)).not.toThrow()
      expect(readArazzo(input)).toBeNull()
    }
    // A `workflows` array is the whole bar, even an empty one: the document has
    // a subject, it just has no steps yet.
    expect(readArazzo({ workflows: [] })).toMatchObject({ workflows: [] })
  })

  it('draws a step that the specification would call incomplete, and says nothing', () => {
    // Arazzo 1.1's prose marks only `stepId` REQUIRED and states the four
    // reference fields to be mutually exclusive — it does not say one MUST be
    // present. Neither does this reader, in either direction: a step with no id
    // and no reference is drawn, under the identity its position gives it.
    const workflow = workflowOf({ workflows: [{ steps: [{ description: 'nothing at all' }] }] })
    expect(workflow.steps[0]).toMatchObject({ stepId: null, index: 0 })
    expect(workflow.steps[0].reference).toEqual({ kind: 'none', value: null, source: null })
    expect(arazzoGraph(workflow).nodes.map((node) => node.id)).toEqual(['#0'])
  })

  it('steps over entries of the wrong type instead of failing the document', () => {
    const workflow = workflowOf({
      workflows: [
        'not a workflow',
        {
          workflowId: 'w',
          steps: [
            'not a step',
            { stepId: 's', dependsOn: ['a', 7, null], successCriteria: [{ noCondition: true }, 'bare'] },
          ],
        },
      ],
    })
    expect(workflow.steps).toHaveLength(1)
    expect(workflow.steps[0].dependsOn).toEqual(['a'])
    expect(workflow.steps[0].successCriteria).toEqual([])
  })
})

describe('arazzoGraph — declared order and inferred order are different edges', () => {
  it('joins consecutive steps only where the later one declares no dependsOn', () => {
    const graph = arazzoGraph(workflowOf(GAME_TRANSPORT))
    const kinds = graph.edges.map((edge) => `${edge.kind} ${edge.source}->${edge.target}`).sort()
    expect(kinds).toEqual([
      'depends receive-sync-response->sit-down',
      'depends sync->receive-match-data',
      'depends sync->receive-sync-response',
    ])
    // Every step after the first states its own order here, so not one sequence
    // edge is inferred — the drawing asserts nothing the document does not.
    expect(graph.edges.filter((edge) => edge.kind === 'order')).toEqual([])
  })

  it('infers the sequence when nothing else states it', () => {
    const graph = arazzoGraph(
      workflowOf({ workflows: [{ steps: [{ stepId: 'a' }, { stepId: 'b' }, { stepId: 'c' }] }] }),
    )
    expect(graph.edges).toEqual([
      { id: 'order:a->b', source: 'a', target: 'b', kind: 'order' },
      { id: 'order:b->c', source: 'b', target: 'c', kind: 'order' },
    ])
  })

  it('does not draw both for one pair — a stated order is not restated as an inference', () => {
    const graph = arazzoGraph(
      workflowOf({ workflows: [{ steps: [{ stepId: 'a' }, { stepId: 'b', dependsOn: ['a'] }] }] }),
    )
    expect(graph.edges).toEqual([{ id: 'depends:a->b', source: 'a', target: 'b', kind: 'depends' }])
  })
})

describe('arazzoGraph — outcomes', () => {
  it('ends at the terminal node, carrying the criterion as the edge label', () => {
    const graph = arazzoGraph(workflowOf(CARRIER_BOOKING))
    expect(graph.nodes.map((node) => node.kind)).toEqual(['step', 'end'])
    expect(graph.edges).toMatchObject([
      { source: 'book-shipment', target: END_NODE, kind: 'failure', name: 'idempotency-key-reused', action: 'end', label: '$statusCode == 409' },
      { source: 'book-shipment', target: END_NODE, kind: 'failure', name: 'no-carrier-available', action: 'end', label: '$statusCode == 502' },
    ])
  })

  it('draws no terminal when nothing ends', () => {
    const graph = arazzoGraph(workflowOf(GAME_TRANSPORT))
    expect(graph.nodes.some((node) => node.kind === 'end')).toBe(false)
  })

  it('sends a goto to its step, and a retry naming none back to itself', () => {
    const graph = arazzoGraph(
      workflowOf({
        workflows: [
          {
            steps: [
              { stepId: 'a', onSuccess: [{ name: 'skip', type: 'goto', stepId: 'c' }] },
              { stepId: 'b', onFailure: [{ name: 'again', type: 'retry', retryLimit: 3 }] },
              { stepId: 'c' },
            ],
          },
        ],
      }),
    )
    expect(graph.edges.filter((edge) => edge.kind === 'success')).toMatchObject([
      { source: 'a', target: 'c', action: 'goto', name: 'skip' },
    ])
    expect(graph.edges.filter((edge) => edge.kind === 'failure')).toMatchObject([
      { source: 'b', target: 'b', action: 'retry', name: 'again' },
    ])
  })

  it('reports a workflow target as a crossing, not as an edge of this graph', () => {
    const graph = arazzoGraph(
      workflowOf({
        workflows: [
          {
            steps: [
              { stepId: 'a', workflowId: 'settle' },
              { stepId: 'b', onFailure: [{ name: 'compensate', type: 'goto', workflowId: 'refund' }] },
            ],
          },
        ],
      }),
    )
    expect(graph.crossings).toEqual([
      { from: 'a', workflowId: 'settle', kind: 'order' },
      { from: 'b', workflowId: 'refund', kind: 'failure' },
    ])
    expect(graph.edges.map((edge) => edge.kind)).toEqual(['order'])
  })

  it('reports a reference to a step that is not here instead of dropping it', () => {
    const graph = arazzoGraph(
      workflowOf({
        workflows: [
          { steps: [{ stepId: 'a', dependsOn: ['ghost'], onFailure: [{ type: 'goto', stepId: 'elsewhere' }] }] },
        ],
      }),
    )
    expect(graph.dangling).toEqual([
      { from: 'a', ref: 'ghost', kind: 'depends' },
      { from: 'a', ref: 'elsewhere', kind: 'failure' },
    ])
    expect(graph.edges).toEqual([])
  })
})

describe('arazzoSummary — the drawing in words', () => {
  it('names every step and every edge the canvas draws', () => {
    const lines = arazzoSummary(workflowOf(CARRIER_BOOKING))
    expect(lines).toEqual([
      'Step 1, book-shipment: operationId bookShipment, succeeds when $statusCode == 201. POST /.',
      'book-shipment on failure (idempotency-key-reused) continues to the end of the workflow when $statusCode == 409.',
      'book-shipment on failure (no-carrier-available) continues to the end of the workflow when $statusCode == 502.',
    ])
  })

  it('says which way an AsyncAPI step points', () => {
    expect(arazzoSummary(workflowOf(GAME_TRANSPORT))[0]).toBe('Step 1, sync: operationId sync-request, send.')
  })

  /**
   * The invariant, not three examples of it: a step-level field this reader
   * KEEPS is excluded from `omitted`, so the "not drawn, and in the file beside
   * this" note will never mention it. Whatever a caption does not say about
   * such a field, nothing says.
   */
  it('says every step-level field it does not report as omitted', () => {
    const workflow = workflowOf(CARRIER_BOOKING)
    const [line] = arazzoSummary(workflow)
    expect(workflow.omitted).toEqual(['parameters'])
    for (const stated of ['book-shipment', 'bookShipment', '$statusCode == 201', 'POST /.']) {
      expect(line).toContain(stated)
    }
  })

  it('joins several success criteria the way the box does', () => {
    const line = arazzoSummary(
      workflowOf({
        arazzo: '1.1.0',
        workflows: [
          {
            workflowId: 'w',
            steps: [
              {
                stepId: 'one',
                operationId: 'op',
                successCriteria: [{ condition: '$statusCode == 200' }, { condition: '$response.body#/ok == true' }],
              },
            ],
          },
        ],
      }),
    )[0]
    expect(line).toBe('Step 1, one: operationId op, succeeds when $statusCode == 200 AND $response.body#/ok == true.')
  })

  it('flattens a multi-line description — a caption is one flow of text', () => {
    const line = arazzoSummary(
      workflowOf({
        arazzo: '1.1.0',
        workflows: [
          {
            workflowId: 'w',
            steps: [{ stepId: 'one', operationId: 'op', description: 'First line.\n  Second line.' }],
          },
        ],
      }),
    )[0]
    expect(line).toBe('Step 1, one: operationId op. First line. Second line.')
  })

  it('adds nothing when a step states neither criteria nor a description', () => {
    expect(
      arazzoSummary(
        workflowOf({
          arazzo: '1.1.0',
          workflows: [{ workflowId: 'w', steps: [{ stepId: 'one', operationId: 'op' }] }],
        }),
      )[0],
    ).toBe('Step 1, one: operationId op.')
  })
})
