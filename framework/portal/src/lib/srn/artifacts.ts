/**
 * The artifact role table — framework/spec/structure.md, "The artifact role
 * table"; srn.md restates it and owns the validation rule (V5).
 *
 * A dot suffix on an SRN names a **role**, never a filename: `transport` is
 * the protocol's wire binding, and rendering the role as a path goes through
 * this table — the one licensed bend in SRN ≡ path. The table is a spec
 * constant, exactly the class of constant the eleven reserved kinds are:
 * closed, per-kind, grown by appending, and consulted in both directions
 * without a catalog read.
 *
 * The vocabulary is static; existence is not. Everything here answers "may
 * this role be addressed on this kind" (`E_SRN_ARTIFACT` when not) from the
 * spec alone. Whether the file exists on disk is a catalog question, and a
 * legal role whose file is absent is `E_SRN_DANGLING` — the loader's to raise,
 * not this module's.
 */

import { type ReservedKind, type Srn, SrnError, formatSrn, srnToDir } from './srn'

export interface ArtifactRole {
  kind: ReservedKind
  /** Role as the spec spells it: `transport`, or the family `examples.<name>`. */
  role: string
  /** Entity-relative file, with `<name>` standing for the family member. */
  file: string
  /** Fixed roles are one segment; the two `<name>` families are exactly two. */
  depth: 1 | 2
}

/**
 * The ten rows, verbatim from structure.md. A kind absent from the table —
 * solution, product, component, actor, adr, requirement, capability, metric —
 * defines no roles at all. Growth is additive, and additive only: renaming or
 * removing a row breaks every SRN written against it.
 *
 * `arazzo` is the newest row ([0020](srn://metaframework/adr/0020-arazzo-as-a-sibling-role))
 * and it is **appended**, not filed beside the other depth-1 protocol roles:
 * structure.md's growth discipline is to append, and the order of this array is
 * asserted against that table verbatim.
 */
export const ARTIFACT_ROLES: readonly ArtifactRole[] = [
  { kind: 'datamodel', role: 'schema', file: 'schema.json', depth: 1 },
  { kind: 'datamodel', role: 'examples.<name>', file: 'examples/<name>.json', depth: 2 },
  { kind: 'protocol', role: 'transport', file: 'transport.yaml', depth: 1 },
  { kind: 'protocol', role: 'states', file: 'states.json', depth: 1 },
  { kind: 'protocol', role: 'openapi', file: 'openapi.yaml', depth: 1 },
  { kind: 'protocol', role: 'workflows.<name>', file: 'workflows/<name>.yaml', depth: 2 },
  { kind: 'protocol', role: 'arazzo', file: 'arazzo.yaml', depth: 1 },
  { kind: 'journey', role: 'journey', file: 'journey.yaml', depth: 1 },
  { kind: 'environment', role: 'topology', file: 'topology.yaml', depth: 1 },
  { kind: 'environment', role: 'config', file: 'config.yaml', depth: 1 },
]

/**
 * Map a lexed artifact suffix to its entity-relative file, validating it
 * against the table on the way — role → file MUST be a function of the table
 * alone. `kind` is `null` for a solution root, which owns no roles.
 *
 * Throws `E_SRN_ARTIFACT` when the kind owns no roles, the role is unknown for
 * the kind, or a known role stands at the wrong depth. The suffix itself is
 * the lexer's ({@link parseSrn}), so segments here are already alphabet-legal.
 */
export function artifactFile(kind: ReservedKind | null, artifact: string, ref = ''): string {
  const roles = ARTIFACT_ROLES.filter((row) => row.kind === kind)
  if (roles.length === 0) {
    throw new SrnError('E_SRN_ARTIFACT', `${kind ?? 'solution'} has no roles`, ref)
  }

  const segments = artifact.split('.')
  const head = segments[0]
  const row = roles.find((r) => (r.depth === 1 ? r.role === head : r.role === `${head}.<name>`))
  if (!row) {
    throw new SrnError('E_SRN_ARTIFACT', `"${artifact}" is not a ${kind} role`, ref)
  }
  if (segments.length !== row.depth) {
    throw new SrnError(
      'E_SRN_ARTIFACT',
      row.depth === 1 ? `${head} is depth 1` : `${head}.* is depth 2`,
      ref,
    )
  }
  return row.depth === 1 ? row.file : row.file.replace('<name>', segments[1])
}

/** V5 as a predicate: throws `E_SRN_ARTIFACT`, or the suffix is legal. */
export function assertArtifactRole(kind: ReservedKind | null, artifact: string, ref = ''): void {
  artifactFile(kind, artifact, ref)
}

/**
 * Resolve an artifact SRN to its file, relative to the catalog root — the
 * entity directory ({@link srnToDir}) joined with the role's file. As
 * everywhere, `@version` never appears on disk: the pin belongs to the entity
 * and is resolved by the version→commit machinery, not the path.
 */
export function srnToArtifactPath(srn: Srn, catalogDir = 'solutions'): string {
  if (srn.artifact === null) {
    throw new SrnError('E_SRN_ARTIFACT', 'SRN carries no artifact suffix', formatSrn(srn))
  }
  return `${srnToDir(srn, catalogDir)}/${artifactFile(srn.kind, srn.artifact, formatSrn(srn))}`
}
