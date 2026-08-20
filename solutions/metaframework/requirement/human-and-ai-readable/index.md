---
name: human-and-ai-readable
kind: requirement
version: 2
title: The catalog is readable by a human and by an agent, with grep alone
summary: A person or a model with no tooling must be able to navigate, cite and correctly modify the catalog using a text editor and grep.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: must
relations:
  uses:
    - /product/specification/component/core-contracts
tags:
  - readability
  - founding
---

The founding principle, and the one every format choice in the framework was
settled against. `framework/spec/index.md` core principle 5 states it: names are
kebab-case, references are greppable URIs, frontmatter fields are flat and
predictable, and "an AI agent dropped into the repository with no tooling must be
able to navigate, cite, and modify the catalog correctly using only this spec."

It is the reason acceptance criteria are a markdown list under a pinned heading
rather than a YAML block inside frontmatter; the reason an entity's kind is
written into its path at every level instead of inferred from depth; the reason
the SRN, the schema URL and the disk path are mechanically inter-convertible
rather than three registries; and the reason a diagram must have a text
equivalent.

## Acceptance criteria

- **AC-1** The demonstration is a query, not a metric: `grep -rl "^status: deprecated" solutions/` returns exactly the deprecated entities.
  - The spec offers this as its own worked example of the principle, unanchored.
    The anchor is this catalog's correction to it, and it was earned: writing this
    criterion put the literal string into prose, so the unanchored form now returns
    three false positives inside this solution. A frontmatter field is greppable
    because it starts a line; a rule that ignores that is a rule about a corpus
    nobody is quoting yet. Measured 2026-08-19: anchored, two hits — the acme actor
    and the brass environment that are genuinely deprecated.
- **AC-2** Every reference the framework owns the format of is greppable as text, with no index and no parser.
  - It takes two queries, not one, and the criterion says so rather than rounding
    up. Measured over `solutions/acme` on 2026-08-19: `grep -rn
    "srn://acme/datamodel/money"` returns 16 hits — prose links and the schema's
    `x-srn` — while `grep -rn "datamodel/money"` returns 61, of which 28 are in
    YAML and JSON artifacts. The gap is not a defect: the spec asks for the
    solution-absolute form (`/datamodel/money@1`) for anything outside an entity's
    own subtree, and artifacts take it. So the greppable token is the tail of the
    path, and the full `srn://` form is the narrower query, not the complete one.
- **AC-3** An entity's kind is readable from its path without loading anything.
  - The second-to-last path segment is the kind, at every depth. The solution root
    is the sole exception and needs no rule: it is the only entity with no bucket
    above it, and its kind is always `solution`.
- **AC-4** Every path segment under `solutions/` matches `^[a-z0-9]+(-[a-z0-9]+)*$`, so a name is never ambiguous with a shell glob, a URL escape, or a case-folding filesystem.
- **AC-5** Frontmatter nests at most two levels, and never a third.
  - Most fields are a scalar or a list of short tokens; `relations` is a map of
    edge type to list of references. Four kind fields go one level deeper and are
    the whole exception set: a solution's `scope` and `contacts`, and a protocol's
    `participants` and `conforms-to`. Each holds only scalars at the bottom, which
    is still readable by eye — but "flat" would be the wrong word for it, and this
    catalog's own `index.md` is what proves that.
- **AC-6** An author who has read only `structure.md`, `frontmatter.md` and one kind document can add a legal entity.
  - That is the reading order `framework/spec/index.md` prescribes, and it is three
    documents, not fourteen.

## What enforces this

Nothing, directly. It is the requirement in this catalog with the widest gap
between its importance and its enforcement, and the gap is the point of writing
it down.

Three mechanical proxies exist and each covers a corner:

- `E_SRN_SYNTAX` rejects a path segment that is not kebab-case, which is AC-4.
- `E_FM_SCHEMA` rejects a frontmatter shape the zod contract in
  `framework/portal/src/lib/catalog/frontmatter.ts` does not admit, which keeps
  AC-5 from drifting field by field.
- `E_FM_UNKNOWN_FIELD` rejects any top-level field without an `x-` prefix, which
  is what stops the flat shape from silently growing a nested one.

Greppability itself has no test. AC-1, AC-2 and AC-6 are demonstrations a person
performs, and this description does not claim otherwise.

## Rationale

The criteria are demonstrations rather than numbers on purpose. There is no
`metric` kind in the closed ontology, and inventing a percentage — "90% of
references resolve by grep" — would produce a figure nobody measured to describe
a property that is either true of a format or not.

The strongest evidence that the requirement holds is the existence of the
[authoring-kit](srn://metaframework/product/authoring-kit): 3,562 lines of
distilled reference that a model reads instead of the repository, written on the
assumption that a model *can* work the catalog from prose alone. If AC-6 were
false, the kit would have to ship a parser.

## Out of scope

Rendering quality in the portal. That the console is legible is a different claim,
owned by [console](srn://metaframework/product/portal/component/console) and by
[every-diagram-has-a-text-equivalent](srn://metaframework/product/portal/requirement/every-diagram-has-a-text-equivalent).
This requirement is about the files with the portal switched off.
