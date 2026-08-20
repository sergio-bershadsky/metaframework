---
name: review-solution
description: This skill should be used when the user asks for an architectural review of an EXISTING metaframework catalog — "review solutions/acme", "audit the catalog", "does this decomposition still make sense", "is this catalog healthy", "find orphaned entities", "should these two components be merged", "is this component doing too much", "which entities have no owner or no edges", "are our datamodels in the right buckets", "did that swap ever finish", "which capabilities does nothing realize", "are our capabilities measured", "which integrations are undocumented", "are our must requirements checkable", "is anything released that we never wrote down", "sanity-check the shape after a batch" — or before a review milestone. It produces a ranked report of architectural findings and proposes no edits. It is NOT syntax validation; diagnostics, frontmatter errors and broken references belong to `validate-catalog`. For designing a tree that does not exist yet, use `solution-design`.
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

**Why before what:** read
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/philosophy.md` first. A review
that only checks legality misses the two failures that matter most — a
description that says what without why, and structured data a consumer could
never use. Both are judgement calls the rule files do not make.

**Rules:** `framework/spec/` when the repository has it (authoritative),
otherwise `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/` (`srn.md`,
`structure.md`, `frontmatter.md`, `schemas.md`, `protocols.md`,
`environments.md`, `journeys.md`, `evolution.md`). `decomposition.md` in the
same directory carries the component tests and the granularity band — judgement
the spec deliberately leaves open, so it applies even when `framework/spec/` is
on disk.

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

Then read `capability/` end to end — it is the second half of the charter and
the only list in the catalog a non-engineer can check. Two questions, before any
graph work: does each entry survive the rewrite test (would the sentence still
be true on a different stack, with a different vendor, in a different language),
and is the list the business's or engineering's? A capability list that reads
like the service list means the kind was adopted as a label, and every coverage
finding below it is then measuring the products against themselves.

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
| `R_CAP_UNREALIZED` — no product or component `realizes` the capability             | aspiration, not architecture — or a realizer that never claimed it | add `realizes` on whatever actually does it; read it against `status` first |
| `R_CAP_UNMEASURED` — no metric `measures` the capability                           | the claim is unfalsifiable; usually just early                     | usually none — report as coverage, not as a defect                |
| `R_CAP_SPREAD` — one capability realized from four or more products                | the product boundaries cut across the business rather than along it | rarely a fix; report as a decomposition observation with the count |
| `R_JRN_INTEGRATION_GAP` — a journey crosses products with no protocol at the seam   | an integration that exists in production and in no description     | write the protocol entity; or `protocol: none` if the actor carries it |
| `R_MET_NO_SUBJECT` — a metric with no `measures` edge                              | a number with no subject, or a subject nobody authored             | add `measures`; the portal raises `E_MET_NO_SUBJECT` for the same thing |
| `R_REQ_UNMEASURED` — a `must` with no metric                                       | a promise nobody can check                                         | add a metric that `measures` it, or admit the `must` is a `should` |
| `R_LIFECYCLE_UNDOCUMENTED` — a `released` component whose whole surface is `draft`  | undocumented running software                                      | approve the descriptions, or say why shipped software is still in draft |
| `R_LIFECYCLE_RISK` — a `planned` component that `released` ones already depend on   | a delivery risk stated in the catalog before it is stated in a plan | build it, or correct whichever of the two `lifecycle` values is wrong |

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

**Component trees read against the component tests.** The four tests and the
granularity band are in
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/decomposition.md`; read every
product's component tree against them. The smells, none of which any `R_*`
code fires on:

| Smell                                             | What it usually means                                                                                          |
|---------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| Component count outside the band                  | Twenty+: cut by file layout or org chart. Exactly one: not decomposed, or a component wearing a product's clothes |
| A component nothing references                    | No inbound edge from outside its own subtree — the boundary carries no edge, so the test fails even when `R_ORPHAN` stays quiet (outgoing edges silence it) |
| Component-per-source-file                         | The catalog mirrors the source tree; git already stores that, and every refactor now demands a swap             |
| Prose restating the parent                        | The `index.md` says nothing its parent does not — a feature or chapter filed as an entity; fold it into the parent's prose as a table, files as artifacts |
| Density inconsistent across products              | "Component" no longer means one altitude; every cross-product comparison silently compares different things     |

