---
name: specification
kind: product
version: 3
title: Specification
summary: The normative contract under framework/spec — 17 documents, 11,765 lines, that the portal implements and the authoring kit distils.
status: review
owner: sergio
lifecycle: incubating
primary-actors:
  - /actor/catalog-author
  - /actor/ai-author
relations:
  exposes:
    - datamodel/entity-frontmatter
    - datamodel/schema-document
    - datamodel/workflow-document
    - datamodel/state-machine-document
    - datamodel/transport-document
    - datamodel/journey-document
    - datamodel/topology-document
    - datamodel/config-document
  implements:
    - requirement/every-rule-has-an-example
  realizes:
    - /capability/solution-description
    - /capability/guided-authoring
tags:
  - spec
  - contract
---

`framework/spec/` is the normative statement of what a catalog is: 17 markdown
documents, 11,765 lines, written in the framework's own format — each one carries
the frontmatter shape it prescribes for solution entities. Five are core
contracts binding on every kind; twelve are kind contracts, one per ontology
kind. Measured 2026-08-21 with `wc -l`; it was 14 documents and 7,279 lines
before decision-record amendment `2026-08-20-a` added `kinds/capability.md`,
`kinds/journey.md` and `kinds/metric.md`. Those three account for 2,053 of the
4,486 lines added since; the other 2,433 are the fourteen older documents growing
under the amendments that followed — most recently
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects), which
reached into `index.md`, `structure.md` and `evolution.md` at once. **A document
count is stable and a line count is not**, which is why the count above is dated.

