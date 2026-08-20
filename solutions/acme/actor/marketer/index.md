---
name: marketer
kind: actor
version: 1
title: Marketer
summary: Commercial owner who plans campaigns, authors promotions, and answers for what a discount cost.
status: approved
owner: team-growth
actor-type: human
goals:
  - Launch a campaign without asking an engineer to deploy anything.
  - See what a promotion has already cost before deciding to extend it.
  - Stop a promotion that is being abused within minutes, not within a release.
relations:
  uses:
    - /product/growth/component/campaign-manager
tags:
  - marketing
  - internal
---

A member of the commercial team who decides what acme offers and to whom. The
marketer is the only actor in this catalog whose ordinary working day changes
what a customer pays, which is why every write path they touch is described as a
reviewable surface rather than as an admin screen.

## Boundaries

- The marketer is never a component. They act through
  [campaign-manager](srn://acme/product/growth/component/campaign-manager); the
  authority to change prices lives in that component's authorization rules, not
  in this description.
- They are not a [merchant-operator](srn://acme/actor/merchant-operator). The
  merchant operator acts on behalf of a merchant selling through acme; the
  marketer acts for acme itself. The two share a screen in places and must still
  not be merged — their approval chains differ, and so does who pays for a
  mistake.
- Segment definitions are the marketer's to write and the
  [audience](srn://acme/product/growth/component/audience) job's to evaluate. A
  marketer never sees the individual accounts in a segment, only its size; that
  boundary is what keeps segment authoring outside the privacy review that
  individual targeting would require.

## Why the goals are phrased as speed

All three goals are about latency of *control*, not about capability. A
marketer could already do each of these by filing a ticket. The reason growth
exists as a product is that a promotion whose stop button takes a release is,
in practice, a promotion nobody dares to run — and the catalog should say that
plainly rather than describe a feature list.