Each of these is a structural finding whose fix is a merge — a swap, priced in
referrers — so confirm against the tests before proposing it, and remember the
asymmetry: a missing split is cheap to add later, a wrong boundary costs a
swap to remove.

**Per-type discipline flags.** Each `component-type` value carries obligations
— the disciplines table in
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/decomposition.md`. Read every
component against its type's row. The flags, by type:

- `service` — nothing calls it; no inbound surface (probably a `job`); a route
  handler inside another component's process claiming `service` — record the
  strain or split honestly.
- `library` — zero consumers; a body that is normative text or installable
  content (`specification` or `content` was meant).
- `ui` — no actor or journey reaches it; domain state a service should hold.
- `job` — an inbound surface (it is a `service`); an unstated trigger.
- `datastore` — no component depends on it; business logic in the store;
  schemas it holds that no datamodel entity models.
- `gateway` — fronting nothing; domain logic at the edge.
- `external` — never flag missing environments or coverage; do flag child
  components (`E_COMP_EXTERNAL_CHILD`) or an undocumented boundary.
- `content` — no named host runtime; no fidelity statement.
- `application` — no install path; a version with no single source of truth.
- `specification` — a normative claim with neither an implementing check nor a
  recorded admission; a spec nothing implements.

**Decisions with no ADR.** Any of these without a record is a hole: the split of
one product into components, a persistence or messaging choice visible in the
protocols, an external dependency (`component-type: external`), a
`scope.out` line that someone argued about. `R_ADR_ABSENT` only catches the
crudest case.

**Twin entities.** Two summaries that cannot be told apart, in any kind. Read them
side by side; if the difference cannot be stated in one sentence, one of them
should not exist.

**Capabilities written at the altitude of a component.** The tell is a
`summary` that quotes a wire format, a protocol, or a vendor; a `title` that is
a noun phrase naming a system rather than a verb phrase naming a doing; or a
capability whose realizer set is exactly one component and always will be.
Confirm with the rewrite test. The fix is a swap, not an edit — the name
denotes the wrong thing, and `realizes` edges already point at it.

**`lifecycle` filled in by habit.** Every component `released` on a catalog
whose products are half `concept`, or a subtree of `planned` components that
have been planned for a year, means the field was answered once and never
revisited. Confirm against the honest test — `released` is "someone outside the
building team depends on it now", not "we merged it". This is cheap to check and
it decays silently, which is why it belongs in every review rather than only
the first.

**Journeys that are two journeys.** Not the branching a step key would show
(that is `E_JRN_BRANCH` and the portal catches it), but a path whose prose names
two outcomes — "…and if the card is declined, the basket is kept". One name
cannot be true of both, so the entity is unfindable under either. The fix is a
second journey and a `note` at the fork, which is additive; the original keeps
its SRN when its own outcome is still the one it names.

## Step 6 — rank and report

Order by consequence for a reader of the catalog, not by how easy the fix is:

1. **Scope and truth** — the catalog says something false or contradicts its own
   `vision`/`scope`. An `approved` capability nothing realizes belongs here and
   not under coverage: it is an agreed description of something the business
   cannot do, which is the sharpest false statement a catalog can make. So does
   a `released` component whose whole described surface is `draft`.
2. **Structural** — decomposition, placement or ownership is wrong. Say
   explicitly that the fix is a **swap**, because entities are never moved or
   renamed, and give the cost (how many entities and referrers move).
3. **Graph** — a missing or misleading relation edge. Fixable in place with a
   version bump.
4. **Modelling** — schema or protocol shape; state whether the fix is additive
   or needs a successor.
5. **Coverage** — capabilities with no metric, `must` requirements with no
   metric, journeys that cover none of the actors' goals. Report these as a
   table with counts, never as a list of individual defects: on a catalog that
   has just adopted the business layer nearly everything is uncovered, and a
   hundred separate findings say less than one number does.
6. **Hygiene** — status drift, unfinished swaps, orphans.

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
  It reads every `journey.yaml` as well as frontmatter, so journey steps are in
  the graph: a component a journey walks through is not an orphan, and an actor
  that takes a step is not unwired.
- **`references/review-checklist.md`** — every thing to look for: symptom, how
  to confirm it, the false positives, the fix and what the fix costs.
- **`references/writing-the-review.md`** — report structure and a worked excerpt.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/decomposition.md`** — the
  component tests, the band, and the anti-patterns behind the Step 5
  decomposition smells.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`** — the distilled spec.
