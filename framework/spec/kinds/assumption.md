---
kind: spec
name: assumption
version: 1
status: draft
title: Kind — Assumption
summary: Contract for assumption entities — owner-scoped placement, the standing enum and required review-by, the two pinned body sections, the assumes edge authored by the dependent, and the derived blast radius.
---

# Kind: assumption

An **assumption** is something the solution takes as true without proof, written
down so that the things resting on it can be found when it stops being true.

One belief, one assumption. "Billing reconciles nightly and the payment provider
settles within 24 hours" is two.

This document adds to the common contract in
[frontmatter.md](../frontmatter.md); it does not restate or relax it.

## Purpose

The kind exists for exactly one query: **what breaks if this turns out false?**

That is a reverse index, and it is the only reason to record an assumption in a
catalog rather than in a comment. An assumption written into an ADR's prose is
readable by someone who has already found the right ADR; an assumption that is
an entity is reachable from every entity that rests on it, and the set of those
entities is derived rather than maintained.

Everything else in this contract exists to make that query worth running: a
`standing` so the answer distinguishes "believed" from "known false", a
`review-by` so a belief nobody has revisited is visible, and a pinned
`## If this is false` section so each entry in the answer states its own cost.

## What an assumption is NOT

- **Not a requirement.** A requirement is a commitment the solution makes and
  can be verified against; an assumption is a belief about the world it does not
  control. "Checkout completes in under 2s" is a requirement. "Customers accept
  a 2s checkout" is an assumption. A belief with acceptance criteria has become
  a requirement and belongs in [requirement.md](requirement.md).
