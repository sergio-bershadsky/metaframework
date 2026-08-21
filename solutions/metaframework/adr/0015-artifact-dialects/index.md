---
name: 0015-artifact-dialects
kind: adr
version: 1
title: Artifacts declare their dialect
summary: Every artifact declares its dialect in-file — a native key where the format has one, $schema at the framework meta-schema URL otherwise; a file without one is legacy, warned and never broken.
status: review
owner: sergio-bershadsky
decision-status: proposed
date: "2026-08-21"
relations:
  uses:
    - /product/specification/component/core-contracts
    - /product/specification/component/kind-contracts
    - /product/specification/datamodel/schema-document
    - /product/specification/datamodel/transport-document
    - /product/specification/datamodel/state-machine-document
    - /product/specification/datamodel/workflow-document
    - /product/portal/component/catalog-loader
    - /product/portal/component/protocol-model
    - /product/portal/component/schema-service
tags:
  - dialects
  - artifacts
  - evolution
---

## Context

The 0.2.0 plan rests on one sentence: the envelope — frontmatter, SRNs,
relations, the role table — stays proprietary, and the payloads behind the roles
standardize one dialect at a time, additively. `transport.yaml` becomes
AsyncAPI, `config.yaml` grows typed values, `states.json` is already XState.
Each of those is a payload swap inside a filename that does not move.

A reader cannot perform an additive migration it cannot detect. Today no
proprietary artifact in the catalog says what it is. Measured at this commit,
`transport.yaml` opens with `kind: kafka` — which discriminates the *wire
protocol*, not the document; a workflow file opens with `name:`; `journey.yaml`
with `name:`; `topology.yaml` with `regions:`; `config.yaml` with `config:`;
`states.json` with `{"id": …}`. Every one of those keys is content. Only
`openapi.yaml` announces itself, and only because OpenAPI made it mandatory.

So a portal meeting a `transport.yaml` in 0.2.1 must decide, from shape alone,
whether it is holding the mini-spec or AsyncAPI 3.1 — and shape-sniffing is a
second grammar nobody wrote down, kept in sync with the real ones by hand,
failing silently on the first two dialects that share a prefix of keys. That is
the failure this record exists to prevent, and it has to be prevented *before*
the first payload lane lands, not with it.

The framework already solved this once, for exactly one role, and never
generalised the solution. A datamodel's `schema.json` MUST carry
`$schema: https://json-schema.org/draft/2020-12/schema`, checked at load, and
the violation code is already named `E_DM_DIALECT`
(`framework/spec/kinds/datamodel.md`). One role
out of nine has a dialect discriminator, an error class for its absence, and a
key spelling. The other eight have nothing.

