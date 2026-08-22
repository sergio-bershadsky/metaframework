---
name: entity-frontmatter
kind: datamodel
version: 3
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

The one format every entity in every catalog carries. `framework/spec/frontmatter.md`
owns the common half; each `kinds/*.md` document owns the fields its kind adds
on top. There is exactly one instance per entity, no exceptions, because a
directory under `solutions/` *is* an entity if and only if it holds an
`index.md` — so the instance count is the entity count, and every solution page
renders its own.

`usage: both` is the accurate answer and not a hedge. These blocks are persisted
as files — the framework's own first principle is that the filesystem is the
database — and they are simultaneously the exchange contract between three
parties that never share a process: the human author, the portal loader, and the
authoring kit's skills.

## The executable form

`framework/portal/src/lib/catalog/frontmatter.ts` is the same
contract as code, and it is the second source the sibling `schema.json` here is
answerable to — the normative document first, this module beside it:

- `commonFrontmatterSchema` is a zod object with `.catchall(z.unknown())`, paired
  with an explicit `unknownFields()` pass that tolerates only an `x-` prefix.
  That split exists because zod's own strict mode would reject `x-jira-epic`
  along with a typo, and the framework wants to tolerate the first and report the
  second (`E_FM_UNKNOWN_FIELD`). `schema.json` spells the same split as a root
  `unevaluatedProperties: false` next to a `^x-` `patternProperties` entry.
- `KIND_FRONTMATTER` is a `satisfies Record<EntityKind, z.ZodType>` map holding
  all twelve kinds' additions — the discriminated union this schema models as a
  twelve-branch `oneOf` on `kind`. Three of the twelve arrived after the founding
  nine (`capability`, `journey`, `metric`, decision-record amendment
  `2026-08-20-a`), and `capability`'s branch is empty on purpose: the kind adds
  no field at all. An empty branch is still load-bearing, because the root
  `unevaluatedProperties: false` is what makes every *other* kind's fields
  illegal on a capability.
- `EDGE_SOURCE_KINDS` / `EDGE_TARGET_KINDS` encode the edge legality tables that
  `relations` cannot express in JSON Schema at all. The schema here says
  `implements` is a list of references; it cannot say that the source must be a
  component or a product and the target must be a requirement, because that is a
  fact about two entities and a schema sees one document.

Both lists grow by **appending** and this schema follows them in that order:
`realizes` and `measures` are the sixth and seventh `relations` keys rather than
being slotted next to the edges they read like, exactly as `EDGE_TYPES` has
them.

## Where the two sources disagree

Neither disagreement is resolved here, because resolving one silently is how a
published grammar stops describing anything:

- **`deciders`.** `framework/spec/kinds/adr.md` §"Frontmatter additions" makes it
  REQUIRED and non-empty when `decision-status` is `accepted` **or `rejected`**;
  `frontmatter.ts` adds `superseded` to that list. This schema states neither
  condition — see the next section for why — so it is not forced to pick, but
  the spec and the code do need reconciling in one direction or the other.
- **The edge table's own sentence.** `framework/spec/frontmatter.md` orders the
  edge rows `uses`, `exposes`, `depends-on`, `implements`, `realizes`,
  `measures`, `supersedes`, then says "the last two are the later arrivals". The
  later arrivals are `realizes` and `measures`, which are rows five and six;
  `supersedes` is v1. The prose is right about which edges are new and wrong
  about where they sit in its own table.

## What the schema deliberately cannot check

Seven of this format's rules need a second entity or the resolved graph, and
every one of them is a real diagnostic in the loader:

| Rule                                               | Code                                     |
| -------------------------------------------------- | ---------------------------------------- |
| `name` equals the directory name                   | `E_FM_NAME_MISMATCH`                     |
| `kind` equals the bucket the directory sits in     | `E_FM_KIND_LOCATION`                     |
| An edge is authored by a kind allowed to author it | `E_FM_EDGE_SOURCE`                       |
| An edge points at a kind that edge may target      | `E_FM_EDGE_TARGET`                       |
| A journey's `actor` resolves to an `actor`         | `E_JRN_ACTOR_KIND`                       |
| A metric carries at least one `measures` edge      | `E_MET_NO_SUBJECT`                       |
| The target exists, in this solution                | `E_SRN_DANGLING`, `E_SRN_CROSS_SOLUTION` |

