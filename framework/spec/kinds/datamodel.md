---
kind: spec
name: datamodel
version: 2
status: review
title: DataModel kind
summary: The datamodel kind contract — schema.json in JSON Schema 2020-12, no $id, relative-path $refs consumable by stock tooling, allOf inheritance, composition patterns, the portal schema registry, derived views, and schema-level additive evolution.
---

# DataModel kind

A **datamodel** describes a data structure that is persisted in storage or
exchanged over a protocol. It is the only kind whose contract surface is fully
machine-checkable: the prose in `index.md` states intent and invariants, and the
sibling `schema.json` states the shape, in stock JSON Schema.

This document adds to the common contracts; it never overrides them. Read
[structure.md](../structure.md) for placement, [srn.md](../srn.md) for
references, [frontmatter.md](../frontmatter.md) for the common fields, and
[evolution.md](../evolution.md) for versioning. Normative language per
[index.md](../index.md) (RFC 2119).

`schema.json` is the one artifact in the framework that does **not** use SRN
references. It carries no `$id` and every cross-entity `$ref` is a relative file
path, so that any standard validator or code generator can consume it with no
knowledge of this framework ([below](#why-relative-paths)). Everything else a
datamodel writes — frontmatter `relations`, prose links — is ordinary SRN.

## Entity directory shape

A datamodel entity is a directory inside a `datamodel/` kind bucket:

```text
solutions/acme/shop/checkout/payment/datamodel/order/
├── index.md          # REQUIRED — common frontmatter + kind fields + prose
├── schema.json       # REQUIRED — JSON Schema 2020-12, no $id, path-relative $refs
└── examples/         # OPTIONAL asset subdirectory — sample instances
    ├── minimal.json
    └── with-discount.json
```

Rules:

- `schema.json` is REQUIRED. A datamodel entity without it is
  `E_DM_SCHEMA_MISSING` — a datamodel with no schema is prose, and prose belongs
  in an ADR or a requirement.
- The filename is **bare**: exactly `schema.json`. The entity name is already
  the directory name; repeating it is redundant and breaks greppability. It is
  also load-bearing now: every `$ref` in the catalog ends in `/schema.json`, so
  a renamed file is an unresolvable reference in every schema that points at it.

  ```text
  datamodel/order/schema.json          # correct
  datamodel/order/order.schema.json    # WRONG — never prefix with the entity name
  datamodel/order/order.json           # WRONG — the sibling is named by role
  ```

- `examples/*.json` are OPTIONAL instance documents. Every file in `examples/`
  MUST validate against the entity's own `schema.json`
  (`E_DM_EXAMPLE_INVALID`). They are documentation the build keeps honest.
- No other sibling is defined by this kind. Per
  [structure.md](../structure.md), an asset subdirectory MUST NOT contain an
  `index.md` at any depth (`E_STRUCT_NESTED_ENTITY`).

Placement is owner-scoped ([structure.md](../structure.md)): a datamodel lives
in the `datamodel/` bucket of the solution, product, or component **responsible**
for it. Scope is responsibility, not visibility — any entity in the solution may
reference any datamodel of that solution.

```text
solutions/acme/datamodel/money/                          # solution-wide vocabulary
solutions/acme/shop/datamodel/order-line/                # product-owned
solutions/acme/shop/checkout/payment/datamodel/order/    # component-owned
```

## Dialect and identity

Exactly one dialect: **JSON Schema draft 2020-12**. There is no second schema
language, no OpenAPI-flavoured subset, no proprietary extension layer.

A `schema.json` carries **no `$id`**. Its identity is its owning entity's SRN,
and that SRN is derived from the file's path, because SRN ≡ path
([srn.md](../srn.md)):

```text
solutions/acme/shop/checkout/payment/datamodel/order/schema.json
→          srn://acme/shop/checkout/payment/datamodel/order
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/shop/checkout/payment/datamodel/order",
  "title": "Order",
  "type": "object"
}
```

| Requirement                                                                   | Violation             |
| ----------------------------------------------------------------------------- | --------------------- |
| `$schema` present and exactly `https://json-schema.org/draft/2020-12/schema`. | `E_DM_DIALECT`        |
| The document is valid against the 2020-12 meta-schema.                        | `E_DM_SCHEMA_INVALID` |
| `$id` absent — at the root and at every nesting level.                        | `E_DM_ID_FORBIDDEN`   |
| `x-srn`, if present, equals the entity's own unversioned SRN.                 | `E_DM_SRN_MISMATCH`   |

Any `$id` is `E_DM_ID_FORBIDDEN`, whatever its form:

```json
{ "$id": "srn://acme/shop/datamodel/order-line@2" }     /* E_DM_ID_FORBIDDEN */
{ "$id": "srn://acme/shop/datamodel/order-line" }       /* E_DM_ID_FORBIDDEN */
{ "$id": "https://acme.example/schemas/order.json" }    /* E_DM_ID_FORBIDDEN */
{ "$id": "order.json" }                                 /* E_DM_ID_FORBIDDEN */
```

The reason is mechanical, not stylistic: JSON Schema resolves a relative `$ref`
against the document's base URI, and the base URI is `$id` whenever `$id` is
present. An `srn://` `$id` would therefore re-base every `../money/schema.json`
onto a URI scheme no tool understands — undoing the interoperability the paths
exist to buy. An `https://` `$id` would do the same, more quietly, by pointing
resolution at a web server instead of the working tree.

Omitting `$id` costs nothing. The authoritative `name` and `version` already
live in the entity's `index.md` frontmatter ([frontmatter.md](../frontmatter.md)),
and the SRN is the path.

### The `x-srn` provenance annotation

`x-srn` is OPTIONAL. It MAY appear once, at the document root, and holds the
owning entity's **unversioned** SRN. Validators ignore unrecognized `x-`
keywords, so it changes nothing about how the schema validates; it exists so
that a `schema.json` copied out of the catalog into a code generator, a ticket,
or another repository still says where it came from.

For `solutions/acme/shop/datamodel/order-line/schema.json`:

```json
{ "x-srn": "srn://acme/shop/datamodel/order-line" }     /* correct */
{ "x-srn": "srn://acme/shop/datamodel/order-line@2" }   /* E_DM_SRN_MISMATCH — versioned */
{ "x-srn": "srn://acme/shop/datamodel/orderline" }      /* E_DM_SRN_MISMATCH — directory is order-line */
{ "x-srn": "srn://acme/datamodel/order-line" }          /* E_DM_SRN_MISMATCH — wrong owner */
```

It is unversioned deliberately: a versioned annotation would have to be edited
in lockstep with every frontmatter `version` bump, which is exactly the drift
the annotation is supposed to avoid. Because the portal re-derives the expected
value from the file's path on every load and compares
(`E_DM_SRN_MISMATCH`), `x-srn` can be wrong for the length of one commit and no
longer.

Other `x-*` keywords are legal JSON Schema annotations; this framework neither
validates nor renders them.

### Forbidden keywords

The following 2020-12 keywords MUST NOT appear anywhere in a `schema.json`
(`E_DM_KEYWORD`):

| Keyword                         | Why forbidden                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `$dynamicRef`, `$dynamicAnchor` | Late-bound resolution makes the inheritance graph non-static, so the portal cannot derive it. Use `allOf` + `$ref`. |
| `$anchor`                       | A second way to address a local shape. `#/$defs/name` JSON Pointers stay greppable; anchors do not.                 |
| `$vocabulary`                   | Dialect authoring. The dialect is fixed by this document.                                                           |

```json
{ "$defs": { "node": { "$dynamicAnchor": "node" } } }   /* E_DM_KEYWORD */
{ "$defs": { "node": { "type": "object" } } }           /* correct — refer to it as "#/$defs/node" */
```

`$id` is forbidden too, but under its own code (`E_DM_ID_FORBIDDEN`, above) —
it is an identity rule, not a dialect-surface restriction.

## References and inheritance

**Inheritance is stock `allOf` + `$ref`. There is no other mechanism.** No
`extends`, no `x-inherits`, no portal-side merge directive. A schema whose root
carries `allOf` branches that `$ref` other datamodels *is* a derived model; that
is the entire inheritance layer.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/shop/checkout/payment/datamodel/order",
  "type": "object",
  "allOf": [
    { "$ref": "../../../../../datamodel/base-record/schema.json" },
    { "$ref": "../../../../../datamodel/auditable/schema.json" }
  ],
  "properties": {
    "total": { "$ref": "../../../../../datamodel/money/schema.json" }
  }
}
```

### Why relative paths

The reference form here was chosen against measurements, not taste. Two things
were tested on the same pair of schemas.

**1. Generic consumption is real, and SRN refs break it.** Off-the-shelf
`json-schema-to-typescript`:

```text
"$ref": "/datamodel/money@1"      → FAILED: Error opening file "/datamodel/money@1"
"$ref": "../money/schema.json"    → OK: interface Order { total?: Money } + interface Money
```

`ajv-cli`, `quicktype`, and `datamodel-code-generator` behave the same way: they
resolve relative file references off the filesystem and have no way to resolve a
private URI scheme. A relative path costs the catalog nothing and buys every one
of those tools for free.

**2. Editor navigation is unobtainable through reference syntax, so it is not a
tiebreaker.** VS Code embeds `vscode-json-languageservice`, which produces
navigable links only for same-document JSON Pointers (`#/$defs/money` — verified
working). Every external form produced nothing: SRN refs, plain relative file
paths, and relative paths with pointers alike. No choice of `$ref` syntax buys
go-to-definition; only an editor extension or an LSP would, for any syntax. The
gap is known and an LSP is explicitly out of scope for v1.

