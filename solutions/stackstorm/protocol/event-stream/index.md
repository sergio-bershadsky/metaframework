---
name: event-stream
kind: protocol
version: 1
title: Event stream
summary: An HTTP response that never ends, carrying the bus back out to a browser — the surface where kind:http is true and the http binding block describes none of it.
status: review
owner: sergio-bershadsky
style: point-to-point
participants:
  - alias: operator
    ref: /actor/automation-operator
    role: initiator
  - alias: web-ui
    ref: /product/operator-surfaces/component/st2web
    role: client
  - alias: cli
    ref: /product/operator-surfaces/component/st2client
    role: client
  - alias: chatops
    ref: /product/operator-surfaces/component/st2chatops
    role: client
  - alias: edge
    ref: /product/platform/component/nginx
    role: gateway
  - alias: stream
    ref: /product/platform/component/st2stream
    role: responder
conforms-to:
  - standard: HTML Living Standard — Server-sent events
    url: https://html.spec.whatwg.org/multipage/server-sent-events.html
tags:
  - http
  - sse
  - streaming
  - ontology-strain
---

The only way to watch this platform without polling it. A client opens a request
and the response is never finished: each bus message the stream service consumes
becomes one server-sent event, written into the open response as it arrives. The
web UI's live view and the command line's output tail are the same protocol used
two ways.

Two endpoints exist — one for everything, one for a single execution's output —
and behind them two consumer sets over six queues, three of which the broker
names.

## The event names are another protocol's addresses

Every event carries a name built by joining the AMQP exchange and the routing
key with a double underscore. So the vocabulary a browser filters on is the
address space of
[execution-updates](srn://stackstorm/product/platform/protocol/execution-updates@1),
[execution-lifecycle](srn://stackstorm/product/platform/protocol/execution-lifecycle@1),
[announcements](srn://stackstorm/product/platform/protocol/announcements@1) and
[registration-events](srn://stackstorm/product/platform/protocol/registration-events@1),
transliterated. The default filter is a list of seven such names; a client may
send its own.

The service also rewrites a configured exchange prefix back to the default one
before building the name, so that the event vocabulary stays stable across
installations whose exchanges are named differently. Two spellings of one address
space, and this protocol's surface is the derived one.

The framework cannot express that dependency at all. A protocol may not point at
another protocol's transport artifact in `relations`, and even if it could, this
is not a reference — it is a naming rule that turns one protocol's addresses into
another's message vocabulary. It is prose here, and it is the single most
load-bearing sentence on this page.

## The clearest evidence of the naming rule is a chat robot

The ChatOps bridge is a client of this protocol, and it is the one client whose
subscription is a fixed string rather than a filter a person typed. It opens a
stream connection and registers a listener for the event named
`st2.announcement__chatops` — the announcement exchange, two underscores, and the
route an automation passed to the announcement runner.

So a pack author who wants to say something into a chat room writes an action
with one runner parameter, and a robot in another repository, in another
language, on another release train, is listening for exactly that string. The
route is a single word, which is what lets it through the stream's own
single-word binding; the dotted form the runner's documentation offers would
reach neither.

That chain — a runner parameter, an AMQP routing key, an event name, a listener
in a third-party process — crosses three protocol entities and two products, and
every link in it is a string convention rather than a reference. It is the
strongest example in this catalog of a contract the ontology cannot draw.

## Where `kind: http` is true and the block is empty

Server-sent events *are* HTTP, so the enum value is not a compromise. What the
binding block then offers is `base-path`, `tls` and a list of operations with a
`request` and a `response` naming one datamodel each.

- `response` names one model. The response here is an unbounded sequence of
  events of **five** different shapes, each tagged by a name the block has no
  field for. The two operations below therefore name the model that dominates
  each stream and understate both.
- There is no field for the event vocabulary, no field for the filter parameters
  that select from it, and no field for the fact that the response never ends.
- There is no field for the heartbeat. The service emits an empty message every
  few tens of seconds so that intermediaries do not close an idle connection; the
  interval is configuration, and it is a fact a client must know to distinguish
  silence from death.

Both sibling catalogs reached for `websocket` when they needed a long-lived
server-to-client channel, and got a binding block with a channel list and a
direction. Server-sent events get the value that is literally correct and the
block that says the least. That is a different failure from the one
[remote-execution](srn://stackstorm/product/platform/component/st2actionrunner/protocol/remote-execution@1)
records: there the enum has no value; here the value is right and the shape is
wrong.

## The gateway is part of this protocol in a way it is not part of the others

The reverse proxy's own configuration for this location turns off response
buffering and chunked encoding, keeps the upstream connection header empty, and
— when the service is unreachable — answers with a two-hundred response whose
body is a server-sent-events retry directive, so that a browser reconnects on a
timer instead of reporting a failure.

None of that is a deployment detail. A buffering intermediary makes this protocol
useless, and the retry fallback is a protocol-level behaviour written into a
config file. The reference configuration also rewrites two older path spellings
onto this one, so the count of spellings for these operations is four rather than
the three the REST API has.

The framework has a component type for the proxy and an `exposes` edge for the
surface, and no way to say that a participant's *configuration* is a term in the
contract. That is why the gateway is a participant here rather than an
implementation detail behind one.

## `style: point-to-point`, and why not `bus`

The sender names the receiver: the stream service writes into one open response
belonging to one client. Fan-out happens upstream, on the broker, into one
transient queue per connection — which is where the `bus` style already lives, on
the protocols that own those exchanges. Here the decision rule gives
point-to-point directly: a named receiver, no reply contract.

## Sources

Read at `v3.9.0`:
[`st2stream/st2stream/controllers/v1/stream.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2stream/st2stream/controllers/v1/stream.py),
[`st2stream/st2stream/controllers/v1/executions.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2stream/st2stream/controllers/v1/executions.py),
[`st2common/st2common/stream/listener.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/stream/listener.py),
[`conf/st2.conf.sample`](https://github.com/StackStorm/st2/blob/v3.9.0/conf/st2.conf.sample),
[`conf/nginx/st2.conf`](https://github.com/StackStorm/st2/blob/v3.9.0/conf/nginx/st2.conf).
