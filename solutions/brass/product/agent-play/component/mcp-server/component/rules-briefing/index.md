---
name: rules-briefing
kind: component
version: 2
title: Rules briefing
summary: The engine-specific rulebook, strategy primer, and move guide served to the model over rules:// resources.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: released
relations:
  depends-on:
    - /product/play/component/rules
  implements:
    - /product/agent-play/component/mcp-server/component/rules-briefing/requirement/briefing-fidelity
tags:
  - content
  - llm
---

`rules-content.ts` — three static markdown documents exported as string constants and
served over `rules://brass/rulebook`, `rules://brass/strategy` and
`rules://brass/moves`.

## Why static text is a component

Because it is a contract with a consumer, and because it is a third copy of the rules.

The model reads these once on connect and carries them for the whole game at no
per-turn cost — that is the economic argument for static text over a tool call. The
architectural argument is that they teach **this engine**, not the tabletop game. The
rulebook states the two-action turn plus the required `confirmTurn` gate in its first
section, describes auto-resolved resource sourcing, and calls out every place the
implementation differs from the printed rules. A generic Brass rulebook would make
the agent play a different game and lose.

## The fidelity problem, stated plainly

There are now three descriptions of the rules in this repository: the skills under
`.claude/skills/` (the source of truth), the engine that implements them, and this
text. The first two are held together by tests and an audit. This one is held
together by nothing.

No test asserts that a claim in `RULEBOOK` matches the engine's behaviour. Change the
action budget in `game.ts` and this text keeps confidently telling a model the old
number. That is what
[briefing-fidelity](srn://brass/product/agent-play/component/mcp-server/component/rules-briefing/requirement/briefing-fidelity)
exists to record, and why it sits in `draft`: the obligation is real and currently
undischarged.

## The move guide is the load-bearing one

`rules://brass/moves` is not rules content at all — it is the id-to-semantics
contract for `get_legal_moves` and `make_move`. It tells the model that ids are
content-derived, that a stale id is rejected rather than reinterpreted, and that a
turn ends with an explicit `confirmTurn`. A model that skips the rulebook can still
play badly but legally; a model that skips this document cannot drive the tools at
all.

## No runtime of its own

`component-type: library`: it is compiled into the MCP process and declares no
environment. It depends on [rules](srn://brass/product/play/component/rules)
descriptively rather than by import — the text is *about* that package — and that
edge is the only thing in the catalog connecting the two, which is precisely the
coupling the fidelity requirement is about.
