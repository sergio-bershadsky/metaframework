# Evolution — additive-only change, the swap, git-backed history

> Distilled from `framework/spec/evolution.md` (version 10), with the
> schema-specific rules in `framework/spec/kinds/datamodel.md`. **When
> `framework/spec/` is present in the repository, it is authoritative and wins
> over this file.** This bundled copy exists because an installed plugin cannot
> see the repo spec.
>
> The `schema.json` snippets here follow the current convention: a required root
> `$id` and every cross-entity `$ref` written as the target's **canonical schema
> URL** (`https://schemas.metaframework.dev/{srn-path}`, a stable constant host —
> never `SCHEMA_BASE_URL`, which only says where the portal *serves* schemas), and
> a required `x-srn` carrying the entity's unversioned SRN. The retired form — no
> `$id`, relative file-path `$ref`s — is never authored. See `schemas.md` in this
> directory for the full conventions.

Two mechanisms carry all change: the **integer `version` field** (additive,
in-place extension of one entity) and the **swap** (a successor entity replaces
one that could not be extended). Nothing is ever deleted.

## The version field

- A plain integer, starting at `1`, incremented **by exactly 1** — monotonic, no
  gaps, no semver, no strings. Decreasing it or jumping is `E_VER_REGRESSION`;
  changing content without bumping is `E_VER_UNBUMPED`.
- Any content change to the entity — `index.md` frontmatter or prose, or **any
  sibling artifact** — MUST bump `version` in the same commit.
- Exception: a change to `status` **alone** (`review` → `approved`) does not
  bump. Status is workflow state, not content.
- **The frontmatter is the only place a version lives.** Sibling artifacts carry
  no version of their own; a top-level `version:` key in `transport.yaml`,
  `topology.yaml`, `config.yaml` or a workflow file is a shape violation. In
  `schema.json` neither identity keyword carries one either: `$id` is the
  canonical URL of the *current* schema and `x-srn` is the **unversioned** SRN,
  and a `$ref` with an `@N` is `E_DM_REF_TARGET`. Pins live in `relations.uses`,
  where git-backed history can resolve them.
- An artifact *does* carry one other framework-owned key at its top level, and
  it is not a version. `$schema:` names the **dialect** — the grammar the file
  is written in — and holds a meta-schema entity's canonical URL, which carries
  no `@N` for the same reason no schema URL does (`structure.md` in this
  directory; "Artifact dialects" below):

  ```yaml
  # solutions/acme/product/shop/protocol/order-placement/transport.yaml
  $schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
                          # correct — names the dialect, not a revision of it
  version: 2              # shape violation — the frontmatter is the only clock
  ```
- The same rule makes **artifact SRNs** well-defined:
  `…/order-placement.transport@2` (`srn.md`) means "the `transport.yaml` of
  snapshot `order-placement@2`" — `@2` is a coordinate of the **parent
  entity**, resolved through the ordinary version→commit index. It can mean
  nothing else, because the status-only exemption is the only in-version
  mutation and it cannot touch a sibling file: artifact bytes are constant
  within one version number, a constancy `E_VER_UNBUMPED` and
  `metaframework check --since` enforce.
- A child entity's version is independent of its container's (rule C3): adding
  or bumping `component/wishlist` does not bump `product/shop`.

## The additive-only principle

> Never reduce — only extend, or create new and swap later.

It binds the entity's **contract surface**: everything a referrer can depend on.
Prose clarifications, tags and relation edges are metadata — they still bump
`version`, but they are not bound by the superset rule.

| Entity kind         | Legal at N+1                                                                 | ILLEGAL at N+1                                                                         |
|---------------------|------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| datamodel           | add optional property; add enum value; widen a type; relax a bound           | rename/remove a property; add to `required`; narrow a type; remove an enum value       |
| protocol            | add an operation; add an optional message field; add a workflow; add a state | remove/rename an operation; remove a state; repoint a message at an incompatible model |
| requirement / adr   | clarify wording; append consequences; add relations                          | reverse or narrow the decision/requirement — that is a swap                            |
| actor / environment | extend description; add relations                                            | repurpose the name to mean something else                                              |
| container           | add child entities; extend prose                                             | remove or rename children (children swap individually)                                 |

For a datamodel the test is mechanical: **version N+1 MUST accept every instance
version N accepted.** Loosening is legal in place; tightening or reshaping is
not legal *at any version number*. Consumers must therefore tolerate unknown
properties and unknown enum values from later versions. The per-keyword table is
in `schemas.md`.

