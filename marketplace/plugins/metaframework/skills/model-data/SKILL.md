---
name: model-data
description: This skill should be used when the user asks to "add a datamodel", "model this order/cart/invoice in the catalog", "create a schema.json", "add a JSON Schema entity", "write an abstract base model", "add a mixin", "build a discriminated union", "promote a $defs shape to its own datamodel", "extract a shared type", "where should this shared model live", "pick usage storage or exchange", "what should the $id be", or asks whether a schema edit is additive or needs a swap — in a metaframework solution catalog under `solutions/`. It owns the `datamodel` kind only — use `add-entity` for a product, component, actor, environment, ADR or requirement, and `protocol-design` for a protocol (a payload datamodel comes back here). For rewriting an EXISTING published schema, decide the mechanism with `evolve-entity` first.
---

# Authoring a datamodel

A datamodel is a directory holding `index.md` (prose and frontmatter) and
`schema.json` (JSON Schema 2020-12). The schema states the shape; the prose
states what the schema cannot. It is the only kind whose contract surface is
fully machine-checked, which means most mistakes here are caught — and the
handful that are not are the expensive ones.

## Where the rules live — do not restate them here

| Need                                                            | Read                                                              |
|-----------------------------------------------------------------|-------------------------------------------------------------------|
| Schema conventions, error codes, the additive/swap keyword table | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/schemas.md`      |
| Placement, artifact filenames, `examples/`                       | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/structure.md`    |
| Common + per-kind frontmatter, relation edges                    | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/frontmatter.md`  |
| The consolidating principle, reference syntax, the `..` arithmetic | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/srn.md`         |
| Version bumps, the swap procedure                                | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/evolution.md`    |

**When `framework/spec/` is present in the repository it is authoritative and
wins over the bundled copies** — read `framework/spec/kinds/datamodel.md` first
in that case. The bundle exists because an installed plugin cannot see the repo.

**The retired convention, so you recognise it.** An earlier revision had
`schema.json` carry **no `$id`** and reach its neighbours by **relative file
path** (`../../../../datamodel/order-line/schema.json`). It was retired because
such a reference is not dereferenceable: it resolves only for a tool running
inside a clone of the repo with the whole catalog on disk. Every `schema.json`
under `solutions/` was migrated off it, but **prose was not, and nothing checks
prose against the artifact beside it** — a paragraph describing the old form
passes a green catalog check indefinitely, and the acme fixture carried exactly
such a paragraph for four versions of one datamodel. Read the sibling
`schema.json`, never the prose, when you want to know what the convention is;
never author the retired form, and never copy prose that explains it. The grep
that finds surviving cases, with the hits that are legitimate history, is in
`validate-catalog`'s `references/diagnostics.md` §4.

## Procedure

Do these in order. Steps 1–3 are decisions; reversing one after the files exist
costs a swap, not an edit.

1. **Decide the owner** — which container's `datamodel/` bucket this belongs in.
2. **Decide `usage` and `abstract`.**
3. **Decide the composition shape** — standalone, `allOf` base, `oneOf` union,
   or a `$defs` local shape.
4. **Compute the `$id` and `x-srn`** mechanically from the directory path.
5. **Write `schema.json`**: `$schema`, `$id`, `x-srn`, `title`, composition
   (`allOf` / `oneOf`), own `properties`, `required`, `$defs` last.
6. **Write `index.md`**: frontmatter, then prose stating the invariants the
   schema cannot express and why the shape is what it is.
7. **Add `examples/*.json`** — concrete models only.
8. **Run the catalog check** and report the result.

### 1. Owner scope is responsibility, not visibility

Any entity in the solution may reference any datamodel of that solution, so
"who needs to see it" is never the question. Ask **who is asked to approve a
change to it**:

| Signal                                                        | Bucket                             |
|---------------------------------------------------------------|------------------------------------|
| One component writes it and owns its meaning                  | that component's `datamodel/`      |
| Several components of one product share it                    | that product's `datamodel/`        |
| Two products, or the solution's vocabulary, depend on it      | the solution's `datamodel/`        |

Solution level is not the safe default. It makes every change a solution-wide
review. In the acme fixture `base-record`, `money` and `auditable` are
solution-level because fifteen, twelve and six datamodels spread across every
product `$ref` them, and `problem` is there because six protocols in five
products name it as their failure payload — a model can earn the root through
the protocol graph without a single schema `$ref` pointing at it. In contrast
`payment-method` sits in the shop product
because exactly two shop datamodels use it. Recount before promoting; do not
trust these numbers, which drift as the fixture grows:

```bash
grep -rho 'https://schemas\.metaframework\.dev/[a-z0-9/-]*' \
  --include='schema.json' solutions/ | sort | uniq -c | sort -rn
```

An entity is never moved once it exists (`evolution.md`) — getting the bucket
wrong costs a swap. Decide before creating the directory.

### 2. `usage` and `abstract`

`usage` is required and has no default, because it cannot be inferred: a model
with no protocol reference today may be pure storage or an exchange model whose
protocol is not written yet.

| Value      | Means                                                              | Fixture archetype                        |
|------------|--------------------------------------------------------------------|------------------------------------------|
| `storage`  | Persisted; this shape never crosses a boundary.                    | —                                        |
| `exchange` | Exists only in flight — request, response, or event body.          | `order-request` ("never persisted in this shape") |
| `both`     | The same shape is persisted *and* published.                       | `order` — the aggregate and the settlement payload |

`both` is not a hedge. It widens the review surface: an additive change then
needs both a migration plan and a producer/consumer rollout order. Declare the
narrower value and widen it when the second use actually appears — `usage` is
frontmatter metadata, so widening it is an ordinary `version` bump. Declaring
`storage` on a model a protocol names as a payload is `W_DM_USAGE_MISMATCH`, so
the value is a checked claim, not a label.

Set `abstract: true` **only** for a model that is never instantiated on its own
— a base or a mixin. It is not a way to say "nothing uses it yet". An abstract
model is excluded from the store/exchange views, MUST NOT carry `examples/`, and
raises `W_DM_ABSTRACT_USE` when a protocol payload or an `exposes` edge points
at it. Using one as an `allOf` base is the intended use and is never flagged.

### 3. Pick the composition shape

| Situation                                                        | Shape                                                              |
|-------------------------------------------------------------------|--------------------------------------------------------------------|
| Two or more concrete models share identity/lifecycle properties  | An `abstract: true` base; each derives via root-level `allOf` + `$ref` |
| A cross-cutting property set with no identity of its own         | The same mechanism. "Mixin" is a word, not a flag — order in `allOf` is irrelevant |
| One field holds one of several alternative shapes                | `oneOf` over `$ref`s to concrete sibling entities, each tagged by a shared `const` property |
| A shape repeats inside **one** document only                     | `$defs` + `#/$defs/name`                                            |
| …and a second entity now needs that shape                        | **Promote it** to its own datamodel entity                          |

Inheritance is stock `allOf` + `$ref` and nothing else — there is no `extends`,
no `x-inherits`, no portal-side merge. A schema whose root carries `allOf`
branches that `$ref` other datamodels *is* a derived model.

**Do not pre-promote.** Keep a shape in `$defs` while all of these hold: one
entity, structurally trivial, no independent meaning, no separate lifecycle.
`positive-int` stays; `money` was promoted the moment a second entity needed it.
The full promotion trigger table is in `schemas.md`. Promotion is additive on the
promoting entity — add the new datamodel at `version: 1`, replace `#/$defs/x`
with a `$ref` to its schema URL, bump the promoting entity's `version`. The
instance shape does not change, so no swap.

For a union, the portal derives a variant map **only** if every branch is an
object schema, every branch declares the same tag property, each tag is a
distinct `const`, and the tag is in each branch's `required`. Anything less
still validates but renders as an opaque blob (`W_DM_UNION_TAG`).

### 4. Compute `$id` and `x-srn` — never hand-type either

Both are the same fact in two spellings, and both fall out of the directory path:

```text
solutions/acme/product/shop/datamodel/order-line/schema.json
          └────────────────────────────────────┘
          strip "solutions/" and "/schema.json" — what is left is the SRN path

$id   = "https://schemas.metaframework.dev/" + acme/product/shop/datamodel/order-line
x-srn = "srn://"                             + acme/product/shop/datamodel/order-line
```

> **The SRN is the identity. The schema URL is its dereferenceable projection.
> The disk path is its storage. All three are mechanically inter-convertible,
> and none of them is a second addressing scheme.**

**The host is a stable canonical constant.** `https://schemas.metaframework.dev`
is defined once, in the portal's schema URL helper, and reads the same on a
laptop and in production. It is deliberately **not** an environment variable:
registries and caches key on `$id`, so two deployments disagreeing about a
schema's identity is a defect, not a configuration.

**`SCHEMA_BASE_URL` is a different thing and must not leak into a file.** It
controls where the portal *serves* schemas — the `/schemas` route,
`http://localhost:3000/schemas/…` in dev. Serving address, not identity. An `$id`
or `$ref` carrying it is `E_DM_ID_MISMATCH` / `E_DM_REF_TARGET`.

**`x-srn` is required** and carries the **unversioned** SRN. It is checked
against the file's real path at load, so it cannot drift. It earns its place
because without it the SRN disappears from schema files entirely and identity
becomes implicit in a URL-parsing rule — a schema pasted into a validator or
vendored into a client repo must still say where it came from.

Verify what was written rather than eyeballing it:

```bash
python3 - <<'PY'
import json, pathlib
HOST = "https://schemas.metaframework.dev"
for s in sorted(pathlib.Path("solutions").glob("**/datamodel/*/schema.json")):
    path = s.parent.relative_to("solutions").as_posix()
    doc = json.loads(s.read_text())
    for key, want in (("$id", f"{HOST}/{path}"), ("x-srn", f"srn://{path}")):
        got = doc.get(key)
        if got != want:
            print(f"{s}\n  {key}: want {want}\n  {' ' * len(key)}  got  {got}")
PY
```

Why URLs at all: a stock tool — `ajv`, `json-schema-to-typescript`, `quicktype`,
`json-schema-ref-parser` — given only the `$id` can walk the whole transitive
closure, knowing nothing about this framework. A relative file path resolved only
inside a clone of the repo, invoked from the right directory. That is the whole
reason for the form; the fact that references stop encoding the referrer's depth
is a side benefit, not the argument.

### 5–7. Write the files

Skeleton — every keyword here is load-bearing:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/acme/<srn-path>",
  "x-srn": "srn://acme/<srn-path>",
  "title": "…",
  "type": "object",
  "allOf": [ { "$ref": "https://schemas.metaframework.dev/acme/datamodel/base-record" } ],
  "properties": { "x": { "$ref": "#/$defs/positive-int" } },
  "required": [ "x" ],
  "$defs": { "positive-int": { "type": "integer", "minimum": 1 } }
}
```

Prose in `index.md` earns its place by carrying what JSON Schema cannot: ordering
invariants, cross-field constraints, why a representation was chosen, and the
version history in words. Link with full `srn://…` form; prose links may pin.

## Traps

- **A base MUST NOT close itself.** `"additionalProperties": false` on anything
  used as an `allOf` base is `E_DM_CLOSED_BASE` — `allOf` branches evaluate
  independently, so a closed base rejects every property the derived model adds.
  Leave `additionalProperties` unset on concrete models too: consumers must
  tolerate unknown properties from later versions.
- **Adding an `allOf` branch to a base that declares `required` is a tightening,
  not an addition.** `required` is the union across branches. Pulling
  `base-record` (`required: [id, created-at]`) into an existing concrete model
  invalidates every stored instance — that is a swap.
- **A `$ref` names an entity, never a version.** `…/money@1` is
  `E_DM_REF_TARGET`. Pins live in `relations.uses` (`/datamodel/money@1`), the
  only surface where they resolve.
- **Do not mirror `$ref` edges under `relations.uses`.** The portal derives the
  reference graph and the inheritance tree from `schema.json`. Reserve `uses` on
  a datamodel for what the schema cannot say — chiefly a version pin.
- **`$defs` are entity-private.** A `$ref` into another entity's `$defs` is
  `E_DM_FOREIGN_DEFS`. That prohibition is what forces promotion.
- **No `$id` below the root** (`E_DM_ID_FORBIDDEN`) — it re-bases every
  reference beneath it, and one document quietly becomes two. The root `$id` is
  required (`E_DM_ID_MISSING`) and must be the canonical URL
  (`E_DM_ID_MISMATCH`).
- **`x-srn` is required** (`E_DM_SRN_MISSING`) and must equal the unversioned SRN
  of the directory the file sits in (`E_DM_SRN_MISMATCH`). It is not a leftover
  of an older convention — it is checked against the path, so it is the one field
  that keeps identity legible when a schema leaves the catalog.
- **Forbidden keywords** (`E_DM_KEYWORD`): `$dynamicRef` and `$dynamicAnchor`
  make the inheritance graph late-bound, so the portal cannot derive it
  statically; `$anchor` is a second, ungreppable way to address a local shape;
  `$vocabulary` authors a dialect, and the dialect is fixed.
- **Every file in `examples/` must validate against the *flattened* schema** —
  including `required` inherited through `allOf` (`E_DM_EXAMPLE_INVALID`).
- **Any edit to any file in the entity directory bumps `version`** — schema-only
  and examples-only edits included. Only a `status`-alone change is exempt.
- **Renaming a property is never additive**, at any version number. Add the new
  one as optional, mark the old `"deprecated": true`, let them coexist.
  `deprecated` is a standard JSON Schema 2020-12 meta-data annotation — it
  asserts nothing and rejects no instance, so setting it is always additive, and
  stock generators turn it into `@deprecated`. Set it at the **root** too when
  the entity's `status` becomes `deprecated`: the frontmatter tells the portal,
  the keyword tells everyone who only ever sees `schema.json` (`schemas.md`).

## Additive in place, or a swap?

The test is mechanical: **version N+1 MUST accept every instance version N
accepted.** The full keyword table is in `schemas.md`. Four rows are the ones
authors get wrong:

| Edit                                              | Looks like | Actually            |
|---------------------------------------------------|------------|---------------------|
| Add an `allOf` `$ref` to a base with `required`   | addition   | tightening → swap   |
| Add or tighten a `pattern`                        | doc polish | tightening → swap   |
| Set `"additionalProperties": false`               | hygiene    | tightening → swap   |
| A `$ref` target evolves additively                | a change here | no edit, no bump — the obligation sits with the target |

`E_DM_NOT_ADDITIVE` covers only the decidable subset; a clean build is evidence,
not proof. Semantic breaks — same name, same type, new meaning — are invisible
to any checker and are caught in review.

## Worked pair

`references/worked-pair.md` reproduces an abstract base and a model derived from
it — `solutions/acme/datamodel/base-record/` and
`.../component/payment/datamodel/order/` — verbatim: both `index.md`
frontmatters, both `schema.json` files, one `examples/` document, and an audit
of the pair against every rule above. It exercises two `allOf` branches, a
union-typed property, an array of another entity, one private `$defs` shape, and
the flattened-`required` rule that makes the example valid. Read it before
writing a datamodel for the first time.

The tagged-union reference implementation is a second pair:
`solutions/acme/product/shop/datamodel/payment-method/` is a bare `oneOf` of two
`$ref`s, each branch a concrete sibling (`card-payment`, `sepa-payment`)
declaring `"method": { "const": … }` inside its `required`.

## Finish

Every run that writes files ends here:

```bash
metaframework check
```

`npm install -g @bershadsky/metaframework`, or `npx @bershadsky/metaframework
check` with nothing installed. It walks **up** from the working directory for a
`solutions/` directory holding at least one `<name>/index.md`, the way git finds
`.git`, so there is no directory to be in first; `--dir <path>` or `CATALOG_DIR`
overrides the search. The catalog does not have to live in the framework
monorepo — a catalog-only repository is checked exactly the same way.

Zero **error** diagnostics is the pass condition, and it exits non-zero when
there are any, which is also what makes it a CI gate. Output is one entry per
diagnostic — `severity  CODE  catalog-relative-path`, then the message — closing
with a summary line like `0 errors, 6 warnings — 324 entities across 3
solutions.` Report pass/fail and every diagnostic with its code and file. Codes
are documented in `schemas.md` and in `framework/spec/kinds/datamodel.md`. If a
diagnostic demands removing, renaming, narrowing or moving an entity, that is not
a fix — stop and say it requires a swap.

**Where the `E_DM_*` codes come from.** The check carries its own compiled
server, so it runs the same two passes the portal does: the loader, which asserts
that every `$id` and `x-srn` agree with the entity's own path and that every
non-local `$ref` names a real datamodel with a `schema.json` behind it, and the
schema registry — inheritance cycles, closed bases, contradictory conjunctions —
whose diagnostics are folded into the same list. One command therefore reports
the whole set. `metaframework` with no subcommand serves the portal on port 6363;
its `/diagnostics` page is that same list in a browser, worth opening when you
want to click through to the offending entity. The `validate-catalog` skill
carries the full coverage map.
