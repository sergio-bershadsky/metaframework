# Philosophy — what this catalog is for, and what it is becoming

> Read this before deciding *how much* to write, *how precise* to be, or
> whether a machine-readable artifact is worth the effort. Every other
> reference in this bundle says what is legal. This one says what the work is
> **for**, and it is the thing that most often makes the difference between a
> catalog that gets used and a catalog that gets stale.

Three ideas. The second is the one people miss, and the third is the one that
keeps the catalog from rotting into a project tracker.

## 1. It is component-driven product management

The unit of thought is the **component**: a thing that ships, versions, fails,
and could be owned by a team. Products are the ownership and funding line above
them; capabilities are what the business can *do*, above both; journeys are how
an actor actually walks through it; metrics are how anybody knows.

Two sources, deliberately mixed:

- **Atlassian Compass**, for the definition of the unit and for the discipline
  that a component is "the combined output of a software engineering team" —
  plus the tiering instinct, adapted here as `criticality` and stripped of its
  SLA semantics (see `decomposition.md` for what was taken and what was left).
- **Canonical practice** — the ADR tradition, the Backstage domain/system/
  component model, MoSCoW, C4's insistence that a diagram answers one question.

What this repository adds on top of both is the thing Compass and Backstage
leave to a wiki: **the decision record sits beside the structure, in the same
tree, under the same review**. A catalog that says what a system *is* without
saying why it is that, and not something else, is a snapshot rather than a
description. Half of what a reader arrives for is the *why*.

Practical consequence for an author: an entity page whose Alternatives section
is empty is usually an entity nobody actually decided. Write the rejected
options. They are the part that stays useful in a year.

## 2. It is a knowledge base **and an intermediate representation**

This is the half that changes how you write.

The catalog is not documentation *about* systems. It is meant to become a
**machine-consumable representation** that other codebases depend on directly —
the single upstream definition, with the described system downstream of it
rather than beside it.

Concretely, the direction of travel:

- **A datamodel's `schema.json` is not a picture of a type. It is the type.**
  It carries a real `$id`, a dereferenceable canonical URL, and `x-srn`, so a
  project described here can `$ref` it from its own code, generate from it, and
  validate against it. Not "kept in sync with" — *the same file*.
- **An environment's `config.yaml` is meant to become the single point of
  configuration** for a component that lives in another repository and does
  real work. Today it names keys and their origin so a human can review the
  configuration surface; the intent is that the deployment reads it, so that
  the reviewed description and the running configuration cannot disagree.
- **A protocol's `transport.yaml`, a journey's `journey.yaml`, a state
  machine's `states.json`** are the same bet at a smaller scale: structured
  enough to be executed, generated from, or checked against, not merely read.

And the reason this matters *now*: **agentic development**. A model doing real
work on a codebase needs an accurate, addressable, machine-readable account of
what the system is, what its contracts are, and why it is shaped that way. That
is exactly this catalog. `grep`-ability, stable identity, closed enums, an
ontology that cannot be extended casually, and text that is greppable rather
than rendered — these are not stylistic preferences. They are what makes the
tree usable as an **IR**: the thing a tool reads, not the thing a person is
supposed to have read.

### This explains decisions that otherwise look like fussiness

If you have wondered why the rules are this strict, this is why:

| The rule | Why an IR needs it |
| --- | --- |
| SRN ≡ disk path ≡ schema URL | One identity, resolvable from inside the tree, from a URL, and from another repository's `$ref`. |
| Additive-only evolution; names are permanent | Downstream consumers hold references. A rename is a broken build somewhere else, not a tidy-up. |
| A closed ontology, closed enums | An open vocabulary produces nodes no consumer can branch on. |
| Structured artifacts beside prose | Prose is for the reviewer; the YAML/JSON beside it is for the tool. |
| Every diagram derived, never drawn | A drawing is a copy, and a copy drifts. An IR cannot contain a fact nothing can check. |
| Fail-soft loading with named diagnostics | A consumer needs to know *which* rule broke, not that "it didn't load". |

