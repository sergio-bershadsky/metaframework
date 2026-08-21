import { metaSchemaUrl } from '../schema/url'
import { ARTIFACT_ROLES } from '../srn/artifacts'
import type { EntityKind } from './frontmatter'
import type { Artifact } from './types'

/**
 * The discriminator table — ADR 0015, "Artifacts declare their dialect".
 *
 * A role names a file, never a format ([0014](srn://metaframework/adr/0014-artifact-addresses)),
 * so a payload may standardize inside a filename that does not move:
 * `transport.yaml` has become AsyncAPI on the wires AsyncAPI describes,
 * `config.yaml` grows typed values, `states.json` is already XState. A reader
 * cannot perform a migration it cannot detect, and shape-sniffing is a second
 * grammar nobody wrote down — so every artifact says, in its own bytes, which
 * grammar it is written in.
 *
 * Where the format already names itself the native key is used and the framework
 * invents nothing (`openapi:`, `asyncapi:`, and `schema.json`'s own `$schema`).
 * Where it does not, the file carries `$schema:` holding the canonical URL of the
 * framework meta-schema that defines the dialect — the same URL
 * {@link metaSchemaUrl} builds for any other datamodel, because that is exactly
 * what a meta-schema is.
 *
 * Two properties of this module are load-bearing:
 *
 * - **Its rows come from the role table.** {@link ARTIFACT_ROLES} is the spec
 *   constant that maps kind × role to a fixed filename, and a dialect is a
 *   property of a file's *contents*. Deriving the match from that table rather
 *   than restating filenames here is what keeps a new role from silently having
 *   no dialect rule — {@link DIALECTS} must name every row, `null` included.
 * - **A framework-owned key never reaches a validator.** {@link adoptDialect}
 *   records the dialect and then deletes the key from the parse product, so
 *   `states.ts`, `workflow.ts` and `journey.ts` keep rejecting unknown keys and
 *   the `x-` escape hatch stays what it is: a hatch for *authors'* keys. A
 *   native discriminator belongs to its own format and is never stripped.
 *
 * Absent or unrecognised is the **legacy dialect**: the format as the spec
 * defines it today, warned (`W_ARTIFACT_DIALECT`) and never broken. Nothing here
 * can make a catalog that loads today stop loading.
 */

/** One recognised dialect of one role. */
export interface Dialect {
  /** Top-level key that declares it. */
  key: string
  /** The value a file must carry to be read as this dialect. */
  value: string
  /**
   * Framework-owned keys are deleted from `Artifact.data` once read. A format's
   * own key is part of the document and stays.
   */
  owned: boolean
  /** Widened recognition, where the standard versions itself. */
  recognises?: (declared: string) => boolean
}

interface RoleDialects {
  /**
   * Known dialects, most canonical first — the first is what an absent header is
   * told to add, and the order is how a file declaring two keys is read.
   */
  dialects: readonly Dialect[]
  /**
   * Whether an absent or unrecognised header raises `W_ARTIFACT_DIALECT`. False
   * only where the kind already carries an *error* class for the same fact.
   */
  warns: boolean
}

/** A framework meta-schema dialect: `$schema`, owned, at the canonical URL. */
function meta(name: string): Dialect {
  return { key: '$schema', value: metaSchemaUrl(name), owned: true }
}

/**
 * Keyed by the role table's own `kind:role` spelling, and total over it: a role
 * that carries no discriminator ever maps to `null` rather than being left out,
 * so adding a role forces a ruling instead of a silent gap.
 */
const DIALECTS: Record<string, RoleDialects | null> = {
  // `$schema` on a JSON Schema document is the meta-schema of the *JSON Schema
  // dialect*, and it is already REQUIRED to be 2020-12. The key is spoken for by
  // the format; pointing it at `{meta}/schema-document` would break every stock
  // validator. `warns: false` because absence here is `E_DM_DIALECT`, an error
  // the registry already raises — this role is at the terminal state the other
  // seven are only warned toward, and two complaints about one fact is worse
  // than one.
  'datamodel:schema': {
    dialects: [{ key: '$schema', value: 'https://json-schema.org/draft/2020-12/schema', owned: false }],
    warns: false,
  },
  // An example is an *instance* of its sibling schema; its dialect is that
  // schema's dialect and it has none of its own. Injecting `$schema` would add a
  // property the schema must then admit, and `additionalProperties: false` is
  // normal in this catalog — the discriminator would make the example fail the
  // very document it exemplifies. A rule, not an omission.
  'datamodel:examples.<name>': null,
  // The only role with two live dialects, and not a migration window with an end
  // ([0017](srn://metaframework/adr/0017-transport-asyncapi)): `in-process` and
  // `grpc` transports have no AsyncAPI expression at all, so the mini-spec is
  // permanent. The order is load-bearing twice over — a headerless file is told
  // to declare the mini-spec, which is right for every wire AsyncAPI does not
  // cover, and a file declaring both keys is read as the mini-spec, where
  // `asyncapi:` is then an unknown non-`x-` top-level key and its field table
  // rejects it. Native, so it is never stripped either way.
  //
  // The band is `3.x`, wider than the `openapi` row's `3.1.x` below, and the
  // difference is the two standards' own text. OpenAPI versions the *document*,
  // so 3.1.1 is 3.1.0 with errata and 3.0 is a different grammar. AsyncAPI's
  // version-string section promises more: a minor increment "should not
  // interfere with operations of tooling developed to a lower minor version",
  // and "the patch version will not be considered by tooling". Warning on a
  // correct 3.2.0 document would report this reader's narrowness as the file's
  // fault; the framework reads 3.1 semantics either way, and a construct from a
  // later minor rides in `raw` and derives nothing.
  'protocol:transport': {
    dialects: [
      meta('transport-document'),
      { key: 'asyncapi', value: '3.1.0', owned: false, recognises: (v) => /^3\.\d+\.\d+$/.test(v) },
    ],
    warns: true,
  },
  'protocol:states': { dialects: [meta('state-machine-document')], warns: true },
  // The shape every future standard takes: a format that already names itself
  // keeps doing so. Patch releases of 3.1 are the same dialect — OpenAPI
  // versions the *document*, and warning on 3.1.1 would report a correct file.
  'protocol:openapi': {
    dialects: [{ key: 'openapi', value: '3.1.0', owned: false, recognises: (v) => /^3\.1\.\d+$/.test(v) }],
    warns: true,
  },
  'protocol:workflows.<name>': { dialects: [meta('workflow-document')], warns: true },
  'journey:journey': { dialects: [meta('journey-document')], warns: true },
  'environment:topology': { dialects: [meta('topology-document')], warns: true },
  'environment:config': { dialects: [meta('config-document')], warns: true },
}