An illegal change MUST NOT be made in place. The escape hatch is the swap.

## The swap procedure

1. **Create the successor** — a new entity with its own name, `version: 1`,
   `status: draft`. Give it a real name for what it now is; a `-v2` suffix is a
   last resort. Put the edge on the **successor**:

   ```yaml
   # solutions/acme/…/datamodel/payment-intent/index.md
   relations:
     supersedes:
       - ../charge          # sibling in the same bucket: ONE ".." leaves
                            # payment-intent/ and lands in the datamodel/ bucket
   ```

2. **Migrate referrers one at a time.** Each migration is an ordinary additive
   change on the referrer: repoint the ref, bump the referrer's `version`.
   Referrers that cannot move yet keep resolving the old entity — pinned
   (`../charge@3`) or latest — indefinitely. Nothing breaks during the window.
3. **Deprecate the old entity** once the portal's reverse-reference view shows
   no live referrers: set `status: deprecated` on it. New references to it are
   then flagged `W_REF_DEPRECATED`.

   For a **datamodel**, set `"deprecated": true` at the root of its
   `schema.json` in the same commit. `deprecated` is a standard JSON Schema
   2020-12 meta-data annotation, so this is always an additive edit — and it is
   the only half of the signal that survives the schema being copied out of the
   catalog, where no frontmatter follows it:

   ```json
   {
     "$id": "https://schemas.metaframework.dev/acme/product/shop/datamodel/charge",
     "x-srn": "srn://acme/product/shop/datamodel/charge",
     "deprecated": true,
     "description": "Superseded by srn://acme/product/shop/datamodel/payment-intent."
   }
   ```

   `status: deprecated` **alone** would not bump `version`; touching
   `schema.json` in the same commit does. Bump once, for both.
4. **Never delete.** Deprecated entities stay on the filesystem permanently. The
   portal renders them greyed with a pointer to the successor; the inverse
   `superseded-by` edge is derived, never authored.

## Entities are never moved or renamed

**The SRN is the identity, and the disk path is that identity's storage**
(`srn.md`) — so moving the directory changes the identity. A move is therefore a
delete plus an unrelated create, and the
version→commit index does not follow it — the history is lost. Renaming is a
**swap** like any other breaking change: new entity, `supersedes` edge, migrate
referrers, deprecate the old one.

This is the rule most often violated by instinct ("just `git mv` it"). Treat any
proposed rename or relocation as a swap, and say so before touching the tree.

## Git-backed history

- **Only current versions exist on the filesystem.** `grep` and the tree always
  show latest; every historical read goes through git. No `order-v1/`,
  `order-v2/` litter, no ambiguity about which copy is live.
- `.git` MUST be present where the portal runs, with **unshallow** history. A
  shallow clone degrades gracefully: missing commits resolve to `E_SRN_VERSION`
  with a "shallow history" hint.
- **The version→commit index**: for each entity the portal walks the history of
  its `index.md` and records, per version number, the **last** commit carrying
  that number (last, so status-only follow-ups are included).
- Resolving `@N`: if `N` is current, read the filesystem; otherwise read every
  file of the entity directory at `index[N]`. **An entity version is a snapshot
  of the whole directory at one commit** — siblings are read at the same commit
  as the `index.md`.
- What the portal needs from git, exhaustively: `log` with a path filter, and
  `show` of blobs at a commit. No branches, no tags, no notes.

Worked example — `order` at version 3:

```text
commit c1  version: 1  (created, status: draft)
commit c2  version: 1  (status: approved — no bump)
commit c3  version: 2  (added optional "discount")
commit c4  version: 3  (added enum value "refunded")
```

Index `{1: c2, 2: c3, 3: c4}`. A referrer pinned to `…/datamodel/order@1` gets
the `c2` snapshot, approved status included. `order@5` → `E_SRN_VERSION`.

## Artifact dialects

