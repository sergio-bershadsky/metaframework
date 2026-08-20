---
name: 0003-colour-is-ontology
kind: adr
version: 3
title: Colour is ontology
summary: Hue means kind — twelve kinds in two tiers — and its one exception is the ten component-types, in a third and dimmer register that resolves before hue does.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/console
    - /product/portal/component/diagrams
tags:
  - portal
  - design-system
---

## Context

The catalog is a graph of nine kinds. A reader looking at a tree row, a badge in
a paragraph, a node in a graph and a lifeline in a sequence diagram is looking at
the same entity four times, in four components written at four different points
in the day. If each surface picks its own colour scheme, the reader learns four
schemes and trusts none.

The founding decision record only asked for "electric blue-violet accent".
Commit `ef74fe9` (2026-08-19 12:25) replaced that with something stronger and
stated it in the commit body: "Colour is ontology — each of the nine entity kinds
owns one hue at matched lightness/chroma, used identically in tree, badges and
(next) diagram nodes; nothing else is coloured."

The console is dark-only
([0002-dark-only-console](srn://metaframework/product/portal/adr/0002-dark-only-console)),
which makes the rule affordable: nine hues have to be balanced against exactly
one background.

## Decision

Hue means kind. Each kind owns one hue, defined once in `src/app/globals.css`,
and the nine **structural** kinds hold matched lightness and chroma — those
`--kind-*` tokens run `oklch(0.72–0.78, 0.14–0.15, h)`, a band narrow enough
that hue is the only difference a reader can see, so no kind reads as louder
than another. `src/lib/ui/kind.ts` is the single table mapping kind to that
token plus its text/background/border classes and its icon, and every surface —
tree row, badge, graph node, diagram lifeline, chip — reads from it through
`kindStyle()` or `kindColorVar()`. Nothing else in the UI is given a hue.

## Amended at v2 — a second tier, and it is not a chroma tier

Reopening the ontology (decision-record amendment 2026-08-20-a) added
`capability`, `journey` and `metric`. Nine hues at roughly 35° apart were
already on the distinguishability floor, so three more at full chroma would have
collided: hue alone had run out. The three are given a **conceptual tier** at
`oklch(0.80, 0.08, h)` and take the three real gaps left on the wheel.

What is worth recording is the part the code comment originally got wrong. The
tier was described as carried by chroma. It is carried by chroma **and**
lightness, and at the size a kind is actually met the second channel is not the
junior partner. Measured in CIELAB (D65) from the tokens themselves:

| tier       | L\*       | C\*ab     | contrast vs `--background` |
| ---------- | --------- | --------- | -------------------------- |
| structural | 65.3–73.5 | 41.7–60.5 | 7.3:1 – 9.5:1              |
| conceptual | 75.7–77.3 | 26.5–31.7 | 10.1:1 – 10.6:1            |

Chroma is the larger move by the metric — 22.6 C\* units between the means
against 6.7 L\* units — but a kind reaches a reader as a 14–16px icon or a badge
dot, and the eye's spatial acuity for chroma is far below its acuity for
luminance. At that size the brightness step separates the tiers at least as
strongly as the desaturation does, and every conceptual hue sits a full contrast
step above every structural one. Flattening lightness back into the structural
band to make the phrase "chroma tier" literally true would take most of the
tier's separation with it, so the description was corrected instead of the
palette. The rule above is unchanged: hue still means "which kind", and the tier
means "concept or structure" — never "how important".

## Amended at v3 — the rule acquires its first real exception

`component-type` now carries a hue, on a chip in the entity header. That
contradicts the sentence at the top of this record — "Nothing else in the UI is
given a hue" — and it is an amendment rather than a corner case, so it is
written here rather than left for a reader to discover in `globals.css`.

**Why it was granted.** The console already refuses colour to `lifecycle`, and
the reasoning on `LifecycleChip` is the test this had to pass: colour is
rationed, and a claimant must show both that the fact is worth the channel and
that no better channel exists. `component-type` clears both where lifecycle did
not. It is the most useful fact about a component after its name — whether the
thing is a service, a library or somebody else's system changes how every other
statement on the page reads — and unlike lifecycle it is a flat set of ten with
no order, so there is no position marker to draw instead. The alternative on
offer was an eleventh grey chip in a row of four.

**What keeps "hue means kind" true anyway.** Two things, and both are
structural rather than promises:

- **A third register, resolved before hue is.** The component-type tokens are
  `oklch(0.70, 0.09)` — darker than both kind tiers and less chromatic than the
  structural one. Measured against `--background` on 2026-08-20: component-type
  6.78–7.63:1, against structural 7.3–9.5:1 and conceptual 10.1–10.6:1. The
  register is a contrast step *below* everything that means "kind", so the eye
  settles "this is a facet" before it asks which colour it is.
- **Hue never carries the identity alone.** The label is always drawn and every
  type has its own icon. That is what makes ten hues at ~36° affordable on a
  wheel this record already called crowded at nine: colour groups, and the word
  decides. It would not have been affordable on a graph node, which is exactly
  why this record rejected colour-by-edge-type.

**The honest cost.** There are now three tiers to learn instead of two, and a
reader who has learned only "hue means kind" will briefly misread a dim orange
`gateway` chip as a kind they have not met. Nothing enforces the register — no
test asserts that a `--ctype-*` token stays out of the structural band, exactly
as nothing enforces any other rule here.

**`external` is not a hue and that is deliberate.** It is near-achromatic
(`oklch(0.68, 0.015)`), because "a system this solution does not own" is the one
value that should recede. It is also the only component-type whose colour means
something other than "which one" — a small inconsistency, kept because greying
the foreign thing says more than a tenth hue would.

## Consequences

- **The graphs lost their easiest encoding.** An edge type may not own a colour,
  so `relation-graph.tsx` tells the seven edge types apart by stroke weight, dash
  pattern and arrowhead — `exposes` is 2px solid, `depends-on` is `7 4`,
  `implements` is `1.5 3.5`, `realizes` is a heavier `6 3 1.5 3` dash-dot,
  `measures` is a round-capped dot trail with an open arrowhead, `supersedes` is
  `11 4` with an open arrowhead — and its legend draws line samples, arrowheads
  included, instead of colour chips. That vocabulary is harder to learn than
  seven colours would have been, and it is the price of the rule. It is also
  fragile in a way colour would not have been: with two of the three channels
  spent, `realizes` and `measures` shipped 0.25px apart in weight, and a
  capability page opens its graph at zoom 0.58 where that became 0.15px. The
  edges now carry `vector-effect: non-scaling-stroke`, which takes weight and
  dash period out of the viewport transform, because a vocabulary that only
  reads at 100% is not a vocabulary.
- **The accent hue got a job instead of a decoration.** `--primary` is spent on
  one thing in the graphs: which edges touch the entity the page is about.
- **Three colours survive outside the ontology, and they are severity, not
  decoration:** `--primary` (focus), `--destructive` and `--warning`
  (diagnostics). A reader who sees red in this console is being told something is
  wrong, never that something is emphasised.
- **The tree had to solve status without colour.** `catalog-tree.tsx` carries
  kind hue on the icon only — colouring labels too "would turn a dense sidebar
  into confetti" — and encodes the four document statuses as line treatments:
  dotted underline for draft, dashed for review, nothing for approved,
  strike-through for deprecated.
- **The palette is duplicated by hand.** Monaco parses theme colours as hex and
  mermaid's `themeVariables` are the same kind of consumer, so nine tokens are
  hand-converted once into `src/lib/ui/console-tokens.ts`, each annotated with
  the token it came from. Nothing regenerates them. If a token in `globals.css`
  moves, this file does not notice.
- **The rule is already broken in the file that defines it.** `STATUS_STYLES` in
  `src/lib/ui/kind.ts` paints the *approved* status chip with
  `text-kind-environment` — literally the environment kind's green — and the
  deprecated chip with `text-destructive`. So on every entity page an approved
  document wears a kind hue that has nothing to do with its kind. It is a real
  violation, it has been shipped since the status chip existed, and it is
  recorded here rather than quietly fixed, because the point of this catalog is
  that the description matches the code.
- **Nothing enforces any of it.** There is no lint rule forbidding a hex literal
  or a Tailwind colour utility in a component, and no test asserts that a
  surface reads its hue from `kind.ts`. The rule holds because one person wrote
  all of it in one day.

## Alternatives considered

- **Colour by document status** (draft / review / approved / deprecated). The
  other axis a reader scans for. Rejected because it competes for the same
  channel and loses on frequency: kind is what a reader is looking for on every
  screen, status only when auditing. Status ended up on the line-treatment
  channel in the tree instead, which is where it still is.
- **Colour by edge type in the graphs, kind elsewhere.** Locally the better
  drawing — five hues on edges are instantly separable, and the dash vocabulary
  above is genuinely harder to read. Rejected because the two schemes meet on
  the same canvas: a `uses` edge in the datamodel hue landing on a datamodel
  node makes the hue ambiguous exactly where the reader most needs it to be
  literal.
- **No semantic colour at all — monochrome plus icons.** Not considered at the
  time. It would have removed the console-tokens duplication and the status-chip
  leak above, at the cost of the one property that makes a dense tree scannable.
