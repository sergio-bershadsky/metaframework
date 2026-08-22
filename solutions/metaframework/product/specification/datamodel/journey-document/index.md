---
name: journey-document
kind: datamodel
version: 4
title: Journey document
summary: journey.yaml — one actor's path across the solution as 2 to 12 flat steps, no branches, and the product-crossing check the journey kind exists for.
status: review
owner: sergio
usage: both
abstract: false
tags:
  - spec
  - format
  - journey
---

`journey.yaml` beside a journey's `index.md`: **one actor's path across the
solution**, in order, from first contact to outcome. Specified in
`framework/spec/kinds/journey.md` under "The journey.yaml mini-spec"; parsed by
`framework/portal/src/lib/journey/journey.ts`. Every solution here carries
several, this one the most; `find solutions -name journey.yaml` is the census.

This is the sixth format, and the product page
[specification](srn://metaframework/product/specification) already stated the
case for it: `journey.yaml` is normatively specified, hand-authored, and cleared
the eight-instance bar the other five were admitted on —
`find solutions -name journey.yaml | wc -l` returned 8 on 2026-08-20, and
`read-a-branch` (commit 807e1de) made it 9. What closed the
question is
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects): the
dialect a `journey.yaml` declares is a URL, and a URL needs an entity behind it.

## Why `usage: both`

