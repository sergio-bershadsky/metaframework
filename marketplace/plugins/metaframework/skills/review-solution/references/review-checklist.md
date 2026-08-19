# Review checklist — symptom, confirmation, fix, cost

One entry per thing to look for: what it looks like in the catalog, how to
confirm it is real, the false positives that look identical, the fix, and what
the fix costs. Entries coded `R_*` are surfaced by `scripts/catalog_facts.py`;
the rest are judgement calls no script makes.

Cost matters because of one rule: **entities are never moved or renamed**. Any
fix that changes an entity's path is a swap — successor, migration window,
deprecation — so "just move it" is never a small fix, and a review that omits
the cost invites a `git mv` that destroys the history.

---

## R_ORPHAN — an entity nothing reaches and that reaches nothing

**Symptom.** An entity with no `relations` and no incoming reference of any kind
— no edge, no protocol participant, no schema `$ref`, not even a prose link.

**Confirm.** Grep for its name across the catalog; the collector already did,
but a name that is also an ordinary English word produces hits it discounted.
Then read the entity: does it describe something that exists?

**False positives.** A newly landed entity mid-authoring. A datamodel that only
appears as a protocol message payload named in `workflows/*.yaml` (message names
are logical, not SRNs — the graph cannot see them; check the protocol's
artifacts). An `abstract: true` base referenced only by `allOf` in a schema the
collector could not parse.

**Fix.** Usually the missing edge, not the missing entity: some component
genuinely uses it and never said so. Add the forward edge on the consumer
(`uses`, `exposes`, `implements`) and bump that consumer's version. If nothing
uses it and nothing will, deprecate it — never delete.

**Cost.** In place, one version bump per edge added.

---

## R_DEPRECATED_LIVE_REF — a live reference to a deprecated entity

**Symptom.** An entity with `status: deprecated` that still receives structural
references (`relations`, `participants`, `$ref`). The portal flags each such
reference `W_REF_DEPRECATED`.

**Confirm.** Separate structural referrers from prose. Prose pointing at a
retired concept is correct and should stay: the deprecated entity is the address
of the history.

**False positives.** A `supersedes` edge from the successor — that is the swap
working as designed, not a live dependency. An ADR with `decision-status:
superseded` is **not** deprecated, and referencing it is normal; only
`status: deprecated` counts.

**Fix.** Finish the swap: migrate each referrer to the successor one at a time
(`evolve-entity`), then confirm the census is empty. If there is no successor,
the deprecation was premature — say so.

**Cost.** One version bump per referrer. No swap: the successor already exists.

---

## R_SWAP_UNFINISHED — a successor exists, the predecessor was never marked

**Symptom.** Entity A carries `supersedes: [B]`, and B is still `approved` (or,
for an ADR, its `decision-status` is not `superseded`).

**Confirm.** Look at the referrer census for B. If referrers remain, the swap is
legitimately mid-window: record it as an open migration with a count, not as a
fault.

**False positives.** A deliberately long window — the successor sits in `review`
while referrers wait for it to be approved. The shipped acme catalog holds the
mirror image: `merchant-operator` is still in `review` while `shop-admin` is
already deprecated, because nothing structural pointed at the old actor.

**Fix.** Deprecate B once nothing structural points at it. For an ADR, set
`decision-status: superseded` with the successor's date and bump B's version; do
**not** set `status: deprecated` on an ADR.

---

## R_PROTOCOL_NCA — the protocol drifted away from its participants

**Symptom.** The protocol directory sits somewhere other than the nearest common
ancestor of its component and product participants, computed over whole
`{kind}/{name}` pairs. Actors are excluded from the computation — they are
solution-level, and counting them would push every protocol to the root.

**Confirm.** List the participants' SRNs and compute the NCA by hand; the
collector prints both sides. Then decide **which side is wrong**: the directory
or the participant list. A participant added last week to what has always been a
two-component conversation is often the mistake.

**False positives.** A swap in progress: the participant list may legitimately
lead the directory by a commit or two. The portal only warns
(`W_STRUCT_PROTOCOL_NCA`) for exactly this reason.

**Fix.** If the participant list is right, the protocol must live at the NCA —
a swap, because moving a directory is forbidden. If the list is wrong, correct it
in place with a version bump. Always say which one the review concluded.

**Cost.** Swap: one successor protocol plus every referrer (components'
`exposes`/`uses` edges, ADRs, requirements).

---

## R_PRODUCT_ONE_COMPONENT — a product that is one component

