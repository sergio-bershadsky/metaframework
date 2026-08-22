---
name: metaframework
kind: solution
version: 4
title: Metaframework
summary: The repository that describes itself — the catalog specification, the portal that renders a catalog, and the plugin that teaches an author to write one.
status: review
owner: sergio-bershadsky
vision: |
  Present the current state of a product and the decisions around it, reviewably.
  A description drifts from the thing it describes the moment the two live in
  different places, so here they live in one place: the description is files in
  the git repository, the decisions are entities standing beside them, and the
  portal is a read-only rendering of both. Nothing is entered twice and nothing
  comes out of a database. Every claim on a rendered page traces to a file a
  reviewer can open in a diff. The decision record is not an appendix to the
  structure — it is half of what the reader came for, because a catalog that
  says what a system is without saying why it is that, and not something else,
  is a snapshot rather than a description.
scope:
  in:
    - The specification that defines the catalog format and its evolution rules.
    - The portal that renders a catalog, derives its diagrams, and reports its integrity violations.
    - The authoring kit that teaches a human or a model to write and audit a catalog.
    - This repository's own decisions, filed as ADRs against the container each one binds.
    - The hosted deployment that serves a catalog from a GitHub repository at a chosen branch, described ahead of being built.
  out:
    - Running the hosted deployment. devops is described here and built nowhere; no image, no chart and no cluster exist.
    - A validator binary separate from the portal. Integrity is enforced at portal load, by decision — see adr/0011-no-cli-in-v1, whose "no CLI" half that record no longer holds.
    - Full-text search, a cross-catalog ADR timeline, cross-solution sharing, and an extensible ontology; all four are deferred in the founding decision record.
    - The fixture catalogs solutions/acme and solutions/brass. They are the portal's test data and its contact-with-reality check, not deliverables.
contacts:
  - role: architect
    handle: sergio-bershadsky
  - role: maintainer
    handle: sergio-bershadsky
relations:
  uses:
    - /environment/local
    - /environment/compose
    - /environment/production
tags:
  - self-describing
  - catalog
  - meta
---

