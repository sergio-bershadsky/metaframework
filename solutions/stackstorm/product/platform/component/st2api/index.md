---
name: st2api
kind: component
version: 1
title: st2api
summary: The REST API — every read and write an operator, a client or a webhook sender performs, and the process that turns a request into a message on the bus.
status: review
owner: sergio-bershadsky
component-type: service
lifecycle: released
criticality: 1
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
  exposes:
    - /product/platform/protocol/trigger-dispatch
    - /product/platform/protocol/execution-lifecycle
  depends-on:
    - ../st2common
    - ../mongodb
    - ../rabbitmq
tags:
  - api
  - http
x-runtime: python
x-listen-port: 9101
---

The door into the platform. Everything the web UI shows, everything the CLI
does, and every event a
[monitoring-system](srn://stackstorm/actor/monitoring-system) pushes in arrives
here. It listens on the port recorded in `x-listen-port` above, read from the
`[api]` section of the sample configuration file on `master`; the value is a
default an installation may move.

## What it actually does, which is less than it looks

Almost nothing in this process is business logic. A request either reads the
document store or writes to it and publishes a message; the work then happens in
one of the eight processes that have no door. Creating an execution is the clean
example: the API validates, writes a record, publishes it, and answers. Nothing
in this process has run the action.

That is why the component is `criticality: 1` while owning almost no behaviour —
if it stops, every surface stops, and nothing that was already running is
affected at all.

## The two protocols it exposes and why they are separate entities

`rest-api` is the operator-facing surface: a large, versioned, documented HTTP
API with an OpenAPI-role document beside it, spoken by clients that read every
response. `webhook-ingress` is a different conversation with a different
counterpart that happens to arrive on the same listener — a one-way push from
[monitoring-system](srn://stackstorm/actor/monitoring-system), which never reads
a response body and is never told what the automation did with the event. One
protocol entity for both would have to claim one participant set and one style
for two conversations that share nothing but a port.

## The dialect finding that lands on this component's API document

The framework's role table fixes the filename `openapi.yaml` and pins its
content to OpenAPI 3.1.x, keyed on an `openapi:` discriminator. This project
ships a file at exactly that filename whose first content line declares
`swagger: '2.0'` — a current, widely deployed, *different* industry standard —
and which therefore carries no `openapi:` key at all. Under the dialect
machinery that reads as "legacy dialect, warned", when the truth is "a standard
the role has no room for".

The second half of the same finding is that the file is generated. Its own
header says it is produced from a template by a make target, so the framework's
assumption that an `openapi.yaml` is an authored artifact addressable as
`.openapi` is false here: the addressable file is a build product and the source
of truth is a template that has no role at all.

Both halves belong to the protocol entity that would carry the document; they
are recorded here because this is the component that ships it, and because the
catalog does not vendor the file — it is a large body of somebody else's text
and the honest answer is a citation, not a copy.
