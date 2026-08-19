---
name: promotion-evaluation-budget
kind: requirement
version: 1
title: Promotion evaluation fits inside the checkout latency budget
summary: The engine answers within 40 ms at p99 or answers degraded — it never makes checkout wait longer than that.
status: review
owner: team-growth
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/production
    - /product/growth/protocol/promotion-evaluation
tags:
  - promotions
  - performance
---

# Promotion evaluation fits inside the checkout latency budget

[checkout](srn://acme/product/shop/component/checkout) has its own p99 to meet
and growth is a new tenant of it. This requirement fixes what growth is allowed
to consume and, more importantly, fixes what happens when it cannot: the engine
returns a degraded quote rather than an overdue one.

The priority is `should` rather than `must` deliberately. Missing the budget
degrades an offer; it does not prevent an order. A `must` here would have
implied that a slow evaluation is a checkout outage, which is exactly the
coupling
[0002-fail-open-pricing](srn://acme/product/growth/adr/0002-fail-open-pricing)
was written to prevent.

## Acceptance criteria

- **AC-1** `evaluate-cart` returns within 40 ms at p99 and 120 ms at p99.9,
  measured at the server, over a rolling one-hour window in
  [production](srn://acme/environment/production).
- **AC-2** The budget is a hard deadline, not a target. At 120 ms the engine
  abandons whatever it has computed and returns a quote with `fallback: true`
  and an empty `applied` list.
- **AC-3** Partial results are never returned. A cart priced against half its
  candidates is not a cheaper cart, it is a wrong one, and AC-1 of
  [stackable-promotions](srn://acme/product/growth/requirement/stackable-promotions)
  forbids it.
- **AC-4** A call to [audience](srn://acme/product/growth/component/audience) or
  [coupon-service](srn://acme/product/growth/component/coupon-service) that
  exceeds 8 ms is abandoned and read as a negative answer — not in segment, code
  not applicable — and the affected candidate appears in `rejected`.
- **AC-5** Fallback quotes stay below 0.1% of evaluations over a rolling day.
  Above that the degradation has stopped being a safety valve and has become the
  behaviour, which is an incident.
- **AC-6** The budget is measured with growth's own dependencies unavailable, at
  least weekly, in [staging](srn://acme/environment/staging). AC-2 is only true
  if it has been observed.

## Rationale

40 ms is not a round number chosen for comfort. It is what remained of
checkout's own p99 after
[p99-checkout-latency](srn://acme/product/shop/component/checkout/requirement/p99-checkout-latency)
was allocated across the components already on that path, and it is why
[promotion-engine](srn://acme/product/growth/component/promotion-engine) is the
one component in acme's estate not written on the JVM.

AC-4's 8 ms sub-budget is what makes AC-2 achievable rather than aspirational: a
deadline you can only observe at the end is a deadline you miss. Reading a
timeout as a *negative* rather than an error is the load-bearing half — it keeps
a slow dependency from turning into a fallback quote, and keeps the degradation
visible in `rejected` where the basket can explain it.

AC-5 exists because the first version of this requirement had no ceiling on
fallbacks, and a dependency that was quietly failing 4% of evaluations went
unnoticed for a fortnight. Fail-open hides its own failures unless something
counts them.

## Out of scope

The latency of [campaign-manager](srn://acme/product/growth/component/campaign-manager)
and the nightly rebuild in
[audience](srn://acme/product/growth/component/audience). Neither is on a
customer's path, and holding an authoring screen to a checkout budget would buy
nothing.
