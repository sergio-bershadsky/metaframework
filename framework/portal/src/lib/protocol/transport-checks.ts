import type { ArtifactDialect, Diagnostic } from '../catalog/types'
import { SrnError, resolveRef } from '../srn/srn'

/**
 * `transport.yaml`, in both of its dialects — the five classes
 * `kinds/protocol.md` states about the file's own shape.
 *
 * | Code                              | Dialect   | What it judges                                      |
 * | --------------------------------- | --------- | --------------------------------------------------- |
 * | `E_PROTO_TRANSPORT_SCHEMA`        | mini-spec | the field tables — unknown non-`x-` key, bad type   |
 * | `E_PROTO_TRANSPORT_BINDING`       | mini-spec | which block is present, and its own required fields |
 * | `E_PROTO_TRANSPORT_SPEC_CONFLICT` | mini-spec | `spec` XOR the block's surface list                 |
 * | `E_PROTO_TRANSPORT_ASYNCAPI`      | AsyncAPI  | the six-rule profile, one class for the whole of it |
 * | `W_PROTO_TRANSPORT_HOST`          | AsyncAPI  | a literal host, which is a deployment fact          |
 *
 * The dialect split is the spec's own: "`E_PROTO_TRANSPORT_SCHEMA`,
 * `E_PROTO_TRANSPORT_BINDING` and `E_PROTO_TRANSPORT_SPEC_CONFLICT` are
 * mini-spec-only, and `E_PROTO_TRANSPORT_ASYNCAPI` is the other dialect's single
 * class." Nothing here fires across that line.
 *
 * ## Where the line between SCHEMA and BINDING falls
 *
 * The two definition rows in "Protocol error classes" draw it, and it is not
 * where the code names suggest. `E_PROTO_TRANSPORT_BINDING` is "binding block
 * key ≠ `kind`, block missing, **or a required binding field absent**", so a
 * `http` block with no `base-path` is a *binding* finding, not a schema one.
 * `E_PROTO_TRANSPORT_SCHEMA` is the field tables themselves — "unknown non-`x-`
 * key, bad type" — and it "covers the whole mini-spec field table", which the
 * `x-` rule and the published meta-schema both extend "at the top level **and
 * inside entries**".
 *
 * That leaves one depth the two rows do not name between them: a required field
 * of an *entry* — an operation with no `method`, a topic with no `name`. It is
 * read as `E_PROTO_TRANSPORT_SCHEMA` here, because "a required **binding** field"
 * is a field of the block and an entry is a level below it. Reasonable readers
 * could put it in the other class; the choice is recorded rather than hidden.
 *
 * ## Which dialect a file is in is read, never sniffed
 *
 * `lib/catalog/dialects.ts` has already decided it and recorded the answer on
 * {@link ArtifactDialect}, so this module is *handed* the ruling rather than
 * repeating it — and the difference is a case `kinds/protocol.md` works through
 * explicitly. A file declaring **both** keys is read as the mini-spec, because
 * the loader takes the first matching row and `$schema` is first; `asyncapi:` is
 * a foreign key, so it is not stripped, and the mini-spec field table then
 * rejects it as an unknown non-`x-` top-level key. A module that sniffed
 * `data.asyncapi` would read that same file as AsyncAPI and print the opposite
 * verdict on the spec's own worked counter-example.
 *
 * An unrecognised header — `asyncapi: 2.6.0` — is `W_ARTIFACT_DIALECT` from the
 * loader and is then read as the **legacy** dialect, which for this role is the
 * mini-spec ([structure.md](../../../../spec/structure.md), "The legacy dialect,
 * and its warning": the file "is still checked against the legacy grammar"). So
 * only a *known* AsyncAPI header takes the profile branch.
 *
 * ## What this module is deliberately silent about
 *
 * Silence is a position, and it is taken five times.
 *
 * 1. **`spec.file` existence and path escapes** are `E_PROTO_SPEC_FILE`, a
 *    dialect-independent class with its own owner. Only the field's *type* is
 *    judged here, because that much is the field table's.
 * 2. **Payload references** — `message`, `request`, `response`, `x-srn-payload`
 *    — are `E_PROTO_PAYLOAD_KIND`, likewise. A reference is checked to be a
 *    string and never resolved.
 * 3. **`spec: { format: asyncapi }` on a kafka/websocket/amqp transport** is
 *    `W_PROTO_SPEC_ASYNCAPI`, a different class about a different fact (where a
 *    description should live, not whether this document is well shaped).
 * 4. **Everything in an AsyncAPI document outside the six profile rules.**
 *    "Validating the document against the full AsyncAPI specification is
 *    deferred: it is a warn-only lint over an external tool, not a parser this
 *    framework owns." So no unknown-key rule, no bindings grammar, no
 *    `defaultContentType` enumeration — those bytes ride raw and derive nothing.
 * 5. **A document that did not parse.** `artifact.error` already carries the
 *    loader's complaint; a second one about its shape is noise on a file nobody
 *    can act on yet. A file that parsed to a *non-mapping* is a different case
 *    and is reported, because the mini-spec field table is a table of keys.
 */

