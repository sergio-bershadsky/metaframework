import type { Artifact, Catalog, Diagnostic, Entity } from '../catalog/types'
import { assertArtifactRole } from '../srn/artifacts'
import { formatSrn, parseSrn, resolveRef } from '../srn/srn'
import { flattenMessages, parseWorkflow } from './workflow'

/**
 * `E_PROTO_PAYLOAD_KIND` and `W_PROTO_WF_CHANNEL_UNKNOWN` — the two rules
 * `kinds/protocol.md` states about what a message *carries* and where it
 * *travels*, and the two that no code in the portal ran.
 *
 * ## Why one module holds both
 *
 * They are not the same subject, and they are here together because they read
 * the same two files from the same side. A protocol's conversation is described
 * twice — `workflows/*.yaml` says who says what to whom, `transport.yaml` says
 * what the wire looks like — and each of these rules joins one document against
 * something outside it: a payload against the catalog's entity graph, a channel
 * against the transport's own surface. Splitting them would mean walking the
 * workflow steps of every protocol twice for two warnings.
 *
 * ## `E_PROTO_PAYLOAD_KIND` — three surfaces, one class
 *
 * "Payload binding to datamodels" names the reference sites exactly, and the
 * class is dialect-independent ("Two dialects of the transport role"):
 *
 * | Surface                                       | Key(s)                            |
 * | --------------------------------------------- | --------------------------------- |
 * | a workflow step                               | `payload`                         |
 * | a mini-spec transport surface-list entry      | `request`, `response`, `message`  |
 * | an AsyncAPI Message Object                    | `x-srn-payload`                   |
 *
 * Each MUST resolve to an entity whose `kind` is `datamodel`, and each rejects
 * an **artifact SRN** under this same class — `srn.md`'s "each of these surfaces
 * also rejects an artifact suffix under its own class". An artifact has no kind,
 * so `/product/shop/datamodel/order.schema@2` is not "a datamodel addressed
 * oddly", it is not an entity at all.
 *
 * The three key lists are read *structurally* rather than by scanning the
 * document for the words. `lib/datamodel/datamodel.ts` does scan — its
 * {@link payloadReferences} is a **join**, and a join may be loose because a
 * candidate that resolves to no datamodel simply drops out. A diagnostic cannot
 * be loose in the same way: the moment a non-resolving candidate becomes a
 * finding, every `message:` that is not a payload becomes a false accusation.
 * `message` is the key that makes this concrete — in a workflow step it is the
 * kebab-case *arrow label* and in a transport surface entry it is the *SRN*, the
 * one collision `kinds/protocol.md` interrupts itself to warn about.
 *
 * The AsyncAPI half is the exception that proves it: `x-srn-payload` is a
 * framework-minted key that means one thing, so finding it anywhere in the
 * document is exact, and walking AsyncAPI's Message Object placement rules
 * (`channels.<id>.messages.<mid>`, `components.messages.<mid>`, and whatever a
 * later minor adds) would be a second, narrower grammar with nothing to gain.
 *
 * ## `W_PROTO_WF_CHANNEL_UNKNOWN` — W9, over two dialects
 *
 * | `transport.yaml` dialect | `channel` matches                                          |
 * | ------------------------ | ---------------------------------------------------------- |
 * | mini-spec                | a surface entry's `name`, `queue`, `routing-key` or `path` |
 * | AsyncAPI                 | a channel's `address` **or** its channelId                 |
 *
 * The debt register said this one "needs transport.yaml validated first, which
 * nothing does". It does not: it needs the file *read*, which is a strictly
 * smaller thing and exactly the licence `lib/protocol/arazzo-grounding.ts`
 * already took for the same document. Nothing here validates a transport — a
 * missing `kind`, an unknown key, a binding block keyed wrong are all
 * `E_PROTO_TRANSPORT_*`, and this module emits none of them and does not care
 * whether they hold. It asks one question of the file: what names does it put on
 * the wire.
 *
 * ## What this module deliberately does not report
 *
 * A reference it cannot resolve — bad syntax, a foreign solution, an artifact
 * suffix outside the addressed kind's role table, or a target that does not
 * exist — is **skipped**, exactly as `resolvedEntityRef` in
 * `lib/datamodel/datamodel.ts` skips it and for the reason stated there: each of
 * those is a different class with its own owner (`E_SRN_SYNTAX`,
 * `E_SRN_CROSS_SOLUTION`, `E_SRN_ARTIFACT`, `E_SRN_DANGLING`), and a second
 * differently-worded complaint about one string is worse than one. V5 is static
 * and precedes every surface class, which is why an *illegal* artifact role is
 * silence here and a *legal* one is a finding — the same split
 * `lib/environment/environment.ts` makes on `E_ENV_TARGET_KIND`.
 *
 * That leaves one real hole, and it is named rather than papered over: on the
 * **transport** surfaces nothing owns those classes yet. `parseWorkflow` already
 * files them for a workflow `payload`, but a `request:` in a surface list that
 * is not an SRN, or that resolves to nothing, is currently reported by no one.
 * W8's `E_SRN_DANGLING` half is unimplemented on all three surfaces.
 */

