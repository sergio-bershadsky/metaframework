# Worked example — one paragraph of prose to a proposed SRN tree

This walks the interview from `SKILL.md` end to end. It lands on the shape
shipped at `solutions/acme/`, so every decision below can be read against real
files.

Two entries in the business layer are marked `(later)`: `promotion-pricing` and
the `coupon-redemption` journey arrived with the `growth` product, after the
conversation below happened, exactly as the `fulfilment` and `growth` products
themselves did. Everything else in the tree exists on disk today.

## What the user said

> We sell physical goods online. A customer fills a cart and checks out; checkout
> quotes tax, reserves stock, and takes a card payment through our acquirer.
> Finance keeps a double-entry ledger and a nightly job that proves it matches the
> acquirer's settlement file. Support agents issue refunds. Login is homegrown and
> everything uses it. We run staging and production.

Eleven lines of prose. Not one of them says what a product is.

## Round 1 — the boundary

**Q. What is inside this catalog, and what is deliberately outside?**
Customer-facing commerce and checkout; settlement and ledger for orders placed
through them; the internal libraries they depend on. Out: corporate IT, HR, the
finance back office, warehouse robotics, and carrier networks acme does not
operate.
→ `scope.in` / `scope.out` on the solution. The anti-scope is the half people skip
and the half that settles arguments later.

**Q. The acquirer — do you operate it?**
No, it is a third party.
→ **Not** "out of scope". Payment must declare a dependency on it, and relation
edges never accept an actor as a target, so it becomes a component with
`component-type: external`, inside the product that depends on it (**H10**).

**Q. What would you want a newcomer to read first?**
→ `vision`, in the user's own words. Distinct from `summary`, which is the one
catalog line.

## Round 1b — what the business can do

Asked **before** "what do you ship". The eleven lines of prose above are a list
of systems; this round turns them into a list of doings, and the list of doings
is what the deliverables are then judged against.

**Q. What can acme *do* that it would still do after a total rewrite on a
different stack?**
Get parcels to the people who paid for them. Know who someone is.
→ Two capabilities at solution level: `order-fulfilment`,
`identity-verification`. A third, `promotion-pricing`, arrives later with the
growth product `(later)`.

**Q. Say the first one as a sentence starting with a verb.**
"Fulfil an order" — get paid-for goods to the customer who ordered them, on a
date we named, or say truthfully why not.
→ The verb phrase is the `title`, the rest is the `summary`. The slug
`order-fulfilment` reads like the name of a fulfilment service, which is exactly
the confusion the kind exists to prevent; `title` is the countermeasure, and it
is the business's sentence, not engineering's. Note that the summary includes
the failure path on purpose — a fulfilment description covering only the happy
case is the one that leaves the customer with neither goods nor a refund.

**Q. "Run the reconciliation job" — is that one of them?**
It dies with the job.
→ Not a capability. It is a component (`billing/component/reconciliation`).
Apply the rewrite test to every candidate and most of the list falls away; what
survives is short, and a short list is the honest outcome.

**Q. "Dispatch within 24 hours at p95" — is that one?**
It is decidable, pass or fail.
→ A **requirement**, not a capability. Capabilities are never "done" and never
unmet; obligations are both.

**Q. "Verify who someone is" — which product owns it?**
Identity issues the sessions, but the shop verifies at the point of sale.
→ Neither, and that is why capabilities are solution-level. Two products
`realizes` it and no product owns it; had it been product-scoped, the second
product would have had to duplicate the description or reach into the first
one's bucket.

**Q. What path does a customer take, first contact to outcome?**
Arrive on the storefront, make an account, pay, watch the parcel arrive.
→ One journey, `first-purchase`, protagonist `/actor/customer`, eight steps.
Returns are a different outcome, so they are a second journey, not a branch of
this one.

**Q. Where does that path leave one team's territory?**
shop → identity → shop → fulfilment.
→ Three crossings, and every one of them is carried by the customer rather than
by a system: they retype, they follow a link from a mail. All three are written
`protocol: none` — the documented negative. That is a claim a reviewer can grep
for, and it is deliberately not the same as leaving `protocol` off, which means
"not written down yet" and would be `W_JRN_UNDOCUMENTED_INTEGRATION` (**H13**).
Three actor-carried hops on the path the business is judged on is itself the
finding worth reporting; the fix is three protocols, not an edit to the journey.