The same answer
[workflow-document](srn://metaframework/product/specification/datamodel/workflow-document)
gives, and for the same two halves. The file on disk is the record — a journey's
frontmatter says nothing about the path, so there is no second statement of it —
and it is simultaneously the contract between an author and three derived forms
that must agree, all three built from one `parseJourney` call in
`components/entity/entity-artifacts.tsx`: the mermaid `flowchart TD` from
`lib/journey/mermaid.ts`, the `JourneyLegend` ladder beneath it, and
`journeySummary()`, which narrates the same parsed model in sentences because
the drawing is `aria-hidden` and the prose is what a screen reader actually
hears.

Three forms derived from one parse and obliged to agree is an exchange whatever
the file is stored in — the same standard `sequence-diagram.tsx` states for
workflows, that "a picture the catalog cannot state in prose is a picture the
catalog cannot review".

## What the format decides

Five rules, and each is a modelling judgement rather than a schema detail:

- **The artifact is REQUIRED** (`E_JRN_ARTIFACT_MISSING`) — the one place the
  kind diverges from `protocol.md`, where every artifact is optional. A protocol
  with only `index.md` still asserts its participants and its style in
  frontmatter; a journey without its artifact asserts nothing at all and is
  indistinguishable from a paragraph of prose.
- **No branching, and the violation has its own code.** A step key shaped like a
  branch — `alt`, `opt`, `loop`, `when`, `otherwise`, `branches`, `parallel` —
  is `E_JRN_BRANCH` rather than the generic `E_JRN_SCHEMA`, because the code is
  the lesson: a journey that branches is two journeys. The reason is not
  tidiness. The branches have different outcomes, and the outcome is what makes
  a journey worth naming; folding them into one entity gives the pair a single
  name that is true of neither.
- **Two to twelve steps, both bounds errors.** Diagram tractability is an
  explicit acceptance criterion of the kind, and a cap that only warns is a cap
  every catalog eventually ignores. The cap does a second job — it keeps
  journeys comparable, which a twelve-step path beside a forty-step path is not.
- **`actor` is written on every step**, though the entity already names one
  protagonist. A hand-off must be impossible to overlook, and a field that
  defaults is a field that hides its exceptions.
- **`protocol` has three states, not two.** An SRN is "documented here";
  `none` is the documented negative — the actor carries the crossing and there
  is nothing to write down — and omission is "not written down yet", which on a
  product crossing is `W_JRN_UNDOCUMENTED_INTEGRATION`. A reviewer can grep for
  `protocol: none` and audit every hop the solution asserts nobody automated.

Steps have **no ids**: the stable key is the positional path, `steps[3]`, which
is also literally the path through the YAML, so source-line anchors are a parse
rather than a translation. There is no `title` and no `summary` — `index.md`
carries both and a second copy would drift — and no top-level `version:`, which
would be a shape violation for the same reason it is one in every other
artifact. The `x-` escape hatch reaches the top level and each step.

## What the 9 instances actually exercise

Measured 2026-08-21 across all three solutions:

| Solution        | files | steps | `protocol` named | `none` | omitted | crossings | undocumented |
| --------------- | ----- | ----- | ---------------- | ------ | ------- | --------- | ------------ |
| `acme`          | 2     | 14    | 9                | 3      | 2       | 6         | 0            |
| `brass`         | 3     | 24    | 16               | 2      | 6       | 8         | 0            |
| `metaframework` | 4     | 24    | 0                | 8      | 16      | 8         | 0            |

Three readings, and the last one is uncomfortable:

- **The cap binds nothing.** The shortest journey has 6 steps and the longest
  has 9 — four clear of the floor, three clear of the ceiling. The rule the kind
  defends hardest has never fired on anything in this repository.
- **The optional field is universal.** All 62 steps carry a `note`, which the
  field table marks as optional and display-only. Whatever the format thinks the
  substance is, authors write the sentence.
- **This solution names no protocol at all.** Its four journeys carry zero
  protocol references: every one of its 8 product crossings is covered by
  `protocol: none`, and the other 16 steps omit the field. That is a defensible
  claim — a human author moving between the spec, the portal and the plugin is
  genuinely carrying the hop — but it means the field's positive case is
  exercised only by the two exemplar solutions.

All 22 crossings in the repository are documented, so
`W_JRN_UNDOCUMENTED_INTEGRATION` — the check the kind exists for — reports
nothing anywhere. That is by construction rather than by luck:
`diagnostic-coverage.test.ts` states in writing that the shipped catalog must
stay clean, because "/diagnostics is the one page whose value depends on being
empty".

## The one format here that code actually checks

`framework/portal/src/lib/catalog/artifact-checks.ts` calls `parseJourney`
during `loadCatalog` with all three of its options — the entity name, the
entity's SRN, and the frontmatter protagonist — so JRN5–JRN8, JRN13, JRN14 and
JRN16's artifact-suffix clause run over `solutions/` and reach `/diagnostics`
and `metaframework check`.

All twelve of the kind's codes have a live emitter, and
`diagnostic-coverage.test.ts`'s debt register carries no journey line at all —
two of the twelve only half, which is why the gap is recorded in two `it.todo`s
rather than in the register: JRN11 and JRN12 fire on the artifact-suffix clause,
which the SRN grammar decides, and not on "the target resolves to the wrong
kind", which needs the catalog. A register keyed by code cannot express half a
rule.

The other three arrived with `lib/journey/artifacts.ts`, and the register's own
comment records why they had been listed as gaps: `E_JRN_ARTIFACT_MISSING`,
`W_JRN_ARTIFACT_UNKNOWN` and `W_JRN_PROTOCOL_UNRELATED` each name a missing
*input* rather than a missing branch — an absent document, a file beside it, a
protocol's participant list — and `parseJourney` is handed a parsed document and
nothing else. Given the entity directory listing and the resolved catalog, all
three are decidable. The register is a gate, not an exemption: the inventory
suite goes red the moment a listed code gains an emitter, which is what forced
those entries out of it.

That coverage is what separates this format from its two siblings landing beside
it,
[topology-document](srn://metaframework/product/specification/datamodel/topology-document)
and
[config-document](srn://metaframework/product/specification/datamodel/config-document),
where the count of enforced rules is zero.

## The sibling schema, and the three rules it cannot hold

`schema.json` here states the mini-spec in stock 2020-12: the two top-level
fields, the four step keys, the 2–12 bound as `minItems`/`maxItems`, the
three-state `protocol` field as an `anyOf` over the literal `none`, and `x-`
tolerance at both levels. It also admits the dialect discriminator: `$schema`,
typed as a non-empty string and deliberately not pinned to the `$id` with
`const`. A file naming some other dialect is `W_ARTIFACT_DIALECT`, a warning read
as the legacy dialect and never broken, and a `const` would state that one fact
at a second, harder severity that JSON Schema gives no way to turn down. The
encoding is shared by all six framework meta-schemas, and
[state-machine-document](srn://metaframework/product/specification/datamodel/state-machine-document)
records why it is the only one they could share.

What it cannot say:

- **`name` equals the entity's directory name** (`E_JRN_NAME`). Only the loader
  knows which directory the file was read from — the same limit
  [schema-document](srn://metaframework/product/specification/datamodel/schema-document)
  records for `$id` and `x-srn`.
- **`E_JRN_BRANCH` rather than `E_JRN_SCHEMA`.** `additionalProperties: false`
  rejects `alt` already; what it cannot do is reject it *differently*. The
  schema names the seven branch keys in an explicit `not` so the lesson is
  written down, but a stock validator reports one class where the spec defines
  two, and the pedagogy is the whole point of the split.
- **Everything that needs the catalog**: JRN10–JRN12 (a reference resolves, and
  to the right kind), JRN15 (`W_JRN_PROTOCOL_UNRELATED`), and JRN14 itself —
  the owning-product comparison is decidable from the SRN grammar, but it is a
  comparison *between two steps*, and a schema sees one document without being
  able to relate its members to each other.

Re-checked 2026-08-21 with `ajv` 2020, after the header sweep: all 9
`journey.yaml` files validate **as they now stand on disk**, header included,
and all 9 still validate with the header stripped — which is the document
`parseJourney` is actually handed. Nine hand-written cases behave. Rejected: a
top-level `version:`, an `alt` on a step, a one-step journey, a thirteen-step
journey, a two-line `note`, and a `$schema` that is not a non-empty string.
Accepted: `x-` keys at both levels, `protocol: none`, and — recorded rather than
glossed — a `$schema` naming a different dialect, which the encoding above leaves
to `W_ARTIFACT_DIALECT` on purpose. That run was a throwaway; nothing in the
repository validates a
`journey.yaml` against this schema. `parseJourney` is the enforcement, and this
document is the same contract restated for a reader outside the portal.

## The header, now that the sweep has landed

**Every instance carries the discriminator.** Measured 2026-08-21: all 9
`journey.yaml` files open with
`$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/journey-document`
as their first key. The count
[0015-artifact-dialects](srn://metaframework/adr/0015-artifact-dialects) took —
none of the 9 — is the before; this is the after, and it cost what the ADR said
it would: 9 files, 9 entity version bumps, one sweep. `W_ARTIFACT_DIALECT` is
implemented and reports nothing on this role, which is the only shape of silence
that means the header is there rather than unchecked.

**The key is stripped before any parser sees it.** `adoptDialect`
(`framework/portal/src/lib/catalog/dialects.ts:192`) records the dialect on the
artifact and then deletes the key from the parsed document, at the single point
in `loadCatalog` where every artifact has been read and nothing downstream has
been handed one (`catalog/load.ts:249`). So the model `parseJourney` builds is
what it built before the sweep, and every derived form above it — the flowchart,
the ladder, `journeySummary()` — is unchanged by a key none of them can see.
`Artifact.raw` is untouched: `/artifacts` and the source pane serve the file as
authored, discriminator included.

**`journey.ts` admits it by name anyway.** `KNOWN_FILE_KEYS`
(`framework/portal/src/lib/journey/journey.ts:150`) lists `$schema` beside `name`
and `steps`, at the top level and nowhere else — a step is not an artifact root
and gains nothing. Nothing in the catalog depends on that admission, since the
loader has already removed the key; it is there for a caller holding raw file
bytes and no loader — a fixture, an editor, a reader outside the portal — who
would otherwise get `E_JRN_SCHEMA` on the header this document tells them to
write. Admitted **by name**, not by widening `x-`: the hatch stays the author's,
and an unknown top-level key is still an error.

**The schema's side is: admitted, optional, unpinned.** Optional and never
`required`, because a file without the header is the legacy dialect —
`W_ARTIFACT_DIALECT`, a warning, never a rejection — and a `required` here would
restate that warning as an error in the one place a severity cannot be relaxed.
The ajv run above is what makes "optional" a measurement rather than an
intention: all 9 pass headed, all 9 pass stripped.

## Absent

**Exactly one path per entity.** There is no `journeys/` subdirectory and no
second file; two paths are two entities, which is the no-branching rule stated
from the other side. Extending the format with a fragment form later would be an
additive spec change, and it would have to argue against both of that section's
reasons.

**Every inverse the kind promises is unbuilt.** `journey.md` derives five views
from this artifact on *other* pages — "appears in journeys" on component and
product pages, "journeys" on the actor page, the two-hop capability join, the
protocol cross-reference, and the solution dashboard's integration-gap panel —
and no component, product, actor or capability view in `framework/portal/src`
reads `journey.yaml` at all. Only the journey entity page does. Each of those
five would read `touches` and `actor` out of this file, which is exactly why
none of them is authored as a back-edge: the inbound direction is derivable and
merely undone.

**No journey→capability edge, and nothing points at a journey.** `measures` does
not list `journey` among its targets, no metric can attach to a path, and the
only inbound edge any journey accepts is `supersedes` from another journey.
