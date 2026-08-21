---
kind: spec
name: evolution
version: 7
status: review
title: Evolution and history
summary: Versioning and history — the integer version field, additive-only rules with legal/illegal examples for every kind, the swap procedure, the git-backed history contract, artifact pins and the constancy theorem, and the status states.
---

# Evolution and history

Two mechanisms carry all change in the catalog: the **integer version field**
(additive, in-place extension of one entity) and the **swap** (a successor
entity replaces one that could not be extended). History is git-backed: the
filesystem holds only current versions; everything older is resolved through
git.

## The version field

- Every entity's frontmatter carries `version`: a plain integer, starting at
  `1`, incremented by exactly 1 — monotonic, no gaps, no semver, no strings.
- Any content change to the entity — its `index.md` frontmatter or prose, or
  any sibling artifact — MUST bump `version` in the same commit.
- Exception: a change to `status` **alone** (e.g. `review` → `approved`) does
  not bump `version`. Status is workflow state, not content.
- **The frontmatter is the only place a version lives.** Sibling artifacts carry
  no version of their own — a `version:` key at the top level of
  `transport.yaml`, `topology.yaml`, or a workflow file is a shape violation for
  that kind. A datamodel's `schema.json` is REQUIRED to carry a root `$id` and an
  `x-srn`, and **neither carries a version** (decision-record amendments
  2026-08-19-c and 2026-08-19-d, [kinds/datamodel.md](kinds/datamodel.md)): the
  `$id` and every cross-entity `$ref` are canonical URLs addressing the *current*
  schema, `x-srn` is the entity's unversioned SRN, and a `@N` in either is
  rejected rather than honoured. An entity version is a snapshot of the whole
  directory at one commit, so there is exactly one number to bump and nothing
  that can drift out of step with it.

  ```json
  /* solutions/acme/datamodel/money/schema.json */
  { "$id": "https://schemas.metaframework.dev/acme/datamodel/money" }
                          /* correct — the entity's schema URL, no version      */
  { "$id": "https://schemas.metaframework.dev/acme/datamodel/money@4" }
                          /* E_DM_ID_MISMATCH — a URL addresses the current
                             schema; the version belongs in index.md            */
  { "$id": "srn://acme/datamodel/money@4" }
                          /* E_DM_ID_MISMATCH — not the entity's schema URL, and
                             nothing dereferences srn://                        */
  { "x-srn": "srn://acme/datamodel/money@4" }
                          /* E_DM_SRN_MISMATCH — x-srn is unversioned, always   */
  ```

  Note the code. A **root** `$id` is required, so its absence is
  `E_DM_ID_MISSING` and a wrong value is `E_DM_ID_MISMATCH`; `x-srn` is required
  too, absence `E_DM_SRN_MISSING` and disagreement `E_DM_SRN_MISMATCH`.
  `E_DM_ID_FORBIDDEN` has a narrower subject: an `$id` nested *below* the root,
  which would re-base every `$ref` beneath it onto a second identity. It never
  applies to the root.

## The additive-only principle

> Never reduce — only extend, or create new and swap later.

The principle binds the entity's **contract surface**: everything a referrer
can depend on. For a datamodel that is the schema; for a protocol the
operations, messages, and states; for a requirement or ADR the substance of the
statement. Prose clarifications, tags, and relation edges are metadata — they
still bump `version`, but they are not bound by the superset rule below.

### Datamodels — the instance-superset rule

Version `N+1` of a schema MUST accept every instance that version `N`
accepted. Loosening is legal; tightening or reshaping is not.

Both listings below are
`solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/schema.json`
at two successive commits. Both carry the same `$id` and the same `x-srn`, and
neither carries a version: identity does not move when content does, and the version number lives
in the sibling `index.md` and nowhere else — which is why the two files below
are labelled "version 1" and "version 2" by their commit rather than by anything
inside them.

Version 1:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/order",
  "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/order",
  "type": "object",
  "required": ["id", "total"],
  "properties": {
    "id":     { "type": "string" },
    "total":  { "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" },
    "status": { "enum": ["placed", "paid"] }
  }
}
```

Legal version 2 (every v1 instance still validates):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/order",
  "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/order",
  "type": "object",
  "required": ["id", "total"],
  "properties": {
    "id":       { "type": "string" },
    "total":    { "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" },
    "status":   { "enum": ["placed", "paid", "refunded"] },
    "discount": { "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" }
  }
}
```