/* --------------------------------------------------------------- utilities */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

const TRANSPORT_FILE = 'transport.yaml'
const WORKFLOWS_DIR = 'workflows/'

/** The six wires, which are also the six binding-block keys. */
const WIRES = ['http', 'grpc', 'amqp', 'kafka', 'websocket', 'in-process'] as const

/** Surface-list key per binding block — protocol.md, "Surface lists". */
const SURFACE_KEYS = ['operations', 'methods', 'bindings', 'topics', 'channels', 'functions'] as const

/** A surface entry's payload keys, and the fields W9 matches a `channel` against. */
const SURFACE_PAYLOAD_KEYS = ['request', 'response', 'message'] as const
const SURFACE_NAME_KEYS = ['name', 'queue', 'routing-key', 'path'] as const

/** The AsyncAPI dialect's payload key — ADR 0017, "the `x-srn-` extensions". */
const ASYNCAPI_PAYLOAD_KEY = 'x-srn-payload'

/* ------------------------------------------------------------------- entry */

/**
 * Every payload and channel finding in the catalog, in entity order.
 *
 * Composes where the other kind checks compose — it needs the resolved entity
 * graph and nothing else: no schema registry, no directory listing, no git.
 */
export function payloadDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'protocol') continue
    diagnostics.push(...protocolDiagnostics(catalog, entity))
  }
  return diagnostics
}

function protocolDiagnostics(catalog: Catalog, entity: Entity): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const transport = entity.artifacts.find((artifact) => artifact.file === TRANSPORT_FILE && !artifact.error)

  /* --- E_PROTO_PAYLOAD_KIND, on the transport's own surfaces -------------- */

  if (transport) {
    const file = `${entity.relDir}/${transport.file}`
    for (const site of transportPayloads(transport)) {
      const finding = payloadFinding(catalog, entity, site.ref)
      if (finding) diagnostics.push(diagnostic('E_PROTO_PAYLOAD_KIND', 'error', `${site.where}: ${finding}`, file, entity.srn))
    }
  }

  /* --- the workflows: payloads, and W9 ------------------------------------ */

  // Null means "nothing to check a channel against", which is W9's own skip
  // condition rather than a defensive default — see {@link channelNames}.
  const channels = transport ? channelNames(transport) : null

  for (const artifact of entity.artifacts) {
    if (artifact.error) continue
    if (!artifact.file.startsWith(WORKFLOWS_DIR)) continue

    const file = `${entity.relDir}/${artifact.file}`
    // Only `protocolSrn`, and the issues are discarded: this is the parser's
    // *product* — steps with their payload references already resolved against
    // the `workflows/` base URI — and every complaint it can make about the
    // document is already filed by `lib/catalog/artifact-checks.ts`.
    const { workflow } = parseWorkflow(artifact.data, { protocolSrn: entity.srn })
    if (!workflow) continue

    for (const step of flattenMessages(workflow.steps)) {
      if (step.payloadSrn) {
        const finding = payloadFinding(catalog, entity, step.payloadSrn)
        if (finding) {
          diagnostics.push(
            diagnostic('E_PROTO_PAYLOAD_KIND', 'error', `${step.path}.payload: ${finding}`, file, entity.srn),
          )
        }
      }

      if (channels && step.channel && !channels.names.has(step.channel)) {
        diagnostics.push(
          diagnostic(
            'W_PROTO_WF_CHANNEL_UNKNOWN',
            'warning',
            `${step.path}.channel: "${step.channel}" is named by nothing in transport.yaml — ${channels.expected}`,
            file,
            entity.srn,
          ),
        )
      }
    }
  }

  return diagnostics
}