**Symptom.** A `product` bucket with exactly one `component` below it.

**Confirm.** Read the product's `vision`/`summary` and the component's. If they
say the same thing twice, the product is ceremony. If the product is genuinely a
customer-nameable offering that happens to be built from one service today, it
is fine and will grow.

**False positives.** A young product, deliberately staked out early. A product
whose substance is datamodels and protocols rather than components.

**Fix.** Usually none, or "grow it". Collapsing the product into a component
means swapping the entire subtree — see the container-rename cost in
`evolve-entity/references/swap-walkthrough.md`. Never propose that lightly.

---

## R_REQ_UNIMPLEMENTED — an obligation nobody owns

**Symptom.** A `requirement` with `priority: must` (or `should`) that no
component or product `implements`.

**Confirm.** Grep for the requirement's name; some catalogs express the claim in
prose without the edge, which is the missing-edge case, not the unowned-
requirement case.

**False positives.** A requirement scoped to a product that has not been built
yet — legitimate when the product's `lifecycle` says `concept`.

**Fix.** Add `implements` on the component that actually satisfies it. Where two
components each satisfy half (checkout owns the idempotency key, payment
guarantees the replay never reaches the acquirer twice), both claim it and the
requirement sits at their common ancestor — that pattern is correct, not
duplication. If nothing implements it and nothing will, the honest fix is
`priority: wont` plus prose, or a swap to a narrower requirement.

---

## R_ENV_UNUSED / R_ACTOR_UNWIRED — the description stops short

**Symptom.** An `environment` no component declares `uses` toward (the
deployment roster is derived from those edges, so nothing runs there), or an
`actor` named by no protocol `participants` entry and no product
`primary-actors`.

**Confirm.** For the actor, check whether its `goals` are served anywhere at all.
A goal no protocol, workflow or requirement serves is a hole in the description
even when some component links the actor in prose.

**False positives.** A new environment staked out before the migration. An actor
that appears only as a `uses` source — an internal role acting through tooling no
protocol describes yet. The acme `merchant-operator` is exactly that, and its own
prose says the write path into inventory is still unmodelled. That honesty is the
right outcome; the finding is still worth reporting once.

**Fix.** Add the edge, name the actor in the protocol that serves its goal, or
retire the entity via deprecation.

---

## R_DM_UNDER_PROMOTED — shared vocabulary trapped under one owner

**Symptom.** A datamodel owned by a component or product is `$ref`ed or `uses`d
from outside that owner's subtree. Scope is a claim about responsibility: a model
under `component/checkout` says "only checkout is responsible for this".

**Confirm.** Only structural referrers count — a requirement or an ADR naming a
model is talking *about* it, not sharing it, and the collector filters those out.
Look at who the outside referrers are: another product is a strong signal, a
sibling component under the same product is weaker.

**False positives.** An event datamodel deliberately published by one product for
others to consume (`usage: exchange`) is *meant* to be referenced widely and
still belongs to its publisher. Read the summary before flagging.

**Fix.** Promote to the bucket of the common ancestor of all referrers — a swap,
because the path changes. Weigh it against leaving the ownership claim as it
stands, which is often right for published events.

---

## R_DM_OVER_PROMOTED — vocabulary generalized too early

**Symptom.** A solution-level datamodel that only one product's subtree
references.

**Confirm.** Read the model. Solution-level is a claim that the whole solution
shares this vocabulary; the claim can be true on day one and unexercised for a
year. When this file was written the collector flagged
`srn://acme/datamodel/problem` — the RFC 9457 failure shape — because only the
identity product referenced it yet. That is a deliberate solution-wide contract
and the correct verdict is "no change".

**Fix.** Usually nothing. Flag it only when the model encodes one owner's
specifics (a field only that product could populate, an enum of its internal
states), which makes it a shared name over an unshared meaning.

---

## R_DM_NEAR_DUPLICATE — two models describing the same thing

**Symptom.** Two schemas whose property sets are ≥80% identical.

**Confirm.** Read both. Genuine duplication looks like copy-paste with one field
renamed; legitimate similarity looks like two variants of one concept that were
never united.

**False positives.** Branches of a discriminated union. A wire model and its
stored counterpart, which deliberately differ in one or two fields.

**Fix.** Either promote the shared shape to its own datamodel that both `$ref`
(additive on both — no swap), or make them branches of a `oneOf` tagged by a
shared `const`. If one is simply redundant, deprecate it via the swap.

---

## R_ADR_ABSENT and decisions with no record

