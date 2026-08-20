---
name: 0013-a-second-solution-surveyed-from-real-code
kind: adr
version: 1
title: The second catalog is surveyed from real code, not invented
summary: A fixture written to exercise the ontology cannot falsify it, so the second solution describes a repository nobody wrote for this framework — and the prose records every place the model strained.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/specification/component/kind-contracts
tags:
  - ontology
  - method
  - fixture
---

## Context

`solutions/acme` was invented. It exists so that every kind, every enum value,
every edge type and every artifact format has at least one instance for the
portal to render and for the spec's worked examples to point at. That makes it
an excellent test of the renderer and no test at all of the model: a catalog
written to fit an ontology cannot tell you the ontology fits anything.

The pressure was concrete rather than philosophical. The ontology had just been
closed at nine kinds with no escape hatch
([0003-closed-ontology-of-nine-kinds](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds)),
each kind's enums closed with it, and the only evidence for either was a
catalog authored by the same person, in the same week, to demonstrate them.

## Decision

Describe a second, real repository as a solution: an online implementation of
the board game *Brass: Birmingham*, surveyed from its source rather than from a
design document. The rule for the survey was that where the repository does
something the ontology has no clean word for, **the prose says so rather than
forcing the fit**.

Landed as commit `ec0f4be`, "feat(brass): describe the brass repository as a
solution" — 148 files, 10,768 insertions, 98 entities, under
`solutions/brass/`, which is where every count below can be checked. Its own
commit body states the purpose: "acme is a fixture and can be shaped to exercise
the ontology; this one could not, which is the point of having it — it is the
first evidence that the model survives contact with software somebody actually
wrote."

The second catalog is a *sealed universe* like any other
([0001-sealed-solution-universes](srn://metaframework/adr/0001-sealed-solution-universes)),
so nothing in this solution may reference it by SRN, and nothing below does. It
is a directory on disk and an external fact about the repository, cited by path
and never by `srn://`.

## Consequences

### What it proved

- **No tenth kind was needed.** 98 entities landed across all nine: 30
  datamodel, 18 requirement, 17 component, 17 adr, 5 protocol, 5 actor, 3
  environment, 2 product, 1 solution. That distribution is not acme's — acme is
  31 datamodel, 19 component, 15 requirement, 9 protocol, 9 adr, 8 actor, 5
  product, 2 environment — and nobody designed either. Two independently-shaped
  catalogs fitting the same nine buckets is the only argument for the closure
  that is not circular.
- **The fixture's enum coverage turned out to be biased, and the survey is what
  showed it.** `component-type` has seven values. Across acme's 19 components,
  `ui` appears **zero** times; the real repository's 17 components are 7 `ui`,
  5 `library`, 2 `service`, and one each of `job`, `gateway`, `external`. An
  invented backend-shaped catalog exercised the backend-shaped half of the enum
  and nothing noticed until there was something to compare it against.
- **The NCA placement rule survived a case a fixture would not have produced.**
  Three of the second solution's five protocols sit at its solution root,
  because its second product participates in every surface the first one offers,
  and the consequence is stated plainly on its own solution page: the first
  product exposes no protocol that is only its own. A fixture author writes one
  protocol per product because it reads better; the rule only gets tested by an
  architecture that did not care how it read.
- **It changed a portal decision.** `docs/decision-record.md:442`, the mermaid
  amendment, names "the brass action-composition chart with 30 edge labels" as
  one of the two charts whose residual label collisions ended the custom React
  Flow renderer. `framework/spec/kinds/datamodel.md:268` records a schema-bundle
  measurement taken against one of its schemas — 10 documents, 12 refs, 0
  filesystem reads. Both citations landed within half a minute of the survey
  commit (commits 47 and 49 of 52), which is the honest picture: the survey and
  the decisions it fed were one session's work, not a description written after
  the fact.

### Where the model strained, in its own words

- **`transport.kind` has no value for stdio JSON-RPC.** The closed enum is
  `http | grpc | amqp | kafka | websocket | in-process`. The MCP surface takes
  `in-process` as the nearest neighbour — subprocess of the host, no network
  hop, no addressable endpoint — records the truth in `x-wire: stdio-jsonrpc`,
  and carries a four-line comment at the top of the file explaining the
  compromise. That is simultaneously the `x-` escape hatch working exactly as
  designed and the enum being wrong, and both readings are true.
- **The component kind has no field for "which package is this".** The survey
  reached for `x-package` on 5 components. acme, independently, reached for
  `x-runtime` on 11. The same hole, found twice, by two catalogs that share no
  content: a component's implementation identity is something every author wants
  to state and the kind does not offer. Neither catalog invented a field; both
  used the escape hatch, and the escape hatch is ignored by the portal, so the
  fact is unrenderable in both.
- **A missing thing had to be described by refusing to model it.** Match state
  in that repository is a `Map` inside the server process. There is no
  `datastore` component, because inventing a persistence tier would fabricate a
  layer that does not exist; the two facts that follow — one replica, and every
  deploy ending live games — are recorded as a property of the server, an ADR and
  a `must` requirement. The catalog has no way to say "this layer is absent and
  its absence is load-bearing" except in prose, and that is what it did.
- **`component-type: external` held.** The third-party game framework is
  modelled as a component and not an actor for a mechanical reason — `depends-on`
  and `uses` accept components and never actors — and `external` exists for
  exactly that. Recorded here as a strain that turned out not to be one.

### What it did not prove

- **One repository, one describer.** The survey removes the "shaped to fit"
  objection and not the "one author" one. This repository's 52 commits carry a
  single committer and zero merges, and the described catalog's own solution
  page lists the same handle as both architect and maintainer of the system it
  describes. Nothing in that system was changed by being described, and no
  maintainer disagreed with a claim, because there was no second maintainer.
- **Nothing was measured about authoring cost.** 10,768 lines in one commit
  says nothing about how long a survey takes, how much of it a model can do, or
  how much of it a reader would have accepted.

## Alternatives considered

- **A second invented fixture** — `acme-2`, deliberately awkward, with the
  stdio transport and the missing datastore designed in. Rejected: an awkward
  case invented after the ontology closed is still invented. The whole value of
  the finding is that nobody chose stdio JSON-RPC in order to embarrass the
  transport enum.
- **Extend acme with the awkward cases instead of adding a solution.** Rejected
  for the same reason, plus a structural one: acme is the catalog the spec's
  worked examples cite by path, so bending it to expose gaps would have made the
  spec's own examples describe a system nobody would build.
- **Survey a repository the author did not write.** The better test, and
  rejected on cost. The standard in this repository is that every claim is
  anchored to a file, a line or a command, which requires reading the code to
  that depth; an unfamiliar codebase multiplies that by the cost of learning it
  first. Recorded as the next test rather than as a rejected idea.
- **Ship v1 on acme alone.** Rejected. Closing a vocabulary on the evidence of
  a catalog written to fit it is circular, and the closure was already made
  ([0003](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds)) — so the
  choice was between finding the strains before v1 or having them reported by
  the first outside author.