function diagnostic(
  code: string,
  severity: 'error' | 'warning',
  message: string,
  path: string,
  srn: string,
): Diagnostic {
  return { code, severity, message, path, srn }
}

/* ------------------------------------------------------- E_PROTO_PAYLOAD_KIND */

/**
 * The finding one payload reference earns, or null when it is correct or is
 * somebody else's.
 *
 * The reference arrives either as authored (transport surfaces) or already
 * resolved by `parseWorkflow` (workflow steps); both are safe to re-resolve,
 * because an absolute SRN resolves to itself.
 */
function payloadFinding(catalog: Catalog, entity: Entity, reference: string): string | null {
  let parsed
  try {
    parsed = parseSrn(resolveRef(entity.srn, reference))
  } catch {
    // E_SRN_SYNTAX / E_SRN_CROSS_SOLUTION — a different class, and on a workflow
    // step one `parseWorkflow` has already filed.
    return null
  }

  if (parsed.artifact !== null) {
    try {
      assertArtifactRole(parsed.kind, parsed.artifact, reference)
    } catch {
      // V5 is static and precedes every surface class: a suffix outside the
      // addressed kind's role table is `E_SRN_ARTIFACT`, not this.
      return null
    }
    return `"${reference}" addresses the "${parsed.artifact}" artifact of an entity — a payload names the entity, and an artifact has no kind`
  }

  const srn = formatSrn({ ...parsed, version: null })
  const target = catalog.entities.get(srn)
  // Dangling is `E_SRN_DANGLING`'s question (W8's other half), not this one —
  // and an entity that is not there has no kind to be wrong about.
  if (!target) return null
  if (target.kind === 'datamodel') return null

  return `"${reference}" resolves to ${srn}, whose kind is "${target.kind}" — a payload names a datamodel`
}

/**
 * Every payload reference a `transport.yaml` carries, in either dialect.
 *
 * Both dialects are read from one artifact without deciding which one it is,
 * and that is safe rather than sloppy: the two grammars have disjoint carriers.
 * A mini-spec surface list is `<wire>.<surface-key>` holding a *list*, which
 * AsyncAPI's `channels`/`operations` *maps* can never be; `x-srn-payload` is a
 * framework extension that appears in no mini-spec field table. A file declaring
 * both keys is read as the mini-spec by `lib/catalog/dialects.ts`, and would
 * yield the mini-spec's references here for the same reason — its AsyncAPI half
 * carries no surface list.
 */
function transportPayloads(transport: Artifact): Array<{ where: string; ref: string }> {
  const document = transport.data
  if (!isRecord(document)) return []

  const sites: Array<{ where: string; ref: string }> = []

  for (const entry of surfaceEntries(document)) {
    for (const key of SURFACE_PAYLOAD_KEYS) {
      const ref = str(entry.value[key])
      if (ref !== null) sites.push({ where: `${entry.where}.${key}`, ref })
    }
  }

  for (const site of scanKey(document, ASYNCAPI_PAYLOAD_KEY)) sites.push(site)

  return sites
}

/**
 * Every surface-list entry of a mini-spec transport, with its position.
 *
 * The binding block is found by name rather than through `kind:`, because
 * whether the two agree is `E_PROTO_TRANSPORT_BINDING`'s question and a file
 * that gets it wrong still has payload references in it worth checking. Same
 * for the surface key: any of the six inside any of the six, holding a list.
 */
function surfaceEntries(document: Record<string, unknown>): Array<{ where: string; value: Record<string, unknown> }> {
  const entries: Array<{ where: string; value: Record<string, unknown> }> = []

  for (const wire of WIRES) {
    const block = document[wire]
    if (!isRecord(block)) continue
    for (const surface of SURFACE_KEYS) {
      const list = block[surface]
      if (!Array.isArray(list)) continue
      list.forEach((item, index) => {
        if (isRecord(item)) entries.push({ where: `${wire}.${surface}[${index}]`, value: item })
      })
    }
  }

  return entries
}

