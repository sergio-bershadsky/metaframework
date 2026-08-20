---
name: 0004-srn-as-the-json-schema-reference-syntax
kind: adr
version: 1
title: The SRN is the JSON Schema reference syntax
summary: A datamodel's schema.json was to identify itself with a versioned srn:// $id and reference other models by SRN, so the framework had exactly one addressing scheme. Superseded.
status: review
owner: sergio-bershadsky
decision-status: superseded
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/srn
tags:
  - json-schema
  - identity
  - founding
---

# The SRN is the JSON Schema reference syntax

## Context

The founding session settled the SRN as the framework's identity and reference
syntax before any artifact format was designed, and stated the ambition without
qualification: "SRN is the one reference syntax everywhere: frontmatter, JSON
Schema `$ref`, workflow YAML, and prose"
(`docs/decision-record.md:50`). "There is no second addressing scheme" is the
sentence the whole design hangs from, and it is worth what it costs only if it
holds on every surface.

Four of those surfaces are the framework's own inventions: frontmatter
`relations`, workflow YAML, protocol payload references, and prose links. No
external standard governs any of them, so the SRN can simply be the syntax.
**JSON Schema is the one surface where it cannot be** — `$id` and `$ref` are
defined by a specification this framework did not write, and consumed by tools
this framework does not ship. The founding record does not weigh that asymmetry;
it lists JSON Schema in the same breath as the other three
(`docs/decision-record.md:50-51`) and moves on.

Two beliefs carried the decision, and the record contains no measurement of
either: that a reference syntax could buy go-to-definition in an editor, and that
these schemas would in practice be read by the portal. Amendment `2026-08-19-b`
opens by saying it measured "two things … rather than assumed", which is the
first evidence of any kind in the chain.

## Decision

A datamodel's `schema.json` carries `$id` equal to the entity's **versioned**
SRN, and every cross-entity `$ref` is an SRN — absolute
(`srn://acme/datamodel/money@1`) or an RFC 3986 relative reference resolved
against that `$id`. Inheritance is stock `allOf` plus `$ref` with no proprietary
layer, and the pin in a `$ref` is what makes validation reproducible
(`docs/decision-record.md:58-60`). Written normatively into
`framework/spec/srn.md` at commit `6561383` (2026-08-19 12:11), which states
`$id` MUST be the entity's versioned SRN and gives JSON Schema `$ref` its own row
in the relative-reference table — one of two base-URI contexts, the other being
every document the framework itself defines.

## Consequences

- **One vocabulary across the catalog.** A reviewer reading a diff sees the same
  string shape in `relations`, in a workflow's payload reference and in a
  schema's `$ref`, and the `srn://` prefix makes every reference greppable in one
  pass. That property was real, and 0007 later paid to get half of it back.
- **Version pinning lives in the reference itself.** `money@1` in a `$ref` says
  "this model was reviewed against version 1" in the place the dependency is
  declared. Every successor decision moved that pin out of `$ref` and into
  frontmatter `relations`, where the git-backed version→commit index can resolve
  it — a schema URL addresses the current schema and rejects an `@N` outright.
- **Nothing outside the portal can resolve it.** `srn://` is a private URI
  scheme. A validator, a generator, a browser playground or a CI job holding one
  file has no rule to apply and no host to ask. That is not a gap to be closed by
  documentation; it is the definition of a private scheme, and it is the cost
  this decision accepted without stating.
- **It required a resolver the framework would have had to ship forever.** Every
  consumer of a catalog schema — not only the portal — would need code that
  knows what an SRN is. That obligation is exactly what
  [stock-tooling-schema-consumption](srn://metaframework/requirement/stock-tooling-schema-consumption)
  was later written to forbid.
- **This decision never reached an artifact.** No `schema.json` was ever
  committed under it: `git log --all -S'"$ref": "srn://' -- '*schema.json'`
  returns nothing, and the first `schema.json` files in this repository were
  added at commit `bae08e4` (13:08) already converted to the successor's form.
  The decision stood for one hour and thirty-nine minutes, in the founding record
  and in the working tree.
- **What it did leave behind was spec text.** `framework/spec/srn.md`, written
  under this rule at `6561383`, had its reference sections rewritten at `bae08e4`
  and twice more after that; `4aa3f68`'s commit body records the rest of the
  cleanup — "protocol.md and index.md corrected where they claimed SRN refs in
  JSON Schema", with `kinds/datamodel.md` rewritten outright. A decision that
  produced no artifact still produced four spec documents that had to be
  corrected.
- **The record of it is this file, and it is version 1.** The decision was born,
  taken and superseded before this catalog existed; its `decision-status` never
  moved, so the bump `framework/spec/kinds/adr.md` requires for a moving
  `decision-status` has nothing to describe. A `version: 2` here would name a
  commit that does not exist
  ([0010-additive-only-evolution](srn://metaframework/adr/0010-additive-only-evolution)).

## Alternatives considered

- **Relative file paths with no `$id`.** This is what superseded the decision at
  13:08 the same day, on a measurement rather than an argument: stock
  `json-schema-to-typescript` given `"$ref": "/datamodel/money@1"` returned
  `FAILED: Error opening file "/datamodel/money@1"`, and given
  `"$ref": "../money/schema.json"` produced `interface Order { total?: Money }`
  plus `interface Money` (`docs/decision-record.md:142-148`). See
  [0005-relative-path-schema-refs-without-id](srn://metaframework/adr/0005-relative-path-schema-refs-without-id).
- **Absolute HTTP URLs.** *Not considered.* This is the honest and uncomfortable
  entry: the form that finally held —
  [0006-dereferenceable-schema-urls](srn://metaframework/adr/0006-dereferenceable-schema-urls),
  refined by
  [0007-canonical-schema-host-and-x-srn-restored](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)
  — was available on day one, is the ordinary JSON Schema answer, and appears
  nowhere in the founding record. It arrived only after the second form had
  failed for a second reason. Two decisions were spent reaching a default.
- **A custom resolver shipped with the framework.** Never written down as an
  option, but it is what this decision implies: `srn://` resolves for whoever
  holds the resolver, and for nobody else. It was rejected in effect by the
  requirement that a catalog schema be readable by tooling that has never heard
  of this framework.
- **Keeping the SRN as an annotation rather than as `$id` and `$ref`.** Not
  proposed here; it is what 0005 fell back to as `x-srn`, what 0006 retired, and
  what 0007 reinstated as REQUIRED. The eventual answer keeps the SRN in the file
  without asking a standard keyword to carry a private scheme, which is the
  distinction this decision missed.
