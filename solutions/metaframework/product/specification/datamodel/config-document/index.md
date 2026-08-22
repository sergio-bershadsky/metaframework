---
name: config-document
kind: datamodel
version: 3
title: Config document
summary: config.yaml — which configuration keys a target provides and where their values come from, never a value that is a secret; the rule is one sentence, and as of this version a reader enforces it.
status: review
owner: sergio
usage: storage
abstract: false
tags:
  - spec
  - format
  - environment
---

`config.yaml` beside an environment's `index.md`: **the configuration surface
this target provides**. The convention is one sentence long — an environment
declares which keys it provides and where their values come from; it never
carries a secret value. OPTIONAL. Specified in
`framework/spec/kinds/environment.md` §"`config.yaml` — the configuration
surface". Every solution here declares at least one, this one the most;
`find solutions -name config.yaml` is the census, and it moves whenever an
environment is added.

It enters this bucket for the same reason
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
does, and below the same bar: the instance threshold the product page set put
`config.yaml` out of scope when it was written, and the file has not multiplied
fast enough to clear it since.
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) is what
admits it — the dialect a `config.yaml` declares is this entity's canonical
`$id`, and a discriminator needs something to point at.

## Why `usage: storage`, after the reader landed

`usage` answers where *instances* of this model live, and instances of this one
live in the tree. That was the answer when nothing read the file, and it is
still the answer now that something does — a reader is not a boundary crossing.
`environment.md` justifies giving `config.yaml` an SRN address by writing that a
file "that tools outside the catalog can cite by SRN is what lets it **grow
into** the solution's single point of configuration", and the key names are in
env-var casing because an operator copy-pastes them, which is a convention
rather than a contract with a consumer. No deployment tool in this repository
reads it, and no third party is contracted to accept it.

The previous version of this entity predicted the one change that would move
`usage`: "a component-side declaration of *required* keys would make this file
one half of a join, and a join is an exchange." Half of that has happened and
the conclusion was wrong. The join exists —
`framework/portal/src/lib/environment/environment.ts` reads every `config.yaml`
and checks it against the `usage: config` datamodel in each hosted component's
own bucket — and it moved nothing, because both
halves of the join are files in this repository read by code in this repository.
An exchange needs a consumer outside it. Recording the mistaken prediction is
worth more than deleting it: the test for `exchange` is the boundary, not the
existence of a reader.

`grep -rn "config\.yaml" framework/portal/src` returns 15 hits, 8 of them
outside tests: the `ARTIFACT_ROLES` row in `lib/srn/artifacts.ts`, one line of
`lib/catalog/dialects.ts`, one in `lib/catalog/index.ts` where the check is
folded into the load pipeline, and five in the reader itself.
`components/entity/entity-artifacts.tsx` still has no environment branch, so the
file renders as a YAML code block — the spec's "masked config surface (secret
entries render as key + source, never a value)" is a derived view that does not
exist, and it is now the only thing `environment.md` says about this file that
nothing carries out.

## The register is empty now, and this is what came out of it

Version 1 of this entity said nothing enforced the format, and it was right at
the time: seven environment codes sat in the debt register in
`framework/portal/src/lib/catalog/diagnostic-coverage.test.ts`, in two pairs
that shared a sentence apiece — this file's `E_ENV_CONFIG_SCHEMA` alongside its
sibling's `E_ENV_TOPOLOGY_SCHEMA` under "environment artifacts are parsed into
`artifact.data` and never validated". That register is a ratchet rather than an
exemption; the inventory suite fails the moment an entry gains an emitter, so
implementing a rule forces its line out. The lines are out. The environment
section of that map is now empty, and `environment.md` v6 states **eleven**
codes rather than seven, all of which fire.

