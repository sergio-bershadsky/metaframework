---
name: automation-content
kind: product
version: 1
title: Automation content
summary: The packs the project bundles and the registry the rest are installed from — the product whose unit of delivery is not a process.
status: review
owner: sergio-bershadsky
lifecycle: active
primary-actors:
  - /actor/pack-author
  - /actor/automation-operator
tags:
  - packs
  - content
  - extensibility
---

A pack is the unit of content deployment: a directory holding actions, sensors,
rules, aliases and a configuration schema, installed into a running platform and
registered with it. This product is the packs the project ships in the box, plus
the registry every other pack comes from.

It is the only product in this catalog whose deliverable is not a process, and
that is precisely why it is a product rather than a folder inside
[platform](srn://stackstorm/product/platform): a pack has its own author, its
own release, its own installation event and its own compatibility question, none
of which are the platform's.

## Two components, and a contract that is neither

- [bundled-packs](srn://stackstorm/product/automation-content/component/bundled-packs)
  — the packs installed by the platform itself.
- [stackstorm-exchange](srn://stackstorm/product/automation-content/component/stackstorm-exchange)
  — the registry, an `external` component because something here has to name it
  in an edge.

The third thing this product owns is the **pack contract** itself — the schema
language a pack declares its configuration in, and the file layout a pack must
have to register. That is a datamodel rather than a component, and it lives in
this product's own `datamodel/` bucket.

## Why this product carries the framework's sharpest strain

A pack is installed at runtime, unpacked into a directory on the platform's
host, given a Python virtual environment of its own, and then its code is
**executed** inside the processes that host it. The component kind offers
`library` for a build-time artifact that runs inside its consumers, and
`content` for something consumed by being *read*. A pack runs inside its
consumers and is not a build-time artifact; it is executed and not read. Neither
value is true, and the missing concept — a runtime-installed executable plugin
bundle — is not one of the ten.

A sibling survey in this repository reached the same gap from an unrelated
codebase and recorded it in the same words: `library` is the nearest fit and the
nuance is a paragraph. Two catalogs sharing no content, arriving at one hole, is
the pattern that justified appending `content`, `application` and
`specification` to the enum in the first place — and none of those three covers
this one. The argument with its evidence is on
[bundled-packs](srn://stackstorm/product/automation-content/component/bundled-packs).

## What is out of scope

Everything inside a pack this project does not ship. The registry holds a large
and moving population of third-party packs; describing any of them would be
describing somebody else's integration, and counting them would be quoting a
marketing figure rather than measuring anything.