That leaves interoperability as the only differentiator, and it points one way.
The same measurement is why `$id` is omitted rather than kept in SRN form: with
an `$id` present the relative paths would be re-based onto it and the tools
would fail again.

### `$ref` is a relative file path

Every `$ref` to **another** entity is an ordinary relative file path ending in
`/schema.json`. There is no absolute form: no `srn://`, no `https://`, no
leading `/`.

The base for resolution is the referring **file's own location** — the retrieval
URI, which is what a base URI defaults to when no `$id` overrides it. This is
stock RFC 3986 behaviour and it means the paths read exactly like `cd` from the
entity's directory. From
`solutions/acme/shop/checkout/payment/datamodel/order/schema.json`:

```text
../refund/schema.json                          → solutions/acme/shop/checkout/payment/datamodel/refund/schema.json
../../../../datamodel/order-line/schema.json   → solutions/acme/shop/datamodel/order-line/schema.json
../../../../../datamodel/money/schema.json     → solutions/acme/datamodel/money/schema.json
#/$defs/quantity                               → local JSON Pointer inside this document
```

Count the `..` from the entity **directory**, not from the repository root: one
`..` leaves `order/` and lands in the `datamodel/` bucket, so a sibling entity is
always `../{name}/schema.json`, and every further level of the owning container
costs one more.

Forms that are not a relative path to a `schema.json` are `E_DM_REF_TARGET`:

