---
name: 0005-relative-path-schema-refs-without-id
kind: adr
version: 1
title: Relative-path schema refs, with no $id
summary: schema.json drops $id entirely and references other models by relative file path, because a stock generator resolves a path off the filesystem and cannot resolve a private URI scheme. Superseded.
status: review
owner: sergio-bershadsky
decision-status: superseded
date: "2026-08-19"
deciders:
  - sergio
relations:
  supersedes:
    - /adr/0004-srn-as-the-json-schema-reference-syntax
  uses:
    - /product/portal/component/schema-registry
tags:
  - json-schema
  - interoperability
---

# Relative-path schema refs, with no $id

## Context

[0004](srn://metaframework/adr/0004-srn-as-the-json-schema-reference-syntax) made
the SRN the reference syntax inside `schema.json` on the strength of uniformity.
Before the first schema artifact was committed, the requirement behind that
choice was restated in a form that could be tested: references must be
*compliant and generic* — "resolvable by any standard tool, not only by this
portal" (`docs/decision-record.md:127-129`).

Two things were then measured rather than assumed
(`docs/decision-record.md:132-152`), and they cut in opposite directions.

1. **Editor navigation is unobtainable through reference syntax.** VS Code
   embeds `vscode-json-languageservice`, which produces navigable links only for
   same-document JSON Pointers (`#/$defs/money` — verified working). Every
   external form produced nothing: SRN refs, plain relative paths, and relative
   paths with pointers alike. This retired one of 0004's two premises outright:
   *no* choice of `$ref` spelling buys go-to-definition, so the question was
   never navigation.

2. **Generic consumption is real, and an SRN ref breaks it.** Off-the-shelf
   `json-schema-to-typescript` against the same schema pair:

   ```text
   "$ref": "/datamodel/money@1"      → FAILED: Error opening file "/datamodel/money@1"
   "$ref": "../money/schema.json"    → OK: interface Order { total?: Money } + interface Money
   ```

   `ajv-cli`, `quicktype` and `datamodel-code-generator` behave the same way:
   they resolve relative file references off the filesystem and have no way to
   resolve a private URI scheme.

The decision that follows is the second measurement taken at face value.

## Decision

Inside `schema.json` only, and changing nothing about the SRN anywhere else:
**`$ref` is a relative file path** to the target's `schema.json`
(`../money/schema.json`), and **`$id` is omitted entirely**. A relative `$ref`
resolves against the base URI, which is `$id` when present, so an `srn://` `$id`
would re-break generic resolution even with path-style refs — dropping it is not
a concession, it is required by the choice. Identity moves to the derivable path
plus an optional `x-srn` annotation, validated against the file's own path at
load so it cannot drift. Version pinning leaves `$ref` altogether: `money@1/schema.json`
is not a path, and with git-backed history only current versions exist on disk,
so a pinned historical ref never resolved to a file in the first place
(`docs/decision-record.md:154-175`).

## Consequences

- **A generator works, once.** Commit `bae08e4` (13:08) landed the first
  `schema.json` artifacts this repository ever held — 14 fixture schemas, 22
  refs, "each target verified to exist" (commit body) — and `4aa3f68` (13:14)
  re-keyed the schema registry by catalog-relative path with plain relative
  resolution, deleting the obsolete `resolveSchemaRef`. Its body records 206
  passing tests and all 14 schemas generating types with stock
  `json-schema-to-typescript`.
- **The reference encodes the referrer's depth, so moving anything rewrites
  everything.** At `bae08e4` the deepest chain was five `..`
  (`solutions/acme/shop/checkout/payment/datamodel/order/schema.json` →
  `../../../../../datamodel/money/schema.json`). Under nine minutes later
  [0008-fully-bucketed-srn-paths](srn://metaframework/adr/0008-fully-bucketed-srn-paths)
  (commit `522c6bb`, 13:17) deepened every path by making each level state its
  kind, and the same schema — now at
  `solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/schema.json` —
  read
  `"$ref": "../../../../../../../../datamodel/money/schema.json"` — eight `..`,
  verifiable with `git show 522c6bb:` on that path. A reference form whose
  spelling changes when an unrelated grammar changes is a maintenance surface,
  and it grew one within the hour.
- **The document loses the ability to say what it is.** Without `$id` a schema
  has no identity of its own, so the only base URI available is wherever the file
  happened to be retrieved from. A schema separated from its directory — pasted
  into a validator, vendored into a client repo, attached to a ticket — cannot
  state what it is or where its neighbours are. This is the cost that 0006 and
  0007 spent two more decisions undoing.
- **`x-srn` was demoted to MAY.** Provenance became optional at exactly the
  moment identity left the file. 0006 then retired it entirely and 0007 made it
  REQUIRED; the three-step round trip is the most visible scar the chain left on
  the artifact format.
- **The measurement was real and its scope was narrower than the requirement.**
  A relative path resolves for one class of consumer: a tool running inside a
  clone of this repository, with the whole catalog on disk, invoked from the
  right directory. It proved that `json-schema-to-typescript` *can* follow a
  relative path off a filesystem, not that any consumer can follow the reference
  (`docs/decision-record.md:194-202`). That gap is what superseded this decision
  two hours later.
- **What survives.** The requirement itself — compliant, generic, resolvable by
  any standard tool — was never in dispute again. Every later decision in the
  chain replaces this one's *mechanism* and keeps its *obligation*, which is now
  [stock-tooling-schema-consumption](srn://metaframework/requirement/stock-tooling-schema-consumption).

## Alternatives considered

- **Keep an `srn://` `$id` and use relative `$ref`s.** Rejected in the record
  with a mechanical reason, not a preference: a relative `$ref` is resolved
  against the base URI, and the base URI is `$id` when one is present, so the
  SRN `$id` would re-break exactly what the relative path was chosen to fix
  (`docs/decision-record.md:158-163`).
- **Keep version pins inside `$ref`** as `money@1/schema.json`. Rejected twice
  over: it is not a path, so no filesystem resolver reaches it, and git-backed
  history keeps only current versions on disk, so it never named a file that
  existed. Pinning stays in frontmatter `relations`, which no external tool
  consumes (`docs/decision-record.md:167-170`).
- **An editor extension or an LSP** to make any ref syntax navigable. This is the
  only remedy the first measurement leaves for editor navigation, and it is
  explicitly not in v1. The gap is recorded rather than closed.
- **Absolute HTTP URLs.** *Not considered at this decision either.* The record's
  argument runs entirely between two forms — a private scheme and a filesystem
  path — and never reaches the third, which is the standard answer and became
  [0006](srn://metaframework/adr/0006-dereferenceable-schema-urls) two hours
  later. Both of the first two decisions were framed as "which local spelling",
  and the question was always "resolvable by whom".
