---
name: schema-closure-filesystem-reads
kind: metric
version: 1
title: Filesystem reads to close a schema
summary: How many times a stock dereferencer has to touch a disk to resolve the full transitive closure of a catalog schema from a URL.
status: review
owner: sergio-bershadsky
metric-type: count
target: "0"
window: "instant"
direction: lower-is-better
relations:
  measures:
    - /requirement/stock-tooling-schema-consumption
    - /capability/schema-interoperability
  uses:
    - /environment/local
tags:
  - interoperability
  - json-schema
---

The number that says whether a schema in this catalog is actually a public
contract or only claims to be. A stranger's tool is handed one URL and asked to
follow every `$ref` inside it; if it can only finish by reaching into a clone of
this repository, the identifier form has failed and the whole
`0004`→`0005`→`0006`→`0007` chain bought nothing.

Two subjects, one observation.
[stock-tooling-schema-consumption](srn://metaframework/requirement/stock-tooling-schema-consumption)
is the `must`, and its AC-2 is this number written as an obligation — "no
filesystem access".
[schema-interoperability](srn://metaframework/capability/schema-interoperability)
is the doing.

## Definition

The subject of the observation is **one dereferencing run**: a stock JSON Schema
dereferencer, holding no configuration except a mapping from the canonical host
onto a serving address, given the URL of one `schema.json` and asked to resolve
its full transitive closure. The count is the number of filesystem reads that run
performs.

Counted: every read the resolver makes, including reads of a local cache. Not
counted: reads the operating system makes on the tool's own behalf — loading the
tool, its dependencies, its TLS roots. The line is drawn at "did the schema
graph come out of the network or out of a disk", which is the question AC-2 asks.

A run that does not reach the whole closure does not produce a reading at all.
The number is defined over completed runs only — see the distortions.

`window: "instant"` for the same reason as its neighbour: this is read from one
run against one commit, and nothing samples it on a schedule.

## Rationale

Zero, rather than "few", because the observation is binary in practice and the
recorded evidence is phrased that way — decision-record amendment
`2026-08-19-c`, `docs/decision-record.md:239-252`, ends
`resolved without a single filesystem read: true` after eight documents. A target
of "few" would let the local-path form back in, and the local-path form is what
`0005` was retired for: it resolved for exactly one class of consumer, a tool
running inside a clone from the right directory, which is the narrow scope
amendment `2026-08-19-c` says the previous measurement had.

The number is a count and not a ratio on purpose. The interesting failure is not
"how much of the graph came off disk"; it is "did any of it".

## Known distortions

- **A tool that resolves nothing also reads no files.** Zero is trivially met by
  a run that dies on the first `$ref`, which is why the definition above admits
  only completed closures. The companion number — how many documents the run
  retrieved — is what tells the two apart, and it is deliberately not this
  metric and has never been given a target of its own.
- **The recorded reading is not reproducible.** The driver named in the output,
  `http-deref.mjs`, is not in this repository; `find` returns nothing for it.
  Anyone re-taking this measurement writes their own driver first.
- **The recorded reading predates the identity it now describes.** It was taken
  while `$id` was the serving URL, before amendment `2026-08-19-d` moved identity
  to the constant `https://schemas.metaframework.dev`, which nothing here serves.
  Amendment d argues it still stands because it proved the URL form; that is an
  argument and not a rerun.
- **The resolver-config line is inside the run and outside the count.** A
  consumer who has not mapped the canonical host onto a serving address gets a
  failed run, not a bad number — the `[else]` branch in
  `workflows/fetch-schema.yaml` on
  [schema-serving](srn://metaframework/product/portal/component/schema-service/protocol/schema-serving)
  is that case, written down.
- **The portal's own bundler would fail this target on purpose, and must never
  be used to take the reading.**
  [schema-bundler](srn://metaframework/product/portal/component/schema-registry/component/schema-bundler)
  installs a catalog resolver ahead of the HTTP one precisely so that a canonical
  `$ref` is satisfied from disk and rendering never depends on the network — a
  deliberate inversion, and test-enforced from the other side, since
  `dereference.test.ts` fails by attempting a network call if the resolver stops
  matching. Pointing it at a schema would produce a large number that says
  nothing about the subject, which is a tool that has never heard of this
  framework.
