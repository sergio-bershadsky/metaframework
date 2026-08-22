import { describe, expect, it } from 'vitest'
import { arazzoGroundingDiagnostics } from './arazzo-grounding'

/**
 * `W_PROTO_ARAZZO_UNGROUNDED`, both clauses.
 *
 * The shipped catalog is a *green* corpus for this rule and nothing else: all
 * twelve `arazzo.yaml` under `solutions/` ground, which is asserted over the
 * real files in `lib/catalog/fixture-check.test.ts`. A gate proved only against
 * documents that pass is not a gate, so every red case here is synthetic and
 * every one of them is a sentence of `kinds/protocol.md` turned into a fixture.
 *
 * The two grounding documents are written the way the catalog writes them,
 * because the resolution rules are per grammar: an OpenAPI source offers
 * `operationId`s under `paths`, an AsyncAPI source offers the keys of its
 * `operations` map, and both offer JSON pointers into themselves.
 */

const OPENAPI = {
  openapi: '3.1.0',
  info: { title: 'refunds', version: '1' },
  paths: {
    '/refunds': { post: { operationId: 'requestRefund' } },
    '/refunds/{id}': { get: { operationId: 'getRefund' } },
  },
}

const ASYNCAPI = {
  asyncapi: '3.1.0',
  info: { title: 'settlement', version: '1' },
  // Present so that the pointer suite below can aim at a node that exists and is
  // not a channel. Without it `#/servers` would fail the existence check and
  // prove nothing about the landing one.
  servers: { bus: { host: 'kafka.acme.internal', protocol: 'kafka' } },
  channels: {
    'order-paid': { address: 'acme.order-paid.v1', messages: { paid: { name: 'OrderPaid' } } },
    'ledger-entry-posted': { address: 'acme.ledger-entry-posted.v1' },
  },
  operations: {
    'publish-order-paid': { action: 'send', channel: { $ref: '#/channels/order-paid' } },
  },
}

/** A mini-spec `transport.yaml` — the dialect this checker deliberately cannot read. */
const MINI_SPEC_TRANSPORT = {
  kind: 'grpc',
  // The framework-owned `$schema` is stripped by the loader before it reaches
  // `artifact.data`, so a mini-spec document arrives carrying no version key at
  // all. That absence is exactly what `grammarOf` keys off.
  channels: [{ name: 'settle', payload: '/datamodel/ledger-entry' }],
}

const openapiSibling = { file: 'openapi.yaml', data: OPENAPI }
const asyncapiSibling = { file: 'transport.yaml', data: ASYNCAPI }

const check = (data: unknown, siblings: ReadonlyArray<{ file: string; data: unknown }>, srn?: string) =>
  arazzoGroundingDiagnostics(data, { siblings, ...(srn ? { srn } : {}) })

const codes = (diagnostics: ReturnType<typeof check>) => diagnostics.map((d) => d.code)

/** An Arazzo Description with one source and the steps given. */
const description = (source: Record<string, unknown>, steps: Array<Record<string, unknown>>) => ({
  arazzo: '1.1.0',
  info: { title: 'x', version: '1' },
  sourceDescriptions: [source],
  workflows: [{ workflowId: 'main', steps }],
})

const OPENAPI_SOURCE = { name: 'orders', type: 'openapi', url: './openapi.yaml' }
const ASYNCAPI_SOURCE = { name: 'transport', type: 'asyncapi', url: './transport.yaml' }

/* ------------------------------------------------------ clause 1: the source */

