# JSON Schema conventions for datamodels

> Distilled from `framework/spec/kinds/datamodel.md` and `framework/spec/srn.md`.
> **When `framework/spec/` is present in the repository, it is authoritative and
> wins over this file.** This bundled copy exists because an installed plugin
> cannot see the repo spec.
>
> **Retired convention:** an earlier revision had `schema.json` carry no `$id`
> and use relative file-path `$ref`s (`../../../../datamodel/money/schema.json`).
> It was superseded because such a URL cannot be *dereferenced*: it resolves only
> for a tool running inside a clone of the repo with the whole catalog on disk,
> so a schema pasted into a validator or fetched by CI resolved nothing. Never
> author that form, and never copy prose that explains it — if you find prose in
> a catalog saying a `schema.json` "carries no `$id`" or reaches a neighbour by
> relative file path, that prose is stale, not a second convention.

## The consolidating principle

> **The SRN is the identity. The schema URL is its dereferenceable projection.
> The disk path is its storage. All three are mechanically inter-convertible,
> and none of them is a second addressing scheme.**

Everything below follows from that sentence. Converting between the three views
is surgery on a prefix — never a lookup, never a table:

```text
srn://acme/datamodel/money                              # identity   — what the catalog says
solutions/acme/datamodel/money/                         # storage    — strip "srn://", prefix "solutions/"
https://schemas.metaframework.dev/acme/datamodel/money  # projection — strip "srn://", prefix the canonical host
```

The one asymmetry: **the projection drops the `@version` pin.** A schema URL
addresses the *current* schema of an entity; a `@N` inside one is rejected rather
than ignored. Pins live where git-backed history can resolve them — frontmatter
`relations` and prose.

## Dialect, filename, identity

Exactly one dialect: **JSON Schema draft 2020-12**. One filename, bare:
`schema.json` — never `order.schema.json`, never `order.json`. The portal's
schema route looks for that exact name, so a renamed file 404s at every address
that points at it.

Other artifacts in the framework — `transport.yaml`, `states.json`,
`workflows/*.yaml`, `journey.yaml`, `topology.yaml`, `config.yaml` — carry a
`$schema` naming a *framework* meta-schema (`protocols.md`, `journeys.md`,
`environments.md`). **Do not do that here, and never in `examples/`**; the two
conventions meet on this one key and the difference matters, so it has a
subsection of its own below.

Two identity keywords, both required at the root:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/datamodel/money",
  "x-srn": "srn://acme/datamodel/money",
  "title": "Money",
  "type": "object",
  "properties": {
    "amount": { "type": "string", "pattern": "^-?[0-9]+\\.[0-9]{2}$" },
    "currency": { "type": "string", "enum": ["EUR", "GBP", "USD"] }
  },
  "required": ["amount", "currency"]
}
```

### `$id` — the canonical schema URL

`$id` is the entity's canonical schema URL and is **required at the root**. The
path after the host is the entity's SRN path verbatim; there is no version
suffix, because the URL addresses the current schema.

```text
solutions/acme/datamodel/money/schema.json
→ srn://acme/datamodel/money
→ https://schemas.metaframework.dev/acme/datamodel/money
```

**The host is a stable canonical constant, not an environment variable.**
`https://schemas.metaframework.dev` is defined once, in the portal's schema URL
helper, and is the same string on a developer's laptop and in production.
Identity must not vary by deployment: registries and caches key on `$id`, and two
deployments that disagree about a schema's identity is a real defect, not a
configuration choice. A schema copied out of the catalog keeps meaning what it
meant.

**`SCHEMA_BASE_URL` is not this.** It still exists and still controls *where the
portal serves schemas* — the `/schemas` route, `http://localhost:6363/schemas/…`
on a portal served by `metaframework`. That is a retrieval address, not an
identity. It MUST NOT appear in
`$id` or in any `$ref`. (In JSON Schema terms this is ordinary: `$id` is an
identifier; retrieval is a resolver's problem. A local validator that wants to
fetch rather than trust its cache maps the canonical host onto the portal's
`/schemas` route in its resolver config — one line, outside the artifacts.)