The two documents differ only in the `properties` block, which is the point: a
version bump touches content, never identity. A pin on `money` — "this model was
reviewed against `money@1`" — cannot live in a `$ref`, because a schema URL
addresses the current schema and a `@N` in one is rejected outright; it goes in
the entity's `relations.uses` as `/datamodel/money@1`, where the git-backed
version→commit index can actually resolve it
([kinds/datamodel.md](kinds/datamodel.md)).

| Change                                             | Verdict | Why                                    |
| -------------------------------------------------- | ------- | -------------------------------------- |
| Add optional property `discount`                   | legal   | v1 instances lack it; still valid      |
| Add enum value `"refunded"`                        | legal   | loosens the accepted set               |
| Remove `total` from `required`                     | legal   | loosens (rarely wise, but additive)    |
| Rename `total` → `amount`                          | ILLEGAL | v1 instances with `total` now stray    |
| Make optional `status` required                    | ILLEGAL | tightens: v1 instances may lack it     |
| Change `id` from `string` to `integer`             | ILLEGAL | reshapes: every v1 instance breaks     |
| Remove property `status`                           | ILLEGAL | reduction; referrers may depend on it  |
| Remove enum value `"placed"`                       | ILLEGAL | tightens the accepted set              |

Consequence for consumers: readers MUST tolerate unknown properties and
unknown enum values in instances of a *later* version than they pinned.

### Protocols and other entities

The same shape, stated per artifact:

| Entity kind         | Legal at `N+1` (examples)                                                                  | ILLEGAL at `N+1` (examples)                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| protocol            | add an operation; add an optional message field; add a workflow; add a state + transitions | remove/rename an operation; remove a state; change a message's datamodel ref to an incompatible one      |
| requirement / adr   | clarify wording; append consequences; add relations                                        | reverse or narrow the decision/requirement — that is a new entity (swap)                                 |
| actor / environment | extend description; add relations                                                          | repurpose the name to mean something else                                                                |
| capability          | sharpen the description without narrowing it; add relations                                | narrow or re-scope what the business can do — a different ability is a different entity                  |
| journey             | append a step at the end within the 12-step cap; extend a step's note                      | remove, reorder, or re-point existing steps; introduce a branch (that is a second journey)               |
| metric              | move `target`; extend the description; add relations                                       | change `metric-type`, `direction`, or what `measures` points at — the number stops meaning what it meant |
| container           | add child entities; extend prose                                                           | remove or rename children (children swap individually)                                                   |

### The three newest kinds are governed by exactly these rules

`capability`, `journey` and `metric` were adopted after the ontology was
reopened (decision-record amendment 2026-08-20-a), and adoption bought them no
special treatment: they carry the same integer `version`, bump it on any content
change, extend rather than reduce, and swap when extension is not enough. Two
consequences are worth stating outright, because they are the ones an author
will reach for first.

**A capability rename is a swap, like every other rename.** The SRN is the path,
so `srn://acme/capability/order-fulfilment` cannot become
`srn://acme/capability/fulfilment` in place — the version→commit index does not
follow a move, and every `realizes` edge pointing at the old name would resolve
to nothing. Create the successor, point it at its predecessor with `supersedes`,
migrate the realizers one at a time, then deprecate:

```yaml
# solutions/acme/capability/fulfilment/index.md
kind: capability
version: 1
status: draft
relations:
  supersedes:
    - ../order-fulfilment      # sibling in the same capability/ bucket
```

The same procedure, unchanged, covers a journey that grows a branch (it becomes
two journeys, and the second one is a new entity) and a metric that starts
counting a different thing (a new number is a new entity, so the history of the
old one stays readable).

**A `lifecycle` move is an ordinary content change, not a swap.** A component
going `planned` → `in-development` → `released`, or a product going `active` →
`sunset`, bumps `version` like any other edit and nothing else
([kinds/component.md](kinds/component.md),
[kinds/product.md](kinds/product.md)). It is not the `status`-only exception
above either: `status` is workflow state on the document and is exempt from the
bump; `lifecycle` is content, and content bumps. Adding the now-REQUIRED
`lifecycle` field to a component that predates it is likewise an ordinary
additive change on that component — add the field, bump its `version`.

An illegal change MUST NOT be made in place at any version number. The escape
hatch is the swap.

## The swap procedure

For any change the additive rule forbids:

1. **Create the successor** — a new entity with its own name (`version: 1`,
   `status: draft`). Give it a real name for what it now is; `-v2` suffixes are
   a last resort. Add the edge on the successor:

   ```yaml
   # solutions/acme/product/shop/component/checkout/component/payment/
   #   datamodel/payment-intent/index.md
   relations:
     supersedes:
       - ../charge          # sibling in the same datamodel/ bucket: one `..`
                            # leaves payment-intent/ and lands in the bucket
   ```

