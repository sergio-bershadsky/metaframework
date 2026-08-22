---
name: 0019-the-values-held-the-artifacts-did-not
kind: adr
version: 1
title: The third survey — the values held, the artifacts behind them did not
summary: A repository nobody here wrote becomes the third solution — `grpc` and `edge` both fit on first contact, the artifacts behind both do not, and every other strain carries a verdict.
status: review
owner: sergio-bershadsky
decision-status: proposed
date: "2026-08-22"
relations:
  uses:
    - /product/specification/component/kind-contracts
    - /product/specification/component/core-contracts
tags:
  - ontology
  - method
  - survey
---

## Context

[0013-a-second-solution-surveyed-from-real-code](srn://metaframework/adr/0013-a-second-solution-surveyed-from-real-code)
established the method and stated its limit in the same breath: a catalog
written to exercise an ontology cannot falsify it, so the whole value of
describing foreign code is the written record of every place the model strained.
It also named its own successor and declined it on cost — "**Survey a repository
the author did not write.** The better test, and rejected on cost … Recorded as
the next test rather than as a rejected idea."

This record is that test. The described repository is
[KubeEdge](https://github.com/kubeedge/kubeedge), an Apache-2.0 CNCF project
with its own maintainers, its own release train and no relationship to this
framework; the description lives at `solutions/kubeedge/` and is surveyed at tag
`v1.23.1`. Per
[0001-sealed-solution-universes](srn://metaframework/adr/0001-sealed-solution-universes)
it is cited below by filesystem path and by external URL, never by SRN.

### Why this repository, and not a better-known one

The choice was made against measured coverage rather than familiarity. **Counted
at commit `8e7a16c`**, the three shipped catalogs held 344 entities and left four
regions of the vocabulary carrying normative language and no instance at all:

| Region                          | Instances at `8e7a16c` | What the spec asserts about it with no evidence                    |
| ------------------------------- | ---------------------- | ------------------------------------------------------------------ |
| `transport.kind: grpc`          | 0                      | a binding block of `package`, `service`, `tls`, `methods`          |
| `transport.kind: amqp`          | 0                      | a binding block of `exchange`, `exchange-type`, `durable`          |
| `environment-type: edge`        | 0                      | "production-grade obligations … only intermittently connected"     |
| `environment-type: dev`         | 0                      | "shared and integrated, disposable, synthetic data only"           |

The same census found `transport.kind` in use as 9 `http` and 3 `in-process`,
with the AsyncAPI dialect carrying 3 `kafka` servers and 1 `wss`; 16 of the 17
protocol entities carried a `transport.yaml`; and the whole catalog contained
only 4 distinct `(style, kind)` pairs. `component-type` was 18 `ui`, 18
`library`, 17 `service`, 5 `external`, 3 `gateway`, 2 `datastore`, 2 `job` and 1
`content` — zero `application` and zero `specification`, two of the three values
appended on 2026-08-20 by the amendment that
[component.md](srn://metaframework/product/specification/component/kind-contracts)
records.

KubeEdge was selected because it reaches **two** of those regions at once and a
third value besides: gRPC at a real seam in both directions, an edge deployment
in exactly the sense the enum's sentence means, and an installable command-line
program for `application`. A system that reached one region would have tested one
sentence.

### What this record does not re-litigate

The catalog is authored in this same uncommitted batch and its entity count is
still moving as the behavioural half lands. Nothing below rests on that count.
Every number here is anchored to `8e7a16c`, to this batch's working tree on
2026-08-22, or to the surveyed tag, and the sections say which.

## Decision

We record the third survey as this framework's first evidence from a repository
nobody in this project wrote, and we give every strain a verdict — the ontology
should change, the ontology is right and the project is unusual, or the question
is genuinely open and here is what would settle it. **No specification changes in
this run.** Each recommendation that survives review earns its own ADR and its
own review, because a rule changed inside a survey record is a rule nobody
reviewed.

## Consequences

### The four never-exercised regions, reported plainly

*Measured in this batch's working tree on 2026-08-22, and read from the surveyed
tag `v1.23.1` on the same day.*

**`environment-type: edge` holds, and holds exactly.** The enum's justification
— that `edge` is "a shape, not a stage", that it breaks "the assumption every
other value grants for free — that components can reach the core synchronously
and see one consistent state", and that the portal "must know it *before* it
opens `topology.yaml`" — was written with no such system in view and describes
KubeEdge's entire design premise. `solutions/kubeedge/environment/edge-fleet/`
is the first instance of the value in any catalog and it needed no argument to
justify. This is a real result and it is recorded as one: the reasoning was
sound before the evidence existed.

**`transport.kind: grpc` holds too, and its binding block does not.** Three gRPC
transports are now authored — two halves of the Device Management Interface and
the container-runtime seam. `package`, `service`, `tls` and the `methods` surface
list all carried real content. But **all three** carry an `x-` key naming an
endpoint the block has no field for: `x-endpoint-linux` and `x-endpoint-windows`
on two of them, `x-endpoint-source` on the third, because that one dials whatever
local address the peer announced at registration. Three of three is not a sample,
it is the population.

**`environment-type: dev` is still at zero, and after three surveys that should
stop being read as a coverage gap.** The value describes a property of an
*organisation running* software — shared, integrated, disposable, synthetic data
— not a property of software. A public repository publishes a single-host install
path (which is `local`) and a CI pipeline, and `environment.md` itself routes CI
away from environments: "the pipeline is not a deployment target of this
solution's components; model the runner as an actor". No fourth open-source
survey will produce a `dev` either. If the value is ever to gain evidence it will
come from a private catalog, and that is worth writing down rather than leaving
as an open item a future survey is expected to close.

**`transport.kind: amqp` is still at zero, and this record has a prediction
rather than evidence — labelled as such.** The survey's strongest rejected
candidate, [Eclipse Hono](https://eclipse.dev/hono/docs/architecture/component-view/),
states on that page that "all interactions between the components are based on
AMQP **1.0** message exchanges" (read 2026-08-22). The framework's `amqp`
binding block requires `exchange` and an `exchange-type` of
`direct | topic | fanout | headers`, which is AMQP **0-9-1** vocabulary; AMQP 1.0
has no exchanges. That this is a real split and not a pedantic one is checkable
outside this repository: AsyncAPI publishes an `amqp` binding *and* a separate
`amqp1` binding, and the `amqp1` binding's channel, operation and message objects
each "MUST NOT contain any properties" (verified against
<https://github.com/asyncapi/bindings> on 2026-08-22). One enum value, two
incompatible protocols, and both of this framework's dialects assume the one Hono
does not speak. **Recommendation:** choose the fourth survey to reach `amqp`, and
choose an AMQP 1.0 system deliberately, because that is where the block is
predicted to break.

### What should change

*Catalog counts in this section are from this batch's working tree on 2026-08-22;
source facts are read from the surveyed tag on the same day.*

Every transport strain below is a strain against a **documented** rule, not
against a check: `E_PROTO_TRANSPORT_SCHEMA`, `E_PROTO_TRANSPORT_BINDING`,
`E_PROTO_TRANSPORT_SPEC_CONFLICT` and `E_PROTO_TRANSPORT_ASYNCAPI` all sit in the
portal's debt register with the same note — nothing reads `transport.yaml`. The
authors obeyed the specification because it is the specification. That also means
none of the fixes below carries migration risk today.

| #  | The strain                                                             | The rule that strained                                    | Cost of the fix                        |
| -- | ---------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| 1  | MQTT has no value, in either dialect                                   | `kind` enum; AsyncAPI profile rule 4                      | one table row                          |
| 2  | a gRPC endpoint that is a filesystem path has no field                 | the `grpc` binding block's four fields                    | one optional field                     |
| 3  | one endpoint serving two gRPC services                                 | `grpc.service` is a single string                         | widen to string-or-list                |
| 4  | `W_COMP_NO_ENVIRONMENT` fires on every nested module                   | T2, which has no notion of inherited placement            | one exemption clause                   |
| 5  | a `gateway` MUST point at what it fronts; this one fronts an actor     | the `gateway` discipline's `depends-on` obligation        | one word — "or in prose"               |
| 6  | a multiplexed channel carries two interaction shapes                   | the `style` decision rule, stated as total                | a paragraph, no enum change            |
| 7  | a region that is a class of site, not a site                           | `topology.yaml`: absent `regions` = one unnamed region    | permit present-but-unenumerated        |
| 8  | the flat config contract cannot describe this component at all         | `usage: config`'s discipline and its stated premise       | **a ruling before 0.2.0 ships**        |

**1 — MQTT, and the escape hatch that stops one wire short.** KubeEdge speaks
MQTT in three places: the edge runtime's bridge against a broker, the `mqtt`
branch of the device resource's push method, and one of the three routing
endpoint kinds. The broker is not incidental — the project's own cloud-side Helm
chart ships `daemonset_mosquitto.yaml` and installs it onto edge nodes. The
mini-spec's `kind` is the closed set `http | grpc | amqp | kafka | websocket |
in-process`, so there is no value; the AsyncAPI dialect carries no `kind` at all,
so what blocks it there is only profile rule 4's admitted table of
`kafka`/`ws`/`amqp`. Verified on 2026-08-22 against
<https://www.asyncapi.com/docs/reference/specification/v3.0.0> and
<https://github.com/asyncapi/bindings>: AsyncAPI 3.0's Server Object `protocol`
is a free-form string whose own examples name MQTT, and the bindings registry
publishes an MQTT binding and an MQTT5 binding. **The framework adopted AsyncAPI
as a dialect and then narrowed it below what the standard covers, and the
narrowing landed on the most common wire in device integration.** The visible
consequence is not an awkward entity — it is a missing one: the catalog holds no
protocol for the MQTT bus at all, and records the refusal on
`solutions/kubeedge/product/core/component/mosquitto/index.md`. **Recommendation:
widen rule 4's table by one row** (`mqtt` / `secure-mqtt`, bindings key `mqtt`).
That needs no `kind` value, no new binding block, and no code beyond the reader
`E_PROTO_TRANSPORT_ASYNCAPI` has always been waiting for.
[0017-transport-asyncapi](srn://metaframework/adr/0017-transport-asyncapi)
already nominated this exact table as "the thing to widen". **The ruling it
needs:** the row creates the first wire that has an AsyncAPI dialect and no
mini-spec dialect, inverting the current table's shape. The alternative — a
hand-written `mqtt` binding block — is more work for a worse description than the
standard's own.

**2 and 3 — the gRPC block describes a network and this gRPC is not on one.**
Read from the surveyed tag on 2026-08-22: the Device Management Interface's
listener address is built by a function with one implementation per build tag —
a `unix://` socket path on Unix, an `npipe://` pipe name on Windows — and the
container-runtime seam defaults the same way against containerd. `tls: false` is
expressible; "there is no host, the endpoint is a filesystem path, and the path
form differs by operating system" is not. **This is the second independent sighting of one hole.** ADR 0013 recorded
brass forcing stdio JSON-RPC into `in-process` with `x-wire: stdio-jsonrpc`; two
catalogs, four transports, and the same missing field, because the `kind` enum is
a list of *networks* and local IPC is not one. Separately, the runtime seam's one
endpoint serves two services — a runtime service and an image service, one
package, one client — and `service` holds one string, so the catalog wrote
`x-second-service`. Both fixes are additive and neither touches the enum.

**4 and 5 — two obligations a correct catalog cannot discharge.** The two
KubeEdge runtimes are each one process hosting a fixed set of pluggable modules,
and 18 of them are modelled as nested components. **At `8e7a16c`,
`W_COMP_NO_ENVIRONMENT` fired once across all 344 entities;** with this catalog in
the tree it fires 18 times, every one of them a module that does not deploy
independently. The two available authorings are 18 duplicated `uses` edges that
drift and state something false — a module is not deployed anywhere, its process
is — or 18 deliberate warnings. T2 has no notion of inheriting placement from an
ancestor, and adding one is an exemption clause. The `gateway` case is the same
shape in a different kind: the discipline says a gateway MUST name what it fronts
with a `depends-on` edge, and what a device mapper fronts is physical hardware,
which is correctly an **actor** — and `product.md` states the blocking fact in as
many words, that the relation edge set has "**no edge whose legal target kind is
`actor`**". The obligation is unsatisfiable as written. Note the symmetry with
0013's finding that `external` is *necessary* because edges never point at
actors: it is the same mechanical rule, read from the other side, producing the
opposite defect.

**6 — the `style` decision rule claims to be total, and is not.** The rule is
stated as "total and non-overlapping". The cloud-edge channel's envelope carries
both a synchronous flag and a parent-identity field, so one connection carries
correlated request/reply *and* one-way push, with push in the great majority. The
catalog declares `request-response` as the stronger claim and states the cost on
the entity: any workflow authored there as pure event fan-out draws a
`W_PROTO_STYLE_MISMATCH` the catalog can never clear. The decision table is total
over *messages*; it is not total over *channels*, and multiplexed channels are
ordinary. **Recommendation: fix the wording, not the enum** — say that `style` is
the strongest shape the channel contracts and that a mixed channel is
legitimate, so the warning stays a lint about authoring rather than a permanent
red mark on a correct description. A rule no author can clear teaches authors to
ignore the rule; `actor.md` already reasons exactly this way about its own
`deprecated` exemption.

**7 — the edge fleet's placement.** `topology.yaml` offers a list of named
regions or no list, and defines the absent list as *one unnamed region*. The real
statement is "one instance per site; the number of sites is unbounded, changes
without a commit, and is enumerated in no repository". Enumerating is absurd and
omitting asserts something false, so
`solutions/kubeedge/environment/edge-fleet/topology.yaml` declares a single
region named `edge-site` and spends a paragraph saying it is a class of place and
not a place. The **value** `edge` is right; the artifact behind it met an edge
deployment for the first time and could not hold it. Three of that file's five
host entries also omit `replicas` entirely, because a per-node count is a
property of the cluster rather than a range — which the format already lets
authors say in `scaling:` prose, and that is the honest mitigation. This is new
evidence for
[0016-topology-format-deferred](srn://metaframework/adr/0016-topology-format-deferred)
and it does **not** meet that record's stated reopening trigger, so the
recommendation is narrow: permit `regions` to be present and explicitly
unenumerated, rather than reopening the format survey.

**8 — the config contract, and the one ruling this record asks for before
0.2.0.** `datamodel.md` defines a `usage: config` contract as a flat map of
`^[A-Z][A-Z0-9_]*$` keys to scalars, on the stated premise that "an instance of
this schema is the configuration one process actually sees … which is what a
process environment is", and defends the flatness with a second claim: "every
config entry in every catalog shipped with this framework is a flat scalar key,
because that is what an environment variable can be." Both halves were true when
written. **Read from the surveyed tag on 2026-08-22**, `grep -rn "os.Getenv"`
over KubeEdge's Go sources, excluding `vendor/` and every `_test.go`, returns
**9** call sites; **8** name a literal key and those name **6** distinct keys, and
the ninth takes the key as an argument. That is the entire environment-variable
surface of the system. What the runtimes actually read is a versioned Kubernetes
component-config document — its own `apiVersion`, nested three and four levels
deep, defaults compiled into the shipped types. So the framework now ships a
catalog whose config entries are *not* what the premise says they all are, and
the flagship join — an environment provides every required-no-default key a
hosted component needs — has three optional secret keys to run over, on a
component that is generated downstream. The keys that would actually stop a
deployment starting cannot be named by any contract this framework admits.

Flattening is not available as a workaround, and `datamodel.md` says why better
than this record could: the objection to `DATABASE__URL` is that "every runtime
that offers one offers a different one", so picking a convention "would put a
convention nobody's process actually implements into the middle of the only check
this design is for". That objection is exactly right, and it does not apply to
**JSON Pointer**, which is the proposal the catalog itself carries at
`solutions/kubeedge/product/device-integration/datamodel/mapper-db-credentials/index.md`:
a pointer addresses the document the runtime already reads, so no runtime has to
implement anything for the join to be well-defined.

The config lane is **locked and shipping in 0.2.0**, which is why this is the one
finding that wants an owner ruling rather than a follow-up ADR. Two outcomes are
both defensible and only one of them is free:

- **Admit a nested contract with a JSON-Pointer key space**, keeping the flat
  form as the env-var case. Real design work, and it widens the join to the class
  of software this survey found.
- **Keep the discipline exactly as it is and correct one sentence** — say that a
  `usage: config` contract describes a component's *environment-variable*
  surface, not its configuration surface, and that a component configured by a
  document has no contract in this release. That costs nothing, ships today, and
  stops the spec claiming a generality it does not have.

What is *not* defensible is shipping the current wording, because a reader of
`datamodel.md` is entitled to conclude that the contract covers configuration and
the third catalog in the repository proves it does not.

### What is right, and the project is unusual

**`component-type: external` held again, for the same mechanical reason.** The
Kubernetes API server, containerd and the broker the project's own chart installs
are all modelled as `external` components rather than actors, for precisely the
reason 0013 gave: `depends-on` and `uses` accept components and never actors. The
repetition counts for something despite the shared describer, because the
decision is forced by the edge table rather than chosen — a catalog that wanted
these to be actors could not have written the edges it needs.

**`component-type: application` held on its first instance.** The installer meets
the type's discipline as written — a package identity, a single source of truth
for its version, and an install channel that is not a local path — and the page
argues `application` against `ui` on the axis the type was added for: what is
described is the shipped distribution, not the surfaces inside it. The value
added on 2026-08-20 against a strain recorded in prose has now been exercised by
a system chosen for other reasons entirely.

**`product.lifecycle` is right, and what a surveyor may cite for it needs writing
down once.** `product.md` reads the enum as investment: a product is "positioned
in a portfolio", `active` means "in production and invested in", and the document
names `concept`, `incubating`, `active` and `maintenance` as investment states
explicitly. An open-source project publishes no investment ledger; it publishes
release trains, tags and last-push dates. Those turn out to be genuinely
informative — a repository superseded by a successor stops being pushed, a
component below 1.0 says so in its own version — and the four products absorbed
into `active` and `incubating` without strain. The gap is methodological, not
ontological: every future open-source survey will face the same question, and the
answer belongs in the kind contract as a sentence about admissible evidence
rather than as a judgement re-derived each time. The same pressure produced the
catalog's product split, which follows **release trains** rather than the
project's own cloud-versus-edge architecture diagram, because that diagram would
have put two ownership lines on one release with one maintainer group.

### What is genuinely undecided

**One conversation, three wires.** The cloud-edge channel is served over
WebSocket, QUIC and a Unix socket, configured in one module, enabled
independently, with the same participants, message schema, workflows and state
machine. "One transport per protocol" is stated twice — once in the mini-spec and
once as AsyncAPI profile rule 4, "a second server is a second wire, which is a
second protocol entity" — so an exhaustive catalog holds three entities that are
byte-identical except for one artifact. Two of them cannot be written anyway,
because the enum has no `quic` and no name for a local socket, and the transport
library underneath supports exactly two basic wires and the enum names one of
them. The catalog authored the default wire and stated the other two in prose.
The rule is defensible; the enum's gaps are what bit. `protocol.md` already names
`transports:` as "a plausible additive extension later". **What would settle it:**
a second catalog with a genuinely multi-wire protocol, to show whether the
duplication or the list is the smaller cost. One instance is not enough to move a
rule that exists to stop protocols smearing across artifacts.

**A module inside a process, for the third time — and this time the tree cannot
supply the answer.** 0013 recorded this hole twice, as brass's `x-package` on 5
components and acme's `x-runtime` on 11. This catalog reached for **three**
hatches, not one: `x-deployment-unit` on 18 components, `x-runtime` on 7 and
`x-package` on 5, measured in this batch's working tree on 2026-08-22 — which
shows 0013's synthesis was conflating two different missing facts, implementation
identity and containment. The obvious objection to the containment field is that
the tree already says it, since all 18 modules are nested under their process. The
objection fails, and acme disproves it: `solutions/acme/environment/production/topology.yaml`
places `checkout/component/payment` with its own regions and its own replica
range, distinct from its parent's. **Nesting means "part of", not "inside the
process of", and nothing in the catalog distinguishes them** — which is also why
the T2 exemption recommended above cannot simply be "has an ancestor with an
environment" without deciding this first. The portal ignores `x-` fields, so in
all three catalogs the fact is unrenderable.

**An embedded datastore.** `datastore` means a holder of persistent state
"addressed as infrastructure". The edge runtime's local store is a file opened by
the same process, and the entire autonomy story rests on it. Modelling it as a
`datastore` puts a component in the graph that nobody deploys and no environment
hosts; omitting it loses the mechanism. Note the symmetry with brass, which
refused to invent a persistence tier that did not exist; here the tier genuinely
exists and is still unmodellable. **What would settle it:** whether any derived
view needs embedded stores as nodes. If none does, prose is the right answer and
the kind should say so.

**`specification` against `library`, tested and declined.** The survey nominated
the device-management interface as a candidate for `specification` — the project's
own material calls it a standard — and the authoring phase tested it and chose
`library`, recording why on the component page: the normative interface is
distributed as a compiled module that consumers link, so it is both things at
once and the enum makes you pick. `specification` therefore remains at zero
instances. **What would settle it:** a rule for which axis wins when a component
is simultaneously read-as-contract and linked-as-code. Until then the value's
only evidence is this framework's own spec corpus, which is the same circularity
0013 was written to break.

**Configuration selects the architecture.** Two independent instances in one
system. The device resource's push method is a five-way optional union — HTTP,
MQTT, OTLP, a database branch that is itself a four-way union, and anomaly
detection — chosen *per property, per device instance*, by an operator writing a
custom resource at runtime. And the event-bus module has three modes, defaulting
to external; in the other two the edge runtime *is* the broker, at which point
that component's `depends-on` edge to the broker stops being true. The ontology
models a protocol as an entity with a placement and a version, and a component's
dependencies as one static graph; here both are values in a schema. Every option
is wrong: an entity per branch describes surfaces nobody may ever configure,
omission hides the device data plane entirely. **No fix is proposed**, and this
is the deepest finding in the survey — the same register as brass's "a missing
thing had to be described by refusing to model it". It needs a notion of variant
or profile that v1 deliberately does not have.

**One resource, two API versions, one schema.** Read from the surveyed tag on
2026-08-22, the chart installs 13 custom resource definitions, and the device
definition serves `v1alpha2` (served, not the storage version) and `v1beta1`
(served, storage) simultaneously, with schemas that differ. A datamodel entity has
one `schema.json` and one integer `version`, and that integer is a **review
clock** carrying an additive-only obligation — it is not an API version and there
is no second axis to put one on. The catalog took the storage version and wrote
the cost on the entity. This is not exotic: every Kubernetes-native system does
it, and so does every REST API serving `/v1` and `/v2` at once. **What would
settle it:** whether a consumer ever needs the non-storage version described, or
whether "describe what a new manifest should look like" is the whole job.

**Orphaned roles that are not leftovers.** `W_ACTOR_ORPHAN` reasons that "an
actor nobody talks to is usually a leftover from a swap", and exempts
`deprecated` actors because the catalog has already answered that guess. Four
actors here are orphaned as this record is written, and one of them — an edge
workload — clears the moment the journey naming it lands, which is the rule
working as designed. The other three are not leftovers and have no path to
clearing: a CI runtime, which the environment kind explicitly routes into
actorhood; a service account, which by definition borrows a caller's identity
rather than holding conversations of its own; and a developer whose output is an
image, not a message. The narrowest data point is
the sharpest: **measured in this batch's working tree on 2026-08-22, the catalog
holds 2 actors of type `service-account` and both are orphaned.** Two is a small
sample and this is offered as a ruling worth taking, not a defect proven —
exempting `actor-type: service-account` from the rule would follow the same logic
as the `deprecated` exemption already in the kind.

### What this survey did not prove

- **Nothing about authoring cost.** 0013 said the same about brass and it is
  still true. This record measures no time and no effort, and the fact that a
  survey of unfamiliar code was affordable this once says nothing about whether
  it is affordable as a practice.
- **Nothing about a second reader.** The objection 0013 could not clear — one
  repository, one describer — is now half cleared: the described system has
  maintainers who are not the describer. But none of them reviewed a claim, and
  no statement in `solutions/kubeedge/` has been checked by anyone who works on
  KubeEdge. Every claim there is one outside reader's reading of public sources.
- **Nothing about `dev` or `amqp`.** Two of the four never-exercised regions are
  still at zero. This record argues about both and measures neither, and it says
  so where it argues rather than letting the reasoning read as evidence.

## Alternatives considered

- **Eclipse Hono** — the strongest `amqp` candidate, and the one that would have
  produced the AMQP 1.0 finding as evidence instead of prediction. Rejected for
  this run because it reaches one region, not two, and carries no `edge`
  deployment: its devices are at the edge and Hono itself is cloud-side.
  **Recorded as the obvious fourth survey**, with the AMQP 1.0 versus 0-9-1 split
  above as its pre-registered hypothesis.
- **EdgeX Foundry** — an excellent `edge` fit with cleanly separable services.
  Rejected because its message bus is Redis Pub/Sub, MQTT or NATS and it uses no
  gRPC: it would have reached one region and produced a second MQTT finding
  rather than a first gRPC one.
- **OpenTelemetry Collector** — gRPC-primary with sharp seams, rejected on
  bounded scope (the contrib component set is unbounded) and because its
  deployment modes are agent and gateway, not `edge` in the enum's sense.
- **etcd and Temporal** — gRPC-heavy and well documented, and neither has an
  offline-first story, so both reach exactly one region.
- **Extend brass or acme with the awkward cases.** Rejected for the reason 0013
  gave and one more: brass and acme are now the catalogs whose enum coverage this
  survey was measured *against*, and bending either to close a gap would destroy
  the baseline that made the selection defensible.
- **Force the fits and ship a clean catalog.** The alternative that produces no
  findings. Rejected: `solutions/kubeedge/` deliberately ships a whole block of
  T2 warnings, an invented placeholder region, a refused protocol entity and
  several `x-` fields, each with the argument written on the entity that carries
  it. A survey whose output is a green build has measured the author's
  willingness to compromise, not the ontology.
- **Change the rules in this record.** Rejected, and it is the reason the
  Decision paragraph says so explicitly. Most of the findings above have a fix
  that fits in a sentence, which is exactly the condition under which a spec
  change gets made without review. The config ruling is the single exception
  requested, and it is requested as a ruling rather than taken as one.
