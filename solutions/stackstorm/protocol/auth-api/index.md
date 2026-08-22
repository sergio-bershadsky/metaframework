---
name: auth-api
kind: protocol
version: 1
title: Auth API
summary: A password in, a time-limited token out — a separate service on a separate port, described inside the same interface document as two other protocols.
status: review
owner: sergio-bershadsky
style: request-response
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
  - alias: edge
    ref: /product/platform/component/nginx
    role: gateway
  - alias: auth
    ref: /product/platform/component/st2auth
    role: responder
conforms-to:
  - standard: RFC 7617 The Basic HTTP Authentication Scheme
    url: https://www.rfc-editor.org/rfc/rfc7617
tags:
  - http
  - auth
---

The smallest surface in the platform and the one every other surface depends on.
A client presents a username and password in the standard header, the service
asks whichever backend the installation configured, and answers with an
[auth-token](srn://stackstorm/datamodel/auth-token@1). A second operation
validates a token that already exists, and three more exist for single sign-on
installations.

It is a separate process on its own port, behind its own location in the reverse
proxy — which passes the authorization header through explicitly, because a
proxy that dropped it would break exactly this protocol and nothing else.

## One description, three protocols

The project publishes one interface description covering the whole product, and
its paths divide into three prefixes: the REST API's, this one's, and the event
stream's. Three services, three ports, three protocol entities in this catalog —
and one document.

The framework's `openapi.yaml` role is a fixed-name artifact **of a protocol
entity**. There is no way to attach a description that spans three protocols to
one of them without claiming the other two, and no way to attach a third of a
file. If this catalog vendored the description at all, it would have to choose
between three wrong placements or three copies that drift.

That is not a licensing problem — it is a shape problem, and it would survive a
permissive licence. It is also not exotic: one interface description per product,
served by several processes behind one proxy, is an ordinary way to build a
platform.

## What the enum spells and what the wire is

`bearer-token` and `api-key-header` are the labels this catalog writes on
[rest-api](srn://stackstorm/protocol/rest-api@1). Here the label is basic
authentication, and the framework's own guidance is right about it: `auth` is a
display-only list, and deriving a typed security scheme from a word would invent
a fact. The installation's actual identity source — a flat file, a directory
service, the host's own authentication stack — is a deployment choice this
protocol does not name.

## Sources

Read at `v3.9.0`:
[`st2common/st2common/openapi.yaml`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/openapi.yaml),
[`st2common/st2common/models/api/auth.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/api/auth.py),
[`conf/nginx/st2.conf`](https://github.com/StackStorm/st2/blob/v3.9.0/conf/nginx/st2.conf),
[`conf/st2.conf.sample`](https://github.com/StackStorm/st2/blob/v3.9.0/conf/st2.conf.sample).
