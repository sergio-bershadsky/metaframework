---
name: topology-document
kind: datamodel
version: 2
title: Topology document
summary: topology.yaml — regions, replica ranges and one sentence of scaling intent for an environment's hosted components; fully specified, and as of this version every rule it states is checked.
status: review
owner: sergio
usage: storage
abstract: false
tags:
  - spec
  - format
  - environment
---

`topology.yaml` beside an environment's `index.md`: **where the components of
this solution actually run** — regions, zones, replica ranges, one sentence of
scaling intent per host. OPTIONAL, unlike its journey counterpart. Specified in
`framework/spec/kinds/environment.md` (version 6, 812 lines) §"`topology.yaml`";
measured 2026-08-21 with `find solutions -name topology.yaml`: **7 instances** —
2 in `solutions/acme`, 2 in `solutions/brass`, 3 in this solution — carrying 21
host entries.

## Why it is here at all, below the bar

The product page
[specification](srn://metaframework/product/specification) set an explicit
threshold for this bucket — normatively specified, hand-authored, at least eight
instances on disk — and listed `topology.yaml` (4 instances at the time) among
the formats it kept **out**. At 7 it still does not clear that bar, and this
entity is not an argument that it does.

What changed is the reason a meta-schema exists.
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) makes
every artifact declare its dialect as a URL, and the URL for this role is this
entity's canonical `$id`. An unauthored meta-schema would make that a
discriminator pointing at nothing, in every `topology.yaml` in every catalog.
The instance count decided whether the format was *worth describing*; the
discriminator decides whether the description can be *named*, and naming wins
regardless of the count. The same reasoning admits
[config-document](srn://metaframework/product/specification/datamodel/config-document),
and it is the reason the bar in that paragraph is now a historical note rather
than a rule.

## Why `usage: storage`, with a parser in the tree

The second `storage` in this bucket, and it was
[transport-document](srn://metaframework/product/specification/datamodel/transport-document)'s
case verbatim until this release, when the two came apart. `transport.yaml` is
still read by nothing. This file is now read by
`framework/portal/src/lib/environment/environment.ts`, and `usage` did not move
— because `usage` answers where *instances* live, and they live in the tree.
Nothing exchanges it: no third-party tool is contracted to accept it, and it
derives no rendering that would make it a contract between an author and a
renderer.

`grep -rn topology framework/portal/src` returns 49 hits; **24** are outside
tests, and 20 of those are the reader:

- `lib/environment/environment.ts` — `parseTopology`, `hostJoins`, and the
  `TOPOLOGY_ARTIFACT` constant they are keyed on. This is the module the
  measurement in
  [0016-topology-format-deferred](srn://metaframework/adr/0016-topology-format-deferred)
  had to be rewritten around.
- `lib/srn/artifacts.ts:45` — the role-table row,
  `{ kind: 'environment', role: 'topology', file: 'topology.yaml', depth: 1 }`.
- `lib/catalog/dialects.ts:133` — the dialect-table row added by 0015.
- `lib/catalog/index.ts:95` — where `withEnvironmentChecks` folds the reader into
  the load pipeline.
- `lib/catalog/frontmatter.ts:200` — a comment about why environments are not
  folded into a frontmatter field.

`components/entity/entity-artifacts.tsx` dispatches on entity kind *and*
filename — `schema.json` on a datamodel, `workflows/*` and `states.json` on a
protocol, `journey.yaml` on a journey — and still has no environment branch at
all. `topology.yaml` falls through to the default and renders as a YAML code
block, which is exactly where `transport.yaml` lands. Being checked and being
rendered turn out to be independent: this file gained a validator and no view.

## Every rule is enforced, and the register that said otherwise is empty

`framework/portal/src/lib/catalog/diagnostic-coverage.test.ts` keeps a debt
register of every spec-documented code with no emitter, each entry naming the
gap. Version 1 of this entity printed the environment kind's seven rows out of
it in full, in two pairs that shared a sentence apiece — this file's
`E_ENV_TOPOLOGY_SCHEMA` beside `E_ENV_CONFIG_SCHEMA` under "environment
artifacts are parsed into `artifact.data` and never validated", and
`W_ENV_HOST_UNDECLARED` beside `W_ENV_CONFIG_ORPHAN` under "no
environment/component hosting cross-check exists". That register is a ratchet
rather than an exemption: the inventory suite fails the moment an entry gains an
emitter, so implementing a rule forces its line out of the map. All seven lines
are out. Where the table used to be there is now a comment saying the section is
empty and why, and `environment.md` v6 states **eleven** codes rather than
seven — every one of them emitted:

| Code                      | Where it is decided                                                     |
| ------------------------- | ----------------------------------------------------------------------- |
| `E_ENV_TOPOLOGY_SCHEMA`   | `parseTopology` — shape, unknown non-`x-` key, `min > max`, dup region  |
| `E_ENV_REGION_UNKNOWN`    | `parseTopology` — a host names a region the file does not declare       |
| `E_ENV_TARGET_KIND`       | `resolveTarget`/`deployable` — the target is not a component or product |
| `W_ENV_HOST_UNDECLARED`   | `hostJoins` — the placed component declares no `uses` edge back         |
| `E_ENV_CONFIG_SCHEMA`     | `parseConfig` — casing, duplicate `(key, for)`, secret with no source   |
| `E_ENV_SECRET_VALUE`      | `parseConfig` — `secret: true` beside a literal `value`                 |
| `E_ENV_CONFIG_VALUE`      | `contractJoins` — the value fails the key's subschema                   |
| `E_ENV_SECRET_MISMATCH`   | `contractJoins` — `secret:` disagrees with the contract's `writeOnly:`  |
| `W_ENV_CONFIG_ORPHAN`     | `configJoins` — a `for:` naming something that does not run here        |
| `W_ENV_CONFIG_UNDECLARED` | `contractJoins` — a `for:`-scoped key no contract declares              |
| `W_ENV_CONFIG_MISSING`    | `missingKeys` — a hosted component's must-provide key is undeclared     |

Four of them belong to this file, seven to
[config-document](srn://metaframework/product/specification/datamodel/config-document),
and `E_ENV_TARGET_KIND` is the one both share. The split is not even: the config
half needed a second entity to be wrong against, which is why it arrived with
the `usage: config` contract rather than before it. This format needed nothing
it did not already have — its four rules are all decidable from the environment
entity and the component graph, and that is why v1's "not one rule is enforced"
was a statement about effort spent rather than about difficulty.

Run over the catalog as it stands, `metaframework check` reports **zero**
environment diagnostics across all 7 files. The corpus was already compliant;
what changed is that it is now known to be.

## What the format decides

Four rules, and three of them are about what the file may *not* claim:

- **It annotates members; it never creates them.** Membership is authored on the
  component side, as a `uses` edge to the environment, and this document defines
  no second channel — the framework's inverse-edge rule, because authoring both
  "checkout runs in production" and "production hosts checkout" is double
  bookkeeping that drifts within a sprint. A host entry for a component that has
  not declared this environment is `W_ENV_HOST_UNDECLARED`, a warning rather
  than an error so a rollout may lead by a commit or two. This solution's own
  `production` topology holds the cleanest illustration in the repository: the
  portal runs on that instance and is deliberately *not* a host entry, with a
  16-line comment explaining that adding one would assert a membership the
  member does not claim.
- **Absent `regions` on a host means placement is not recorded** — and
  specifically not "everywhere". The spec puts the negation in bold in its own
  field table, which is the tell that the opposite reading is the natural one.
- **A `product` target is shorthand for the subtree, most specific wins.** A
  subtree entry plus an explicit entry for one descendant is an override, not a
  conflict; the format needs no precedence key because the SRN pair chain
  already orders them.
- **`scaling` is a sentence, not a manifest.** "The trigger, not the YAML of an
  autoscaler." The whole format is deliberately minimal — regions, zones,
  counts, one line of intent — because it is an input to a review and to a
  derived placement view, and anything a deployment tool needs and this cannot
  express belongs in that tool's repository.

No top-level `version:` key: both environment siblings are part of the entity's
version snapshot. The `x-` escape hatch reaches the top level and every entry,
and **no file on disk uses it**.

## What the 7 instances actually exercise

Measured 2026-08-21:

| Solution        | files | regions | zones | hosts | fixed `replicas` | ranges |
| --------------- | ----- | ------- | ----- | ----- | ---------------- | ------ |
| `acme`          | 2     | 3       | 6     | 7     | 2                | 5      |
| `brass`         | 2     | 1       | 0     | 7     | 7                | 0      |
| `metaframework` | 3     | 1       | 0     | 7     | 7                | 0      |

Every one of the 21 host entries carries `replicas`, so the field the table
marks optional is universal. **All five ranges and all six zone labels sit in
`acme`** — the invented exemplar. `brass`, surveyed from real code
([0013](srn://metaframework/adr/0013-a-second-solution-surveyed-from-real-code)),
and this solution's own three environments declare fixed counts (`{ min: n, max:
n }`) and no zones at all: 16 of 21 entries pin a constant. The format's two
genuinely elastic features are exercised only where nothing is deployed.

Three of the seven files declare no `regions` key at all, and 8 of the 21 hosts
name no `regions` — so eight placement entries record no placement.
Both are legal and both mean "not recorded", and the reader is written to keep
that reading: `parseTopology` iterates `regions ?? []` on a host and files
nothing for the empty case, so an absent list is silence and never a claim about
everywhere. Only a *named* region the file does not declare is a finding.

One region carries `zones: []` and explains itself in prose, because the schema
cannot: "`zones` is empty because there is no distribution to describe, not
because it is unknown." An empty list and an absent one look identical to a
validator and are different claims.

## The sibling schema, and the rule ENV4 names that it cannot hold

`schema.json` here states the mini-spec in stock 2020-12: `hosts` required and
`regions` optional, the region and host maps with their required fields, the
replica map, the 200-character single-line bound on `scaling`, and `x-`
tolerance at every level. It also admits the dialect discriminator: `$schema`,
typed as a non-empty string and deliberately not pinned to the `$id` with
`const`. A file naming some other dialect is `W_ARTIFACT_DIALECT`, a warning read
as the legacy dialect and never broken, and a `const` would state that one fact
at a second, harder severity that JSON Schema gives no way to turn down. The
encoding is shared by all six framework meta-schemas, and
[state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document)
records why it is the only one they could share.

Three rules are outside it, and the first is the one ENV4 puts in its own
parenthesis. All three are outside it *still* — nothing about them became
expressible — and all three are now checked, by the reader rather than by the
schema. That is the shape of the split this entity is a record of: the published
meta-schema is what an outside validator can run against one file, and every
rule that needs two things held at once is the portal's.

- **`min` ≤ `max`.** Comparing two sibling properties is not in the 2020-12
  vocabulary at all, for unbounded integers or for anything else. The spec's own
  counter-example — `replicas: { min: 5, max: 2 }` — is a document this schema
  still accepts, and `parseTopology` refuses as `E_ENV_TOPOLOGY_SCHEMA` with a
  message naming both numbers.
- **Every host `regions` name is declared in the file's `regions` list**
  (`E_ENV_REGION_UNKNOWN`). A cross-reference between two members of one
  document, which needs a reader that holds both — and `parseTopology` is that
  reader: it collects the declared names while walking `regions` and checks each
  host against the set.
- **Region names are unique within the file.** `uniqueItems` compares whole
  entries, so two regions differing only in their `notes` are distinct to it.
  The reader keys a `Set` on the name and reports the second as
  `E_ENV_TOPOLOGY_SCHEMA`.

Re-checked 2026-08-21 with `ajv` 2020 against all 7 files, as they now stand on
disk: **all 7 validate**, headed, and all 7 again with the header stripped. The
first run, before the header sweep, was 6 of 7 —
`solutions/metaframework/environment/production/topology.yaml` carried a
`scaling` string of **236 characters** against the field's stated 200-character
cap. Nothing had ever noticed, because at that point nothing in the repository
read this format at all; the sentence was rewritten to **195** in the same batch
that added the headers, and it is still the longest `scaling` on disk. The
finding belonged to the file and not to this schema, and writing a schema is
what found it.

Seven hand-written cases behave. Rejected by the schema: a document with
`regions` and no `hosts`, a host carrying `tier: gold`, and a `scaling` string
of 201 characters. Accepted by it: an `x-` key at the top level, and — recorded
rather than glossed — `replicas: { min: 5, max: 2 }`, a host naming
`ap-south-1` where the file declares no such region, and one region name
declared twice. Those last three are the schema's blind spots named above, they
are the spec's own counter-examples, and each of them is now an error from
`parseTopology`. The published document did not get stronger; the pair did.

## The header, now that the sweep has landed

**Every instance carries the discriminator.** Measured 2026-08-21: all 7
`topology.yaml` files open with
`$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/topology-document`
as their first key. The count
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) took —
none of the 7 — is the before; this is the after. It cost less than a
file-for-bump reading suggests, and for a reason worth naming: the 7 files sit in
7 environment entities, 6 of which carry a
[config-document](srn://metaframework/product/specification/datamodel/config-document)
beside them. The two artifacts share an entity and therefore a version, so the
environment sweep was **13 files and 7 version bumps**, not 13 of each — an
entity is the unit of versioning and a file is not.
`W_ARTIFACT_DIALECT` is implemented and reports nothing on this role.

**The loader strips it, and one release later that stopped being theoretical.**
`adoptDialect` (`framework/portal/src/lib/catalog/dialects.ts:192`) records the
dialect on the artifact and deletes the key from the parsed document during
`loadCatalog`; `Artifact.raw` keeps the file as authored, so `/artifacts` and the
source pane still serve the header. When v1 of this entity was written this
format had no parser to protect, and the stripping was done anyway, against a
day that had not come: "so the day something does parse this file it inherits a
document with no framework key in it." That day was the next release.
`parseTopology` refuses unknown non-`x-` top-level keys as
`E_ENV_TOPOLOGY_SCHEMA`, so it would have rejected `$schema` on all 7 files —
the same fault [0015](srn://metaframework/adr/0015-artifact-dialects)
disqualified Stately's `xstate.json` on — and it did not, because the key is
already gone by the time it runs. It names `$schema` in its own
`TOPOLOGY_FILE_KEYS` regardless, for a caller holding raw bytes rather than a
loaded artifact. The order of the two pieces of work is the point: the guarantee
was made before the consumer existed, and the consumer inherited it without
being written to know about it.

**The schema's side is: admitted, optional, unpinned.** Optional and never
`required`, because a file without the header is the legacy dialect —
`W_ARTIFACT_DIALECT`, a warning, never a rejection — and a `required` here would
restate that warning as an error in the one place a severity cannot be relaxed.
The ajv run above measures both halves: 7 pass headed, 7 pass stripped.

## Absent

**No consumer generates anything from it.** Placement is a *claim* here, never a
deployable, and the devops product's
[0005-one-image-two-topologies](srn://metaframework/product/devops/adr/0005-one-image-two-topologies)
records the consequence from its own side — "two descriptions of one graph, kept
in step by hand". Nothing joins them to this file, so no drift check exists. That
absence is what keeps the format free to be minimal, and
[0016-topology-format-deferred](srn://metaframework/adr/0016-topology-format-deferred)
locks it as the trigger to reopen the format question: the day something
actually generates a deployment from these 21 entries, which industry format
belongs underneath stops being academic. Note what did *not* trigger it — this
release gave the format a full validator, and a validator is not a consumer. It
reads the file to judge it and emits nothing a machine runs.

**No derived placement view.** The format's own justification names one — "an
input to a review and to a derived placement view" — and the review half now has
a checker while the view half has nothing. There is no environment branch in
`entity-artifacts.tsx` and no placement diagram anywhere in the portal, so the
21 host entries are readable only as the YAML an author typed.