**Q. How would you know order fulfilment is going well — one number?**
The share of parcels that arrive by the date we promised.
→ `product/fulfilment/metric/delivery-on-time-rate`, `metric-type: ratio`,
`direction: higher-is-better` — filed in the fulfilment product's bucket
because that is who answers for the number, and pointing at the solution-level
capability with `measures`. Placement says *whose number*; `measures` says
*what it is about*; a component-owned metric measuring a solution-level
capability is the ordinary case, not an error.

**Q. Anything else about that same capability?**
Conversion — the share of sessions that end in a placed order.
→ `product/shop/metric/checkout-conversion`, also pointing at
`order-fulfilment`. Two metrics on one capability is the normal ratio: one
capability, several numbers. The reverse — one metric with two subjects — is
legal only when the same observation, computed the same way, measures each.

**Q. And identity verification?**
Nobody answered.
→ Recorded as an open question rather than invented (**H14**).
`identity-verification` ships genuinely unmeasured, and the catalog says so
rather than acquiring a number to fill the column.

## Round 2 — deliverables and ownership

**Q. What do you ship, and who gets paged when it breaks?**
The storefront and checkout (`team-shop`); the ledger and the reconciliation job
(`team-billing`, who also carry the auditor and a seven-year retention
obligation); login (`team-identity`).

**Q. Does each of those have its own roadmap and its own budget line?**
Yes.
→ Three products: `shop`, `billing`, `identity` (**H1**). Three is inside the 3–7
band, so no redraw is indicated (**H8**). The shipped fixture has since grown
`fulfilment` and `growth` by exactly these questions.

**Q. Is the storefront a separate deliverable from checkout — its own release
train, its own roadmap?**
No, it ships with checkout.
→ One product, not two. This is the frontend/backend trap: had the answer been
yes, the storefront would have become `component/storefront` with
`component-type: ui` **inside `shop`** — a component either way, never a second
product. Layers are not products.

**Q. Why is the ledger not simply part of shop?**
Because the product line is the ownership line, and the accounting rules, their
auditor, and the retention obligation belong to `team-billing`. Checkout's use of
the ledger is reuse **by reference** — a `depends-on` edge on checkout's own page,
never a copy in shop's subtree (**H9**).

**Q. Login is used by everything. Does it depend on anything?**
It must not. Every product may depend on identity, so identity may depend on no
product, or the graph gains a cycle no deployment order satisfies (**H7**). What
it consumes instead is solution-level shared vocabulary — which is precisely why
that vocabulary sits at the root.

## Round 3 — the seams

**Q. Inside shop, what could be deployed, released, or replaced on its own?**
Checkout; stock availability; the card-payment conversation; the tax calculator.

**Q. Does the tax calculator run beside checkout or inside it?**
Inside — it is a package compiled into checkout's process.
→ `component-type: library`. A library has nowhere to run, so it declares no
environment; the component embedding it does, and the deployment view derives the
library's reach from that.

**Q. Does the payment code ever ship without checkout?**
No — but the acquirer behind it would be swapped independently.
→ `payment` is *part of* checkout, so it nests one `component/` bucket deeper —
`srn://acme/product/shop/component/checkout/component/payment` (**H9**,
composition). The acquirer nests one level further again as its own `external`
component, which makes swapping it a swap of exactly one entity.

**Q. Does stock ever change in the same commit as checkout?**
No — different rota, separate deploy.
→ A sibling component `inventory`, not a nested one (**H2**). Had the answer been
"always", the two would have been one component with more files in it.

**Q. Billing — one thing or two?**
A ledger with an API, and a nightly job.
→ `ledger` (`component-type: service`) and `reconciliation`
(`component-type: job`). Different shapes, different cadences, different failure
modes.

## Round 4 — the conversations

**Q. What talks to what, and across which ownership boundary?**

| Conversation     | Participants                             | NCA over `{kind}/{name}` pairs |
|------------------|------------------------------------------|--------------------------------|
| Placing an order | checkout, inventory, payment             | `product/shop`                 |
| Quoting tax      | checkout, tax-engine                     | `component/checkout`           |
| Money settling   | payment, ledger, reconciliation          | the solution root              |
| Refunding        | support-agent (actor — excluded), ledger | `component/ledger`             |

