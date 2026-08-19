---
name: authenticated-remote-transport
kind: requirement
version: 1
title: No public MCP endpoint exists until it is authenticated
summary: A remote MCP transport is a move-injection surface, so authentication is a precondition for exposing one at all. Deliberately unmet.
status: draft
owner: sergio-bershadsky
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/production
    - /product/agent-play/component/mcp-server/protocol/mcp-surface
tags:
  - security
  - mcp
---

# No public MCP endpoint exists until it is authenticated

Today the MCP server is a stdio subprocess. The host launches it, owns it, and
is the only thing that can talk to it; there is no endpoint, so there is nothing
to authenticate.

Phase P-MCP-3 proposes changing that — a streamable-HTTP transport, its own
Deployment, and a `/mcp` path on the existing ingress — so that an external
model can reach the hosted game without a local checkout. That is a genuinely
useful capability and it turns this surface into something new: **a public
endpoint that injects moves into live games.**

The requirement exists to make the ordering explicit rather than leaving it to
whoever writes the ingress rule.

## Acceptance criteria

- **AC-1** No `/mcp` ingress path, Service or Deployment exists in the deployed chart while this requirement is unmet.
- **AC-2** Any remote MCP transport authenticates every caller before a session may hold a seat.
- **AC-3** An unauthenticated caller cannot list matches, join a seat, or submit a move.
- **AC-4** The credential for the remote transport is distinct from the per-seat game credential, so a leaked seat credential does not grant endpoint access.
- **AC-5** The decision to expose a remote endpoint is recorded as an ADR before the endpoint is deployed, not after.

## Why this is unmet, and deliberately so

The current state satisfies the *spirit* of the requirement by not having the
thing it constrains. `x-wire: stdio-jsonrpc` in the transport binding is the
whole security model: process ownership.

Unmet here therefore means "the guard is in place because the door does not
exist", not "the door is open". The risk is that the door is easy to add — the
ingress already terminates TLS for
[brass.bershadsky.dev](srn://brass/environment/production) and adding a path is
three lines of YAML — and the guard is not.

AC-5 exists for exactly that reason: three lines of YAML is small enough to
happen without a decision, and this is not a decision that should be made in a
template.

## Measured where

In [production](srn://brass/environment/production). AC-1 is checkable by
rendering the chart, which is the only enforcement mechanism this requirement
has today.

## Out of scope

Authorisation beyond authentication — which agent may join which match, rate
limits, and per-match allowlists. Those become interesting the moment AC-2 is
met, and none of them is a substitute for it.