/* --------------------------------------------------------------- utilities */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The word a message uses for what arrived instead of what the table asked for. */
function typeName(value: unknown): string {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return 'a list'
  if (isRecord(value)) return 'a mapping'
  return `a ${typeof value}`
}

function quote(values: readonly string[]): string {
  return values.join(' | ')
}

/** Somewhere to put a complaint: a position in the document and a sentence. */
type Report = (where: string, message: string) => void

/** One cell of a field table: does this value satisfy the row? */
type Check = (value: unknown, where: string, report: Report) => void

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

interface TextOptions {
  max?: number
  /** `summary` is "string, one line". */
  oneLine?: boolean
  /** `base-path` and `path` start with `/`. */
  startsWith?: string
  kebab?: boolean
  /** `amqp.exchange` "may be empty for the default exchange". */
  allowEmpty?: boolean
}

function text(options: TextOptions = {}): Check {
  return (value, where, report) => {
    if (typeof value !== 'string') return report(where, `must be a string, not ${typeName(value)}`)
    if (value.length === 0 && options.allowEmpty !== true) return report(where, 'must not be empty')
    if (options.kebab && value.length > 0 && !KEBAB.test(value)) report(where, `"${value}" must be kebab-case`)
    if (options.max !== undefined && value.length > options.max) {
      report(where, `must be at most ${options.max} characters (it is ${value.length})`)
    }
    if (options.oneLine && value.includes('\n')) report(where, 'must be a single line')
    if (options.startsWith !== undefined && !value.startsWith(options.startsWith)) {
      report(where, `"${value}" must start with "${options.startsWith}"`)
    }
  }
}

function oneOf(values: readonly string[]): Check {
  return (value, where, report) => {
    if (typeof value !== 'string') return report(where, `must be a string, not ${typeName(value)}`)
    if (!values.includes(value)) report(where, `"${value}" is not one of ${quote(values)}`)
  }
}

function bool(): Check {
  return (value, where, report) => {
    if (typeof value !== 'boolean') report(where, `must be a boolean, not ${typeName(value)}`)
  }
}

function integer(min: number): Check {
  return (value, where, report) => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return report(where, `must be an integer, not ${typeName(value)}`)
    }
    if (value < min) report(where, `must be at least ${min}`)
  }
}

function listOf(item: Check): Check {
  return (value, where, report) => {
    if (!Array.isArray(value)) return report(where, `must be a list, not ${typeName(value)}`)
    value.forEach((entry, index) => item(entry, `${where}[${index}]`, report))
  }
}

/**
 * An SRN reference to a datamodel. Judged as a string and no further: whether it
 * resolves, and to what kind, is `E_PROTO_PAYLOAD_KIND` — see the docblock.
 */
function reference(): Check {
  return text()
}

interface ObjectShape {
  fields: Record<string, Check>
  required: readonly string[]
  /** What the object is called in a complaint: `a topic`, `the spec link`. */
  noun: string
}

/**
 * A mapping with a closed field table and the `x-` hatch.
 *
 * The hatch is the rule stated in "Entity directory shape": in `transport.yaml`,
 * "at the top level **and inside entries**, an unknown key is rejected unless it
 * is prefixed `x-`". So every object in this document — the root, a binding
 * block, one operation, the `spec` link — admits `x-` and rejects the rest.
 */
function object(shape: ObjectShape): Check {
  return (value, where, report) => {
    if (!isRecord(value)) return report(where, `must be a mapping, not ${typeName(value)}`)
    checkObject(value, shape, where, report)
  }
}