Actors are excluded from the NCA computation on purpose: they are solution-level,
so counting them would collapse every protocol to the root and destroy the signal.

**Q. One protocol landed at the solution root. Is that a boundary problem?**
No. One deliberate bus between two vertical products is the design — it is exactly
why a ledger outage is a backlog rather than a checkout outage. If three of the
four had landed at the root, the product boundaries would be wrong and the
proposal would say so (**H4**).

**Q. Which crossings are contracts you would version, and which are just "A needs
B to exist"?**
→ The four above are protocols. Everything else stays a `depends-on` edge. A
protocol per method call produces a catalog nobody reads.

## Round 5 — the vocabulary

**Q. Which nouns appear in more than one part of the system?**
An amount, everywhere. A failure envelope on every boundary crossing. An id and a
created-at on every record. An order line — in the cart, in the order, and in the
fact that gets published.

**Q. Whose definition is "money"?**
Nobody's in particular.
→ Solution root: `money`, `problem`, `base-record`, `auditable`. The last two are
`abstract: true` — mixins, never instantiated on their own.

**Q. Whose definition is "order line"?**
Shop's. Others read it.
→ `/product/shop/datamodel/order-line`, and consumers reference it across product
boundaries rather than owning a copy (**H3**). In the shipped fixture
`product/fulfilment` does exactly that.

**Q. Is each of these stored, exchanged, or both?**
→ `usage`. `money: both`, `problem: exchange` — a problem is never persisted as a
record of anything.

## Round 6 — people and places

**Q. Who or what starts work from outside the system?**
Customers, support agents, shop admins, merchant operators, and a release bot.
→ Actors, at solution level, and only there (**H5**). The acquirer is *not* among
them — see Round 1.

**Q. Where does it run?**
Staging and production.
→ Environments, at solution level. A component declares where it runs with an
ordinary `uses` edge pointing at one; environments never keep a roster.

## Round 7 — constraints and decisions

**Q. What must hold regardless of how it is built?**
Guest checkout; a p99 latency budget; idempotent capture; erasure on request
everywhere; an audit trail on the ledger.
→ Requirements in the bucket of the container responsible: `idem-cap` and
`p99-checkout-latency` on checkout, `guest-checkout` on shop, `audit-trail` on
billing, `gdpr-erasure` at the solution root because it binds everything.

**Q. What did you decide that you would have to defend later?**
→ ADRs: single currency (solution), event sourcing and change-data-capture (shop),
double-entry (billing).

## The proposal

Present the tree, the decision table, and the open questions — then stop and wait.

```text
srn://acme                           solution — vision, scope, contacts
├── capability/order-fulfilment      "Get paid-for goods to the customer"
├── capability/identity-verification realized by identity + shop — no owner
├── capability/promotion-pricing     (later) arrived with product/growth
├── journey/first-purchase           actor: customer, 8 steps, 3 crossings
├── journey/coupon-redemption        (later) actor: customer, 6 steps
├── actor/customer                   human
├── actor/shop-admin                 human
├── actor/support-agent              human
├── actor/merchant-operator          human
├── actor/release-bot                service-account
├── environment/staging
├── environment/production
├── datamodel/base-record            abstract mixin: id + created-at
├── datamodel/auditable              abstract mixin: who changed it
├── datamodel/money                  usage: both
├── datamodel/problem                usage: exchange
├── requirement/gdpr-erasure         binds every product
├── adr/0001-single-currency
├── protocol/settlement              style: bus — NCA = solution root
├── product/shop                     owner: team-shop
│   ├── component/checkout           service
│   │   ├── component/payment        service — part of checkout
│   │   │   ├── component/psp        external — the acquirer
│   │   │   └── datamodel/order
│   │   ├── component/tax-engine     library — runs inside checkout
│   │   ├── datamodel/cart
│   │   ├── protocol/tax-quoting     NCA = checkout
│   │   ├── requirement/idem-cap
│   │   └── requirement/p99-checkout-latency
│   ├── component/inventory          service — separate deploy rota
│   ├── datamodel/order-line         shop owns the definition
│   ├── datamodel/order-request
│   ├── datamodel/order-placed       the fact other products consume
│   ├── datamodel/order-confirmation
│   ├── datamodel/payment-method     plus card- and sepa- variants
│   ├── protocol/order-placement     NCA = shop
│   ├── requirement/guest-checkout
│   ├── requirement/multi-currency-pricing
│   ├── metric/checkout-conversion   measures a shop requirement
│   ├── adr/0001-event-sourcing
│   └── adr/0002-change-data-capture
├── product/billing                  owner: team-billing
│   ├── component/ledger             service
│   │   └── protocol/refund-request  NCA = ledger (actor excluded)
│   ├── component/reconciliation     job — nightly
│   ├── datamodel/ledger-entry
│   ├── requirement/audit-trail
│   └── adr/0001-double-entry
└── product/identity                 owner: team-identity — horizontal
    ├── component/registration       service — writes accounts
    ├── component/authentication     service — issues sessions
    ├── component/acl                service — the decision point
    ├── component/session-store      datastore — revocation in seconds
    └── metric/p99-authz-check       measures an identity requirement
```

