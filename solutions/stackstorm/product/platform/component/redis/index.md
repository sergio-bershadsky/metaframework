---
name: redis
kind: component
version: 1
title: Redis
summary: The coordination backend — distributed locks and a service registry for the processes whose correctness depends on there being one of something.
status: review
owner: sergio-bershadsky
component-type: external
lifecycle: released
criticality: 3
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
tags:
  - coordination
  - locking
  - infrastructure
---

Not a cache and not a store here. This component exists so that several
instances of the same process can agree about who is doing what: concurrency
policies that limit how many of an action may run at once, workflow-level
concurrency, sensor partitioning, and the rescue pass that must not start the
same stuck execution twice.

## The seam, and the fact that it is swappable

The platform reaches it through a coordination abstraction configured by a
single URL in the `[coordination]` section. The abstraction is a driver
interface, and Redis is one driver: the project documents ZooKeeper as an
equally supported alternative. This component is therefore named for the
*deployment default* rather than for a hard dependency, and that is stated
plainly because a reader would otherwise take the name for a requirement.

**The URL's default is unset**, and that is the fact with the most consequences
in this catalog. With no coordination backend configured, the platform installs
a **no-op driver**: every lock acquisition succeeds, nothing is ever held, and
the code logs that race conditions are possible. The concurrency limits an
operator configured are then not limits — not weaker limits, and not limits that
stop at the machine boundary. The driver interface also treats a file-based or
in-memory backend as equivalent to none, so there is no middle setting to fall
into by accident.

## Why that fact has no home in the framework

It is a property of a *topology* — "this deployment has more than one machine" —
and the environment kind's `environment-type` enum records data reality instead:
which rung of nobody's-machine to production-itself a target sits on. The two
targets in this catalog that share the value `production` disagree about exactly
this, and the argument is on
[single-box](srn://stackstorm/environment/single-box).

The narrower version of the same gap is that a component cannot say "I require a
coordination backend when, and only when, more than one of me runs". The
`depends-on` edges from
[st2scheduler](srn://stackstorm/product/platform/component/st2scheduler),
[st2workflowengine](srn://stackstorm/product/platform/component/st2workflowengine),
[st2actionrunner](srn://stackstorm/product/platform/component/st2actionrunner),
[st2sensorcontainer](srn://stackstorm/product/platform/component/st2sensorcontainer)
and [st2notifier](srn://stackstorm/product/platform/component/st2notifier) state
the dependency unconditionally, which over-claims on a single host and is the
only expressible reading.

## Criticality 3

Its loss does not stop the platform; it removes the guarantees that make
horizontal scaling safe. Work keeps flowing, and limits stop being enforced —
which is a worse failure to diagnose than an outage and a better one to survive.