function checkObject(record: Record<string, unknown>, shape: ObjectShape, where: string, report: Report): void {
  const at = (key: string) => (where === '' ? key : `${where}.${key}`)

  for (const key of Object.keys(record)) {
    if (key.startsWith('x-')) continue
    if (key in shape.fields) continue
    report(at(key), `unknown key — ${shape.noun} admits ${quote(Object.keys(shape.fields))}, or an "x-" key`)
  }
  for (const key of shape.required) {
    if (!(key in record)) report(at(key), `${shape.noun} requires "${key}"`)
  }
  for (const [key, check] of Object.entries(shape.fields)) {
    if (key in record) check(record[key], at(key), report)
  }
}

/* --------------------------------------------------- the mini-spec dialect */

const KINDS = ['http', 'grpc', 'amqp', 'kafka', 'websocket', 'in-process'] as const
type TransportKind = (typeof KINDS)[number]

const ENCODINGS = ['json', 'avro', 'protobuf', 'msgpack', 'xml', 'text', 'binary'] as const
const SPEC_FORMATS = ['openapi', 'asyncapi', 'protobuf', 'graphql', 'json-schema'] as const
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const

const SPEC_LINK = object({
  noun: 'the spec link',
  fields: {
    format: oneOf(SPEC_FORMATS),
    // Relative, existing, no `..` — all three are E_PROTO_SPEC_FILE and none of
    // them is judged here. The row's *type* is this table's.
    file: text(),
    version: text(),
  },
  required: ['format', 'file'],
})

/** One binding block: its own fields, its surface list, and the entry shape. */
interface Block {
  /** The block's enumeration of what the transport offers. */
  surface: string
  /** Fields other than the surface list. */
  fields: Record<string, Check>
  required: readonly string[]
  entry: ObjectShape
  /**
   * `kafka.topics` is the one surface list the field table marks "yes, unless
   * `spec` is present" — every other block's is optional outright.
   */
  surfaceRequiredWithoutSpec?: boolean
}

const BLOCKS: Record<TransportKind, Block> = {
  http: {
    surface: 'operations',
    fields: { 'base-path': text({ startsWith: '/' }), tls: bool() },
    required: ['base-path'],
    entry: {
      noun: 'an operation',
      fields: {
        name: text({ kebab: true, max: 64 }),
        method: oneOf(METHODS),
        // "may contain {param} placeholders" — which is a note about the value,
        // not a grammar this document states, so nothing here parses one.
        path: text({ startsWith: '/' }),
        request: reference(),
        response: reference(),
        summary: text(),
      },
      required: ['name', 'method', 'path'],
    },
  },
  grpc: {
    surface: 'methods',
    // `package` is "an external identifier, not kebab-constrained" — the proto's
    // own naming, so the check is that it is a string and nothing more.
    fields: { package: text(), service: text(), tls: bool() },
    required: ['package', 'service'],
    entry: {
      noun: 'a method',
      fields: {
        name: text(),
        request: reference(),
        response: reference(),
        streaming: oneOf(['none', 'client', 'server', 'bidi']),
        summary: text(),
      },
      required: ['name'],
    },
  },
  amqp: {
    surface: 'bindings',
    fields: {
      exchange: text({ allowEmpty: true }),
      'exchange-type': oneOf(['direct', 'topic', 'fanout', 'headers']),
      durable: bool(),
    },
    required: ['exchange', 'exchange-type'],
    entry: {
      noun: 'a binding',
      fields: { 'routing-key': text(), queue: text(), message: reference(), summary: text() },
      required: ['routing-key', 'queue'],
    },
  },
  kafka: {
    surface: 'topics',
    fields: { cluster: text() },
    required: [],
    surfaceRequiredWithoutSpec: true,
    entry: {
      noun: 'a topic',
      fields: {
        // Kafka naming, not kebab-constrained.
        name: text(),
        key: text(),
        message: reference(),
        partitions: integer(1),
        retention: text(),
        summary: text(),
      },
      required: ['name'],
    },
  },
  websocket: {
    surface: 'channels',
    fields: { path: text({ startsWith: '/' }), subprotocol: text(), tls: bool() },
    required: ['path'],
    entry: {
      noun: 'a channel',
      fields: {
        name: text({ kebab: true, max: 64 }),
        direction: oneOf(['client-to-server', 'server-to-client', 'bidi']),
        message: reference(),
        summary: text(),
      },
      required: ['name', 'direction'],
    },
  },
  'in-process': {
    surface: 'functions',
    fields: { language: text(), module: text(), interface: text() },
    required: ['language', 'module'],
    entry: {
      noun: 'a function',
      fields: { name: text(), request: reference(), response: reference(), summary: text() },
      required: ['name'],
    },
  },
}

