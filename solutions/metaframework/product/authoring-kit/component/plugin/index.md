---
name: plugin
kind: component
version: 3
title: Claude Code plugin
summary: The deliverable itself — seven skills, three commands, one read-only agent and a manifest, shipped and versioned as one Claude Code plugin whose only runtime is Claude.
status: review
owner: sergio
component-type: content
lifecycle: released
relations:
  uses:
    - ../reference-bundle
  depends-on:
    - /product/portal/component/catalog-loader
  implements:
    - /requirement/additive-only-evolution
tags:
  - plugin
  - claude-code
  - authoring
---

`marketplace/plugins/metaframework/` minus `skills/_shared/` — which is
[reference-bundle](srn://metaframework/product/authoring-kit/component/reference-bundle)
and holds the one boundary inside this product that earns a second component.
Everything else is here, because everything else ships, versions, fails and is
owned together: `.claude-plugin/plugin.json` declares one name and one version,
`0.1.0`, and there is no unit of delivery smaller than that.

## What a Claude Code plugin is, stated plainly

A directory with a `.claude-plugin/plugin.json` manifest, auto-discovered
content in three sibling directories, and no build step. **Skills**
(`skills/*/SKILL.md`) are procedure documents a model loads when a request
matches the trigger phrases in the skill's `description` — nothing routes,
matching is the routing. **Commands** (`commands/*.md`) are slash commands.
**Agents** (`agents/*.md`) are subagent configurations — a prompt plus a tool
allowlist. A **marketplace** is a repository carrying
`.claude-plugin/marketplace.json` that lists installable plugins;
`marketplace/.claude-plugin/marketplace.json` lists exactly one, `source:
"./plugins/metaframework"`. Install is `/plugin marketplace add …` then
`/plugin install metaframework@metaframework`.

None of that is this project's invention. It is Claude Code's plugin contract,
and this catalog names it rather than wrapping it in vocabulary of its own.

## The seven skills

A skill is a feature of this component, not a component: no skill can ship,
version, fail or be owned separately from the plugin that carries it. The seven
`SKILL.md` files are this component's artifacts on disk — the same way
`schema.json` is a datamodel's artifact — and the cut between them is argued in
[0001-skills-organised-by-activity](srn://metaframework/product/authoring-kit/adr/0001-skills-organised-by-activity):
by activity, never by entity kind.

| Skill              | Owns                                                                                                                  |
|--------------------|-----------------------------------------------------------------------------------------------------------------------|
| `solution-design`  | Many entities at once, before any file exists: interview, decomposition heuristics, proposed SRN tree, sign-off gate. |
| `add-entity`       | One entity of a mechanical kind — everything except datamodel and protocol.                                           |
| `model-data`       | One datamodel: `schema.json`, canonical `$id`/`$ref`, `x-srn`, the promotion decision.                                |
| `protocol-design`  | One protocol: participants, NCA placement, `transport.yaml`, `workflows/`, `states.json`, `arazzo.yaml`.              |
| `evolve-entity`    | Anything already published: additive edit with a version bump, or the swap procedure.                                 |
| `validate-catalog` | Legality: run the portal's check, read the cascade, know what it does not cover.                                      |
| `review-solution`  | Judgement: a ranked architectural review, read-only, backed by `catalog_facts.py`.                                    |

That table used to carry a **Size (lines)** column, and it is gone under
[0018-measured-facts-are-derived-or-dated](srn://metaframework/adr/0018-measured-facts-are-derived-or-dated):
seven skills times two or three operands is fifteen `wc -l` results that every
edit to the kit falsifies, and they were in fact false. What the column was
really being read for survives without a digit. In every skill but `model-data`
the `references/` outweigh the `SKILL.md` that loads them, which is the
progressive-disclosure rule holding; `model-data` is the exception because its
single reference file is one worked pair rather than a body of procedure. `review-solution`
is the only skill that ships a script. And `_shared/references/` is larger than
any single skill's own files, which is the point of it being shared.

Three seams inside the table are load-bearing. The three creation skills are
disjoint by kind — the dispatch rule is a three-row table stated once, in
`commands/entity-new.md` — and `add-entity` explicitly disclaims `datamodel` and
`protocol` because those two kinds own artifact contracts. The two audit skills
are disjoint by question: `validate-catalog` asks "is it legal?",
`review-solution` asks "is it any good?", and they have different evidence and
different authority. And `evolve-entity` is the only part of the kit permitted
near a published entity — every creation skill and every command hands off to it
by name, because "the framework forbids removing, renaming, narrowing and
moving, and the instinctive fix is usually one of those."

Two of its positions are worth reading in full: `title` is free while `name` is
the address (fix the wording in place; the rename-swap is for when the concept
changed), and never delete — with one honest exception, an entity no commit has
ever contained, which `git log` must prove rather than the author assume.

## The three commands, and the discipline that keeps them thin

`solution-new.md`, `entity-new.md` and `catalog-check.md` route and do nothing
else. `/solution-new` → `solution-design`;
`/entity-new` → `model-data`, `protocol-design` or `add-entity` by kind;
`/catalog-check` → `validate-catalog`. Each states in its own wording that it is
not the procedure — "Do not improvise a layout / frontmatter / a diagnosis from
this file" — so no rule has two homes to drift between. `/catalog-check` is the
only place in the plugin that declares `allowed-tools` at all. No fourth command
exists: `evolve-entity` and `review-solution` are reachable only through trigger
phrases or a hand-off from another skill, an asymmetry the plugin ships without
recording a reason.

## The agent, and why it is weaker than the skill it mirrors

`agents/catalog-reviewer.md` runs `review-solution`'s question as a
background subagent. It is read-only and says so twice — "You are read-only.
Never edit files." — and it declares `tools: Read, Grep, Glob`. **No Bash.** The
skill's evidence step runs
`skills/review-solution/scripts/catalog_facts.py`, stdlib-only Python that
resolves a solution into one graph and print a census plus
twenty-three `R_`-coded candidates. The script's own docstring bounds its
authority — "This is a REVIEW AID, not a validator", "Every finding it prints
is a CANDIDATE", and "several checks are heuristics that a well-modelled
catalog will trip for good reasons." The agent
cannot run it and audits from the checklist by grep alone. Anyone dispatching
the agent expecting the skill's evidence base gets a weaker one, and nothing in
the plugin says so.

## The edge to the portal, and what this component owns no code for

`depends-on:
[catalog-loader](srn://metaframework/product/portal/component/catalog-loader)`
— the plugin documents enforcement it does not perform. `validate-catalog` is a
reader's manual over `framework/portal/src/lib/catalog`; the pass condition it
teaches is `metaframework check`, the published CLI, with
`cd framework/portal && npx vitest run src/lib/catalog` kept only as a fallback
for work inside this repository — and the skill says in as many words that
earlier versions of it told authors to vendor the framework repository because
that CLI did not yet exist. What the manual
adds is what the diagnostics do not say for themselves: a cascade order
(`E_SRN_*` on paths first, then `E_FM_SCHEMA`, then the entity's own `E_FM_*`,
then references, then warnings), a code → cause → fix table written as causes,
and an explicit inventory of what a green run does not prove.

The manual used to be where the plugin was stale: it named a fixed number of
test files and showed a pass line quoting that number, in a directory that has
gained files steadily since. That passage is gone, and the CLI is why — a
`metaframework check` run prints its own totals, so the skill no longer has to
quote any. Nothing, however, detects that a claim in this plugin stopped being
true, which is the point of
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec).

## The obligation it carries

`implements` names
[additive-only-evolution](srn://metaframework/requirement/additive-only-evolution),
and the edge is the graph form of a sentence that requirement already carries:
"AC-1 through AC-3 are held by author discipline and by the authoring kit's
`evolve-entity` skill, which owns the additive-versus-swap decision." That is a
satisfaction claim, and it stood in prose alone until 2026-08-21 —
`W_REQ_UNIMPLEMENTED` on a `must` was reading the edges, which said nobody had
claimed it.

The claim is exactly as strong as the mechanism, and the mechanism is a skill a
model reads: `evolve-entity` is the only part of the kit permitted near a
published entity, and every creation skill and command hands off to it by name
because the instinctive fix for a bad field is a removal, a rename or a narrowing
— all three forbidden. Nothing here fails a build. AC-4's `E_VER_REGRESSION`
lives in
[git-history](srn://metaframework/product/portal/component/git-history) and is
never run over `solutions/`, so it is deliberately not a second `implements`
edge: a check that never executes against the catalog satisfies nothing about
it. The requirement's own "What enforces this" section — "Almost nothing, and
the honest inventory matters more than the principle" — stays true beside this
edge, because `implements` says who holds the rule and not who proves it.

## What it is not

- **No runtime but Claude.** Every line of it is prose or Python read inside a
  Claude Code session. Portability to other agent runtimes is aspiration and is
  deliberately not modelled here.
- **No writes to the portal.** Nothing in the portal reads this directory;
  nothing here calls the portal beyond telling a reader to run its test suite.
- **No release.** Zero git tags, no changelog, no publish step, no registry
  entry. The documented install path in `marketplace/README.md` is an absolute
  local filesystem path on the author's machine, with "from a git remote, point
  `marketplace add` at the repository instead" offered untested. `lifecycle:
  released` is true of the thing existing and being used from this repository;
  distribution beyond it has never happened.

## The `component-type`

`content`: a versioned content artifact, consumed by being read — by a person
or a model — and shipped into a host runtime it does not own. That is this
component exactly. The host is Claude Code; the content reaches it by
`/plugin marketplace add` then `/plugin install`, versioned by `plugin.json`'s
own `0.1.0`; its documents are the `SKILL.md`, command and agent files listed
above as artifacts; and its fidelity story is
[kit-works-without-the-spec](srn://metaframework/product/authoring-kit/requirement/kit-works-without-the-spec)
— nothing automatic keeps the prose true of the system it describes, and that
requirement is where the miss is recorded.
