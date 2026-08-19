# Worked example — one paragraph of prose to a proposed SRN tree

This walks the interview from `SKILL.md` end to end. It lands on the shape shipped
at `solutions/acme/`, so every decision below can be read against real files.

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
    └── component/session-store      datastore — revocation in seconds
```

### Decisions and the alternatives rejected

| Decision                                    | Rejected alternative                    | Why                                                                  |
|---------------------------------------------|-----------------------------------------|----------------------------------------------------------------------|
| `shop` and `billing` are peer products      | `billing` as a component of `shop`      | Ownership line, auditor, retention obligation (**H1**)               |
| Storefront is not its own product           | `product/storefront`                    | Same release train as checkout — a layer, not a deliverable (**H1**) |
| `payment` nests inside `checkout`           | Sibling component under `shop`          | Composition: payment is part of checkout (**H9**)                    |
| `inventory` is a sibling, not nested        | Nested under `checkout`                 | Checkout calls it; calling is an edge, not containment (**H9**)      |
| `psp` is a component, not an actor          | `actor/acquirer`                        | `depends-on` and `uses` never accept an actor (**H10**)              |
| `tax-engine` is a component, not a product  | `product/tax`                           | No roadmap or budget of its own; it is a library (**H1**)            |
| `settlement` sits at the solution root      | Inside `billing`                        | NCA of participants spanning both products (**H4**)                  |
| `money` at the root, `order-line` in `shop` | Both at the root                        | Shop owns what a line means; nobody owns money (**H3**)              |
| `identity` is a third product               | An `auth` component inside each product | Cross-cutting: model once, reference everywhere (**H7**)             |
| `identity` has no `depends-on`              | `depends-on: /product/shop`             | Would create a cycle every login depends on (**H7**)                 |

### Open questions to put back to the user

- Does `merchant-operator` act on the shop, on billing, or on both? The answer
  changes which products list it under `primary-actors`.
- Is refunding a protocol on the ledger, or an operation of `settlement`? Modelled
  here as its own protocol because a human initiates it.
- Is `session-store` a `datastore` the ACL owns, or an independent component? Only
  the deploy rota answers this.

## After sign-off

Write targets before referrers so the check stays meaningful: solution `index.md`
→ actors and environments → products → components outermost first → datamodels →
protocols → requirements and ADRs.

Delegate each entity to the skill that knows its kind — `model-data`,
`protocol-design`, `add-entity` — rather than hand-rolling frontmatter, then run:

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

Report pass/fail and every diagnostic with its code and file.
