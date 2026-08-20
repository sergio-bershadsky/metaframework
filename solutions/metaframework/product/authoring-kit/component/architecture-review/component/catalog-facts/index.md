---
name: catalog-facts
kind: component
version: 2
title: Catalog facts
summary: 609 lines of stdlib-only Python that resolve a catalog into a graph and print fifteen R_-coded candidates — the kit's only executable artifact.
status: review
owner: sergio
component-type: job
lifecycle: released
relations:
  uses:
    - /environment/local
tags:
  - python
  - review
---

# Catalog facts

`skills/review-solution/scripts/catalog_facts.py` — 609 lines, standard library
only, read-only, no network. It walks a solution directory, resolves every
reference it can find (frontmatter `relations`, protocol `participants`,
`primary-actors`, schema `$ref` URLs and prose `srn://` links) into one graph,
and prints a census plus candidate findings.

Verified 2026-08-19 against both shipped catalogs:

```text
$ python3 catalog_facts.py solutions/brass
solution srn://brass — 98 entities, 178 outgoing references
  kinds:  actor 5, adr 17, component 17, datamodel 30, environment 3,
          product 2, protocol 5, requirement 18, solution 1
  status: approved 4, deprecated 1, draft 7, review 86
```

`solutions/acme` prints 99 entities and 258 outgoing references. Both exit 0.

## Why it is a sub-component and not a peer skill

It exists to serve one skill's Step 3 and has no independent audience. Lifting it
to a sibling of
[architecture-review](srn://metaframework/product/authoring-kit/component/architecture-review)
would suggest a reviewer could use it alone, and its own docstring refuses that
reading: "This is a REVIEW AID, not a validator."

## The namespace is the design

Fifteen finding codes, all prefixed `R_`: `R_ORPHAN`, `R_DEPRECATED_LIVE_REF`,
`R_DEPRECATED_NO_SUCCESSOR`, `R_SWAP_UNFINISHED`, `R_PROTOCOL_NCA`,
`R_PRODUCT_NO_COMPONENT`, `R_PRODUCT_ONE_COMPONENT`, `R_REQ_UNIMPLEMENTED`,
`R_ENV_UNUSED`, `R_ACTOR_UNWIRED`, `R_DM_UNDER_PROMOTED`, `R_DM_OVER_PROMOTED`,
`R_DM_NEAR_DUPLICATE`, `R_ADR_ABSENT`, `R_DRAFT_DEPENDENCY`.

The prefix is deliberately disjoint from the portal's `E_*` / `W_*` families, and
the script says why: the codes "carry no authority, several are heuristics, and a
well-modelled catalog trips some of them for good reasons." Every line it prints
is a question. The reviewing skill repeats the same instruction — open the files
it names before writing anything up.

Some of the codes overlap portal diagnostics by intent rather than by accident.
`R_PROTOCOL_NCA` asks the question `W_STRUCT_PROTOCOL_NCA` specifies and the
portal never implements; `R_REQ_UNIMPLEMENTED` stands in for the unimplemented
`W_REQ_UNIMPLEMENTED`. The script is, in those two cases, the only thing in the
repository that asks.

## Dependencies, deliberately none

Standard library only. PyYAML is used when importable; otherwise a hand-written
frontmatter-subset parser handles what the catalog format actually allows —
scalars, lists of scalars, lists of maps, one nested map level. That choice is
what lets the script run wherever `python3` does, including inside an installed
plugin with no project environment.

`job` is the nearest `component-type`: it is invoked, it runs, it prints, it
exits, and it has no inbound surface. The enum has no value for "a script a human
or a model runs by hand", and the difference is worth stating rather than hiding
behind the label.

## What it does not do

It writes nothing and checks no legality — a catalog with `E_SRN_DANGLING`
errors will still produce output, drawn from a partial graph, which is exactly
why the skill runs the portal check first. It is not exercised by any test: no
suite in this repository imports it, and its only verification is someone running
it on `solutions/acme` or `solutions/brass` and reading the output. Nothing runs
it automatically, because there is no CI.