Every addressable sibling artifact declares, in its own bytes, the grammar it is
written in — a top-level `$schema:` holding a framework meta-schema URL, or the
format's own native key where it has one (`openapi:`, `arazzo:`, `asyncapi:` on
a `transport.yaml` written in the AsyncAPI dialect that role admits beside the
mini-spec, and a `schema.json`'s own 2020-12 `$schema`). Which key belongs to
which role, which role has **two** and how a `transport.yaml` chooses, the exact
URL per role, the one role that declares none (`examples/<name>.json`), the two
message forms of `W_ARTIFACT_DIALECT`, and the loader that records the dialect
and removes the framework-owned key before any validator sees the document are
all in `structure.md` in this directory. What belongs here is what a dialect does
to the version number, and to the history that number indexes.

**A dialect is not a version.** `$schema:` names the grammar, never a revision of
the document: it holds the canonical URL of a meta-schema *entity*, whose own
version sits in its own frontmatter like every other entity's. Two
`transport.yaml` files in one dialect differ in version constantly, and one file
can move three versions without its dialect changing once.

**Adding a discriminator bumps the owning entity's `version` by exactly 1.** It
is a content change to a sibling artifact, so the opening rule applies
unamended — and the bump is per **entity**, not per file, because a version is a
snapshot of the whole directory:

```text
one commit — order-placement gains a $schema header in transport.yaml,
states.json, workflows/place-order.yaml and workflows/cancel-order.yaml
  → version: 2 → 3       four files, one bump
```

The change is legal at `N+1` for every kind in the additive-only table above: it
adds a key and removes nothing, so no operation, message, state or step moves —
and a discriminator is metadata besides, bound to bump but not bound by the
superset rule.

**A new dialect lands beside the old, never instead of it.** A dialect changes in
the same two ways anything else here does. An **additive** change — `config.yaml`
admitting native-typed scalars, say — is a superset extension of the meta-schema
entity: same entity, same canonical URL, the same string in every file that
already carries it, and that entity bumps its own `version` like any datamodel. A
**non-additive** change is a **swap**: a new meta-schema entity with its own name,
its own URL and a `supersedes` edge. After a swap both URLs are recognised — that
is what "beside" means concretely — and files migrate one at a time, each bumping
its own entity, exactly as referrers migrate one at a time after any other swap.

A **second dialect from a foreign standard** is a third shape, and the
`transport` role is the one that has it: AsyncAPI 3.x is recognised under the
same filename beside the mini-spec, with no `supersedes` edge either way, because
neither replaces the other. Which of the two a file may use is its *wire's*
ruling — `kafka`, `websocket` and `amqp` may use either; `http`, `grpc` and
`in-process` have the mini-spec only (`protocols.md`) — so no mini-spec file is
owed a migration and none is stale for being one.

**The old dialect is warned, never broken.** An artifact with no recognisable
discriminator is read as the **legacy dialect** — the format the kind document
defines today — and raises `W_ARTIFACT_DIALECT` on the entity that owns the file.
The decisive reason is this document's own subject: **history is immutable**.
Every snapshot committed before a dialect existed was committed without its
header, `X.transport@1` reads those bytes back through `git show`, and nothing an
author can edit reaches them. The only way to make the past comply is to rewrite
it, which moves every commit and voids the version→commit index — refused for
exactly the reason a directory may not be moved. A rule the past cannot satisfy
has to be one the past can carry, and that is a warning. (The lesser reason: an
error would fail every file in the corpus on the day the check ships, turning a
sweep into a flag day.) Promotion stays available once every file carries a
header — `E_DM_DIALECT`, already an error on a `schema.json` that declares no
dialect, is the shape it would take.

**A migration is judged on the contract surface, not on the bytes.** A file
rewritten out of one dialect of its role into another changes almost every line,
and the additive-only principle does not count lines — it asks what a referrer
could depend on, which for a protocol is the operations, messages and states.
`solutions/acme/protocol/settlement/transport.yaml` is the real case — three
Kafka topics in the mini-spec at v3, cut to the keys that make the point:

```yaml
# solutions/acme/protocol/settlement/transport.yaml at v3 — the mini-spec dialect
kind: kafka
encoding: avro
kafka:
  cluster: acme-settlement
  topics:
    - name: acme.settlement.order-paid.v1
      message: /product/shop/component/checkout/component/payment/datamodel/order@3
    - name: acme.settlement.ledger-entry-posted.v1
      message: /product/billing/datamodel/ledger-entry@1
    - name: acme.settlement.reconciliation-report.v1
```