describe('clause 1 — `sourceDescriptions[].url` names a sibling of this entity', () => {
  it('accepts a `./`-relative url naming a carried artifact', () => {
    const data = description(OPENAPI_SOURCE, [{ stepId: 'refund', operationId: 'requestRefund' }])
    expect(check(data, [openapiSibling])).toEqual([])
  })

  it('accepts a bare relative url naming the same artifact', () => {
    // The spec says "a relative URI-reference to a sibling artifact — in
    // practice `./openapi.yaml`", and `./` is the practice rather than the rule.
    // The entity page already links a bare name (`arazzoSourceHrefs` strips the
    // prefix before it joins), so refusing it here would warn on a file the
    // portal resolves correctly.
    const data = description({ ...OPENAPI_SOURCE, url: 'openapi.yaml' }, [
      { stepId: 'refund', operationId: 'requestRefund' },
    ])
    expect(check(data, [openapiSibling])).toEqual([])
  })

  it('warns on the absolute URL Arazzo permits and this framework refuses', () => {
    const data = description({ ...OPENAPI_SOURCE, url: 'https://api.example.com/openapi.yaml' }, [])
    const [diagnostic] = check(data, [openapiSibling], 'srn://acme/protocol/refunds')

    expect(diagnostic).toEqual({
      code: 'W_PROTO_ARAZZO_UNGROUNDED',
      severity: 'warning',
      message:
        'sourceDescriptions[0]: url "https://api.example.com/openapi.yaml" is not a sibling artifact of this entity' +
        ' — name a file the protocol carries, relative and without a host',
      path: 'arazzo.yaml',
      srn: 'srn://acme/protocol/refunds',
    })
  })

  it('warns on a relative url naming a file the entity does not carry', () => {
    const data = description({ ...OPENAPI_SOURCE, url: './openapi.yml' }, [])
    expect(codes(check(data, [openapiSibling]))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })

  it('warns on a url that escapes the entity directory', () => {
    // "Sibling artifact of this entity" — a path out of the directory names
    // somebody else's file, which is the same claim nothing offline can check.
    const data = description({ ...OPENAPI_SOURCE, url: '../other/openapi.yaml' }, [])
    expect(codes(check(data, [openapiSibling]))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })

  it('reports an ungrounded source once, not once per step that names it', () => {
    // One defect, one diagnostic. Every step below fails for the same reason the
    // source does, and repeating it four times would bury the sentence that
    // matters.
    const data = description({ ...OPENAPI_SOURCE, url: 'https://api.example.com/openapi.yaml' }, [
      { stepId: 'a', operationId: 'requestRefund' },
      { stepId: 'b', operationId: 'getRefund' },
      { stepId: 'c', operationId: 'nonsense' },
    ])
    const diagnostics = check(data, [openapiSibling])

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].message).toMatch(/^sourceDescriptions\[0\]: /)
  })

  it('says nothing about a source that declares no url', () => {
    // Arazzo marks `url` REQUIRED and this framework validates none of Arazzo's
    // own fields. A source naming no document is a document Arazzo rejects, not
    // a grounding failure — and inventing a finding here would be this file
    // asserting a grammar the framework has said it does not own.
    const data = description({ name: 'orders', type: 'openapi' }, [])
    expect(check(data, [openapiSibling])).toEqual([])
  })
})

/* ------------------------------------------- clause 2: operations and channels */