`framework/portal/src/lib/environment/environment.ts` is the emitter, folded
into the load pipeline by `withEnvironmentChecks` in `lib/catalog/index.ts` —
after the schema registry, because the last four codes read a *datamodel's*
flattened schema. Eight of the eleven can be pathed at a `config.yaml`:
`E_ENV_CONFIG_SCHEMA`, `E_ENV_SECRET_VALUE`, `E_ENV_TARGET_KIND`,
`E_ENV_CONFIG_VALUE`, `E_ENV_SECRET_MISMATCH`, `W_ENV_CONFIG_ORPHAN`,
`W_ENV_CONFIG_UNDECLARED` and `W_ENV_CONFIG_MISSING`. The other three belong to
[topology-document](srn://metaframework/product/specification/datamodel/topology-document),
and `E_ENV_TARGET_KIND` is the one both files share.

`E_ENV_SECRET_VALUE` is still the rule that matters. A secret value is forbidden
*at any status, in any environment*, because the file is reviewable in git and
anything in it is public. It held across all 39 entries by author discipline
alone for as long as this entity existed, and it still holds: `metaframework
check` reports **zero** environment diagnostics against all 6 files as they
stand. No entry anywhere pairs `secret: true` with a `value:`. That is the
undramatic outcome and the one worth stating plainly — the rule is now kept by
something that does not get tired, and the thing it enforces was already true.

## What the format decides

- **Three layers, and only two of them are in git.** The contract (which keys
  exist, and what they control), the declaration (`key` plus a `source`
  locator), and the value — which lives in a vault or at deploy time and never
  here. `secret: true` is the switch between the two shapes an entry may take,
  and the only field that changes which other fields are legal.
- **`source` is a locator and never the value.** Free-form but stable. It is
  required exactly when `secret` is true, which is the one rule in this format
  that a JSON Schema can hold — see below.
- **`SCREAMING_SNAKE_CASE`, deliberately not kebab-case.** Config keys belong to
  the runtime's namespace, not the catalog's, and the casing split makes
  `grep -r DATABASE_URL solutions/` unambiguous against SRN segments, which are
  kebab-case by grammar.
- **Scope is carried per entry, by `for:`.** Absent means environment-wide.
  There is no grouping key and no preamble; a key that applies to one component
  says so on its own row.
- **Removing a key is still a review-time responsibility, but it is no longer
  unwatched.** v1 of the kind had no component-side declaration of required
  keys, so the most valuable check — a component needs a key no environment
  provides — had no operands, and the document declined to invent a
  component-side field to make it so. That refusal held: what supplies the
  missing half is an ordinary datamodel entity in the component's own bucket
  carrying `usage: config`, and `component.md` gained no field. The check is
  `W_ENV_CONFIG_MISSING`, and it is a warning for the ordering reason that
  survives the join — land the component change first and the `config.yaml`
  change second, and the window between them is a warning rather than a broken
  build.

No top-level `version:` key. The `x-` escape hatch reaches the top level and
every entry, and **no file on disk uses it**.

## What the 6 instances actually exercise

Measured 2026-08-21:

| Solution        | files | entries | `for`-scoped | `value` | `secret` |
| --------------- | ----- | ------- | ------------ | ------- | -------- |
| `acme`          | 1     | 6       | 4            | 3       | 3        |
| `brass`         | 2     | 5       | 5            | 3       | 0        |
| `metaframework` | 3     | 28      | 0            | 4       | 6        |

The 9 `secret: true` entries sit in three files, three apiece:
`acme/environment/production`, and this solution's `compose` and `production`.
All 9 carry a `source:` and not one carries a `value:`, so the format's
exclusivity rule is honoured everywhere — and now checked everywhere. The three
`source:` schemes on disk are `vault:`, `k8s:secret/` and `env-file:`, which is
the field's "free-form but stable" doing its job: nothing parses the locator,
and the deployment that resolves it is not the same one in all three cases.

Two readings of the bottom row:

- **All 28 of this solution's entries are environment-wide**, not one carrying
  `for:` — and two more in `acme/production` bring the corpus total to **30 of
  the 39**. That is not the dead end it was. Three of the
  eight config codes need a `for:` to have a target at all —
  `W_ENV_CONFIG_ORPHAN`, `W_ENV_CONFIG_UNDECLARED` and, on an entry, the `for:`
  half of `E_ENV_TARGET_KIND` — but the environment-wide entry is checked by the
  resolution rule the kind document states for it: no `for:` means *every hosted
  contract that declares this key*, and `W_ENV_CONFIG_MISSING` reads those 30
  entries from the other direction, as the set that satisfies a hosted
  component's must-provide keys. An entry with no scope is now checkable; it was
  the join it was missing, not a field.
- **The six entries that said `SECRET` in prose now say it in the schema.** v1
  of this entity recorded them as the finding of the survey:
  `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_SECRET` and `HUB_SESSION_SECRET`
  in both `compose` and `production` opened their `description` with "SECRET"
  and left the machine-readable flag and `source:` unset. No rule was broken —
  none of them carried a value — but a masked rendering would not have masked
  them. All six were marked `secret: true` with a `source:` in the same batch
  that added the checker, which is why the `secret` column above reads 6 where
  v1 measured 0. The finding closed by the corpus moving, not by a rule firing;
  no rule was ever going to fire on it, because "the prose says SECRET" is not
  something a validator can read.

Ten entries carry a `value:`, and all ten are YAML strings — a boolean spelled
`"false"`, an integer spelled `"8000"`. That was the field
[0015](srn://metaframework/adr/0015-artifact-dialects) named as the worked
example of an additive dialect change, and the change has now been made:
`environment.md` v6 types `value` as string, number **or** boolean, and the
sibling `schema.json` here was widened to match in this entity's v2. It is
additive in the exact sense `evolution.md` means — every one of those 10
documents that validated against the narrower type still validates — so the
entity, the URL and the discriminator string are all unchanged and only this
meta-schema's own `version` moved. **No file on disk uses the new latitude yet**:
all 10 values are still quoted strings, so the widening is a capability the
corpus has not spent, and the coercion rule the kind document states — a quoted
`"8000"` satisfies an `integer` contract, lexically and never semantically — is
what makes that cost nothing.

## The one prose rule a schema can hold, and the cap it cannot survive

`schema.json` here states the format in stock 2020-12: the required `config`
list, the six entry fields, the env-var key pattern, and `x-` tolerance at both
levels. It also admits the dialect discriminator: `$schema`, typed as a non-empty
string and deliberately not pinned to the `$id` with `const`. A file naming some
other dialect is `W_ARTIFACT_DIALECT`, a warning read as the legacy dialect and
never broken, and a `const` would state that one fact at a second, harder
severity that JSON Schema gives no way to turn down. The encoding is shared by
all six framework meta-schemas, and
[state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document)
records why it is the only one they could share.

The rule worth pointing at is the one that **is** expressible, because its
sibling format's headline rule is not.
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
cannot state `min ≤ max`, since comparing two sibling properties is outside the
2020-12 vocabulary. Here, `secret: true` ⇒ `source` required and `value`
forbidden is one `if`/`then` — the condition is a *value*, not a comparison, and
that is the whole difference. The schema keys it on `secret: true` rather than
on the presence of `secret`, so an explicit `secret: false` stays the ordinary
shape.

Two rules stay outside it, and both are now held by the reader instead.
Uniqueness per `(key, for)` pair is not expressible here — `uniqueItems`
compares whole entries, so two declarations of one key differing only in their
`description` are distinct to a validator — and `parseConfig` keys a `Map` on
the pair and reports the second as `E_ENV_CONFIG_SCHEMA`. `W_ENV_CONFIG_ORPHAN`
needs the resolved catalog, which is the other reason a meta-schema is a
statement of the format and not the enforcement of it: the published document is
what an outside validator can run, and the checks that need two documents are
necessarily the portal's.

Re-checked 2026-08-21 with `ajv` 2020 against all 6 files, as they now stand on
disk: **all 6 validate**, headed, and all 6 again with the header stripped. The
first run, before the header sweep, was 4 of 6. Both failures were in this
solution and both were the same clause — 9 of the 39 `description` values
exceeded the field's stated 200-character cap, the longest at 314 — and all nine
were rewritten in the same batch that added the headers; the longest description
in the repository is now **199**. The pressure that produced them has not gone
anywhere, and it is a fact about the format rather than about those authors.
`topology.yaml` gives prose an uncapped `notes` field beside its capped
`scaling`; `config.yaml` has **no uncapped field at all**, so an author with a
paragraph of reasoning about why a key is unset has exactly one place to put it,
and the cap is the first thing to give. Nine violations, followed by a corpus
whose longest surviving description is 199 characters against a cap of 200, is a
format sitting hard on its own limit rather than one with room in it.

Ten hand-written cases behave, five of them exercising the widened `value`.
Rejected: `key: database-url`, a `secret: true` entry carrying a `value:`, a
`secret: true` entry with no `source:`, `value: [a.example, b.example]` — a list
is not a scalar, and the spec's own counter-example — and `value: null`.
Accepted: `value: 8000`, `value: false`, `value: "8000"` (the pre-widening
spelling, which is the whole point of calling the change additive), an explicit
`secret: false` beside a `value:`, and — recorded rather than glossed — the same
`key` declared twice with no `for:` on either, which only the reader catches.

## The header, now that the sweep has landed

**Every instance carries the discriminator.** Measured 2026-08-21: all 6
`config.yaml` files open with
`$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/config-document`
as their first key. The count
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) took —
none of the 6 — is the before; this is the after, and it was not billed
separately. Every one of these 6 environments carries a
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
beside its `config.yaml`, the two artifacts share an entity and therefore a
version, and a seventh environment carries topology alone: **13 files, 7 version
bumps** across the whole environment kind. The sweep is the cleanest available
demonstration that the entity is the unit of versioning and the artifact is not.
`W_ARTIFACT_DIALECT` is implemented and reports nothing on this role.

**The loader strips it, and the reader that arrived next collected on that.**
`adoptDialect` (`framework/portal/src/lib/catalog/dialects.ts:192`) records the
dialect on the artifact and deletes the key from the parsed document during
`loadCatalog`; `Artifact.raw` keeps the file as authored, so `/artifacts` and
the source pane still serve the header. When this entity was written there was
no strict validator downstream to teach, and the stripping was done anyway
against a day that had not come. It came in the next release. `parseConfig`
rejects unknown non-`x-` top-level keys as `E_ENV_CONFIG_SCHEMA` and would have
rejected `$schema` on the first file it read — the exact fault
[0015](srn://metaframework/adr/0015-artifact-dialects) disqualified Stately's
`xstate.json` on — and it did not, because by the time it runs the key is gone.
It still names `$schema` in its own key list, for the caller that arrives
holding raw file bytes rather than a loaded artifact; that is belt and braces,
and the braces are the loader.

**The schema's side is: admitted, optional, unpinned.** Optional and never
`required`, because a file without the header is the legacy dialect —
`W_ARTIFACT_DIALECT`, a warning, never a rejection — and a `required` here would
restate that warning as an error in the one place a severity cannot be relaxed.
The ajv run above measures both halves: 6 pass headed, 6 pass stripped.

## Absent

**The contract behind the keys is no longer absent, and it is not in this
format.** v1 of this entity recorded the hole: a key was a name, a scope and a
sentence, with no type, no enum and no required-ness, so `HUB_DATA_MAX_BYTES`
and `LOG_LEVEL` were the same kind of thing here. The hole was filled without
adding a field to this document — the type, the enum, the default and the
`writeOnly:` flag live in a `usage: config` datamodel in the component's own
bucket, and this file's entry joins to it by string equality on the key and
nothing else. Measured 2026-08-21: **13 `usage: config` datamodels on disk** —
10 concrete component contracts and 3 abstract bases they `allOf` into. That
split is the reason
`schema.json` here still types `value` as any scalar rather than anything
narrower: the narrow type is a property of the key, the key belongs to the
component, and a meta-schema for the environment's file has no business knowing
it. `E_ENV_CONFIG_VALUE` is where the two meet.

**The masked rendering.** The spec's "masked config surface (secret entries
render as key + source, never a value)" still has no implementation:
`entity-artifacts.tsx` has no environment branch, so a `config.yaml` renders as
a plain YAML code block like any unrecognised artifact. It is now the only
statement `environment.md` makes about this file that nothing carries out — and
the 9 `secret: true` entries it would mask are the reason it is worth building:
they are correct today because every one of them omits `value:`, which is a
property of the corpus rather than of the renderer.

**Two entries still say "UNSET AND REQUIRED" in prose**, both in this solution's
`production`: `HUB_DATA_MAX_BYTES` and `SIGNOZ_TRACE_RETENTION_DAYS`. v1 of this
entity said they were prose "because there is no field for it", and there is one
now — on the other side of the join. Both keys are declared by a contract, and
the two contracts disagree about them in exactly the way the split intends:
repo-sync types `HUB_DATA_MAX_BYTES` as `integer, minimum 1` and lists it in
`required` with no `default`, so it is must-provide and the environment-wide
entry here satisfies `W_ENV_CONFIG_MISSING` by declaring the key at all — a
declaration with no value counts as provided, because the value arrives at
deploy time and the catalog's job was to say the key is expected. SigNoz types
its retention the same way and deliberately does *not* require it, on the
grounds that compose declares none and ClickHouse starts on its own default.
Neither sentence had anywhere to live in this format before, and neither of them
moved into it.
