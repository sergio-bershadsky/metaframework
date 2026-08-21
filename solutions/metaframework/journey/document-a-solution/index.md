---
name: document-a-solution
kind: journey
version: 3
title: Document a solution
summary: A person's path from an empty directory to a described system — spec, kit, model, and the one page that says whether any of it is legal.
status: review
owner: sergio-bershadsky
actor: /actor/catalog-author
relations:
  uses:
    - /environment/local
tags:
  - authoring
  - cross-product
---

The path this repository was built to make possible, walked by the person it was
built for. Somebody who owns a system and has nothing written down arrives at the
specification, is interviewed by a skill, hands the writing to a model, and ends
up on a page that tells them what their catalog breaks. It crosses all three
products — [specification](srn://metaframework/product/specification),
[authoring-kit](srn://metaframework/product/authoring-kit),
[portal](srn://metaframework/product/portal) — in that order, which is also the
reading order this solution's own `index.md` prescribes.

Two of those crossings are hand-offs, and neither is automated. That is the
finding this journey exists to make visible.

## Outcome

A solution directory exists, its entities load, and the reader knows which rules
the catalog breaks — with the file and the fix — without having read the loader.

## Preconditions

None in software. The person needs a repository and a Claude Code session with
the plugin installed; there is no account, no service, and no deployment
anywhere in this solution
([local](srn://metaframework/environment/local) is the only environment).

What they do **not** need is to have read the specification. `steps[0]` is in the
list because a first-time author is told to read `structure.md` and `srn.md`
before choosing a path, and because placement is the one mistake this framework
cannot forgive: a moved entity is a swap, not an edit
([additive-only-evolution](srn://metaframework/requirement/additive-only-evolution)).
An author who skips it still reaches `steps[1]`; they simply reach `steps[4]`
with more to fix.

## Both crossings are carried by the person

`steps[1]` and `steps[4]` change product and both say `protocol: none`. That is a
claim, and it is the accurate one:

- **specification → authoring-kit.** The person reads a document and then types
  `/solution-new`. Nothing passes between the two products; the plugin does not
  read `framework/spec/` at that moment and would not find it if it were
  installed anywhere but here
  ([kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec)).
- **authoring-kit → portal.** The kit's own skills end on the portal's check, and
  its [plugin](srn://metaframework/product/authoring-kit/component/plugin)
  declares a real `depends-on` edge to
  [catalog-loader](srn://metaframework/product/portal/component/catalog-loader).
  What crosses is a command a person types and files already on disk. There is
  no conversation to describe.

`none` here is narrow and deliberate. It says nothing travels between the
products at that moment. It does **not** say the coupling is absent — the
`depends-on` edge above is real, and the kit contains stale claims about the
portal precisely because nothing carries a fact from one to the other. A protocol
would not fix that; a check comparing the two would, and there is none.

## Why the fourth step belongs to the model

`steps[3]` is the only step the protagonist does not take. It is written out
rather than folded into the step before it because the person's contribution ends
at the sign-off gate: they approved a tree of SRNs, and the sentences that end up
in `summary` and in the body are the model's. A reader skimming the actor column
should stop there, because that is the boundary of what the human in this journey
actually authored.

## Where the ontology strains

There is no step for **committing**. [git](srn://metaframework/actor/git) is an
actor in this solution, review is git-native by decision
([0012-review-is-git-native](srn://metaframework/adr/0012-review-is-git-native)),
and a described solution is not really documented until it is in a commit — but a
`touches` target must be a component or a product, and the git binary is neither.
The step would have to point at
[git-history](srn://metaframework/product/portal/component/git-history), which is
the portal *reading* history and not the author writing it. Rather than
manufacture the step, the path stops at the page.

## Out of scope

Changing an entity that already exists. That is the `evolve-entity` skill's
path ([plugin](srn://metaframework/product/authoring-kit/component/plugin))
and it has a different outcome — additive edit or swap — so by the
no-branching rule it is a different journey, and it is not written down yet.

Judging the result. `steps[5]` ends on a page, not on a verdict; the audit is
[audit-a-catalog](srn://metaframework/journey/audit-a-catalog), which starts
roughly where this one stops.
