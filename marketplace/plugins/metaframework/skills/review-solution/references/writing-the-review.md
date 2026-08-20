# Writing the review

The deliverable is prose with a ranked list, addressed to someone who owns the
catalog. It is not a diagnostics dump: the collector's output is evidence, not
the write-up.

## Structure

```markdown
# Review — srn://<solution>

Catalog check: <pass | N errors — reviewed anyway / stopped>.
Scope reviewed: <what was read>. Facts from catalog_facts.py + <N> entities read.

## Verdict
<Two or three sentences. Is this a good description of this system? Say so
plainly. A clean audit is a real result.>

## Findings

### 1. <one-line claim> — <Scope | Structural | Graph | Modelling | Coverage | Hygiene>
**Entity:** srn://acme/...
**Symptom:** <what is in the files, with paths and lines>
**Why it matters:** <what a reader of this catalog gets wrong because of it>
**Fix:** <the concrete change>
**Mechanism:** <in place, version bump | SWAP — N entities, M referrers | none>

### 2. ...

## Not reviewed
<what was skipped and why: artifacts not read, products out of scope, history
unavailable>
```

Ranking, in this order: **scope and truth**, then **structural**, then **graph**,
then **modelling**, then **coverage**, then **hygiene**. Within a band, order by
how much a reader is misled.

**Coverage is a table, not a band of findings.** Capabilities with no metric,
`must` requirements with no metric, journeys covering no actor goal — on a
catalog that has just adopted the business layer, nearly everything is
uncovered, and a hundred entries say less than one row does:

```markdown
## Coverage

| Question                             | Covered | Total |
|--------------------------------------|---------|-------|
| Capabilities with ≥ 1 realizer       | 3       | 3     |
| Capabilities with ≥ 1 metric         | 1       | 3     |
| `must` requirements with ≥ 1 metric  | 1       | 8     |
| Journey product crossings documented | 6       | 6     |
```

Those four rows are a real run against the shipped acme fixture, not an
illustration. They also show what the table is for: fully realized, fully
documented at the seams, and almost entirely unmeasured — one sentence of
verdict that eleven separate findings would have buried.

Promote a single row **out** of the table and into the ranked findings when it
is a truth claim rather than a gap: an `approved` capability nothing realizes
belongs in band 1, because the catalog is asserting the business can do
something it cannot.

Always state the **mechanism**, because the cost is the decision. "Promote
`order-line` to the solution bucket" reads like a five-minute edit and is
actually a swap with a migration window; saying so is the difference between a
useful review and one that gets someone to `git mv` a directory.

## Worked excerpt

Three entries in rank order, drawn from a real run against the shipped acme
fixture — the register to aim for:

> ### 1. `product/shop` vocabulary is consumed by `product/fulfilment` — Structural
> **Entity:** `srn://acme/product/shop/datamodel/order-placed`
> **Symptom:** `product/fulfilment` and
> `product/fulfilment/component/delivery-orchestrator` both reference it; the
> model sits in the shop product's bucket.
> **Why it matters:** placement is an ownership claim. The catalog currently says
> "only the shop is responsible for this event" while two products consume it, so
> a reader cannot tell whether fulfilment's dependency is sanctioned or a leak.
> **Fix:** either promote the event to the solution-level `datamodel/` bucket,
> making the cross-product contract explicit, or keep it where it is and say in
> the prose that it is a published event other products may consume. Prefer the
> second while the shop is and remains its sole publisher.
> **Mechanism:** promotion is a SWAP (1 successor + 3 referrers). The prose fix is
> in place, one version bump.
>
> ### 2. `promotion-evaluation` sits below the NCA of its participants — Structural
> **Entity:** `srn://acme/product/growth/protocol/promotion-evaluation`
> **Symptom:** its `participants` list names
> `/product/shop/component/checkout` alongside three `product/growth`
> components. The pair-wise common prefix of those four is empty — the two
> products diverge at the first pair — so the NCA is the solution root, while
> the directory sits under `product/growth`.
> **Why it matters:** placement states who owns the contract. As filed, the
> catalog says growth owns a conversation that shop is a first-class party to,
> and a shop engineer looking for the pricing contract will not find it in
> shop's subtree.
> **Fix:** decide which side is wrong. If checkout really is a participant, the
> protocol belongs at `srn://acme/protocol/promotion-evaluation` next to
> `settlement`. If the intended surface is narrower — growth exposes an HTTP
> API and checkout is merely a client — drop checkout from `participants` and
> let its `uses` edge carry the relationship.
> **Mechanism:** relocating is a SWAP (1 successor protocol + its 4 participant
> back-edges). Correcting the participant list is in place, one version bump.
> Recommend the second: the transport is a plain request-response HTTP surface
> growth owns.
>

> ### 3. `actor/release-bot` is named by no protocol — Graph
> **Entity:** `srn://acme/actor/release-bot`
> **Symptom:** appears in no `participants` list, no `primary-actors`, and no
> journey step; its `goals` name promotion between environments, which no
> protocol describes.
> **Why it matters:** the actor asserts a capability the catalog never shows
> anyone exercising — a hole, not a contradiction.
> **Fix:** either describe the promotion interaction as a protocol, or state in
> the actor's prose that it acts through tooling outside this catalog's scope.
> **Mechanism:** in place, one version bump (or one new protocol).

Note what the excerpt does **not** do: it does not repeat the collector's
candidates that turned out to be correct by design (`datamodel/problem` at
solution level; `merchant-operator` unwired while its write path is deliberately
unmodelled). Candidates that were checked and cleared are worth one line in the
verdict, not an entry each.