### The coverage table

Presented next to the tree, because this is where the design fails visibly:

Every number below is a real count against the shipped fixture:

| Capability              | `status` | Realizers | Products         | Metrics | Journeys                          |
|-------------------------|----------|-----------|------------------|---------|-----------------------------------|
| `order-fulfilment`      | approved | 5         | shop, fulfilment | 2       | first-purchase, coupon-redemption |
| `identity-verification` | review   | 2         | identity         | **0**   | first-purchase                    |
| `promotion-pricing`     | draft    | 3         | shop, growth     | **0**   | first-purchase, coupon-redemption |

Three readings, reported as findings rather than filled in silently:

- Nothing is unrealized. Every capability has components behind it, so nothing
  trips **H11** — worth saying out loud, because "no findings" is a result.
- Two of three have no metric. That is the day-one normal and it is a column,
  not an alarm (**H14**). The one worth pressing on is `identity-verification`:
  identity has a `p99-authz-check` metric already, but it measures a
  *requirement*, so the capability itself still has no number.
- Nothing trips **H12**: the widest spread is two products, which is the
  ordinary case capabilities are solution-level *for*. Had `order-fulfilment`
  been realized out of shop, billing, identity and fulfilment, the finding would
  be that the products were drawn along teams while the business runs across
  them. Note that `promotion-pricing` is realized partly out of `shop` — a
  capability the growth product owns, with one slice inside somebody else's
  product, is exactly the shape that becomes an **H12** finding if it spreads
  twice more.

### Decisions and the alternatives rejected

| Decision                                    | Rejected alternative                    | Why                                                                              |
|---------------------------------------------|-----------------------------------------|----------------------------------------------------------------------------------|
| `shop` and `billing` are peer products      | `billing` as a component of `shop`      | Ownership line, auditor, retention obligation (**H1**)                           |
| Storefront is not its own product           | `product/storefront`                    | Same release train as checkout — a layer, not a deliverable (**H1**)             |
| `payment` nests inside `checkout`           | Sibling component under `shop`          | Composition: payment is part of checkout (**H9**)                                |
| `inventory` is a sibling, not nested        | Nested under `checkout`                 | Checkout calls it; calling is an edge, not containment (**H9**)                  |
| `psp` is a component, not an actor          | `actor/acquirer`                        | `depends-on` and `uses` never accept an actor (**H10**)                          |
| `tax-engine` is a component, not a product  | `product/tax`                           | No roadmap or budget of its own; it is a library (**H1**)                        |
| `settlement` sits at the solution root      | Inside `billing`                        | NCA of participants spanning both products (**H4**)                              |
| `money` at the root, `order-line` in `shop` | Both at the root                        | Shop owns what a line means; nobody owns money (**H3**)                          |
| `identity` is a third product               | An `auth` component inside each product | Cross-cutting: model once, reference everywhere (**H7**)                         |
| `identity` has no `depends-on`              | `depends-on: /product/shop`             | Would create a cycle every login depends on (**H7**)                             |
| Capabilities at solution level              | `product/identity/capability/…`         | Two products realize one doing; no product can own it                            |
| `reconciliation` is not a capability        | `capability/reconcile-settlement`       | It dies with the job — the rewrite test (**H11**)                                |
| Returns are a second journey                | An `alt` branch in `first-purchase`     | Different outcome; a journey that branches is two journeys                       |
| `delivery-on-time-rate` inside `fulfilment` | At the solution root                    | Placement says *whose number*; fulfilment answers for this one                   |
| Every crossing written `protocol: none`     | Leaving `protocol` off the step         | `none` is a claim; an omission is indistinguishable from forgetfulness (**H13**) |