/** The top-level rows that are not a binding block. */
const TOP_LEVEL: Record<string, Check> = {
  kind: oneOf(KINDS),
  summary: text({ max: 200, oneLine: true }),
  encoding: oneOf(ENCODINGS),
  auth: listOf(text({ kebab: true, max: 64 })),
  spec: SPEC_LINK,
}

/**
 * Every key the root admits by name. The six binding blocks are *known* keys
 * whose presence is `E_PROTO_TRANSPORT_BINDING`'s business rather than
 * `E_PROTO_TRANSPORT_SCHEMA`'s: `grpc:` beside `kind: http` is a second
 * transport, not an unknown key, and the spec reports it as the former.
 *
 * `$schema` is admitted for the reason `workflow.ts` admits it — the loader has
 * already stripped it, so nothing in the catalog depends on the admission, and a
 * caller holding raw file bytes gets the legacy dialect read rather than an
 * unknown-key error on the one line the dialect contract told the author to
 * write. A key that merely *resembles* the header (`schema:`) is not admitted,
 * which is the spec's own counter-example.
 */
const ROOT_KEYS = new Set(['$schema', ...Object.keys(TOP_LEVEL), ...KINDS])

function miniSpecDiagnostics(data: unknown, schema: Report, binding: Report, conflict: Report): void {
  if (!isRecord(data)) {
    schema('', `transport.yaml must be a mapping of the mini-spec fields, not ${typeName(data)}`)
    return
  }

  /* --- the field table ---------------------------------------------------- */

  for (const key of Object.keys(data)) {
    if (key.startsWith('x-') || ROOT_KEYS.has(key)) continue
    schema(key, `unknown key — the transport field table admits ${quote([...ROOT_KEYS].filter((k) => k !== '$schema'))}, or an "x-" key`)
  }
  for (const [key, check] of Object.entries(TOP_LEVEL)) {
    if (key in data) check(data[key], key, schema)
  }
  if (!('kind' in data)) schema('kind', 'the transport field table requires "kind"')

  /* --- the binding block -------------------------------------------------- */

  const kind = typeof data.kind === 'string' && (KINDS as readonly string[]).includes(data.kind)
    ? (data.kind as TransportKind)
    : null

  const present = KINDS.filter((candidate) => candidate in data)
  if (kind === null) {
    // Which block *should* be there is unknown, so "the block is missing" and
    // "this block is a second transport" are both unanswerable. The `kind` row
    // above already carries the finding; a second complaint derived from it
    // would report one defect twice.
    return
  }

  for (const other of present) {
    if (other === kind) continue
    binding(
      other,
      `a "${other}" block beside kind "${kind}" is a second transport — one protocol, one transport; a second wire is a second protocol entity`,
    )
  }
  if (!(kind in data)) {
    binding(kind, `kind is "${kind}", so the document needs a "${kind}" binding block`)
    return
  }

  const block = data[kind]
  if (!isRecord(block)) {
    schema(kind, `the ${kind} binding block must be a mapping, not ${typeName(block)}`)
    return
  }

  const shape = BLOCKS[kind]
  const hasSpec = 'spec' in data

  /* --- spec XOR the surface list ------------------------------------------ */

  if (hasSpec && shape.surface in block) {
    conflict(
      `${kind}.${shape.surface}`,
      `"spec" and the surface list are mutually exclusive — either the linked spec file is the single source of operation truth, or "${shape.surface}" is written here`,
    )
  }

  /* --- the block's own required fields ------------------------------------ */

  // "or a required binding field absent" — the third clause of
  // E_PROTO_TRANSPORT_BINDING's definition row. `kafka.topics` is a required
  // binding field conditionally, which is the one thing the field tables say
  // about a surface list's requiredness: "yes, unless `spec` is present".
  const required = [
    ...shape.required,
    ...(!hasSpec && shape.surfaceRequiredWithoutSpec === true ? [shape.surface] : []),
  ]
  for (const field of required) {
    if (field in block) continue
    binding(
      `${kind}.${field}`,
      field === shape.surface
        ? `the ${kind} block requires "${field}" unless the document links a spec`
        : `the ${kind} block requires "${field}"`,
    )
  }

  /* --- the block's own field table ---------------------------------------- */

  checkObject(
    block,
    {
      noun: `the ${kind} block`,
      // Already reported above, in the class whose definition row names them.
      required: [],
      fields: { ...shape.fields, [shape.surface]: listOf(object(shape.entry)) },
    },
    kind,
    schema,
  )
}

