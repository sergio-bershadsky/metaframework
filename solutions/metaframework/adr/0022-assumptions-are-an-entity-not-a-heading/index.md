---
name: 0022-assumptions-are-an-entity-not-a-heading
kind: adr
version: 1
title: Assumptions are an entity, not a heading
summary: A twelfth kind — assumption — with an assumes edge, because the only reason to record an assumption is to find what breaks when it turns out false, and prose cannot answer that.
status: draft
owner: sergio-bershadsky
decision-status: proposed
date: "2026-08-30"
relations:
  uses:
    - /product/specification/component/kind-contracts
tags:
  - ontology
---

## Context

Nothing in this framework records an assumption. The word appears nine times
across the spec and this catalog, every one of them as English prose inside a
paragraph about something else — a sentence in `environment.md` about
synchronous reads, a line in `telemetry/index.md` saying which paragraph to
revisit first. None of them is addressable, and none of them is checkable.

[ADR 0003](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds) closed the
ontology at nine kinds and deferred extension rather than forbidding it. It set
one bar for any new kind, and it is the right bar: *each candidate overlapped
something already present, and overlapping kinds produce catalogs where the same
fact is filed in two places by two authors.* Three kinds have since cleared that
bar — capability, journey and metric — and the set stands at eleven.

An earlier session considered assumptions and settled on a split: an
`## Assumptions` heading in the ADR body template, plus a field on entities.
That decision was never implemented, and this ADR argues it was the wrong one
before it becomes expensive to reverse.

## Decision

Add a twelfth kind, **`assumption`**, and one edge, **`assumes`**.

An assumption entity declares two fields beyond the common set:

| Field       | Type                                          | Required | Rule                                             |
|-------------|-----------------------------------------------|----------|--------------------------------------------------|
| `standing`  | `unverified \| holding \| broken \| retired`  | yes      | The belief's standing. Closed enum.              |
| `review-by` | ISO-8601 calendar date, `YYYY-MM-DD`          | yes      | When the belief must be re-examined.             |

`standing` is to an assumption what `decision-status` is to an ADR: a second
axis, about the *subject* rather than about the document, exactly as
`framework/spec/frontmatter.md` already splits `status` from `lifecycle`.

The bucket may sit in the solution, a product or a component — the same row as
`adr`, `requirement` and `metric`.

The `assumes` edge is authored by the dependent, never by the assumption:
source any kind, target `assumption`. This is the direction the rest of the
vocabulary already runs, and it is what makes the reverse index derivable
without any entity having to maintain a list of its own dependents.

## Consequences

- **The reverse index is the whole point, and it becomes a diagnostic.**
  `W_ASM_BROKEN_DEPENDENT` — *X still assumes Y, and Y's standing is `broken`* —
  is the rule this kind exists to make possible. Supporting rules are
  `E_ASM_STANDING`, `E_ASM_REVIEW_DATE`, `W_ASM_STALE` (a `review-by` in the
  past) and `W_ASM_ORPHAN` (an assumption nothing rests on, which is either dead
  weight or an unwired edge).
- **`assumption` joins the reserved-word list**, so any existing entity named
  `assumption` becomes illegal. There are none in any catalog here, and the cost
  of this is the reason ADR 0003 fixed the set before content was written.
- **The edge vocabulary grows by one**, which `framework/spec/frontmatter.md`
  already anticipates: the table is closed, and extending it is an additive spec
  change. Adding `assumes` is a row, not a redesign.
- **Twelve buckets is more vocabulary at the `ls` boundary.** ADR 0003's
  strongest consequence was that a reader needs no vocabulary beyond the bucket
  names; every kind added spends some of that. This is a real cost and it is
  paid, not argued away.
- **Three trees move together.** The spec gains `kinds/assumption.md` and a
  placement row in `structure.md`; the portal gains the kind in `srn.ts`,
  `frontmatter.ts`, `tree.ts` and a per-kind module; the plugin bundle's
  `add-entity` skill goes from ten mechanical kinds to eleven.
- **Retired is not deleted.** An assumption that stops mattering goes to
  `standing: retired` rather than leaving the tree, because the entities that
  assumed it are still on record as having done so.

## Alternatives considered

- **The locked split — an `## Assumptions` heading in the ADR body plus a field
  on entities.** Rejected, and this is the decision being reversed. Both halves
  are prose: neither is a node, so nothing traverses them, and no check can
  report that an invalidated assumption has fourteen dependents. The only reason
  to write an assumption down is to learn what breaks when it turns out false,
  and that is a reverse-index query. A heading answers it for a human who has
  already found the right document, which is the case where they did not need
  the catalog.
- **One kind covering assumption, constraint, risk and open question, split by a
  discriminator field.** Rejected, and it was the first proposal. A constraint is
  *true and imposed* — it fails when we violate it. An assumption is *believed
  and unverified* — it fails when reality contradicts it. One `standing` enum
  spanning both is incoherent, and every diagnostic downstream would branch on
  the discriminator, which is the discriminator doing kind-work. ADR 0003's own
  precedent applies: `product` and `component` stayed separate kinds despite both
  being things that get built, because their lifecycles differ.
- **Four kinds now — assumption, constraint, risk, open-question.** Rejected as
  premature. Evolution here is additive-only, so a second kind can be added later
  at a price this ADR measures, but a taxonomy cannot be un-shipped. Committing
  to four classifications before one has been used on a real catalog is the
  expensive direction of the asymmetry.
- **A `risk` kind specifically.** Rejected on merit rather than on timing. The
  architectural half of a risk register is an assumption with
  `standing: unverified`; the remainder is project ceremony that belongs in an
  issue tracker.
- **Nothing — leave assumptions as prose.** Considered seriously, because it is
  the status quo and it costs nothing. Rejected because the status quo is not
  "assumptions live in prose", it is "assumptions are not written down at all":
  nine incidental mentions across two solutions is not a record, and no reader
  can enumerate what this system takes on faith.

## Open questions

- Whether `review-by` should be REQUIRED or conditional on
  `standing: unverified`. Required is stated above because an assumption nobody
  has dated is the one that rots silently, but a `retired` assumption carrying a
  future review date reads oddly.
- Whether `supersedes` should be legal between assumptions, for a belief
  restated more precisely rather than broken.
