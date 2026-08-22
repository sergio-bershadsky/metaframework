---
name: st2scheduler
kind: component
version: 1
title: st2scheduler
summary: Takes requested executions, applies the policies that may delay or refuse them, and marks the survivors ready for a runner to pick up.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 2
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
    - /product/platform/protocol/execution-lifecycle
  depends-on:
    - ../st2common
    - ../mongodb
    - ../rabbitmq
    - ../redis
tags:
  - policy
  - worker
x-runtime: python
---

The gate between *somebody asked for this* and *this is going to run*. Without
it every request would go straight to a runner, and the platform would have no
place to put back-pressure.

**Trigger:** a message announcing an execution in the requested state, taken
from a durable named queue bound with that state as its routing key.

**Effect:** it evaluates the pre-run policies attached to the action —
concurrency limits, retries, whatever a policy type defines — and either moves
the execution on to the scheduled state, where a runner will take it, or holds
it back.

## Why this process needs a coordination backend

The interesting policies are cluster-wide claims: *no more than N of this action
at once*, across every scheduler instance. Counting that correctly requires a
lock that all instances share, which is what the coordination backend is for and
why [redis](srn://stackstorm/product/platform/component/redis) appears in the
dependency list of this process and not of, say, the rules engine.

That dependency is also what makes a deployment with no coordination URL quietly
different from one with it, and the difference is sharper than it first looks.
The coordination URL is **unset by default**, and the fallback is not a weaker
lock — it is a **no-op driver whose lock acquisition always succeeds and
enforces nothing**, with the platform logging that race conditions are possible.
So an unconfigured deployment does not have machine-local limits; it has no
limits, between any two processes, on one host or on twenty.

The environment entities record that, because which deployments configure a
backend is a topology fact and the environment kind is where topology facts
live. What no entity can record is that the same configured policy is a
guarantee in one deployment and a suggestion in another.

## Scaling

Documented as multiple-instances-at-a-time, over a shared durable queue. The
concurrency policies are precisely the feature that makes running several
instances a coordination problem rather than a free win.