### Open questions to put back to the user

- Does `merchant-operator` act on the shop, on billing, or on both? The answer
  changes which products list it under `primary-actors`.
- Is refunding a protocol on the ledger, or an operation of `settlement`? Modelled
  here as its own protocol because a human initiates it.
- Is `session-store` a `datastore` the ACL owns, or an independent component? Only
  the deploy rota answers this.
- What number would say `identity-verification` is going well — verification
  success rate, or time to reach an assurance level? Two candidates, so two
  metrics or one decision; either way not invented here.
- Is `promotion-pricing` really realized out of `shop`, or is checkout merely a
  client of the growth product? The answer decides whether a fourth product
  realizing it later is growth or a boundary problem (**H12**).
- Is every component `lifecycle: released` today, or is `fulfilment` still being
  built? The field is required and there is no default; guessing it is the one
  error it exists to prevent.

## A settled product, field by field

`solutions/acme/product/shop/index.md`'s frontmatter, **annotated**: every key
and value below is the file's, and every `#` note is added here. It is therefore
not a block to copy — the copyable form is `worked-examples.md`, which reproduces
this same file whole and is byte-checked against it on every push.

```yaml
---
name: shop                    # MUST equal the directory name
kind: product                 # MUST equal the bucket
version: 4
title: Shop
summary: Customer-facing storefront, cart, and checkout for the acme retail business.
status: approved              # the document's state, not the product's
owner: team-shop
lifecycle: active             # the product's state in the world
primary-actors:
  - /actor/customer           # solution-absolute; MUST resolve to an actor
  - /actor/support-agent
relations:                    # forward edges only — inverses are derived
  exposes:
    - /product/shop/datamodel/order-placed@1
  depends-on:
    - /product/billing/component/ledger
  implements:
    - /product/shop/requirement/guest-checkout
  uses:
    - /datamodel/money@1
tags:
  - commerce
  - customer-facing
x-cost-center: "4711"         # unknown top-level fields need the x- prefix
---
```

The business layer adds one edge and takes nothing away — the `realizes` list,
pointing up at the solution-level capabilities the thing carries. It goes next
to the other forward edges, and the capability never answers back:
`realized-by` is derived.

In acme that edge sits on the **components**, not on `shop` itself, and the
product's own frontmatter above is untouched by the business layer. That is
worth noticing: a product realizes a capability when the whole deliverable is
how the business does it; a component realizes one when it carries a slice.
`shop/component/checkout` carries two slices —
`solutions/acme/product/shop/component/checkout/index.md`:

```yaml
relations:
  realizes:
    - /capability/order-fulfilment      # the reservation slice, at the point of sale
    - /capability/promotion-pricing     # and the pricing slice growth owns
```

Partial realization is not marked and needs no field: a component carrying one
slice writes the same edge as a product carrying all of it. Splitting the edge
into "fully" and "partially" would ask every author to judge a percentage
nobody could check — if the split matters, say which slice in prose and put the
number in a metric.

A component's frontmatter gains the required `lifecycle` field on the same
pass — `component-type` says *what kind of thing it is*, `lifecycle` says
*whether it exists yet*, and `status` says whether this page has been reviewed.
Three different questions, three fields, no overlap.

## After sign-off

Write targets before referrers so the check stays meaningful: solution `index.md`
→ capabilities → actors and environments → products → components outermost first
→ datamodels → protocols → journeys → requirements, metrics and ADRs.

Capabilities are first because they reference nothing and are referenced by
`realizes` from almost everything. Journeys are last but for the leaf kinds,
because every `touches` and every `protocol` in `journey.yaml` must already
resolve — a journey written early is a page of `E_SRN_DANGLING`.

Delegate each entity to the skill that knows its kind — `model-data`,
`protocol-design`, `add-entity` — rather than hand-rolling frontmatter, then run:

```bash
metaframework check
```

from anywhere in the catalog repository — it walks up for `solutions/` the way
git walks up for `.git`, so acme is checked the same whether it sits in the
framework repository or in a repository of its own. Report pass/fail and every
diagnostic with its code and file; zero errors is the pass condition.
