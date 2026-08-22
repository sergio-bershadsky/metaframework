---
name: st2web
kind: component
version: 1
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
it an execution's output appears as it is produced. That is the only consumer in
this catalog of the server-sent-events surface, and it is the reason that
surface exists.

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