**Two kinds of URL live on that host, and only one of them could ever answer.**
The framework's own meta-schemas — the `…/specification/datamodel/…-document`
values a dialect header names — are part of the published framework, so serving
them at their own `$id` is a step this project can take and has undertaken to
take. A catalog's own schemas are not: no `$id` under
`https://schemas.metaframework.dev/acme/…` resolves there now or later, because
`acme` is not the framework's content to serve. That one is served by the
catalog's own portal, at `SCHEMA_BASE_URL` + `/schemas/…` — the resolver line
above. So identity is global for everything, while *retrieval* can only ever be
global for the framework's own documents and stays local for a catalog's. Author
neither expecting a fetch: the framework compares these URLs as identities and
never dereferences one.

The artifact SRN `srn://acme/datamodel/money.schema` (`srn.md`) is legal for
uniformity and **normalizes to the entity**: its URL projection IS this
canonical URL. No `…/money.schema` URL ever exists, and mapping a URL back to
an SRN stays dot-rejecting — one schema document, one URL. A second registry
name for the same schema is the exact defect the canonical URL removed.

### `x-srn` — the SRN, stated

`x-srn` is **required** and carries the entity's **unversioned** SRN. It is
validated at load against the file's actual path, so it cannot drift.

It exists because without it the SRN vanishes from schema files entirely and
identity becomes implicit in a URL-parsing rule. A schema lifted out of the
catalog — pasted into a validator, vendored into a client repo, attached to a
ticket — must still say where it came from, in the framework's own vocabulary,
not only as a host-plus-path a reader has to know how to decode.

```json
{ "x-srn": "srn://acme/datamodel/money" }    /* correct                                  */
{ "x-srn": "srn://acme/datamodel/money@3" }  /* E_DM_SRN_MISMATCH — unversioned, always  */
{ "x-srn": "acme/datamodel/money" }          /* E_DM_SRN_MISMATCH — the scheme is part of it */
```

### Requirements

| Requirement                                                                  | Violation             |
|------------------------------------------------------------------------------|-----------------------|
| `$schema` present and exactly `https://json-schema.org/draft/2020-12/schema` | `E_DM_DIALECT`        |
| Valid against the 2020-12 meta-schema                                        | `E_DM_SCHEMA_INVALID` |
| Root `$id` present                                                           | `E_DM_ID_MISSING`     |
| Root `$id` equals this entity's canonical schema URL                         | `E_DM_ID_MISMATCH`    |
| No `$id` at any level **below** the root                                     | `E_DM_ID_FORBIDDEN`   |
| `x-srn` present                                                              | `E_DM_SRN_MISSING`    |
| `x-srn` equals the unversioned SRN of the directory the file sits in         | `E_DM_SRN_MISMATCH`   |

A nested `$id` re-bases every reference beneath it onto a second identity, which
is how one document quietly becomes two. Local shapes use `#/$defs` pointers,
which need no identity.

`x-srn` and `$id` cannot disagree without a diagnostic: both are checked against
the same directory path, so they are two spellings of one derived fact rather
than two hand-maintained fields.

### The artifact-dialect contract, already satisfied here

Every artifact in the framework declares, in its own bytes, which grammar it is
written in; the contract, and the key each role carries, are in `structure.md`.
This kind is the one that was already doing it, and its two artifacts land on
opposite sides of that contract — so both belong here, rather than leaving you to
wonder whether the framework's rule collides with the single dialect this section
opens with.

