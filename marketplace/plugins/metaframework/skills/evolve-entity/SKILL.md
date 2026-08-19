---
name: evolve-entity
description: This skill should be used when changing an entity that already exists in a metaframework catalog — "rename this component", "delete this datamodel", "remove that field", "make this field required", "narrow the enum", "move this entity under the other product", "promote this datamodel to the solution level", "bump the version", "deprecate this", "replace it with a new one", "split this actor into two roles", "supersede this ADR", "this schema needs a breaking change", "can I just git mv it". It decides whether the change is legal in place or needs the swap procedure, and carries out whichever it is. Use it BEFORE editing any published entity, because the framework forbids removing, renaming, narrowing, moving and deleting, and the instinctive fix is usually one of those. For creating something new rather than changing something existing, use `add-entity`, `model-data` or `protocol-design`.
---

# Evolving an entity

Two mechanisms carry every change: an **additive edit in place** with a `version`
bump, and a **swap** — a successor entity that supersedes the old one. Nothing is
ever deleted, moved, or renamed. Deciding which mechanism applies is the whole
job; the edits themselves are mechanical.

**Rules:** `framework/spec/evolution.md` and the target's `framework/spec/kinds/<kind>.md`
when the repository has them — they are authoritative. Otherwise the bundled
distillation at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/evolution.md`
(plus `schemas.md` for `schema.json`, `frontmatter.md` for edges).

## Step 1 — classify the change before touching a file

State the change as a sentence about the entity's **contract surface**:
everything a referrer can depend on. For a datamodel that is the schema; for a
protocol the operations, messages and states; for a requirement or an ADR the
substance of the statement; for an environment its identity, type and config
keys.

| The change…                                                              | Mechanism |
|---------------------------------------------------------------------------|-----------|
| Adds something optional (property, enum value, operation, state, workflow, config key, relation, prose) | in place |
| Widens a type, relaxes a bound, drops a name from `required`               | in place  |
| Clarifies wording, appends a consequence, corrects a typo, adds tags       | in place  |
| Promotes a `$defs` shape to its own datamodel and `$ref`s it               | in place (instance shape unchanged) |
| Removes or renames anything a referrer can name                           | **swap**  |
| Narrows a type, tightens a bound, adds to `required`, removes an enum value | **swap** |
| Repurposes the entity to mean something else                              | **swap**  |
| Renames the entity, or moves it to a different owner                      | **swap**  |
| Reverses or narrows a decision or a requirement                           | **swap**  |

The mechanical test for a datamodel: **version N+1 MUST accept every instance
version N accepted.** If a document that validated yesterday would fail today,
it is a swap — at any version number. The per-keyword table is in
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/schemas.md`.

Say which mechanism applies and why before editing. If it is a swap, say that
out loud — the user usually expected an edit.

## Step 2a — the in-place edit

1. Make the additive change to `index.md` and/or the sibling artifacts.
2. **Bump `version` by exactly 1** in `index.md`. Not 2, never backwards
   (`E_VER_REGRESSION`), never a string, never semver.
3. Consider resetting `status: approved` → `review` — the previously approved
   contract still holds, but the new surface has not been reviewed.
4. Record what changed and why in the prose. The catalog is the changelog: a
   short "## History" or a sentence naming what version N added is what makes a
   later reader trust the number.

Bump rules that catch people out:

- **Any content change bumps** — frontmatter, prose, or *any* sibling artifact.
  Editing `schema.json` alone still bumps `index.md`.
- **A change to `status` alone does not bump.** Status is workflow state.
- **`decision-status` on an ADR is not `status`** — moving `proposed → accepted`
  or `accepted → superseded` is a fact about the architecture, so it **does**
  bump, and `date` moves with it.
- **Artifacts carry no version of their own.** A top-level `version:` key in
  `transport.yaml`, `topology.yaml`, `config.yaml` or a workflow file is a shape
  violation. `schema.json` carries two identity keywords and neither takes a
  version: `$id` is the canonical URL of the *current* schema and `x-srn` is the
  **unversioned** SRN. One number, in the frontmatter, covering the whole
  directory.
