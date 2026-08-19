---
name: review-solution
description: This skill should be used when the user asks for an architectural review of an EXISTING metaframework catalog — "review solutions/acme", "audit the catalog", "does this decomposition still make sense", "is this catalog healthy", "find orphaned entities", "should these two components be merged", "is this component doing too much", "which entities have no owner or no edges", "are our datamodels in the right buckets", "did that swap ever finish", "we just landed a batch of entities, sanity-check the shape" — or before a review milestone. It produces a ranked report of architectural findings and proposes no edits. It is NOT syntax validation: diagnostics, frontmatter errors and broken references belong to `validate-catalog`. For designing a tree that does not exist yet, use `solution-design`.
---

# Reviewing a solution

Answer the question the checker cannot: **is this a good description of this
system?** The portal's catalog check proves the tree parses, the frontmatter
validates, the references resolve and the schemas load. It cannot tell that
a component does three unrelated jobs, that a protocol drifted away from its
participants, or that a vocabulary was copied instead of referenced.

**This skill is read-only.** It produces findings, not edits. State the change
that would be made and which mechanism it needs; when the user asks for the
change, hand it to the `evolve-entity` skill, because most structural fixes are
swaps — entities are never moved or renamed.

**Rules:** `framework/spec/` when the repository has it (authoritative),
otherwise `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/` (`srn.md`,
`structure.md`, `frontmatter.md`, `schemas.md`, `evolution.md`).

## Step 1 — check legality first

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

If it reports errors, say so and deal with them first (`/catalog-check`, or the
`validate-catalog` skill). A catalog with dangling references is a catalog whose
graph is incomplete: every judgement about orphans, coverage and coupling below
would be drawn from a partial graph.

## Step 2 — read the charter

Read the solution's `index.md` before any entity: `vision`, `scope.in`,
`scope.out`, `contacts`. Everything downstream is judged against it. A catalog
that has drifted outside its own stated scope — or a `scope.out` line that some
component plainly violates — is the first finding worth reporting, and it
outranks every graph nit.

## Step 3 — collect the facts

```bash
python3 ${CLAUDE_PLUGIN_ROOT}/skills/review-solution/scripts/catalog_facts.py solutions/<name>
python3 ${CLAUDE_PLUGIN_ROOT}/skills/review-solution/scripts/catalog_facts.py solutions/<name> --json
```

It walks the catalog, resolves every reference (frontmatter relations, protocol
participants, `primary-actors`, schema `$ref` URLs, prose `srn://` links) into a
graph, and prints a census plus candidate findings coded `R_*`. Standard library
only; no CLI, no network, nothing written.

**Every `R_*` line is a question, not a verdict.** The codes are deliberately
not `E_*`/`W_*`: they carry no authority, several are heuristics, and a
well-modelled catalog trips some of them for good reasons. Open the files it
names before writing anything up.

## Step 4 — verify each candidate, then judge

| Code / symptom in the catalog                                                    | What it usually means                                              | Usual fix                                                        |
|-----------------------------------------------------------------------------------|--------------------------------------------------------------------|------------------------------------------------------------------|
| `R_ORPHAN` — no relation edges out, nothing points in                            | dead entity, or a real edge nobody authored                        | add the missing `uses`/`exposes`/`implements`; or deprecate it    |
| `R_DEPRECATED_LIVE_REF` — deprecated entity still referenced structurally         | a swap was started and abandoned                                   | finish the migration, then re-deprecate (`evolve-entity`)         |
| `R_SWAP_UNFINISHED` — `supersedes` target not marked                              | step 5 of the swap was skipped                                     | deprecate the predecessor (ADR: `decision-status: superseded`)    |
| `R_DEPRECATED_NO_SUCCESSOR` — deprecated, nothing `supersedes` it                  | retired outright, or the successor forgot its edge                 | add `supersedes` on the successor; or confirm the retirement was intended |
| `R_PROTOCOL_NCA` — protocol sits below the NCA of its participants                | a participant was added later and the directory never followed     | swap the protocol to the right owner, or correct the participant list |
| `R_PRODUCT_ONE_COMPONENT` / `R_PRODUCT_NO_COMPONENT` — a product with one component or none | ceremony: a component wearing a product's clothes, or a product staked out early | usually leave the name and grow it; collapsing it is a whole-subtree swap |
| `R_REQ_UNIMPLEMENTED` — `must`/`should` requirement nothing `implements`          | an obligation nobody owns, or a missing edge                       | add `implements` on the owning component, or downgrade the priority honestly |
| `R_ENV_UNUSED` / `R_ACTOR_UNWIRED` — nothing runs there / no interaction reaches it | the description stops before the thing it describes                | add the `uses` edge, name the actor in a protocol, or retire it   |
| `R_DM_UNDER_PROMOTED` — component-owned model referenced from other subtrees       | shared vocabulary trapped under one owner                          | promote it to the common ancestor's bucket — that is a swap        |
| `R_DM_OVER_PROMOTED` — solution-level model only one owner touches                 | premature generalization                                           | usually leave it; flag only when the model encodes one owner's specifics |
| `R_DM_NEAR_DUPLICATE` — two schemas with near-identical property sets              | copy-paste instead of a shared entity or a tagged union            | promote the shared shape to one datamodel; make the variants a `oneOf` with a `const` tag |
| `R_ADR_ABSENT` — a multi-component product with no ADR anywhere                    | decisions were taken and never recorded                            | write the ADR now, dated when the decision was actually made      |
| `R_DRAFT_DEPENDENCY` — approved entities rest on a `draft`                        | the dependency is more settled than the thing it depends on        | promote the draft, or mark the dependants honestly                |

