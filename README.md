# metaframework

A file-based framework for describing software solutions in a reviewable way.

A **solution** is described as a catalog of markdown + JSON/YAML files — products,
components, protocols, data models, actors, environments, ADRs, and requirements —
every entity addressable by a stable **SRN** (Solution Resource Name), every artifact
versioned additively, the whole tree readable by humans, AI, and the portal alike.

The **portal** (Next.js) renders the catalog as a dense dark-themed app with derived
diagrams: component graphs, protocol sequences, state charts, and schema inheritance
trees.

## Layout

```
framework/
├── spec/        # the framework's own specification, written in its own format
└── portal/      # Next.js portal (SSR + SPA)
solutions/
└── {solution}/{product}/{component}/{sub-component}/...
docs/
└── decision-record.md   # founding design decisions
```

## What this is for

Three ideas. The second explains why the first is enforced so strictly; the
third is what keeps the catalog from decaying into a project tracker.

### 1. Component-driven product management

The unit of thought is the **component** — a thing that ships, versions, fails,
and could be owned by a team. Products are the ownership and funding line above
them; **capabilities** are what the business can do; **journeys** are how an
actor actually walks through it; **metrics** are how anyone knows.

The philosophy is mixed on purpose: the definition of the unit and the tiering
instinct come from **Atlassian Compass** (`criticality` is its tier model
adapted, with the SLA semantics deliberately left behind), and the rest from
canonical practice — the ADR tradition, Backstage's domain/system/component
model, MoSCoW, C4's rule that a diagram answers one question.

What this adds on top of both is that **the decision record lives beside the
structure**, in the same tree, under the same review. A catalog that says what
a system *is* without saying why it is that, and not something else, is a
snapshot rather than a description.

### 2. A knowledge base *and* an intermediate representation

This is not documentation *about* systems. It is meant to become a
**machine-consumable representation that other codebases depend on directly** —
the single upstream definition, with the described system downstream of it
rather than beside it:

- A datamodel's `schema.json` is not a picture of a type — it *is* the type. It
  carries a real `$id`, a dereferenceable URL and `x-srn`, so a project
  described here can `$ref` it, generate from it and validate against it. Not
  "kept in sync with" — the same file.
- An environment's `config.yaml` is meant to become the **single point of
  configuration** for a component that lives in another repository and does the
  real work, so that the reviewed description and the running configuration
  cannot disagree.
- `transport.yaml`, `journey.yaml` and `states.json` are the same bet at
  smaller scale: structured enough to be executed or generated from, not merely
  read.

And the reason it matters now is **agentic development**. A model doing real
work on a codebase needs an accurate, addressable, machine-readable account of
what the system is, what its contracts are, and why it is shaped that way.
`grep`-ability, stable identity, closed enums, a closed ontology and text
rather than rendered artifacts are not stylistic preferences — they are what
makes the tree usable as an **IR**: the thing a tool reads, not the thing a
person is supposed to have read.

This is why the rules below are as strict as they are. SRN ≡ path ≡ schema URL
gives one identity resolvable from three directions. Additive-only evolution
exists because downstream consumers hold references, so a rename is a broken
build somewhere else rather than a tidy-up. Closed enums exist because an open
vocabulary produces nodes no consumer can branch on.

**Status, stated plainly: nothing consumes the catalog as an IR yet.** The
mechanisms are built and the consumers are not —
`https://schemas.metaframework.dev` resolves nowhere, the schema-serving route
has no external caller, and no deployment reads a `config.yaml`. Idea 2 is a
direction that has already paid for itself in design decisions, not a
capability anyone can use today.

### 3. State lives here; transition lives in the task manager

The catalog answers **what is true now** and — where a document is still `draft`
or `review` — **what is intended**. It does not answer *how we get from one to
the other*. That belongs to a task manager (Jira, Linear, Asana), and the two
must not both try, because the moment they do the answer exists twice and one
copy starts lying.

**The seam is the version.** A unit of work, expressed in this methodology, is:

> take `srn://acme/product/shop/component/checkout` from v3 to v4

The ticket owns the transition — who, when, blocked by what, at what estimate.
The catalog owns the endpoints: v3 is on disk and in git, v4 is what the
reviewed description says it will be.

So the ontology deliberately has **no assignee, no sprint, no estimate, no due
date, no blocked-by and no "in progress"**. `status` is the review state of the
*description*, not a kanban column — there is no "doing", because doing is the
transition. Current versus desired is already the `status` × `lifecycle` cross:
`approved` + `released` is the current state, `approved` + `planned` is an
agreed desired state whose transition is somebody's ticket.

As with idea 2: nothing integrates yet. No ticket anywhere links to an SRN and
nothing derives a work item from a version delta. It is a rule for authors, and
the rule is the valuable half — it is what stops the catalog decaying into a
project tracker nobody updates.

## Core principles

- **Filesystem is the database** — md with frontmatter + sibling JSON/YAML artifacts.
- **SRN ≡ disk path** — `srn://{solution}/{product}/{components…}/{kind}/{name}[@v]`
  maps 1:1 to a directory under `solutions/`.
- **Additive-only evolution** — never reduce; extend, or create a new version and swap.
- **Derived diagrams** — rendered from structured data, never hand-drawn (escape hatch aside).
- **Human + AI readable** — the catalog must make sense with `grep` alone.

## Licence

**[PolyForm Noncommercial 1.0.0](LICENSE)** (SPDX: `PolyForm-Noncommercial-1.0.0`).

Free for any **noncommercial** purpose — research, study, experimentation, hobby
projects — and for charitable organisations, educational institutions, public
research bodies and government institutions, whatever their funding. You may read
it, run it, modify it and redistribute it on those terms, provided the licence
travels with every copy.

**Not permitted:** any commercial use. That includes using it inside a company's
product or internal tooling, offering it or a derivative as a service, and selling
it or anything built from it. There is no revenue threshold and no grace period —
if the purpose is commercial, this licence does not cover it.

For a commercial licence, ask: [@sergio-bershadsky](https://github.com/sergio-bershadsky).

This is a **source-available** licence, deliberately not an open-source one: it
discriminates by field of endeavour, which is precisely what the OSI definition
forbids, so it carries neither OSI nor FSF approval and never will. Calling this
project "open source" would be inaccurate.