- **A child does not bump its container.** Adding, bumping or deprecating
  `component/wishlist` leaves `product/shop` at the version it had.
- **A referrer does not bump when its target evolves additively.** A `$ref`
  names an entity, not a version; nothing to edit, nothing to bump.

## Step 2b — the swap procedure

Six steps, in this order. The window between step 1 and step 4 is where nothing
breaks: both entities are live and referrers move one at a time.

1. **Name the successor.** A real name for what it now is — `payment-intent`,
   not `charge-v2`. A `-v2` suffix is a last resort and reads as a defect
   forever, because the name is the address. Check the name is kebab-case and
   not one of the eight reserved kinds.
2. **Create the successor entity** in the correct bucket (placement is grammar:
   `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/srn.md`), `version: 1`,
   `status: draft`, with the edge on the **successor**:

   ```yaml
   relations:
     supersedes:
       - ../charge        # sibling in the same bucket — ONE ".." leaves this
                          # entity's directory and lands in the bucket
   ```

   `supersedes` targets an entity of the **same kind** as the source. Never
   author `superseded-by` on the old entity — the portal derives it.
3. **Census the referrers** before promising anything (recipe below).
4. **Migrate referrers one at a time.** Each migration is an ordinary additive
   change on the referrer: repoint the reference, bump *that* referrer's
   `version`. Referrers that cannot move yet keep resolving the old entity,
   pinned or latest, for as long as they need. Do not batch this into one commit
   unless the referrers genuinely share an owner.
5. **Deprecate the old entity** once the census comes back empty: set
   `status: deprecated`. Status alone, so no bump — but rewriting its
   title and summary to say where it went (recommended) is content, and that
   bumps. From then on any new reference to it is `W_REF_DEPRECATED`.

   **For a datamodel, mark the schema too** — `"deprecated": true` at the root of
   `schema.json`, in the same commit:

   ```json
   {
     "$schema": "https://json-schema.org/draft/2020-12/schema",
     "$id": "https://schemas.metaframework.dev/acme/product/shop/datamodel/charge",
     "x-srn": "srn://acme/product/shop/datamodel/charge",
     "title": "Charge",
     "deprecated": true,
     "description": "Superseded by srn://acme/product/shop/datamodel/payment-intent."
   }
   ```

   `deprecated` is a **standard JSON Schema 2020-12 meta-data keyword** — the
   same vocabulary as `title`, `description` and `examples`
   (`https://json-schema.org/draft/2020-12/meta/meta-data`). It is an annotation:
   it asserts nothing and rejects no instance, so setting it is always additive,
   never a swap in its own right. Use the standard keyword rather than an `x-`
   extension precisely because stock generators already understand it and emit
   `@deprecated` into the code your consumers build against — the frontmatter
   `status` reaches the portal, this reaches everyone who only ever sees
   `schema.json`. Touching the schema makes the commit a content change, so bump
   `version` once, covering both edits.
6. **Never delete.** The deprecated directory stays forever; the portal renders
   it greyed with a derived pointer to the successor.

### The referrer census

References reach an entity in four different syntaxes, so grep for the **name**,
not for one form of the path:

```bash
grep -rn "shop-admin" solutions/ --include='*.md' --include='*.json' --include='*.yaml'
```

That catches solution-absolute refs (`/actor/shop-admin`), relative refs
(`../shop-admin`), full `srn://` prose links, canonical schema URLs
(`https://schemas.metaframework.dev/acme/...`), the `x-srn` a `schema.json`
declares about itself, and protocol `participants[].ref` alike — grepping the
bare name is what makes one pass cover all of them. Then classify each hit: a
`relations` edge or a schema `$ref` is a live referrer and must be migrated; a
schema's own `x-srn` is self-identification, not a referrer; a prose mention is
navigational and may stay (pointing at history is the correct use of a deprecated
entity).

