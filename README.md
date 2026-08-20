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