It is modelled as a product rather than as a paragraph in this solution's
`index.md` for one reason, and the reason is structural rather than stylistic: a
solution's `index.md` cannot be the target of a relation edge. Demote the spec to
prose and the two most load-bearing statements in this catalog become
unstateable — that
[portal](srn://metaframework/product/portal) implements it, and that
[authoring-kit](srn://metaframework/product/authoring-kit) distils it. Both are
facts with evidence: twenty-four source files under `framework/portal/src` cite
`framework/spec` by path, and commit 6a1b1f1 is titled "SRN parser, resolver and
disk mapping with **spec-derived** tests"; nine of the ten files in
`marketplace/plugins/metaframework/skills/_shared/references/` open by conceding
that "when `framework/spec/` is present in the repository, it is authoritative
and wins over this file", and eight of those name the spec document they distil.
The tenth, `philosophy.md`, distils nothing and concedes nothing — it is the
bundle's statement of purpose, not a rules digest, and it is the only file there
that names no `framework/spec/` document at all.

## Components

Two, and the seam between them is a precedence rule the spec states about itself:

- [core-contracts](srn://metaframework/product/specification/component/core-contracts)
  — `index.md`, `structure.md`, `srn.md`, `frontmatter.md`, `evolution.md`.
  3,461 lines. Binding on every kind.
- [kind-contracts](srn://metaframework/product/specification/component/kind-contracts)
  — `kinds/*.md`, twelve documents, 8,304 lines. Each adds fields, artifacts and
  rules *on top of* the core, never overriding them.

`index.md` fixes the direction: "Where two documents appear to disagree, the
precedence is: the decision record, then the core contracts, then the kind
document. A kind document never relaxes a core rule; where it looks like it does,
that is a spec defect to be reported." That is a `depends-on` edge between two
real things, not a table of contents — which is the objection this decomposition
had to survive.

## The eight formats it owns

The datamodels in this product's bucket are the hand-authored file formats the
spec defines normatively:
[entity-frontmatter](srn://metaframework/product/specification/datamodel/entity-frontmatter),
[schema-document](srn://metaframework/product/specification/datamodel/schema-document),
[workflow-document](srn://metaframework/product/specification/datamodel/workflow-document),
[state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document),
[transport-document](srn://metaframework/product/specification/datamodel/transport-document),
[journey-document](srn://metaframework/product/specification/datamodel/journey-document),
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
and
[config-document](srn://metaframework/product/specification/datamodel/config-document).

They live here and not under the portal because **owner scope is a statement of
responsibility**. The spec decides what a `schema.json` or a `workflows/*.yaml`
must be; the portal is one implementation of that judgement and the plugin's
reference bundle is one distillation of it. Filing them under the parser would
tell a reader that the parser owns the contract, which is backwards — and it
would leave `transport.yaml` homeless, because that format has 13 authored
instances in this repository and no portal code at all.

The threshold applied to the first five was: normatively specified,
hand-authored, and at least eight instances on disk. In, with counts measured
2026-08-19 across `solutions/acme` and `solutions/brass` before this solution was
written: frontmatter (197), `schema.json` (61), `workflows/*.yaml` (22),
`transport.yaml` (13), `states.json` (8). Out: `topology.yaml` (4), `config.yaml`
(3), `openapi.yaml` (2), `examples/` (3) — below the threshold, and the spec's
own v1 intent is to treat a linked spec as an opaque attachment.

**The sixth came in under that same rule.** `kinds/journey.md` specifies
`journey.yaml` normatively — required rather than optional, with its own
top-level fields, step schema, `x-` escape hatch and twelve error codes — and
`find solutions -name journey.yaml | wc -l` returns 9 as of 2026-08-21, past the
bar the paragraph above sets. This page used to say so and stop there, on the
grounds that adding `datamodel/journey-document` changes what the product
`exposes` and is therefore a decision about the product rather than a correction
to a page; the decision has since been made. The format is still parsed by
`framework/portal/src/lib/journey/journey.ts` alone, and by nothing else
anywhere.

**The seventh and eighth did not, and the rule that admitted them is a different
rule.** `topology.yaml` (7 instances) and `config.yaml` (6) are both under the
eight-instance bar and both are datamodels here now, because
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) has
every artifact declare its own dialect in its own bytes, under the canonical URL
of the meta-schema that defines that dialect — and a discriminator with nothing
to point at is not a discriminator. Concretely, the line that names one of these
eight from inside a file:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/topology-document
regions:
  - name: hel1
```

An instance count measures how much a format is worth describing; being named
from inside 70 files across three catalogs settles it whatever the count says.
`openapi.yaml` and `examples/` stay out under both readings, and for reasons that
survive the change: OpenAPI announces itself with a native `openapi:` key against
a meta-schema that was never the framework's to write, and an example is an
instance of its sibling schema, carrying that schema's dialect and none of its
own.

So this list stopped being bookkeeping. `exposes` above and the `/schemas` route
are one fact seen twice — the route accepts a path only when its SRN names a
`datamodel`, and asks nothing further
(`framework/portal/src/app/schemas/[...path]/route.ts`) — and six of the eight
are now named from inside artifacts, so deleting or renaming one breaks every
file pointing at it. That makes them a published contract rather than internal
documentation: a rename is a swap with a `supersedes` edge, not an edit. The
header can also resolve, which is a stronger claim than it was — the project
holds `metaframework.dev` as of 2026-08-21, and these eight are the framework's
own to serve from it. A private catalog's datamodels never will be: `acme`'s
schemas are served by `acme`'s portal under its `SCHEMA_BASE_URL`. Identity is
global for every datamodel in every catalog; retrieval from the canonical host is
global for these eight and local for everything else.

## What this product is not

**It is not in the catalog it specifies.** Every spec document carries
`kind: spec`, which is not one of the twelve ontology kinds, and lives under
`framework/spec/` rather than `solutions/`. The loader reads `solutions/` and
`.git/` only, so no diagnostic ever fires on the specification — the contract
holds itself to no mechanical check.

**Not one of its 17 documents is approved.** Fifteen carry `status: review` and
two — `kinds/capability.md` and `kinds/metric.md` — carry `status: draft`, at
versions between 2 and 8. The thing that actually wins on conflict is
`docs/decision-record.md`, which `index.md` names in its opening paragraph. This
product is `lifecycle: incubating` for exactly that reason: it is in use and
load-bearing, and its contracts are still moving. `docs/decision-record.md`
carries thirteen amendments in three days — five dated 2026-08-19, seven dated
2026-08-20 (`-a` through `-g`), one dated 2026-08-21 — and commit ae7d355 moved
all five core contracts again under no amendment number at all.

**`portal.md` does not exist.** The document map lists it with status `planned`,
the only planned row in the table, covering "portal loader contract: validation
pipeline, derived-diagram inputs". It has no component here, because modelling it
would be modelling an intention.

## Two defects in its own versioning, both greppable

The spec asks every entity to bump `version` on every content change
(`evolution.md`), and does not consistently do so itself:

- **Skipped numbers.** Commit 5b8a3e8 bumped `index.md` 3→5, `srn.md` 3→5,
  `evolution.md` 2→4 and `frontmatter.md` 2→4 in one commit — two increments for
  amendments *d* and *e*. `index.md@4`, `srn.md@4`, `evolution.md@3` and
  `frontmatter.md@3` therefore exist in no commit, and a version→commit index
  cannot resolve them.
- **Substantive edits without a bump.** Commit bae08e4 changed 132 lines of
  `srn.md` and left `version: 1`; commit 4aa3f68 changed `frontmatter.md` (71
  lines) and `structure.md` (45 lines) and left both at `version: 1`. In the same
  commit `kinds/datamodel.md` and `kinds/protocol.md` were *born* at `version: 2`,
  so no v1 of either was ever committed.

Recorded here rather than fixed, because the history is what it is and this
catalog describes what exists.

## Where the ontology strains

`component-type` has no honest value for "a set of normative documents". Both
components take `library` — the nearest fit, since they are consumed by reference
and expose no runtime interface — and this paragraph is the mismatch, rather than
an invented eighth enum value. That is what
[kinds/component.md](srn://metaframework/product/specification/component/kind-contracts)
itself prescribes for an enum that does not fit.
