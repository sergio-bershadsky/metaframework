# Evolution — additive-only change, the swap, git-backed history

> Distilled from `framework/spec/evolution.md`, with the schema-specific rules in
> `framework/spec/kinds/datamodel.md`. **When `framework/spec/` is present in the
> repository, it is authoritative and wins over this file.** This bundled copy
> exists because an installed plugin cannot see the repo spec.
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

| Code               | Meaning                                                            |
|--------------------|--------------------------------------------------------------------|
| `E_VER_REGRESSION` | `version` decreased, or increased by more than 1, in a commit.     |
| `E_VER_UNBUMPED`   | An entity's own files changed between two commits while `version` stayed the same. Commits only, never the working tree; a `status:`-only edit is exempt; children are judged by their own versions. |
| `E_SRN_VERSION`    | Pinned `@N` not on the filesystem nor in the version→commit index. |
| `W_REF_DEPRECATED` | Reference targets a `status: deprecated` entity.                   |
| `W_REF_STALE_PIN`  | Pinned `@N` resolves, but the target has moved past it.            |

Datamodel-specific: `E_DM_NOT_ADDITIVE` (`schemas.md`).
Retired, MUST NOT be emitted: `E_VER_ID_MISMATCH`.

Both `E_VER_*` codes need git, so they surface where history is available: on
the entity page, where the version check streams in beside the version picker,
and — as a gate — via `metaframework check --since <ref>`, which exits non-zero
when an entity's files changed since `<ref>` without a bump. In CI, `<ref>` is
the branch base. The gate judges the net change only: a branch that breaks the
rule in one commit and repairs it in the next passes, deliberately. A plain
`metaframework check` runs neither.
