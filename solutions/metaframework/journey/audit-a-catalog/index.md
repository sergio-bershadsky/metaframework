---
name: audit-a-catalog
kind: journey
version: 3
title: Audit a catalog
summary: A reviewer's path through the portal to a judgement — five surfaces, one crossing out of the product, and a loop that never closes.
status: review
owner: sergio-bershadsky
actor: /actor/reviewer
relations:
  uses:
    - /environment/local
tags:
  - review
  - cross-product
---

Somebody opens a catalog they did not write and works out two things: what this
system currently is, and whether the last change to it was an improvement. Five
of the six steps are inside [portal](srn://metaframework/product/portal), which
is accurate — the portal is the product this solution's directive is about, and
almost every design choice in it answers a question this actor asks.

The sixth step is the interesting one. It leaves the product, because the
question a reviewer most wants answered is the one the portal has no surface for.

## Outcome

The reviewer can say what the system is, can point at the decision that explains
any structure they found, and knows which rules the catalog breaks. They cannot
say, from the portal alone, whether the description is a good one.

## Preconditions

A catalog on disk and a running portal. Not a git repository —
[catalog-renders-without-git](srn://metaframework/product/portal/requirement/catalog-renders-without-git)
makes `steps[3]` the only step that can degrade, and it degrades into a stated
reason rather than an error page. A portal running from a tarball, a shallow
clone, or an image with no git binary still walks `steps[0]`, `[1]`, `[2]`, `[4]`
and `[5]` unchanged.

## The one crossing, and why it is `protocol: none`

`steps[5]` goes from portal to
[authoring-kit](srn://metaframework/product/authoring-kit), and the person
carries it: they close the browser and ask a model to run the `review-solution`
skill of the kit's
[plugin](srn://metaframework/product/authoring-kit/component/plugin).
There is no link, no button, and no handoff of any kind: grepping
`framework/portal/src` for `marketplace`, `entity-new` or `catalog-check` returns
nothing, so the portal has never mentioned the plugin to anybody.

That hop is where the solution's own split between legality and quality becomes a
physical gap in the journey. `validate-catalog` asks "is it legal?" and its answer
is on `steps[4]`; `review-solution` asks "is it any good?" and its answer is in
another product, another interface, and another actor's hands. The two questions
were separated deliberately and nothing was built to carry a reader between them.

## What `steps[3]` does not use

The version picker is a **server-side** call into
[git-history](srn://metaframework/product/portal/component/git-history), not a
conversation over
[catalog-history](srn://metaframework/product/portal/protocol/catalog-history).
That protocol is fully specified on both sides and spoken by nobody: its
initiator,
[history-panel](srn://metaframework/product/portal/component/console/component/history-panel),
is 507 lines of working client that nothing renders — measured 2026-08-20 over
`src/components/history/history-panel.tsx`. A journey step naming that protocol
would describe a hop that has never happened, which is exactly the kind of claim
this catalog is written not to make.

## The loop this journey does not close

It ends on a judgement held in one person's head. There is no pull-request
template, no `CODEOWNERS`, no `.github/` directory, and no CI check anywhere in
the repository; `git log --merges` returns nothing. So nothing records that this
path was walked, nothing blocks a change because it was not, and the reviewer's
finding has no destination in the catalog at all. That absence is on the record
as [review-first-change](srn://metaframework/requirement/review-first-change)
rather than left to be discovered by somebody assuming the loop exists.

`steps[4]` carries the same shape in miniature: the diagnostics page is the
integrity gate, and reaching it is voluntary. Nothing in `steps[0]` through
`steps[3]` mentions it.

## Out of scope

Fixing anything. A reviewer who finds a defect becomes a
[catalog-author](srn://metaframework/actor/catalog-author) and walks
[document-a-solution](srn://metaframework/journey/document-a-solution) or asks a
model to walk
[author-an-entity](srn://metaframework/journey/author-an-entity); that is a
different outcome and therefore a different path. In this repository it is the
same person on the same day, which is recorded on
[reviewer](srn://metaframework/actor/reviewer) rather than implied by two actor
pages nobody can tell apart.