For each candidate, confirm by reading the entity and its neighbours. The
detailed treatment — how to tell a real finding from a false positive, and what
the fix costs — is in `references/review-checklist.md`. Read it before writing
up anything in the bottom half of the table.

## Step 5 — the judgements no script makes

**Components that always change together.** Co-change is the evidence: count
how often two component directories appear in the same commit, against how often
each appears at all (the counting script is in `references/review-checklist.md`).
Nine shared commits out of ten means the boundary between them is imaginary;
nine out of ninety is ordinary collaboration. The fix is a merge — a swap of both
into one successor, so propose it only when the co-change is near-total, the
summaries overlap, and one team owns both.

**Components doing several unrelated jobs.** The tells: a `summary` that needs
an "and" to be true; `exposes` edges toward protocols with unrelated
participants; a name like `core`, `common`, `shared`, `platform` or `manager`;
everything in the product `depends-on` it. Confirm by asking whether two teams
could own the halves without arguing over the same files. The fix is a split:
successors per capability, then migrate referrers.

**Cross-cutting concerns copied rather than referenced.** Look for the same
property cluster in several schemas (`created-at`/`created-by`, an address, a
currency pair), the same paragraph of prose in several `index.md` files, or the
same enum repeated. Each copy drifts independently; the catalog then describes a
disagreement it does not have. The fix is promotion to one datamodel entity that
the others `$ref` — or an `abstract: true` base composed with `allOf`.

**Decisions with no ADR.** Any of these without a record is a hole: the split of
one product into components, a persistence or messaging choice visible in the
protocols, an external dependency (`component-type: external`), a
`scope.out` line that someone argued about. `R_ADR_ABSENT` only catches the
crudest case.

**Twin entities.** Two summaries that cannot be told apart, in any kind. Read them
side by side; if the difference cannot be stated in one sentence, one of them
should not exist.

## Step 6 — rank and report

Order by consequence for a reader of the catalog, not by how easy the fix is:

1. **Scope and truth** — the catalog says something false or contradicts its own
   `vision`/`scope`.
2. **Structural** — decomposition, placement or ownership is wrong. Say
   explicitly that the fix is a **swap**, because entities are never moved or
   renamed, and give the cost (how many entities and referrers move).
3. **Graph** — a missing or misleading relation edge. Fixable in place with a
   version bump.
4. **Modelling** — schema or protocol shape; state whether the fix is additive
   or needs a successor.
5. **Hygiene** — status drift, unfinished swaps, orphans.

For each finding give: the **SRN**, the symptom (with the file and line that
shows it), why it matters for a reader, the fix, and the mechanism (in place /
swap / no change). End with what was not reviewed and why.

**A clean audit is a real result.** Say the catalog is in good shape when it is,
and do not pad the list to look thorough. `references/writing-the-review.md` has
the shape and a worked excerpt.

For a large catalog, or when an independent second opinion is wanted, dispatch
the `catalog-reviewer` agent with the same brief and reconcile its findings with
the facts collected here.

## Finish

This skill writes nothing, so there is nothing to re-validate — but state in the
report whether the catalog check passed at Step 1, since every finding rests on
it.

## Additional resources

- **`scripts/catalog_facts.py`** — the fact collector; `--json` for machine use.
- **`references/review-checklist.md`** — every thing to look for: symptom, how
  to confirm it, the false positives, the fix and what the fix costs.
- **`references/writing-the-review.md`** — report structure and a worked excerpt.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`** — the distilled spec.