interface Row extends RoleDialects {
  kind: EntityKind
  /** Role head as prose names it — `workflows`, not `workflows.<name>`. */
  role: string
  /** Does this entity-relative file fill the role? */
  matches: (file: string) => boolean
}

/**
 * `workflows/<name>.yaml` → a prefix/suffix test with no separator in between,
 * so `workflows/a/b.yaml` is not a workflow. Fixed roles compare whole.
 */
function matcher(file: string): (candidate: string) => boolean {
  const cut = file.indexOf('<name>')
  if (cut === -1) return (candidate) => candidate === file

  const prefix = file.slice(0, cut)
  const suffix = file.slice(cut + '<name>'.length)
  return (candidate) => {
    if (candidate.length <= prefix.length + suffix.length) return false
    if (!candidate.startsWith(prefix) || !candidate.endsWith(suffix)) return false
    return !candidate.slice(prefix.length, candidate.length - suffix.length).includes('/')
  }
}

const ROWS: readonly Row[] = ARTIFACT_ROLES.flatMap((role) => {
  const key = `${role.kind}:${role.role}`
  if (!(key in DIALECTS)) {
    // A programming error in a spec constant, not anything a catalog can cause:
    // a role reached the table above without anybody ruling on its dialect. It
    // fails loudly at import rather than defaulting to "carries none", because
    // that default is indistinguishable from the deliberate `null` above.
    throw new Error(`no dialect ruling for the ${role.kind} "${role.role}" role`)
  }
  const entry = DIALECTS[key]
  if (!entry) return []
  return [{ ...entry, kind: role.kind, role: role.role.replace('.<name>', ''), matches: matcher(role.file) }]
})

/** The dialect an artifact of this kind and filename would be read under. */
export function canonicalDialect(kind: EntityKind, file: string): Dialect | null {
  return ROWS.find((row) => row.kind === kind && row.matches(file))?.dialects[0] ?? null
}

/**
 * Read the dialect an artifact declares, record it on the artifact, and delete a
 * framework-owned key from `data` before anything downstream is handed the
 * document. Returns the `W_ARTIFACT_DIALECT` message when the file is read as
 * the legacy dialect, or null.
 *
 * The key is stripped whether or not its value is recognised: an unknown
 * `$schema` is still the framework's key on that role, and leaving it in `data`
 * would turn a warning into an unknown-key *error* from the strict validator
 * downstream — which is the one thing this decision promises cannot happen.
 */
export function adoptDialect(kind: EntityKind, artifact: Artifact): string | null {
  const row = ROWS.find((candidate) => candidate.kind === kind && candidate.matches(artifact.file))
  if (!row) return null

  // A file that did not parse into a mapping has no header to read, and it
  // already carries the loader's own complaint or its validator's. "Also
  // declares no dialect" is noise on a file nobody can act on yet.
  const document = artifact.data
  if (document === null || typeof document !== 'object' || Array.isArray(document)) return null
  const record = document as Record<string, unknown>

  for (const dialect of row.dialects) {
    const raw = record[dialect.key]
    if (raw === null || raw === undefined) continue

    const declared = typeof raw === 'string' ? raw : String(raw)
    const known = dialect.recognises ? dialect.recognises(declared) : declared === dialect.value
    artifact.dialect = { role: row.role, key: dialect.key, declared, known }
    if (dialect.owned) delete record[dialect.key]

    if (!row.warns || known) return null
    return `${artifact.file} declares dialect "${declared}", which is not a known dialect of the ${row.role} role — read as the legacy dialect`
  }

  const canonical = row.dialects[0]
  artifact.dialect = { role: row.role, key: canonical.key, declared: null, known: false }
  if (!row.warns) return null
  return `${artifact.file} declares no dialect — read as the legacy dialect; add \`${canonical.key}: ${canonical.value}\``
}
