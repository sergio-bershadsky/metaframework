# Philosophy — what this catalog is for, and what it is becoming

> Read this before deciding *how much* to write, *how precise* to be, or
> whether a machine-readable artifact is worth the effort. Every other
> reference in this bundle says what is legal. This one says what the work is
> **for**, and it is the thing that most often makes the difference between a
> catalog that gets used and a catalog that gets stale.

There are two ideas, and the second is the one people miss.

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

## The honest status of idea 2

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
