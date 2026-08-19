# Worked examples — one complete `index.md` per kind

> Every file below is reproduced **verbatim** from the reference solution at
> `solutions/acme/` in the metaframework repository. When that repository is
> present, read the originals; this bundled copy exists because an installed
> plugin cannot see them. Nothing here is invented — if a field, heading or
> phrasing looks surprising, it is because the fixture is deliberately teaching
> something at that spot.

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
version: 2
title: Tax engine
summary: Library computing tax for a cart from a versioned rate table; runs inside checkout's process.
status: approved
owner: team-checkout
component-type: library
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