```json
{ "$ref": "../money/schema.json" }                  /* correct                                        */
{ "$ref": "srn://acme/datamodel/money@1" }          /* E_DM_REF_TARGET — SRNs do not appear in $ref   */
{ "$ref": "/datamodel/money/schema.json" }          /* E_DM_REF_TARGET — absolute: resolves off the
                                                       machine root, not the catalog                  */
{ "$ref": "https://acme.example/money.json" }       /* E_DM_REF_TARGET — network reference            */
{ "$ref": "../money/" }                             /* E_DM_REF_TARGET — a directory is not a schema  */
{ "$ref": "../money/index.md" }                     /* E_DM_REF_TARGET — not a schema.json            */
{ "$ref": "../money/examples/minimal.json" }        /* E_DM_REF_TARGET — an instance is not a schema  */
```

A `$ref` MUST also stay **inside the catalog**. The catalog root is the
`solutions/` directory; a `$ref` whose normalized target lies outside it is
`E_DM_REF_ESCAPE`, and one that lands inside a *different* solution is
`E_SRN_CROSS_SOLUTION` — solutions are sealed universes
([kinds/solution.md](solution.md)). From the same `order/schema.json`:

```text
../../../../../../globex/datamodel/money/schema.json      # 6 up → solutions/ ; E_SRN_CROSS_SOLUTION
../../../../../../../framework/spec/schema.json           # 7 up → repo root  ; E_DM_REF_ESCAPE
../../../../../../../../elsewhere/schema.json             # climbs past the repo; E_DM_REF_ESCAPE
```

The decision is made on the **normalized** path, not on the `..` count, so a
reference that climbs out of `solutions/` and back in resolves legally — it is
merely pointless, and review is the place to say so.

### Mapping a resolved path back to an SRN

Every derived view is a graph of entities, so the portal converts each resolved
`$ref` target back into the SRN of the entity that owns it. The mapping is the
inverse of `to_dir` in [srn.md](../srn.md): strip the `solutions/` prefix and the
`/schema.json` suffix, prefix `srn://`.

```python
CATALOG_ROOT = "solutions"

def schema_path_to_srn(path: str) -> str:
    """`path` is repo-relative and already normalized (no "." or ".." left)."""
    parts = path.split("/")
    if parts[0] != CATALOG_ROOT:
        raise DmError("E_DM_REF_ESCAPE", f"{path} is outside {CATALOG_ROOT}/")
    if parts[-1] != "schema.json":
        raise DmError("E_DM_REF_TARGET", f"{path} does not name a schema.json")
    return "srn://" + "/".join(parts[1:-1])
```

```text
solutions/acme/datamodel/money/schema.json   → srn://acme/datamodel/money
```

The result is **unversioned**, and the SRN it produces MUST parse and MUST
address an entity whose `kind` is `datamodel` (`E_DM_REF_KIND`) — a path is free
to point at any directory, so the kind check that SRN grammar used to give for
free is now an explicit step. The concrete version of the edge is the target's
current frontmatter `version`, read from its `index.md`, not from the reference.

### Pinning left `$ref`

**A `$ref` names an entity, never a version.** `money@1/schema.json` is not a
path; and with git-backed history only current versions exist on the filesystem
([evolution.md](../evolution.md)), so a pinned historical `$ref` never resolved
to a file even when the syntax allowed one. Nothing is lost by removing it.

Pinning remains fully available where it is actually resolvable: frontmatter
`relations`, which no external tool consumes.

```json
{ "total": { "$ref": "../money/schema.json" } }    /* the only legal form */
{ "total": { "$ref": "../money@1/schema.json" } }  /* E_SRN_DANGLING — no such directory */
```

```yaml
# index.md — where a version pin still means something
relations:
  uses:
    - /datamodel/money@1
```

Consequently `W_DM_UNPINNED_REF` is retired: there is no unpinned case left to
warn about, because there is no pinned one.

### Local JSON Pointers are unchanged

Fragments are the one reference form the interoperability argument does not
touch — they resolve inside the document, so every tool already handles them.

```json
{ "$ref": "#/$defs/positive-int" }   /* a shape defined in this document */
{ "$ref": "#" }                      /* this document's root — see Cycles below */
```

A pointer MAY be appended to a path reference only to address that document's
root (`../money/schema.json#`, redundant but legal). Any deeper pointer into
another file is `E_DM_FOREIGN_DEFS`, below.

### `$defs` are entity-private

A `$ref` MUST NOT point into another entity's `$defs` (`E_DM_FOREIGN_DEFS`).
`$defs` is local scratch space; the moment a shape needs to be shared it is
promoted to its own datamodel entity (see below). This keeps the reference graph
a graph of entities, not of anonymous document fragments.

```json
{ "$ref": "../money/schema.json" }                  /* correct — entity reference   */
{ "$ref": "../money/schema.json#/$defs/currency" }  /* E_DM_FOREIGN_DEFS            */
{ "$ref": "#/$defs/currency" }                      /* correct — own document       */
```

### Cycles

Recursion **through properties or items** is legal and useful (a tree node, a
linked comment). Self-recursion is the empty pointer `#`, which is the current
document's root:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/shop/datamodel/category",
  "type": "object",
  "properties": {
    "children": { "type": "array", "items": { "$ref": "#" } }
  }
}
```

Mutual recursion across two entities is the same thing with paths on both sides
and is equally legal, as long as the cycle runs through properties or items.

A cycle in the **inheritance graph** — the graph of root-level `allOf` `$ref`
edges — is `E_DM_INHERIT_CYCLE`. It cannot be flattened and cannot be drawn as a
tree:

```text
order     allOf → invoice        # ../../../../datamodel/invoice/schema.json
invoice   allOf → order          # E_DM_INHERIT_CYCLE
```

## Composition patterns

### Abstract base models

A base model factors properties shared by several concrete models. Mark it
`abstract: true` in the frontmatter: it is never instantiated on its own, so it
is never a storage row nor a wire payload.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/datamodel/base-record",
  "type": "object",
  "properties": {
    "id":         { "type": "string", "format": "uuid" },
    "created-at": { "type": "string", "format": "date-time" }
  },
  "required": ["id", "created-at"]
}
```

