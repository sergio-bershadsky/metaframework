---
name: ai-author
kind: actor
version: 2
title: AI author
summary: The model runtime that authors the catalog through the plugin's skills — the reader every SKILL.md description is actually written for.
status: review
owner: sergio
actor-type: external-system
goals:
  - Navigate and modify a catalog correctly using only what the repository states.
  - Get the placement right on the first attempt, because placement is permanent.
  - Know which rules the check enforces and which are mine to hold.
  - Recognise a change that is forbidden in place before making it.
relations:
  uses:
    - /product/authoring-kit/component/plugin
    - /product/authoring-kit/component/reference-bundle
tags:
  - llm
  - authoring
---

A model runtime — in practice a Claude Code session — that writes catalog files
by invoking the plugin's skills. It is the reason the
[authoring-kit](srn://metaframework/product/authoring-kit) exists in the shape it
has: every `SKILL.md` `description` field is a list of trigger phrases written to
be matched by a model, not a paragraph written to be read by a person.

It is also a founding principle rather than a later idea.
`framework/spec/index.md`, core principle 5: "An AI agent dropped into the
repository with no tooling must be able to navigate, cite, and modify the catalog
correctly using only this spec."

## Why `external-system` and not `system`

The runtime is outside the ownership boundary. Its internals are not described
here, its behaviour cannot be changed from this repository, and the only
negotiation available is the wording of a skill and the phrasing of a rule. What
*is* ours is the plugin: the seven skills, the three commands, the agent, and the
3,562-line reference bundle it reads when `framework/spec/` is not on disk.

The boundary test's third question settles it: does anything have to name this
counterpart in a `uses`, `exposes`, `depends-on` or `implements` edge? Nothing
does — the components point at each other and at the spec, never at the model —
so an actor is the right shape and no `external` component is needed. Precedent
in this repository: `solutions/brass/actor/llm-agent`, modelled the same way for
the same reason.

## What it is given, and what it is trusted with

Given: a distilled specification that travels with the plugin, a procedure per
activity, worked examples per kind, and one command it can run to find out
whether it was right.

Trusted with: everything the check does not cover. The four ADR headings, a
requirement's acceptance criteria, whether a change is additive or a swap,
whether a component's summary needs an "and" to be true. `evolve-entity` exists
because the instinctive fix — rename, move, narrow — is exactly what the
framework forbids, and no diagnostic fires when it happens.

That asymmetry is the whole design tension of this solution: the rules a machine
enforces are a strict subset of the rules that matter, and this actor is the one
standing on the difference.

## Where the description is currently unfaithful to it

The kit tells this actor that a passing catalog check looks like `Test Files  2
passed (2)`. It prints four. A model following
`skills/validate-catalog/SKILL.md` literally would read a correct run as a
changed one. That single stale sentence is the clearest available demonstration
of why
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec)
is a `must` with no enforcement behind it.

## Boundaries

This actor is not the reviewing agent. `agents/catalog-reviewer.md` is a
configuration *we* own — a prompt plus `tools: Read, Grep, Glob` — described on
[plugin](srn://metaframework/product/authoring-kit/component/plugin);
the runtime that executes it is this actor. The two are separate for the same
reason a credential is separate from the process that assumes it.

It is named in no protocol's `participants` list, and there is no protocol here
to name it in. A model reading markdown and writing files is not a conversation
over a wire, and modelling one would manufacture a transport the ontology has no
value for.
