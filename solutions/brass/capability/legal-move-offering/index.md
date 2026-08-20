---
name: legal-move-offering
kind: capability
version: 1
title: Offer only the moves the rules allow right now
summary: Hand whoever holds the turn the exact set of moves the engine would accept, so an illegal move is never composed rather than being composed and refused.
status: review
owner: sergio-bershadsky
tags:
  - rules
  - contract
---

Brass Online can answer "what can I do?" — completely, for the position on the
board at this instant, and in a form the asker can act on without knowing a
single rule. A slot that cannot be built on is not offered. A card that cannot
authorise the build already chosen is not offered. Where a move needs three coal
and a barrel of beer, each unit arrives with the list of sources that could
legally satisfy it, and where a list has one entry nobody is asked the question.

The consequence is worth stating in the strong form, because it is the design
claim of the whole solution: **an illegal move is not refused, it is
unrepresentable**. A human never composes one because the interface has nothing
to compose it from; a model never submits one because `make_move` takes an id
from an enumeration it was just handed and nothing else. Refusal still exists —
the engine is the authority and always adjudicates — but on this path a refusal
is a defect rather than a user experience.

This is a doing and not a component because it is offered to three consumers at
once and each of them would otherwise have built it: the browser's interaction
machinery, the MCP tool surface, and the bot validator that plays complete games
in the engine suite. One enumeration, three surfaces, and a compile error in all
three the day its exported types change.

Replace the browser with a native app, replace MCP with anything else, move the
enumeration behind an HTTP endpoint — the sentence stands. What would break it is
a client that works out for itself what is legal, which is precisely the
implementation
[0001-narrow-never-recompute](srn://brass/product/play/component/web-client/adr/0001-narrow-never-recompute)
was written to reject.

## Boundaries

- **Offering is not enforcing.** The obligation that no illegal move is ever
  accepted binds every path into the game, including a hand-crafted socket frame
  that never asked this capability anything
  ([legal-move-enforcement](srn://brass/requirement/legal-move-enforcement)); it
  is discharged by
  [rule-adjudication](srn://brass/capability/rule-adjudication). This capability
  is why a well-behaved client never triggers it.
- **Agreement with the engine is claimed, checked, and not assumed.** The
  enumerator mirrors the validation inside the move handlers rather than sharing
  it, so divergence is possible in principle. That is the standing risk of the
  design, and it is why
  [enumerator-engine-parity](srn://brass/product/play/component/rules/requirement/enumerator-engine-parity)
  is a `must` and why
  [rejected-enumerated-moves](srn://brass/product/play/component/rules/metric/rejected-enumerated-moves)
  puts a number on it.
- **It ranks nothing.** The list is unordered with respect to quality: no
  evaluation, no scoring, no pruning of obviously bad options. For the browser
  that is a UI decision; for the agent it is a written one
  ([0002-agent-owns-the-loop](srn://brass/product/agent-play/adr/0002-agent-owns-the-loop)),
  taken so that the resulting play is the model's and remains evidence about the
  model.
- **One ordering invariant is inside the capability rather than beside it.**
  `eligibleCards` is non-wild first, so the default spend never burns a wild card
  when an ordinary one would do. Anything that reorders that array changes the
  game, which makes it part of what is offered and not a rendering detail.

## Both products realize it, and neither owns it

[move-enumerator](srn://brass/product/play/component/rules/component/move-enumerator)
produces the list and the resource plans.
[action-flow](srn://brass/product/play/component/web-client/component/action-flow)
turns it into clicks: every function it exports takes a `LegalMove[]` and returns
a subset or a projection of it, and there is no branch anywhere in it that
decides a rule.
[mcp-server](srn://brass/product/agent-play/component/mcp-server) turns the same
list into content-derived ids — `build|stafford|0|cotton` — that a model can name
back.

Two of those three sit in [play](srn://brass/product/play) and one in
[agent-play](srn://brass/product/agent-play), which is the second place in this
catalog where a product boundary cuts across a capability rather than containing
it. The seam is documented as a protocol precisely because of that:
[legal-move-api](srn://brass/protocol/legal-move-api) is a TypeScript module
boundary modelled next to an HTTP lobby, because architecturally it is the same
kind of thing.

## Not this

- *Teaching the rules* is a different doing. A model that reads
  `rules://brass/moves` learns what an id means and what `confirmTurn` is for;
  that is [unattended-play](srn://brass/capability/unattended-play)'s, and it is
  realized by static text rather than by an enumeration.
- *Explaining why a move is absent* is not offered at all. The enumeration says
  what is legal and never why the rest is not, and no component in this catalog
  computes a reason. A player deduces it from the board; a model sometimes does
  not.
- *Guessing what the player meant* is explicitly declined. Asking "which
  industry?" when exactly one is legal is the failure mode
  [0005-prompt-only-real-choices](srn://brass/product/play/adr/0005-prompt-only-real-choices)
  exists to prevent — a prompt with one answer is not a choice offered, it is a
  question asked for nothing.
