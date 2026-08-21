---
kind: spec
name: datamodel
version: 7
status: review
title: DataModel kind
summary: The datamodel kind contract — schema.json in JSON Schema 2020-12, the required canonical $id and x-srn, $refs as canonical schema URLs, artifact addresses (.schema, examples.*) and the .schema normalization rule, deprecated as the standard lifecycle keyword, allOf inheritance, composition patterns, the portal schema registry, derived views, and schema-level additive evolution.
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

`schema.json` is the one artifact in the framework that does **not** spell
references as SRNs. Its `$id` and every cross-entity `$ref` are **canonical HTTP
URLs**, so that any standard validator or code generator can not merely parse
the reference but *dereference* it, knowing nothing about this framework
([below](#why-canonical-urls)). It states its SRN too, in `x-srn`, so identity
never has to be recovered by parsing a URL. Everything else a datamodel writes —
frontmatter `relations`, prose links — is ordinary SRN.

## Entity directory shape

A datamodel entity is a directory inside a `datamodel/` kind bucket:

```text
solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/
├── index.md          # REQUIRED — common frontmatter + kind fields + prose
├── schema.json       # REQUIRED — JSON Schema 2020-12, $id and $refs are schema URLs
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
  also what the portal's schema route looks for when serving an entity, so a
  renamed file is a 404 at every address that points at it.

  ```text
  datamodel/order/schema.json          # correct
  datamodel/order/order.schema.json    # WRONG — never prefix with the entity name
  datamodel/order/order.json           # WRONG — the sibling is named by role
  ```

- `examples/*.json` are OPTIONAL instance documents. Every file in `examples/`
  MUST validate against the entity's own `schema.json`
  (`E_DM_EXAMPLE_INVALID`). They are documentation the build keeps honest, and
  each is addressable as an artifact ([below](#artifact-addresses)).
- No other sibling is defined by this kind. Per
  [structure.md](../structure.md), an asset subdirectory MUST NOT contain an
  `index.md` at any depth (`E_STRUCT_NESTED_ENTITY`).

Placement is owner-scoped ([structure.md](../structure.md)): a datamodel lives
in the `datamodel/` bucket of the solution, product, or component **responsible**
for it. Scope is responsibility, not visibility — any entity in the solution may
reference any datamodel of that solution.

```text
solutions/acme/datamodel/money/                    # solution-wide vocabulary
solutions/acme/product/shop/datamodel/order-line/  # product-owned
solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/
                                                   # component-owned
```

## Artifact addresses

Both sibling files are addressable by SRN: a dot suffix on the **final** path
segment names an artifact of the entity, per the grammar and lexing rules in
[srn.md](../srn.md). The suffix vocabulary is a closed per-kind role table — a
spec constant exactly like the reserved-kind list, so SRN→path conversion needs
the spec and never a catalog read — and the dot is reserved out of the name
alphabet permanently, which is what keeps the split unambiguous. The datamodel
rows:

| Role              | File                   | Legal address whose file is absent                              |
| ----------------- | ---------------------- | --------------------------------------------------------------- |
| `schema`          | `schema.json`          | unreachable — `schema.json` is REQUIRED (`E_DM_SCHEMA_MISSING`) |
| `examples.<name>` | `examples/<name>.json` | `E_SRN_DANGLING` — `examples/` is OPTIONAL                      |

Any other suffix on a datamodel is `E_SRN_ARTIFACT`, decidable against this
table alone:

```text
srn://acme/datamodel/money.schema                # schema.json — normalizes to the entity (below)
srn://acme/datamodel/money.examples.canonical    # examples/canonical.json
srn://acme/datamodel/money.examples.canonical@2  # the same file, as snapshot @2 has it
srn://acme/datamodel/money@2.examples.canonical  # E_SRN_SYNTAX — artifact suffix precedes @version
srn://acme/datamodel/money.examples              # E_SRN_ARTIFACT — examples.* requires a name
srn://acme/datamodel/money.schema.json           # E_SRN_ARTIFACT — the role is "schema", not a filename
srn://acme/datamodel/money.sample.canonical      # E_SRN_ARTIFACT — no such role on this kind
srn://acme/datamodel/money.examples.retired      # E_SRN_DANGLING — legal role, no examples/retired.json
../money.schema                                  # E_SRN_SYNTAX — artifact suffixes bind to absolute and
                                                 # solution-absolute forms, never to ".." arithmetic
```

**An artifact has no version of its own.** `@N` in an artifact SRN is a
coordinate of the entity: `money.examples.canonical@2` is the
`examples/canonical.json` of snapshot `money@2`, resolved through the existing
version→commit index and a `git show` of that file at that commit
([evolution.md](../evolution.md)). The address is well-defined because within
one version number the only permitted mutation is frontmatter `status`, which
cannot touch a sibling file — artifact bytes are constant within a version, and
`E_VER_UNBUMPED` plus `metaframework check --since` enforce exactly that. The
same bytes answering at two coordinates is the same unremarkable situation as
one file's content at two git commits.

**Artifact SRNs are entity-surface-illegal.** A `relations` edge means an
entity: edges are typed over kinds, and an artifact has no kind. An edge target
carrying an artifact suffix is `E_FM_EDGE_TARGET`, with the suffix named as the
problem. In v1 an artifact SRN is legal in exactly two places — prose links in
`index.md`, and external consumers; growing that list later is additive.

```yaml
relations:
  uses:
    - /datamodel/money@1         # good — an entity, pinned
    - /datamodel/money.schema@1  # E_FM_EDGE_TARGET — an edge names an entity;
                                 # ".schema" addresses an artifact
```

`examples.<name>` is why the vocabulary exists on this kind at all: an example
is a validated instance document (`E_DM_EXAMPLE_INVALID`, above), so a
downstream test suite can pin
`srn://acme/datamodel/money.examples.canonical@2` and receive bytes the build
already validated against that same snapshot's schema.

### `.schema` normalizes to the entity

`.schema` is legal for vocabulary uniformity, and it is the one artifact
address that never mints a name. The schema document already has two, stated in
the file itself: the entity's SRN (`x-srn`) and the canonical schema URL
(`$id`). `.schema` therefore **normalizes to the entity**: its URL projection
*is* the entity's canonical schema URL, no `…/datamodel/order.schema` URL
exists on the canonical host, and the portal's `/artifacts` route answers a
`.schema` request with a permanent redirect to the existing `/schemas` route —
one URL serves each schema document, at identity and at retrieval alike.
Nothing in [Dialect and identity](#dialect-and-identity) moves: the `$id`,
`$ref` and `x-srn` contracts are untouched, and `schema_url_to_srn` stays
dot-rejecting, so a `$ref` written `…/datamodel/money.schema` is
`E_DM_REF_TARGET`, the message naming the offending URL as addressing an
artifact, not an entity ([below](#mapping-a-ref-back-to-an-srn)). This guards
the exact
defect the canonical-host constant kills: a second name for one schema is two
schemas in every registry keyed on `$id`.

No other role mints a URL either — canonical-host URLs exist for schema
documents only, so an example's names are its SRN and the `/artifacts` route
that serves it.

## Dialect and identity

Exactly one dialect: **JSON Schema draft 2020-12**. There is no second schema
language, no OpenAPI-flavoured subset, no proprietary extension layer.

A `schema.json` states its identity **twice**, in two spellings of one derived
fact: the root `$id` is the entity's canonical schema URL, and `x-srn` is the
entity's unversioned SRN. Both are REQUIRED, and both are checked against the
file's own directory at load, so neither can drift from the other or from disk.

```text
solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/schema.json
→ srn://acme/product/shop/component/checkout/component/payment/datamodel/order
→ https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/order
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/order",
  "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/order",
  "title": "Order",
  "type": "object"
}
```

The path after the host is the entity's SRN path verbatim, because SRN ≡ path ≡
URL path ([srn.md](../srn.md)) — [the consolidating
principle](../srn.md#the-consolidating-principle) in one artifact.

| Requirement                                                                   | Violation             |
|-------------------------------------------------------------------------------|-----------------------|
| `$schema` present and exactly `https://json-schema.org/draft/2020-12/schema`. | `E_DM_DIALECT`        |
| The document is valid against the 2020-12 meta-schema.                        | `E_DM_SCHEMA_INVALID` |
| Root `$id` present.                                                           | `E_DM_ID_MISSING`     |
| Root `$id` equals this entity's canonical schema URL, host included.          | `E_DM_ID_MISMATCH`    |
| No `$id` at any level **below** the root.                                     | `E_DM_ID_FORBIDDEN`   |
| `x-srn` present.                                                              | `E_DM_SRN_MISSING`    |
| `x-srn` equals the unversioned SRN of the directory the file sits in.         | `E_DM_SRN_MISMATCH`   |

Each of these is `E_DM_ID_MISMATCH` for
`solutions/acme/datamodel/money/schema.json`:

```json
{ "$id": "srn://acme/datamodel/money" }                                /* not a URL; nothing dereferences it     */
{ "$id": "https://schemas.metaframework.dev/acme/datamodel/money@1" }  /* a URL addresses the current schema     */
{ "$id": "https://acme.example/acme/datamodel/money" }                 /* the host is canonical, not free        */
{ "$id": "http://localhost:3000/schemas/acme/datamodel/money" }        /* that is where a portal serves it,
                                                                          not what it is — see below            */
{ "$id": "money.json" }                                                /* relative: no identity of its own       */
```

A **nested** `$id` remains forbidden outright (`E_DM_ID_FORBIDDEN`). It would
re-base every reference beneath it onto a second identity, which is how one
document quietly becomes two. Local shapes are addressed by `#/$defs` pointers,
which need no identity at all.

### The host is a canonical constant, not configuration

`https://schemas.metaframework.dev` is defined once, in
`framework/portal/src/lib/schema/url.ts` (`CANONICAL_SCHEMA_HOST`), and mirrored
in `scripts/migrate_schema_ids.py`. It is the same string on a developer's
laptop and in production, and it MUST NOT be made configurable.

**Identity must not vary between deployments.** Registries, caches, generated
client packages and `$ref` graphs all key on `$id`; two deployments that
disagree about a schema's identity hold two schemas where there is one, and the
disagreement surfaces as a resolution failure far from its cause. That is a
defect, not a configuration choice. A schema copied out of the catalog — pasted
into a validator, vendored into a client repo, attached to a ticket — keeps
meaning exactly what it meant.

**`SCHEMA_BASE_URL` is a different thing and still exists.** It controls where
*this* portal serves schemas — the `/schemas` route, `http://localhost:3000/schemas/…`
in dev — and nothing else. A serving address is a *retrieval* address; it MUST
NOT appear in `$id` or in any `$ref`, and a `$ref` that names one is
`E_DM_REF_TARGET` with the canonical replacement in the message.

In JSON Schema terms none of this is exotic: `$id` is an identifier, and
retrieval is a resolver's problem. A consumer that wants to fetch rather than
trust a cache maps the canonical host onto a serving address in its resolver
configuration — one line, outside the artifacts. The portal itself does exactly
that, resolving each canonical URL to a file on disk
([below](#the-schema-registry)).

```text
identity   https://schemas.metaframework.dev/acme/datamodel/money    # in the file, everywhere, always
retrieval  http://localhost:3000/schemas/acme/datamodel/money        # this deployment, this week
```

### `x-srn` — the SRN, stated

`x-srn` is REQUIRED and carries the entity's **unversioned** SRN. It is
validated at load against the file's actual path (`E_DM_SRN_MISSING`,
`E_DM_SRN_MISMATCH`), so it cannot drift.

It exists because without it the SRN vanishes from schema files entirely and
identity becomes implicit in a URL-parsing rule — "strip this host, prefix
`srn://`" — which a reader must know to apply. A schema lifted out of the
catalog must still say where it came from, in the framework's own vocabulary,
and `grep -r 'x-srn' ` must keep finding every schema by its catalog identity.

```json
{ "x-srn": "srn://acme/datamodel/money" }    /* correct                                        */
{ "x-srn": "srn://acme/datamodel/money@3" }  /* E_DM_SRN_MISMATCH — unversioned, always        */
{ "x-srn": "acme/datamodel/money" }          /* E_DM_SRN_MISMATCH — the scheme is part of it   */
```

`x-srn` and `$id` cannot disagree without a diagnostic: both are checked against
the same directory path, so they are two spellings of one derived fact rather
than two hand-maintained fields. Neither is trusted from the file — that is what
stops a wrong identity from becoming a wrong edge.

Other `x-*` keywords remain legal JSON Schema annotations; this framework
neither validates nor renders them.

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

A *nested* `$id` is forbidden too, but under its own code
(`E_DM_ID_FORBIDDEN`, above) — it is an identity rule, not a dialect-surface
restriction.

## References and inheritance

**Inheritance is stock `allOf` + `$ref`. There is no other mechanism.** No
`extends`, no `x-inherits`, no portal-side merge directive. A schema whose root
carries `allOf` branches that `$ref` other datamodels *is* a derived model; that
is the entire inheritance layer.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/order",
  "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/order",
  "type": "object",
  "allOf": [
    { "$ref": "https://schemas.metaframework.dev/acme/datamodel/base-record" },
    { "$ref": "https://schemas.metaframework.dev/acme/datamodel/auditable" }
  ],
  "properties": {
    "total": { "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" }
  }
}
```

### Why canonical URLs

The reference form here was chosen against measurements, not taste — twice. The
first answer (relative file paths, no `$id`) was measured against the wrong
question and replaced; the reasoning is recorded in
[docs/decision-record.md](../../../docs/decision-record.md) amendments
2026-08-19-b, 2026-08-19-c and 2026-08-19-d, and summarised here.

**The requirement is that a reference be *resolvable by any standard tool*.** A
relative path satisfies that only for a tool running inside a clone of this
repository, with the whole catalog on disk, invoked from the right directory.
Paste the schema into a validator, a browser playground, a generator in another
repository, or a CI job that fetched one file, and
`../../../../datamodel/money/schema.json` resolves to nothing. It is
*well-formed*, not resolvable.

An absolute URL is **dereferenceable**, which is what the requirement actually
asks. Measured with the portal running and a stock `json-schema-ref-parser`
handed nothing but a canonical `$id` — the exact string the artifact carries —
plus the one line of resolver config that maps the canonical host onto this
deployment's `/schemas` route. Every read entry point in `node:fs` and
`node:fs/promises` was replaced with a throw first, so the zero below is
enforced rather than observed:

```text
bundle("https://schemas.metaframework.dev/acme/…/datamodel/order")
  → 8 documents fetched, full transitive closure
  → 8 refs in the bundle, 0 of them leaving the document
  → filesystem reads: 0

bundle("https://schemas.metaframework.dev/brass/…/datamodel/tool-result")
  → 10 documents fetched, full transitive closure
  → 12 refs in the bundle, 0 of them leaving the document
  → filesystem reads: 0
```

Note what the resolver config is and is not. It is a *host→address* mapping,
one line, outside the artifacts — the ordinary JSON Schema arrangement where
`$id` identifies and retrieval is the resolver's problem. It is not knowledge of
this framework: the tool has never heard of SRNs, and the same mapping would
point at a CDN, a mirror, or a local checkout. The portal's own bundler is
exactly such a mapping, onto local files ([below](#the-schema-registry)).

The same tool, handed the same starting point under the relative-path form,
resolved nothing.

Two secondary gains, neither of them the reason. The reference no longer encodes
the referrer's depth, so moving an entity no longer rewrites every `$ref`
pointing out of it — the eight-`..` chains are gone. And `$id` restores a base
URI, so a schema copied out of the catalog still says what it is — which
`x-srn` then says again in the catalog's own vocabulary.

**Editor navigation is still unobtainable through reference syntax, so it is
still not a tiebreaker.** VS Code's `vscode-json-languageservice` produces
navigable links only for same-document JSON Pointers (`#/$defs/money`). Neither
relative paths nor URLs buy go-to-definition; only an editor extension or an LSP
would, for any syntax. The gap is known and an LSP is out of scope for v1.

### `$ref` is a canonical schema URL

Every `$ref` to **another** entity is that entity's canonical schema URL — the
same form as `$id`. There is no relative form, no `srn://`, no file path, no
serving address, and no depth arithmetic:

```json
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" }
```

The `$id` at the document root is the base URI, so a relative `$ref` *would*
resolve — and that is exactly why one form is mandated rather than two. Two
spellings of one edge means two things to grep for, two things to rewrite when
an entity moves, and a reader who must do arithmetic to know whether they are
the same edge. A relative `$ref` is `E_DM_REF_TARGET`, and the portal resolves it
against `$id` anyway so the diagnostic can name the URL that should have been
written.

Forms that are not a canonical schema URL:

```json
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" }
                                          /* correct                                            */
{ "$ref": "../money/schema.json" }        /* E_DM_REF_TARGET — the retired relative form        */
{ "$ref": "srn://acme/datamodel/money@1" }/* E_DM_REF_TARGET — no tool dereferences srn://       */
{ "$ref": "/acme/datamodel/money" }       /* E_DM_REF_TARGET — host-relative: identity is not
                                             portable out of the catalog                        */
{ "$ref": "http://localhost:3000/schemas/acme/datamodel/money" }
                                          /* E_DM_REF_TARGET — a serving address (SCHEMA_BASE_URL),
                                             not an identity; the diagnostic names the canonical
                                             URL to write instead                               */
{ "$ref": "https://elsewhere.example/acme/datamodel/money" }
                                          /* E_DM_REF_TARGET — every schema in every solution is
                                             identified on the one canonical host               */
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel" }
                                          /* E_DM_REF_TARGET — a kind bucket is not addressable */
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money@1" }
                                          /* E_DM_REF_TARGET — a URL carries no version pin     */
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money.schema" }
                                          /* E_DM_REF_TARGET — an artifact address; a schema's
                                             canonical URL is the entity's own                  */
{ "$ref": "https://schemas.metaframework.dev/globex/datamodel/money" }
                                          /* E_SRN_CROSS_SOLUTION — sealed universes            */
```

`E_DM_REF_ESCAPE` is **retired** and MUST NOT be emitted. It meant "on this
origin but outside `/schemas/`", which had a subject only while `$id` was a
serving address. The canonical host carries no route prefix — the whole host
*is* the entity namespace — so a path that is not an entity address is simply
`E_DM_REF_TARGET`.

The solution boundary is checked on the URL path, which begins with the solution
name — the same rule as everywhere else, now enforced without normalising
anything ([kinds/solution.md](solution.md)).

### Mapping a `$ref` back to an SRN

Every derived view is a graph of entities, so the portal converts each `$ref`
into the SRN of the entity that owns its target. Because the URL path *is* the
SRN path, the mapping is a rename:

```python
CANONICAL_SCHEMA_HOST = "https://schemas.metaframework.dev"   # a constant, not configuration

def schema_url_to_srn(url: str) -> str:
    prefix = CANONICAL_SCHEMA_HOST + "/"
    if not url.startswith(prefix):
        raise DmError("E_DM_REF_TARGET", f"{url} is not a canonical schema URL")
    path = url[len(prefix):]
    if "@" in path:
        raise DmError("E_DM_REF_TARGET", f"{url} carries a version pin")
    if "." in path.rsplit("/", 1)[-1]:
        raise DmError("E_DM_REF_TARGET", f"{url} addresses an artifact, not an entity")
    return "srn://" + path          # parse_srn then validates the grammar
```

```text
https://schemas.metaframework.dev/acme/datamodel/money   → srn://acme/datamodel/money
```

The result is **unversioned**, and the SRN it produces MUST parse and MUST
address an entity whose `kind` is `datamodel`. Only datamodels are registered, so
a URL naming anything else has no entry and is reported as `E_SRN_DANGLING`. The
concrete version of the edge is the target's current frontmatter `version`, read
from its `index.md`, never from the reference.

### A URL carries no version

**A `$ref` names an entity, never a version.** A URL addresses the *current*
schema, and a pin is rejected rather than ignored — silently answering with the
current schema for a reference that asked for `@1` is worse than refusing:

```json
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" }    /* the only legal form */
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money@1" }  /* E_DM_REF_TARGET     */
```

This is unchanged in substance from the path form: with git-backed history only
current versions exist on the filesystem ([evolution.md](../evolution.md)), so a
pinned historical reference never resolved to anything anyway.

Pinning remains fully available where it *is* resolvable — frontmatter
`relations`, which no external tool consumes:

```yaml
# index.md — where a version pin still means something
relations:
  uses:
    - /datamodel/money@1
```

Consequently `W_DM_UNPINNED_REF` stays retired: there is no pinned case, so
there is no unpinned one to warn about.

### Local JSON Pointers are unchanged

Fragments are the one reference form the interoperability argument does not
touch — they resolve inside the document, so every tool already handles them.

```json
{ "$ref": "#/$defs/positive-int" }   /* a shape defined in this document */
{ "$ref": "#" }                      /* this document's root — see Cycles below */
```

A pointer MAY be appended to a cross-entity reference only to address that
document's root — an empty fragment
(`https://schemas.metaframework.dev/acme/datamodel/money#`, redundant but
legal). Any deeper pointer into another document is `E_DM_FOREIGN_DEFS`, below.

### `$defs` are entity-private

A `$ref` MUST NOT point into another entity's `$defs` (`E_DM_FOREIGN_DEFS`).
`$defs` is local scratch space; the moment a shape needs to be shared it is
promoted to its own datamodel entity (see below). This keeps the reference graph
a graph of entities, not of anonymous document fragments.

```json
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money" }
                                        /* correct — entity reference   */
{ "$ref": "https://schemas.metaframework.dev/acme/datamodel/money#/$defs/currency" }
                                        /* E_DM_FOREIGN_DEFS            */
{ "$ref": "#/$defs/currency" }          /* correct — own document       */
```

### Cycles

Recursion **through properties or items** is legal and useful (a tree node, a
linked comment). Self-recursion is the empty pointer `#`, which is the current
document's root:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/datamodel/category",
  "x-srn": "srn://acme/product/shop/datamodel/category",
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
order     allOf → invoice        # …/schemas/acme/product/shop/datamodel/invoice
invoice   allOf → order          # …/schemas/acme/product/shop/datamodel/order — E_DM_INHERIT_CYCLE
```

## Composition patterns

### Abstract base models

A base model factors properties shared by several concrete models. Mark it
`abstract: true` in the frontmatter: it is never instantiated on its own, so it
is never a storage row nor a wire payload.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/datamodel/base-record",
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
{ "$id": "https://schemas.metaframework.dev/acme/datamodel/base-record", "additionalProperties": false }
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
  "$id": "https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/order",
  "allOf": [
    { "$ref": "https://schemas.metaframework.dev/acme/datamodel/base-record" },
    { "$ref": "https://schemas.metaframework.dev/acme/datamodel/auditable" }
  ]
}
```

The first branch contributes identity and timestamps; the second is the mixin
(`changed-by`, `change-reason`). Both are solution-level vocabulary, and both
are addressed exactly as a sibling would be: the reference says *what* the base
is, never how far away it sits.

Mixins are datamodel entities like any other, `abstract: true`. The portal draws
them in the inheritance tree with a dashed edge only as a rendering hint — there
is no `mixin` flag, because there is no mechanical difference.

### Discriminated unions

A union is `oneOf` over branches, each branch tagged by a `const` property with
the same name in every branch:

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

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/datamodel/card-payment",
  "x-srn": "srn://acme/product/shop/datamodel/card-payment",
  "type": "object",
  "properties": {
    "method": { "const": "card" },
    "pan-last4": { "type": "string" }
  },
  "required": ["method", "pan-last4"]
}
```

Both branches are siblings of the union in the same `datamodel/` bucket, which
the URL states rather than implies — the shared prefix is the shared owner.

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
  "$id": "https://schemas.metaframework.dev/acme/product/shop/datamodel/order-line",
  "x-srn": "srn://acme/product/shop/datamodel/order-line",
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
entity at `version: 1`, replace `#/$defs/x` with a `$ref` to its schema URL, bump
the promoting entity's `version`. The instance shape is unchanged, so the
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
`schema-srn` (the path already says it, and the schema states it itself as
`x-srn`), `primary-key`/`identity` (belongs in the schema, and storage identity
is the component's concern), `storage-engine` (an environment/component property,
not the model's), `classification`/`pii` (use `tags` until there is a rule that
acts on it). The rule of thumb: a kind field must change portal behaviour or be
unrecoverable from the artifacts.

**Do not mirror schema references in `relations`.** Schema `$ref` edges are
derived from `schema.json` itself, exactly as inverse edges are derived from
forward edges. Restating each of them under `relations.uses` is double
bookkeeping and drifts.

The one thing the schema can no longer say is a **version**: `$ref` is a URL for
the current schema, and a `@N` in one is rejected outright. A pinned `uses` edge is therefore not duplication — it
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
    - /datamodel/money@1      # good — pins a version the URL $ref cannot carry
    - /datamodel/base-record  # redundant — unpinned, and schema.json already $refs it
```

## The schema registry

The portal loads every schema into one validator registry so that **stock** JSON
Schema validation resolves every `$ref` with no custom resolver. That was the
goal before and it still is; what changed is that the key is now the document's
own `$id`, which is the identity a stock tool reads out of the file anyway — so
the portal's resolution and an outside consumer's resolution are the same
operation on the same identifiers.

**The portal never fetches these URLs.** It already holds the files, and SSR
must not depend on network access at render or build time. This is the ordinary
resolver mapping described [above](#the-host-is-a-canonical-constant-not-configuration),
performed against local files instead of a remote host: identity comes out of
the artifact, retrieval is the resolver's problem, and here the resolver is a
filesystem read.

Load sequence:

1. Glob `solutions/**/datamodel/*/schema.json`, parse, and validate each against
   the 2020-12 meta-schema (`E_DM_SCHEMA_INVALID`).
2. Compute each entity's canonical schema URL from its path and the canonical
   host, and require the document's root `$id` to equal it (`E_DM_ID_MISSING`,
   `E_DM_ID_MISMATCH`). Identity is *derived and checked*, never trusted from the
   file — that is what stops a wrong `$id` from becoming a wrong edge.
3. Require `x-srn` to equal the entity's unversioned SRN, derived from the same
   path (`E_DM_SRN_MISSING`, `E_DM_SRN_MISMATCH`), and reject any nested `$id`
   (`E_DM_ID_FORBIDDEN`).
4. Register each document under that URL. Because it is also the document's
   `$id`, every `$ref` resolves out of the in-memory registry by ordinary RFC
   3986 rules, with no resolver and no network.
5. Walk every `$ref`. Fragments resolve inside their own document. Every other
   ref MUST be a canonical schema URL (`E_DM_REF_TARGET`), stay inside the
   referring solution (`E_SRN_CROSS_SOLUTION`), and name a registered datamodel
   (`E_SRN_DANGLING`).
6. Map each `$ref` URL to the owning entity's SRN and record the edge
   `from-srn → to-srn`. Edge SRNs are computed from URL paths, never read out of
   the documents — `x-srn` is self-identification, checked in step 3, and is
   never consulted as a referrer.
7. Compile. Validating an instance is a lookup by schema URL — or by SRN through
   the map built in step 6 — and nothing framework-specific happens at
   validation time.

```javascript
// illustrative, ajv 2020-12
for (const { srn, doc } of schemas) {
  // The key is computed from the entity, and step 2 has already asserted that
  // doc.$id equals it — so this is the document's own identity, verified rather
  // than taken on trust.
  ajv.addSchema(doc, srnToSchemaUrl(srn));
}

const order =
  "srn://acme/product/shop/component/checkout/component/payment/datamodel/order";
const validate = ajv.getSchema(srnToSchemaUrl(order));
// → "https://schemas.metaframework.dev/acme/product/shop/component/checkout/…"
```

There is no version-keyed registration and no unversioned alias: a `$ref` carries
no version, so there is exactly one key per document and nothing to alias.

Historical snapshots are read from git for the version history view
([evolution.md](../evolution.md)) and for the additive diff below. A snapshot is
loaded into a registry scoped to **that commit's tree**, and the URLs inside it
are resolved against the documents of that same commit — never against the
working tree, and never over the network. Working-tree schemas and historical
schemas are never mixed in one registry.

Resolution failures:

| Situation                                                                               | Error                                   |
|-----------------------------------------------------------------------------------------|-----------------------------------------|
| `$ref` is not a canonical schema URL (relative, SRN, serving address, foreign host).    | `E_DM_REF_TARGET`                       |
| `$ref` path is not a legal entity address, or carries a version pin or artifact suffix. | `E_DM_REF_TARGET`                       |
| `$ref` lands inside another solution.                                                   | `E_SRN_CROSS_SOLUTION`                  |
| Target names no registered datamodel (absent, or not a datamodel).                      | `E_SRN_DANGLING`                        |
| `$ref` points into another document's `$defs`.                                          | `E_DM_FOREIGN_DEFS`                     |
| Root `$id` missing, or ≠ the entity's canonical schema URL.                             | `E_DM_ID_MISSING`, `E_DM_ID_MISMATCH`   |
| `x-srn` missing, or ≠ the entity's unversioned SRN.                                     | `E_DM_SRN_MISSING`, `E_DM_SRN_MISMATCH` |

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
URLs (`schema_url_to_srn`, above). Authors write URLs because tools dereference
them; readers see SRNs because that is the catalog's vocabulary.

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

## `deprecated` — the standard lifecycle keyword

`deprecated` is a **standard JSON Schema 2020-12 keyword**, defined in the
meta-data vocabulary alongside `title`, `description`, `default`, `examples`,
`readOnly` and `writeOnly`
(`https://json-schema.org/draft/2020-12/meta/meta-data`; verify against
`node_modules/ajv/dist/refs/json-schema-2020-12/meta/meta-data.json`). No
framework extension is defined or wanted here: this is the one lifecycle signal
stock tooling already understands, and code generators emit `@deprecated` from
it.

It is an **annotation**. It asserts nothing and rejects no instance, so setting
it is always an additive edit.

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
deprecated` in the frontmatter **alone** does not bump ([evolution.md](../evolution.md)) —
but adding `"deprecated": true` to `schema.json` in the same commit does,
because a sibling artifact changed. Do both in one commit and bump once.

The keyword does not replace the swap; it **announces** one. The successor
entity, the `supersedes` edge and the referrer migration are still the mechanism
([evolution.md](../evolution.md)). A schema marked `deprecated` with no successor
and no `supersedes` edge pointing at it is a review finding, not a completed
retirement.

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
| Add an optional property: `"discount": { "$ref": "…/acme/datamodel/money" }`             | Add a name to `required`: `required: ["id"] → ["id", "discount"]`       |
| Widen a type: `"type": "string"` → `"type": ["string", "null"]`                          | Narrow a type: `["string", "null"]` → `"string"`                        |
| Add an enum value: `["placed","paid"]` → `["placed","paid","refunded"]`                  | Remove an enum value: `["placed","paid"]` → `["paid"]`                  |
| Relax a bound: `"maxLength": 64` → `256`; `"minimum": 1` → `0`                           | Tighten a bound: `"maxLength": 256` → `64`; `"minItems": 0` → `1`       |
| Remove a name from `required` (loosens; rarely wise, still additive)                     | Remove or rename a property: drop `status`; `total` → `amount`          |
| Add a `oneOf` branch with a new `const` tag: `{ "$ref": "…/datamodel/sepa-payment" }`    | Remove a `oneOf` branch, or reuse an existing tag value for a new shape |
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

The retargeting check compares **target URLs**, which is now a literal string
comparison: a URL does not encode the referrer's position, so moving the
referring entity changes no reference it makes and there is nothing to
normalize.

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
└── product/shop/component/checkout/component/payment/
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
  "$id": "https://schemas.metaframework.dev/acme/datamodel/base-record",
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

### `solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/index.md`

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
    - /datamodel/money@1    # the version pin the schema's URL $ref cannot carry
tags:
  - commerce
  - aggregate
x-jira-epic: SHOP-142
---

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

### `solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/product/shop/component/checkout/component/payment/datamodel/order",
  "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/order",
  "title": "Order",
  "type": "object",
  "allOf": [
    { "$ref": "https://schemas.metaframework.dev/acme/datamodel/base-record" }
  ],
  "properties": {
    "total": {
      "$ref": "https://schemas.metaframework.dev/acme/datamodel/money",
      "description": "Gross amount payable."
    },
    "discount": {
      "$ref": "https://schemas.metaframework.dev/acme/datamodel/money",
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

### `solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/examples/minimal.json`

```json
{
  "id": "0f6f0f2a-1a6b-4a0e-9c3a-6a2f4a0c1d55",
  "created-at": "2026-08-19T09:41:00Z",
  "total": { "amount": "49.90", "currency": "EUR" },
  "status": "placed"
}
```

Checks this example demonstrates:

- The schema's identity is stated twice and derived once. `$id` is the canonical
  URL; `x-srn` is
  `srn://acme/product/shop/component/checkout/component/payment/datamodel/order`
  — the same string with a different prefix, and the same string again as the
  directory it sits in. Both are checked against that directory, so a copy of
  this file taken anywhere still says what it is, in both vocabularies.
- The base reference names *what* the base is, not how far away it sits. It is
  the same nine-segment URL whether the referring entity is one level below the
  solution or four — moving `order` would not touch it. Point
  `json-schema-to-typescript` at the `$id` of this file, with the canonical host
  mapped to any address that serves the catalog, and it resolves; that is the
  whole point of the form.
- `positive-int` stays in `$defs` because it is trivial and single-entity;
  `money` was promoted to an entity because three models need it.
- The instance satisfies the flattened `required` union `["id", "created-at",
  "total"]`.
- The `money@1` pin lives in the frontmatter, not in the schema, because a URL
  addresses the current schema and a pin in one is rejected.

## DataModel error classes

New, kind-specific:

| Code                   | Meaning                                                                                                                            |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| `E_DM_SCHEMA_MISSING`  | Datamodel entity directory has no `schema.json`.                                                                                   |
| `E_DM_SCHEMA_INVALID`  | `schema.json` is not valid against the 2020-12 meta-schema (or is not valid JSON).                                                 |
| `E_DM_DIALECT`         | `$schema` missing or not exactly the 2020-12 dialect URI.                                                                          |
| `E_DM_ID_MISSING`      | Root `$id` absent — every document must state its identity.                                                                        |
| `E_DM_ID_MISMATCH`     | Root `$id` ≠ the entity's canonical schema URL (wrong entity, wrong host, a serving address, or a version pin).                    |
| `E_DM_ID_FORBIDDEN`    | `$id` present *below* the root, where it would re-base every `$ref` beneath it.                                                    |
| `E_DM_SRN_MISSING`     | `x-srn` absent — the SRN must survive a schema leaving the catalog.                                                                |
| `E_DM_SRN_MISMATCH`    | `x-srn` ≠ the unversioned SRN of the entity directory the file sits in (a `@N` pin included).                                      |
| `E_DM_KEYWORD`         | Forbidden keyword used (`$dynamicRef`, `$dynamicAnchor`, `$anchor`, `$vocabulary`).                                                |
| `E_DM_REF_TARGET`      | A `$ref` is not a canonical schema URL (relative path, SRN, serving address, foreign host, bucket, version pin, artifact address). |
| `E_DM_FOREIGN_DEFS`    | `$ref` points into another entity's `$defs`.                                                                                       |
| `E_DM_INHERIT_CYCLE`   | Cycle in the root-`allOf` inheritance graph.                                                                                       |
| `E_DM_CLOSED_BASE`     | `"additionalProperties": false` on a schema used as an `allOf` base.                                                               |
| `E_DM_EXAMPLE_INVALID` | A file in `examples/` fails validation against the entity's own schema.                                                            |
| `E_DM_NOT_ADDITIVE`    | Detectable instance-superset violation between version N (git) and N+1 (filesystem).                                               |
| `W_DM_ABSTRACT_USE`    | Abstract datamodel used as a payload/`exposes` target, or carrying `examples/`.                                                    |
| `W_DM_UNION_TAG`       | `oneOf` union without a derivable shared `const` tag property.                                                                     |
| `W_DM_CONTRADICTION`   | Derived model contradicts (rather than restricts) an inherited constraint.                                                         |
| `W_DM_USAGE_MISMATCH`  | Model named as a protocol payload while declaring `usage: storage`.                                                                |

Retired, in three waves. These codes have no subject any more and MUST NOT be
emitted:

- `E_DM_SRN_RETIRED` — it flagged a *present* `x-srn` during the window when the
  annotation was retired (2026-08-19-c). `x-srn` is required again as of
  2026-08-19-d: absence is `E_DM_SRN_MISSING`, disagreement `E_DM_SRN_MISMATCH`.
- `E_DM_REF_ESCAPE` — it meant "on this origin but outside `/schemas/`", which
  had a subject only while `$id` was a serving address (2026-08-19-c). The
  canonical host carries no route prefix, so a bad path is `E_DM_REF_TARGET`.
- `E_DM_REF_KIND` — the registry holds only datamodels, so a URL naming any
  other kind simply has no entry and is `E_SRN_DANGLING`. There is no separate
  kind check to fail.
- `E_DM_ID_INVALID` — superseded by `E_DM_ID_MISSING` / `E_DM_ID_MISMATCH`,
  which say *how* the identity is wrong.
- `W_DM_UNPINNED_REF` — a `$ref` cannot be pinned, so it cannot be unpinned.
  Pins live in `relations` and are checked as ordinary SRNs (2026-08-19-b).
- `E_VER_ID_MISMATCH` — formerly "schema `$id` version ≠ frontmatter `version`".
  A `$id` carries no version, so the comparison still has no operands.
  [evolution.md](../evolution.md) retires the code outright; it is listed here
  because a datamodel was its only subject.

Reused from the core spec, unchanged: `E_SRN_SYNTAX`, `E_SRN_RESERVED`,
`E_SRN_CROSS_SOLUTION`, `E_SRN_DANGLING`, `E_SRN_ARTIFACT`, `E_SRN_VERSION`
([srn.md](../srn.md)) — these govern the datamodel's SRN surfaces (`relations`,
prose, artifact addresses) and the solution-boundary and existence checks on a
`$ref` URL; `E_FM_EDGE_TARGET` for the datamodel's own `relations` edges (a
schema `$ref` is not a relation edge, and an artifact SRN is not a legal edge
target — [above](#artifact-addresses));
`E_FM_SCHEMA`, `E_FM_UNKNOWN_FIELD`, `E_FM_NAME_MISMATCH`, `E_FM_KIND_LOCATION`
([frontmatter.md](../frontmatter.md)); `E_VER_REGRESSION`, `W_REF_DEPRECATED`
([evolution.md](../evolution.md)); `E_STRUCT_*`
([structure.md](../structure.md)).
All are enforced by the catalog loader, which `metaframework check` runs.
