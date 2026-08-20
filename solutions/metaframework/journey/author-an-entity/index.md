---
name: author-an-entity
kind: journey
version: 2
title: Author an entity
summary: A model's loop from a slash command to a green check — three crossings between the plugin and the portal, every one of them carried by the model itself.
status: review
owner: sergio-bershadsky
actor: /actor/ai-author
relations:
  uses:
    - /environment/local
tags:
  - llm
  - authoring
  - cross-product
---

The path the [authoring-kit](srn://metaframework/product/authoring-kit) is shaped
around, walked by the reader every `SKILL.md` `description` field is actually
written for. A model is asked for one entity, reads the distilled contract, writes
files, runs the check, reads the failure, and runs it again.

It is worth reading beside
[document-a-solution](srn://metaframework/journey/document-a-solution), which
crosses three products once each and is walked by a person. This one crosses one
boundary three times and is walked by a machine, and neither path names a
protocol anywhere. Two different actors, two different shapes, the same finding:
in this solution the products are joined by files on a disk and a command
somebody types.

## Outcome

One entity exists, is placed where the grammar accepts it, and produces no
error-severity diagnostic.

## Preconditions

A kind and a name, decided by somebody else. The dispatch rule is stated once, in
`/entity-new`: datamodel goes to `model-data`, protocol goes to
`protocol-design`, everything else goes to `add-entity` — all three skills
carried by the kit's
[plugin](srn://metaframework/product/authoring-kit/component/plugin).
This path begins after that decision, which is why it is one entity's path and
not a solution's.

## Three crossings, all `protocol: none`, and the reason is not laziness

`steps[3]`, `steps[4]` and `steps[5]` each change product. None names a protocol,
and each says so explicitly rather than leaving the field out.

There is genuinely nothing to describe. The interface between the kit and the
portal is the filesystem plus a command line: the model writes files, then runs
`npx vitest run src/lib/catalog` with `framework/portal` as the working
directory, and reads stdout. The two protocols this solution does have —
[schema-serving](srn://metaframework/product/portal/component/schema-service/protocol/schema-serving)
and
[catalog-history](srn://metaframework/product/portal/protocol/catalog-history) —
are both machine-to-machine HTTP and neither is anywhere near this path.

Modelling the check as a protocol was considered and is refused for the reason
[git](srn://metaframework/actor/git) has no protocol either: the transport `kind`
enum is `http | grpc | amqp | kafka | websocket | in-process`, and a local
subprocess exec is none of them. Forcing `in-process` plus an `x-` field would
manufacture a conversation out of one program running another.

## What the loop cannot tell this actor

The rules a machine enforces are a strict subset of the rules that matter, and
this journey's outcome is the subset. `steps[5]` is green when the placement,
the frontmatter shape and every reference resolve. It is *also* green when the
four ADR headings are missing, when a requirement has no acceptance criteria,
when a published contract has been quietly narrowed, and when an entity has been
`git mv`'d — nothing in the repository compares an entity against its
predecessor.

There is a second gap inside the loop itself. `steps[4]` reads guidance that is
stale about `steps[3]`:
`marketplace/plugins/metaframework/skills/validate-catalog/SKILL.md:25` names two
test files and `:29` says a pass prints `Test Files  2 passed (2)`, while the run
prints `Test Files  10 passed (10)` and `Tests  204 passed | 5 todo (209)`
(measured 2026-08-20). A model following the
skill literally reads a correct run as a changed one. That is
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec)
unmet, and it is unmet on this exact hop.

## Out of scope

Changing an entity that already exists — a different outcome, therefore a
different journey, and the skill for it is `evolve-entity`, on the same
[plugin](srn://metaframework/product/authoring-kit/component/plugin).

Whether the entity is any good. The kit splits legality from judgement on
purpose, and the judgement half is walked by somebody else in
[audit-a-catalog](srn://metaframework/journey/audit-a-catalog).

Committing. This model writes files; whether they reach a commit is not part of
the path, and there is no CI to notice either way.