- **Not a constraint.** A constraint is true and imposed — it fails when *we*
  violate it. An assumption is believed and unverified — it fails when *reality*
  contradicts it. There is no `constraint` kind at this revision
  ([0022](srn://metaframework/adr/0022-assumptions-are-an-entity-not-a-heading)
  records why the two were not merged); a constraint is written as prose in the
  entity it binds.
- **Not a risk register.** A risk is an assumption with `standing: unverified`
  plus project ceremony — probability, impact, an owner chasing it. The
  architectural half is here; the rest belongs in whatever tracks work.
- **Not an ADR.** An ADR records a decision and the alternatives it beat. An
  assumption records an input that decision relied on. An ADR MAY `assumes` an
  assumption, and that is the honest way to say "this decision holds only while
  that belief does".

## Placement

The bucket may sit in the solution, a product, or a component — the same rule as
`adr`, `requirement` and `metric` ([structure.md](../structure.md)).

```text
solutions/acme/assumption/nightly-reconciliation/          # solution-wide
solutions/acme/product/billing/assumption/settles-in-24h/  # product-scoped
```

Place it with the **narrowest owner it constrains**. An assumption that only the
billing product rests on belongs under billing; one that several products rest
on belongs at the solution.

There is no `assumption` bucket under a `datamodel` or a `protocol`. A belief
about a data model is a belief of the component that owns it, and placing it
there keeps the reverse index pointing at something that can act on the answer.

## Frontmatter additions

| Field       | Type                                         | Required | Rule                                                                                     |
| ----------- | -------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `standing`  | `unverified \| holding \| broken \| retired` | yes      | The belief's standing. Closed enum; any other value is `E_FM_SCHEMA`.                    |
| `review-by` | ISO-8601 calendar date, `YYYY-MM-DD`         | yes      | When the belief must be re-examined (`E_ASM_REVIEW_DATE`). Required at every `standing`. |

### `standing`, and why it is not `status`

`status` is about **this document** — is it written and reviewed. `standing` is
about **the belief** — does it still hold. They move independently, and the same
split exists on `adr` (`decision-status`) and on `product`/`component`
(`lifecycle`); [frontmatter.md](../frontmatter.md) states the axis rule once.

| Value        | Reading                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| `unverified` | Believed, never tested. The honest starting state.                                 |
| `holding`    | Evidence exists and is stated in `## Basis`. Not proof.                            |
| `broken`     | Known false. Everything that assumes it is now suspect (`W_ASM_BROKEN_DEPENDENT`). |
| `retired`    | No longer relevant — the thing it was about is gone.                               |

A `broken` assumption **stays in the catalog**. Deleting it would remove the
edges that record which entities were built on it, which is the history most
worth keeping at exactly the moment it becomes expensive.

### `review-by` is required at every standing

Including `retired`. This is a rule with no exception, chosen over the more
honest per-entity alternative, because a conditional rule is the one authors
miss — `deciders` on an ADR is already conditional and is the field most often
forgotten. A stale date on a retired belief is noise; an undated live belief is
the thing this kind was built to prevent.

`W_ASM_STALE` fires when `review-by` is in the past and `standing` is
`unverified` or `holding`. A `broken` or `retired` belief is not stale — it has
already been resolved.

## The dependents — the `assumes` edge

The edge is authored by the **dependent**, never by the assumption:

```yaml
# in solutions/acme/product/billing/component/ledger/index.md
relations:
  assumes:
    - /assumption/nightly-reconciliation
```

Legal source: any kind **except** `assumption`. Legal target: `assumption` only
(`E_FM_EDGE_TARGET`).

Beliefs may not chain at this revision. A chain makes the reverse-index query
recursive, and 0022 refused that commitment in advance of real usage; the edge
table is closed and grows by appending, so it can be allowed later.

The inverse `assumed-by` is **derived** and MUST NOT be authored
(`E_FM_SCHEMA`), like every other inverse. It is what the assumption's own page
shows: the set of entities that would be affected if it broke.

An assumption with no incoming edges is `W_ASM_ORPHAN`. It is a warning rather
than an error because the two causes are opposite — a belief nothing rests on is
dead weight, or an edge nobody wired — and only a reader can say which.

## Body template

Two REQUIRED level-2 sections, exactly this text and casing. A missing heading,
a wrong level or altered text is `E_ASM_SECTIONS`:

```markdown
## Basis
## If this is false
```

They are enforced rather than conventional for the reason
[adr.md](adr.md) gives about its own four: a decision with no stated cost is an
announcement, not a record. A belief with no stated consequence is a note, not
an assumption — and `## If this is false` is what makes the derived dependent
list worth reading, because each entry then carries its own cost.

- **`## Basis`** — why this is believed, and how strongly. An honest basis often
  admits that no negative case was tried; write that rather than omitting it.
- **`## If this is false`** — what stops being true, what has to change, and who
  finds out first. Name entities by SRN so the prose and the edges agree.

Additional level-2 sections MAY follow. The **order** of the two is not
enforced; authors SHOULD write them as above.

## Evolution

`standing` is frontmatter, so changing it is a change to the entity and bumps
`version` like any other ([evolution.md](../evolution.md)). A belief moving from
`holding` to `broken` is the single most important edit this kind supports, and
it is deliberately not special-cased: it shows up in `check --since` exactly as
every other contract change does.

`supersedes` is **not** legal between assumptions at this revision. A belief
restated more precisely is not the same as one that broke, and the swap
procedure is built for the second.

## Validation rules

| ID | Rule                                                                       | Code                     |
| -- | -------------------------------------------------------------------------- | ------------------------ |
| A1 | `standing` present and in the closed enum.                                 | `E_FM_SCHEMA`            |
| A2 | `review-by` present and an ISO-8601 calendar date.                         | `E_ASM_REVIEW_DATE`      |
| A3 | Both `## Basis` and `## If this is false` present, at level 2, exact text. | `E_ASM_SECTIONS`         |
| A4 | `assumes` targets an `assumption`.                                         | `E_FM_EDGE_TARGET`       |
| A5 | `assumes` is not authored by an `assumption`.                              | `E_FM_EDGE_SOURCE`       |
| A6 | Nothing still assumes a belief whose `standing` is `broken`.               | `W_ASM_BROKEN_DEPENDENT` |
| A7 | `review-by` is in the past while `standing` is `unverified` or `holding`.  | `W_ASM_STALE`            |
| A8 | An assumption has at least one incoming `assumes`.                         | `W_ASM_ORPHAN`           |

A6 is a **warning**, not an error. Whether the world has contradicted a belief
is a judgement, and a judgement should not fail a build.

## Assumption error classes

| Code                     | Meaning                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `E_ASM_REVIEW_DATE`      | `review-by` missing, or not a bare `YYYY-MM-DD` calendar date.                          |
| `E_ASM_SECTIONS`         | A required body section is missing, at the wrong heading level, or spelled differently. |
| `W_ASM_BROKEN_DEPENDENT` | An entity assumes a belief whose standing is `broken`. The reverse index, reported.     |
| `W_ASM_STALE`            | A live belief is past its `review-by`.                                                  |
| `W_ASM_ORPHAN`           | Nothing assumes this belief — unused, or an edge was never authored.                    |
