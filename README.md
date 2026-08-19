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

## Core principles

- **Filesystem is the database** — md with frontmatter + sibling JSON/YAML artifacts.
- **SRN ≡ disk path** — `srn://{solution}/{product}/{components…}/{kind}/{name}[@v]`
  maps 1:1 to a directory under `solutions/`.
- **Additive-only evolution** — never reduce; extend, or create a new version and swap.
- **Derived diagrams** — rendered from structured data, never hand-drawn (escape hatch aside).
- **Human + AI readable** — the catalog must make sense with `grep` alone.