**A base MUST NOT close itself.** `"additionalProperties": false` on a schema
used as an `allOf` base is `E_DM_CLOSED_BASE`: in JSON Schema, `allOf` branches
are evaluated independently, so a closed base rejects every property the derived
model adds — the classic composition trap.

```json
/* E_DM_CLOSED_BASE: with this base, order's own "total" property is rejected */
{ "x-srn": "srn://acme/datamodel/base-record", "additionalProperties": false }
```

Concrete models SHOULD also leave `additionalProperties` unset: consumers MUST
tolerate unknown properties from later versions ([evolution.md](../evolution.md)),
and closing a schema makes that impossible for the *validator*, whatever the
reader does.

### Mixins

A mixin is a base with no identity of its own — a cross-cutting property set.
Mechanically it is the same thing: another `allOf` branch. Multiple branches
compose; order is irrelevant (conjunction is commutative).

```json
{
  "x-srn": "srn://acme/shop/checkout/payment/datamodel/order",
  "allOf": [
    { "$ref": "../../../../../datamodel/base-record/schema.json" },
    { "$ref": "../../../../../datamodel/auditable/schema.json" }
  ]
}
```

The first branch contributes identity and timestamps; the second is the mixin
(`changed-by`, `change-reason`). Both climb five levels from
`.../payment/datamodel/order/` to `solutions/acme/`, because both bases are
solution-level vocabulary.

Mixins are datamodel entities like any other, `abstract: true`. The portal draws
them in the inheritance tree with a dashed edge only as a rendering hint — there
is no `mixin` flag, because there is no mechanical difference.

### Discriminated unions

A union is `oneOf` over branches, each branch tagged by a `const` property with
the same name in every branch:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/shop/datamodel/payment-method",
  "oneOf": [
    { "$ref": "../card-payment/schema.json" },
    { "$ref": "../sepa-payment/schema.json" }
  ]
}
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/shop/datamodel/card-payment",
  "type": "object",
  "properties": {
    "method": { "const": "card" },
    "pan-last4": { "type": "string" }
  },
  "required": ["method", "pan-last4"]
}
```

Both branches are siblings of the union in the same `datamodel/` bucket, hence
the single `..`.

For the portal to derive a variant map, the union MUST satisfy: every branch is
an object schema; every branch declares the **same** tag property; each tag is a
distinct `const`; the tag is in each branch's `required`. A `oneOf` that fails
this is still valid JSON Schema and still validates — it is simply rendered as an
opaque `oneOf` and reported as `W_DM_UNION_TAG`.

```json
/* W_DM_UNION_TAG — branches distinguished only by which properties they carry */
{ "oneOf": [ { "required": ["pan-last4"] }, { "required": ["iban"] } ] }
```

Tag values are lowercase kebab-case strings, matching the framework's naming
convention everywhere else.

### `$defs` for local-only shapes

`$defs` holds shapes that exist only to avoid repetition inside one document:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/shop/datamodel/order-line",
  "type": "object",
  "properties": {
    "quantity": { "$ref": "#/$defs/positive-int" },
    "returned": { "$ref": "#/$defs/positive-int" }
  },
  "$defs": {
    "positive-int": { "type": "integer", "minimum": 1 }
  }
}
```

### When to promote a `$defs` shape to its own entity

Promote as soon as **any** of these is true:

| Trigger                                                                | Example                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A second entity needs it (which `E_DM_FOREIGN_DEFS` makes impossible). | `money` used by `order`, `refund`, and `invoice`.                      |
| It is persisted or exchanged in its own right.                         | `address` stored in its own table and posted to an address-lookup API. |
| It needs its own `version`, `status`, `owner`, or prose.               | `tax-code` owned by `team-finance`, evolving on its own cadence.       |
| It should appear in derived views as a first-class node.               | Anything a protocol names as a message payload.                        |

Keep it in `$defs` when all of these hold: single entity, structurally trivial,
no independent meaning, no separate lifecycle — `positive-int`, a local enum, a
tuple used twice in the same document.

Promotion is an additive change to the promoting entity: add the new datamodel
entity at `version: 1`, replace `#/$defs/x` with a path `$ref` to it, bump the
promoting entity's `version`. The instance shape is unchanged, so the
instance-superset rule holds and no swap is needed.

## Frontmatter additions

On top of the common fields in [frontmatter.md](../frontmatter.md), the
datamodel kind adds exactly two:

| Field      | Type                          | Required | Rule                                                                 |
| ---------- | ----------------------------- | -------- | -------------------------------------------------------------------- |
| `usage`    | `storage \| exchange \| both` | yes      | Where instances of this model live. No default — the author decides. |
| `abstract` | boolean                       | no       | Default `false`. `true` = a base/mixin never instantiated directly.  |

```yaml
usage: both
abstract: false
```

**Why `usage` is required.** Persistence and wire traffic put opposite pressures
on a schema: a stored model's additive change implies a migration and a backfill
plan; an exchanged model's additive change implies a producer/consumer rollout
order. The portal needs it to answer the two questions every reviewer asks —
"what does this component persist?" and "what crosses this boundary?" — and it
cannot be inferred: a model with no protocol references today may be pure
storage or may be an exchange model whose protocol is not written yet. Because it
cannot be inferred, it has no default. On an `abstract: true` model, `usage`
declares the intended domain of its descendants.