### Write for both readers, and say which is which

Every entity has two audiences: a person deciding whether the description is
any good, and a machine that will consume it. When they conflict:

- Put the **claim** in prose, and the **data** in the sibling artifact. Never
  encode a fact only in a sentence if a consumer will need it.
- Make measured numbers greppable — a file path, a line number, a command with
  its output and the date it was run. "Roughly 300 entities" is unusable; `find
  solutions -name index.md | wc -l` returning 324 on 2026-08-20 is a fact.
- Do not put a fact in a diagram that is not also in the text.

### The honest status of idea 2

State this plainly when someone asks, because overselling it is the fastest way
to lose trust in the catalog:

**Nothing consumes this as an IR yet.** The mechanisms are built and the
consumers are not. `https://schemas.metaframework.dev` is an identity constant
that resolves nowhere; the schema-serving route exists and has no external
caller; `config.yaml` is descriptive, and no deployment reads it; no codebase
anywhere `$ref`s a schema out of a catalog.

So idea 2 is a **direction that has already paid for itself in design
decisions** rather than a capability anyone can use today. Write as if the
consumer exists — that is the discipline that will make it possible — and never
claim that it does.

## 3. State lives here; transition lives in the task manager

The catalog answers **what is true now**, and — where a document is still
`draft` or `review` — **what is intended**. It does not answer *how we get from
one to the other*. That is a task manager's job (Jira, Linear, Asana), and the
two must not both try, because the moment they do the answer exists twice and
one copy starts lying.

**The seam is the version.** A unit of work, expressed in this methodology, is:

> take `srn://acme/product/shop/component/checkout` from v3 to v4

The ticket owns the transition — who, when, in what order, blocked by what, at
what estimate. The catalog owns the endpoints: v3 is on disk and in git, v4 is
what the reviewed description says it will be. Neither duplicates the other, and
a reader can always ask git which one they are looking at.

### What this rules out of the ontology, deliberately

If you catch yourself wanting one of these fields, the *ticket* wants it, not
the entity:

- No assignee, no reviewer queue, no sprint, no iteration, no estimate, no due
  date, no start date, no blocked-by, no "in progress".
- No workflow states. `status` is the review state of the **description**
  (`draft | review | approved | deprecated`) and it is not a kanban column —
  there is no "doing", because doing is the transition and transitions are not
  described here.
- No burndown, no velocity, no percent-complete. A `metric` measures the system,
  never the project delivering it.

### The current/desired distinction is already in the frontmatter

It is the `status` × `lifecycle` cross, and this is the clearest way to read it:

| `status` | `lifecycle` | What the page is |
| --- | --- | --- |
| `approved` | `released` | **Current state.** Reviewed description of a thing that exists. |
| `approved` | `planned` | **Desired state.** A reviewed design; the transition is a ticket. |
| `review` | `planned` | A *proposed* desired state — not yet agreed, so nothing should be built from it. |
| `draft` | `released` | Current state, badly described. A documentation ticket, not a delivery one. |

The design-first normal case is row two, and it is the one that makes the
division of labour work: the description is agreed and stable *before* anybody
opens a ticket, so the ticket can be about delivery rather than about what was
meant.

### Practical guidance for an author

- When somebody asks you to record *progress*, decline and say where it goes. A
  half-built component is `lifecycle: in-development` and nothing more — the
  percentage lives in the tracker.
- When a change is agreed, the artifact is a **version bump plus a description
  of the new state**, not a changelog of the work. Evolution rules
  (`evolution.md`) are what make v3→v4 a reviewable diff.
- A good ticket title in this methodology names an SRN and a version delta. If
  a ticket cannot be phrased that way, it is either not a change to the system
  or the catalog is missing the entity it would change.

### The honest status of idea 3

Nothing integrates. No ticket anywhere links to an SRN, nothing derives a work
item from a version delta, and the portal has no notion of a task manager. The
division of labour is a *rule for authors* today, not a wired-up workflow — and
the rule is the valuable half, because it is what stops the catalog decaying
into a project-tracking tool that nobody updates.