**On `schema.json` the discriminator is the key above.** `$schema` on a JSON
Schema document names the meta-schema of the *JSON Schema dialect* — exactly the
job the framework-wide contract asks a discriminator to do, arrived at
independently and long before this framework existed. So nothing weakens: the
value stays exactly `https://json-schema.org/draft/2020-12/schema`,
`E_DM_DIALECT` otherwise, and pointing the key at a framework meta-schema would
break every stock validator in exchange for nothing. Two consequences follow.
The key is **native**, so it is never stripped from the parsed document the way a
framework-owned `$schema` is — the registry validates *against* it, and removing
it would break the validation it enables. And absence is **not also warned**:
`E_DM_DIALECT` has been the error for that same fact since v1, so this kind
already sits at the terminal state the other roles are only nudged toward, and
`W_ARTIFACT_DIALECT` is never raised on a `schema.json`.

```json
{ "$schema": "https://json-schema.org/draft/2020-12/schema" }
                    /* the only legal value                                    */
{ "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/schema-document" }
                    /* E_DM_DIALECT — the framework's description of this file
                       is not the dialect this file is written in              */
{ }                 /* E_DM_DIALECT — and never W_ARTIFACT_DIALECT             */
```

The framework's own `schema-document` meta-schema keeps doing what it always did:
it describes what a catalog `schema.json` must *additionally* satisfy, and no
instance ever names it.

**`examples/*.json` carry no discriminator at all**, by rule and not by omission.
An example is an *instance* of its sibling schema: its dialect is that schema's
and it has none of its own, so there is nothing for a header to name. A `$schema`
added there is an ordinary unknown property — and `E_DM_EXAMPLE_INVALID` the
moment that schema closes itself, turning a documentation aid into a build
failure. `W_ARTIFACT_DIALECT` is never raised on a file under `examples/`,
whatever it does or does not contain.

```json
/* examples/minimal.json — correct: an instance, and nothing but */
{ "amount": "49.90", "currency": "EUR" }

/* wrong: a header the schema must then admit, on the very document that exists
   to demonstrate that schema */
{ "$schema": "https://schemas.metaframework.dev/acme/datamodel/money",
  "amount": "49.90", "currency": "EUR" }
```

## `$ref` is a canonical schema URL

Every reference to **another** entity is that entity's canonical schema URL — the
same form as `$id`. There is no relative form, no `srn://`, no file path, no
depth arithmetic, and therefore no `..` chains to recount when anything moves.

```json
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" }
```

Rejected forms and why:

```json
{ "$ref": "../money/schema.json" }                                       /* E_DM_REF_TARGET — retired relative form   */
{ "$ref": "srn://acme/datamodel/money@1" }                               /* E_DM_REF_TARGET — no tool dereferences srn:// */
{ "$ref": "/acme/datamodel/money" }                                      /* E_DM_REF_TARGET — origin-relative, not portable */
{ "$ref": "http://localhost:6363/schemas/acme/datamodel/money" }         /* E_DM_REF_TARGET — a serving address, not identity */
{ "$ref": "https://elsewhere.example/acme/datamodel/money" }             /* E_DM_REF_TARGET — foreign host             */
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel" }           /* E_DM_REF_TARGET — a bucket is not addressable */
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money@1" }   /* E_DM_REF_TARGET — a URL carries no version pin */
{ "$ref": "https://schemas.metaframework.dev/globex/datamodel/money" }   /* E_SRN_CROSS_SOLUTION — sealed universes    */
```

**A `$ref` names an entity, never a version.** A pin is rejected rather than
ignored. Where a pin genuinely matters — "this model is reviewed against
`money@1`" — it lives in frontmatter `relations.uses` as `/datamodel/money@1`,
which is the only place it can live and the only edge worth authoring by hand.
Do **not** mirror ordinary `$ref` edges under `relations`; the portal derives
them from the schema.

Mapping back to an SRN is a rename: strip the canonical host, prefix `srn://`.
Readers see SRNs because that is the catalog's vocabulary; authors write URLs
because tools dereference them. They are the same string.

## Local pointers and `$defs` privacy

Fragments resolve inside the document and are unchanged by all of the above:

```json
{ "$ref": "#/$defs/positive-int" }   /* a shape defined in this document */
{ "$ref": "#" }                      /* this document's root — self-recursion */
```