2. **Migrate referrers** one by one. Each migration is an ordinary additive
   change on the referrer (repoint the ref, bump the referrer's `version`).
   Referrers that cannot move yet keep resolving the old entity — pinned
   (`../charge@3`) or latest — indefinitely; nothing breaks during the window.
3. **Deprecate the old entity** once the portal's reverse-reference query shows
   no live referrers: set `status: deprecated` on `charge`. From then on, any
   new reference to it is flagged `W_REF_DEPRECATED`.
4. **Never delete.** Deprecated entities stay on the filesystem permanently;
   the portal renders them greyed with a pointer to the successor (the inverse
   `superseded-by` edge is derived from `supersedes` — it is not authored).

## Git-backed history

The contract between the catalog and git:

- **Only current versions exist on the filesystem.** `grep` and the file tree
  always show latest; every historical read goes through git. This is a
  feature: no `order-v1/`, `order-v2/` directory litter, no ambiguity about
  which copy is live.
- `.git` MUST be present where the portal runs, with **unshallow** history. A
  shallow clone degrades gracefully: versions whose commits are missing
  resolve to `E_SRN_VERSION` with a "shallow history" hint.
- **The version→commit index.** At load, for every entity, the portal walks
  the history of its `index.md` and records, for each version number, the last
  commit at which the frontmatter carried that number (last, so that
  status-only follow-ups are included):

  ```python
  def build_version_index(repo, entity_dir):
      index = {}                                     # version -> commit
      doc = f"{entity_dir}/index.md"
      for commit in repo.log(paths=[doc], reverse=True):   # oldest → newest
          fm = parse_frontmatter(repo.show(commit, doc))
          index[fm["version"]] = commit              # later commits win
      return index
  ```

- **Resolving `@N`:** if `N` is the current version, read the filesystem;
  otherwise read every file of the entity directory at `index[N]` via
  `git show {commit}:{path}`. Sibling artifacts are read at the same commit as
  the `index.md` — an entity version is a snapshot of the whole directory.
- **What the portal needs from git**, exhaustively: `log` with path filter and
  `show` of blobs at a commit. No branches, no tags, no notes — plain history.
- **Entities MUST NOT be moved or renamed.** The SRN is the path; a move is a
  delete plus an unrelated create, and the version→commit index does not
  follow it. Renaming is done by the swap procedure, like any other breaking
  change.

Worked example — `order` is at version 3; its history:

```text
commit c1  version: 1  (created, status: draft)
commit c2  version: 1  (status: approved — no bump)
commit c3  version: 2  (added optional "discount")
commit c4  version: 3  (added enum value "refunded")
```

Index: `{1: c2, 2: c3, 3: c4}`. A referrer pinned to
`/product/shop/component/checkout/component/payment/datamodel/order@1` gets the
`c2` snapshot — including its approved status. `order@5` → `E_SRN_VERSION`.

A snapshot is loaded into a registry scoped to **that commit's tree**, so the
schema URLs inside a historical `schema.json` resolve to the documents of that
same commit — never to the working tree, and never over the network. Working-tree
and historical schemas are never mixed in one registry
([kinds/datamodel.md](kinds/datamodel.md)).

This is also why a move is forbidden. SRN, disk path and schema URL are one
identity in three views ([srn.md](srn.md)), so moving a directory silently
changes all three at once: the `$id` derived from the new path would have to be
rewritten in every historical commit for the old snapshots to stay true, and the
version→commit index does not follow a move in any case. Renaming is done by the
swap procedure above.

## Artifact pins

A sibling artifact is addressed through its entity by a dot suffix on the
final SRN segment:
`srn://metaframework/product/devops/protocol/worktree-lease.transport@1`. The
suffix grammar, the closed per-kind role table, the surfaces such an SRN may
appear on, and the artifact error classes are all specified in
[srn.md](srn.md); what belongs here is the versioning semantics, and it is one
rule: **`X.role@N` names the `role` artifact of snapshot `X@N`.** The `@N` is
a coordinate of the entity, never of the artifact. An artifact has no version
of its own to address — the frontmatter is the only place a version lives, and
a `version:` key inside an artifact is a shape violation (above) — so the
suffix selects a file *within* the pinned snapshot. Resolution is the existing
machinery verbatim: the version→commit index maps `N` to a commit, and the
role's fixed filename (`transport` → `transport.yaml`) is read at that commit
via `git show {commit}:{path}`, exactly as any historical read is. No second
index, no second clock, no new resolution path.

**The constancy theorem.** *Within one version number, artifact bytes are
constant.* The `status`-only exception is the only mutation permitted between
two commits whose frontmatter carries the same `version`, and it touches
`status:` in `index.md` alone — it cannot reach an artifact file. Every commit
carrying version `N` therefore holds identical bytes for every artifact, and
`X.role@N` is well-defined even though the version→commit index records only
the *last* such commit. It is a theorem rather than a convention because its
premise is enforced: `E_VER_UNBUMPED` is the audit and
`metaframework check --since` the gate (below), and a history they accept
cannot falsify it. The converse situation is unremarkable: `X.transport@1` and
`X.transport@2` hold identical bytes whenever the v2 change touched prose
only, the same way one file's content can be identical at two git commits — a
pin names a coordinate, not a unique byte string.

**An artifact never bumps anything by itself.** There is no per-artifact
version to increment and no new rule to learn: the entity's `version` is the
only clock, and the rule this document opens with already requires a bump in
the same commit whenever any sibling artifact's content changes — with the
additive-only principle judging, per kind, whether that change was legal at
`N+1`. That pre-existing requirement is what gives an artifact pin its
meaning: no byte of an owned artifact can change without moving the one
number `@N` reads, so pinning the entity pins every artifact with it.

Worked example — `worktree-lease`, once it reaches version 2; its history:

```text
commit c1  version: 1  (created: index.md + transport.yaml, status: review)
commit c2  version: 1  (status: approved — no bump)
commit c3  version: 2  (transport.yaml gains an operation — legal, additive)
```

Index: `{1: c2, 2: c3}` — the last commit per version wins, and the artifact
suffix changes nothing about how the index is built or read.
`srn://metaframework/product/devops/protocol/worktree-lease.transport@1`
resolves `@1` to `c2` and reads
`git show c2:solutions/metaframework/product/devops/protocol/worktree-lease/transport.yaml`,
whose bytes are identical to those at `c1`: the `status`-only follow-up in
`c2` cannot have touched the file, so it makes no difference which of the two
commits the pin lands on — the constancy theorem, doing its work.
`worktree-lease.transport@2` is the current version and is read from the
filesystem; `worktree-lease.transport@3` is `E_SRN_VERSION`, exactly as
`order@5` was.

## The `status` states

`status` is REQUIRED in every entity's frontmatter. It is the review state of
**the document** and nothing else — not the stage of the thing the document
describes, which is `lifecycle` on a product or a component
([frontmatter.md](frontmatter.md#status-and-lifecycle-are-different-axes)). The
two axes cross freely: `status: approved` with `lifecycle: planned` is a
reviewed description of something not yet built, and it is the case this catalog
exists for.

| Status       | Meaning                                                          |
| ------------ | ---------------------------------------------------------------- |
| `draft`      | Being written; referenceable but unstable; portal marks it.      |
| `review`     | Content-complete; under git-native review (PRs on the files).    |
| `approved`   | The reviewed, binding state.                                     |
| `deprecated` | Superseded or retired; kept forever; new refs are flagged.       |

Transitions:

```text
draft → review          # author submits
review → draft          # review bounces it back
review → approved       # review passes
approved → deprecated   # swap completed (or entity retired without successor)
```

- `deprecated` is terminal. There is no un-deprecate — reviving a concept means
  a new entity that `supersedes` the deprecated one.
- **A deprecated datamodel SHOULD say so inside its schema too.** When a
  datamodel entity reaches `status: deprecated`, its `schema.json` SHOULD set
  `"deprecated": true` at the root. `deprecated` is a standard JSON Schema
  2020-12 meta-data keyword (vocabulary
  `https://json-schema.org/draft/2020-12/vocab/meta-data`, a boolean defaulting
  to `false`) — not an `x-` extension — so generators and documentation tools
  act on it without knowing this framework. Frontmatter `status` is what the
  portal reads; the annotation is what a schema carries once it has been
  dereferenced out of the catalog, where the frontmatter is no longer attached.

  ```json
  /* .../component/payment/datamodel/cart-order/schema.json — the predecessor
     that `order` supersedes, once its own index.md reads status: deprecated */
  {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/cart-order",
    "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/cart-order",
    "deprecated": true,
    "type": "object"
  }
  ```

  It is an annotation, so setting it rejects no instance and is legal in place
  under the superset rule ([kinds/datamodel.md](kinds/datamodel.md)) — it still
  bumps `version` like any content change. The same keyword MAY be set on an
  individual property being phased out, which is the additive substitute for
  removing it:

  ```json
  { "status": { "enum": ["placed", "paid"], "deprecated": true } }
  ```
- A version bump on an `approved` entity SHOULD reset `status` to `review`
  (or `draft`) per the owning team's process; the additive rule already
  guarantees the previous approved contract still holds.
- Status is per entity (its current version), not per historical version;
  historical snapshots carry whatever status they had at their commit.

Review itself is git-native: files are the review surface, the portal is
read-only presentation. Nothing in this lifecycle requires tooling beyond git
and the portal build's validation.

## Evolution error classes

| Code                  | Meaning                                                        |
| --------------------- | -------------------------------------------------------------- |
| `E_VER_REGRESSION`    | `version` decreased, or increased by more than 1, in a commit. |
| `E_VER_UNBUMPED`      | An entity's content changed between two commits while `version` stayed the same. |
| `E_SRN_VERSION`       | Pinned `@N` not on filesystem nor in the version→commit index. |
| `W_REF_DEPRECATED`    | Reference targets a `status: deprecated` entity.               |
| `W_REF_STALE_PIN`     | Pinned `@N` resolves, but the target has moved past it.        |

(`E_VER_REGRESSION` is checkable only where history is available — the portal
checks it while building the version→commit index.)

`E_VER_UNBUMPED` is the enforcement of the rule this document opens with: every
content change bumps `version`, and the only exemption is a commit touching
`status:` alone. Until it existed the rule was a convention — `version` was
checked for moving *wrongly* and never for failing to move at all — and the
first run over this repository's own history found 346 violations across 283 of
324 entities, 64 of them in artifacts rather than in `index.md`.

Two properties of the check follow from what the rule actually says, and both
matter:

- It compares **two commits, never the working tree**. Editing a file before
  committing it is authoring, not a violation; the bump legitimately arrives in
  the same commit as the change.
- It is scoped to the entity's **own** files. An entity directory contains its
  children, and a child carries its own `version` and answers this question for
  itself. A child always sits in a kind bucket and an entity's own artifacts
  never do, which is what separates them.

The same rule is available as a **gate** rather than an audit:
`metaframework check --since <ref>` requires every entity whose files changed
since `<ref>` to have bumped its `version`, and exits non-zero when one did not.
The two are deliberately different shapes. The audit walks every commit of one
entity and is right for "is the history I have sound"; the gate compares two
trees and judges only the net change, which is right for "may this land" — a
branch that breaks the rule in one commit and repairs it in the next passes,
and should, because the gate is about what lands rather than how it was
written.

Like `E_VER_REGRESSION` it needs history, so it is absent rather than passing
where git is not available — with no commits there is no claim to make. It is
also skipped on a truncated log, where a finding at the boundary would be an
artefact of the commit cap.

**Why it is not optional once artifacts are addressable.** A version is a
snapshot of the whole entity directory, so `@N` names an artifact's bytes as
well as the document's — and an artifact pin (`X.role@N`, above) reads exactly
those bytes. An unbumped edit makes a pinned reference and an unpinned one
resolve to different content for the same version — the situation the
constancy theorem declares impossible, and the theorem is entitled to declare
it only because this audit and the `--since` gate reject every history that
contains it.

The two version codes answer different questions and MUST NOT be conflated.
`E_SRN_VERSION` is an **error** and asks whether the pin resolves at all; it can
only be raised by something holding the version→commit index, which is why the
portal raises it in `lib/history`, at resolution time, and never at load.
`W_REF_STALE_PIN` is a **warning** and asks whether a resolving pin has fallen
behind; the loader can answer that from frontmatter alone. `order@1` while
`order` is at v3 is `W_REF_STALE_PIN` and legal; `order@5` is `E_SRN_VERSION`
and is not.

**Retired: `E_VER_ID_MISMATCH`.** It meant "schema `$id` version ≠ frontmatter
`version`". A `schema.json` carries an `$id` again (decision-record amendment
2026-08-19-c) but it carries **no version** — the URL addresses the current
schema and a `@N` in one is rejected, as it is in `x-srn` — so the comparison has no second
operand and the code MUST NOT be emitted. The rule it enforced is gone rather
than moved: with one copy of the version there is nothing to compare it against.
An `$id` that disagrees with the entity's schema URL is `E_DM_ID_MISMATCH`
([kinds/datamodel.md](kinds/datamodel.md)).
