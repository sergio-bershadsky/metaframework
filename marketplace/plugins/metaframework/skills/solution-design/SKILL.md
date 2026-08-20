---
name: solution-design
description: This skill should be used when the user asks to "design a solution", "start a new metaframework catalog", "model our system as a catalog", "how should I split this into products and components", "propose an SRN tree", "is this decomposition right", "should this be two products or one", "is this a product or a component", "should this datamodel be promoted", "what can the business do", "map our capabilities", "is this a capability or a product", "map the customer journey", "how would we measure this", or describes a whole system in prose that has to become a catalog. It owns the interview — which starts at capabilities, above the deliverables — the decomposition heuristics, the proposed SRN tree, and the review gate — everything that happens BEFORE any file is written, and it covers the shape of MANY entities at once. For creating ONE entity whose placement is already settled, use `add-entity`, `model-data` or `protocol-design` instead; for judging a catalog that already exists, use `review-solution`.
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

**First, read `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/philosophy.md`.**
It is short, it is not a rule file, and it decides things the rule files cannot:
how much to write, how precise to be, and whether a machine-readable artifact
beside the prose is worth the effort. The catalog is component-driven product
management *and* an intermediate representation meant to be consumed by other
codebases and by agents — an author who has only read the placement grammar
will produce a tree that is legal and useless.

This skill carries procedure and judgement. Legality lives in the specification.

- If `framework/spec/` exists in the repository, it is **authoritative** — read
  `index.md`, `srn.md`, `structure.md`, `frontmatter.md`, and the relevant
  `kinds/*.md`.
- Otherwise read the distilled copy bundled with this plugin:
  `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/` — `srn.md` (the
  consolidating principle, placement grammar, the relative-reference trap),
  `structure.md` (buckets, artifacts, the protocol NCA rule), `frontmatter.md`
  (per-kind required fields, the closed relation-edge set), `schemas.md`
  (`$id`, `x-srn`, canonical schema URLs), `protocols.md` (the protocol artifacts),
  `environments.md` (environment, actor, ADR, requirement), `journeys.md` (the
  `journey.yaml` mini-spec and the product-crossing check), `evolution.md`
  (names are permanent), `decomposition.md` (the component tests and the
  granularity band — judgement the spec deliberately leaves open, so it applies
  even when `framework/spec/` is on disk). The business layer is spread across
  those on purpose:
  capability and metric fields and the `realizes`/`measures` edges are in
  `frontmatter.md`, their placement is in `structure.md`, and only the journey
  artifact needed a file of its own.

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

#### 1a — The business, asked first

Start one level above the deliverables. A catalog that opens with "what do you
ship" gets an inventory; one that opens with "what can the business do" gets an
inventory **and** the frame that judges it — a product nobody can attach to a
capability is a deliverable with no stated purpose, and that is worth finding in
the interview rather than two quarters later.

| Ask                                                                | Decides                                        |
|--------------------------------------------------------------------|------------------------------------------------|
| What can the business *do* that it would still do after a total rewrite on a different stack? | capabilities (solution level) |
| Say each one as a sentence starting with a verb. Whose words are those — yours, or engineering's? | capability `title` vs a service name in disguise |
| Which of those does *this* solution carry, and which are somebody else's? | capabilities in scope, and `scope.out`       |
| What path does each actor take, first contact to outcome?          | journeys (solution level), one per outcome     |
| Where does that path leave one team's territory and enter another's? | the crossings a journey must document          |
| How would you know each capability is going well — one number?     | metrics, and the `measures` edge on each       |
| Is that number a floor or a ceiling, and over what period?         | `direction` and `window`                       |

A capability answer that changes when you imagine replacing every system behind
it was a description of the implementation: it is a component or a product, and
belongs in 1b. Push back at the time — asking first buys nothing if the list is
quietly a list of services.

#### 1b — The build

