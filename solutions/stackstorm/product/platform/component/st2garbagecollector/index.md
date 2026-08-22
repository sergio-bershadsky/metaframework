---
name: st2garbagecollector
kind: component
version: 1
title: st2garbagecollector
summary: The periodic cleaner — deletes execution history, trigger instances and other records once they are older than the configured retention.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 4
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
  depends-on:
    - ../st2common
    - ../mongodb
    - ../rabbitmq
tags:
  - retention
  - maintenance
x-runtime: python
---

**Trigger:** its own timer. This process wakes on an interval rather than on a
message, which makes it the second of the two clock-driven jobs here and the
only one whose clock is internal rather than a user-visible feature.

**Effect:** it deletes records past their retention window — execution history,
trigger instances, traces, rule enforcements, tokens and the other collections
the configuration names. Almost every one of those windows is **off unless
somebody sets it**, which is the important operational fact about this
component: on a platform nobody configured retention on, this process runs
happily and deletes nearly nothing while the store grows. The documented
exception is streamed action output, which is collected by default.

## Why it is criticality 4 and still worth a page

Nothing stops when this process stops. The consequence of its absence is a
document store that keeps growing, which becomes an incident months later
somewhere else entirely — on
[mongodb](srn://stackstorm/product/platform/component/mongodb). That is the
textbook case for the lowest tier: real, slow, and not this component's outage.

The project notes there is little benefit in running several of these, which is
the same singleton-shaped observation
[st2timersengine](srn://stackstorm/product/platform/component/st2timersengine)
makes, at a much lower stake — duplicate deletes are idempotent in a way that
duplicate timer fires are not.

## It does connect to the broker, and the reason is worth checking

The intuitive answer for a cleaner is that it only touches the store, and that
answer is wrong. Its entry point registers the exchanges like every other
process here, so the dependency on
[rabbitmq](srn://stackstorm/product/platform/component/rabbitmq) is real and
stated. The only process in this product that genuinely never touches the broker
is [st2auth](srn://stackstorm/product/platform/component/st2auth), which
disables exchange registration explicitly.