After deprecating, confirm nothing structural is left:

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/review-solution/scripts/catalog_facts.py solutions/<name>
```

`R_DEPRECATED_LIVE_REF` and `R_SWAP_UNFINISHED` name exactly the two ways a swap
is left half-done.

## Never move, never rename

**The SRN is the path.** A move is a delete plus an unrelated create: the
version→commit index does not follow it, so the entity's history is lost and
every `@N` pin against it stops resolving. `git mv` is not a fix, and neither is
"nobody references it yet".

Two consequences worth stating before anyone reaches for it:

- **Renaming a container is the most expensive change in the framework.** Every
  descendant's path changes, so every descendant is its own swap. A product with
  twelve entities under it costs thirteen swaps and thirteen migration windows.
- **`title` is free.** `name` is the address; `title` is the label the portal
  shows. When the complaint is "this is called the wrong thing", fix `title` and
  `summary` in place, bump the version, and leave the address alone. Reserve the
  rename-swap for when the *concept* changed, not the wording.

## Never delete — with one honest exception

Published entities are permanent: the spec has no delete, and `deprecated` is
terminal. The exception is not an exemption in the rules but a judgement about
what the catalog has actually seen — if `git log --oneline -- <path>` comes back
empty, no commit ever contained the entity, so removing the directory is undoing
an edit rather than deleting an entity. Run the command before assuming it, and
never stretch the reasoning to something a colleague may already have pulled.

## History and pins

Only current versions exist on disk; every historical read goes through git. The
portal indexes, per entity, the **last** commit carrying each `version` number,
and resolves `@N` by reading that whole directory at that commit. So: commit
each version bump as its own commit, keep the working tree clean of half-bumped
states, and make sure `.git` is present and **unshallow** where the portal runs
— a shallow clone turns old pins into `E_SRN_VERSION`.

## Kind-specific variants

| Kind                    | What the swap looks like                                                                                                                                                                                                                                                                                           |
|-------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `adr`                   | Successor gets its own ordinal (never reused); predecessor gets `decision-status: superseded` + same `date` + a version bump. **Not `status: deprecated`** — referencing old decisions is the point of an ADR archive, and deprecating them would flag every such reference.                                       |
| `datamodel`             | Successor is a new entity with its own `schema.json`, its own `$id` and its own `x-srn` — both derived from the new directory, never copied from the predecessor. Referrers repoint `$ref`s one at a time; the predecessor's schema gets `"deprecated": true` at step 5. Promotion out of `$defs` is *not* a swap. |
| `actor`                 | Splitting one role into several is one successor per role, each carrying `supersedes` toward the old actor.                                                                                                                                                                                                        |
| `environment`           | Successor environment, then repoint each component's `uses` edge, then deprecate.                                                                                                                                                                                                                                  |
| `requirement`           | A narrowed or reversed statement is a new requirement; migrate the `implements` edges that pointed at the old one.                                                                                                                                                                                                 |
| `component` / `product` | Swapping a container implies swapping everything under it — see the cost above; prefer keeping the name.                                                                                                                                                                                                           |

## Finish

Run the catalog check and report the result:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

Zero error diagnostics is the pass condition. Report pass/fail plus, for a swap,
which step the catalog is now at: successor created, N referrers migrated, M
still pointing at the old entity, deprecated yes/no.

## Additional resources

- **`references/swap-walkthrough.md`** — a complete swap end to end on real
  catalog entities (the `shop-admin` → `merchant-operator` actor split), with
  the commit-by-commit file states, plus the ADR and datamodel variants and the
  container-rename cost worked out.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/evolution.md`** — version
  field, additive tables per kind, status lifecycle, git contract.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/schemas.md`** — the
  per-keyword additive table for `schema.json`.
- **`model-data`** and **`protocol-design`** skills — authoring mechanics for a
  successor datamodel or protocol once this skill has decided a swap is needed.
- **`validate-catalog`** skill — reading the diagnostics the final check emits.
