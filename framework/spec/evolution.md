---
kind: spec
name: evolution
version: 2
status: review
title: Evolution and history
summary: Versioning and history — the integer version field, additive-only rules with legal/illegal examples, the swap procedure, the git-backed history contract, and the status lifecycle.
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
  that kind. A datamodel's `schema.json` likewise carries **no `$id`** and no
  version (decision-record amendment 2026-08-19-b,
  [kinds/datamodel.md](kinds/datamodel.md)): its `$ref`s are relative file paths,
  which cannot express `@N`, and its identity is the SRN of the directory holding
  it. An entity version is a snapshot of the whole directory at one commit, so
  there is exactly one number to bump and nothing that can drift out of step with
  it.

  ```json
  { "$id": "srn://acme/datamodel/money@4" }   /* E_DM_ID_FORBIDDEN — the version
                                                 belongs in index.md, and an $id
                                                 re-bases every relative $ref */
  ```

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
at two successive commits. Neither carries an `$id` or a version: the version
number lives in the sibling `index.md` and nowhere else, which is why the two
files below are labelled "version 1" and "version 2" by their commit rather than
by anything inside them. The `$ref` climbs the eight levels from the entity
directory to `solutions/acme/`, where the solution-wide `money` vocabulary lives.

Version 1:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/order",
  "type": "object",
  "required": ["id", "total"],
  "properties": {
    "id":     { "type": "string" },
    "total":  { "$ref": "../../../../../../../../datamodel/money/schema.json" },
    "status": { "enum": ["placed", "paid"] }
  }
}
```

Legal version 2 (every v1 instance still validates):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/order",
  "type": "object",
  "required": ["id", "total"],
  "properties": {
    "id":       { "type": "string" },
    "total":    { "$ref": "../../../../../../../../datamodel/money/schema.json" },
    "status":   { "enum": ["placed", "paid", "refunded"] },
    "discount": { "$ref": "../../../../../../../../datamodel/money/schema.json" }
  }
}
```

The two documents differ only in the `properties` block, which is the point: a
version bump touches content, never identity. A pin on `money` — "this model was
reviewed against `money@1`" — cannot live in a `$ref`, because a path carries no
`@N`; it goes in the entity's `relations.uses` as `/datamodel/money@1`
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

| Entity kind         | Legal at `N+1` (examples)                              | ILLEGAL at `N+1` (examples)                       |
| ------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| protocol            | add an operation; add an optional message field; add a workflow; add a state + transitions | remove/rename an operation; remove a state; change a message's datamodel ref to an incompatible one |
| requirement / adr   | clarify wording; append consequences; add relations    | reverse or narrow the decision/requirement — that is a new entity (swap) |
| actor / environment | extend description; add relations                      | repurpose the name to mean something else         |
| container           | add child entities; extend prose                       | remove or rename children (children swap individually) |

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

A snapshot is loaded against **that commit's tree**, which is what makes the
relative `$ref`s inside a historical `schema.json` resolve: at `c2` the entity
sat at whatever path it sat at, and the `..` counts in the file match it. This
is also why a move is forbidden — the path is the identity, and no rewrite of
history could keep both.

## Status lifecycle

`status` is REQUIRED in every entity's frontmatter:

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
| `E_SRN_VERSION`       | Pinned `@N` not on filesystem nor in the version→commit index. |
| `W_REF_DEPRECATED`    | Reference targets a `status: deprecated` entity.               |

(`E_VER_REGRESSION` is checkable only where history is available — the portal
checks it while building the version→commit index.)

**Retired: `E_VER_ID_MISMATCH`.** It meant "schema `$id` version ≠ frontmatter
`version`". A `schema.json` now carries neither an `$id` nor a version
(decision-record amendment 2026-08-19-b), so the comparison has no operands and
the code MUST NOT be emitted. The rule it enforced is gone rather than moved:
with one copy of the version there is nothing to compare it against. An `$id`
appearing in a schema at all is `E_DM_ID_FORBIDDEN`
([kinds/datamodel.md](kinds/datamodel.md)).