Consistency check: a datamodel named as a protocol message payload while
declaring `usage: storage` is reported as `W_DM_USAGE_MISMATCH` (a warning — the
protocol may be ahead of the datamodel's review).

**Why `abstract` is required as a flag.** Nothing in a JSON Schema distinguishes
"base class, never instantiated" from "concrete model that nobody has derived
from yet". The flag drives real behaviour: abstract models are excluded from
"what does this component store/exchange" views, are rendered as tree nodes
rather than leaves, MUST NOT carry `examples/` (`W_DM_ABSTRACT_USE`), and are
flagged when a non-schema consumer — a protocol message payload, a component's
`exposes` edge — points at them directly instead of at a concrete descendant
(also `W_DM_ABSTRACT_USE`). Referencing an abstract model from another schema's
`allOf` is the intended use and is never flagged.

**Deliberately not added** (each was considered and rejected for v1): `dialect`
(fixed by this document), `schema-file` (fixed by the bare-filename convention),
`schema-srn` (the path already says it, and `x-srn` carries it inside the
artifact), `primary-key`/`identity` (belongs in the schema, and storage identity
is the component's concern), `storage-engine` (an environment/component property,
not the model's), `classification`/`pii` (use `tags` until there is a rule that
acts on it). The rule of thumb: a kind field must change portal behaviour or be
unrecoverable from the artifacts.

**Do not mirror schema references in `relations`.** Schema `$ref` edges are
derived from `schema.json` itself, exactly as inverse edges are derived from
forward edges. Restating each of them under `relations.uses` is double
bookkeeping and drifts.

The one thing the schema can no longer say is a **version**: `$ref` is a path,
and paths carry no `@N`. A pinned `uses` edge is therefore not duplication — it
is the only place the pin can live, and it records a real statement ("this model
is reviewed against `money@1`; a `money@2` is a change I want to see"). Use it
where reproducibility is an actual requirement, not on every edge.

```yaml
relations:
  supersedes:
    - ../cart-order         # good — not expressible in the schema at all (and `../`,
                            # because a sibling entity is one level up from this
                            # entity's own directory — [srn.md](../srn.md))
  uses:
    - /datamodel/money@1      # good — pins a version the path $ref cannot carry
    - /datamodel/base-record  # redundant — unpinned, and schema.json already $refs it
```

## The schema registry

The portal loads every schema into one validator registry so that **stock** JSON
Schema validation resolves every `$ref` with no custom resolver. That was the
goal before and it still is; what changed is that the mechanism is now the plain
filesystem instead of a private URI scheme, so the same resolution works outside
the portal — `ajv-cli`, `json-schema-to-typescript`, `quicktype`, and
`datamodel-code-generator` walk the identical paths.

Load sequence:

1. Glob `solutions/**/datamodel/*/schema.json`, parse, validate each against the
   2020-12 meta-schema (`E_DM_SCHEMA_INVALID`), and reject any `$id`
   (`E_DM_ID_FORBIDDEN`).
2. Register each document under the `file:` URI of its absolute path — the base
   URI a stock tool assigns when it opens the file, and the one thing that makes
   relative `$ref`s resolve by ordinary RFC 3986 rules. No synthetic `$id` is
   injected: injecting one would re-base every relative `$ref` and reintroduce
   the failure this design removed.
3. Verify `x-srn` where present against `schema_path_to_srn` of the file's own
   path (`E_DM_SRN_MISMATCH`).
4. Walk every `$ref`. Fragments resolve inside their own document. Every other
   ref MUST name a `schema.json` (`E_DM_REF_TARGET`), stay under `solutions/`
   (`E_DM_REF_ESCAPE`), stay inside the referring solution
   (`E_SRN_CROSS_SOLUTION`), exist (`E_SRN_DANGLING`), and belong to a
   `datamodel` entity (`E_DM_REF_KIND`).
5. Map each resolved path to the owning entity's SRN and record the edge
   `from-srn → to-srn`. This is the only place SRNs enter the schema layer: they
   are computed from paths, never read out of the documents.
6. Compile. Validating an instance is a lookup by file URI — or by SRN through
   the map built in step 5 — and nothing framework-specific happens at
   validation time.

```javascript
// illustrative, ajv 2020-12
for (const { path, doc } of schemas) {
  ajv.addSchema(doc, pathToFileURL(path).href);  // "file:///repo/solutions/acme/datamodel/money/schema.json"
}
const validate = ajv.getSchema(
  pathToFileURL("solutions/acme/shop/checkout/payment/datamodel/order/schema.json").href,
);
```

There is no version-keyed registration and no unversioned alias: a `$ref` carries
no version, so there is exactly one key per file and nothing to alias.

Historical snapshots are read from git for the version history view
([evolution.md](../evolution.md)) and for the additive diff below. A snapshot is
loaded into a registry scoped to **that commit's tree**: the relative `$ref`s
inside it resolve against the paths as they were at that commit, which is the
correct answer and needs no aliasing to express. Working-tree schemas and
historical schemas are never mixed in one registry.

Resolution failures:

| Situation                                                                          | Error                  |
| ---------------------------------------------------------------------------------- | ---------------------- |
| `$ref` is not a relative path naming a `schema.json` (SRN, URL, absolute, folder). | `E_DM_REF_TARGET`      |
| `$ref` normalizes to a path outside `solutions/`.                                  | `E_DM_REF_ESCAPE`      |
| `$ref` lands inside another solution.                                              | `E_SRN_CROSS_SOLUTION` |
| Target `schema.json` does not exist.                                               | `E_SRN_DANGLING`       |
| Target path maps to an SRN whose entity `kind` is not `datamodel`.                 | `E_DM_REF_KIND`        |
| `$ref` points into another document's `$defs`.                                     | `E_DM_FOREIGN_DEFS`    |
| `x-srn` disagrees with the file's own path.                                        | `E_DM_SRN_MISMATCH`    |

Every one of these is fatal to the build: an unresolvable registry means no
schema in the solution can be trusted. In dev the portal still serves the
catalog, rendering the affected entity page with the error banner instead of its
derived views. A shallow clone degrades as specified in
[evolution.md](../evolution.md): the missing historical commit surfaces as
`E_SRN_VERSION` with a "shallow history" hint, not as a silent fallback to
latest.

## What the portal derives

Nothing below is authored. All of it is computed from `schema.json`, the
frontmatter, and the catalog graph.

| Derived view            | Computed from                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------- |
| Inheritance tree        | Root-level `allOf` `$ref` edges across all datamodels (child → base), plus `abstract`. |
| Effective field table   | Flattening the root `allOf` conjunction (algorithm below).                             |
| Variant map             | `oneOf` branches with a shared `const` tag property.                                   |
| Referenced-by (schemas) | Inverse of all `$ref` edges — which schemas embed or extend this one.                  |
| Carried by protocols    | Inverse of the datamodel references in protocol artifacts (`kinds/protocol.md`).       |
| Owning component        | The entity's own path — the container whose `datamodel/` bucket holds it.              |
| Using components        | Inverse of `uses`/`exposes` relation edges targeting this datamodel.                   |
| Instance examples       | `examples/*.json`, rendered and validated against the schema.                          |
| Version history         | The git version→commit index ([evolution.md](../evolution.md)).                        |

Every `$ref` edge is stored and displayed as an **SRN pair**, mapped from the
resolved paths (`schema_path_to_srn`, above). Authors write paths because tools
read them; readers see SRNs because that is the catalog's vocabulary.

### Flattening algorithm

The effective field table is a **presentation of the conjunction**, not an
override chain. JSON Schema `allOf` intersects; a derived model never replaces a
base constraint, it adds to it.

1. Start from the entity's schema document.
2. Expand root-level `allOf` branches depth-first in document order, following
   `$ref` into other datamodels, recording the origin SRN of each contribution.
   Stop at any non-root `allOf` (one nested inside a property is a constraint on
   that property, not inheritance).
3. For each property name, collect every contribution as `(origin, subschema)`.
   A name contributed more than once is rendered with all its constraints and
   marked *restricted*.
4. `required` is the **union** of all `required` arrays across all branches.
5. Mark each row's origin: `own` or the base's SRN.

Applied to the worked example below:

```text
base-record  (abstract)
└── order
```

| Property     | Type                 | Required | Origin                       |
| ------------ | -------------------- | -------- | ---------------------------- |
| `id`         | string (uuid)        | yes      | `/datamodel/base-record@1`   |
| `created-at` | string (date-time)   | yes      | `/datamodel/base-record@1`   |
| `total`      | `/datamodel/money@1` | yes      | own                          |
| `discount`   | `/datamodel/money@1` | no       | own                          |
| `status`     | enum                 | no       | own                          |
| `line-count` | integer (≥ 1)        | no       | own (`#/$defs/positive-int`) |

The `@1` in that table is the version the portal **resolved on disk** — it read
`base-record/index.md` and found `version: 1`. No `$ref` carries a version any
more, so a version shown in a derived view is always the current one at build
time.

A derived model MAY restrict an inherited property (narrower enum, tighter
bound) — that is a legal conjunction and the table marks it. It MUST NOT
contradict one: a conjunction with disjoint `type` sets can never validate, and
the portal reports the detectable case as `W_DM_CONTRADICTION`.

```json
/* base:    { "properties": { "id": { "type": "string" } } }                     */
/* derived: { "properties": { "id": { "type": "integer" } } }  W_DM_CONTRADICTION */
/* derived: { "properties": { "id": { "minLength": 8 } } }     legal restriction  */
```

## Additive evolution of schemas

The general rules — the integer `version`, the instance-superset rule, the swap
procedure, the git-backed history — are in
[evolution.md](../evolution.md) and are not restated here. This section applies
them to concrete JSON Schema edits.

The test is always the same: **version N+1 MUST accept every instance version N
accepted.** Loosening is legal in place; tightening or reshaping is not legal at
any version number and requires a swap (a new entity that `supersedes` this one).

| Legal in place — bump `version` to N+1                                                   | Forbidden in place — requires a swap                                    |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Add an optional property: `"discount": { "$ref": "../money/schema.json" }`               | Add a name to `required`: `required: ["id"] → ["id", "discount"]`       |
| Widen a type: `"type": "string"` → `"type": ["string", "null"]`                          | Narrow a type: `["string", "null"]` → `"string"`                        |
| Add an enum value: `["placed","paid"]` → `["placed","paid","refunded"]`                  | Remove an enum value: `["placed","paid"]` → `["paid"]`                  |
| Relax a bound: `"maxLength": 64` → `256`; `"minimum": 1` → `0`                           | Tighten a bound: `"maxLength": 256` → `64`; `"minItems": 0` → `1`       |
| Remove a name from `required` (loosens; rarely wise, still additive)                     | Remove or rename a property: drop `status`; `total` → `amount`          |
| Add a `oneOf` branch with a new `const` tag: `{ "$ref": "../sepa-payment/schema.json" }` | Remove a `oneOf` branch, or reuse an existing tag value for a new shape |
| Add an `allOf` branch introducing only optional properties                               | Add an `allOf` `$ref` to a base that declares `required`                |
| A `$ref` target evolving additively — no edit here at all                                | Repoint a `$ref` at a different entity, or at a narrower one            |
| Add annotations: `description`, `examples`, `format`, `deprecated: true`                 | Set `"additionalProperties": false` where it was absent or `true`       |
| Add a `$defs` shape, or remove an unreferenced one (they are entity-private)             | Add a `pattern` to an existing string, or tighten an existing one       |

Notes on the trickier rows:

- **`format` is annotation-only** in this framework: the portal's validator runs
  with format assertion disabled, so adding `"format": "uuid"` does not reject
  any instance and is legal in place. It documents intent; it does not
  constrain.
- **`deprecated: true` is the additive replacement for property removal.** You
  can never remove `status`; you mark it, stop writing it, and let consumers
  migrate:

  ```json
  { "status": { "enum": ["placed", "paid"], "deprecated": true } }
  ```

- **A `$ref` names an entity, not a version, so target evolution is silent.**
  `money` moving to version 2 changes what `order` accepts without any edit to
  `order/schema.json`. That is safe only because `money@2` obeys the superset
  rule against `money@1` — the obligation sits with the target, and the
  referrer's own `version` does not move for a change it did not make. Where a
  specific version must be frozen for review or reproducibility, say so with a
  pinned `relations.uses` edge; the path `$ref` cannot say it.
- **Renaming a property is never additive.** Add the new one as optional,
  deprecate the old one, and let the two coexist; a rename in place breaks every
  stored instance.

### What the portal checks mechanically

At build, the portal diffs the current `schema.json` against version N read from
git and reports `E_DM_NOT_ADDITIVE` for the decidable subset:

```text
property present at N, absent at N+1          → E_DM_NOT_ADDITIVE
name added to "required"                      → E_DM_NOT_ADDITIVE
enum member removed                           → E_DM_NOT_ADDITIVE
"type" set narrowed                           → E_DM_NOT_ADDITIVE
numeric / length / items bound tightened      → E_DM_NOT_ADDITIVE
"pattern" added or tightened                  → E_DM_NOT_ADDITIVE
"additionalProperties" changed to false       → E_DM_NOT_ADDITIVE
"$ref" retargeted to another entity           → E_DM_NOT_ADDITIVE
```

The retargeting check compares **normalized target paths**, not the literal
strings: moving the referring entity changes every `..` count in its refs without
changing a single edge, and that is not a contract change.

The check is deliberately conservative: it flags only changes that are
unambiguously tightening. Full schema subsumption is undecidable in general, and
semantic breaks (same name, same type, new meaning) are invisible to any
checker — those are caught in git-native review. A clean build is evidence, not
proof.

## Worked example

Two entities: an abstract solution-level base and the concrete component-owned
model that derives from it. `money` is another solution-level datamodel (see the
tree in [structure.md](../structure.md)); it is referenced but not reproduced
here.

```text
solutions/acme/
├── datamodel/
│   ├── base-record/
│   │   ├── index.md
│   │   └── schema.json
│   └── money/
│       ├── index.md
│       └── schema.json
└── shop/checkout/payment/
    └── datamodel/
        └── order/
            ├── index.md
            ├── schema.json
            └── examples/
                └── minimal.json
```

### `solutions/acme/datamodel/base-record/index.md`

```markdown
---
name: base-record
kind: datamodel
version: 1
title: Base record
summary: Identity and creation timestamp shared by every persisted or exchanged record in the solution.
status: approved
owner: team-platform
usage: both
abstract: true
tags:
  - foundation
---

# Base record

Every record that acme persists or puts on the wire carries a UUID identity and
a creation timestamp. This model exists only to be extended: it is never stored
or exchanged on its own, hence `abstract: true`.

It deliberately does not close itself (`additionalProperties` is unset) — a
closed base would reject every property its descendants add, because `allOf`
branches are evaluated independently.
```

### `solutions/acme/datamodel/base-record/schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/datamodel/base-record",
  "title": "Base record",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "description": "Stable identity, assigned by the writer."
    },
    "created-at": {
      "type": "string",
      "format": "date-time",
      "description": "RFC 3339 timestamp of first persistence."
    }
  },
  "required": ["id", "created-at"]
}
```

### `solutions/acme/shop/checkout/payment/datamodel/order/index.md`

```markdown
---
name: order
kind: datamodel
version: 3
title: Order
summary: Customer order aggregate persisted by the payment component and published on order-events.
status: approved
owner: team-payments
usage: both
abstract: false
relations:
  supersedes:
    - ../cart-order         # sibling in the same bucket: the base of a relative
                            # ref is this entity's own directory
  uses:
    - /datamodel/money@1    # the version pin the schema's path $ref cannot carry
