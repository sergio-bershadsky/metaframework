---
name: 0016-topology-format-deferred
kind: adr
version: 1
title: Defer the topology format, lock the criteria
summary: topology.yaml keeps its own format and no standard is adopted; the six criteria a replacement must satisfy are locked here, and the trigger to reopen is a consumer that generates a deployment.
status: review
owner: sergio-bershadsky
decision-status: proposed
date: "2026-08-21"
relations:
  uses:
    - /product/specification/datamodel/topology-document
    - /product/specification/component/kind-contracts
    - /environment/compose
    - /environment/local
    - /environment/production
tags:
  - topology
  - environment
  - interoperability
---

## Context

`topology.yaml` sits beside an environment's `index.md` and records where the
components of this solution run: named regions with their zones, one entry per
hosted component with a replica range, one sentence of scaling intent, and
notes. Its defining constraint is stated in `framework/spec/kinds/environment.md`
and is easy to lose sight of in a format survey — **it annotates members, it
never creates them.** Membership is authored on the component side as a `uses`
edge to the environment; the roster is derived from those edges, and a host
entry may only add placement detail to a component that already claimed the
target. A host entry for a component that did not is `W_ENV_HOST_UNDECLARED`,
deliberately a warning, because during a rollout the topology may lead the
component's own declaration by a commit or two.

Counted on disk at this commit: **7** `topology.yaml` files — 2 in `acme`, 2 in
`brass`, 3 in this solution — declaring **5** regions, **6** zone labels and
**21** host entries.

The question of which format belongs underneath became live rather than
academic when [0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects)
made every artifact declare its dialect as a URL. All 7 files now open with

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/topology-document
```

and the moment a dialect has a name, "should that name be somebody else's?" is a
question anybody can ask, cheaply, forever. The 0.2.0 research pass ran the
survey once (`docs/roadmap-0.2.0.md`, lane: topology). Without a record it would
be run again by the next reader of that header, from zero, on whatever
candidates were fashionable that quarter — and the reason a survey is expensive
is not the reading, it is that each re-run reaches its own conclusion.

### What the file is measured to be, before any candidate is judged

Three measurements decide the survey, and all three were taken against this
working tree rather than carried over from the research pass. Two of them moved
under this record while it was being written — the config-contract lane landed a
reader for both environment artifacts in the same release — and they are
restated here as measured, because a deferral justified by numbers that have
gone stale is a deferral nobody can check.

**One module reads it, and it is a validator rather than a consumer.**
`grep -rn topology framework/portal/src` returns **49** hits; **24** are outside
tests, and **20** of those 24 are one file:

| Site                             | What it is                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `lib/environment/environment.ts` | `parseTopology` and `hostJoins` — the executable copy of ENV4–ENV9, and 20 of the 24 hits |
| `lib/srn/artifacts.ts:45`        | the role-table row — `{ kind: 'environment', role: 'topology', … }`                       |
| `lib/catalog/dialects.ts:133`    | the dialect-table row added by 0015 — `'environment:topology': { … }`                     |
| `lib/catalog/index.ts:95`        | `withEnvironmentChecks`, folding the reader into the load pipeline                        |
| `lib/catalog/frontmatter.ts:200` | a comment about why environments are not folded into a frontmatter field                  |

The distinction the whole record turns on is that this reader **judges** the
file and emits nothing from it. It parses the document, reports findings against
the environment entity, and produces no artifact, no manifest and no deployable.
Nothing else in `framework/portal/src` opens a `topology.yaml`'s content.

**It is checked, as of this release, and completely.** The previous draft of
this record said all seven environment error classes sat in the debt register in
`framework/portal/src/lib/catalog/diagnostic-coverage.test.ts` with no emitter.
That is no longer true and the entry it describes no longer exists: the
environment section of that register is empty, `environment.md` v6 states
**eleven** codes rather than seven, and every one of them is emitted by
`lib/environment/environment.ts`. Four are this file's — `E_ENV_TOPOLOGY_SCHEMA`,
`E_ENV_REGION_UNKNOWN`, `E_ENV_TARGET_KIND` and `W_ENV_HOST_UNDECLARED` — and
the register's ratchet means they cannot quietly go back. Run over the catalog,
`metaframework check` reports **zero** environment diagnostics on all 7 files.

**Nothing deploys from it**, and this is the measurement that did not move. The
[devops](srn://metaframework/product/devops) product is `lifecycle: concept`,
and its
[0005-one-image-two-topologies](srn://metaframework/product/devops/adr/0005-one-image-two-topologies)
records the consequence from the other side: a compose file and a Helm chart,
"two descriptions of one graph, kept in step by hand". Nothing joins either of
them to these 21 host entries, so there is no drift check to preserve and no
generator whose input format is being chosen.

The last measurement is the one that changes what the artifact *is*. Across the
7 files, **12,358** bytes total (12,306 characters — the two differ because the
prose is full of em dashes, and this record means bytes where it says bytes):
**5,723** of them (**46.3%**) are the values of `notes` and `scaling`, and a
further **2,591** (**21.0%**) are YAML comments. **67.3%** of this artifact is
prose written for a reviewer. This solution's own `production` topology is the
extreme case and is worth reading before judging any candidate — 24 comment
lines out of 73, including a **16**-line block explaining why the portal is
deliberately *not* a host entry; `zones: []` with a note saying it is empty
"because there is no distribution to describe, not because it is unknown"; and a
`scaling` value that reads "none — scaling out is a correctness change, not a
knob: two replicas write the same mirrors on one volume". None of that is
annotation on the real content. It *is* the content.

## Decision

**`topology.yaml` keeps its own format. No industry standard is adopted for the
`topology` role.** The meta-schema
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
is what makes the dialect citable, and citable is what 0015 required — a
discriminator must name a grammar that exists, not one that is being shopped for.

This is a deferral and not a refusal, so the deferral is made checkable in the
only way that survives a change of reader: **the criteria are locked here, and a
future candidate is measured against them rather than against taste.**

### The six criteria

A format proposed for the `topology` role MUST satisfy all six. They are stated
with the concrete case that would fail each, because a criterion nobody can fail
is decoration.

**(a) The artifact stays environment-centric, and must never become a second
membership channel.** The subject of the document is the environment; host
entries are detail added to a roster derived from component-side `uses` edges. A
candidate whose placement statement lives on the *application* inverts the axis
and, worse, makes the file authoritative about membership — two places asserting
"checkout runs in production", drifting within a sprint, which is exactly what
the framework's inverse-edge rule exists to prevent.

```yaml
# fails (a): the application declares where it goes
kind: Application
spec:
  policies:
    - type: topology
      properties:
        clusters: ["eu-west-1"]