Two prior decisions make the generalisation cheap. `.transport` names a **role,
not a format** ([0014-artifact-addresses](srn://metaframework/adr/0014-artifact-addresses)),
so a dialect migration never moves an address — the property that lets a
discriminator live inside the file instead of in its name. And five meta-schemas
already exist as ordinary datamodel entities under
`product/specification/datamodel/` — `transport-document`,
`state-machine-document`, `workflow-document`, `schema-document`,
`entity-frontmatter` — each with a canonical `$id`, each already served by
`/schemas`, because the route whitelists `kind: datamodel` and asks nothing else.
There is a URL to point a discriminator at, and it costs no route work.

The census, counted on disk at this commit — **145** artifacts. That is three
more than [0014](srn://metaframework/adr/0014-artifact-addresses) counted, and
the three are this commit's own doing: `journey-document`, `topology-document`
and `config-document` are new meta-schema entities, each contributing one
`schema.json`. **70** carry no discriminator and would gain one: 24
`workflows/*.yaml`, 16 `transport.yaml`, 9 `journey.yaml`, 8 `states.json`, 7
`topology.yaml`, 6 `config.yaml`. **73** are already settled: 69 `schema.json`
carry `$schema` today, and 4 `examples/*.json` will never carry anything. **2**
`openapi.yaml` already open `openapi: 3.1.0`. The 70 files that change belong to
33 entities — 17 protocols, 9 journeys, 7 environments.

One constraint is fixed before the decision starts:
`framework/spec/evolution.md` forbids a top-level
`version:` key in any artifact. The frontmatter is the only place a version
lives, and a `version:` in `transport.yaml` is a shape violation for the kind.
Whatever the discriminator is spelled, it is not that.

## Decision

**Every addressable artifact declares its own dialect, in its own bytes, under
one key fixed per role by the table below.** Where the format has a native
discriminator the native one is used and nothing is invented; where it does not,
the artifact carries `$schema:` holding the canonical URL of the framework
meta-schema that defines its dialect.

### The discriminator table

The framework meta-schemas share one prefix, which is the canonical schema URL
of the `specification` product's `datamodel/` bucket
([0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)):

```text
{meta} = https://schemas.metaframework.dev/metaframework/product/specification/datamodel
```

| Kind          | Role               | File                    | Key         | Value                            |
| ------------- | ------------------ | ----------------------- | ----------- | -------------------------------- |
| `datamodel`   | `schema`           | `schema.json`           | `$schema`   | the 2020-12 dialect URI (native) |
| `datamodel`   | `examples.<name>`  | `examples/<name>.json`  | none        | — (see below)                    |
| `protocol`    | `transport`        | `transport.yaml`        | `$schema`   | `{meta}/transport-document`      |
| `protocol`    | `states`           | `states.json`           | `$schema`   | `{meta}/state-machine-document`  |
| `protocol`    | `openapi`          | `openapi.yaml`          | `openapi`   | `3.1.x` (native)                 |
| `protocol`    | `workflows.<name>` | `workflows/<name>.yaml` | `$schema`   | `{meta}/workflow-document`       |
| `journey`     | `journey`          | `journey.yaml`          | `$schema`   | `{meta}/journey-document`        |
| `environment` | `topology`         | `topology.yaml`         | `$schema`   | `{meta}/topology-document`       |
| `environment` | `config`           | `config.yaml`           | `$schema`   | `{meta}/config-document`         |

Spelled out, with no abbreviation, this is a `transport.yaml` header:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: kafka
summary: Normalized carrier scans published by the gateway.
```

and a `states.json` header:

```json
{
  "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document",
  "id": "order-placement",
  "initial": "requested"
}
```

Three rows deserve their reasons stated rather than implied.

**`schema.json` is not ours to discriminate.** `$schema` on a JSON Schema
document is the meta-schema of the *JSON Schema dialect*, and it is already
REQUIRED to be exactly `https://json-schema.org/draft/2020-12/schema`
(`E_DM_DIALECT`). The key is spoken for by the format itself, and pointing it at
`{meta}/schema-document` would break every stock validator in exchange for
nothing. The `schema-document` meta-schema stays what it is — the framework's
description of what a catalog `schema.json` must additionally satisfy — and is
named by `x-srn`-style convention in the spec, never by the instance.

**`examples/*.json` carry no discriminator, ever, and this is a rule and not an
omission.** An example is an *instance* of its sibling schema; its dialect is
that schema's dialect and it has none of its own. Injecting `$schema` would add
a property the schema must then admit, and `additionalProperties: false` is
normal in this catalog — the discriminator would make the example fail the very
document it exemplifies. `W_ARTIFACT_DIALECT` MUST NOT be raised on an
`examples/*` file.

**`openapi.yaml` shows the shape every future standard takes.** A format that
already names itself keeps doing so; the framework adds nothing. When
`asyncapi.yaml` and `arazzo.yaml` land they take `asyncapi:` and `arazzo:` the
same way, and when `transport.yaml` gains an AsyncAPI dialect *inside its
existing filename*, `asyncapi: 3.1.0` is that dialect's discriminator — the
`$schema` row above is the mini-spec dialect's, not the role's forever.

Its value is written `3.1.x` and not `3.1.0`, and the reason generalises to
every native row. OpenAPI versions the *document*, so `3.1.1` is the same
dialect as `3.1.0` with errata applied; a reader that recognised only the exact
string would raise `W_ARTIFACT_DIALECT` on a correct file whose author had done
nothing but track a patch release, which is a diagnostic reporting the reader's
own narrowness as the file's fault. Recognition is therefore the whole `3.1`
line — `framework/portal/src/lib/catalog/dialects.ts` matches `/^3\.1\.\d+$/` —
while the advice a headerless file gets still names one concrete value,
`openapi: 3.1.0`, because "declare some 3.1.x" is not something an author can
paste. Both catalog `openapi.yaml` files declare `3.1.0` today, so both are
recognised by either rule; the widening is for the release that has not happened
yet. The framework rows need no equivalent latitude: a meta-schema URL carries
no version at all, so there is nothing there to widen.

`index.md` is deliberately absent: it is not in the role table, it is not an
addressable artifact, and its frontmatter already opens with `kind:`, a
discriminator the loader has read since v1. `entity-frontmatter` remains a
meta-schema for external tooling, not an authority any document names.

### Why `$schema`, and why it is not `version:`

`$schema` earns the role on three grounds that stand whether or not any URL is
ever fetched, and a fourth that has conditions. It is the **conventional key for
exactly this job**: `yaml-language-server`, VS Code's JSON/YAML support and the
SchemaStore convention all read a top-level `$schema` as "the schema that
validates this document", so the framework invents no vocabulary and a reader
who has never seen this catalog already knows what the key is asserting. It is
**already native on `schema.json`**, so the seven roles that end up carrying it
spell one idea one way, rather than the framework adding a second spelling
beside the one it has enforced as `E_DM_DIALECT` since v1. And it is **not
`version:`**, which `framework/spec/evolution.md` forbids in an artifact
outright — argued at the end of this section.

The fourth ground is editor tooling, and it is genuine but **asymmetric**, so it
has to be stated in both halves or it is an overclaim. What makes it sayable at
all is new as of 2026-08-21: `schemas.metaframework.dev` is **registered and
held by this project**. The host every canonical `$id` names is one the
framework controls rather than an identifier it hopes stays free, so the spec's
long-standing claim that it is "a stable canonical constant, not configuration"
(`framework/spec/index.md`, decided in
[0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)) is
now backed by ownership and not only by intent, and the latent risk in minting
identifiers on a domain somebody else could take is gone.

**Half one — the discriminator values are the framework's own to publish.**
Every value in the table above lives under
`metaframework/product/specification/datamodel/`. Those are framework
meta-schemas: part of the published framework, not any private catalog's
content, so serving them at their own `$id` is a step this project can take
unilaterally on a host it owns. Once it has, an author editing `transport.yaml`,
`journey.yaml` or `config.yaml` gets completion and inline validation out of a
stock editor for the price of a header — no plugin, no framework-specific
tooling. That benefit is real and deliverable, and the `$schema` spelling is
what earns it; a private token would not.

**It is contingent on that publishing step, which has not happened.** 0007
records that nothing in this repository serves the canonical host, and
registering the domain made publishing possible, not done. Until the meta-schema
documents are actually served at their `$id`, the header helps a machine that
already knows the framework and does nothing whatever in an editor. The
consequences below name that publishing as an obligation this decision creates
and does not discharge; nothing in the decision depends on it, which is why the
first three grounds were stated first.

**Half two — a catalog's own datamodels never get this, and that is by design
rather than by delay.** An `acme` model carries
`$id: https://schemas.metaframework.dev/acme/datamodel/money` under the same
canonical-identity rule, and that URL will not resolve on that host now or
later: `acme`'s models are not the framework's to serve. They are served by that
catalog's own portal at `{SCHEMA_BASE_URL}/schemas/…`, and a consumer that
prefers fetching to trusting a cache maps the canonical host onto that serving
address in one line of resolver config — precisely the identity-versus-retrieval
split 0007 drew. So identity is global and owned for everything in a catalog,
while *retrieval* is global for the framework's meta-schemas and local for a
catalog's own content. A dialect discriminator only ever names the first sort,
which is exactly why the editor argument applies to it and stops there.

The value is an HTTP URL rather than a short token for the reason that survives
all of the above: a token names a registry that does not exist and teaches a
stranger nothing, while a URL is identity in the one form a stock resolver can
already be pointed at. That is the bet
[0006](srn://metaframework/adr/0006-dereferenceable-schema-urls) measured and
0007 kept, applied to the other six roles.

It is **not** `version:`, and not any spelling containing one, for a reason that
is normative and not aesthetic. `framework/spec/evolution.md` states that the
frontmatter is the only place a version lives and that a top-level `version:` in
a sibling artifact is a shape violation. That rule is what makes an entity
`version` a snapshot of the whole directory, which is what makes `X.role@N`
resolvable at all ([0014](srn://metaframework/adr/0014-artifact-addresses)); a
per-file version key re-opens the second clock 0014 refused. It is also the
wrong concept: a dialect is not a revision of this document, it is the grammar
this document is written in. Two `transport.yaml` files in the same dialect
differ in version constantly, and one file can move three versions without its
dialect changing once.

### The URL names a dialect, and dialect identity is entity identity

A meta-schema URL carries no `@N` — it addresses the *current* schema, exactly
as every other canonical schema URL does. So the discriminator identifies a
dialect and never a revision of one, and the two ways a dialect can change fall
out of the existing evolution rules with nothing new to learn:

- **An additive dialect change** — `config.yaml` permitting native-typed
  `value:` scalars, say — is an ordinary superset extension of the meta-schema
  entity. Same entity, same URL, same discriminator string; the meta-schema
  entity bumps its own `version` like any datamodel.
- **A non-additive dialect change** is a **swap**: a new meta-schema entity with
  its own name, its own canonical URL, and a `supersedes` edge to the old one.
  Both URLs are then recognised, which is precisely what "a new dialect lands
  beside the old" means at the meta-schema level.

### Absent or unrecognised is the legacy dialect

An artifact carrying no recognisable discriminator is read as the **legacy
dialect** — the format as this spec defines it today — and is **warned, never
broken**. The class is `W_ARTIFACT_DIALECT`, a warning, on the entity that owns
the file. Two message forms, one class:

```text
transport.yaml declares no dialect — read as the legacy dialect; add
  `$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document`

transport.yaml declares dialect "https://example.com/foo", which is not a
  known dialect of the transport role — read as the legacy dialect
```

Both end in the same clause because it is the contract: whatever the header
says or fails to say, the file is still parsed, still rendered, still checked
against the legacy grammar. Nothing in this decision can make a catalog that
loads today stop loading. `W_ARTIFACT_DIALECT` is a nudge with no forcing
function, deliberately — the terminal state, where absence is an error, is what
`E_DM_DIALECT` already looks like for `schema.json`, and promoting the other
roles to it is a later decision made once every file carries a header.

### Filenames stay

**This decision changes no filename and touches no row of the role table.** A
dialect is a property of a file's *contents*; the role table in
`framework/spec/structure.md` is a spec constant mapping kind × role to a fixed
name, and a new dialect inside an existing filename is not an amendment to it.
`transport.yaml` holding AsyncAPI is still `transport.yaml`, still
`srn://…/settlement.transport`, still one row.

The converse is the ruling that matters: **a lane that wants a new filename must
come back for a role-table amendment.** `arazzo.yaml` beside `workflows/` is a
new role and needs one; `transport.yaml` becoming AsyncAPI does not. The two are
different changes with different blast radii — a new row mints addresses and
obliges every SRN parser; a new dialect obliges only the reader of that one
file — and collapsing them would let any payload lane rewrite the identity
grammar as a side effect.

### The key is stripped once, and admitted by name where bytes still carry it

The question of how a strict validator admits an extra key has two answers, and
both are needed. Loading a catalog, the validators never see the key. Called
directly on the bytes of one file, they do — so all three admit it, by name.

**In the catalog, it never reaches a validator.** `readEntity`
(`framework/portal/src/lib/catalog/load.ts`) calls `readArtifacts` to read and
parse every sibling file into `Artifact.data`, with the bytes kept verbatim in
`Artifact.raw`, and then — in a loop over what came back, before the `Entity` is
assembled and before anything downstream is handed a document — calls
`adoptDialect` on each (`framework/portal/src/lib/catalog/dialects.ts`). That
loop is where the dialect is recorded on the `Artifact` and where the
**framework-owned `$schema` is deleted from `data`**. It is deleted whether or
not its value was recognised: an unrecognised dialect is a warning by decision,
and a leftover key would convert that warning into an unknown-key *error* from
the validator downstream, which is the one outcome this record promises cannot
happen. A native discriminator — `openapi:`, later `asyncapi:` — is part of its
own format and is **never** stripped; `schema.json`'s `$schema` is native too
and stays.

**Outside the catalog, all three parsers admit it, and all three were changed to
say so.** `parseStates`, `parseWorkflow` and `parseJourney` are exported
functions over an already-parsed document, and the loader is not their only
caller: a fixture, a unit test, an external consumer holding the raw bytes of one
file calls them directly. Such a caller has not been through `adoptDialect`, so
the header is still in hand — on a file this very spec told the author to write.
Rejecting it there would make the framework's own instruction illegal in the
framework's own parser, reporting `E_JRN_SCHEMA` or a zod unknown-key error
against a document that is correct. So:

- `states.ts`'s `machineSchema` admits `$schema` as an **optional bare string**,
  and `MachineConfig` is now `Omit<…, '$schema'>`: a private `subsetOf()` drops
  the key, so `parseStates` yields the subset even when it was handed the whole
  document. The `createMachine` contract still holds verbatim — the residue, not
  the file, is what the states lane's proof-of-contract test constructs, and the
  residue is also what Stately's own published schema validates, since its
  `additionalProperties: false` forbids the key outright. Dropping the header is
  not a workaround for XState; it is what keeps "a states.json *is* an XState
  config" literally true after the header lands.
- `workflow.ts`'s `workflowFileSchema` admits the same optional string at the
  file root, and nowhere else.
- `journey.ts` adds `$schema` to `KNOWN_FILE_KEYS`, so the unknown-top-level-key
  check no longer raises `E_JRN_SCHEMA` on it. `KNOWN_STEP_KEYS` is deliberately
  untouched: a step is not an artifact root, and a dialect header on one would
  name the grammar of nothing.

`machineSchema` has a second, independent reason that would force the same
change even if no caller ever held raw bytes. The published
`state-machine-document` meta-schema is **generated from `machineSchema`**
(`framework/portal/src/lib/protocol/state-machine-document.ts`), and a
meta-schema whose `additionalProperties: false` forbids the very key that points
at it cannot validate the file it describes. That is the exact ground on which
this record disqualifies Stately's `xstate.json` below; it applies to the
framework's own schema identically, so a validator that refused the header would
emit a published schema carrying the same defect — and turn every file red in
the first editor that followed the URL.

**Admitting a framework-owned key by name is not the `x-` hatch, and the
distinction is the whole point.** `x-` is open-ended and belongs to *authors*:
any key, any shape, any number of them, and the framework promises only not to
look. What landed is one key, spelled the way this record spells it, at the
artifact root and nowhere else, optional, and typed as a bare non-empty string
rather than pinned to the canonical URL — bare deliberately, because an
unrecognised dialect is `W_ARTIFACT_DIALECT`, a warning raised by the loader,
and pinning the value in a zod schema would re-raise the same fact as a parse
error in the wrong layer. Spelling the discriminator `x-schema` to slip it past
the strict validators would have been the framework hiding inside the extension
mechanism it gave its users; naming one key in three places, in the open, with
the stripping still done once at the loader, is the opposite of that. Every
other unknown top-level key is rejected exactly as it was before.

`Artifact.raw` is untouched throughout, so `/artifacts` and the portal's source
pane serve the file as authored, discriminator included. The residue is an
internal parse product and is never served as the document.

### Adding a discriminator bumps the entity version

**Yes — definitively, and by exactly 1, on the owning entity.**
`framework/spec/evolution.md` is unambiguous: *any* content change to an entity,
"its `index.md` frontmatter or prose, or any sibling artifact", MUST bump
`version` in the same commit, and the only exemption is a commit touching
`status:` alone. A header added to `transport.yaml` is a change to a sibling
artifact. It bumps.

Three consequences of that ruling, all of which follow rather than being chosen:

- The bump is **per entity, not per file**. A protocol gaining a header in
  `transport.yaml`, `states.json` and two workflow files in one commit bumps
  once. The full roll-out is 70 files and **33** version bumps.
- The change is **legal at N+1** for every kind in the table. It adds a key and
  removes nothing; no operation, message, state, step or schema property moves,
  so the additive-only principle is satisfied on the contract surface, and the
  discriminator is metadata besides — which evolution.md already says bumps
  without being bound by the superset rule.
- It is **enforced, not requested**. `E_VER_UNBUMPED` and
  `metaframework check --since` reject a commit that edits an artifact without
  moving the number, so a quiet header-only sweep is not available. That is the
  right outcome: the constancy theorem says artifact bytes are constant within a
  version, and a `transport.yaml` whose header changed under a fixed `@N` would
  falsify it.

### Deferred, by name

- **Validating an artifact against the meta-schema it names.** The discriminator
  identifies the grammar; the portal's hand-written parsers remain the authority
  in 0.2.0. Running both requires them to agree exactly, which is a project with
  its own diagnostics, not a side effect of a header.
- **Promoting `W_ARTIFACT_DIALECT` to an error.** Available once every file
  carries a header; `E_DM_DIALECT` is the shape it would take.
- **A discriminator on `index.md`.** Not an artifact, already discriminated by
  `kind:`.
- **Dialect negotiation on retrieval** — `/artifacts` serving one document
  translated into another dialect. It needs a translator per pair and a consumer
  asking for one; neither exists.

## Consequences

- **The 0.2.0 payload lanes become independent of each other.** Each lane ships
  a dialect, a meta-schema entity and a discriminator value; none of them has to
  coordinate with any other, and none can break a catalog that has not migrated.
  That is what makes the release train's step 3 the critical path and every
  format lane a non-gate.
- **`/schemas` becomes load-bearing for artifacts, not only for datamodels.**
  Six meta-schema entities are now named from inside files across three
  catalogs. Deleting or renaming one breaks every artifact that points at it, so
  those entities are a published contract now, not internal documentation — and
  renaming an entity is already a swap, which is exactly the discipline this
  needs.
- **One key, two referents.** `$schema` means JSON Schema's own dialect in
  `schema.json` and the framework's meta-schema in six other roles. Anybody
  writing a generic "read the `$schema`" helper will get one of the two wrong.
  The table above is the only thing that disambiguates them, and it
  disambiguates by role, which is why the strip rule is stated per row rather
  than as a blanket.
- **70 files and 33 version bumps of pure metadata churn.** Every one of those
  bumps is indistinguishable in the version history from a real content change:
  the clock records that something moved, and only the diff says it was a
  header. The alternative — an unbumped sweep — is worse and is rejected above.
- **Editor support is earned, not delivered — and this record creates the
  obligation.** Every value in the table is a framework meta-schema on a host
  the project owns, so publishing those documents at their `$id` is the step
  that turns the header into completion and inline validation in a stock editor.
  Until that step is taken, nothing in this repository serves the canonical host
  and the header is inert in an editor; the benefit is contingent, not present.
  It also does not generalise: a private catalog's own datamodels keep canonical
  `$id` values on the same host by design and are served only by that catalog's
  portal, so a consumer that wants to fetch one still needs its line of resolver
  config. Unreachable degrades to no completion, never to an error, so nothing
  in the decision depends on any of it.
- **The discriminator names a dialect, not a revision of one.** Two
  `config.yaml` files in the same dialect, one using a feature the other
  predates, carry the identical header. That is deliberate — the entity
  `version` is the only clock — but it means a reader cannot tell from the
  header alone which additive revision of a dialect it is holding, and a lane
  that needs to must express it in the payload, not in the discriminator.
- **The legacy dialect is permanent unless someone ends it.** A warning has no
  forcing function; a catalog can sit at `W_ARTIFACT_DIALECT` forever and stay
  correct. That is the price of "never broken", paid knowingly.
- **`Artifact` grows a field and the loader grows a responsibility.** The read
  path now interprets before it validates, which is a new thing for it to be
  wrong about. It is one function over a top-level key, called from one loop in
  `readEntity`, and confining the *stripping* there is what keeps every
  downstream validator strict on every key but the one they now name.

## Alternatives considered

- **A sidecar dialect file** — `transport.yaml` beside a `transport.dialect`, or
  one `dialects.yaml` per entity. Rejected on three counts. It is not
  addressable: the role table has no row for it and free-named files are
  deliberately unreachable by SRN (`framework/spec/structure.md`), so the file
  describing the dialect would be the one file with no address. It can drift
  from the artifact it describes with nothing to catch the drift. And it travels
  badly — an artifact fetched from `/artifacts`, pasted into an editor or
  vendored into a consumer arrives without its sidecar, which is exactly the
  moment its dialect needs to be known. A self-describing document is the whole
  point.
- **A frontmatter field naming each artifact's dialect** — `dialects:` in
  `index.md`. Rejected. `frontmatter.md` is a closed field set binding on all
  eleven kinds and this field means nothing on seven of them. It moves the
  discriminator outside the file it describes, which is the property
  `schema.json` was given `x-srn` to avoid (amendment 2026-08-19-d): a document
  that leaves the catalog must still say what it is. And it puts a per-artifact
  fact on the entity document — the same shape
  [0014](srn://metaframework/adr/0014-artifact-addresses) rejected when it
  refused artifacts a clock of their own.
- **Filename-encoded dialect** — `transport.asyncapi.yaml`. Rejected by the role
  table's own rules, not by taste. "The role erases the extension, so the
  extension is fixed": role → file and file → role must both be functions of the
  spec constant alone. A dialect in the name either forks the role
  (`transport` and `transport.asyncapi` become two roles for one contract, so
  every referrer must know the dialect before it can write an address) or makes
  file → role need a directory listing to discover which spelling exists. It
  also moves the address on every migration, which is the exact cost
  [0014](srn://metaframework/adr/0014-artifact-addresses) bought us out of when
  it made `.transport` name a role rather than a format.
- **Shape-sniffing** — infer the dialect from which keys are present. Rejected
  as the failure this record exists to prevent. A sniffer is a second, unwritten
  grammar that must be kept in sync with every real one by hand; two dialects
  sharing a prefix of keys are indistinguishable until the day they are not; and
  its diagnostic is unactionable — "this does not look like anything I know"
  names no fix. It is the cheapest option today and it makes the first genuinely
  ambiguous document a breaking change to the reader instead of an error in the
  file.
- **`version:` or `dialect-version:` in the artifact.** Rejected outright:
  `framework/spec/evolution.md` forbids a top-level `version:` key in an
  artifact, the frontmatter being the only place a version lives. Beyond the
  prohibition it is the wrong concept — a dialect is the grammar, not a revision
  of the document — and an artifact-local version number re-opens the second
  clock [0014](srn://metaframework/adr/0014-artifact-addresses) closed.
- **A private token key** — `dialect: transport/2`. Rejected: it invents a
  registry with no resolver and no fetch semantics, so a reader that does not
  already know the framework learns nothing from it. `$schema` plus an HTTP URL
  dereferences, matches what `schema.json` already does, and is what editors
  follow; a token costs that and buys brevity.
- **Stately's `https://stately.ai/schemas/xstate.json` as the authority for
  `states.json`.** Rejected on verified facts. It validates only the
  **normalized** surface — array targets, object guards, `{type}` actions — so
  all 8 catalog files fail it as authored; its `additionalProperties: false`
  forbids the `$schema` key that would point at it, and a schema a document
  cannot name is disqualified as a discriminator by construction; and it is
  unversioned, one commit old, carried by an 0.x package. It remains valuable in
  the role it is good at — a downstream conformance target, which all 8 files
  pass after a ~20-line normalizer — and that is where the states lane keeps it.
