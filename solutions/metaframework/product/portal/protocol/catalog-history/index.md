---
name: catalog-history
kind: protocol
version: 2
title: Catalog history
summary: The four-operation conversation between the history panel and /api/history — fully implemented on both sides, and held by nobody.
status: review
owner: sergio
style: request-response
participants:
  - alias: history-panel
    ref: /product/portal/component/console/component/history-panel
    role: initiator
  - alias: history-service
    ref: /product/portal/component/history-service
    role: responder
tags:
  - http
  - history
---

A protocol whose initiator and responder both exist, both compile, and never
speak to each other, because nothing renders the initiator.

## Placement

The participants are `component/console/component/history-panel` and
`component/history-service`. Their common `{kind}/{name}` pair prefix is
`product/portal` and no more — they diverge at the second pair — so the protocol
sits in the product's bucket rather than inside either component. The pairwise
rule is what makes that answer an addressable entity instead of the bare
`component` bucket the segments happen to share.

## Why it is modelled at all

Because it is the honest shape of the code. `history-panel.tsx` (458 lines) and
`diff-view.tsx` (217) are the only client of `/api/history` in the repository;
nothing imports them. The service answers four operations correctly. Both halves
of a working conversation are present and unwired, and a catalog that left this
out would describe a system in which the endpoint has no purpose, which is a
worse description than one saying it has no caller.

The entity page's own history feature — the version picker and `?v=N` — does not
use this protocol. It calls
[git-history](srn://metaframework/product/portal/component/git-history)
server-side, on purpose, so that a historical view is a shareable URL. This
conversation is what a *client-side, on-demand* history panel would hold, and it
is deliberately lazy: an entity page renders without touching git, and only a
reader who asks for the past pays for a subprocess.

## Artifacts

`transport.yaml` declares `kind: http`, `base-path: /api/history`, and the four
operations. Every one of them is `GET` on the same path — the operations are
distinguished by an `op` query parameter, and the transport mini-spec's
operation object has no field for query parameters. Rather than force one, each
entry carries the parameter in an `x-op` key, which is what the `x-` escape
hatch in the artifacts is for.

There is no `states.json`. Four independent reads have no conversation state.

## The datamodel that is deliberately absent

The route returns one of four envelopes — `{op, history}`, `{op, commit,
files}`, `{op, revision}`, `{op, diff}` — whose shapes are `EntityHistory`,
`FileRevision` and `FileDiff` from `lib/history/git.ts`. That crosses a real
HTTP boundary, which is the usual argument for a `datamodel` with
`usage: exchange`.

It is still not one. There is no schema artifact for it, no consumer outside
this process, and its sole client is unmounted. Cataloguing a route's return
type would be the "every interface is a datamodel" failure; the operation list
above carries what a reader needs, and the TypeScript types carry the rest.
