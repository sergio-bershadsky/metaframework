---
name: 0014-artifact-addresses
kind: adr
version: 1
title: Artifacts get addresses, and no clock of their own
summary: A dot suffix on the final segment addresses an entity's sibling artifact via a closed per-kind role table; @N stays a coordinate of the parent snapshot, and every entity surface rejects the new form.
status: review
owner: sergio-bershadsky
decision-status: proposed
date: "2026-08-21"
relations:
  uses:
    - /product/portal/component/srn
    - /product/specification/component/kind-contracts
tags:
  - identity
  - grammar
  - artifacts
---

## Context

The catalog holds 142 artifacts today, across the four kinds whose contracts
define any. Each one is a contract in its own right — a wire binding, a state
machine, a validatable schema, a deployment topology — and none of them has a
name. The SRN addresses the entity; the artifact is reachable only as "the
`transport.yaml` inside it", which is a disk path in prose, and a disk path in
prose is exactly the second addressing scheme the framework exists to not have
(`framework/spec/srn.md`).

The gap is felt on three surfaces. Prose wants to link a workflow, not the
protocol that happens to contain it. The portal wants to serve artifact bytes
at an address that says what they are. And the catalog's stated ambition — an
intermediate representation that tools consume, not a wiki that people read —
falls precisely on the artifacts, because they are the machine-readable
fraction of every entity
([stock-tooling-schema-consumption](srn://metaframework/requirement/stock-tooling-schema-consumption),
[human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable)).

What made the question decidable now rather than at the founding is enforcement
that did not exist then. `@N` has always named a snapshot of the whole entity
directory (`framework/spec/evolution.md`), so "the transport of X at version N"
was well-defined in principle — but only convention kept an artifact's bytes
still while `version` stood still, and the first `E_VER_UNBUMPED` audit found
346 violations, 64 of them in artifacts rather than in `index.md`. With the
audit and the `metaframework check --since` gate both shipped, artifact bytes
are a function of `(entity, version)` — which is the property an address needs
before it is worth minting.

This record sits in the solution bucket beside
[0004](srn://metaframework/adr/0004-srn-as-the-json-schema-reference-syntax) and
[0008](srn://metaframework/adr/0008-fully-bucketed-srn-paths) because it changes
the identity grammar itself, which binds every product at once — constitutional,
not component work.

## Decision

An artifact of an entity is addressed by a **dot suffix on the final segment**:

```text
srn://{solution}( /{kind}/{name} )* [ "." artifact ] [ "@" version ]

artifact = segment *( "." segment )     ; the segment alphabet of srn.md, unchanged
```

```text
srn://metaframework/product/devops/protocol/worktree-lease.transport@1
                                              # the wire binding of snapshot @1
srn://acme/protocol/settlement.workflows.settle-order
srn://acme/datamodel/money.examples.forty-nine-ninety
srn://acme/environment/production.topology
```

Lexing order is fixed: strip `@version` from the end first, then split the
final path segment at its **first** dot. The artifact suffix therefore precedes
the pin — `worktree-lease.transport@1`, never `worktree-lease@1.transport`. The
latter is `E_SRN_SYNTAX`, and the message says why rather than reporting a bad
version literal: "artifact suffix precedes @version".

**The dot leaves the name alphabet permanently.** The split is unambiguous
today only because `SEGMENT` admits no dot; this decision promotes that
accident to a normative, one-way reservation — exactly like a reserved kind
word. A dot may appear in an SRN only as the artifact separator, never inside a
solution, name, or artifact segment, in this revision and in every future one.

### The role table

Which suffixes exist is a **closed, per-kind table with fixed filenames** — a
spec constant like the reserved-kind list, stated in the kind contracts and
never read from a catalog:

| Kind          | Role               | File                    |
| ------------- | ------------------ | ----------------------- |
| `datamodel`   | `schema`           | `schema.json`           |
| `datamodel`   | `examples.<name>`  | `examples/<name>.json`  |
| `protocol`    | `transport`        | `transport.yaml`        |
| `protocol`    | `states`           | `states.json`           |
| `protocol`    | `openapi`          | `openapi.yaml`          |
| `protocol`    | `workflows.<name>` | `workflows/<name>.yaml` |
| `journey`     | `journey`          | `journey.yaml`          |
| `environment` | `topology`         | `topology.yaml`         |
| `environment` | `config`           | `config.yaml`           |

Every other kind — solutions and containers included — has **no roles at all**.
Fixed roles are depth 1; only the `workflows.*` and `examples.*` families reach
depth 2. Everything outside the table is the new class `E_SRN_ARTIFACT`:

```text
srn://acme/protocol/settlement.transport         # legal — a role of the kind
srn://acme/protocol/settlement.workflows.settle-order   # legal — depth-2 family member
srn://acme/protocol/settlement.topology          # E_SRN_ARTIFACT — not a protocol role
srn://acme/actor/customer.schema                 # E_SRN_ARTIFACT — actors have no roles
srn://acme/product/shop.transport                # E_SRN_ARTIFACT — neither do products
srn://acme.topology                              # E_SRN_ARTIFACT — nor solutions
srn://acme/protocol/settlement.workflows         # E_SRN_ARTIFACT — a family is not a member
srn://acme/protocol/settlement.transport.http    # E_SRN_ARTIFACT — fixed roles are depth 1
```

`E_SRN_ARTIFACT` is statically checkable: the whole vocabulary is in the spec,
so a violation — an unknown role for the addressed kind, a wrong depth, any
artifact on a kind with no roles, a malformed suffix shape that survives the
lexer — is caught while the reference is being read, like `E_SRN_PLACEMENT`. A **legal** role whose file is absent is a different
situation and a different class — `E_SRN_DANGLING`, like an entity directory
without `index.md`. `transport.yaml` and `states.json` are OPTIONAL on a
protocol, so `srn://acme/product/fulfilment/protocol/tracking-events.states`
parses and dangles: the role exists, the file does not. `E_SRN_VERSION` and
every other existing class are unchanged.

The table is what keeps the consolidating principle intact where it matters:
SRN→path conversion needs the spec, never a catalog read. And it bends the
principle where it must, stated honestly: `X.transport` maps to
`transport.yaml` **through the role table**, not by string surgery on a prefix.
That is the same shape of bend the reserved-kind table already is — a fixed
vocabulary the spec carries so the path stays mechanical.

**openapi is promoted to a bare fixed role.** `openapi.yaml` becomes a
recognised fixed-name protocol artifact — a bytes-only contract, unparsed in v1
— so that it is addressable. The free-named `spec.file` attachment in
`transport.yaml` remains for other formats and remains non-addressable: a free
filename cannot enter a fixed-extension table. Both `openapi.yaml` files in the
catalog already sit at the fixed name and comply as they are.

### No clock of its own

An artifact has **no version**. `X.transport@N` reads as "the transport
artifact of snapshot `X@N`" — the `@N` is a coordinate of the **parent** — and
resolution is the existing machinery verbatim
([0009-git-backed-history](srn://metaframework/adr/0009-git-backed-history)):
the version→commit index finds the commit, then
`git show {commit}:{dir}/transport.yaml` produces the bytes.

That is well-defined because of the constancy theorem the status-only exemption
yields: within one version number, the only permitted mutation is `status:` in
`index.md`, which cannot touch an artifact file — therefore artifact bytes are
constant within a version, and `X.role@N` names exactly one byte sequence. The
theorem was a convention until `E_VER_UNBUMPED` (the audit) and
`metaframework check --since` (the gate) shipped; it is now an enforced
invariant, and this decision rests on the enforcement, not on good intentions.
The corollary — the same bytes answering at two coordinates when a bump was for
a prose edit — is the same unremarkable situation as identical file content at
two git commits.

### The fence: entity surfaces refuse artifact SRNs

An artifact SRN is illegal on every surface whose meaning is *entities*:
frontmatter `relations` (every edge), `primary-actors`, protocol
`participants.ref`, `payload` / `request` / `response` message refs,
`topology.yaml` component refs, `config.yaml` `for` refs, and `journey.yaml`
`actor` / `touches` / step `protocol`. Edges
are typed over kinds and an artifact has no kind — there is no row for it in
any target table. The violation raises the surface's own existing class —
`E_FM_EDGE_TARGET` for relations, `E_PROTO_PARTICIPANT_KIND` for participants,
and so on — with a message that names the artifact suffix as the problem
rather than reporting a generic bad target.

Legal in v1: prose markdown links in `index.md`, and external consumers holding
an SRN. Every further surface is a later, explicit decision — growing the fence
is additive; eroding it is not.

### `.schema` normalizes to the entity

`X.schema` is legal — the table would otherwise have a hole at the framework's
most numerous artifact — but it **normalizes to the entity and never mints a
URL**. The schema document already has two names: its canonical `$id` URL and
the entity's SRN
([0007-canonical-schema-host-and-x-srn-restored](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)).
`.schema`'s URL projection **is** the entity's canonical URL: no
`…/order.schema` URL ever exists, the `$id` / `$ref` / `x-srn` rules are
untouched, and `schemaUrlToSrn` (`framework/portal/src/lib/schema/url.ts`)
stays dot-rejecting. This guards the exact defect 0007 killed — two names for
one schema reaching registries.

### Retrieval

Identity is the SRN; retrieval is the portal route `/artifacts/…`. The
implementation lands in the next workflow; the contract is fixed here. The
route serves honest media types (`application/yaml`, `application/json`); a
`.schema` request **permanently redirects** to the existing `/schemas` route,
so exactly one URL serves each schema document; and no canonical-host URL is
minted for any non-schema artifact — `https://schemas.metaframework.dev`
remains a schema namespace and nothing else.

### resolveRef

An artifact suffix is legal only on the absolute (`srn://…`) and
solution-absolute (`/product/…`) forms in v1. A relative reference carrying one
is `E_SRN_SYNTAX`: the dot split stays out of the `..` arithmetic, which is the
part of the grammar authors demonstrably miscount
([0008](srn://metaframework/adr/0008-fully-bucketed-srn-paths)).

### Deferred, by name

- **`?at=N` on the retrieval route.** The identity form `X.role@N` resolves
  today through git; a query parameter on the HTTP route is a serving feature,
  added when a consumer needs historical bytes over HTTP rather than through
  the portal.
- **Content-aware stale-pin warnings for artifact pins.** Moot in v1: artifact
  SRNs cannot appear in frontmatter, so the loader never sees one to warn
  about. It becomes a real question on the day the fence admits a structured
  surface.
- **Generalising `spec.file` externals** into addressable artifacts — it
  requires either free names in the role table, which would break the fixed
  vocabulary, or a naming discipline nobody has needed yet.

## Consequences

- **SRN ≡ path bends, through a table, and says so.** `X.transport` →
  `transport.yaml` is the first mapping in the grammar that is a lookup rather
  than prefix surgery. The bend is contained by making the table a spec
  constant: conversion still needs the spec and never a catalog read, which is
  the property the consolidating principle actually protects. The principle
  survives with a footnote, not intact.
- **The dot is out of the name alphabet forever.** A one-way door, closed
  deliberately: no future segment grammar may admit a dot without breaking
  every artifact address ever written. Nothing existing is invalidated —
  `SEGMENT` never admitted a dot, so there is no entity to rename and no
  migration; the cost is the promise, not the move.
- **The schema document now has two spellings, held together by one rule.**
  `srn://acme/datamodel/money` and `srn://acme/datamodel/money.schema` name one
  document, and only the normalization rule — `.schema` projects to the
  entity's URL and mints nothing — keeps that from being the
  two-names-in-registries defect
  [0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)
  existed to kill. The rule is load-bearing; removing it is the regression to
  watch for.
- **The fence must not erode.** Every surface that accepts an SRN now carries
  an artifact-or-entity decision, and the safe default is refusal: a surface
  admits artifact SRNs by declaring so, never by omission. The day an edge
  quietly accepts `X.transport`, edges stop being typed over kinds.
- **`@N` on an artifact is exactly as trustworthy as the enforcement.** The
  constancy theorem holds because `E_VER_UNBUMPED` and the `--since` gate hold;
  a catalog that runs neither is back to convention, and `X.role@N` degrades
  from a name for bytes into a name for hope.
- **A sentence-final artifact SRN ends ambiguously.** SRNs were
  punctuation-free, so an autolinker could take every trailing character; with
  a dot in the grammar, `…worktree-lease.transport.` has two readings.
  Autolinkers strip trailing punctuation and retry — an empty artifact name
  never parses, so the retry terminates — and prose style keeps an SRN off the
  sentence end where it can.
- **Decided against a measured census, and additive against all of it.** 142
  artifacts across four kinds, counted 2026-08-21: 66 `schema.json`, 24
  `workflows/*.yaml`, 16 `transport.yaml`, 9 `journey.yaml`, 8 `states.json`,
  7 `topology.yaml`, 6 `config.yaml`, 4 `examples/*.json`, 2 `openapi.yaml`.
  Every existing SRN parses unchanged — no dot, no artifact — no file moves,
  and both `openapi.yaml` files already sit at the promoted fixed name. The
  change mints addresses; it migrates nothing.
- **Grep keeps its reach.** `grep -r 'srn://.*\.transport'` finds every
  reference to a wire binding in one pass — the property
  [human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable)
  claims for entities, extended to the machine-readable fraction of the
  catalog that the intermediate-representation ambition is actually about.

## Alternatives considered

- **`/` as the separator** (`…/worktree-lease/transport`). Rejected: it
  destroys the odd-segment-count parse guarantee. A bucketed path is even below
  the solution, so every miscounted `..` chain fails loudly as a half pair
  ([0008](srn://metaframework/adr/0008-fully-bucketed-srn-paths)); a
  path-shaped artifact segment makes odd tails legal and converts that whole
  error class into silent misreads.
- **`#` fragment** (`…/worktree-lease#transport`). Rejected: RFC 3986's
  fragment is the intra-document axis, and it is needed later for exactly that
  — a JSON Pointer into an artifact (`X.states#/states/settled`). Spending it
  on artifact selection leaves nothing to point into the artifact with.
- **`::` or a query string.** Rejected: `::` buys no tooling — no stock URL
  parser treats it — and a query string is stripped by intermediaries and is
  already `E_SRN_SYNTAX` today; readmitting `?` for one feature reopens every
  parser for no payoff.
- **Independent artifact versions** (`X.transport@N` with its own clock).
  Rejected wholesale: it needs a version field inside each artifact, which
  `framework/spec/evolution.md` forbids as a shape violation on the artifact
  formats; N per-artifact bump disciplines instead of one; and a second
  version→commit index keyed by file. It dismantles the snapshot model — an
  entity version stops being a snapshot of the whole directory — and the
  entire payoff is suppressing a warning-shaped oddity, identical bytes at two
  coordinates, that git itself exhibits at every commit.
- **Content-hash identity** (`X.transport@sha256:…`). Rejected: hashes have no
  ordering, so "newer than" disappears; they are not human-legible, which
  fails
  [human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable);
  and content addressing is what a cache layer does under a name, not what a
  name is.
- **Promoting `workflows/` to a twelfth kind.** Rejected for v1: a workflow
  entity would carry its own version clock, which contradicts the model chosen
  above; protocols would stop being leaves, which placement rule P1 currently
  guarantees; and it mints 24 `index.md` documents nobody asked to write. It
  stays reachable later precisely because this decision is additive — a future
  kind can coexist with `workflows.<name>` addresses, and
  [0003-closed-ontology-of-nine-kinds](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds)
  is untouched today.
