---
name: entity-frontmatter
kind: datamodel
version: 1
title: Entity frontmatter
summary: The YAML block every entity index.md opens with — the common contract plus the kind's own fields, as a discriminated union on kind.
status: review
owner: sergio
usage: both
abstract: false
tags:
  - spec
  - format
---

# Entity frontmatter

The one format every entity in every catalog carries. `framework/spec/frontmatter.md`
(version 4, 277 lines) owns the common half; each of the nine `kinds/*.md`
documents owns the fields its kind adds on top. Measured 2026-08-19 across
`solutions/acme` and `solutions/brass`, before this solution was authored, there
were 197 instances on disk — one per entity, no exceptions, because a directory
under `solutions/` *is* an entity if and only if it holds an `index.md`.

`usage: both` is the accurate answer and not a hedge. These blocks are persisted
as files — the framework's own first principle is that the filesystem is the
database — and they are simultaneously the exchange contract between three
parties that never share a process: the human author, the portal loader, and the
authoring kit's skills.

## The executable form

`framework/portal/src/lib/catalog/frontmatter.ts` (179 lines) is the same
contract as code, and it is worth reading beside the sibling `schema.json` here
because the two were written from the same document and disagree nowhere:

- `commonFrontmatterSchema` is a zod object with `.catchall(z.unknown())`, paired
  with an explicit `unknownFields()` pass that tolerates only an `x-` prefix.
  That split exists because zod's own strict mode would reject `x-jira-epic`
  along with a typo, and the framework wants to tolerate the first and report the
  second (`E_FM_UNKNOWN_FIELD`).
- `KIND_FRONTMATTER` is a `satisfies Record<EntityKind, z.ZodType>` map holding
  all nine kinds' additions — the discriminated union this schema models as a
  nine-branch `oneOf` on `kind`.
- `EDGE_SOURCE_KINDS` / `EDGE_TARGET_KINDS` encode the edge legality tables that
  `relations` cannot express in JSON Schema at all. The schema here says
  `implements` is a list of references; it cannot say that the source must be a
  component or a product and the target must be a requirement, because that is a
  fact about two entities and a schema sees one document.

## What the schema deliberately cannot check

Five of this format's rules are catalog-level, not document-level, and every one
of them is a real diagnostic in the loader:

| Rule                                                | Code                                      |
| --------------------------------------------------- | ----------------------------------------- |
| `name` equals the directory name                    | `E_FM_NAME_MISMATCH`                      |
| `kind` equals the bucket the directory sits in      | `E_FM_KIND_LOCATION`                      |
| An edge is authored by a kind allowed to author it  | `E_FM_EDGE_SOURCE`                        |
| An edge points at a kind that edge may target       | `E_FM_EDGE_TARGET`                        |
| The target exists, in this solution                 | `E_SRN_DANGLING`, `E_SRN_CROSS_SOLUTION`  |

There is one further asymmetry the loader gets right and a schema could not: the
kind-specific half is validated against the kind implied by **disk position**,
not by the declared `kind` field. A mislabelled entity therefore cannot skip its
own rules by claiming to be something simpler.

## The one field that is not in this schema

`x-srn`. It belongs to `schema.json`, not to frontmatter — see
[schema-document](srn://metaframework/product/specification/datamodel/schema-document).
Frontmatter never states an entity's SRN, because the path already does, and
stating it twice is exactly the drift the framework's identity rules exist to
prevent.

## Absent

Nothing validates the frontmatter of `framework/spec/` itself. Spec documents use
`kind: spec`, which is not in the nine-value enum above, and they live outside
`solutions/`, so the loader never opens them. The format's own definition is the
only document in the repository that the format does not describe.
