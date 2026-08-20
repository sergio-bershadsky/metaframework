---
name: 0008-fully-bucketed-srn-paths
kind: adr
version: 1
title: Every SRN segment is a kind bucket plus a name
summary: The path alternates {kind}/{name} at every level, so placement is enforced by the grammar and parsing is a pair walk — paid for with a repository-wide rename.
status: review
owner: sergio-bershadsky
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/srn
tags:
  - identity
  - grammar
  - founding
---

# Every SRN segment is a kind bucket plus a name

## Context

The founding grammar is still printed in `docs/decision-record.md:35`:

```text
srn://{solution}/{product}/{components…}/{kind}/{name}[@{version}]
```

and the parsing rule underneath it, at line 45, reads "segment 1 = solution,
segment 2 = product, further segments = component path, until a reserved kind
keyword". Three properties followed from that shape and all three were felt:

- **Kind was inferred from depth.** `kindFromPosition()` in the loader read
  `containers.length === 0 → solution`, `=== 1 → product`, otherwise
  `component`. Nothing on the path said which.
- **A directory listing was a mix.** `ls solutions/acme/` returned `actor adr
  billing datamodel environment protocol requirement shop` — five buckets and
  two product names, separable only by knowing the reserved-word list.
- **Placement was a loader check, not a grammar rule.** `SOLUTION_ONLY_KINDS`
  in `load.ts` raised `E_STRUCT_KIND_PLACEMENT` for an actor below solution
  level — *after* the path had already parsed successfully, which meant an
  illegally placed entity had an SRN, and something in the catalog could point
  at it.

The parser matched: a scan that accumulated container names until it hit the
first of six reserved keywords, then required exactly one segment after it.

## Decision

Below the solution, an SRN path is a strict alternation of **kind bucket** and
**name**:

```text
srn://{solution}( /{kind}/{name} )*  [@{version}]
srn://acme/product/shop/component/checkout/datamodel/cart@1
```

`product` and `component` join the reserved kinds, making eight
(`RESERVED_KINDS`, `framework/portal/src/lib/srn/srn.ts:23`). Placement is
grammar: `assertPlacement()` at `srn.ts:122` raises `E_SRN_PLACEMENT` while the
path is being read, so a misplaced entity has no SRN at all rather than a valid
SRN and a diagnostic. Landed as commit `522c6bb`, `refactor!: fully bucketed
SRN paths — every entity states its kind`, 2026-08-19 13:17.

## Consequences

- **Parsing became a pair walk with no lookahead.** `srn.ts:161` rejects an odd
  tail — "kind bucket is not addressable" — and `srn.ts:173` steps `i += 2`
  taking every odd position as one of eight keywords and every even position as
  a name. The reserved-word scan is gone, and with it the question of what
  happens when a container is named after a kind: a keyword at a name position
  is `E_SRN_RESERVED`, and at a bucket position it simply *is* the bucket.
  There is nothing left to disambiguate.
- **`E_STRUCT_KIND_PLACEMENT` is retired.** The loader carries a comment where
  the check used to be, and `E_FM_KIND_LOCATION` is left with one narrow job:
  a `kind:` field that disagrees with a bucket that is itself legally placed.
  `kindFromPosition()` collapsed to `return srn.kind ?? 'solution'`.
