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

### 1. <one-line claim> — <Structural | Graph | Modelling | Scope | Hygiene>
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
then **modelling**, then **hygiene**. Within a band, order by how much a reader
is misled.

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
> ### 2. Three products carry no ADR — Hygiene
> **Entity:** `srn://acme/product/fulfilment`, `.../growth`, `.../identity`
> **Symptom:** each has 3–4 components and no `adr/` bucket anywhere in its subtree.
> **Why it matters:** the decomposition of each product into exactly these
> components was decided by someone; nothing records why, so the next team to
> question it has to re-derive the argument.
> **Fix:** one retrospective ADR per product, dated when the split was made.
> **Mechanism:** new entities; nothing existing changes.
>
> ### 3. `actor/release-bot` is named by no protocol — Graph
> **Entity:** `srn://acme/actor/release-bot`
> **Symptom:** appears in no `participants` list and no `primary-actors`; its
> `goals` name promotion between environments, which no protocol describes.
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