**A `$ref` MUST NOT point into another entity's `$defs`** (`E_DM_FOREIGN_DEFS`).
`$defs` is local scratch space; the moment a shape is needed elsewhere it is
**promoted to its own datamodel entity**. This keeps the reference graph a graph
of entities, not of anonymous fragments.

Promote as soon as any of these is true:

| Trigger                                              | Example                                        |
|------------------------------------------------------|------------------------------------------------|
| A second entity needs it                             | `money`, used by `order`, `refund`, `invoice`  |
| It is persisted or exchanged in its own right        | `address`, stored and posted to a lookup API   |
| It needs its own `version`, `status`, `owner`, prose | `tax-code`, owned by finance, its own cadence  |
| It should be a first-class node in derived views     | anything a protocol names as a message payload |

Keep it in `$defs` only when all of these hold: single entity, structurally
trivial, no independent meaning, no separate lifecycle — `positive-int`, a local
enum, a tuple used twice in one document.

Promotion is **additive** on the promoting entity: add the new datamodel at
`version: 1`, replace `#/$defs/x` with a `$ref` to its schema URL, bump the
promoting entity's `version`. The instance shape does not change, so no swap.

## Forbidden keywords

| Keyword                         | Why forbidden                                                                     |
|---------------------------------|-----------------------------------------------------------------------------------|
| `$dynamicRef`, `$dynamicAnchor` | Late binding makes the inheritance graph non-static; the portal cannot derive it. |
| `$anchor`                       | A second way to address a local shape; `#/$defs/name` stays greppable.            |
| `$vocabulary`                   | Dialect authoring — the dialect is fixed.                                         |

All are `E_DM_KEYWORD`. A nested `$id` is also forbidden, under
`E_DM_ID_FORBIDDEN`.

## Inheritance is stock `allOf` + `$ref`

There is no `extends`, no `x-inherits`, no portal-side merge directive. A schema
whose root carries `allOf` branches that `$ref` other datamodels **is** a
derived model; that is the entire inheritance layer.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/order",
  "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/order",
  "title": "Order",
  "type": "object",
  "allOf": [
    { "$ref": "https://schemas.metaframework.dev/acme/datamodel/base-record" },
    { "$ref": "https://schemas.metaframework.dev/acme/datamodel/auditable" }
  ],
  "properties": {
    "total": { "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" },
    "lines": {
      "type": "array",
      "items": { "$ref": "https://schemas.metaframework.dev/acme/product/shop/datamodel/order-line" }
    },
    "line-count": { "$ref": "#/$defs/positive-int" }
  },
  "required": ["total"],
  "$defs": { "positive-int": { "type": "integer", "minimum": 1 } }
}
```

Inheritance uses **stock** `allOf` + `$ref` and nothing else. `$dynamicRef`,
`$dynamicAnchor`, `$anchor` and `$vocabulary` are forbidden (`E_DM_KEYWORD`,
below): late binding would make the inheritance graph non-static, and the portal
derives that graph by reading the file.

**The composition trap: a base MUST NOT close itself.**
`"additionalProperties": false` on a schema used as an `allOf` base is
`E_DM_CLOSED_BASE` — `allOf` branches are evaluated independently, so a closed
base rejects every property the derived model adds. Concrete models should also
leave `additionalProperties` unset, because consumers must tolerate unknown
properties from later versions.

A base or mixin is an ordinary datamodel entity with `abstract: true`. There is
no `mixin` flag — mechanically a mixin is just another `allOf` branch, and
branch order is irrelevant (conjunction is commutative). An abstract model must
not carry `examples/`, and pointing a protocol payload or an `exposes` edge at
one is `W_DM_ABSTRACT_USE`; using it as an `allOf` base is the intended use and
never flagged.

A cycle in the root-`allOf` graph is `E_DM_INHERIT_CYCLE`. Recursion **through
properties or items** is legal and useful.

## Discriminated unions

`oneOf` over branches, each tagged by a `const` property with the same name in
every branch, present in each branch's `required`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/datamodel/payment-method",
  "x-srn": "srn://acme/product/shop/datamodel/payment-method",
  "oneOf": [
    { "$ref": "https://schemas.metaframework.dev/acme/product/shop/datamodel/card-payment" },
    { "$ref": "https://schemas.metaframework.dev/acme/product/shop/datamodel/sepa-payment" }
  ]
}
```

