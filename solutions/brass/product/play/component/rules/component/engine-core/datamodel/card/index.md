---
name: card
kind: datamodel
version: 1
title: Card
summary: A hand card — a location face, an industry face, or one of the two wild kinds; every action discards exactly one.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - rules
  - hidden-information
---

# Card

The unit of authorisation. Every one of the six actions discards exactly one
card, and which cards a player holds is the only private information in the
game — see
[hidden-hands](srn://brass/requirement/hidden-hands).

Four faces, discriminated by `type`:

| `type`          | carries      | authorises                                                     |
| --------------- | ------------ | -------------------------------------------------------------- |
| `location`      | `city`       | building any industry in that city                              |
| `industry`      | `industries` | building one of those industries anywhere in your network       |
| `wild-location` | nothing      | building any industry in any city **except** the farm breweries |
| `wild-industry` | nothing      | building any industry anywhere in your network                  |

An `industry` card carries one or two allowed industries: the dual card is the
Cotton/Manufacturer face, which is why `industries` is an array rather than a
scalar.

## Wilds are not just wider cards

Two things separate a wild from a location card of the same reach. A wild is
never dealt — the only way to get one is a Scout action, which discards three
cards to draw one of each, and which is illegal while you already hold a wild.
And a discarded wild returns to the shared pool (`wild-location` /
`wild-industry` counters on
[game-state](srn://brass/product/play/component/rules/component/engine-core/datamodel/game-state@1),
starting at 4 each) rather than to your discard pile.

That scarcity is why the enumerator orders every move's `eligible-cards`
non-wild-first and defaults to element 0 — spending a wild when an ordinary card
would do is a strictly worse play, so the default never does it. See
[legal-move](srn://brass/product/play/component/rules/component/move-enumerator/datamodel/legal-move@1).

## Id conventions, and a defect in one of them

Ids are content-derived and stable within a match:

- `loc-<city>-<i>` for a location card, `i` its copy index.
- `ind-<industry>-<n>` for a single-industry card, `n` a running counter.
- `ind-cm-<i>` for the dual Cotton/Manufacturer card.
- `wl-<next-tile-id>-<player-id>` and `wi-<next-tile-id>-<player-id>` for the two
  cards a Scout mints.

The scout form is **not** collision-free, and this is verified in the source
rather than inferred: `scout` mints both ids from `G.nextTileId` and does not
increment it, so a player who scouts twice with no tile built in between receives
a second pair carrying the ids of the first. Nothing currently keys on card id
across time — moves resolve a card by lookup within the current hand — so the
consequence today is confined to UI keying and animation. It is recorded here
because it is the kind of latent defect that becomes a duplicated-card bug the
moment anything starts treating card id as an identity.

## `face-down`

Set on the cards seeded into the discard pile at canal setup: they are drawn face
down and are not attributable to any played action. Cleared when the canal-to-rail
transition reshuffles the discards back into the deck. It is a display concern
that happens to be persisted, not a rules input.

## Redaction

`playerView` replaces every other seat's hand entries with
`{ id: "hidden-<player-id>-<index>", type: "location" }`. The count survives, the
identity does not, and the placeholder is a well-formed instance of this schema —
which is why a consumer must never assume a `location` card in an opponent's hand
carries a real `city`.
