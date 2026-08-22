---
name: pack-author
kind: actor
version: 1
title: Pack author
summary: Whoever writes an integration pack — actions, sensors, rules and a config schema — for other people to install into their own StackStorm.
status: review
owner: sergio-bershadsky
actor-type: human
goals:
  - Package an integration once and have it installable into somebody else's platform unchanged.
  - Declare the configuration a pack needs without shipping anyone's credentials in it.
  - Write an action in Python or as a script without learning the message bus underneath.
  - Get a pack accepted into the registry other operators install from.
relations:
  uses:
    - /product/automation-content/component/bundled-packs
tags:
  - contributor
  - primary
---

The actor the content product exists for, and the reason
[automation-content](srn://stackstorm/product/automation-content) is a product
rather than a folder inside the platform. A pack author is usually not employed
by the organisation running the platform their pack ends up in — a vendor
writing an integration for their own API, a community contributor, or an
operator generalising something they built in-house.

## Why this is not an automation operator

The two roles differ in the direction they face. An
[automation-operator](srn://stackstorm/actor/automation-operator) consumes packs
and answers to an incident; a pack author produces packs and answers to whoever
installs them. They diverge concretely at configuration: the operator supplies
values, the author declares the *schema* those values must satisfy, and that
schema is the pack's public contract with every installation it will ever land
in.

The same person frequently plays both roles. That is exactly the case the actor
kind is built for — one actor per role, `tags` to group them — and merging them
because one body performs both would erase the only interesting sentence about
either.

## The contract this actor writes, and the one the framework cannot hold

A pack's configuration contract is a schema file inside the pack, in a schema
language with nested objects, lowercase key names and its own way of marking a
secret. Instances of it land beside the pack at install time. That shape is not
expressible as a `usage: config` datamodel in this framework, and the finding is
argued where the evidence sits, on
[bundled-packs](srn://stackstorm/product/automation-content/component/bundled-packs).
It is worth naming here because it is *this actor's* contract that has nowhere
to go.