tags:
  - commerce
  - aggregate
x-jira-epic: SHOP-142
---

# Order

The order aggregate as the payment component owns it: one order per checkout
attempt, immutable once `status` reaches `paid`. Extends
[base-record](srn://acme/datamodel/base-record@1) for identity and creation
timestamp; monetary amounts use the solution-wide
[money](srn://acme/datamodel/money@1) model.

Invariants that the schema cannot express:

- `discount` never exceeds `total`.
- `status` moves only forward: `placed` → `paid` → `refunded`.

History: version 2 added the optional `discount`; version 3 added the
`refunded` enum value. Both are additive — every version 1 instance still
validates. The schema `$ref`s are not repeated under `relations`; the portal
derives those edges from `schema.json`.
```

Prose links stay `srn://` and MAY pin (`@1`) — the interoperability rule binds
`schema.json` only.

### `solutions/acme/shop/checkout/payment/datamodel/order/schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/shop/checkout/payment/datamodel/order",
  "title": "Order",
  "type": "object",
  "allOf": [
    { "$ref": "../../../../../datamodel/base-record/schema.json" }
  ],
  "properties": {
    "total": {
      "$ref": "../../../../../datamodel/money/schema.json",
      "description": "Gross amount payable."
    },
    "discount": {
      "$ref": "../../../../../datamodel/money/schema.json",
      "description": "Applied discount; added in version 2."
    },
    "status": {
      "enum": ["placed", "paid", "refunded"],
      "description": "\"refunded\" added in version 3."
    },
    "line-count": {
      "$ref": "#/$defs/positive-int"
    }
  },
  "required": ["total"],
  "$defs": {
    "positive-int": {
      "type": "integer",
      "minimum": 1
    }
  }
}
```

### `solutions/acme/shop/checkout/payment/datamodel/order/examples/minimal.json`

```json
{
  "id": "0f6f0f2a-1a6b-4a0e-9c3a-6a2f4a0c1d55",
  "created-at": "2026-08-19T09:41:00Z",
  "total": { "amount": "49.90", "currency": "EUR" },
  "status": "placed"
}
```

Checks this example demonstrates:

- The schema carries no `$id`; its identity is
  `srn://acme/shop/checkout/payment/datamodel/order`, read off the path and
  asserted redundantly by `x-srn`.
- `../../../../../datamodel/base-record/schema.json` climbs five levels from the
  entity directory — `datamodel/`, `payment/`, `checkout/`, `shop/`, `acme/` —
  and lands on `solutions/acme/datamodel/base-record/schema.json`. Run
  `json-schema-to-typescript` on this file from a clone and it resolves; that is
  the whole point of the form.
- `positive-int` stays in `$defs` because it is trivial and single-entity;
  `money` was promoted to an entity because three models need it.
- The instance satisfies the flattened `required` union `["id", "created-at",
  "total"]`.
- The `money@1` pin lives in the frontmatter, not in the schema, because a path
  cannot carry a version.

## DataModel error classes

New, kind-specific:

| Code                   | Meaning                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `E_DM_SCHEMA_MISSING`  | Datamodel entity directory has no `schema.json`.                                                                     |
| `E_DM_SCHEMA_INVALID`  | `schema.json` is not valid against the 2020-12 meta-schema (or is not valid JSON).                                   |
| `E_DM_DIALECT`         | `$schema` missing or not exactly the 2020-12 dialect URI.                                                            |
| `E_DM_ID_FORBIDDEN`    | `$id` present anywhere in the document.                                                                              |
| `E_DM_SRN_MISMATCH`    | `x-srn` is versioned, malformed, or ≠ the SRN derived from the file's own path.                                      |
| `E_DM_KEYWORD`         | Forbidden keyword used (`$dynamicRef`, `$dynamicAnchor`, `$anchor`, `$vocabulary`).                                  |
| `E_DM_REF_TARGET`      | A `$ref` is not a relative path naming a `schema.json` (SRN, URL, absolute path, directory, `index.md`, an example). |
| `E_DM_REF_ESCAPE`      | A `$ref` normalizes to a path outside the `solutions/` catalog root.                                                 |
| `E_DM_FOREIGN_DEFS`    | `$ref` points into another entity's `$defs`.                                                                         |
| `E_DM_REF_KIND`        | A cross-entity `$ref` resolves to an entity whose `kind` is not `datamodel`.                                         |
| `E_DM_INHERIT_CYCLE`   | Cycle in the root-`allOf` inheritance graph.                                                                         |
| `E_DM_CLOSED_BASE`     | `"additionalProperties": false` on a schema used as an `allOf` base.                                                 |
| `E_DM_EXAMPLE_INVALID` | A file in `examples/` fails validation against the entity's own schema.                                              |
| `E_DM_NOT_ADDITIVE`    | Detectable instance-superset violation between version N (git) and N+1 (filesystem).                                 |
| `W_DM_ABSTRACT_USE`    | Abstract datamodel used as a payload/`exposes` target, or carrying `examples/`.                                      |
| `W_DM_UNION_TAG`       | `oneOf` union without a derivable shared `const` tag property.                                                       |
| `W_DM_CONTRADICTION`   | Derived model contradicts (rather than restricts) an inherited constraint.                                           |
| `W_DM_USAGE_MISMATCH`  | Model named as a protocol payload while declaring `usage: storage`.                                                  |

Retired with the move to path references — these codes have no subject any more
and MUST NOT be emitted:

- `E_DM_ID_INVALID` — there is no `$id` left to be invalid. A present `$id` is
  now `E_DM_ID_FORBIDDEN`.
- `W_DM_UNPINNED_REF` — a path `$ref` cannot be pinned, so it cannot be
  unpinned. Pins live in `relations` and are checked as ordinary SRNs.
- `E_VER_ID_MISMATCH` — defined in [evolution.md](../evolution.md) as "schema
  `$id` version ≠ frontmatter `version`". A `schema.json` now carries neither an
  `$id` nor a version, so the comparison has no operands; the code no longer
  applies to datamodels.

Reused from the core spec, unchanged: `E_SRN_SYNTAX`, `E_SRN_RESERVED`,
`E_SRN_CROSS_SOLUTION`, `E_SRN_DANGLING`, `E_SRN_VERSION` ([srn.md](../srn.md)) —
these govern the datamodel's SRN surfaces (`relations`, prose) and the
solution-boundary check on a resolved `$ref` path; `E_FM_EDGE_TARGET` for the
datamodel's own `relations` edges (rule V7 — a schema `$ref` is not a relation
edge and uses `E_DM_REF_KIND` instead); `E_FM_SCHEMA`, `E_FM_UNKNOWN_FIELD`,
`E_FM_NAME_MISMATCH`, `E_FM_KIND_LOCATION` ([frontmatter.md](../frontmatter.md));
`E_VER_REGRESSION`, `W_REF_DEPRECATED` ([evolution.md](../evolution.md));
`E_STRUCT_*` ([structure.md](../structure.md)).
All are enforced at portal build/load — there is no CLI in v1.
