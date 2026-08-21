import type { Srn } from '../srn/srn'
import type { CommonFrontmatter, EdgeType, EntityKind } from './frontmatter'

export type Severity = 'error' | 'warning'

export interface Diagnostic {
  /** Spec error class, e.g. E_FM_NAME_MISMATCH, W_STRUCT_PROTOCOL_NCA. */
  code: string
  severity: Severity
  message: string
  /** Catalog-relative path of the offending file or directory. */
  path: string
  /** SRN of the entity the diagnostic belongs to, when known. */
  srn?: string
}

/**
 * The dialect an artifact declares — ADR 0015, "Artifacts declare their
 * dialect". A role's payload standardizes one dialect at a time, additively, so
 * a reader has to be able to tell which grammar a file is written in *before* it
 * parses it. The discriminator is a single top-level key, fixed per role.
 */
export interface ArtifactDialect {
  /** The role as prose names it: `transport`, `states`, `workflows`. */
  role: string
  /** The key that declares it — `$schema` for the framework's own roles. */
  key: string
  /** The value the file declares; null when it declares none. */
  declared: string | null
  /** The declared value names a dialect this framework knows. */
  known: boolean
}

export interface Artifact {
  /** File name relative to the entity directory, e.g. `workflows/place-order.yaml`. */
  file: string
  extension: '.json' | '.yaml' | '.yml' | '.md'
  /**
   * Parsed content for json/yaml; raw text for md. Null when parsing failed.
   *
   * A *framework-owned* discriminator is deleted from this value once
   * {@link dialect} has recorded it, so every downstream validator stays strict
   * and unchanged. `raw` is untouched — the file is served as authored.
   */
  data: unknown
  raw: string
  /**
   * Why parsing failed, when it did. `data: null` alone cannot say: a markdown
   * artifact is never parsed and a YAML file may legitimately hold `null`. The
   * portal shows this beside the source rather than dropping the artifact —
   * an unparseable file is exactly the one somebody needs to look at.
   */
  error?: string
  /**
   * The dialect this file declares, for the roles that carry a discriminator.
   * Absent on a free-named file, on `examples/*.json` (an instance has its
   * schema's dialect and none of its own), and on anything that did not parse
   * into a mapping.
   */
  dialect?: ArtifactDialect
}

export interface Relation {
  edge: EdgeType
  /** The reference exactly as authored, useful for display. */
  ref: string
  /** Absolute, resolved SRN — null when the reference could not be resolved. */
  target: string | null
  /** Version pin carried by the reference, null meaning latest. */
  version: number | null
}

export interface Entity {
  /** Canonical unversioned SRN — the entity's identity. */
  srn: string
  parsed: Srn
  kind: EntityKind
  /** Catalog-relative directory, e.g. `acme/shop/checkout`. */
  relDir: string
  /** Absolute directory on disk. */
  dir: string
  frontmatter: CommonFrontmatter
  /** Markdown prose below the frontmatter block. */
  body: string
  artifacts: Artifact[]
  relations: Relation[]
  /** SRN of the containing entity; null for a solution. */
  parent: string | null
  /** SRNs of child entities (containers and owned entities alike). */
  children: string[]
}

export interface Catalog {
  /** Every entity, keyed by canonical unversioned SRN. */
  entities: Map<string, Entity>
  /** SRNs of the solution roots, in directory order. */
  solutions: string[]
  diagnostics: Diagnostic[]
  /** Derived inverse edges: target SRN → the relations pointing at it. */
  inbound: Map<string, Array<{ edge: EdgeType; from: string }>>
}
