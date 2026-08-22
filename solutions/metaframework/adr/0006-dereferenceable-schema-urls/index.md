---
name: 0006-dereferenceable-schema-urls
kind: adr
version: 2
title: Schema identity is a dereferenceable URL
summary: $id and every cross-entity $ref become absolute HTTP URLs served by the portal, measured by a stock ref-parser bundling eight documents over HTTP with no filesystem read.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  supersedes:
    - /adr/0005-relative-path-schema-refs-without-id
  uses:
    - /product/portal/component/schema-service
tags:
  - json-schema
  - interoperability
  - measurement
---

## Context

[0005](srn://metaframework/adr/0005-relative-path-schema-refs-without-id) asked
for references "resolvable by any standard tool" and delivered *well-formed*
references, not resolvable ones. A relative path — and by commit `522c6bb` the
deepest one in the catalog was
`"$ref": "../../../../../../../../datamodel/money/schema.json"` — resolves for
exactly one class of consumer: a tool running inside a clone of this repository,
with the whole catalog on disk, invoked from the right directory. Paste the same
schema
into a validator, a browser playground, a generator in another repo, or a CI job
that fetched one file, and the reference resolves to nothing
(`docs/decision-record.md:194-202`).

The `$id`-less design compounded it. Without `$id` a document has no identity of
its own, so the only base URI available is wherever the file happened to be
retrieved from — a schema separated from its directory cannot say what it is or
where its neighbours are.

The consumer this catalog actually has is
[schema-consumer](srn://metaframework/actor/schema-consumer): a class of tool,
never a named system, holding nothing but a URL and expected to get a document
back and follow every `$ref` inside it. Neither of the first two forms gave it
one.

## Decision

Inside `schema.json` only, leaving frontmatter `relations`, workflow YAML and
prose links exactly as the SRN (`docs/decision-record.md:179-231`):

**`$id` is the URL the portal serves the schema at**, and the path after
`/schemas/` is the entity's SRN path verbatim, so the mapping is a rename rather
than a lookup. **Every cross-entity `$ref` is the absolute schema URL of its
target** — one form, no relative paths, no `srn://`, no depth arithmetic.
`x-srn` is retired, on the grounds that `$id` now carries identity in a keyword
validators act on. Local JSON Pointers (`#/$defs/…`) are unchanged and `$defs`
stay entity-private. **No version suffix ever appears in a URL**: it addresses
the *current* schema, and pinning stays in frontmatter `relations` where
git-backed history can resolve it. A new route, `GET /schemas/{srn-path}`,
serves the bytes as `application/schema+json`.

## Consequences

- **Dereferenceability stopped being an argument and became a measurement.**
  With the portal running, a stock `json-schema-ref-parser` given nothing but a
  URL, with filesystem access unused, bundled the deepest schema in the fixture
  catalog: eight documents, the full transitive closure, ending
  `resolved without a single filesystem read: true`
  (`docs/decision-record.md:240-253`). Under the previous form the same tool,
  handed the same starting point, resolved nothing.
- **Three caveats travel with that measurement, and belong beside it rather than
  in a footnote.** The driver named in the recorded output, `http-deref.mjs`, is
  not in this repository — `find` returns nothing — so this is a dated
  measurement, not a reproducible check. It was taken while `$id` was the
  *serving* URL, which
  [0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)
  then changed. And the route it exercised has no test file of its own; its only
  coverage is `fixture-check.test.ts` importing the handler directly for one 200
  and three rejections. All three are carried as acceptance criteria of
  [stock-tooling-schema-consumption](srn://metaframework/requirement/stock-tooling-schema-consumption).
- **The artifacts moved the same afternoon.** Commit `4c317b4` (15:15) rewrote
  every `$id` and `$ref` onto serving URLs and deleted the annotation:
  `git show 4c317b4 -- solutions/acme/datamodel/money/schema.json` is one line
  removed, `"x-srn": "srn://acme/datamodel/money"`, and one added,
  `"$id": "http://localhost:3000/schemas/acme/datamodel/money"`.
- **The reference stops encoding the referrer's depth.** Moving an entity no
  longer rewrites every `$ref` pointing *out* of it, and the eight-`..` chains
  are gone. A secondary gain, not the reason.
- **The origin got baked into the artifacts, and that is a real defect this
  decision shipped.** Because `$id` was derived from `SCHEMA_BASE_URL`, changing
  the variable meant rewriting every `$id` and `$ref` in the catalog. The record
  wrote a "portability rule" to manage it — one origin per catalog, a migration
  script, `E_DM_ID_MISMATCH` to stop the variable and the files drifting apart
  (`docs/decision-record.md:270-299`). That rule existed only because the
  configuration was in the artifacts, and it was retired the same evening.
- **The SRN vanished from schema files entirely.** Identity became implicit in a
  URL-parsing rule — strip this host, prefix `srn://` — that a reader has to know
  to apply, and `grep -r 'srn://acme/datamodel/money' solutions/` stopped finding
  the schema that *is* that entity. Retiring `x-srn` was argued from
  non-redundancy and from two identity fields being able to disagree; 0007 shows
  both halves were wrong.
- **The error vocabulary turned over.** `E_DM_ID_MISSING` and
  `E_DM_ID_MISMATCH` are new; `E_DM_ID_FORBIDDEN` narrows to a *nested* `$id`
  only; `E_DM_SRN_RETIRED` replaces `E_DM_SRN_MISMATCH`; `E_DM_REF_KIND` is
  retired into `E_SRN_DANGLING` because the registry holds only datamodels; and
  `E_DM_REF_ESCAPE` survives with a narrowed subject
  (`docs/decision-record.md:309-319`).
- **The portal never dereferences these URLs.** It holds the files already, so
  ajv is given each document under its own `$id` and the bundler maps a schema
  URL back to a local file — deliberately, because SSR must not depend on the
  server reaching itself over the network. The URLs are dereferenceable *for
  outsiders*; for the portal they are identity. That split is now
  `framework/portal/src/lib/schema/dereference.ts`, whose catalog resolver sits
  at `order: 1` ahead of the built-in HTTP one. (This bullet read "92 lines"
  when it was filed; the file is 231 lines, measured 2026-08-22 by `wc -l`. The
  digit was never what the bullet claimed — `order: 1` is — so it is dropped
  rather than re-typed.)
- **This is the decision in the chain that held.** 0007 amends it on two points —
  which host an artifact names, and whether `x-srn` exists — and leaves the URL
  form, the one-spelling rule, the absent version suffix, the entity-private
  `$defs` and the local pointers standing (`docs/decision-record.md:325-328`).
  The framework's closed edge vocabulary has no `amends`
  ([0003-closed-ontology-of-nine-kinds](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds)),
  so there is deliberately **no `supersedes` edge from 0007 to this record** and
  its `decision-status` stays `accepted`. Authoring the edge would claim a total
  reversal that did not happen; the partial one is carried in prose, here and in
  0007.

## Alternatives considered

- **Keep relative paths and document the constraint** — "run your generator from
  a clone of this repository". Rejected because it makes the interoperability
  requirement conditional on a deployment fact the consumer does not control,
  and because the consumer this catalog is written for holds one file and a URL.
- **An `srn://` `$id` with URL `$ref`s.** Rejected: the two spellings would sit
  in one document, the base URI would be unresolvable, and a reader would have to
  know which keyword obeys which scheme. The interoperability cost of `$id` that
  0005 feared was a cost of `$id` *plus relative refs*; with absolute-URL refs
  there is nothing to re-base (`docs/decision-record.md:264-268`).
- **A version suffix in the URL** (`…/money@1`). Rejected: a URL addresses the
  current schema, and with git-backed history a pinned version is not a file.
  `schemaUrlToSrn()` in `framework/portal/src/lib/schema/url.ts` rejects an `@N`
  outright rather than normalising it away, precisely so a pin cannot silently
  resolve to something other than what was asked for.
- **Serving a catalog from more than one origin.** Explicitly out of scope for
  v1: one catalog, one origin, one set of URLs. Six hours later
  [0007](srn://metaframework/adr/0007-canonical-schema-host-and-x-srn-restored)
  made the question moot by taking the origin out of identity altogether.
- **A canonical constant host, decoupled from where the portal serves.** *Not
  considered here.* This is the answer 0007 reached, and the record shows it was
  not weighed at this decision — `SCHEMA_BASE_URL` was chosen, the portability
  rule was written to contain its consequences, and the conflation of identity
  with retrieval was named only afterwards.
