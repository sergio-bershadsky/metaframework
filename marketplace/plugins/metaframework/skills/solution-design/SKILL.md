---
name: solution-design
description: This skill should be used when the user asks to "design a solution", "start a new metaframework catalog", "model our system as a catalog", "how should I split this into products and components", "where does this component belong", "propose an SRN tree", "is this decomposition right", "should this be two products or one", or describes a system in prose that has to become a catalog. It owns the interview, the decomposition heuristics, the proposed SRN tree, and the review gate — everything that happens BEFORE any file is written. Use it also for re-shaping questions inside an existing solution.
---

# Solution design — from a system in someone's head to an SRN tree

## What this skill owns

Turning a system described in prose into an **agreed catalog shape**, then writing
it. The value is in the shape, and the shape is settled by interview and review,
not by guessing from a one-line request.

This skill stops at the entity boundary. Once the tree is signed off, hand each
entity to the skill that knows its kind: `model-data` for a datamodel,
`protocol-design` for a protocol, `add-entity` for everything else.

**Never create a directory before the tree has been reviewed.** Entities cannot be
renamed or moved later — the SRN is the path, and renaming is a full swap
procedure. A bad name costs a swap; a bad boundary costs many.

## Read the rules before proposing anything

This skill carries procedure and judgement. Legality lives in the specification.

- If `framework/spec/` exists in the repository, it is **authoritative** — read
  `index.md`, `srn.md`, `structure.md`, `frontmatter.md`, and the relevant
  `kinds/*.md`.
- Otherwise read the distilled copy bundled with this plugin:
  `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/` — `srn.md` (placement
  grammar, the relative-reference trap), `structure.md` (buckets, artifacts, the
  protocol NCA rule), `frontmatter.md` (per-kind required fields, the closed
  relation-edge set), `schemas.md`, `evolution.md` (names are permanent).

## Procedure

### Phase 0 — Fix the boundary

A solution is a **sealed universe**: no reference may leave it. Establish, in the
user's own words, what is inside and what is deliberately outside. Anything the
organisation does not own but must be pointed at is not "outside" — it is an
`external` component inside the product that depends on it.

Confirm the target repository and that `solutions/<name>/` does not already
exist. Settle the solution name here: it is the SRN authority.

### Phase 1 — Interview

Ask in small batches, not as a questionnaire. Each question exists because its
answer decides a specific piece of the tree.

| Ask                                                        | Decides                                      |
|------------------------------------------------------------|----------------------------------------------|
| What do you ship, and who gets paged when it breaks?       | products, and `owner` on each                |
| What has its own roadmap, funding, or release cadence?     | product vs component                         |
| What could be deployed, released, or replaced on its own?  | components                                   |
| What always changes in the same commit as something else?  | components to merge                          |
| What runs *inside* another process rather than beside it?  | `component-type: library`                    |
| What holds state / fronts others / has no inbound surface? | `datastore` / `gateway` / `job`              |
| What talks to what, and across which ownership boundary?   | protocols, and where they sit                |
| Which of those crossings is a contract you would version?  | protocol vs a plain `depends-on` edge        |
| Which nouns appear in more than one part of the system?    | datamodels, and how far up they get promoted |
| Is that noun stored, exchanged, or both?                   | `usage`                                      |
| Who or what starts work from outside the system?           | actors (solution level)                      |
| Where does it run?                                         | environments (solution level)                |
| What must hold true regardless of how it is built?         | requirements                                 |
| What did you decide that you would have to defend later?   | ADRs                                         |

Ask for the vision and scope in the user's own sentences. Inventing a vision
produces a catalog nobody recognises.

### Phase 2 — Draft the decomposition

Apply the heuristics below. Write down, for each non-obvious call, the
alternative rejected and why — that list is what makes Phase 3 reviewable.

### Phase 3 — Propose the tree, then STOP

Present three things and ask for sign-off before touching the filesystem:

1. **The annotated SRN tree** — every entity, its kind bucket, and a few words on
   what it is.