/** Every string value sitting under `key`, anywhere in the document, as a JSON pointer. */
function scanKey(node: unknown, key: string, pointer = ''): Array<{ where: string; ref: string }> {
  const found: Array<{ where: string; ref: string }> = []

  if (Array.isArray(node)) {
    node.forEach((item, index) => found.push(...scanKey(item, key, `${pointer}/${index}`)))
    return found
  }
  if (!isRecord(node)) return found

  for (const [name, value] of Object.entries(node)) {
    const at = `${pointer}/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`
    const ref = str(value)
    if (name === key && ref !== null) found.push({ where: at, ref })
    else found.push(...scanKey(value, key, at))
  }
  return found
}

/* --------------------------------------------- W_PROTO_WF_CHANNEL_UNKNOWN */

interface ChannelNames {
  names: Set<string>
  /** What the message tells the author to look at. */
  expected: string
}

/**
 * What a step's `channel` may name, or null when W9 does not run.
 *
 * **The skip condition, and where it departs from the letter of the spec.**
 * `kinds/protocol.md` says W9 "is skipped entirely only when there is nothing to
 * check against: no `transport.yaml`, or a mini-spec one that links a `spec`
 * instead of declaring a surface list". Read as an exhaustive enumeration, a
 * mini-spec transport that declares neither a `spec` nor a surface list — legal
 * on five of the six wires, where the surface list is OPTIONAL — would make
 * every `channel` in the protocol a warning. This implements the governing
 * clause instead: **an empty name set is "nothing to check against"**, however
 * it came to be empty. Warning otherwise would report the absence of an optional
 * declaration as the catalog's error, which is the exact move the spec's own
 * parenthetical rejects one line later ("the absence of a check is not a
 * warning"). The two readings agree on every protocol in `solutions/` today.
 *
 * A file that declares a `spec` **and** a surface list is `E_PROTO_TRANSPORT_SPEC_CONFLICT`
 * and is checked against the list it declares: "instead of" is what makes the
 * spec-link case a skip, and a document that did not choose has still named the
 * surface.
 */
function channelNames(transport: Artifact): ChannelNames | null {
  const document = transport.data
  if (!isRecord(document)) return null

  const asyncapi = isAsyncApi(transport, document)
  const names = new Set<string>()

  if (asyncapi) {
    const channels = document.channels
    if (isRecord(channels)) {
      for (const [channelId, channel] of Object.entries(channels)) {
        names.add(channelId)
        if (isRecord(channel)) {
          const address = str(channel.address)
          if (address !== null) names.add(address)
        }
      }
    }
  } else {
    for (const entry of surfaceEntries(document)) {
      for (const key of SURFACE_NAME_KEYS) {
        const name = str(entry.value[key])
        if (name !== null) names.add(name)
      }
    }
  }

  if (names.size === 0) return null
  return {
    names,
    expected: asyncapi
      ? 'in the AsyncAPI dialect a channel matches a channel `address` or its channelId'
      : 'in the mini-spec a channel matches a surface entry’s `name`, `queue`, `routing-key` or `path`',
  }
}

/**
 * Which dialect this `transport.yaml` is written in.
 *
 * `Artifact.dialect` is the loader's own ruling and is authoritative when it is
 * there — it is what decides that a file declaring *both* keys is read as the
 * mini-spec. The fallback sniffs the `asyncapi` key, which is legitimate here
 * and nowhere else: it is a native discriminator, so unlike `$schema` it is
 * never stripped from `data`, and it is present exactly when the document
 * declares itself AsyncAPI.
 *
 * **`known` is part of the ruling, not a detail of the warning.** An
 * `asyncapi: 2.6.0` document declares a version outside the row's band, and
 * `structure.md` says what happens then in the same sentence that raises
 * `W_ARTIFACT_DIALECT`: "an artifact declares no dialect, **or one unknown for
 * its role**; read as the legacy dialect", and "the file is still parsed, still
 * rendered, and still checked against the legacy grammar". So an unrecognised
 * version falls back to the mini-spec here — which is also what
 * `transport-checks.ts` does with the same file. The two modules read one
 * document and must not disagree about which grammar it is in; before this line
 * they did, and the file where they disagreed was the only one where it was
 * observable.
 */
function isAsyncApi(transport: Artifact, document: Record<string, unknown>): boolean {
  if (transport.dialect) return transport.dialect.key === 'asyncapi' && transport.dialect.known
  return typeof document.asyncapi === 'string'
}