- **`ls` of any catalog directory now lists buckets only**, which is the
  property [human-and-ai-readable](srn://metaframework/requirement/human-and-ai-readable)
  is claiming when it says an entity's kind is readable from its path without
  loading anything.
- **Paths grew by half.** Across the 30 entities the commit relocated, the mean
  segment count below the solution root — the SRN path, `solutions/{solution}/`
  excluded — went from 3.00 to 4.60 and the deepest went from 5 to 8. So the spec now asks for solution-absolute references outside an
  entity's own subtree rather than `..` chains — a `..` pops a name *and* a
  bucket, which is exactly the arithmetic the absolute form removes. The commit
  body records 118 references resolved through the old grammar and re-emitted in
  the same change.

### The price: a repository-wide rename in a framework that forbids renames

This is the consequence that makes the record worth having.

`framework/spec/evolution.md:213` states "**Entities MUST NOT be moved or
renamed.** The SRN is the path; a move is a delete plus an unrelated create, and
the version→commit index does not follow it." This commit moved entities anyway,
because the rule it broke is a rule about the catalog and the change was a change
to the grammar the catalog is written in. That reasoning is sound and it does not
settle what the move actually cost.

Measured with `git show 522c6bb --name-status -M` on 2026-08-20: **30 of the 45
entity documents then in `solutions/` changed path**, 13 were modified in place,
2 were untouched; 51 files were renamed in total. (The commit body says "45
entities relocated". 45 is the size of the catalog at that commit, not the size
of the move.)

`framework/portal/src/lib/history/git.ts:36` pins `-c log.follow=false` on every
invocation, deliberately, and says why in the two lines above it: the
version→commit index does not follow renames, so a user's global
`log.follow = true` would silently change what a pinned `@N` resolves to. A
relocated entity's log therefore begins at the rename.

What that cost, measured rather than assumed — walking `git log` per entity and
parsing the frontmatter `version` at each commit, once under the old path up to
`522c6bb^` and once under the new path today:

- **No resolvable version was lost.** For all 30 relocated entities the set of
  versions git can reach is unchanged; one grew, none shrank. The reason is
  uncomfortable rather than reassuring: `bae08e4` was the only commit that had
  ever touched `solutions/acme`, and it created every one of those entities
  already at its current version — `checkout` was born at `version: 7`. There
  was no earlier version to lose.
- **Every relocated entity lost its birth commit.** Each of the 30 had exactly
  one commit behind it, and each of their logs now starts at `522c6bb`. "When
  was this entity created, and what did it look like then" is no longer
  answerable through the path filter the portal uses.
- **The bound was luck, not design.** The rename is commit 9 of 52, two commits
  into the catalog's life. Run the same operation a week later and it would have
  made 13 entities' pinned versions unresolvable instead of none. The decision to
  break the MUST was taken without this measurement; the measurement came out
  fine.

One count that does *not* belong here, because the obvious reading blames it on
this decision: 28 acme entities cannot resolve a version below their earliest
reachable one. **None of those 28 is this rename.** All of them were authored
with a version number above 1 already in the frontmatter at birth, in `bae08e4`
and `4c317b4`, so those numbers were never a commit and the index never had
anything to resolve them to. That defect belongs to
[0009-git-backed-history](srn://metaframework/adr/0009-git-backed-history).

### The decision record was never amended

`docs/decision-record.md` is the document that wins on conflict, and it still
prints the pre-bucketing grammar at line 35 and still lists six reserved kind
keywords at line 46. Its five amendments cover the portal stack version, schema
references twice, the canonical schema host, and mermaid state diagrams. None
covers this change. The rationale lived only in the commit body until this ADR,
which is exactly the gap
[review-first-change](srn://metaframework/requirement/review-first-change)
records under AC-4.

## Alternatives considered

- **Keep the keyword scan and document the reserved words harder.** Rejected:
  the problem was never that the list was unknown, it was that `shop` and
  `datamodel` are indistinguishable as strings, so every reader and every parser
  needed the list before it could read a path. Documentation does not remove a
  lookahead.
- **Bucket the leaves only, leave the container path bare** — the status quo.
  Rejected for the same reason: the ambiguity lived entirely in the container
  path, so leaving it bare left the whole problem.
- **Perform the migration as 30 swaps** — successor entity, `supersedes` edge,
  migrate referrers, deprecate the predecessor, per
  `framework/spec/evolution.md`. Rejected, and the reasoning is worth keeping:
  the swap procedure exists for a change of *meaning*, and no entity's meaning
  changed. It would have produced 30 permanently deprecated directories, 30
  successors starting again at `version: 1`, and no more reachable history than
  the rename left — the successors' logs would start at the same commit.
- **Set `log.follow=true` and let git stitch the histories back.** Rejected in
  the module itself. The version→commit index is built from a path filter, and
  a followed log returns blobs from paths that are not the entity's SRN; a
  pinned `@N` would resolve to a document that was never at that address. A
  wrong answer is worse than `E_SRN_VERSION`.
- **Defer to v2.** Rejected on the same arithmetic
  [0003-closed-ontology-of-nine-kinds](srn://metaframework/adr/0003-closed-ontology-of-nine-kinds)
  uses: adding a reserved word invalidates every existing entity already named
  after it, so the cost of this change only ever grows with the catalog. At 45
  entities it was already the most expensive it had ever been, and two further
  solutions have been written since.