/* ---------------------------------------------------- the AsyncAPI dialect */

/**
 * Rule 4's admitted protocols — AsyncAPI's own spellings for the three wires
 * this dialect covers, plain and TLS. `http`, `grpc` and `in-process` have no
 * row: OpenAPI owns the first, AsyncAPI publishes no gRPC binding, and a Server
 * Object REQUIRES a host an in-process call does not have.
 */
const ASYNCAPI_PROTOCOLS = ['kafka', 'kafka-secure', 'ws', 'wss', 'amqp', 'amqps'] as const

/** Rule 3's one honest value: a statement that this document does not version itself. */
const UNVERSIONED = 'unversioned'

/**
 * Does this host string name a deployment, or defer to one?
 *
 * The definition row is "an AsyncAPI server declares a literal `host`", and that
 * is the whole of what fires here. The prose beside rule 4 says more — the host
 * is written "as a bare server variable with a description and **no `default`**,
 * a default being the same fact by another name" — and a `default` is
 * deliberately *not* warned on: the row names one thing, `{host}` with a default
 * is not a literal host, and widening a published class on an inference is a
 * decision for whoever owns the spec rather than for its reader. No shipped
 * document writes one today.
 */
function isLiteralHost(host: string): boolean {
  return !/\{[^{}]+\}/.test(host)
}

function asyncapiDiagnostics(
  data: unknown,
  options: TransportCheckOptions,
  profile: Report,
  host: Report,
): void {
  if (!isRecord(data)) return

  /* --- 1: x-srn names the owning entity ----------------------------------- */

  if (options.srn !== undefined) {
    const declared = data['x-srn']
    if (typeof declared !== 'string') {
      profile('x-srn', `rule 1: the document root must carry "x-srn: ${options.srn}" — an artifact that travels arrives without its directory`)
    } else if (declared !== options.srn) {
      profile('x-srn', `rule 1: "${declared}" is not this protocol's SRN, which is "${options.srn}"`)
    }
  }

  const info = isRecord(data.info) ? data.info : null

  /* --- 2: info.title mirrors the frontmatter ------------------------------ */

  if (options.title !== undefined) {
    const title = info === null ? undefined : info.title
    if (typeof title !== 'string') {
      profile('info.title', `rule 2: must equal the entity's title, "${options.title}"`)
    } else if (title !== options.title) {
      profile('info.title', `rule 2: "${title}" does not equal the entity's title, "${options.title}"`)
    }
  }

  /* --- 3: info.version is the fixed string -------------------------------- */

  const version = info === null ? undefined : info.version
  if (version !== UNVERSIONED) {
    profile(
      'info.version',
      `rule 3: must be exactly "${UNVERSIONED}" — the frontmatter is the only place a version lives, and an artifact has no clock of its own`,
    )
  }

  /* --- 4: exactly one server, on an admitted wire ------------------------- */

  const servers = isRecord(data.servers) ? data.servers : null
  const ids = servers === null ? [] : Object.keys(servers)
  if (servers === null || ids.length !== 1) {
    profile(
      'servers',
      `rule 4: must hold exactly one server (it holds ${servers === null ? 'none' : ids.length}) — a second server is a second wire, which is a second protocol entity`,
    )
  }
  for (const id of ids) {
    const server = servers === null ? null : servers[id]
    if (!isRecord(server)) continue
    const protocol = server.protocol
    if (typeof protocol !== 'string' || !(ASYNCAPI_PROTOCOLS as readonly string[]).includes(protocol)) {
      profile(
        `servers.${id}.protocol`,
        `rule 4: ${typeof protocol === 'string' ? `"${protocol}"` : 'a missing protocol'} is not a wire this dialect covers — one of ${quote(ASYNCAPI_PROTOCOLS)}; every other wire is written in the mini-spec`,
      )
    }

    /* --- W_PROTO_TRANSPORT_HOST ------------------------------------------- */

    // AsyncAPI REQUIRES `host`, and this framework validates none of AsyncAPI's
    // own requiredness — so an absent host is silence here, not a warning about
    // a fact that was never stated.
    if (typeof server.host === 'string' && isLiteralHost(server.host)) {
      host(
        `servers.${id}.host`,
        `"${server.host}" is a literal host, which is a deployment fact this file does not hold — write it as a server variable with a description and no default, and place it in an environment's topology.yaml`,
      )
    }
  }

  /* --- 5: channels is present and non-empty ------------------------------- */

  const channels = isRecord(data.channels) ? data.channels : null
  if (channels === null || Object.keys(channels).length === 0) {
    profile('channels', 'rule 5: must be present and non-empty — it is what the surface list became, so a document without it describes no surface at all')
  }

  /* --- 6: operations name the side they are written from ------------------ */

  const operations = isRecord(data.operations) ? data.operations : null
  if (operations === null || Object.keys(operations).length === 0) return

  const id = data.id
  const participants = resolvedParticipants(options)
  if (typeof id !== 'string') {
    profile(
      'id',
      'rule 6: a document carrying operations must name the participant it is written from — `action` is send/receive relative to one application, and a protocol is a conversation between several',
    )
    return
  }
  // With no participant list there is nothing to compare against, and inventing
  // a verdict from the absence would report the caller's gap as the file's.
  if (participants === null) return
  if (!participants.includes(id)) {
    profile(
      'id',
      `rule 6: "${id}" is not one of this protocol's participants — ${participants.length === 0 ? 'the entity declares none' : `it must be one of ${quote(participants)}, in absolute form`}`,
    )
  }
}

