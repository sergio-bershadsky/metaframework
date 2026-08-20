---
name: table-formation
kind: capability
version: 1
title: Turn one link into a seated table
summary: Get two to four participants into one match from a single URL — named, coloured and ready — with no account, no invite system and no matchmaking.
status: review
owner: sergio-bershadsky
tags:
  - lobby
  - onboarding
---

Brass Online can assemble a table. One person asks for a room and receives a URL;
everyone else opens that URL, says what to call them, and takes a seat. Seats
acquire a colour, an avatar and a ready flag, and when the person who created the
room judges the table complete, the game starts. Nothing in that sentence is an
account, and nothing in it is a matchmaker.

The link *is* the access control. There is no server-side notion of an
invitation, no room code, no private/public distinction, and no way to eject
somebody who opened a URL they were forwarded — the first person to open it takes
the first unnamed seat. That trade is stated rather than implied on
[no-account-play](srn://brass/requirement/no-account-play): onboarding friction
is zero and the recovery from a wrong joiner is starting again.

The doing is also the answer to *who may speak for a seat afterwards*. Claiming a
seat is the one moment in this solution where a caller receives a secret — the
framework's per-seat credential, minted on join and checked on every later move.
There are no sessions and no tokens beyond it, which is why this capability, and
not [rule-adjudication](srn://brass/capability/rule-adjudication), is where the
solution's entire authentication story is realized.

Rebuild it on a lobby service with rooms in a database, or replace the link with
a six-letter code read out over a call: the paragraph above survives. What would
end it is the solution deciding people should have accounts, which is a recorded
non-goal ([out-of-scope-v1](srn://brass/requirement/out-of-scope-v1)) rather than
an omission.

## The realizer set is the point

Four components realize this, and they sit in **two products** and in software
this solution did not write:

- [boardgame-io](srn://brass/product/play/component/boardgame-io) supplies the
  lobby REST surface and the credential mint. No repository code implements one
  of those routes. A capability of this solution being realized by a dependency
  is uncomfortable to write down and is the honest picture: we bought the doing.
- [server](srn://brass/product/play/component/server) serves that surface at a
  hostname and is the authority that adjudicates the lobby phase, which is an
  ordinary game phase rather than infrastructure
  ([0005-lobby-inside-game-state](srn://brass/adr/0005-lobby-inside-game-state)).
- [lobby-ui](srn://brass/product/play/component/web-client/component/lobby-ui)
  is the human half — the home screen, the join, and the `localStorage` cache
  under `brass:creds:<matchID>` that lets a reload rejoin the same seat.
- [mcp-server](srn://brass/product/agent-play/component/mcp-server) claims a seat
  for a model **through the same four HTTP calls, in the same order, against the
  same handler**, as recorded on
  [lobby-api](srn://brass/protocol/lobby-api). Nothing in the lobby knows which
  kind of client is on the other end.

That last edge is why this capability is worth its own entity rather than being a
paragraph inside [play](srn://brass/product/play). The product boundary between
`play` and `agent-play` is drawn on consumer, channel and stage — and it cuts
straight across this doing, which is identical on both sides of it.

## Boundaries

- **Ends at `hostStart`.** Once the game begins, everything a seat does is
  [rule-adjudication](srn://brass/capability/rule-adjudication). The seating
  moves themselves — `sitDown`, `pickColor`, `pickAvatar`, `toggleReady` — are
  adjudicated by the engine like any other move, so the two capabilities overlap
  in mechanism and not in what they let anybody do.
- **Two to four, and the framework's number is not the seat count.** Matches are
  always created with four framework seats; how many are really played is
  decided by who sat down, and every count has its own deck and merchant setup
  ([seat-count-2-to-4](srn://brass/requirement/seat-count-2-to-4)).
- **No matchmaking, stated as a fact.** An agent asked for "a match" takes the
  first one holding any seat without a name — no ranking, no age check, no
  capacity heuristic. There is nothing here to rebuild differently; there is
  nothing here.
- **The capability is realized with a known defect.** Credentials are cached per
  match, not per seat, so two tabs of one browser opening the same invite link
  both become the seat claimed first. It is recorded on
  [match-credentials](srn://brass/datamodel/match-credentials@1) and it is a
  defect in the doing rather than a limit of it.

## Not this

- *Reconnecting a dropped seat* is not part of this. A browser reload rejoins
  because the credential is in `localStorage`
  ([match-survives-refresh](srn://brass/product/play/requirement/match-survives-refresh));
  an MCP process holds its credential in memory and cannot re-enter its seat at
  all ([long-running-reconnect](srn://brass/product/agent-play/requirement/long-running-reconnect),
  unmet). Two different answers to one question is exactly why the capability
  stops before it.
- *Deciding the table is complete* is a judgement, not a rule, and it is the
  only thing [host](srn://brass/actor/host) can do that a
  [player](srn://brass/actor/player) cannot. The capability puts people in
  seats; it does not know when there are enough of them.
- *Spectating* would be a different doing and is a recorded non-goal. There is
  no seat for someone who is not playing.