Every branch must be an object schema; tags must be distinct `const` values,
lowercase kebab-case. A `oneOf` that fails this still validates but renders as
an opaque blob and is reported `W_DM_UNION_TAG`.

## `deprecated: true` — the standard lifecycle keyword

`deprecated` is a **standard JSON Schema 2020-12 meta-data keyword**, defined in
the meta-data vocabulary alongside `title`, `description`, `default`, `examples`,
`readOnly` and `writeOnly` (`https://json-schema.org/draft/2020-12/meta/meta-data`;
verify with `node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json`).
It is an **annotation**: it asserts nothing, rejects no instance, and is therefore
always an additive edit. No framework extension is needed or wanted here — this
is the one lifecycle signal stock tooling already understands, and generators
emit `@deprecated` from it.

Two levels, two rules:

| Level                | Rule                                                          | Why                                                                                                             |
|----------------------|---------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| The **whole schema** | **SHOULD** be set when the entity's `status` is `deprecated`. | The frontmatter says it to the portal; the keyword says it to every consumer that only ever sees `schema.json`. |
| A **property**       | **MAY** be set on a field being phased out.                   | The only way to retire a field: a property is never removed, at any version number.                             |

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/datamodel/charge",
  "x-srn": "srn://acme/product/shop/datamodel/charge",
  "title": "Charge",
  "deprecated": true,
  "description": "Superseded by srn://acme/product/shop/datamodel/payment-intent.",
  "type": "object",
  "properties": {
    "amount": { "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" },
    "legacy-ref": {
      "type": "string",
      "deprecated": true,
      "description": "Replaced by \"amount\" in version 4. Still written by pre-v4 producers."
    }
  }
}
```

Setting it bumps `version` like any other content edit. Setting `status:
deprecated` in the frontmatter **alone** does not bump — but adding
`"deprecated": true` to `schema.json` in the same commit does, because a sibling
artifact changed. Do both in one commit and bump once.

The keyword does not replace the swap. It **announces** one: the successor
entity, the `supersedes` edge and the referrer migration are still the mechanism
(`evolution.md`). A schema marked `deprecated` with no successor and no
`supersedes` edge pointing at it is a review finding, not a completed retirement.

## Additive evolution of a schema

The test never changes: **version N+1 MUST accept every instance version N
accepted.** See `evolution.md` for the general rules and the swap procedure.

| Legal in place — bump `version`                             | Forbidden in place — requires a swap                     |
|-------------------------------------------------------------|----------------------------------------------------------|
| Add an optional property                                    | Add a name to `required`                                 |
| Widen a type (`"string"` → `["string","null"]`)             | Narrow a type                                            |
| Add an enum value                                           | Remove an enum value                                     |
| Relax a bound (`maxLength: 64` → `256`)                     | Tighten a bound                                          |
| Remove a name from `required` (loosens)                     | Remove or rename a property                              |
| Add a `oneOf` branch with a new `const` tag                 | Remove a branch, or reuse a tag for a new shape          |
| Add an `allOf` branch introducing only optional properties  | Add an `allOf` `$ref` to a base that declares `required` |
| A `$ref` target evolving additively — no edit here at all   | Repoint a `$ref` at a different or narrower entity       |
| Add `description`, `examples`, `format`, `deprecated: true` | Set `"additionalProperties": false` where it was not     |
| Add a `$defs` shape, or drop an unreferenced one            | Add or tighten a `pattern`                               |

Notes:

- `format` is annotation-only here — the validator runs with format assertion
  disabled, so adding `"format": "uuid"` rejects nothing.
- `deprecated: true` is the additive replacement for property removal. You can
  never remove a property; mark it, stop writing it, let consumers migrate. It is
  a standard 2020-12 annotation — see the section above.
- A `$ref` names an entity, so a target's additive evolution is silent — the
  referrer's `version` does not move for a change it did not make.

The portal diffs the current file against version N read from git and reports
`E_DM_NOT_ADDITIVE` for the decidable subset. The check is deliberately
conservative; a clean build is evidence, not proof.

## Error classes

| Code                   | Meaning                                                                                                                                    |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `E_DM_SCHEMA_MISSING`  | Datamodel entity directory has no `schema.json`.                                                                                           |
| `E_DM_SCHEMA_INVALID`  | Not valid JSON, or not valid against the 2020-12 meta-schema.                                                                              |
| `E_DM_DIALECT`         | `$schema` missing or not exactly the 2020-12 dialect URI.                                                                                  |
| `E_DM_ID_MISSING`      | Root `$id` absent.                                                                                                                         |
| `E_DM_ID_MISMATCH`     | Root `$id` ≠ the entity's canonical schema URL (wrong entity, wrong host, or a pin).                                                       |
| `E_DM_ID_FORBIDDEN`    | `$id` present below the root.                                                                                                              |
| `E_DM_SRN_MISSING`     | `x-srn` absent.                                                                                                                            |
| `E_DM_SRN_MISMATCH`    | `x-srn` ≠ the unversioned SRN of the entity directory the file sits in.                                                                    |
| `E_DM_KEYWORD`         | Forbidden keyword used (`$dynamicRef`, `$dynamicAnchor`, `$anchor`, `$vocabulary`).                                                        |
| `E_DM_REF_TARGET`      | A `$ref` is not a canonical schema URL naming a real entity (relative path, `srn://`, serving address, foreign host, bucket, version pin). |
| `E_DM_FOREIGN_DEFS`    | `$ref` points into another entity's `$defs`.                                                                                               |
| `E_DM_INHERIT_CYCLE`   | Cycle in the root-`allOf` inheritance graph.                                                                                               |
| `E_DM_CLOSED_BASE`     | `"additionalProperties": false` on a schema used as an `allOf` base.                                                                       |
| `E_DM_EXAMPLE_INVALID` | A file in `examples/` fails validation against the entity's own schema.                                                                    |
| `E_DM_NOT_ADDITIVE`    | Detectable instance-superset violation between version N and N+1.                                                                          |
| `W_DM_ABSTRACT_USE`    | Abstract model used as a payload / `exposes` target, or carrying examples.                                                                 |
| `W_DM_UNION_TAG`       | `oneOf` without a derivable shared `const` tag.                                                                                            |
| `W_DM_CONTRADICTION`   | Derived model contradicts (rather than restricts) an inherited constraint.                                                                 |
| `W_DM_USAGE_MISMATCH`  | Model named as a protocol payload while declaring `usage: storage`.                                                                        |

Retired, MUST NOT be emitted or cited:

| Retired code        | Why, and what covers it now                                                                                                                                                     |
|---------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `E_DM_REF_KIND`     | The schema registry holds only datamodels, so a URL naming any other kind has no entry and is `E_SRN_DANGLING`. There was never a second kind check to fail.                    |
| `E_DM_SRN_RETIRED`  | It flagged a *present* `x-srn` while the annotation was retired. `x-srn` is required again; absence is `E_DM_SRN_MISSING`, disagreement `E_DM_SRN_MISMATCH`.                    |
| `E_DM_REF_ESCAPE`   | It meant "on this origin but outside `/schemas/`". The canonical URL has no `/schemas/` prefix — the whole host *is* the entity namespace — so a bad path is `E_DM_REF_TARGET`. |
| `E_DM_ID_INVALID`   | Split into `E_DM_ID_MISSING` and `E_DM_ID_MISMATCH`.                                                                                                                            |
| `W_DM_UNPINNED_REF` | A `$ref` never carries a pin, so there is nothing to warn about.                                                                                                                |
| `E_VER_ID_MISMATCH` | The rule it guarded no longer exists.                                                                                                                                           |