describe('clause 2, OpenAPI source — an operation a step names', () => {
  it('resolves a bare `operationId` against `paths`', () => {
    const data = description(OPENAPI_SOURCE, [
      { stepId: 'a', operationId: 'requestRefund' },
      { stepId: 'b', operationId: 'getRefund' },
    ])
    expect(check(data, [openapiSibling])).toEqual([])
  })

  it('resolves the `$sourceDescriptions.<name>.<id>` spelling', () => {
    const data = description(OPENAPI_SOURCE, [
      { stepId: 'a', operationId: '$sourceDescriptions.orders.requestRefund' },
    ])
    expect(check(data, [openapiSibling])).toEqual([])
  })

  it('warns on an `operationId` the document does not declare', () => {
    const data = description(OPENAPI_SOURCE, [{ stepId: 'a', operationId: 'requestRefunds' }])
    const [diagnostic] = check(data, [openapiSibling])

    expect(diagnostic.code).toBe('W_PROTO_ARAZZO_UNGROUNDED')
    expect(diagnostic.message).toBe(
      'workflows[0].steps[0]: operationId "requestRefunds" resolves to no operation in source "orders"',
    )
  })

  it('warns when the reference names a source description the document does not declare', () => {
    const data = description(OPENAPI_SOURCE, [
      { stepId: 'a', operationId: '$sourceDescriptions.elsewhere.requestRefund' },
    ])
    const [diagnostic] = check(data, [openapiSibling])

    expect(diagnostic.message).toBe(
      'workflows[0].steps[0]: operationId names source "elsewhere", which this document does not declare',
    )
  })

  it('resolves an `operationPath` as a JSON pointer, escapes included', () => {
    const data = description(OPENAPI_SOURCE, [
      { stepId: 'a', operationPath: '{$sourceDescriptions.orders.url}#/paths/~1refunds/post' },
    ])
    expect(check(data, [openapiSibling])).toEqual([])
  })

  it('warns on an `operationPath` pointer that walks off the document', () => {
    const data = description(OPENAPI_SOURCE, [
      { stepId: 'a', operationPath: '{$sourceDescriptions.orders.url}#/paths/~1refunds/patch' },
    ])
    expect(codes(check(data, [openapiSibling]))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })

  it('warns on an `operationPath` that lands on the path item rather than an operation', () => {
    // The pointer walks — `/refunds` is a real key of `paths` — and a path item
    // is not an operation. This is the half of clause 2 an existence check gets
    // wrong: it would accept the reference and still print "resolves to no
    // operation" the day it finally failed.
    const data = description(OPENAPI_SOURCE, [
      { stepId: 'a', operationPath: '{$sourceDescriptions.orders.url}#/paths/~1refunds' },
    ])
    expect(codes(check(data, [openapiSibling]))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })

  it('warns on an `operationPath` that names a document by URL', () => {
    // The pointer form is the only one that can land inside a sibling. A bare
    // URL is the absolute-source case wearing a different field name, and the
    // rule refuses it for the same reason.
    const data = description(OPENAPI_SOURCE, [
      { stepId: 'a', operationPath: 'https://api.example.com/openapi.yaml#/paths/~1refunds/post' },
    ])
    expect(codes(check(data, [openapiSibling]))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })
})

describe('clause 2, AsyncAPI source — a channel or an operation a step names', () => {
  it('resolves a `channelPath` into the `channels` map, keyed by channelId', () => {
    const data = description(ASYNCAPI_SOURCE, [
      { stepId: 'a', channelPath: '{$sourceDescriptions.transport.url}#/channels/order-paid', action: 'receive' },
    ])
    expect(check(data, [asyncapiSibling])).toEqual([])
  })

  it('warns on a `channelPath` naming the channel’s address instead of its id', () => {
    // The distinction the drawing cannot show and an author gets wrong first:
    // the pointer walks the map's KEYS, and `address` is a field inside the
    // value. This is the likeliest real drift in the shipped corpus.
    const data = description(ASYNCAPI_SOURCE, [
      { stepId: 'a', channelPath: '{$sourceDescriptions.transport.url}#/channels/acme.order-paid.v1' },
    ])
    const [diagnostic] = check(data, [asyncapiSibling])

    expect(diagnostic.message).toBe(
      'workflows[0].steps[0]: channelPath "{$sourceDescriptions.transport.url}#/channels/acme.order-paid.v1"' +
        ' resolves to no channel in source "transport"',
    )
  })

  it('resolves an `operationId` against the keys of the `operations` map', () => {
    // The one resolution rule the framework had to mint. Arazzo says an
    // `operationId` names an operation of the source description; AsyncAPI 3
    // names its operations by map key, with no id field inside them. Nothing
    // else in the catalog would resolve `brass`'s eleven bare operationIds.
    const data = description(ASYNCAPI_SOURCE, [{ stepId: 'a', operationId: 'publish-order-paid' }])
    expect(check(data, [asyncapiSibling])).toEqual([])
  })

  it('warns on an `operationId` that is a channelId rather than an operation', () => {
    const data = description(ASYNCAPI_SOURCE, [{ stepId: 'a', operationId: 'order-paid' }])
    expect(codes(check(data, [asyncapiSibling]))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })

  it('resolves an `operationPath` at a member of the `operations` map', () => {
    const data = description(ASYNCAPI_SOURCE, [
      { stepId: 'a', operationPath: '{$sourceDescriptions.transport.url}#/operations/publish-order-paid' },
    ])
    expect(check(data, [asyncapiSibling])).toEqual([])
  })

  it('resolves a bare `#/…` pointer, which names no source, against every source', () => {
    // The symmetry with a bare `operationId`: a reference that names no source
    // description names all of them, and resolving in any one satisfies the rule.
    const data = description(ASYNCAPI_SOURCE, [{ stepId: 'a', channelPath: '#/channels/order-paid' }])
    expect(check(data, [asyncapiSibling])).toEqual([])
  })
})

/* --------------------------------- clause 2: a pointer must land on a target */

describe('a pointer that walks is not a pointer that lands', () => {
  const pointerStep = (fragment: string) =>
    description(ASYNCAPI_SOURCE, [
      { stepId: 'a', channelPath: `{$sourceDescriptions.transport.url}${fragment}`, action: 'receive' },
    ])

  // Every one of these resolves to a node of the transport document, and not one
  // of them is a channel. `#/channels/order-paid/messages` is the one an author
  // writes by accident: a real mapping, one segment inside a real channel.
  it.each([
    '#/info/title',
    '#/',
    '#/channels/order-paid/messages',
    '#/channels/order-paid/address',
    '#/servers',
    '#/operations/publish-order-paid',
  ])(
    'warns on a `channelPath` at %s, which is a node of the document and not a channel',
    (fragment) => {
      const [diagnostic] = check(pointerStep(fragment), [asyncapiSibling])
      expect(diagnostic?.code).toBe('W_PROTO_ARAZZO_UNGROUNDED')
      expect(diagnostic?.message).toContain('resolves to no channel in source "transport"')
    },
  )

  it('warns on a bare `#/…` pointer that lands on a node no source calls a channel', () => {
    const data = description(ASYNCAPI_SOURCE, [{ stepId: 'a', channelPath: '#/info' }])
    expect(codes(check(data, [asyncapiSibling]))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })

  it('warns on a `channelPath` naming an OpenAPI source, which declares no channels at all', () => {
    const data = description(OPENAPI_SOURCE, [
      { stepId: 'a', channelPath: '{$sourceDescriptions.orders.url}#/paths/~1refunds' },
    ])
    expect(codes(check(data, [openapiSibling]))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })
})

/* ------------------------------------------------- clause 2: nested workflows */

describe('clause 2 — a workflow a step names', () => {
  it('resolves a `workflowId` against this same document', () => {
    // ADR 0020 decision 8 forbids a split Description, so a nested workflow has
    // nowhere else it could live.
    const data = {
      arazzo: '1.1.0',
      sourceDescriptions: [OPENAPI_SOURCE],
      workflows: [
        { workflowId: 'main', steps: [{ stepId: 'delegate', workflowId: 'refund' }] },
        { workflowId: 'refund', steps: [{ stepId: 'a', operationId: 'requestRefund' }] },
      ],
    }
    expect(check(data, [openapiSibling])).toEqual([])
  })

  it('warns on a `workflowId` that is not a workflow of this document', () => {
    const data = description(OPENAPI_SOURCE, [{ stepId: 'delegate', workflowId: 'refund' }])
    const [diagnostic] = check(data, [openapiSibling])

    expect(diagnostic.message).toBe(
      'workflows[0].steps[0]: workflowId "refund" is not a workflow of this document',
    )
  })

  it('checks a nested workflow even when the document declares no source at all', () => {
    const data = {
      arazzo: '1.1.0',
      workflows: [{ workflowId: 'main', steps: [{ stepId: 'delegate', workflowId: 'nowhere' }] }],
    }
    expect(codes(check(data, []))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })

  it('reports a missing `sourceDescriptions` once, on the missing list', () => {
    const data = {
      arazzo: '1.1.0',
      workflows: [
        {
          workflowId: 'main',
          steps: [
            { stepId: 'a', operationId: 'requestRefund' },
            { stepId: 'b', operationId: 'getRefund' },
          ],
        },
      ],
    }
    const diagnostics = check(data, [openapiSibling])

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].message).toBe(
      'sourceDescriptions: the document names an operation or channel and declares no source description' +
        ' that names a document, so nothing in this entity grounds it',
    )
  })

  it('still judges a `workflowId` that follows a groundless reference in the same file', () => {
    // The missing-source finding is filed once and the walk goes on. A `break`
    // here would let one defect swallow an unrelated second one: `workflowId`
    // resolves inside this same document and needs no source description at all.
    const data = {
      arazzo: '1.1.0',
      workflows: [
        { workflowId: 'main', steps: [{ stepId: 'a', operationId: 'requestRefund' }] },
        { workflowId: 'second', steps: [{ stepId: 'b', workflowId: 'NO_SUCH_WORKFLOW' }] },
      ],
    }
    const messages = check(data, [openapiSibling]).map((d) => d.message)

    expect(messages).toEqual([
      'sourceDescriptions: the document names an operation or channel and declares no source description' +
        ' that names a document, so nothing in this entity grounds it',
      'workflows[1].steps[0]: workflowId "NO_SUCH_WORKFLOW" is not a workflow of this document',
    ])
  })

  it('files the groundless finding once however many steps name an operation', () => {
    const data = {
      arazzo: '1.1.0',
      sourceDescriptions: [{ name: 'orders', type: 'openapi' }],
      workflows: [
        {
          workflowId: 'main',
          steps: [
            { stepId: 'a', operationId: 'requestRefund' },
            { stepId: 'b', operationId: 'getRefund' },
            { stepId: 'c', channelPath: '#/channels/order-paid' },
          ],
        },
      ],
    }
    const diagnostics = check(data, [openapiSibling])

    // A source description with no `url` is silence 2 — it names no document —
    // so the list is empty for grounding purposes and the message says exactly
    // that rather than claiming the document declares no source at all.
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].message).toMatch(/^sourceDescriptions: /)
  })
})

/* ------------------------------------------------------- where it stays quiet */

describe('the silences, each of them a position', () => {
  it('judges no reference against a grounding document in a grammar it cannot read', () => {
    // A mini-spec `transport.yaml` carries a surface LIST under `channels`, not
    // AsyncAPI's map. Warning here would report the Arazzo file for a defect in
    // the transport — if it is a defect at all — and the transport has no reader
    // of its own yet to say so.
    const data = description(ASYNCAPI_SOURCE, [
      { stepId: 'a', channelPath: '{$sourceDescriptions.transport.url}#/channels/settle' },
    ])
    expect(check(data, [{ file: 'transport.yaml', data: MINI_SPEC_TRANSPORT }])).toEqual([])
  })

  it('judges no reference against a sibling that did not parse', () => {
    // The loader already carries the complaint about the file, and `data` is
    // null. Grounded, unjudged.
    const data = description(ASYNCAPI_SOURCE, [
      { stepId: 'a', channelPath: '{$sourceDescriptions.transport.url}#/channels/order-paid' },
    ])
    expect(check(data, [{ file: 'transport.yaml', data: null }])).toEqual([])
  })

  it('says nothing about `dependsOn` or about an action’s targets', () => {
    // The rule is about references between artifacts. Intra-workflow control
    // flow is the drawing's business: `arazzoGraph` reports an unresolved
    // `dependsOn` as a note under the picture, which is a different claim from a
    // diagnostic on the catalog.
    const data = description(OPENAPI_SOURCE, [
      {
        stepId: 'a',
        operationId: 'requestRefund',
        dependsOn: ['no-such-step'],
        onSuccess: [{ name: 'go', type: 'goto', stepId: 'also-missing' }],
        onFailure: [{ name: 'bail', type: 'goto', workflowId: 'not-a-workflow' }],
      },
    ])
    expect(check(data, [openapiSibling])).toEqual([])
  })

  it('says nothing about a step that references nothing', () => {
    const data = description(OPENAPI_SOURCE, [{ stepId: 'a', description: 'A step with no reference.' }])
    expect(check(data, [openapiSibling])).toEqual([])
  })

  it('says nothing about a document that is not a mapping', () => {
    for (const input of [null, undefined, [], 'arazzo: 1.1.0', 7]) {
      expect(check(input, [openapiSibling])).toEqual([])
    }
  })

  it('checks the sources of a document carrying no `workflows` array', () => {
    // The reader beside this module returns null here — "the picture has no
    // subject" — and a document with no workflows can still name a source that
    // is not there. Clause 1 is decided before any step is looked at, which is
    // why nothing here is built on `readArazzo`.
    const data = { arazzo: '1.1.0', sourceDescriptions: [{ ...OPENAPI_SOURCE, url: './missing.yaml' }] }
    expect(codes(check(data, [openapiSibling]))).toEqual(['W_PROTO_ARAZZO_UNGROUNDED'])
  })
})

/* --------------------------------------------------------- several sources */

describe('a document declaring more than one source', () => {
  const twoSources = (steps: Array<Record<string, unknown>>) => ({
    arazzo: '1.1.0',
    sourceDescriptions: [OPENAPI_SOURCE, ASYNCAPI_SOURCE],
    workflows: [{ workflowId: 'main', steps }],
  })
  const both = [openapiSibling, asyncapiSibling]

  it('searches every source for a bare `operationId`', () => {
    // Deliberately not what the drawing does. `arazzo.ts` attributes a bare id
    // to the only source and to nothing when there are several, because a
    // picture that guesses invents. The rule says the reference must resolve
    // into *a* document `sourceDescriptions` names, so finding it in any of them
    // satisfies it — two jobs, two right answers.
    expect(check(twoSources([{ stepId: 'a', operationId: 'requestRefund' }]), both)).toEqual([])
    expect(check(twoSources([{ stepId: 'b', operationId: 'publish-order-paid' }]), both)).toEqual([])
  })

  it('warns on a bare `operationId` no source carries, naming neither', () => {
    const [diagnostic] = check(twoSources([{ stepId: 'a', operationId: 'nowhere' }]), both)
    expect(diagnostic.message).toBe(
      'workflows[0].steps[0]: operationId "nowhere" resolves to no operation in any document this entity carries',
    )
  })

  it('holds a named reference to the source it names, and to that one only', () => {
    // `requestRefund` exists — in the other source. A named reference does not
    // get to borrow it.
    const [diagnostic] = check(
      twoSources([{ stepId: 'a', operationId: '$sourceDescriptions.transport.requestRefund' }]),
      both,
    )
    expect(diagnostic.message).toBe(
      'workflows[0].steps[0]: operationId "$sourceDescriptions.transport.requestRefund"' +
        ' resolves to no operation in source "transport"',
    )
  })
})