A v4 carrying those same three topics, with the same names and payload
references, under the other dialect's keys is legal however little of the old
text survives: the wire contract is unchanged and only the grammar moved — and
that is what v4 on disk is. A v4 carrying two of the three is not a dialect
migration at all — it is the removal of a topic, ILLEGAL at any version number,
and it takes the swap like every other reduction. The discriminator makes the
question decidable; it never answers it. Note which file this had to be: `kafka`
admits the other dialect, and an `http`, `grpc` or `in-process` transport has
nothing to migrate *into* (`protocols.md`).

**Only the repair trips `E_VER_UNBUMPED`.** The two checks ask different
questions: `W_ARTIFACT_DIALECT` asks whether a file says which grammar it is in,
`E_VER_UNBUMPED` asks whether the number moved when the bytes did. A catalog that
never adds a header is warned indefinitely and never trips the audit — nothing
changed, so nothing was owed. It is the **fix** that is a content change, so a
commit writing headers into an entity's artifacts while leaving `version` where
it was is `E_VER_UNBUMPED`, and `metaframework check --since <ref>` fails the
branch at the gate. A quiet header-only sweep is therefore not available, and
that is the right outcome: artifact bytes are constant within a version number,
and a `transport.yaml` whose header appeared under a fixed `@N` would falsify it.
The usual difference between the two shapes still holds — the gate judges the net
change per entity, so a sweep may add headers in one commit and the bump in the
next; the audit, walking every commit of one entity, reports the intermediate
state. Both are behaving correctly.

## Status lifecycle

| Status       | Meaning                                                                                                                        |
|--------------|--------------------------------------------------------------------------------------------------------------------------------|
| `draft`      | Being written; referenceable but unstable; portal marks it.                                                                    |
| `review`     | Content-complete; under git-native review (PRs on the files).                                                                  |
| `approved`   | The reviewed, binding state.                                                                                                   |
| `deprecated` | Superseded or retired; kept forever; new refs are flagged. On a datamodel, mirror it as `"deprecated": true` in `schema.json`. |

```text
draft → review          # author submits
review → draft          # review bounces it back
review → approved       # review passes
approved → deprecated   # swap completed, or retired without a successor
```

- `deprecated` is **terminal**. There is no un-deprecate; reviving a concept
  means a new entity that `supersedes` the deprecated one.
- A version bump on an `approved` entity SHOULD reset `status` to `review` (or
  `draft`) per the owning team's process. The additive rule already guarantees
  the previously approved contract still holds.
- Status is per entity, at its current version; historical snapshots carry
  whatever status they had at their commit.

## Error classes

| Code                 | Meaning                                                                                                         |
|----------------------|-----------------------------------------------------------------------------------------------------------------|
| `E_VER_REGRESSION`   | `version` decreased, or increased by more than 1, in a commit.                                                  |
| `E_VER_UNBUMPED`     | An entity's own files changed between two commits while `version` stayed the same.                              |
| `E_SRN_VERSION`      | Pinned `@N` not on the filesystem nor in the version→commit index.                                              |
| `W_REF_DEPRECATED`   | Reference targets a `status: deprecated` entity.                                                                |
| `W_REF_STALE_PIN`    | Pinned `@N` resolves, but the target has moved past it.                                                         |
| `W_ARTIFACT_DIALECT` | A sibling artifact declares no dialect, or one unknown for its role — read as the legacy dialect, never broken. |

`E_VER_UNBUMPED` compares **two commits, never the working tree** — editing a
file before committing it is authoring, not a violation — a `status:`-only edit
is exempt, and it is scoped to the entity's **own** files: a child sits in a kind
bucket, carries its own `version`, and answers the question for itself.

`W_ARTIFACT_DIALECT` is the one code here that is not about a version at all. The
loader raises it per artifact file, on the entity that owns the file; it is
listed among these because the migration it nudges is this document's subject
("Artifact dialects", above), and its per-role vocabulary and two message forms
are in `structure.md` in this directory.

Datamodel-specific: `E_DM_NOT_ADDITIVE` (`schemas.md`).
Retired, MUST NOT be emitted: `E_VER_ID_MISMATCH`.

Both `E_VER_*` codes need git, so they surface where history is available: on
the entity page, where the version check streams in beside the version picker,
and — as a gate — via `metaframework check --since <ref>`, which exits non-zero
when an entity's files changed since `<ref>` without a bump. In CI, `<ref>` is
the branch base. The gate judges the net change only: a branch that breaks the
rule in one commit and repairs it in the next passes, deliberately. A plain
`metaframework check` runs neither.