2. **The decision table** — each judgement call, the alternative rejected, the
   heuristic that decided it.
3. **The open questions** — anything answered with under 80% confidence.

### Phase 4 — Write, targets before referrers

Write in dependency order so the check stays meaningful: solution `index.md` →
actors and environments → products → components (outermost first) → datamodels →
protocols → requirements and ADRs. A referrer written before its target produces
`E_SRN_DANGLING`.

Delegate each entity to its kind's skill rather than hand-rolling frontmatter.
Kind-required fields are the most-missed rule in the framework: `vision` on the
solution, `lifecycle` on a product, `component-type` on a component, `usage` on a
datamodel, `participants` + `style` on a protocol, `actor-type` + `goals` on an
actor, `environment-type`, `requirement-type` + `priority`, `decision-status` +
`date` on an ADR.

What a settled product looks like — `solutions/acme/product/shop/index.md`,
verbatim, minus its prose:

```yaml
---
name: shop                    # MUST equal the directory name
kind: product                 # MUST equal the bucket
version: 4
title: Shop
summary: Customer-facing storefront, cart, and checkout for the acme retail business.
status: approved              # the document's state, not the product's
owner: team-shop
lifecycle: active             # the product's state in the world
primary-actors:
  - /actor/customer           # solution-absolute; MUST resolve to an actor
  - /actor/support-agent
relations:                    # forward edges only — inverses are derived
  exposes:
    - /product/shop/datamodel/order-placed@1
  depends-on:
    - /product/billing/component/ledger
  implements:
    - /product/shop/requirement/guest-checkout
  uses:
    - /datamodel/money@1
tags:
  - commerce
  - customer-facing
x-cost-center: "4711"         # unknown top-level fields need the x- prefix
---
```

### Phase 5 — Check

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

There is no CLI; the portal's catalog loader is the checker. Report pass/fail and
every diagnostic with its code and file. Do not declare the design done on an
unrun check.

## Decomposition heuristics

These are judgement calls the spec deliberately does not make. They are the point
of this skill.

**H1 — A product is a deliverable with its own lifecycle and owner.** Not a
folder, not a layer, not a team's org chart position. `frontend` and `backend` are
almost always two components of one product, because they ship the same capability
on the same release train. Test: does it have its own roadmap and its own line in
a budget? If not, it is a component.

**H2 — A component is a thing that could be deployed, released, or replaced on its
own.** If two candidate components always change together, they are one component
with two files in it. Splitting them buys nothing and costs two version counters.

**H3 — Promote a shared datamodel to the nearest common ancestor of the entities
that *own its meaning*, not of everything that reads it.** Owner scope is a
statement of **responsibility, not visibility** — any entity may reference any
datamodel anywhere in the solution, so promotion is never about access.

- Two components of one product both define what the noun means → promote to the
  product. Two products do → promote to the solution.
- One container is plainly the authority and the others merely consume → leave it
  where it is and reference across. In `acme`, `order-line` stays at
  `/product/shop/datamodel/order-line` even though `product/fulfilment` reads it:
  shop decides what a line *is*.
- Promote when the answer to "whose definition is this?" is "nobody's in
  particular" — that is why `money`, `problem` and `base-record` sit at the root.

Promotion is additive and cheap to do later; a wrongly-promoted model is a swap.
When in doubt, leave it low and promote on the second real consumer.

**H4 — A protocol lives at the nearest common ancestor of its component and
product participants** (actors are excluded from the computation — they are
solution-level and would collapse every protocol to the root). One protocol
landing at the solution root is a deliberate cross-product bus and is fine. If
protocols *keep* resolving to the root, the product boundaries are drawn wrong —
say so out loud rather than filing them all at the top.

**H5 — Actors and environments are solution-wide by nature.** The grammar only
allows them at solution level. Wanting a product-local actor is a signal that the
boundary is misplaced: either that "actor" is really an external component, or the
product is really the solution.

