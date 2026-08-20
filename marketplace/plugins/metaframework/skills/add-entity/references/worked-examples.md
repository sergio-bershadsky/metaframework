# Worked examples — one complete `index.md` per kind

> Every file below is reproduced **verbatim** from the reference solution at
> `solutions/acme/` in the metaframework repository. When that repository is
> present, read the originals; this bundled copy exists because an installed
> plugin cannot see them. Nothing here is invented — if a field, heading or
> phrasing looks surprising, it is because the fixture is deliberately teaching
> something at that spot.
>
> Ten kinds, one section each. `journey` is the only one that carries a second
> file: its `journey.yaml` is REQUIRED and is reproduced with it.

Read the file for the kind being written, then the note under it, which names
the decision the example demonstrates. The rules themselves live in
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/` (or `framework/spec/` when
present, which wins).


## `solution`

`solutions/acme/index.md`

````markdown
---
name: acme
kind: solution
version: 3
title: Acme Retail Platform
summary: The retail platform describing acme's storefront, checkout, and billing systems as one reviewable catalog.
status: approved
owner: team-platform
vision: |
  One described universe for everything acme sells online: a single catalog in
  which every product, component, protocol, and data model is addressable,
  reviewable in git, and rendered by the portal without a second source of
  truth. The catalog is the contract between the teams — the code repositories
  implement it, they do not define it.
scope:
  in:
    - Customer-facing commerce and checkout systems.
    - Settlement, ledger, and reconciliation for orders placed through them.
    - Internal libraries and tooling those systems depend on.
  out:
    - Corporate IT, HR, and the finance back office.
    - Warehouse robotics and carrier networks acme does not operate.
    - Anything acme neither owns nor operates — modelled as external components.
contacts:
  - role: architect
    handle: s.bershadsky
    channel: "#acme-arch"
  - role: product-lead
    handle: j.okonkwo
  - role: on-call
    handle: team-platform
    channel: "#acme-oncall"
relations:
  uses:
    - /environment/production
    - /datamodel/money@1
tags:
  - retail
  - flagship
---

# Acme Retail Platform

Acme sells physical goods online. This catalog describes the systems that take an
order from a customer's cart to a settled payment and a posted ledger entry. It
is a description, not an implementation: every repository that builds one of
these components is expected to match what is written here, and a divergence is
a defect in one of the two.

Two products divide the universe. [shop](srn://acme/product/shop) owns everything a
customer touches — cart, checkout, payment orchestration, stock availability.
[billing](srn://acme/product/billing) owns everything that happens after the money moves
— the double-entry ledger and the reconciliation job that proves it balances.
The two meet on exactly one surface, the solution-level
[settlement](srn://acme/protocol/settlement) bus, which is why that protocol
lives at the solution root rather than inside either product.

## Reading order

Start with the [shop](srn://acme/product/shop) product, then its
[checkout](srn://acme/product/shop/component/checkout) component and the
[payment](srn://acme/product/shop/component/checkout/component/payment) sub-component beneath it. The
vocabulary shared by both products is small on purpose:
[money](srn://acme/datamodel/money@1) for every amount,
[base-record](srn://acme/datamodel/base-record@1) for identity and creation
time, and [problem](srn://acme/datamodel/problem@1) for every failure that
crosses a boundary.

## Boundary

Everything acme does not operate — the card acquirer, the carrier APIs — is
described as an `external` component inside the product that depends on it, at
the fidelity that product needs. No reference in this catalog leaves
`srn://acme`; the solution is a sealed universe, and that is what makes it
movable and reviewable as one unit.

## Conventions

Amounts are decimal strings, never floats. Timestamps are RFC 3339 in UTC.
Identifiers on the wire are UUIDs. Where a rule could not be expressed in a
schema it is written as a requirement with acceptance criteria, and the
component that takes it on says so with an `implements` edge.
````

**What this example teaches**

`vision` is the paragraph a newcomer reads first; `summary` is the one
catalog line. They are different fields because they answer different questions,
and a `vision` that repeats the `summary` wastes the only place a solution gets
to explain itself.

`scope.out` is the anti-scope and is doing the most work in this file — three
lines that pre-empt every future argument about whether something belongs. Write
it before `scope.in` if that helps; a scope with no `out` is a scope nobody has
tested.

Note what the body carries and the frontmatter cannot: a **reading order**, the
boundary rule for things acme does not operate, and the conventions (decimal
strings, RFC 3339, UUIDs) every entity below inherits. Note also that the
solution declares only two relations — it is a container, and its substance is
its children plus this prose.

## `product`

`solutions/acme/product/shop/index.md`

````markdown
---
name: shop
kind: product
version: 4
title: Shop
summary: Customer-facing storefront, cart, and checkout for the acme retail business.
status: approved
owner: team-shop
lifecycle: active
primary-actors:
  - /actor/customer
  - /actor/support-agent
relations:
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
x-cost-center: "4711"
---

# Shop

Everything a customer touches between browsing and a confirmed order.
Fulfilment and settlement happen elsewhere: shop takes the money, publishes the
fact, and stops there.

## Components

