---
name: st2common
kind: component
version: 1
title: st2common
summary: The Python package every process here imports — models, persistence, service bootstrap, and the only place the message topology is written down.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
criticality: 1
tags:
  - shared
  - transport
x-runtime: python
---

The package the whole platform is made of. Every process in
[platform](srn://stackstorm/product/platform) imports it, and it holds the
document-store models, the common service bootstrap each entry point calls, the
persistence layer, and the transport module tree.

It declares no environment, and that is a rule rather than an omission: a
library has no runtime of its own and the framework rejects the edge outright.
Where this code runs is answered by the processes that import it, each of which
declares its own environments.

## Why this component matters more than a shared-utilities package usually does

Because the bus topology lives here and nowhere else. The exchanges, their
types, the queue names, the routing keys and the publisher helpers are all
constants in one small module tree inside this package — not in configuration,
not in each service, not in a broker definition file. The practical consequence
for anyone reading the system is that the messaging architecture is discoverable
by reading one directory, which is unusual and is the reason a survey of this
system could establish the whole bus without running it.

The practical consequence for *this catalog* is that the transport facts on the
protocol entities all have one source, and that source is a library rather than
any of the participants. The framework has no way to express "this component is
where the protocol's wire facts are defined", and the closest honest statement
is this paragraph.

## Naming is configurable, and the catalog states a default

Every exchange and queue name in the system is derived from a configurable
prefix, and the broker connection carries a virtual host. So a catalog entry
that writes a literal exchange name is stating the **default an installation may
change**, not a fact about a deployment. The framework's `amqp` binding block
has no field for either — the `kafka` block gets a `cluster` label and the HTTP
family gets a `tls` flag, while `amqp` gets no connection-level field at all —
so the configurability cannot be recorded beside the name it qualifies. That
finding belongs to the transport artifacts; it is anchored here because this is
the component the names come from.

## Consumers

Every service and job in this product depends on it. It is also the reason those
components' `depends-on` lists all start the same way, which would otherwise
look like boilerplate.
