---
name: srn
kind: component
version: 2
title: SRN parser and resolver
summary: The zero-dependency implementation of the framework's identity syntax, where placement is enforced as grammar and the sealed universe is enforced at all.
status: review
owner: sergio
component-type: library
lifecycle: released
tags:
  - identity
  - grammar
---

`framework/portal/src/lib/srn/srn.ts` — 307 lines, no runtime dependency, not
even `zod`. It is the bottom of the portal: every other module imports it and it
imports nothing of ours. `srn.test.ts` is 415 lines, longer than the module, and
commit `6a1b1f1` calls those tests *spec-derived* — they are read out of
[srn.md](srn://metaframework/product/specification/component/core-contracts),
not out of the implementation.

## What it is

One grammar, three projections. An SRN is

```text
srn://{solution}( /{kind}/{name} )*  [@{version}]
```

and the path after the authority is the entity's directory under `solutions/`
verbatim. Parsing walks the segments **in pairs** with no lookahead and no
reserved-word scan, because after bucketing every odd position is one of eight
keywords and every even position is a name. `RESERVED_KINDS` at line 23 is that
list: `product`, `component`, `datamodel`, `protocol`, `actor`, `environment`,
`adr`, `requirement`. There is no ninth. A `capability`, a `journey` or a
`metric` bucket fails here, before anything reads a file.

## Placement is grammar, and that is the interesting claim

`assertPlacement()` rejects a product below solution level, a component at
solution level, an actor anywhere but the solution root, and a bucket inside a
leaf entity — as `E_SRN_PLACEMENT`, *while the path is being read*. The
consequence is stated in a comment in the loader: a misplaced entity never
reaches frontmatter validation at all, because it has no SRN to be validated
under. That is what moved `E_STRUCT_KIND_PLACEMENT` out of the structural pass
and retired it; `E_FM_KIND_LOCATION` is left with the single narrow job of
catching a `kind:` that disagrees with a bucket that is itself legal.

## Where the sealed universe is actually enforced

`resolveRef()` implements RFC 3986 `remove_dot_segments`, and it is the one
place in this repository where the framework's central rule stops being a
convention:

- a `..` chain that climbs above the solution root **throws** rather than
  clamping to it, because silently clamping is how a miscounted relative
  reference lands somewhere grammatical and wrong;
- a reference naming another solution is `E_SRN_CROSS_SOLUTION`;
- a network-path reference (`//other/…`) is refused for the same reason.

Everything else about the sealed universe — the prose in the spec, the rule in
the skills — describes what these three branches do.

## What it does not do

It resolves nothing about the world. It does not read the filesystem, does not
know whether an entity exists (`E_SRN_DANGLING` belongs to
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader),
which has the entity map), and does not resolve a version pin — `@N` is carried
through parsing and handed on, and only
[git-history](srn://metaframework/product/portal/component/git-history) can turn
it into a commit.

It also declares no environment, and may not: a `library` has no runtime of its
own (`E_COMP_LIBRARY_ENVIRONMENT`). It runs inside whichever process compiles
it, which here is the single Next.js server.
