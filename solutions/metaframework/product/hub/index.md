---
name: hub
kind: product
version: 1
title: Hub
summary: A hosted, GitHub-backed deployment of the portal — many repositories, any branch, read at a URL by a team instead of on one laptop.
status: review
owner: sergio
lifecycle: concept
primary-actors:
  - /actor/reviewer
  - /actor/operator
relations:
  depends-on:
    - /product/portal
  realizes:
    - /capability/shared-catalog-access
tags:
  - hosted
  - github
  - deployment
---

**Nothing described on this page exists.** There is no `docker/` directory, no
Helm chart, no OAuth registration and no server in Helsinki; `lifecycle:
concept` is the accurate value and every component below is `planned`. This is a
design written before the code, which is the case the framework was built for —
[component.md](srn://metaframework/product/specification/component/kind-contracts)
calls an approved description of an unbuilt thing "the design-first normal
case". Read it as a proposal to be argued with, not as a description of a
system.

The shape: a browser reaches one address, signs in with GitHub, picks a
repository and a branch, and reads that branch's catalog. Behind it, mirrored
git state on a volume, a worktree per branch, the portal rendering it unchanged,
and OpenTelemetry into a SigNoz that runs on the same box.

## Why this is a product and not a component of portal

The question is worth answering in full, because the cheap answer is wrong in an
interesting way.

The cheap answer is that this is *the portal, deployed*, and a deployment is not
a product — it is an [environment](srn://metaframework/environment/production)
plus a delivery mechanism. If the whole content were a Dockerfile and a chart,
that answer would be right and inventing a fourth product would be inflation. I
argued it that way first and abandoned it.

What tips it over is the GitHub half. A thing that holds installation tokens,
writes git state to a disk it owns, decides which branch a request may see, and
evicts worktrees on a timer is **new behaviour with new state and a new security
surface** — not packaging of a read-only renderer. The spec puts the ownership
line at the product
([product.md](srn://metaframework/product/specification/component/kind-contracts):
"the unit that is *delivered*, *funded*, and *owned*"), and every one of the
three separates here: this is delivered as a chart to a cluster rather than as a
tarball to npm, it is the first thing in this repository with a recurring bill,
and somebody is answerable when it is down, which is true of no other entity in
this catalog.

The decisive test is what nesting would do to the page above it.
[portal](srn://metaframework/product/portal) currently says it "reads
`solutions/` and `.git/` and writes nothing" and that its only environment is
[local](srn://metaframework/environment/local). Both statements are load-bearing
and both would become false if this subtree hung underneath it. The spec's own
instruction for that situation is explicit — "A product needing something
another product owns states `depends-on` and gets it by reference; it never
absorbs it" — so `hub` `depends-on` `portal`, and the portal's page stays true.

**What would falsify this.** If, once built, this product turns out to be a
chart plus fifty lines of routing glue, it was a component and this page was
wrong. The honest tell is the size of
[repo-sync](srn://metaframework/product/hub/component/repo-sync): if git
mirroring, worktree materialisation and token custody collapse into something a
reviewer reads in one sitting, fold the whole subtree back under portal and
deprecate this product. Nothing here has been approved, so that reversal is
currently free.

## The name, which is the part most worth overriding

`hub` says "one address where many catalogs meet" and says nothing else. That is
its defect as well as its virtue: it hides that this product is coupled to
GitHub specifically, to containers specifically, and to SigNoz specifically —
and hiding a coupling behind an agnostic-sounding name is exactly the criticism
that [authoring-kit](srn://metaframework/product/authoring-kit) earned when it
was named as a general authoring tool while being a Claude Code plugin.

The mitigation chosen is structural rather than lexical: the GitHub coupling
gets its own component
([github](srn://metaframework/product/hub/component/github)) and its own
decision record
([0003](srn://metaframework/product/hub/adr/0003-a-github-app-not-an-oauth-app)),
so a reader meets it in the tree rather than discovering it in paragraph four.
The alternatives were `hosted-portal`, which pre-decides the "it's just a
deployment" argument this page rejects, and `github-catalog-host`, which is
accurate and unusable. If the name is wrong, it is cheap to change now and
expensive after review.

## How this decomposes

Three components are ours and two describe systems we do not own. The density is
deliberately matched to
[portal](srn://metaframework/product/portal), which carries thirteen components
over 23,277 lines — roughly 1,800 lines apiece. An earlier draft of this page
had seven components for a product whose novel code is a syncer, a router and
some instrumentation, which would have been four times more granular than its
own sibling. Inconsistent decomposition density across one solution is the
defect; a number is not.

- [repo-sync](srn://metaframework/product/hub/component/repo-sync) — the git
  state. Authenticates to GitHub, mirrors repositories, materialises a worktree
  per branch, evicts idle ones. Everything that writes to the volume.
- [catalog-router](srn://metaframework/product/hub/component/catalog-router) —
  the edge. Terminates the session, maps a URL to a catalog root, fronts the
  portal.
- [telemetry](srn://metaframework/product/hub/component/telemetry) — the
  OpenTelemetry instrumentation, compiled into the processes above.
- [github](srn://metaframework/product/hub/component/github) and
  [signoz](srn://metaframework/product/hub/component/signoz) — `external`, because
  they are systems this solution does not own but must draw edges to.

The deployment artifacts are **not** components. A compose file and a Helm chart
are placement and configuration, and the ontology already has a home for both:
`topology.yaml` and `config.yaml` beside an
[environment](srn://metaframework/environment/production). Modelling them as a
component would have needed a `component-type` the enum does not have — there is
no value for "a packaging artifact" — and the correct response to that gap is to
use the kind that fits rather than to force one that does not.

## This product cannot be built without changing portal

Stated here rather than left to be discovered. The portal's catalog root is
process-wide: `catalogDir()` in
`framework/portal/src/lib/catalog/index.ts:21` reads `process.env.CATALOG_DIR`,
and `loadIfChanged()` holds exactly one cached catalog. One process therefore
serves exactly one catalog, and this product's whole proposition is many.

[0002-the-catalog-root-becomes-a-request-value](srn://metaframework/product/hub/adr/0002-the-catalog-root-becomes-a-request-value)
records the three ways out and which was chosen. The consequence to carry away
is that a `depends-on` edge here implies an additive change *there*, in a
product this work was told not to restructure. So
[catalog-router](srn://metaframework/product/hub/component/catalog-router)
declares `depends-on` straight at
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader)
rather than at the portal in general: the obligation then appears in that
component's derived inbound list, where somebody maintaining it will meet it,
instead of living in a paragraph nobody greps.

## What is deliberately not here

- **No multi-tenancy beyond GitHub's own.** Who may read a repository is
  whatever GitHub says; this product stores no permission of its own and has no
  concept of a team, a role, or an invitation. That is a real limitation and it
  is the reason the security surface stays small enough to describe.
- **No write path.** The portal is read-only and this does not change that.
  There is no editing, no commit, no PR, no comment. A reviewer who wants to
  change something goes to GitHub.
- **No build of the catalog.** Nothing is pre-rendered per branch and no output
  is cached across restarts beyond the git objects themselves.
- **One region, one machine.** [production](srn://metaframework/environment/production)
  is a single Hetzner instance in Helsinki. There is no failover, no replica and
  no data of record — losing the volume costs a re-clone.
- **No SLO.** Consistent with every other environment this solution declares.