```

**(b) Topology states reviewable claims, so drift must be a warning and never a
broken deploy.** `W_ENV_HOST_UNDECLARED` is a warning by design. A candidate
whose document is executable — a compose file, a Kubernetes custom resource
reconciled by a controller — converts every one of those claims into desired
state, and then a topology that is one commit ahead of reality is not a review
note, it is an outage. A format may be *exportable* to a deployable; it may not
*be* one.

**(c) Replica ranges and region/zone declarations survive losslessly.** The
range is not decoration: **5** of the 21 host entries carry one
(`replicas: { min: 3, max: 24 }` on `acme`'s checkout), and the other 16 pin a
constant as `{ min: n, max: n }` — which is itself a claim that a range was
considered and closed. A candidate that models replicas as a single integer
deletes the difference between "between 3 and 24" and "exactly 3", and a
migration that deletes information has negative value however good the tooling
is. The same test applies to `regions` and `zones`: an empty `zones: []` and an
absent one are different claims in this format, and a candidate that cannot hold
both holds neither.

**(d) SRN referential integrity must be expressible.** ENV6 requires every
reference in the file to resolve to a `component` or `product` entity in this
catalog; ENV7 requires every region name in a host entry to be declared in the
file's own `regions` list. A candidate whose host entries point into its *own*
identity system — a node name, a workload label, a model element id — re-expresses
`component: /product/shop/component/checkout` against a second namespace, and the
join back to the component graph becomes a mapping table somebody maintains.
Both rules are implemented as of this release — `resolveTarget` and `deployable`
for ENV6, the declared-region set in `parseTopology` for ENV7 — which sharpens
this criterion rather than retiring it. When they were unimplemented, adopting a
format that could not express them cost a hypothetical check. Now it costs a
working one: `E_ENV_TARGET_KIND` and `E_ENV_REGION_UNKNOWN` are code that a
migration would have to delete, and deleting a check is a cost a format survey
must count.

**(e) Reviewer prose is first-class content, not an annotation.** 67.3% of the
bytes, measured above. A candidate that carries prose only in a `description`
string, or only in a documentation sidecar, does not lose formatting — it loses
the argument. A format that would silently drop the 16-line comment explaining
why the portal is not a host entry has failed this criterion even if it round-trips
every structured field perfectly.

**(f) The toolchain has shipping releases in the current year.** Not "the
standard is approved" and not "the repository has commits" — a published release,
this year. An approved specification with a dormant implementation gives us a
document to conform to and nothing that reads it, which is precisely the position
we are already in with a format we control and can change at will. This is the
one criterion whose verdict expires: it must be re-measured at the moment a
candidate is reconsidered, and the dates in this record are the evidence for when
it was last checked, not a standing result.

### The reopening trigger

**A devops component actually generating a compose file or a Helm chart from the
catalog.** That is the event, stated so it is checkable rather than felt: a
consumer that reads these 21 host entries and emits something a machine runs.

No such consumer exists today, and its absence is not an oversight —
[0005-one-image-two-topologies](srn://metaframework/product/devops/adr/0005-one-image-two-topologies)
looked at generating the chart from the compose file and rejected it, accepting
hand-maintenance as the cost. So the format question is not merely unanswered; the
shape of the consumer that would answer it is itself contested. When one exists,
the cost of a proprietary format stops being zero — it becomes a translator this
project writes and maintains — and criteria (a) through (e) are then measured
against a real emitter rather than against a hypothetical one.

**A validator is not that consumer, and this release is the test case for the
distinction.** `lib/environment/environment.ts` landed while this record was
being written: it reads all 21 host entries, resolves every reference against
the catalog and reports on what it finds. That is more code reading this file
than has ever read it, and it does not move the trigger by a day, because it
emits nothing a machine runs. The trigger was written as "a consumer that reads
these 21 host entries and emits something a machine runs" precisely so this case
would be decidable, and the first thing to arrive after it was written landed on
the "no" side. A trigger that a checker satisfies would have fired on a change
that answers none of the six criteria.

### What stays open, and what it does not touch

Two prototypes are worth running, and **neither adds a row to the role table nor
a dialect to the `topology` role** — so neither can change what a `topology.yaml`
is, whatever it finds:

- A **Structurizr DSL derived export** — a C4 deployment view generated from
  `topology.yaml` plus the component graph. A derived view is not a dialect, so
  it needs no row and no migration.
- A **Score `score.yaml` as a component-side sibling inside the devops product
  only**, to test ADR 0005's "one artifact set, two topologies" claim against
  `score-compose` and `score-k8s`. It is a component-side workload spec and
  therefore cannot be this role's format (see (a)); as a separate experiment
  under one product it is not that.

Either would need its own decision before landing anything addressable. This
record does not pre-approve them; it records that they were the two candidates
worth an experiment rather than a migration.

## Consequences

- **The framework owns the format, including its holes, and nobody else will fix
  them.** Two are known and both are outside stock 2020-12: `min` ≤ `max` cannot
  be expressed by comparing sibling properties, so the spec's own counter-example
  `replicas: { min: 5, max: 2 }` is a document the published meta-schema still
  accepts; and `zones: []` versus an absent `zones` is a distinction a validator
  cannot see. Owning the format is also what let the first of those be closed
  outside the schema — `parseTopology` refuses `min > max` naming both numbers —
  and that is the trade in both directions: the rule is enforced for anybody
  loading this catalog and not for anybody handed the published meta-schema
  alone. Adopting a standard would not have fixed either hole — the survey found
  no candidate that expresses both — but a deferral means they stay ours.
- **Deferring the format is not deferring the checks, and the two must not be
  confused.** This consequence was written when all seven environment error
  classes were unemitted, as an argument that the deferral must not become the
  reason they stayed that way. They landed in the same release as this record:
  the environment section of the debt register is empty, and eleven codes fire.
  The consequence stands with its subject changed — "we are waiting on a
  standard" is exactly the sentence that would have kept ENV4 in the register
  indefinitely, and the fact that it did not is the evidence for writing the
  trigger as a consumer rather than as a format.
- **The criteria are now the thing that can be wrong.** A future proposal argues
  against six sentences rather than against a survey, which is the point; but if
  one of the six is a mistaken claim about what this artifact is for, it will
  reject a good candidate. The remedy is ordinary — a successor ADR with a
  `supersedes` edge — and it is much cheaper than the alternative it replaces,
  which is re-running the survey and reaching a fresh conclusion each time.
- **Criterion (f) is a moving target on purpose.** TOSCA 2.0 fails it today on
  tooling, not on data model; a release next year flips that without one word of
  the standard changing. Recording the verification dates rather than a verdict
  is what makes the re-check a measurement instead of an argument.
- **`W_ARTIFACT_DIALECT` reports nothing on this role, and keeping the format
  keeps that true.** All 7 files carry the header naming `topology-document`.
  Adopting a standard later means a second recognised dialect landing beside this
  one under the same filename — additive, per 0015 — so nothing in this deferral
  makes a future migration more expensive than it would have been.
- **The survey has a shelf life and says so, and the internal half has the
  shorter one.** Every external fact below carries the date it was checked, and a
  reader in 2028 must re-measure (f) before quoting any row of it. Criteria (a)
  through (e) are claims about this catalog, and this record is its own worked
  example of how fast those move: the environment kind went from v4 to v6 and
  gained a checker between the drafting of this ADR and its landing, which
  falsified the grep count, the "nothing checks it" measurement and the
  implementation status under (d) — none of which changed the decision, and all
  of which had to be re-measured before it could be trusted. Re-measure the
  internal numbers whenever this record is quoted; they are cheap, and a stale
  one is indistinguishable from a wrong one.

## Alternatives considered

Every candidate was re-verified at this commit; the criterion named is the first
one it fails, not the only one.

| Candidate                | First criterion failed  | Verified 2026-08-21                          |
| ------------------------ | ----------------------- | -------------------------------------------- |
| Docker Compose `deploy:` | (c) lossless ranges     | compose-spec schema; `docker/compose` v5.5.0 |
| OAM / KubeVela           | (a) environment-centric | KubeVela v1.11.0, released 2026-07-20        |
| Radius                   | (a) environment-centric | Radius v0.60.0, released 2026-08-19          |
| TOSCA 2.0                | (f) shipping toolchain  | OASIS Standard 2025; tooling below           |
| Structurizr DSL / C4     | (d) SRN integrity       | structurizr v2026.06.28, 2026-06-29          |
| Score                    | (a) environment-centric | score-compose 0.45.0, 2026-07-25             |

- **Docker Compose `deploy:` as the topology format.** Rejected on (c), and the
  rejection is arithmetic rather than judgement. The compose specification types
  `replicas` as `{"type": ["integer", "string"]}` — one number, the string form
  being for interpolation — and defines it as "the number of containers that
  should be running at any given time". The whole `deploy` key is `endpoint_mode`,
  `labels`, `mode`, `placement`, `replicas`, `resources`, `restart_policy`,
  `rollback_config`, `update_config`: no range, no region, no zone.
  `placement.constraints` and `placement.preferences` reach node labels, which is
  a scheduler hint and not a declared region list an ENV7 check could resolve
  against. So `acme`'s `replicas: { min: 3, max: 24 }` becomes `replicas: 3` or
  `replicas: 24` and the claim is gone — 5 of 21 entries lose their content. It
  fails (b) as well, for the reason a compose file is useful at all: it is
  executable, so the same bytes that were a reviewable claim become an
  instruction. A migration whose net effect is deleting information has negative
  value however convenient the tooling is.
- **OAM and KubeVela.** Rejected on (a). Placement in OAM is a `topology` policy
  declared inside the application:
  `apiVersion: core.oam.dev/v1beta1`, `kind: Application`, `spec.policies[].type:
  topology`, with `clusters: ["local"]` or `clusterLabelSelector: { region:
  hangzhou }`. The subject of that document is the application, so the
  environment stops being the thing described — and an Application naming its
  clusters is an *authoritative* membership statement, which is precisely the
  second channel the environment kind forbids by name. It fails (b) besides: the
  document is a Kubernetes custom resource that a controller reconciles, so
  adopting the format means adopting the control plane. KubeVela is healthy —
  v1.11.0 released 2026-07-20 — so it passes (f) comfortably and loses on the
  axis, which is the honest reason and the one worth recording.
- **Radius.** Rejected on (a) and (b) for the same reasons, with one dependency
  more: Radius Environments and Applications are served by the Radius Universal
  Control Plane, which runs on Kubernetes, so the format arrives with a runtime
  attached. It is the most actively released candidate surveyed — v0.60.0 on
  2026-08-19 — and that changes nothing about the axis. Recording it here is
  worth the lines precisely because "it is very active" is the argument that will
  be made for it next.
- **TOSCA 2.0.** The only candidate whose data model is a genuine superset of
  this format — node templates, requirements and capabilities, and a topology
  template that is environment-shaped rather than application-shaped. It was
  approved as an OASIS Standard in 2025. Rejected on (f), and not narrowly:
  xOpera's last release is 0.7.0 (2022-09-26) and its last commit 2022-12-27;
  Yorc is archived, last released 2022-03-11; Alien4Cloud has not been pushed
  since 2023-02. The liveliest implementation, Puccini, migrated to Codeberg —
  its GitHub repository's final commit is literally "Migrate to Codeberg" — and
  the Codeberg repository was updated as recently as 2026-08-20, but it has
  published **no releases at all**, and its newest tag is `v0.0.4`, dated
  2025-11-11. Adopting a standard whose only living toolkit has never cut a 0.1
  buys a specification to conform to and no reader, which is the position this
  catalog is already in with a format it controls and can change. This is the
  candidate most likely to pass on a re-check, and (f) is the only criterion
  standing between it and adoption.
- **Structurizr DSL / C4 deployment views.** The one candidate whose semantics
  actually match, which is why it earns a longer entry than the ones that lose
  outright. `deploymentEnvironment "Production"` makes the environment the
  subject, satisfying (a); `instances` on a `deploymentNode` "can either be a
  static number, or a range (e.g. `0..1`, `1..3`, `5..10`, `0..N` …)", which is
  criterion (c) met exactly and by no other candidate; nothing deploys from a
  Structurizr model, so placement stays a claim and (b) holds; and the toolchain
  ships — the consolidated `structurizr/structurizr` repository released
  v2026.06.28 on 2026-06-29, with the older `java`, `cli` and `lite`
  repositories now archived and last pushed 2026-02-01. It is rejected as a
  **migration** on (d) and (e). A `containerInstance` points at an element of a
  Structurizr model,
  not at an SRN, so ENV6 and ENV7 would be re-expressed against a second identity
  system and the join back to the component graph becomes a mapping somebody
  maintains by hand. And its prose carriers — `description` strings and `!docs` —
  are not built to hold 67% of a file. What it is right for is a **derived
  export**: generate the C4 deployment view *from* `topology.yaml` and the
  component graph, which keeps one authority, costs no role-table row, and is the
  prototype left open above.
- **Score.** Rejected on (a), and the rejection is structural rather than
  circumstantial: a `score.yaml` describes what one workload needs, and
  `score-compose` / `score-k8s` project it onto a runtime. It is the
  component-side artifact by construction, so adopting it for the `topology` role
  is the axis inversion again, in a smaller package. Where it is genuinely
  interesting is the question ADR 0005 already has — one artifact set, two
  topologies — which is why it survives as a component-side prototype scoped to
  the devops product and nowhere near the environment kind. One caveat for
  whoever runs it: `score-helm` is deprecated by its own README, which reads "We
  have deprecated the `score-helm` CLI implementation. To get started with Score,
  we recommend using one of our reference implementations `score-compose` or
  `score-k8s`" — so the chart half of ADR 0005 is not covered, and a prototype
  that only exercises compose and raw Kubernetes should say so rather than imply
  the pair is tested.
- **Leaving the survey in the roadmap and adopting nothing.** The status quo, and
  it is the alternative this record actually replaces. Rejected because a roadmap
  is a plan: `docs/roadmap-0.2.0.md` is superseded by the 0.3.0 plan and the
  survey evaporates with it, while the `$schema` line naming a framework-owned
  meta-schema stays in all 7 files and keeps prompting the question. Deferring a
  choice and recording nothing is not deferring; it is guaranteeing the work is
  redone.
- **Choosing a format now, so that the eventual consumer is cheap.** The
  strongest argument against this decision, and it is a real one: adopting a
  standard before a generator exists means the generator is written against
  something with an ecosystem instead of against a proprietary shape. Rejected on
  the specific facts rather than in principle. The consumer's shape is not merely
  unknown — ADR 0005 considered generating one artifact from the other and turned
  it down, so choosing now means choosing against a consumer whose existence is
  contested and whose input requirements are guessed. And the cost of choosing
  later is bounded by 0015: a second dialect lands beside this one under the same
  filename, warned and never broken, with no address moving. Standardising early
  is cheap only when the migration is expensive, and 0014 and 0015 are exactly
  what made this one cheap.