A second family is document-level — a schema *could* express it — and is left
out anyway, because the spec gives each of these its own error code and a schema
has exactly one verdict to give. Encoding them would report `E_FM_SCHEMA` for a
mistake the spec named:

| Rule                                                       | Code             | Who raises it today                       |
| ---------------------------------------------------------- | ---------------- | ----------------------------------------- |
| `target` is a literal of the grammar `metric-type` selects | `E_MET_TARGET`   | `kindDiagnostics()` in `frontmatter.ts`   |
| `window` is `instant` or a rolling duration                | `E_MET_WINDOW`   | `kindDiagnostics()` in `frontmatter.ts`   |
| `deciders` non-empty once the decision is taken            | `E_ADR_DECIDERS` | nothing — a zod refine, as `E_FM_SCHEMA`  |
| `date` is a bare `YYYY-MM-DD`                              | `E_ADR_DATE`     | nothing — the zod regex, as `E_FM_SCHEMA` |

The fourth row is the one exception this schema makes: `date` carries its
`pattern` here, because a date's shape is not separable from its type and no
consumer reading only the schema would otherwise know the field is not a
free-form string. Neither `E_ADR_DECIDERS` nor `E_ADR_DATE` appears anywhere in
`framework/portal/src` — measured 2026-08-21 — so both are spec codes with no
implementation, and the loader reports them as `E_FM_SCHEMA`.

There is one further asymmetry the loader gets right and a schema could not: the
kind-specific half is validated against the kind implied by **disk position**,
not by the declared `kind` field (`load.ts`, `kindFromPosition`). A mislabelled
entity therefore cannot skip its own rules by claiming to be something simpler.

## The one field that is not in this schema

`x-srn`. It belongs to `schema.json`, not to frontmatter — see
[schema-document](srn://metaframework/product/specification/datamodel/schema-document).
Frontmatter never states an entity's SRN, because the path already does, and
stating it twice is exactly the drift the framework's identity rules exist to
prevent.

## Compiled against the catalog it governs

The check this page exists to be able to state: this schema, compiled with the
portal's own ajv configuration (`Ajv2020`, `strict: false`, `allErrors: true`,
`validateFormats: false`) and run over the frontmatter block of every entity
under `solutions/` — **344 of 344 pass**, measured 2026-08-21.

It is worth recording what that number was one version ago, because the failures
were the schema's and not the catalog's. The document published as `version: 1`
rejected **113 of 344**. Thirteen of those are `usage: config` datamodels, a
value the enum here had not caught up with; the other **100** are these six
defects, and they account for exactly those 100 documents:

| Defect in the published schema                        | Catalog documents it rejected |
| ----------------------------------------------------- | ----------------------------- |
| `kind` enum stopped at the founding nine              | 31 capability/journey/metric  |
| The `component` branch omitted REQUIRED `lifecycle`   | all 66 components             |
| `relations` had no `realizes`                         | 31 entities                   |
| `relations` had no `measures`                         | 10 metrics                    |
| The `component` branch omitted optional `criticality` | 5 components                  |
| `component-type` stopped at the original seven        | 1 component (`content`)       |

The rows overlap, so the six counts sum to 144 over a union of 100 documents:
58 of the 100 tripped one row, 40 tripped two — a metric is both a kind the enum
did not have and the only author of `measures` — and 2 tripped three.

## Absent

Nothing validates the frontmatter of `framework/spec/` itself. Every document
there uses `kind: spec`, which is not in the twelve-value enum above, and they
live outside `solutions/`, so the loader never opens them. The format's own
definition sits among the documents the format does not describe.
