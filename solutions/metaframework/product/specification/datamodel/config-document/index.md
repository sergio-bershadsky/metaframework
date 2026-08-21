---
name: config-document
kind: datamodel
version: 1
title: Config document
summary: config.yaml — which configuration keys a target provides and where their values come from, never a value that is a secret; the rule is one sentence and nothing enforces it.
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
`framework/spec/kinds/environment.md` (version 4, 493 lines) §"`config.yaml` —
the configuration surface"; measured 2026-08-21 with
`find solutions -name config.yaml`: **6 instances** — 1 in `solutions/acme`, 2 in
`solutions/brass`, 3 in this solution — carrying 39 entries.

It enters this bucket for the same reason
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
does, and below the same bar: the eight-instance threshold the product page set
put `config.yaml` (3 instances at the time) out of scope, and 6 does not clear
it either.
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) is what
admits it — the dialect a `config.yaml` declares is this entity's canonical
`$id`, and a discriminator needs something to point at.

## Why `usage: storage`

Nothing exchanges it today, and the spec says so in its own tense.
`environment.md` justifies giving `config.yaml` an SRN address by writing that a
file "that tools outside the catalog can cite by SRN is what lets it **grow
into** the solution's single point of configuration". Grow into. No portal
module parses it, no deployment tool in this repository reads it, and the key
names are in env-var casing because an operator copy-pastes them, which is a
convention rather than a contract with a consumer.

`grep -rn "config\.yaml" framework/portal/src` returns 3 hits: the role-table
row at `lib/srn/artifacts.ts:46` and two assertions in its test.
`components/entity/entity-artifacts.tsx` has no environment branch, so the file
renders as a YAML code block — the spec's "masked config surface (secret entries
render as key + source, never a value)" is a derived view that does not exist.

The `usage` answer is the one field here most likely to move: a component-side
declaration of *required* keys would make this file one half of a join, and a
join is an exchange.

## Nothing enforces it — the register says so

All seven of the environment kind's error classes sit in the debt register in
`framework/portal/src/lib/catalog/diagnostic-coverage.test.ts`; the table is in
[topology-document](srn://metaframework/product/specification/datamodel/topology-document),
which is the other half of the same gap. The three that belong to this file are
`E_ENV_CONFIG_SCHEMA` ("environment artifacts are parsed into `artifact.data`
and never validated"), `E_ENV_SECRET_VALUE` ("nothing scans environment config
for inlined secret values") and `W_ENV_CONFIG_ORPHAN`.

`E_ENV_SECRET_VALUE` is the one that matters. It is the format's hardest rule —
a secret value is forbidden *at any status, in any environment*, because the
file is reviewable in git and anything in it is public — and it is checked by
nobody. The rule holds across all 39 entries on disk, by author discipline
alone.

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
- **Removing a key is a review-time responsibility.** `environment.md` states
  the asymmetry rather than working around it: v1 has no component-side
  declaration of required keys, so the most valuable check — a component needs a
  key no environment provides — is not expressible, and the document declines to
  invent a field to make it so. Land the component change first, the
  `config.yaml` change second.

No top-level `version:` key. The `x-` escape hatch reaches the top level and
every entry, and **no file on disk uses it**.

## What the 6 instances actually exercise

Measured 2026-08-21:

| Solution        | files | entries | `for`-scoped | `value` | `secret` |
| --------------- | ----- | ------- | ------------ | ------- | -------- |
| `acme`          | 1     | 6       | 4            | 3       | 3        |
| `brass`         | 2     | 5       | 5            | 3       | 0        |
| `metaframework` | 3     | 28      | 0            | 4       | 0        |

All three `secret: true` entries in the repository are in one file,
`acme/environment/production/config.yaml`. All three carry a `source:` and none
carries a `value:`, so the format's exclusivity rule is honoured everywhere —
and unverified everywhere.

Two readings of the bottom row, and the second is a finding:

- **Twenty-eight of the 39 entries are environment-wide**, all of them in this
  solution, none carrying `for:`. `W_ENV_CONFIG_ORPHAN` is the only direction of
  the component join that v1 can check at all, and it needs `for:` — so on 28 of
  39 entries there would be nothing for it to check even once it exists.
- **Six entries say `SECRET` in prose and carry no `secret: true`.**
  `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_CLIENT_SECRET` and `HUB_SESSION_SECRET`
  in both `compose` and `production` open their `description` with "SECRET,
  supplied at deploy time" while leaving the machine-readable flag and `source:`
  unset. No rule is broken — none of them carries a value, which is the rule
  that protects anything — but a masked rendering would not mask them, and the
  fact that a human can read the file and a machine cannot is the whole argument
  for the flag.

Ten entries carry a `value:`, and all ten are YAML strings, which is what the
spec's `string` type asks for. That is the field a later additive dialect would
widen to native-typed scalars —
[0015](srn://metaframework/adr/0015-artifact-dialects) names it as the worked
example of an additive dialect change: same entity, same URL, same discriminator
string, and this meta-schema bumps its own `version` like any datamodel.

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

Uniqueness per `(key, for)` pair is not expressible: `uniqueItems` compares
whole entries, so two declarations of one key differing only in their
`description` are distinct to a validator. `W_ENV_CONFIG_ORPHAN` needs the
resolved catalog.

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

Six hand-written cases behave. Rejected: `key: database-url`, a `secret: true`
entry carrying a `value:`, and a `secret: true` entry with no `source:`.
Accepted: an explicit `secret: false` beside a `value:`, and — recorded rather
than glossed — the same `key` declared twice with no `for:` on either.

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

**The loader strips it, and nothing here needed a carve-out.** `adoptDialect`
(`framework/portal/src/lib/catalog/dialects.ts:166`) records the dialect on the
artifact and deletes the key from the parsed document during `loadCatalog`;
`Artifact.raw` keeps the file as authored, so `/artifacts` and the source pane
still serve the header. Like its
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
sibling and unlike the three formats with parsers, this one had no strict
validator downstream to teach — the loader parses the YAML and no
format-specific reader takes it from there. The stripping is done anyway, which
is what makes the promise survive the day something finally reads this file:
whatever gets written then is handed a document with no framework key in it, and
inherits the guarantee without having to know about it.

**The schema's side is: admitted, optional, unpinned.** Optional and never
`required`, because a file without the header is the legacy dialect —
`W_ARTIFACT_DIALECT`, a warning, never a rejection — and a `required` here would
restate that warning as an error in the one place a severity cannot be relaxed.
The ajv run above measures both halves: 6 pass headed, 6 pass stripped.

## Absent

**No contract behind the keys.** A key is a name, a scope and a sentence; there
is no type, no enum, no required-ness, and no statement of what a valid value
looks like. `E_ENV_CONFIG_SCHEMA` checks the shape of the declaration and
nothing about what is declared — so `HUB_DATA_MAX_BYTES` and `LOG_LEVEL` are the
same kind of thing to this format, and the two entries in this solution that say
"UNSET AND REQUIRED" in prose say it in prose because there is no field for it.