This catalog describes the repository it lives in. Four deliverables, three of
which exist: [specification](srn://metaframework/product/specification) says what
a catalog must be, [portal](srn://metaframework/product/portal) renders one,
[authoring-kit](srn://metaframework/product/authoring-kit) teaches a model or a
person to write one, and [devops](srn://metaframework/product/devops) — `lifecycle:
concept`, not one line of it built — would serve one at a URL from any branch of
a GitHub repository. The portal `implements` the spec; the kit distils it. Those
two arrows are the reason the spec is modelled as a product rather than as a
paragraph on this page — a paragraph cannot be the target of a relation edge.

## The claim this catalog is making

That a system's current state and the decisions behind it belong in the same
reviewable artifact, and that the artifact is files. Everything downstream is
that claim held consistently: an entity is a directory holding `index.md`
([0002-filesystem-is-the-database](srn://metaframework/adr/0002-filesystem-is-the-database)),
its identity is its path
([0001-sealed-solution-universes](srn://metaframework/adr/0001-sealed-solution-universes)
for the boundary that path may never cross), the ontology it may use is closed —
at twelve kinds today, eleven of them buckets
([0003-closed-ontology-of-nine-kinds](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds)
fixed it at nine, and decision-record amendment `2026-08-20-a` appended
`capability`, `journey` and `metric`) — and the only gate on any of it is the
portal's own diagnostics page
([0011-no-cli-in-v1](srn://metaframework/adr/0011-no-cli-in-v1)).

Thirty of this catalog's one hundred and nine entities are ADRs — thirteen
constitutional ones in this bucket, eleven binding only the portal, five binding
only devops, one binding only the kit.
`find solutions/metaframework -name index.md | wc -l` returns 109 and the same
command narrowed with `-path '*/adr/*'` returns 30, so a little over a quarter of
the pages here are a decision rather than a description.
That proportion is deliberate and is the directive this solution was written to:
the decisions are as prominent as the structure, filed in the bucket of the
container each one binds rather than collected in one chronological pile.

## Three of its buckets contradict one of its ADRs, and the ADR stands

`capability/`, `journey/` and `metric/` exist in this catalog, and
[0003-closed-ontology-of-nine-kinds](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds)
says under Consequences that there is no `metric` kind and no `capability` or
`journey` kind either. Both statements are in the repository and both are on the
record.

The ADR is not wrong; it is dated. It records what was decided when the ontology
was fixed, and its reasoning — that each candidate overlapped something already
present, and that overlapping kinds produce catalogs where the same fact is filed
in two places — is exactly the reasoning amendment `2026-08-20-a` had to answer
before the three were admitted. An ADR is a decision at a moment, and rewriting
one to agree with the present is how a decision record turns into a description
of the current state, which is what the rest of this catalog is for.

What is genuinely missing is the ADR that supersedes it. Nothing in
`solutions/metaframework/adr/` records the reversal; the argument lives in
`docs/decision-record.md`, which outranks the spec on conflict but is not an
entity and cannot be the target of a `supersedes` edge. Until somebody writes
that ADR, a reader arriving at 0003 from the graph has no forward pointer, and
this paragraph is the only thing that says so.

## Reading order

Start here, then [specification](srn://metaframework/product/specification) — it
is the contract everything else is measured against, and its
[core-contracts](srn://metaframework/product/specification/component/core-contracts)
component states the precedence rule that governs the rest
(`docs/decision-record.md` wins, then the core contracts, then a kind
document). Then
[portal](srn://metaframework/product/portal), which is the surface the owner's
directive is actually about. The
[authoring-kit](srn://metaframework/product/authoring-kit) is last and is the
only deliverable that ships outside this repository.

The solution-level ADRs are the constitutional ones — identity, storage,
ontology, evolution, tooling posture. Decisions that bind only the renderer live
in the portal's own `adr/` bucket, and the one decision about how the plugin is
organised lives in the kit's.

## What is absent, stated once

- **No deployment, and now three environment entities describing one.** There is
  still no Dockerfile, no `docker/` directory, no chart, no `vercel.json` and no
  deploy script — `find` returns nothing for any of them.
  [compose](srn://metaframework/environment/compose) and
  [production](srn://metaframework/environment/production) describe targets that
  do not exist, which the environment kind permits and which every page in that
  subtree says out loud. [local](srn://metaframework/environment/local) remains
  the only environment anything has ever run in.
- **CI exists now, and most of this catalog still says it does not.**
  `.github/workflows/ci.yml` gates every push and pull request: install,
  typegen, typecheck, lint, the test suite, the packaged build, `metaframework
  check` over this tree, a run of the packaged CLI on the declared engines
  floor, and a pack audit. So "nothing gates a commit" is false as of
  2026-08-20.

  It is false in many other places too — `grep -rn 'no CI'
  solutions/metaframework` finds them, across the portal's ADRs, its
  requirements, the specification and the kit. A second sentence of the same
  shape travels with it: "`git log --merges` returns nothing", which
  `grep -rn 'merges. returns nothing' solutions/metaframework` finds in the
  reviewer actor, the audit journey, `review-first-change` and
  [0012-review-is-git-native](srn://metaframework/adr/0012-review-is-git-native).
  It has been false since 2026-08-20, when `feat/console-mermaid-and-brass`
  merged.

  Those sentences were true when written and are now stale, and they are listed
  here rather than quietly corrected because correcting them is an edit to each
  entity's prose and version, which is a reviewable change per page and not a
  sweep. This paragraph is the forward pointer until somebody makes it — and
  the two statements above are the whole of what it defers, so a claim of this
  shape found anywhere else is a defect, not a known gap.
- **`https://schemas.metaframework.dev` resolves nowhere.** It is an identity
  constant at `framework/portal/src/lib/schema/url.ts:46`, deliberately not
  configuration. Bytes are served only by the portal's own `/schemas` route at
  `SCHEMA_BASE_URL`, default `http://localhost:3000`. A consumer that wants to
  fetch rather than trust a cache maps one host onto the other in resolver
  config.
- **The spec is unratified.** Every document under `framework/spec/` carries
  `status: review`, except `kinds/capability.md` and `kinds/metric.md`, which
  carry `status: draft`. Not one is `approved`, and on
  conflict `docs/decision-record.md` wins anyway.
- **Roughly fifty specified diagnostic codes are implemented nowhere**,
  concentrated in protocol, environment, ADR and requirement validation —
  including `E_ADR_SECTIONS` and `E_REQ_CRITERIA`. This solution's own ADRs and
  requirements are therefore checked by author discipline, not by the loader.
- **The repository is days old.** One author, one merge commit, and
  `git log --format=%ad --date=short | sort -u` fits on a screen. Nothing here has an operating history, a team,
  or a user outside this machine.

## How to read a claim in this catalog

Every factual claim in these pages is meant to be greppable: a file path, a line
number, a commit hash, or a command with its measured output and the date it was
measured. Where a claim could not be checked it was dropped rather than softened.
Where the ontology had no word for something true — a set of normative documents,
an HTTP endpoint inside a monolith, a component that is built and mounted nowhere
— the nearest enum value was taken and the mismatch written into the prose. Those
paragraphs are not apologies; they are the findings this description exists to
produce.

## Sealed, including from its own fixtures

Nothing in this catalog references `srn://acme` or `srn://brass`, and nothing in
those references back. That rule is mechanical, not editorial: `resolveRef()` in
`framework/portal/src/lib/srn/srn.ts` throws `E_SRN_CROSS_SOLUTION` for a
foreign authority and for a network-path reference. This is the solution most
tempted to break it — it describes the very tool those two fixtures exercise —
and the temptation is exactly why the rule is enforced in the parser rather than
left to review.