| Ask                                                        | Decides                                      |
|------------------------------------------------------------|----------------------------------------------|
| What do you ship, and who gets paged when it breaks?       | products, and `owner` on each                |
| Which capability does each of those let the business do?   | `realizes` edges — and the gaps in both directions |
| What has its own roadmap, funding, or release cadence?     | product vs component                         |
| What could be deployed, released, or replaced on its own?  | components                                   |
| What always changes in the same commit as something else?  | components to merge                          |
| What runs *inside* another process rather than beside it?  | `component-type: library`                    |
| What holds state / fronts others / has no inbound surface? | `datastore` / `gateway` / `job`              |
| Is each of those built, being built, or only agreed?       | `lifecycle` on every component               |
| What talks to what, and across which ownership boundary?   | protocols, and where they sit                |
| Which of those crossings is a contract you would version?  | protocol vs a plain `depends-on` edge        |
| Walk me through the journey again, naming the actual components this time | `touches` per journey step, in order |
| At each hand-off — is there a conversation, or does the human carry it? | `protocol:` on the step, or `protocol: none` |
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

This is the point where the cut gets made, so before any candidate earns the
word **component**, put it through the four component tests, in order: is it a
unit of **delivery and decision** (ships, versions, fails, own-able separately
from its parent)? does its boundary **carry an edge** (something outside it
references it)? does it have its **own failure mode**? could a **team own it**?
A candidate failing all four is a feature, a file, or a chapter — content of a
component: it becomes a table in the parent's prose and its files the parent's
artifacts, not an entity. Hold each product to the **granularity band** — a
handful of components, not one and not twenty — and hold the density
*consistent across products*, because a catalog where one product has two
components and its neighbour has twenty has stopped meaning one thing by
"component". When in doubt, do not split yet: merging later destroys prose and
edges through a swap, splitting later is additive and cheap. The tests, the
band, and the anti-patterns this catalog has already paid for are in
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/decomposition.md`.

### Phase 3 — Propose the tree, then STOP

Present four things and ask for sign-off before touching the filesystem:

1. **The annotated SRN tree** — every entity, its kind bucket, and a few words on
   what it is.
2. **The coverage table** — capability by capability: what realizes it, what
   measures it, which journeys pass through it. It is a small table and it is
   where the design fails visibly: an empty realizer cell is **H11**, a cell
   spanning four products is **H12**, an empty metric cell is **H14**. Present
   the empty cells as findings, not as a to-do list to be filled in silently.
3. **The decision table** — each judgement call, the alternative rejected, the
   heuristic that decided it.
4. **The open questions** — anything answered with under 80% confidence.

### Phase 4 — Write, targets before referrers

Write in dependency order so the check stays meaningful: solution `index.md` →
capabilities → actors and environments → products → components (outermost
first) → datamodels → protocols → journeys → requirements, metrics and ADRs. A
referrer written before its target produces `E_SRN_DANGLING`.

Two entries there are load-bearing. **Capabilities come first**: they reference
nothing and are referenced by `realizes` from almost everything, so they are the
only kind writeable before anything else exists. **Journeys come after
protocols**, because every `touches` and `protocol` in `journey.yaml` must
already resolve — written early, a journey is a page of `E_SRN_DANGLING`.

Delegate each entity to its kind's skill rather than hand-rolling frontmatter.
Kind-required fields are the most-missed rule in the framework: `vision` on the
solution, `lifecycle` on a product, `component-type` **and `lifecycle`** on a
component, `usage` on a datamodel, `participants` + `style` on a protocol,
`actor-type` + `goals` on an actor, `environment-type`, `requirement-type` +
`priority`, `decision-status` + `date` on an ADR, `actor` **and a
`journey.yaml`** on a journey, and `metric-type` + `target` + `window` +
`direction` + a `measures` edge on a metric. A capability requires none — it is
common fields, a verb-phrase `title`, and its inbound edges.

`lifecycle` on a component is the one to expect resistance on, because it looks
like `status` and is not: `status` is the review state of the **description**,
`lifecycle` is the delivery state of the **thing described**. `status: approved`
with `lifecycle: planned` is the design-first normal case, not a contradiction.

What a settled product's frontmatter looks like, field by field, is in
`references/worked-example.md` under **"A settled product, field by field"**.

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

**H11 — A capability realized by zero components is aspiration, not
architecture.** Say so in the proposal rather than letting the list stand. Every
other kind describes something we built; a capability is the one kind that can
be true of the business and absent from the system, which is why its emptiness
is the finding. Read it against `status`: a `draft` capability with no realizer
is the to-do list working as intended, an **`approved`** one is an agreed
description of something the business cannot do. The same finding recurs one
level down — a capability only a *product* realizes, with no component under it
carrying the claim, is a product asserting a doing nothing inside it performs.

**H12 — A capability realized by components in four or more products suggests
the product boundaries cut ACROSS the business rather than along it.** Four
deliverables holding slices of one business sentence makes every change to that
sentence a four-way negotiation. Two products realizing one capability is
ordinary — that is what capabilities are solution-level *for*; three is worth a
question; four is a decomposition finding. It is **H4** (protocols piling up at
the root) read from the other end: both are the shape a catalog takes when the
products were drawn from the org chart and the work runs across them. Count it
before Phase 4, because the fix is a redraw and a redraw is free only before
anything is written.

**H13 — A journey step with no protocol behind it is an undocumented
integration.** Applies exactly at a product crossing: consecutive steps with
different owning products, and the later one naming no `protocol`. The path
leaves one product and arrives in another, and the catalog says nothing about
how — which finds integrations that exist in production and in nobody's
description. The fix is a new protocol entity, never an edit to the journey. If
there genuinely is no system conversation — the actor retypes a number, or
follows a link from an email — write `protocol: none`: a claim a reviewer can
grep for, as against an omission nobody can tell from forgetfulness.

**H14 — Every `must` requirement should trace to a capability, and every
capability to at least one metric.** Both halves are about the same hole. A
`must` that serves no capability is an obligation with no business reason
attached — either the reason was never stated, or the requirement is a
technical preference wearing a `must`; trace it through the component that
`implements` it to what that component `realizes`, and if the chain does not
close, that is the finding. A capability with no metric is a claim nobody can
check: the catalog says the business can do this and offers no number that
would say whether it does it well. Trace, do not enforce — the spec raises no
`W_CAP_UNMEASURED`, because a warning that fires on every capability the day
the kind is adopted is a warning nobody reads. It is a column in the coverage
table and a question in the interview, not an alarm.

## Naming

- Every segment matches `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 characters. `Shop`,
  `order_placement`, `-cart` are `E_SRN_SYNTAX`.
