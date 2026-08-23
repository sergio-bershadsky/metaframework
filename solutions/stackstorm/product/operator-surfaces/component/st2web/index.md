---
name: st2web
kind: component
version: 2
title: st2web
summary: The browser interface — history, rules, packs and a live execution view, built as a single-page application in its own repository.
status: review
owner: sergio-bershadsky
component-type: ui
lifecycle: released
criticality: 3
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
    - /protocol/auth-api
    - /protocol/event-stream
    - /protocol/rest-api
  depends-on:
    - /product/platform/component/st2api
    - /product/platform/component/st2auth
    - /product/platform/component/st2stream
tags:
  - web
  - spa
x-runtime: javascript
x-repository: StackStorm/st2web
---

The surface an [automation-operator](srn://stackstorm/actor/automation-operator)
spends most of their time in: browsing execution history with the trigger that
caused each run, inspecting a workflow's task graph while it advances, editing
rules, and installing packs. It is a static bundle — JavaScript, HTML and assets
— served by whatever sits in front of it, which is why it shows up in this
catalog's three deployment shapes as three different serving arrangements and
never as a server of its own.

## The three services it talks to, and why all three edges exist

It authenticates against one service, reads and writes everything through
another, and subscribes to a third for live updates. The third edge is the one
worth naming: without it the interface would be a page a human reloads, and with
it an execution's output appears as it is produced.

It is not the only consumer of the server-sent-events surface, and never was.
Version 1 of this page said it was, and
[event-stream](srn://stackstorm/protocol/event-stream) contradicted that on the
day both were written: the protocol names three clients — this component,
[st2client](srn://stackstorm/product/operator-surfaces/component/st2client),
which tails an execution's output over the same stream, and
[st2chatops](srn://stackstorm/product/operator-surfaces/component/st2chatops),
which holds a connection open for one fixed event name. The `uses` edge above is
this component's half of that participant list.

## Why it is `ui` and owns nothing

Every decision it displays was made elsewhere. It holds no domain state, applies
no rule, and can compute nothing the API would not have computed — a deliberate
property, and the reason a reviewer can read this component quickly.

The actor it serves is named above by edge and in this paragraph by name, which
is what the `ui` discipline asks for: a human-facing surface has to say who
reaches it, or it is a screen for nobody.

## Its own release train

Separate repository, separate tag, separate language from everything in
[platform](srn://stackstorm/product/platform). Version skew between the
interface and the API is therefore a real possibility rather than a theoretical
one, and nothing in this catalog can express a compatibility range between two
components — the `depends-on` edge is untyped and unversioned by design. A pin
is expressible on a *datamodel* reference and on nothing else.
