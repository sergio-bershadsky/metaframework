---
name: p99-checkout-latency
kind: requirement
version: 1
title: Checkout p99 latency under peak
summary: The checkout submit path responds within 400 ms at p99 during peak traffic in production.
status: review
owner: team-checkout
requirement-type: non-functional
priority: should
relations:
  uses:
    - /environment/production
tags:
  - performance
  - checkout-path
---

# Checkout p99 latency under peak

The submit-order path must stay responsive at the traffic peaks the shop sees in
the last week of a quarter. Measured in
[production](srn://acme/environment/production), at the public edge of the
storefront, not inside the service — a number taken behind the load balancer
measures the wrong thing and always looks better.

A non-functional requirement names the environment it is measured in, because an
operational property means nothing without one. The same code meets this
objective on [staging](srn://acme/environment/staging) trivially, with one
replica and no customers.

## Acceptance criteria

- p99 latency of the submit-order request is at most 400 ms, over any rolling
  five-minute window during a peak day.
- p50 latency is at most 120 ms over the same window.
- The measurement is taken at the public edge, including TLS termination.
- The objective holds at three times the median hourly order rate of the last 90
  days.
- Time spent waiting on the acquirer is included, not excluded — the customer
  experiences it.

## Rationale

The last criterion is the contested one and the reason this requirement is still
in `review`. Excluding acquirer time would make the number achievable and
meaningless; including it makes the objective partly dependent on
[psp](srn://acme/shop/checkout/payment/psp), a system acme does not operate.
Team-checkout's position is that the customer does not care whose fault it is.
