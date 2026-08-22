---
name: viaduct
kind: component
version: 1
title: Viaduct
summary: The cloud-edge transport library — connection management, framing and multiplexing over either of the two wire technologies both hubs support.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
relations:
  depends-on:
    - /product/core/component/api
tags:
  - transport
  - library
x-package: github.com/kubeedge/kubeedge/pkg/viaduct
---

The code both ends of the cloud-edge channel are built from. It is what makes
"the same conversation over WebSocket or over QUIC" a configuration choice rather
than two implementations.

## What it provides

Connection setup and teardown, message framing, multiplexing many logical streams
over one connection, and the client and server halves of both wire technologies
behind one interface. A message is serialised into a compact binary envelope and
handed to whichever wire the configuration selected.

## Two transports, and the enum has one of them

This library supports exactly two basic transports: a WebSocket implementation
and a QUIC implementation. The framework's transport contract names one of them
and has no value for the other, which is a small and very concrete gap: a
protocol entity describing the cloud-edge channel over QUIC has no honest value
for the one field the transport artifact requires.

It is worth stating on the library page rather than only on the protocol,
because this is where the fact lives. Nothing about the conversation changes with
the wire — same peers, same envelope, same behaviour — and that is precisely why
the framework's rule that one protocol has one transport produces two entities
that are identical except in the field that cannot be filled in.

## Not published separately

Unlike [beehive](srn://kubeedge/product/core/component/beehive) and
[api](srn://kubeedge/product/core/component/api), this one is not staged out to
its own repository: it is a package inside the main module. So the `x-package`
field above is an import path rather than a second identity — the same field name
carrying a weaker claim, which is the ordinary price of an escape hatch that the
contract does not define.

## Type discipline

`library`, so no environment. Its consumers are the two hub modules at either end
of the channel, and nothing else.