**H6 — A component with no relations is either mis-modelled or dead.** Every real
component uses something, exposes something, or depends on something. An isolated
node in the graph is the cheapest defect to spot and the most commonly ignored.

**H7 — Cross-cutting concerns get their own product, and that product depends on
nothing.** Identity, access control, audit, notification — model once, reference
from everywhere. Duplicating them into each product guarantees the copies diverge,
and the framework has no mechanism to reconcile two entities describing one thing.
The corollary is the useful half: because every product may `depends-on` the
cross-cutting one, it may `depends-on` no product, or the graph gains a cycle no
deployment order satisfies. What it consumes instead is solution-level shared
vocabulary, which is exactly why that vocabulary sits at the root.

**H8 — Start with 3–7 products.** Fewer suggests a monolith that has not been
decomposed yet; more suggests components promoted too eagerly because they had a
team attached. Two is defensible when the seam is genuinely singular — but state
the reasoning instead of letting it pass unexamined.

**H9 — Nesting is composition, never dependency.** A sub-component is *part of*
its parent. If A merely calls B, that is a `depends-on` or `uses` edge and B stays
where it lives. Reuse inside a solution is always by reference — never a copy,
never a second directory.

**H10 — Anything not owned but pointed at is an `external` component.** Relation
edges accept components, products, datamodels, protocols and environments — never
actors. So a third-party acquirer, carrier or IdP that something must
`depends-on` has to be a component with `component-type: external`, described at
whatever fidelity the dependency requires.

## Naming

- Every segment matches `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 characters. `Shop`,
  `order_placement`, `-cart` are `E_SRN_SYNTAX`.
- The eight reserved kinds — `product`, `component`, `datamodel`, `protocol`,
  `actor`, `environment`, `adr`, `requirement` — may never be a solution or entity
  name. They appear only as bucket directories.
- **Name the thing, not its position.** The path already carries the context:
  `component/checkout`, not `component/shop-checkout`. Drop `-service` and `-api`
  suffixes; `component-type` already says what it is.
- Never encode a version in a name. `version` is frontmatter; `order-v2` is what a
  swap is for, and only as a last resort when no better name exists.
- **Names are permanent.** Renaming an entity is a swap: new entity at
  `version: 1`, `supersedes` edge on the successor, referrers migrated one at a
  time, the old one set to `deprecated` and kept forever. Treat any "just rename
  it" instinct as a swap proposal and say so before touching the tree.

## Smells to raise during review

| Smell                                                | Likely cause                                      |
|------------------------------------------------------|---------------------------------------------------|
| One product containing everything                    | Layers modelled as the system; decompose (H1, H8) |
| A product per team                                   | Org chart modelled instead of deliverables (H1)   |
| Every protocol at the solution root                  | Product boundaries drawn wrong (H4)               |
| The same datamodel name in two subtrees              | Copy instead of reference (H3, H9)                |
| A component with an empty `relations`                | Mis-modelled or dead (H6)                         |
| An "auth" or "audit" concern inside several products | Cross-cutting product missing (H7)                |
| A component nested under something it merely calls   | Composition confused with dependency (H9)         |
| Deep nesting with one child at each level            | Nesting used as taxonomy, not composition         |

On an **existing** catalog, these smells are the `catalog-reviewer` agent's remit —
dispatch it for a full audit rather than re-deriving the tree by hand.

## Additional resources

- **`${CLAUDE_PLUGIN_ROOT}/skills/solution-design/references/worked-example.md`** —
  one paragraph of prose about an online shop walked to a proposed SRN tree, with
  the question that produced each decision, the alternatives rejected, and the
  open questions handed back. It lands on the shape shipped at `solutions/acme/`,
  so the result can be read against real files.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`** — the distilled rules,
  used when `framework/spec/` is not on disk.
- **`solutions/acme/`** — the worked fixture, when the repository is present.
  Read `index.md`, then `product/shop/index.md`, then
  `product/shop/component/checkout/index.md`.
