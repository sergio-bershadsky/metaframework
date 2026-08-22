---
name: every-rule-has-an-example
kind: requirement
version: 2
title: Every normative rule carries a worked example
summary: The spec's own bar — a rule without an example is a spec defect — measured against the 14 documents it governs, and currently not met.
status: review
owner: sergio
requirement-type: non-functional
priority: must
relations:
  uses:
    - /product/specification/component/core-contracts
    - /product/specification/component/kind-contracts
tags:
  - spec
  - readability
  - documentation
---

`framework/spec/index.md:32`, under §"Normative language", states the bar the
specification holds itself to:

> Every normative rule in this spec is accompanied by at least one concrete
> example. A rule without an example is an incomplete rule and a spec defect.

It is a large part of why the spec runs as long as it does for a format this
small: hundreds of fenced blocks, repeatedly pairing a legal form with the
violation written beside it. It is also what makes the spec distillable — the
reference bundle a model reads instead of the repository keeps the examples and
drops the prose, because an example is the part that survives compression.

This requirement is filed against
[specification](srn://metaframework/product/specification) rather than against
the solution, because it constrains one product's documents and nothing else in
the repository. It is `non-functional` under the closed two-value enum:
it constrains how the artifact behaves when read, independent of any single
interaction. It carries no `uses` edge to an environment, which the spec says a
non-functional requirement usually should — there is no environment in which a
document is measured.

## Acceptance criteria

- **AC-1** Every section of `framework/spec/` that states a rule with an RFC 2119 keyword contains at least one fenced example.
  - **Not met.** Measured 2026-08-20 across all 14 documents, over the keyword
    set `index.md:29` names plus REQUIRED — which the spec uses freely in its
    field tables and forgot to list: 194 sections at heading level 2–4, of which
    **68 carry a keyword outside a code fence and 11 of those carry no fenced
    block at all**. The eleven:
    `evolution.md:139` (§Protocols and other entities), `evolution.md:307`
    (§Evolution error classes), `frontmatter.md:241` (§Delegation to kind
    documents), `index.md:26` (§Normative language), `srn.md:412` (§Version
    suffix semantics), `kinds/adr.md:225` (§Sibling artifacts),
    `kinds/adr.md:279` (§Evolution), `kinds/datamodel.md:1164` (§DataModel error
    classes), `kinds/product.md:78` (§Frontmatter additions),
    `kinds/protocol.md:745` (§Supported subset), `kinds/requirement.md:302`
    (§Sibling artifacts).
  - Two of the eleven are error-code reference tables, where the normative
    language sits inside a code's description rather than in a rule of its own.
    One is §"Normative language" itself: the sentence stating this bar has no
    example of its own, which is the tidiest instance of the defect in the set.
    The remaining eight are ordinary rules stated in prose or in a field table
    with nothing showing them.
- **AC-2** Every error code the spec defines is shown at least once inside an example, so a reader can see what triggers it and not only what it is called.
  - **Not met.** Measured 2026-08-20: the spec names **95 distinct `E_*`/`W_*`
    codes**; **53** appear inside a fenced block somewhere; **42 never do**.
    They are concentrated in the warning half — `W_REQ_UNIMPLEMENTED`,
    `W_ADR_SUPERSESSION`, `W_PROTO_STATES_UNREACHABLE`, `W_DM_USAGE_MISMATCH`,
    `W_COMP_DEP_CYCLE` and thirteen more — and in the datamodel identity family
    (`E_DM_ID_MISSING`, `E_DM_ID_INVALID`, `E_DM_ID_FORBIDDEN`,
    `E_DM_SRN_MISSING`, `E_DM_SRN_RETIRED`).
- **AC-3** The measurement is reproducible from the files alone: a reader with `grep` and the RFC 2119 keyword list can repeat both counts without a tool this repository owns.
  - Met, and it is the only criterion here that is. Both numbers above come from
    reading the markdown, splitting on fenced blocks, and matching two regular
    expressions. Nothing in `framework/portal/src` participates.
- **AC-4** A document that prescribes validation rules states them in normative language, so the bar is measurable against it.
  - **Not met, and the exception is exact.** `kinds/actor.md`
    contains **zero** occurrences of MUST, MUST NOT, SHOULD, SHOULD NOT, MAY or
    REQUIRED, while its §"Validation rules" prescribes six checks, ACT1–ACT6,
    each with an error code. By `index.md:29`'s own definition — "A statement
    without a keyword is descriptive, not normative" — that document contains no
    normative rules, so AC-1 passes it for free. A bar that a document can clear
    by declining to mark its rules is not yet a bar.
- **AC-5** The bar is stated in the specification itself, not only in this entity, so a spec author meets it without having read the catalog.
  - Met. `framework/spec/index.md:32`, in §"Normative language" — the first
    section of the entry-point document, alongside the RFC 2119 keyword
    definitions it depends on.

## What enforces this

Nothing. There is no CLI
([0011-no-cli-in-v1](srn://metaframework/adr/0011-no-cli-in-v1)), no CI, and the
loader reads `solutions/` and `.git/` only — every spec document carries
`kind: spec`, which is not one of the nine ontology kinds, so no diagnostic can
ever fire on the files this requirement governs.

The gap is therefore total: the bar is stated in the document it governs, checked
by the person writing that document, and the measurements above are the first
time it has been counted.

## Rationale

The criteria are counts rather than a percentage on purpose. A single "N% of
rules have examples" is a number nobody can act on; eleven named sections and
forty-two named codes are a work list.

The requirement is `priority: must` rather than `should` because the spec's own
wording leaves no room — "a spec defect" is not a preference — and because the
bar is doing real work everywhere it *is* met. The four canonical ADR headings,
the pinned-heading-plus-list shape of a requirement's criteria, the
`spec`-versus-surface-list exclusivity in `transport.yaml`, and the
`wont`-without-an-apostrophe spelling are all rules a reader would get wrong
from the prose alone and gets right from the counter-example beside it.

Recording it as unmet rather than trimming the criteria to what passes is the
same move
[review-first-change](srn://metaframework/requirement/review-first-change) and
[human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable)
make: this catalog's value is that its obligations are stated at the size they
actually are.

## Out of scope

- **Example correctness.** Whether a fenced block does what the surrounding
  prose claims is not checked here and is not checkable by counting. One known
  instance is recorded elsewhere: the spec's own `grep -rl "status: deprecated"
  solutions/` example returns false positives once the string appears in prose,
  which
  [human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable)
  corrects with an anchored form.
- **Prose in solution catalogs.** Entities under `solutions/` state no
  normative rules; they describe. The house standard that every claim is
  anchored to a file, a line or a command is a different obligation and is not
  written down as a requirement anywhere.
- **`docs/decision-record.md`.** It outranks the spec on conflict and is not
  part of this product; its amendments carry evidence rather than examples, and
  no bar is claimed over them.
