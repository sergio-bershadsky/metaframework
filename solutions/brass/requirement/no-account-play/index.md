---
name: no-account-play
kind: requirement
version: 2
title: A player joins from a link with no signup
summary: Opening an invite link and typing a name is the entire onboarding; there is no account, no password and no email.
status: review
owner: sergio-bershadsky
requirement-type: functional
priority: should
relations:
  uses:
    - /protocol/lobby-api
    - /datamodel/match-credentials@2
tags:
  - onboarding
  - lobby
---

The game is played by friends who were invited in a chat message. Anything
between that message and the board is friction that costs a session — and a
registration step in particular, because it arrives before the player has any
reason to want an account.

So the invite *is* the identity. `/play/<matchID>` is the whole protocol: open
it, type a display name, claim a seat, play. The seat credential returned by
[lobby-api](srn://brass/protocol/lobby-api) is stored locally and is the only
thing that says who you are.

## Acceptance criteria

- **AC-1** Joining a match requires a display name and nothing else — no email, no password, no verification step.
- **AC-2** The invite URL is `/play/<matchID>`, resolved client-side, and it works for any browser that can reach the host.
- **AC-3** A seat's credential is stored in the browser under `brass:creds:<matchID>` and is the only proof of seat ownership.
- **AC-4** No personal data is collected or persisted anywhere — the display name is game state and dies with the match.
- **AC-5** The invite link is unguessable in practice, because the match id is the only secret protecting a room.

## Rationale

It is a `should` and not a `must` because the product does ship without it under
protest: a signup step would work, and would cost sessions. The trade is stated
rather than assumed.

AC-5 is the honest version of the security model. There is no room password and
no allowlist; anyone holding the link can take a free seat, and that is
acceptable for a game played among people who were sent the link.

## Known defect

The credential key is the match id alone, so two tabs of the same browser
profile on the same invite link share one entry: the second tab silently loads
the first tab's seat and plays as that player. It is the most likely way a real
session goes wrong, it is recorded on
[match-credentials](srn://brass/datamodel/match-credentials@2), and it is not
fixed.

## Out of scope

Persistent identity across matches, friend lists, and ranked play — all recorded
non-goals in [out-of-scope-v1](srn://brass/requirement/out-of-scope-v1).
