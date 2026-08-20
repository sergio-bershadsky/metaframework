---
name: 0003-colour-is-ontology
kind: adr
version: 1
title: Colour is ontology
summary: Each of the nine entity kinds owns one hue and nothing else in the console is coloured, so hue always answers "what kind of thing is this?".
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

# Colour is ontology

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

Hue means kind. Each of the nine kinds owns one hue, defined once in
`src/app/globals.css` at matched lightness and chroma — the nine `--kind-*`
tokens run `oklch(0.72–0.78, 0.14–0.15, h)`, holding lightness and chroma inside
a band narrow enough that hue is the only difference a reader can see, so no
kind reads as louder than another. `src/lib/ui/kind.ts` is the single table
mapping kind to that token plus its text/background/border classes and its
icon, and every surface — tree row, badge, graph node, diagram lifeline, chip —
reads from it through `kindStyle()` or `kindColorVar()`. Nothing else in the UI
is given a hue.

## Consequences

- **The graphs lost their easiest encoding.** An edge type may not own a colour,
  so `relation-graph.tsx` tells the five edge types apart by stroke weight, dash
  pattern and arrowhead — `exposes` is 2px solid, `depends-on` is `7 4`,
  `implements` is `1.5 3.5`, `supersedes` is `11 4` with an open arrowhead — and
  its legend draws line samples instead of colour chips. That vocabulary is
  harder to learn than five colours would have been, and it is the price of the
  rule.
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
- **The rule is already broken in the file that defines it.** `STATUS_STYLES` at
  `src/lib/ui/kind.ts:127` paints the *approved* status chip with
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
