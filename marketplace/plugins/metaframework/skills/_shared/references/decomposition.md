# Decomposition — what earns the word "component"

> Distilled from this repository's own recomposition history and a measured
> comparison against Atlassian Compass ("What are components?",
> support.atlassian.com/compass) and the Backstage system model
> (backstage.io/docs/features/software-catalog/system-model). **When
> `framework/spec/` is present in the repository, it is authoritative and wins
> over this file** — but the calls made here are ones the spec deliberately
> leaves open: `structure.md` says where a component may live, never whether it
> deserves to exist. This bundled copy exists because an installed plugin can
> see neither the repo spec nor the history these lessons were paid for in.

The placement grammar accepts any tree. These tests decide which tree to
write — and they exist because this catalog has already written the wrong one.

## The component tests, in order

Put every candidate through all four before it earns an `index.md`:

1. **Delivery and decision.** Does it ship, version, fail, and could it be
   owned separately from its parent? A component is a unit of delivery and
   decision; a thing that can only move when its parent moves is a feature of
   the parent, whatever its directory looks like.
2. **The boundary carries an edge.** Is it referenced by something outside
   itself — a `uses` or `depends-on` from elsewhere, a protocol participant
   list, a journey step's `touches`? A boundary nothing crosses is a line on a
   map that changes no reading of the map.
3. **Its own failure mode.** Can it break in a way its siblings cannot, with a
   different symptom and a different fix? Two "components" that always break
   together and are always fixed together are one component described twice.
4. **A team could own it.** Compass's definition of the unit: "A dedicated
   team owns, develops, and operates a component." The tense is *could*, not
   *does* — a solo-owned catalog still has to imagine the team and ask whether
   handing this directory to it would be a coherent assignment.

A candidate failing all four is a **feature, a file, or a chapter** — content
of a component, not a component. Features become a table in the parent's
prose; their files become the parent's **artifacts**, exactly as `schema.json`
is a datamodel's artifact rather than its child entity.

## The granularity band

Backstage, on the system (this framework's product): "Typically, a system will
consist of at most a handful of components." Read the band from both ends: a
product with twenty components was cut by file layout or org chart, and a
product with exactly one either was never decomposed or is a component wearing
a product's clothes (heuristics H1/H2/H8 in the `solution-design` skill). But
the worst state is neither extreme — it is **inconsistent density across
products**. One product with two components beside a sibling with twenty means
the word "component" no longer denotes one altitude anywhere in the catalog,
and every comparison a reviewer would make across products silently compares
different things.

## Anti-patterns, each with this repository's own receipt

### Skill-as-component

The authoring-kit product was first catalogued as seven components, roughly
one per skill — `solution-design`, `entity-authoring`, `entity-evolution`,
`catalog-validation`, `architecture-review` (with `catalog-facts` nested under
it), `commands`, `reference-bundle`. A skill is a **feature**: it cannot ship,
version, fail or be owned separately from the plugin that carries it — one
`plugin.json`, one install, one version string moving for all of them. Six of
the seven failed every test above; the recomposed shape is **two** components,
the plugin and the reference bundle, with the skills as a table in the
plugin's prose and the `SKILL.md` files as its artifacts.

### Source-tree mirroring

The portal product carries twenty-one components nested three deep —
`component/diagrams/component/relation-graph` mirroring
`framework/portal/src/components/diagrams/relation-graph.tsx`, and so on file
by file. Git already stores the source tree; a catalog that re-states it adds
entities without adding decisions, and every refactor of the source then
demands a swap in the catalog (entities are never moved or renamed —
`evolution.md`). The smell is named here so the next product is not cut this
way; whether a standing tree gets recomposed is its owner's call, not a
reviewer's edit.

### Chapter splitting

The specification product was cut into `core-contracts` and `kind-contracts`
along a heading of its own `index.md` — the precedence sentence between the
two document groups. A precedence sentence is a relation between *chapters*,
and chapters fail the first test: neither half ships, versions, fails or is
owned apart from the other — every spec amendment in this repository's history
has touched both. A document set is one deliverable; its internal order is
prose, or at most an artifact.

## The asymmetry

Merging is destructive: two entities become one successor by the swap
procedure, their prose is rewritten, every inbound edge is migrated by hand,
and the deprecated pair stays on disk forever. Splitting is additive and
cheap: a new sibling entity, artifacts moved to it, referrers repointed at
leisure. The costs are not symmetric, so the default is: **when in doubt, do
not split yet.** A boundary can be added the day it earns its edge; an
un-earned boundary costs a swap to remove.

## Capability placement — a deliberate divergence from Compass

Compass models capability as a component **type** ("Capability — higher-level
product functionality with underlying components"): a node inside the delivery
tree. This framework models it as a solution-level **kind** with `realizes`
edges pointing up at it (`structure.md`, `frontmatter.md`). The divergence is
deliberate and load-bearing: because the capability stands outside every
product, "what realizes this?" is one reverse-edge query across the whole
solution, two products realizing one capability is writeable, and a capability
nobody realizes is a visible finding rather than an empty folder. Filing
capabilities as components would trade that queryable value graph for
Compass-compatibility nobody consumes. Do not "fix" it toward Compass.

## Observational versus contractual

Compass is **observational**: it aggregates live signal — deployment events,
incidents, scorecards — and answers "what is running right now?". This
framework is **contractual**: the catalog is the agreed description, the
description is the contract, and a divergence between catalog and reality is a
defect in one of the two, to be found by review and fixed by an edit or a
swap. The practical consequence: never read this catalog as monitoring, and
never let a dashboard-shaped instinct add "current state" fields that only an
external feed could keep true — `lifecycle` and `status` are the two
deliberate exceptions, and both describe agreements, not telemetry.

## Where the lessons were paid for

The drift defect class behind the reference bundle's existence is real and has
occurred twice: the bundle's `schemas.md` was created teaching `$id` as the
portal-serving URL and admitting sibling files "still show that retired form
in passing" (corrected in commit `dada3ba`; `git diff 4c317b4..dada3ba` shows
the rewrite), and `skills/validate-catalog/SKILL.md` said "Two files run"
after `framework/portal/src/lib/catalog` had grown to four test files —
recorded as a failed acceptance criterion on the authoring-kit's
`kit-works-without-the-spec` requirement. A distinct failure mode is the third
component test passing — which is precisely why the reference bundle is a
component and the skills are not.