**Symptom.** A product with several components and no ADR anywhere in its
subtree. That is the crude case only; the real check is manual.

**Confirm.** Ask which decisions this catalog *implies*, then look for their
records: the split of a product into these components rather than others; the
persistence or messaging style visible in the protocols; every
`component-type: external` dependency; each `scope.out` line; any datamodel
carrying a policy (a currency set, a retention period).

**Fix.** Write the ADR now, dated when the decision was actually taken, with
`decision-status: accepted` and the real `deciders`. A retrospective ADR is worth
more than no ADR, and the four required sections (`## Context`, `## Decision`,
`## Consequences`, `## Alternatives considered`) force out what was weighed.

---

## Components that always change together

**Symptom.** Two component directories that appear in the same commits, again and
again.

**Confirm.**

```bash
git log --format='%H' --name-only -- solutions/<name> |
python3 -c "
import sys, re, collections, itertools
pat = re.compile(r'solutions/[^/]+/(?:product/[^/]+/)?(?:component/[^/]+/)*component/[^/]+')
pairs, singles, cur = collections.Counter(), collections.Counter(), set()
def flush():
    for c in cur: singles[c] += 1
    for a, b in itertools.combinations(sorted(cur), 2): pairs[(a, b)] += 1
for line in sys.stdin:
    line = line.strip()
    if not line:
        flush(); cur.clear(); continue
    m = pat.match(line)
    if m: cur.add(m.group(0))
flush()
for (a, b), n in pairs.most_common(15):
    print(f'{n:3d} of {singles[a]:3d}/{singles[b]:3d}  {a}  +  {b}')
"
```

Read the ratio, not the count: 9 shared commits out of 10 is a boundary that is
not real; 9 out of 90 is normal collaboration.

**False positives.** A bulk edit (renaming a shared datamodel, an owner change)
inflates every pair at once. Exclude mechanical commits before concluding.

**Fix.** Merge into one successor component and deprecate both — an expensive
swap. Propose it only when co-change is near-total *and* the summaries overlap
*and* one team owns both. Otherwise report it as an observation.

---

## Components doing several unrelated jobs

**Symptom.** A `summary` that needs "and" to be true; `exposes` toward protocols
with disjoint participant sets; a name from the vague family (`core`, `common`,
`shared`, `platform`, `manager`); everything in the product `depends-on` it.

**Confirm.** State each job in one sentence. If two sentences share no nouns,
they are two components. Then ask whether two teams could own the halves without
contending for the same files.

**Fix.** Split: one successor per capability, `supersedes` on each, migrate
referrers one at a time, deprecate the original. The actor split
(`shop-admin` → `merchant-operator` + `support-agent` + `release-bot`) in
`evolve-entity/references/swap-walkthrough.md` is the same manoeuvre on a
different kind.

---

## Cross-cutting concerns copied rather than referenced

**Symptom.** The same property cluster in several schemas (`created-at` +
`created-by`, an address, an amount/currency pair); the same paragraph of prose
in several `index.md` files; the same enum written out twice.

**Confirm.**

```bash
python3 -c "
import json, glob, collections
c = collections.Counter()
for p in glob.glob('solutions/<name>/**/schema.json', recursive=True):
    for k in (json.load(open(p)).get('properties') or {}): c[k] += 1
for k, n in c.most_common(30):
    if n > 1: print(f'{n:3d}  {k}')
"
```

Repeated property names are the cheap signal — then read whether the repetitions
mean the same thing. Two `status` properties with different enums are not
duplication; two `amount`/`currency` pairs are `money` written out twice.

**Fix.** Promote to one datamodel entity and `$ref` it from each — additive on
every referrer, no swap, because the instance shape does not change. For a
cluster that is genuinely a mixin, make it `abstract: true` and compose with
`allOf`; remember that a base must never set `"additionalProperties": false`.

**Cost.** One new entity, one version bump per referrer. The cheapest structural
improvement in the framework, which is why it is worth reporting even when the
duplication is small.

---

## Twin entities

**Symptom.** Two summaries that cannot be told apart, in any kind — two actors that
are one role, two requirements stating the same obligation, two protocols
describing one conversation.

**Confirm.** Read them side by side and try to state the difference in one
sentence. If the sentence needs a "well, technically", they are twins.

**Fix.** Keep the better-named one, swap the other into it (`supersedes`),
migrate referrers, deprecate. If both names are wanted, the real finding is that
the *concept* is under-specified — fix the summaries first and re-review.