- The eleven reserved kinds — `product`, `component`, `datamodel`, `protocol`,
  `actor`, `environment`, `adr`, `requirement`, `capability`, `journey`,
  `metric` — may never be a solution or entity name. They appear only as bucket
  directories.
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
| A capability list that reads like the service list   | The rewrite test was never applied (1a, H11)      |
| One capability realized across four+ products        | Products cut across the business (H12)            |
| A journey whose every crossing has no protocol       | Integrations exist and are undescribed (H13)      |
| A journey that needs a thirteenth step or a branch   | Two journeys with two outcomes, filed as one      |
| Every component `lifecycle: released` on day one     | `lifecycle` filled in by habit, not by the test   |
| A metric with two subjects and one definition        | Two metrics; one number, one metric               |

On an **existing** catalog, these smells are the `catalog-reviewer` agent's remit —
dispatch it for a full audit rather than re-deriving the tree by hand.

## Additional resources

- **`${CLAUDE_PLUGIN_ROOT}/skills/solution-design/references/worked-example.md`** —
  one paragraph of prose about an online shop walked to a proposed SRN tree, with
  the question that produced each decision, the alternatives rejected, and the
  open questions handed back. It lands on the shape shipped at `solutions/acme/`,
  so the result can be read against real files.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/journeys.md`** — the
  `journey.yaml` mini-spec in full: step keys, the 2–12 cap, the no-branching
  rule with its argument, and the mechanical definition of a product crossing.
  Read it before proposing any journey; **H13** is only as good as that
  definition.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/decomposition.md`** — the
  four component tests, the granularity band, the merge/split asymmetry, and
  the three anti-patterns with the receipts from this repository's own history.
  Read it at Phase 2, before any cut is proposed.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`** — the distilled rules,
  used when `framework/spec/` is not on disk.
- **`solutions/acme/`** — the worked fixture, when the repository is present.
  Read `index.md`, then `product/shop/index.md`, then
  `product/shop/component/checkout/index.md`.