/**
 * The protocol's `participants[].ref`, resolved to the absolute form rule 6
 * compares against. Null when the caller supplied no participants at all.
 *
 * A ref that will not resolve is dropped rather than reported: a broken
 * participant reference is `E_FM_EDGE_TARGET`/`E_PROTO_PARTICIPANT_KIND` on the
 * frontmatter, and repeating it as an AsyncAPI profile violation would blame
 * `transport.yaml` for a defect in `index.md`.
 */
function resolvedParticipants(options: TransportCheckOptions): string[] | null {
  const declared = options.participants
  if (declared === undefined) return null
  const out: string[] = []
  for (const participant of declared) {
    const ref = isRecord(participant) ? participant.ref : undefined
    if (typeof ref !== 'string') continue
    if (options.srn === undefined) {
      out.push(ref)
      continue
    }
    try {
      out.push(resolveRef(options.srn, ref))
    } catch (error) {
      if (!(error instanceof SrnError)) throw error
    }
  }
  return out
}

/* -------------------------------------------------------------------- entry */

export interface TransportCheckOptions {
  /**
   * The dialect the loader read off the file — `artifact.dialect`, verbatim.
   * Absent means the mini-spec: that is what a headerless `transport.yaml` is
   * read as, and what an unrecognised header falls back to.
   */
  dialect?: ArtifactDialect
  /** Catalog-relative path reported on every diagnostic. */
  path?: string
  /** SRN of the owning protocol — profile rule 1, and the base for rule 6. */
  srn?: string
  /** The entity's frontmatter `title` — profile rule 2. Omitted means unchecked. */
  title?: string
  /** The entity's frontmatter `participants` — profile rule 6, as authored. */
  participants?: readonly unknown[]
}

/**
 * Check one `transport.yaml`, in whichever dialect it declares.
 *
 * Pure: the parsed document in, diagnostics out, no filesystem and no catalog.
 * The mini-spec branch and the AsyncAPI branch share no rule, because the spec
 * shares none between them.
 */
export function transportDiagnostics(data: unknown, options: TransportCheckOptions = {}): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const path = options.path ?? 'transport.yaml'
  const emit =
    (code: string, severity: 'error' | 'warning'): Report =>
    (where, message) => {
      diagnostics.push({
        code,
        severity,
        message: where === '' ? message : `${where}: ${message}`,
        path,
        ...(options.srn ? { srn: options.srn } : {}),
      })
    }

  if (options.dialect?.key === 'asyncapi' && options.dialect.known) {
    asyncapiDiagnostics(data, options, emit('E_PROTO_TRANSPORT_ASYNCAPI', 'error'), emit('W_PROTO_TRANSPORT_HOST', 'warning'))
    return diagnostics
  }

  miniSpecDiagnostics(
    data,
    emit('E_PROTO_TRANSPORT_SCHEMA', 'error'),
    emit('E_PROTO_TRANSPORT_BINDING', 'error'),
    emit('E_PROTO_TRANSPORT_SPEC_CONFLICT', 'error'),
  )
  return diagnostics
}