- [checkout](srn://acme/product/shop/component/checkout) — cart to order, tax quoting, payment
  orchestration. The only component a customer's browser talks to.
- [inventory](srn://acme/product/shop/component/inventory) — stock availability and the
  reservation that holds it during a checkout attempt.

Beneath checkout sit two more: [payment](srn://acme/product/shop/component/checkout/component/payment),
which owns the conversation with the card acquirer, and
[tax-engine](srn://acme/product/shop/component/checkout/component/tax-engine), a library that runs inside
checkout's own process. Nesting here is composition, not dependency — payment is
*part of* checkout, whereas checkout's need for
[ledger](srn://acme/product/billing/component/ledger) is an edge that crosses the product
boundary.

## Public surface

The product's own public surface is one datamodel,
[order-placed](srn://acme/product/shop/datamodel/order-placed@1) — the fact other
products may consume. The protocols are exposed by the components that serve
them, so the portal's surface list for this product is the union of both, derived
rather than restated here.

## Ownership and reuse

`team-shop` owns this product and everything under it, including the ADRs and
requirements in its buckets. The dependency on
[ledger](srn://acme/product/billing/component/ledger) is reuse by reference: the component stays in
the billing subtree, owned by `team-billing`, and is never copied here. What
shop actually speaks of it is the [settlement](srn://acme/protocol/settlement)
bus, declared on the payment component that speaks it.

## Lifecycle

`lifecycle: active` and `status: approved` say different things and both are
true: the product is in production and invested in, and this description of it
has been reviewed. They move independently — a retired product may keep an
approved description forever.
````

**What this example teaches**

`lifecycle: active` and `status: approved` are both true and say different
things: the product is in production and invested in, and this description of it
has been reviewed. The body says so explicitly, which is worth copying — it is
the field pair authors most often collapse into one.

`primary-actors` is a typed field, **not** a relation edge, because no v1 edge
type accepts an actor target. Its entries must resolve to solution-level actors.

The `depends-on` edge toward `/product/billing/component/ledger` crosses a
product boundary and is the fixture's canonical statement of *reuse by
reference*: the component stays in billing's subtree, owned by `team-billing`,
and is never copied here. `x-cost-center` shows the `x-` escape hatch carrying a
local field the framework ignores.

## `component`

`solutions/acme/product/shop/component/checkout/component/tax-engine/index.md`

````markdown
---
name: tax-engine
kind: component
version: 3
title: Tax engine
summary: Library computing tax for a cart from a versioned rate table; runs inside checkout's process.
status: approved
owner: team-checkout
component-type: library
lifecycle: released
relations:
  uses:
    - /datamodel/money@1
  exposes:
    - /product/shop/component/checkout/protocol/tax-quoting
tags:
  - tax
  - library
---

# Tax engine

A build-time artifact with no runtime of its own: it runs inside whatever
process embeds it, which today is exactly one —
[checkout](srn://acme/product/shop/component/checkout). It computes tax for a
[cart](srn://acme/product/shop/component/checkout/datamodel/cart@1) from a rate table versioned on
a legislative calendar.

## Why it declares no environment

A `library` has nowhere to run, so it never declares an environment. The
component that embeds it does, and the deployment view derives the library's
reach from that. Declaring `uses: /environment/production` here would be a
category error, and the framework treats it as one.

## The rate table

Rates are compiled in, not fetched. A tax rate that changes under a running
process is a correctness problem nobody can reproduce afterwards; embedding the
table makes the rate a property of the deployed build, and the diagnostic
accessor in [tax-quoting](srn://acme/product/shop/component/checkout/protocol/tax-quoting) exists
so an operator can ask which vintage is live.

The cost is that a legislative change requires a release of every embedder. With
one embedder that is acceptable; with three it would not be, and the honest
successor would be a service rather than a library.
````

**What this example teaches**

A `library` has nowhere to run, so it declares **no environment** — and the
body spends a section saying why, because `uses: /environment/production` here
would be a category error that reads as legal. The embedding component declares
the environment; the deployment view derives the library's reach from that.

Nesting under `checkout` is composition, not dependency: this component is *part
of* checkout. A sub-component is never a way to express "depends on".

For a relations-heavy component — four edge types at once, mixing environments,
datamodels and protocols under a single `uses` list — see the `checkout`
frontmatter block reproduced in
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/frontmatter.md`.

**`lifecycle: released` on a library.** The field is REQUIRED on every component,
and "released" is a fact about an *artifact*, not about a running process: for a
library it means a version is published and consumers can build against it. It is
answering a different question from `status: approved` two lines above — the
description is reviewed, the thing is shipped — and the two never substitute for
each other. The component enum is `planned | in-development | released | sunset |
retired`, deliberately **not** product's, which stages a funded position rather
than a built thing.

## `actor`

`solutions/acme/actor/customer/index.md`

````markdown
---
name: customer
kind: actor
version: 2
title: Customer
summary: End user who browses the shop, places orders, and tracks their fulfilment.
status: approved
owner: team-commerce
actor-type: human
goals:
  - Pay for a basket without re-entering card details.
  - See an order's status without contacting support.
  - Get money back for a returned item within one working day.
relations:
  uses:
    - /product/shop/component/checkout
tags:
  - commerce
  - external-facing
---

# Customer

A customer is any person holding a shop account, authenticated or in a guest
session. The role says nothing about tenure or spend — segmentation is a concern
of the analytics stack, not of this description, and a description that tried to
carry it would be wrong within a quarter.

## Boundaries

- The customer is never a component. We describe the surfaces they touch —
  [checkout](srn://acme/product/shop/component/checkout) — never their behaviour.
- A person may hold several roles at once. The same human acting on behalf of
  the merchant is the [merchant-operator](srn://acme/actor/merchant-operator)
  actor, and the two must not be merged just because one body performs both.
- Guest sessions are in scope: the
  [guest-checkout](srn://acme/product/shop/requirement/guest-checkout) requirement exists
  precisely because "customer" does not imply "account holder".

## Participation

The customer is the initiating participant of
[order-placement](srn://acme/product/shop/protocol/order-placement) and the `from` of the
`submit-order` step in its `place-order` workflow. Participation is declared on
the protocol side only; this page carries no edge for it, and the portal derives
the lane it gets in every sequence diagram.
````

**What this example teaches**

`goals` are verb-first, one line each, stated from the actor's point of view —
not from the system's. Three goals is a healthy number; a list of twelve is a
role that has not been split yet.

The body describes **surfaces touched, never behaviour**, and spends most of its
length on boundaries: what the role is not, which other actor it is confused
with, and why a guest session is still a customer.

The last section is the rule authors most often break: **participation in a
protocol is declared on the protocol side only.** This page carries no edge for
it; the portal derives the lifeline. The only relation here is a plain `uses`
toward the component the customer actually touches.

## `environment`

`solutions/acme/environment/production/index.md`

````markdown
---
name: production
kind: environment
version: 4
title: Production
summary: Primary customer-facing target for the acme solution — EU-West with a US-East read region.
status: approved
owner: team-platform
environment-type: production
relations:
  uses:
    - /datamodel/money@1
tags:
  - eu
  - regulated
---

# Production

The only target that holds customer data of record. Everything deployed here is
`status: approved` at the version that is running; a component still in `draft`
has no business declaring `uses: /environment/production`, and the reviewer's
first question about any such edge is why.

## Guarantees

- Availability objective 99.9% monthly for the checkout path, measured at the
  public edge. The number itself is an obligation, written down as
  [p99-checkout-latency](srn://acme/product/shop/component/checkout/requirement/p99-checkout-latency).
- Data residency: order and payment data stay in `eu-west-1`. The `us-east-1`
  region serves read-only catalogue traffic and holds no payment instrument.
- Change window: schema migrations run through the
  [release-bot](srn://acme/actor/release-bot) identity only, never a human
  credential.
- Every amount crossing a boundary here is a [money](srn://acme/datamodel/money@1)
  document — decimal string plus ISO currency, never a float.

## Placement and configuration

Placement is in the sibling `topology.yaml`; the configuration surface is in
`config.yaml`. Which components run here is deliberately *not* listed in either
file — it is derived from the components' own `uses` edges, and the portal
renders that roster on this page. A topology entry for a component that has not
declared this environment is a warning, not a fact.

Secrets are named here and stored elsewhere. `config.yaml` carries a locator for
every sensitive value and never the value itself, at any status, in any branch.
````

**What this example teaches**

The body carries **guarantees** — availability objective, data residency,
change window — and nothing else could carry them: `environment-type:
production` is a classification, not a promise.

The critical negative rule is in "Placement and configuration": an environment
**never lists what runs in it**. That roster is derived from the components' own
`uses` edges, and a topology entry for a component that has not declared this
environment is a warning, not a fact. Authors reach for a roster here constantly;
resist it.

Sibling artifacts `topology.yaml` (placement) and `config.yaml` (configuration
surface, locators only, never secret values) are optional and carry no version of
their own — the entity's frontmatter `version` covers the whole directory.

## `requirement`

`solutions/acme/product/shop/component/checkout/requirement/idem-cap/index.md`

````markdown
---
name: idem-cap
kind: requirement
version: 2
title: Idempotent payment capture
summary: A payment capture replayed with the same idempotency key must charge the customer exactly once.
status: approved
owner: team-payments
requirement-type: functional
priority: must
relations:
  uses:
    - /product/shop/protocol/order-placement
    - /product/shop/component/checkout/component/payment/datamodel/order@3
tags:
  - payments
  - reliability
---

# Idempotent payment capture

A client that cannot tell whether its capture request arrived must be able to
retry it safely. Checkout accepts an idempotency key on every capture and
guarantees that a replay of the same key produces the same outcome and no
additional charge — including when the original request failed *after* the
acquirer had already authorized it, which is the case that actually hurts.

The obligation is the customer's, not the client's. A duplicate charge is a
refund, a support contact, and a chargeback risk, in that order, and the customer
experiences all three before anyone at acme notices.

## Acceptance criteria

- **AC-1** A capture repeated with the same idempotency key charges the card once.
  - **Given** a capture for order `o-1` with key `k-1` that reached the acquirer
  - **When** the same request is replayed within the retention window
  - **Then** no second authorization reaches the acquirer
- **AC-2** A replay returns the original capture result, byte-identical.
- **AC-3** An idempotency key is honoured for at least 24 hours after first use.
- **AC-4** A capture reusing a key with a different amount or order is rejected
  with a distinguishable error, not silently accepted.
- **AC-5** The guarantee holds across a checkout restart — key state is not held
  in process memory.

## Rationale

AC-5 exists because the first attempted fix kept keys in memory and the next
deploy re-opened the hole. AC-4 exists because the second attempted fix treated
any replay as a success, which turned a duplicate charge into a silently dropped
one — the opposite failure, equally expensive.

The requirement is owned by the checkout component even though
[payment](srn://acme/product/shop/component/checkout/component/payment) implements half of it: checkout owns
the key, and the obligation is that the *pair* behaves correctly.

## Out of scope

Idempotency of refunds. A refund is a new fact on the
[settlement](srn://acme/protocol/settlement) bus with its own identity, and
consumers there are idempotent on `order-id` for a different reason.
````

**What this example teaches**

`## Acceptance criteria` is a **required** level-2 heading with exactly this
casing, appearing exactly once, and its content must begin with an unordered
list of at least one item — no task-list syntax, each item's first line ≤ 200
characters. Nested `Given` / `When` / `Then` detail under an item is free and is
preserved as that criterion's detail.

`## Rationale` is where the real value sits here: each of AC-4 and AC-5 exists
because an earlier fix failed in a specific way. A criterion whose rationale
cannot be written is usually a criterion nobody will maintain.

Placement is ownership, not visibility: the requirement lives under `checkout`
even though `payment` implements half of it, because checkout owns the
idempotency key and the obligation is that the *pair* behaves correctly.

Note this requirement authors `uses` edges but no `implements` — `implements`
points *at* a requirement, from the component or product taking it on.

## `adr`

`solutions/acme/adr/0001-single-currency/index.md`

````markdown
---
name: 0001-single-currency
kind: adr
version: 2
title: One currency per order, three currencies in the catalog
summary: An order is denominated in exactly one currency; conversion happens before checkout, never inside it.
status: approved
owner: team-platform
decision-status: accepted
date: "2026-02-03"
deciders:
  - team-platform
  - team-billing
  - sergio
relations:
  uses:
    - /datamodel/money@1
tags:
  - money
  - foundation
---

# One currency per order, three currencies in the catalog

## Context

Acme sells into the euro zone, the UK, and the US. Early prototypes carried an
amount as a number and the currency as a session attribute, which meant every
sum in the system was correct only by accident of the reader's assumptions. Two
questions forced a decision: may a single order mix currencies, and where does
conversion happen?

The finance team's constraint is that the ledger must never hold a converted
figure whose rate is not recoverable. The commerce team's constraint is that a
customer sees one total, in one currency, before they authorize anything.

## Decision

We denominate an order in exactly one currency, fixed when the cart is created,
and we express every amount as a [money](srn://acme/datamodel/money@1) document
— a decimal string plus an ISO 4217 code. Conversion, where it happens at all,
happens upstream of the cart in the pricing feed; no component described in this
catalog converts between currencies. The currency set is closed at `EUR`, `GBP`,
and `USD`, and widening it is an additive change to the `money` schema.

## Consequences

- Every arithmetic operation in checkout and the ledger has operands in the same
  currency, so no component needs a rate table, a rate cache, or a rounding
  policy for conversion.
- A customer cannot combine a euro item and a sterling item in one basket. The
  storefront must therefore partition a mixed basket into two orders, which is
  visible to the customer and was accepted as a cost.
- The decimal string forces every consumer to parse with a decimal type. A
  consumer that reads it into a double will still work and will still be wrong;
  that risk is real and is not mitigated by the schema.
- Adding a fourth currency touches one schema, but every stored
  [ledger-entry](srn://acme/product/billing/datamodel/ledger-entry@1) predating it keeps
  validating, because widening an enum is additive.

## Alternatives considered

- **Minor units as an integer.** Compact and exact, but meaningless without the
  currency beside it, and the first bug it produced in the prototype was a
  thousand-yen order priced as ten euros. Rejected.
- **A per-line currency with conversion at checkout.** Rejected: it puts a rate
  and a rounding policy inside the checkout path, and the ledger would then hold
  a figure whose provenance is a cache entry that has since expired.
- **Decimal128 on the wire.** Rejected as a transport-specific type: JSON has no
  decimal, Avro's is a byte-encoded logical type, and the two disagree at exactly
  the boundary this catalog cares about.
````

**What this example teaches**

The four level-2 headings — `## Context`, `## Decision`, `## Consequences`,
`## Alternatives considered` — are required with exactly this text and casing.
Order is not enforced and extra sections are allowed.

`deciders` is required and non-empty once `decision-status` is `accepted`,
`rejected` or `superseded`; while a decision is still `proposed` it may be
omitted. `date` is a bare calendar date, `YYYY-MM-DD`, no time and no timezone —
and note that this example **quotes** it. Quote it always: the loader parses
frontmatter with gray-matter, which turns an unquoted `2026-02-03` into a JS
`Date`, and the zod schema wants a string, so the unquoted form the spec says is
legal is `E_FM_SCHEMA` today. Every ADR in the fixture is quoted.

The ordinal prefix `0001-` is unique **per bucket**, not per solution, and is
never reused even after an ADR is rejected or superseded:
`srn://acme/adr/0001-single-currency` and
`srn://acme/product/shop/adr/0001-event-sourcing` coexist without clashing.

Read `## Alternatives considered` closely. Each rejected option names the
concrete failure that killed it — a thousand-yen order priced as ten euros, a
rate cache that has since expired. Strawman alternatives make an ADR worse than
no ADR, because they claim a decision was examined when it was not.

For a superseding ADR, the `supersedes` edge goes on the **successor** and the
`superseded-by` pointer on the old page is derived — see
`solutions/acme/product/shop/adr/0002-change-data-capture/index.md`.


## `capability`

`solutions/acme/capability/order-fulfilment/index.md`

````markdown
---
name: order-fulfilment
kind: capability
version: 1
title: Fulfil an order
summary: Get paid-for goods to the customer who ordered them, on a date acme named, or say truthfully why not.
status: approved
owner: team-commerce
tags:
  - commerce
  - customer-facing
---

# Fulfil an order

Acme can turn an order into a parcel a customer has taken from a courier's
hands. It can hold the stock while the payment clears, decide what travels in
which box and by whose van, get a carrier to accept it, and keep the customer
told where it is until it arrives. When it cannot be done — the stock was
oversold, no carrier would take the parcel, the address does not exist, the
scan stream went quiet — acme can say so, name the reason, and stop the
customer finding out by waiting.

The failure path is inside the sentence deliberately. A fulfilment description
that covers only the happy case is exactly the description under which a
customer ends up with no goods, no money back, and no explanation, and that is
the case the business is actually judged on. It is why
[carrier-failover](srn://acme/product/fulfilment/requirement/carrier-failover)
and
[delivery-promise-accuracy](srn://acme/product/fulfilment/requirement/delivery-promise-accuracy)
read as obligations on this capability rather than as features of a component.

Rebuild every system underneath — a different carrier network, a different
orchestrator, a warehouse acme operates itself — and this paragraph does not
change. That invariance is the test, and it is the only reason this entity
exists separately from
[fulfilment](srn://acme/product/fulfilment), which is the product currently
carrying most of it.

## Boundaries

- **Starts at the intent to buy, not at the settled payment.** The reservation
  [inventory](srn://acme/product/shop/component/inventory) holds for 120 seconds
  is inside this capability even though it happens before any money moves: a
  promise acme cannot keep has already been broken at that moment, and
  discovering it at dispatch only changes who has to apologise. That is why two
  components in [shop](srn://acme/product/shop) — the one that holds the stock
  and the one that turns a basket into the order to be fulfilled — realize a
  capability whose remaining realizers all sit in
  [fulfilment](srn://acme/product/fulfilment). Each carries a slice; the catalog
  does not try to say how large a slice, because nobody could check the answer.
- **Ends at delivery, or at a parcel written off.** What happens to the money
  afterwards is [billing](srn://acme/product/billing)'s, and a refund is a
  different doing with a different team answering for it.
- **Says nothing about which carrier.** The third party is described as an
  external component
  ([parcel-carrier](srn://acme/product/fulfilment/component/carrier-gateway/component/parcel-carrier))
  and may be swapped without a word of this page changing. The portal's
  "Realized by" list is where the current answer lives, and it is derived.
- **Warehouse operations are out of scope for the whole solution**, so they are
  out of scope here. This capability starts with a parcel that has a weight and
  a destination, as the fulfilment product does.

## Not this

- *Take payment* is upstream and separate. An order can be paid for and never
  fulfilled — that is precisely the case this capability's failure path is
  written to cover, and folding the two together would hide it.
- *Track a parcel* is not a second capability. It is the "keep the customer
  told" clause of this one, read from the customer's side; the fact that
  [tracking](srn://acme/product/fulfilment/component/tracking) is a separate
  component is an implementation split, and this page is deliberately blind to
  implementation splits.
- *Deliver on the promised date* is not a capability either — it is a statement
  that must be true, which makes it a requirement
  ([delivery-promise-accuracy](srn://acme/product/fulfilment/requirement/delivery-promise-accuracy)),
  and a number that says whether it holds, which makes it a metric
  ([delivery-on-time-rate](srn://acme/product/fulfilment/metric/delivery-on-time-rate)).
````

**What this example teaches**

The frontmatter is **the common contract and nothing else** — no
`capability-type`, no `maturity`, no `lifecycle`, no `realized-by`. That is the
kind's design, not an unfinished example: every candidate field failed the test
the existing enums pass, *does some portal behaviour or validation rule change
with the value?* A strategy classification goes in `tags`; a score of how well
the doing is done is a `metric`.

`name` is a noun phrase and `title` is the verb phrase the business says. That
pairing is the countermeasure to the one real danger of the kind: the slug
`order-fulfilment` reads like the name of a fulfilment service, which is exactly
the confusion capabilities exist to prevent. `title: Order Fulfilment Service`
would not be a build error — no parser tells a verb phrase from a product name —
it is a review defect.

Read the third paragraph as the acceptance test for every capability you write:
*rebuild every system underneath and this paragraph does not change.* If it would
have to be rewritten, the sentence described an implementation and belongs to a
component or a product.

`## Boundaries` is where the review value sits — it is the paragraph that stops
the capability list from becoming a set of overlapping synonyms two quarters from
now. Notice that the first bullet argues about where the capability *starts* and
concedes something uncomfortable: two `shop` components realize a capability
whose other realizers all sit in `fulfilment`. Partial realization is normal and
is deliberately not quantified — "the catalog does not try to say how large a
slice, because nobody could check the answer."

`## Not this` does the second half of the job, and its last bullet is the kind
boundary in miniature: *deliver on the promised date* is not a capability, it is
a `requirement` (a statement that must be true) plus a `metric` (a number that
says whether it holds).

The entity authors **no realization edge**. Realizers point at it from their own
side, and any number of them may — this is `checkout`, which carries two:

````yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  implements:
    - /product/shop/component/checkout/requirement/idem-cap
  realizes:
    - /capability/order-fulfilment
    - /capability/promotion-pricing
````

Two products realizing one capability is the case that fixes the placement rule,
and `order-fulfilment` is exactly it: five realizers across two products —
`shop`'s `checkout` and `inventory`, and `fulfilment`'s `carrier-gateway`,
`delivery-orchestrator` and `tracking`. Had capabilities been product-scoped, the
second product would have had to either duplicate the description — two entities
for one doing, drifting from the first commit — or reference into another
product's bucket, making one product's reorganization break the other's page.

`promotion-pricing` is the same shape from the other direction: `checkout` in
`shop` and two components in `growth`. Count the realizers with a single grep,
which is also the migration checklist for a capability swap:

```bash
grep -rn "capability/order-fulfilment" solutions/ --include=index.md
```

## `journey`

`solutions/acme/journey/first-purchase/index.md`

````markdown
---
name: first-purchase
kind: journey
version: 1
title: First purchase
summary: A new customer's path from the storefront to a parcel in their hands — three products, one account they did not have this morning, and not one system conversation between them.
status: review
owner: team-commerce
actor: /actor/customer
relations:
  uses:
    - /environment/production
tags:
  - commerce
  - cross-product
---

# First purchase

The path acme is judged on. Somebody who has never bought here before arrives at
the storefront, ends up with an account, an order they have paid for, and a
parcel they have watched turn into "delivered". It crosses
[shop](srn://acme/product/shop), [identity](srn://acme/product/identity) and
[fulfilment](srn://acme/product/fulfilment), in that order, and every one of
those crossings is a place where the catalog can be true inside each product and
say nothing about what happens between them.

## Outcome

The customer holds the parcel, has an account they can sign back into, and can
see what they paid and when it arrived without contacting support.

## Preconditions

None. That is what makes this journey worth naming rather than
`place-an-order`: the account does not exist at step 0, and the two steps that
create it are the two a returning customer skips. A returning customer's path is
a shorter, different journey and is not written down yet.

## Every product crossing here is carried by the customer

Three steps change product, and all three name `protocol: none`. That is a claim
and it deserves the paragraph:

- **steps[1], shop to identity.** The customer follows a "create an account"
  link and types their details into identity's own form. Nothing passes between
  the storefront and [registration](srn://acme/product/identity/component/registration);
  the customer is the integration.
- **steps[3], identity back to shop.** The customer returns to the basket
  holding an opaque session token in their browser
  ([0002-opaque-session-tokens](srn://acme/product/identity/adr/0002-opaque-session-tokens)).
  Nothing flows from
  [authentication](srn://acme/product/identity/component/authentication) to
  [checkout](srn://acme/product/shop/component/checkout) at that moment either.
- **steps[5], shop to fulfilment.** The confirmation mail carries a tracking
  link, and the customer clicks it. Shop does not know fulfilment exists — that
  asymmetry is declared on
  [fulfilment](srn://acme/product/fulfilment) and is deliberate.

`none` is a narrow claim, and steps[3] is where the narrowness matters. It says
that nothing travels between authentication and checkout when the customer walks
back. It does **not** say that checkout never asks identity anything — and what
checkout does with the token it receives is not written down anywhere in this
catalog. Checkout declares no edge toward
[authorization-check](srn://acme/product/identity/protocol/authorization-check),
and that protocol lists no shop component among its participants. The gap is
real, it is older than this journey, and this page is only the first thing to
point at it.

## Why the courier appears

`steps[6]` belongs to the [courier](srn://acme/actor/courier). It is the one
step the customer does not take, and the only one that moves the parcel
anywhere. It is written out
rather than folded into the step around it because a reader who skims the actor
column should stop there: everything before it is somebody choosing to buy, and
everything after it is somebody watching a fact that was created by a person
acme does not employ.

## Out of scope

Returns and refunds, which start where this path ends.
[billing](srn://acme/product/billing) — the fourth product, which the customer's
money passes through and which never appears in a single step. That absence is
accurate and is worth noticing: the ledger is on the other side of a bus, and
nothing the customer does waits for it.
````

`solutions/acme/journey/first-purchase/journey.yaml`

````yaml
name: first-purchase
steps:
  - actor: /actor/customer
    touches: /product/shop
    note: Browses. The product itself is what is touched — no component below shop
      claims the storefront, and the basket does not exist yet.

  - actor: /actor/customer
    touches: /product/identity/component/registration
    protocol: none
    # shop -> identity, carried by the customer: they follow a link and type.
    note: Creates the account and its first credential. Nothing passed from the
      storefront to get them here.

  - actor: /actor/customer
    touches: /product/identity/component/authentication
    protocol: /product/identity/protocol/authorization-check
    note: Signs in. The session issued here is the one every product downstream
      is willing to trust.

  - actor: /actor/customer
    touches: /product/shop/component/checkout
    protocol: none
    # identity -> shop, carried by the customer: the opaque token rides in the
    # browser. What checkout then does with it is not described anywhere — see
    # index.md, which is the only place that fact can currently be written.
    note: Returns to the basket, now as somebody with an account.

  - actor: /actor/customer
    touches: /product/shop/component/checkout/component/payment
    protocol: /product/shop/protocol/order-placement
    note: Pays. The last step the customer can retry alone, and the one that
      publishes the fact everything after this reacts to.

  - actor: /actor/customer
    touches: /product/fulfilment/component/tracking
    protocol: none
    # shop -> fulfilment, carried by the customer: the tracking link in the
    # confirmation mail. Shop does not know fulfilment exists.
    note: Opens tracking for the first time, usually before there is anything to
      see.

  - actor: /actor/courier
    touches: /product/fulfilment/component/carrier-gateway
    protocol: /product/fulfilment/protocol/tracking-events
    note: Hands the parcel over and scans it. The only step in this path that a
      person acme does not employ performs, and the only one that moves a parcel.

  - actor: /actor/customer
    touches: /product/fulfilment/component/tracking
    protocol: /product/fulfilment/protocol/tracking-events
    note: Sees "delivered". The path ends here whether or not anyone was told.
````

**What this example teaches**

Eight steps, three product crossings, and **all three name `protocol: none`** —
which is why the prose spends a whole section on them. `none` is the documented
negative: a claim that the actor carries the hop and there is nothing to
automate, as opposed to an omitted `protocol`, which means "not written down
yet". The distinction is the entire reason the field has three states, and a
reviewer can grep for `protocol: none` and audit every one of them.

Read the `none` paragraph closely, because it is the honest half. It states what
the claim covers (nothing flows between authentication and checkout when the
customer walks back) and then states what it does **not** cover — what checkout
does with the token it receives is described nowhere, checkout declares no edge
toward `authorization-check`, and that protocol lists no shop component. A
journey that found a gap it cannot itself close says so; it does not silence
itself.

`steps[6]` belongs to the courier, not the protagonist, and the prose says why it
is written out rather than folded into a neighbour. That hand-off is why `actor`
is repeated on **every** step instead of defaulting from the frontmatter: it is
the row a reader most needs to notice, and inheritance would hide it. The
protagonist must still take at least one step (`W_JRN_ACTOR_ABSENT`).

`steps[0]` touches `/product/shop` — the **product**, not a component. That is
legal and is the right call when no component below claims the surface; a
`touches` may name a product or a component, and nothing else
(`E_JRN_TOUCHES_KIND`).

Frontmatter carries exactly one kind field, `actor`, and it is a single SRN, not
a list. `relations.uses` names the **environment only**: every component the path
touches is already in `journey.yaml`, and repeating them as edges is double
bookkeeping that drifts.

`## Preconditions` is what earns the name `first-purchase` over `place-an-order`
— the account does not exist at step 0, and the two steps that create it are the
two a returning customer skips. A returning customer's path is a *different
journey*, and the page says so rather than adding a branch. That is the
no-branching rule stated from the authoring side, and
`solutions/acme/journey/coupon-redemption/` is the second path in the same
catalog.

`## Out of scope` closes with the observation worth stealing: `billing` never
appears in a single step, and that absence is accurate — the ledger is on the
other side of a bus and nothing the customer does waits for it. A journey that
lists every product is usually a journey that stopped describing the actor's
path.

No step ids, no `order` key, no timings. The list order *is* the order, and the
portal's stable key is the positional path `steps[3]`, 0-based — which is exactly
how the prose above refers to its own steps. Inserting one shifts every later
key; that is the accepted cost of id-free authoring, and the `version` bump is
the signal that anchors moved.

## `metric`

`solutions/acme/product/shop/metric/checkout-conversion/index.md`

````markdown
---
name: checkout-conversion
kind: metric
version: 1
title: Checkout conversion
summary: Share of checkout attempts that end in a placed order, measured over a rolling seven days in production.
status: draft
owner: team-shop
metric-type: ratio
target: "68%"
window: "7d"
direction: higher-is-better
relations:
  measures:
    - /capability/order-fulfilment
  uses:
    - /environment/production
tags:
  - commerce
  - checkout-path
---

# Checkout conversion

Of the customers who got as far as submitting a basket, how many ended up with
an order. It is the front door of
[order-fulfilment](srn://acme/capability/order-fulfilment): a basket that dies
here is a fulfilment that never started, and no amount of on-time delivery
downstream compensates for it.

## Definition

Denominator: checkout attempts in production in which the customer submitted the
cart at least once — one `submit-order` exchange opened on
[order-placement](srn://acme/product/shop/protocol/order-placement), regardless
of how it ended. Numerator: attempts that produced an
[order-placed](srn://acme/product/shop/datamodel/order-placed@1) fact.

An attempt is counted once, keyed by the idempotency key
[idem-cap](srn://acme/product/shop/component/checkout/requirement/idem-cap)
already requires, so a customer retrying a declined card is one attempt and not
three. Sessions the edge classifier marks as bots are excluded from both sides.
Attempts abandoned before submission are excluded too — not because they do not
matter, but because they are a question about the storefront rather than about
whether acme could take the order, and mixing the two produces a number nobody
can act on.

## Rationale

This metric points at a capability rather than at
[checkout](srn://acme/product/shop/component/checkout), and the choice is
deliberate. Most of what moves it is not checkout's code: a stock reservation
that could not be granted, a payment declined by the acquirer, a promotion quote
that arrived too late to be applied. The number is a statement about whether the
business can convert an intent to buy into something to fulfil, and the
component that happens to be holding the customer when it fails is the wrong
subject for it.

It is filed in [shop](srn://acme/product/shop)'s bucket, not at solution level,
because `team-shop` is who answers for it. Placement says whose number it is;
`measures` says what it is about. The same capability is measured from the other
end by
[delivery-on-time-rate](srn://acme/product/fulfilment/metric/delivery-on-time-rate),
filed under a different product and owned by a different team — one capability,
two numbers, two accountable owners, and no argument about where either lives.

## Known distortions

- Removing an inconvenient payment method raises this number by removing the
  customers who were going to use it. Read next to order volume, never alone.
- A stock-out counts as a failed conversion even though checkout behaved
  correctly. That is intended — the customer left without goods either way — but
  it means a bad week in the warehouse looks like a bad week in checkout.
- The seven-day window is short enough to see a deploy and long enough to
  survive a weekend. It is not long enough to compare against a promotional
  period, and a comparison across one is meaningless.
````

**What this example teaches**

All four scalars are present, and that is the additive-safe order: a field
introduced as optional can never be made required later — that is a narrowing —
so requiring them now leaves both moves available. `target` and `window` are
**quoted**, always. Quoting is invisible for `"68%"` and `"7d"` and load-bearing
for exactly one case, a `count` target of `"1200"`, which YAML would otherwise
turn into an integer and fail as `E_FM_SCHEMA` for what looks like the right
value. The unit lives inside the literal rather than in a `unit:` field, so the
two can never disagree.

`direction: higher-is-better` says `target` is a **floor**. It is not derivable
from `metric-type` — a duration is *usually* lower-is-better and a ratio
*usually* higher, and "usually" is the word that makes a derived field wrong
twice a year.

The `## Rationale` section is the one to copy the shape of. It answers two
questions an author is always asked and usually cannot: *why this subject* and
*why this bucket*. The subject is `/capability/order-fulfilment` rather than the
`checkout` component, because most of what moves the number is not checkout's
code — a reservation refused, a card declined, a promotion quote that arrived
late — and "the component that happens to be holding the customer when it fails
is the wrong subject for it". The bucket is `shop`'s because `team-shop` answers
for the number.

That is the split to internalise: **placement says whose number it is;
`measures` says what it is about.** They are different questions, and the same
capability is measured from the other end by
`solutions/acme/product/fulfilment/metric/delivery-on-time-rate/` — one
capability, two numbers, two accountable owners, no argument about where either
lives. A capability subject constrains placement not at all, which is why
`W_MET_SUBJECT_SCOPE` exempts it: a capability is solution-level and owned by
nobody.

`measures` is REQUIRED — no edge at all is `E_MET_NO_SUBJECT`, a number with no
subject — and the inverse is never authored: `measured-by` is derived onto the
capability's page. The `uses` edge naming the environment is what makes staging
and production numbers distinguishable observations.

`## Definition` is what makes the metric real: numerator, denominator, the
keying that stops one retried card counting three times, and the exclusions —
each with the reason it is excluded, not just the fact. `## Known distortions` is
the honest section, and its first bullet is the pattern: *removing an
inconvenient payment method raises this number by removing the customers who were
going to use it.* Every metric can be gamed; its own page is the place to say
how.

Two further shapes from the same catalog:
`solutions/acme/product/identity/metric/p99-authz-check/` is a `duration` whose
subject is a **requirement** (`authz-check-latency`) and which names the protocol
it is observed on under `uses` rather than under `measures` — the pairing this
kind exists for, a commitment plus the number that checks it.
`solutions/acme/product/fulfilment/metric/delivery-on-time-rate/` carries **two**
subjects, a requirement and the capability behind it: legal precisely because the
same observation, computed the same way, is the measure of each. That is the only
case for a second entry — two things measured differently are two metrics.
