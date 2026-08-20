---
name: play-a-match-in-a-browser
kind: journey
version: 1
title: Play a match in a browser
summary: A human's path from a link somebody sent them to a decided winner — eight steps, two hand-offs to the host, and not one product boundary crossed.
status: review
owner: sergio-bershadsky
actor: /actor/player
relations:
  uses:
    - /environment/production
tags:
  - player-facing
  - single-product
---

The path [play](srn://brass/product/play) exists for. Somebody is sent a URL in a
chat message, opens it, types a name, and an hour or two later watches the score
track settle. Every step is inside one product, which is the fact this journey
contributes to the catalog: the human game is a closed system, and the only
seam it has is between the framework and the code around it.

## Outcome

The match reaches a decided winner and the player sees the decision, without
having read a rulebook and without having created an account.

## Preconditions

Somebody has already created a room. That is `steps[0]`, and it is a hand-off
rather than a precondition because the [host](srn://brass/actor/host) is one of
the players and the same person will play the rest of this path — but the goal
that step serves is not this actor's, so the actor column names them.

## Zero crossings, and why that is a finding rather than a gap

[play-a-match-over-mcp](srn://brass/journey/play-a-match-over-mcp) crosses the
one product boundary in this solution six times in nine steps. This path crosses
it not once. Both are true of the same catalog, and the difference is the whole
architecture: a browser holds a seat directly, while a model reaches one through
an adapter that has to shuttle between two products on every turn.

What this journey therefore contributes to the integration-gap panel is nothing,
and that is the accurate reading. The seam it *does* have is invisible to the
crossing check, because [boardgame-io](srn://brass/product/play/component/boardgame-io)
is modelled as a component inside `play` rather than as a second product: the
lobby routes at `steps[0]` and `steps[1]` and the socket vocabulary from
`steps[2]` onward are all the framework's, and no repository code implements one
of them.

## The two hand-offs are the same person

`steps[0]` and `steps[3]` belong to the host. One human holds both roles for the
whole match, and they are separate actors because the goals differ — creating a
room and judging the table complete are decisions no rule can make, which is why
the lobby is a game phase with ready flags rather than a countdown.

A reader skimming the actor column should stop at `steps[3]`. Everything before
it is people arriving; everything after it is the game.

## Where the interesting narrowing happens

`steps[4]` is one step in this list and a whole protocol of its own
([action-composition](srn://brass/product/play/component/web-client/component/action-flow/protocol/action-composition)),
because that is where a player's intent meets the rules. It is written as a
single step here for the reason the kind gives: a journey step is "the player
builds", not "the player clicks a card". The four workflows under that protocol
are where the clicks live.

## Out of scope

The second era. The path ends at the final score and says nothing about the
transition that gets there — the level-1 purge, the cleared links, the reshuffle
— because those happen to the game rather than to the player, and
[full-two-era-game](srn://brass/requirement/full-two-era-game) is where they are
claimed.

Also out of scope: what happens when the server is redeployed mid-match. Every
release ends every in-progress game
([single-writer-match-state](srn://brass/product/play/component/server/requirement/single-writer-match-state)),
which is a second outcome for this path and therefore, by the no-branching rule,
would be a second journey. Nobody has written it because there is nothing the
player can do in it.
