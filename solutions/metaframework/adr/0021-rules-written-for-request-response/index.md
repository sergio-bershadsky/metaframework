---
name: 0021-rules-written-for-request-response
kind: adr
version: 1
title: The fourth survey — the rules that broke were written for request-response
summary: The fourth survey reaches `amqp`, the last transport value with no instance. The value and `bus` hold; the mini-spec block goes unused, and most rules that broke assume a request and a reply.
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
  - transport
---

## Context

[0013-a-second-solution-surveyed-from-real-code](srn://metaframework/adr/0013-a-second-solution-surveyed-from-real-code)
established the method and its limit in one sentence: a catalog written to
exercise an ontology cannot falsify it, so the value of describing foreign code
is the written record of every place the model strained.
[0019-the-values-held-the-artifacts-did-not](srn://metaframework/adr/0019-the-values-held-the-artifacts-did-not)
ran that method against a repository nobody here wrote, and closed by
**pre-registering a hypothesis** — the one thing a survey record can do that a
census cannot:

> **Recommendation:** choose the fourth survey to reach `amqp`, and choose an
> AMQP 1.0 system deliberately, because that is where the block is predicted to
> break.

This record is the fourth survey, and it took the other branch. The described
repository is [StackStorm](https://github.com/StackStorm/st2), an Apache-2.0
event-driven automation platform with its own maintainers and release train and
no relationship to this framework; the description lives at
`solutions/stackstorm/` and is surveyed at tag `v3.9.0`. Per
[0001-sealed-solution-universes](srn://metaframework/adr/0001-sealed-solution-universes)
it is cited below by filesystem path and external URL, never by SRN.

It speaks AMQP **0-9-1** — the dialect the framework's own binding block was
written from, exchanges and all. So the hypothesis is not so much confirmed as
**bypassed**: the block met a system on its own terms and still could not
describe it, which is a stronger result than the one that was predicted and a
worse one for the block.

### Why this repository

*Counted over this batch's working tree on 2026-08-22, with HEAD at `8e7a16c`.*

After three surveys, exactly one value of one closed enum had never described
anything: `transport.kind: amqp`. The related regions were not much better —
`style: bus` existed only inside the invented fixture, `component-type:
datastore` likewise, and `environment-type: dev` was at zero everywhere. The
choice was made against that census and not against familiarity: StackStorm is
eleven independently supervised processes whose entire internal conversation is
AMQP topic exchanges, so it reaches `amqp` and `bus` together and puts real load
on both.

The candidate 0019 nominated — Eclipse Hono — was rejected here for the reason
0019 itself gave when it declined Hono for its own run, inverted: Hono is AMQP
1.0, so it would have refuted the block rather than exercised it, and it
duplicates the domain and the headline strains of the third survey. Testing a
rule against the case it was written for is the harder test, and it is the one
that produces a usable verdict.

### What this record does not re-litigate

The catalog is authored in this same uncommitted batch across three lanes, and
its shape was still moving while this was written. Nothing below rests on a
count of it holding still. Every number is anchored to `8e7a16c`, to this
batch's working tree on 2026-08-22, or to the surveyed tag, and each section
says which.

## Decision

We record the fourth survey, and we give every strain a verdict — the ontology
should change, the ontology is right and the project is unusual, or the question
is genuinely open and here is what would settle it. **No specification changes
in this run.** Each recommendation that survives review earns its own ADR and
its own review, because a rule changed inside the record that found it is a rule
nobody reviewed.

Where this record's evidence contradicts the survey brief or an earlier record —
including one prediction in 0019 and three factual claims in the survey it was
built on — the contradiction is stated rather than smoothed, and the measurement
that settles it is given.

## Consequences

### The never-exercised regions, reported plainly

*Measured over this batch's working tree on 2026-08-22; source facts read from
the surveyed tag `v3.9.0` on the same day.*

**`transport.kind: amqp` is reached, and the mini-spec binding block was not
used once.** The catalog holds **6** `amqp` transports. All six are written in
the AsyncAPI dialect. **Zero** are written in the mini-spec dialect, and the
sharper fact is historical rather than current: grepping every commit that
touches a `transport.yaml` for an added `kind: amqp` line returns **0**. The
`kafka` and `websocket` blocks were at least authored once and later migrated
under [0017-transport-asyncapi](srn://metaframework/adr/0017-transport-asyncapi);
their files are in the history. The `amqp` block is the only binding block in
the specification that has never described anything, in any commit, in any
catalog — and the first system to reach its value could not use it. Three
independent reasons, each checked against `kinds/protocol.md` and against the
tag:

1. **One exchange per transport.** The block carries exactly one `exchange` and
   one `exchange-type`. Three of the six conversations here span two or three
   exchanges — the action-execution lifecycle spans `st2.liveaction.status`,
   `st2.liveaction` and `st2.actionexecutionstate`. `kafka` gets a list of
   topics and `websocket` a list of channels; `amqp` gets one exchange. The only
   two authorings are to fragment one conversation into three protocol entities
   or to drop two thirds of it.
2. **`queue` is required, and six real queues have no name.** Read from
   `st2common/st2common/transport/queues.py` at the tag: six binding queues are
   declared with no name and `exclusive=True, auto_delete=True`, and the broker
   generates the name at connection time. A required string field has nothing
   true to hold.
3. **There is no connection-level field at all.** `kafka` has `cluster`;
   `http`, `grpc` and `websocket` have `tls`; `amqp` has neither a broker label
   nor a vhost — while every exchange and queue name in this system is derived
   from `[messaging] prefix`, whose shipped default is `st2` and whose comment
   in `conf/st2.conf.sample` reads "Prefix for all exchange and queue names". A
   file writing `st2.liveaction.status` states a default, not a fact.

**`style: bus` holds, and it is the first real-code instance of the value.** The
style census is **23** `request-response`, **9** `bus`, **3** `point-to-point`;
before this batch the `bus` population was 3, all of them in the invented
fixture. The decision rule needed no argument on any of the six — publish to an
exchange, receivers discovered by subscription, no reply — and the value is
recorded here as a confirmation, which is a real result. Everything downstream
of it is the rest of this record.

**`environment-type: dev` is reached, and it is honestly partial.** The census
is now production **7**, local **4**, dev **1**, staging **1**, edge **1**. The
one `dev` is this catalog's container-compose target, and 0019 predicted it
could not exist: "No fourth open-source survey will produce a `dev` either." The
prediction's conclusion was too strong. Its reasoning survives, sharpened, and
the entity itself is where the sharpening is written: three of `dev`'s four
tests — integrated, disposable-with-synthetic-data, `draft` components welcome —
are answered by the published artifact, and the fourth, *shared* versus *a
single developer's machine*, is the whole of the `dev`/`local` distinction and
is **not a property of the artifact at all**. A compose file runs wherever a
container runtime runs. The value has an instance; the enum still has no way to
be sure it is the right one. See the undecided section.

**`component-type: datastore` is still fixture-only after four surveys, and
`specification` still has no instance anywhere.** The type census is service
**33**, library **25**, ui **20**, job **17**, gateway **13**, external **12**,
content **3**, application **2**, datastore **2**, specification **0** — and
both `datastore` entities are acme's. This survey had three obvious candidates
and typed all three `external`, independently reaching the answer the third
survey reached for its own bundled broker. That is not a coincidence and it is
not a preference; see below.

**`environment-type: edge` was deliberately not authored.** Nothing in this
system is a geographically distributed, intermittently connected target.
Inventing one to exercise a value is the failure mode the whole method exists to
avoid, and 0019 already supplied the value's evidence.

### What should change

*Rule citations are to `framework/spec/` in this batch's working tree on
2026-08-22; source facts are read from the surveyed tag on the same day.*

| #  | The strain                                                             | The rule that strained                                   | Cost of the fix                     |
| -- | ---------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| 1  | the `amqp` mini-spec block cannot take an AMQP 0-9-1 system            | the `amqp` binding block's four fields                   | retire it; zero instances to move   |
| 2  | a bus publisher is the provider side and has no inbound surface        | `job` — "MUST NOT expose a protocol"                     | one clause                          |
| 3  | `openapi.yaml` is pinned to 3.1.x, generated, and not what runs        | the role's dialect row, and the role table's premise     | one row, plus a stated premise      |
| 4  | neither of this project's two config contracts is expressible          | `usage: config`'s shape discipline                       | **a ruling before 0.2.0 ships**     |
| 5  | SSH has no value; the coordination wire could not have one             | the `kind` enum, and its premise                         | rows, then a rethink                |
| 6  | an operation's `response` names one datamodel; no cardinality anywhere | the `http` operation object                              | one optional field                  |
| 7  | the spec exists, is somebody else's, and cannot be vendored            | `spec` XOR the surface list; `spec.file` is a local path | admit a third case                  |
| 8  | a journey's defining stretch has no actor                              | a step's `actor` is REQUIRED                             | `actor: none`, mirroring `protocol` |

**1 — retire the `amqp` mini-spec block, and say plainly what replaces it.**
The three failures above are structural, the block has never described anything,
and the framework's own dialect table already permits AsyncAPI for this wire. The
migration cost is exactly zero files. What must go with the recommendation is the
honest half: **the AsyncAPI dialect did not fit either, and the measurement is
brutal.** Counted over every `.yaml` artifact in the catalog on 2026-08-22, this
solution carries **13 distinct non-profile `x-` keys across 77 instances**, every
one of them inside the six AMQP transport files. All four other catalogs
combined carry **17**. The two largest are `x-bound-to-exchange` (**21**) and
`x-binding-routing-key` (**21**), and they exist to state the one relation AMQP
0-9-1 is made of: which exchange a queue is bound to, and with which key.
Verified against <https://github.com/asyncapi/bindings> on 2026-08-22, the
AsyncAPI amqp channel binding's `is` is `queue` **xor** `routingKey` — `exchange`
applies only to the first, `queue` only to the second — and the object "MUST
contain only the properties defined above". So a queue channel cannot name its
exchange, and 21 pairs of invented keys is what a correct description costs.
**That half of the finding belongs upstream, not here**, and the recommendation
is to record it as a known limit of the adopted dialect rather than to grow a
third one. What this framework should not keep is a field table that is strictly
worse than the standard it already admits and that has never been used.

**2 — the `job` discipline is a request-response rule, and a bus breaks it six
times in one catalog.** `kinds/component.md` says a `job` "MUST NOT expose a
protocol — no inbound surface is the definition." Those are two different claims
and a bus pulls them apart: a publisher is the **provider** side of a protocol
and has no inbound surface whatsoever. That the convention is `exposes` is not
this catalog's invention — acme, independently, authored
`exposes: /protocol/settlement` on the one component that publishes onto that
bus and `uses:` on all four that read from it. acme's single `job` happens to be
a subscriber, so the rule never bit there. **This catalog has the first publishing jobs, and 6 of its 8 `job`
components carry an `exposes` edge**, in a solution that raises zero portal
warnings — because the discipline is a review check with no loader code. A rule
broken six times, silently, by a correct description is a rule that teaches
authors to skip the section. **Recommendation: narrow the clause** to forbid an
inbound surface rather than forbidding `exposes`, so that provider-side
participation in a `bus` protocol is legal on a job and the definition stays
what the second half of the sentence already says it is.

**3 — `openapi.yaml`, wrong in three independent ways at once.** The role's
dialect row fixes key `openapi`, value `3.1.x`, "owned by OpenAPI itself,
natively", and an absent discriminator reads as the legacy dialect and warns.
Read from the tag: `st2common/st2common/openapi.yaml` is **173,452 bytes** and
its first content line is `swagger: '2.0'`; it carries no `openapi:` key at all.
So a current, widely deployed, *different* industry standard lands in the bucket
reserved for files that declare nothing. Second: the file's own header says it is
generated from `openapi.yaml.j2` (**172,634 bytes**) by `make .generate-api-spec`
— the role table treats a fixed name as addressing an authored artifact, and
here it addresses a build product whose source is not in the table. Third, and
the one that decides it: `st2api/st2api/app.py:77` loads **the template**, not
the generated file. The artifact this framework can address is the one the
running software does not read. **Recommendation:** admit Swagger 2.0 as a named
legacy dialect of the role rather than letting it fall through the absent-key
door, and state in the role table that a fixed name may address a generated
file, with the generator named in prose. Both are cheap, and the first is
squarely what
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects)
built the machinery for.

**4 — the config contract, and the second independent finding against a locked
lane.** `kinds/datamodel.md` requires a `usage: config` contract to be a root
`object` of flat scalar properties named `^[A-Z][A-Z0-9_]*$`, with `writeOnly`
marking secrets. This project has two real config contracts and neither is
expressible, so the catalog authored **zero** `usage: config` datamodels while
the other four catalogs hold **14**. Read from
`contrib/examples/config.schema.yaml` at the tag, a pack's config schema is a
**bare attribute map at the root** — no `type: object`, no `properties:` wrapper
— with snake_case keys, `secret: true` instead of `writeOnly`, `required:` as a
per-property boolean, and nesting supported. `st2.conf` is sectioned INI
(`[api]`, `[messaging]`, `[coordination]`, `[database]`) and is not env-var
shaped in any respect.

The part that is new, and that no amount of widening would have caught, is
underneath: `st2common/st2common/util/schema/custom.json` declares
`"$schema": "http://json-schema.org/draft-04/schema#"` **and**
`"id": "http://json-schema.org/draft-04/schema#"` while adding `position`,
`immutable` and `secret` as keywords and redefining `required` as a boolean. It
wears the standard's identity and is a modified dialect. That is precisely the
failure 0015's discriminator machinery exists to prevent, found in a shipping
upstream project rather than argued from first principles — and it means a
consumer that trusts the header validates against the wrong grammar.

0019 asked for an owner ruling on this lane and offered two defensible outcomes.
This record does not propose a third; it reports that the second independent
survey hit the same wall by a **different route** — kubeedge's configuration is
one nested document, this project's is two documents in two languages, one of
which is not JSON Schema — and that the population of software configured by a
document rather than by an environment is now two of the three real-code
catalogs. **The ruling is more urgent than it was, not differently shaped.**

**5 — the transport enum, for the fourth time, and the first time the fix is not
more rows.** Five of this project's runners reach other machines: two over SSH,
three over WinRM. SSH has no enum value, which is the ordinary version of this
finding — brass took `in-process` for stdio JSON-RPC with an `x-wire` note,
kubeedge has MQTT on four entities and QUIC and a Unix socket besides, and this
is the third catalog and the third missing wire. The extraordinary version is
`coordination`: distributed locks between five processes, over
[tooz](https://docs.openstack.org/tooz/latest/), whose backend is chosen at
deployment time by a URL scheme. `st2common/st2common/services/coordination.py`
documents `zake://`, `file:///tmp` and `redis://…` in one docstring — an
in-memory fake, a local directory, and a network store. **The enum's premise is
that the wire is a property of the protocol, and here it is a property of the
installation.** The catalog authored the entity with no `transport.yaml` at all,
which is legal — the artifact is OPTIONAL — and which means the framework's only
way to say "this protocol's wire has no name here" is silence that no check can
see. **Recommendation:** add the rows, and separately open the question of what a
protocol says when its transport is a deployment choice.
[0016-topology-format-deferred](srn://metaframework/adr/0016-topology-format-deferred)
is the neighbouring record: this is placement leaking into the protocol kind.

**6 — no cardinality on an operation's `response`, and this is not an exotic
case.** The server-sent-events surface is where it was found: `kind: http` is
literally true of an SSE stream, and the operation object then offers `request`,
`response`, `method` and `path`, where the response is an unbounded sequence of
five shapes that never ends. But the same missing field mis-describes the mundane
case, and that is the argument for fixing it. **Counted over the tree on
2026-08-22: 72 named surface entries across the catalog, of which 5 are list
operations** — in two catalogs, brass and this one — and every one of them names
a single datamodel as its `response` where the wire carries an array.
**Recommendation:** one optional field on the operation object distinguishing a
single item, a collection, and a stream. It is additive, it costs no migration,
and it makes five existing entries stop lying.

**7 — `spec` XOR the surface list has a third case it does not admit.**
`spec.file` MUST exist and MUST NOT escape the entity directory, so linking a
published description that this repository will not vendor is impossible; the
anti-duplication rule then leaves the surface list as the only option. The
`rest-api` surface list holds **9** operations. The document it describes holds
**92 paths and 121 operations**, counted from the file at the tag. The list is
therefore a *selection*, deliberately, and no field says so — a reader has no way
to distinguish "this is the surface" from "these are the nine the catalog's
journeys touch". **Recommendation:** admit an external spec by URL, or admit a
surface list explicitly marked partial. The rule's purpose — never two sources of
operation truth in one repository — survives either.

**8 — a journey step requires an actor, and an event-driven platform's defining
stretch has none.** A step's `actor` is REQUIRED and MUST resolve to an actor;
`protocol` may be the literal `none`, which is exactly the escape the actor field
lacks. In `solutions/stackstorm/journey/remediate-an-alert/journey.yaml` the
consequence is written into a step note: "Everything the platform did in between
has no actor and therefore no step here." Five processes and four exchanges — the
part the product exists to do — are omitted, and the steps that remain are out of
narrative order because of it. **Recommendation:** `actor: none`, mirroring
`protocol: none`, with the same reading: not unknown, deliberately absent.

### What is right, and the project is unusual

**`component-type: external` held for the third time, and the reason is still
mechanical.** MongoDB, RabbitMQ and Redis are installed by this project's own
reference deployment, and all three are typed `external`, because the split
between `external` and `datastore` is ownership of the *software* and this
project owns only the *deployment*. 0013 recorded that `external` is forced by
the edge table — `depends-on` and `uses` accept components and never actors —
and 0019 recorded the same choice for a bundled broker. Three catalogs, one
answer, none of them chosen for taste.

The consequence is worth stating separately, because it is the reason `datastore`
is still fixture-only: **the value survives only for a store a solution wrote
itself**, and none of the three real-code catalogs has one. RabbitMQ is the case
that proves the type is not merely unpopular but wrong for this shape — it holds
no state of record, it is the bus, and `datastore` would be actively false —
while `external` is true and says nothing about what the thing does. This is not
yet a recommendation to change anything. It is the observation that after four
surveys two of the nine `component-type` values have no real-code instance, and
that the framework should notice which two.

**`E_PROTO_PARTICIPANTS` (at least two) is right, and this system has two
one-sided surfaces.** `st2.resultstracker.work` is a durable queue, bound to a
topic exchange, pre-declared at start-up, published to — and consumed by nothing
in the shipped source: at the tag it appears in `queues.py` and
`bootstrap_utils.py` and nowhere else. In the other direction the `st2.workflow`
exchange is declared and pre-declared and never published to: every write in
`st2common/st2common/services/workflows.py` passes `publish=False`, and only the
status exchange is written. Modelled as protocol entities either one could be
authored only by inventing a counterparty, which the rule correctly forbids —
**a protocol with one participant is not a conversation.** The rule is right and
the strain is real, and it belongs in the next section rather than this one only
because of what the catalog then cannot say; see below.

**NCA placement is right, and it carries a hazard authors should be told about.**
`webhook-ingress` lists the reverse proxy as a participant alongside the API
process, so its nearest common ancestor is the product and the entity sits in the
product's bucket. Without the proxy in the list, the only component participant
would be the API process and the protocol would belong inside that component's
directory. **Listing a gateway participant moves the entity's directory**, which
is correct behaviour and a non-obvious cost of a documentation judgement. The
kind should say so where the rule is stated; it is a sentence, not a change.

### What is genuinely undecided

**What types an environment when the catalog describes a recipe rather than a
target.** This is the `dev` finding, generalized, and it is the sharpest new
question this survey raises. All three of this solution's environments are
**published deployment recipes** — a one-line installer, a Helm chart, a compose
file — not targets an operator runs. Two of them are typed `production` and agree
about almost nothing: one host with no replication and no cross-node locking
against a replicated cluster with a broker cluster and a coordination backend.
The enum is a ladder of data reality and blast radius; what actually constrains a
component here is topology, which the ladder cannot see. 0019 found the same
shape from `edge`'s side — a region that is a class of site rather than a site.
**What would settle it:** a rule for what evidence types an
environment when the describer is a vendor rather than an operator. 0019 asked
for the same rule about `product.lifecycle` and an open-source project's missing
investment ledger; this is the second field with the same gap, which makes it a
methodological hole in the kind contracts rather than a judgement call.

**Nothing can say "declared, and nothing uses it."** Both one-sided surfaces
above are facts a reader of this system wants and the ontology has no slot for.
`status` is about the document. `lifecycle` belongs to components. The catalog
recorded them as `x-st2-no-consumer` and `x-st2-declared-unused-exchange`, which
is the escape hatch working and no check seeing it. **What would settle it:**
whether any derived view needs dormant surfaces as nodes. If none does, prose is
the right answer and the protocol kind should say so, the way
`kinds/environment.md` disposes of `ci` by naming where it goes instead.

**Who consumes a channel is unsayable for a multi-party bus.** AsyncAPI carries
it in `operations`, whose `action` is `send` or `receive` relative to one
application, and profile rule 6 makes `id` exactly one participant's ref. A
document describing a seven-party bus must therefore omit `operations` entirely
— so the framework's own profile forbids stating the one thing a bus reader most
wants. The rule is right for its purpose (it exists so a migration never invents
a direction) and wrong for this shape. **What would settle it:** a second
multi-party bus in another catalog, to show whether one document per participant
or one document with no operations is the smaller lie. One instance is not enough
to reopen a rule that was written against a real failure.

**A contract that has no expression anywhere, at any level.** A runner parameter
named `route` becomes an AMQP routing key, becomes an SSE event name, becomes a
literal string a listener in a third-party repository matches on. Three protocol
entities, two products, and every link in the chain is a string convention. The
same chain shows its two ends already disagreeing: the runner documents dotted
routes and the only subscriber binds the single-segment wildcard. **No fix is
proposed.** This is the same register as 0019's "configuration selects the
architecture" and 0013's "a missing thing had to be described by refusing to
model it": it needs a notion of a value-level contract that v1 deliberately does
not have, and naming it is the whole of what this record can do.

**The escape hatch is now being used to annotate the ontology's own failures.**
Two components carry `x-type-strain`, whose value is a sentence about which
`component-type` should exist and does not — `runtime-installed executable plugin
bundle` for a pack, `no component-type fits deployment packaging` for a Helm
chart. Both are argued at length on their entity pages, both are invisible to
every check, and the pack case is the second catalog to land in the same gap
from unrelated code, which is the pattern that justified appending `content`,
`application` and `specification` on 2026-08-20. That the authors reached for a
key whose purpose is to record that no key fits is a datum about the hatch, not
just about the types. **What would settle it:** whether a fifth catalog reaches
either gap. Two is the threshold this project has used before and it has now been
met for the pack case and not for deployment packaging.

### Corrections carried by this record

*Source facts re-read from the surveyed tag on 2026-08-22; catalog facts measured
over this batch's working tree on the same day.*

Four claims that fed this work were wrong, and a survey record that quietly
inherits them is worth less than one that says so:

- **Mixed durability on one exchange does not happen here.** The survey argued
  that the block's single `durable` boolean could not describe an exchange
  carrying both a durable named queue and non-durable stream queues. Kombu's
  `Queue` defaults `durable = True` (`kombu/entity.py`) and this project never
  overrides it, so every queue is durable and the boolean would not have lied.
  What varies per queue is `exclusive` and `auto_delete`, for which the block has
  no field at all — the finding survives in a sharper form and the original
  reasoning does not.
- **The bus does not carry JSON.** The publisher selects Python's own object
  serializer by name (`st2common/st2common/transport/publishers.py`), and kombu
  registers that serializer under content type `application/x-python-serialize`
  (`kombu/serialization.py`). The survey's authoring note recommended
  `defaultContentType: application/json`, which would have put a false fact in
  six files. It also exposes a real gap: the framework's `encoding` enum has
  seven members and its `encoding` → `defaultContentType` table has seven rows,
  and none of them produces this value, so a correct AsyncAPI document for this
  wire cannot be reached by the migration path the specification documents.
- **AsyncAPI does not express all three amqp cases.** The survey's constructive
  half claimed it did. It does not, for the reason measured above, and 42
  invented keys is what the gap cost.
- **`specification` has no uncommitted instance.** The survey reported one in the
  third catalog. `grep -rl "^component-type: specification$" solutions/` returns
  nothing; 0019 independently records that the candidate was tested and declined.
  The value's instance count is zero and has always been zero.

### What this survey did not prove

- **Nothing about `edge`, and nothing new about `dev`.** `edge` was not
  authored, deliberately. `dev` gained an instance whose fourth test the artifact
  cannot answer, which is a partial result and is reported as one.
- **Nothing about the enum for the wires it could not name.** SSH, WinRM and the
  coordination wire are each described in prose on the entity that meets them.
  Three refusals to model are evidence that the enum is narrow; they are not a
  design for what should replace it.
- **Nothing about a second reader.** As with the third survey, the described
  project has maintainers who are not the describer, and none of them has checked
  a claim. Every statement in `solutions/stackstorm/` is one outside reader's
  reading of public sources at one tag.
- **Nothing about authoring cost**, for the third record running.
- **One cross-lane gap is measured and is not an ontology finding.** Counted on
  2026-08-22, **41** non-actor protocol participants in this solution carry no
  reciprocal `exposes`/`uses` edge, against 3 in acme and 0 elsewhere. The cause
  is lane ordering — the components were authored while two of the thirteen
  protocols existed, and speculating on the rest would have produced dangling
  references. `W_PROTO_PARTICIPANT_UNLINKED` sits in the portal's debt register
  with no emitter, so the portal reports **0 errors and 42 warnings, none of them
  on this solution**, and the gap is invisible. It is a fact about parallel
  authoring and about an unimplemented check, and it is recorded here so that
  nobody later reads the clean build as evidence the join holds.

## Alternatives considered

- **Eclipse Hono, as 0019 recommended.** The pre-registered choice, and rejected
  here on the ground that testing the block against AMQP 1.0 tests whether the
  block is 0-9-1 — which 0019 already established from the specification, without
  needing a catalog. Reaching the value on its own terms was the harder test and
  it produced a verdict the easy test could not: the block fails for reasons that
  have nothing to do with the version split. **The 1.0 hypothesis remains open
  and remains worth running**, and it is now cheaper, because a decision to
  retire the block would moot it.
- **Zulip.** Apache-2.0, excellent documentation, and its RabbitMQ usage is the
  default exchange only — publishing with an empty exchange name against durable
  named queues. It would have exercised the one corner of the block that happens
  to work, and produced a confirmation nobody should trust.
- **OpenStack Ironic.** Rich `oslo.messaging` usage, rejected because its RPC
  transport is a deploy-time choice between AMQP and JSON-RPC — which is the
  `coordination` finding above, as the *whole* of a candidate rather than as one
  entity inside it.
- **Fix the strains in this record.** Rejected, and the Decision paragraph says
  so for the reason 0019 gave: most of the findings above have a fix that fits in
  a sentence, which is exactly the condition under which a rule gets changed
  without review. The `job` clause and the config ruling are the two that will be
  hardest to leave alone, and they are the two that most need somebody other than
  the author to look at them.
- **Author the catalog around the strains and ship a clean build.** The
  alternative that produces no findings. Rejected, and this time the temptation
  was concrete: six of the eight jobs could have dropped their `exposes` edges,
  the surface list could have gone unremarked as an enumeration, and the whole
  record above would have been replaced by a green build. The catalog instead
  ships 77 `x-` keys, two `x-type-strain` sentences, a protocol with no transport
  artifact, and a journey that says in a note which five processes it cannot
  describe.
- **Wait for a fifth survey before recording any of this.** Rejected on the
  arithmetic. Two of the eight recommendations above rest on a hole a previous
  survey found independently — the config contract, now sighted twice, and the
  transport enum, now sighted four times — and the first of those lands on a lane
  that is locked and shipping in 0.2.0. A finding held back until it is
  unarguable arrives after the release it was about.
