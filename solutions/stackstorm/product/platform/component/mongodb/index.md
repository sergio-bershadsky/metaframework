---
name: mongodb
kind: component
version: 1
title: MongoDB
summary: The document store of record — every model the platform persists, including the encrypted key-value datastore — installed by the reference deployment and owned by nobody here.
status: review
owner: sergio-bershadsky
component-type: external
lifecycle: released
criticality: 1
relations:
  uses:
    - /environment/single-box
    - /environment/ha-cluster
    - /environment/dev-compose
tags:
  - persistence
  - infrastructure
---

Everything the platform remembers lives here: rules, actions and their runner
types, sensors, packs, executions and their history, traces, tokens and API
keys, and the key-value datastore whose secret values are encrypted before they
are written.

## The seam

The platform speaks to it through an object-document mapper inside
[st2common](srn://stackstorm/product/platform/component/st2common), configured
from the `[database]` section — host, port, database name, credentials and TLS
settings. That section is the whole contract: no component here knows anything
about the store beyond a connection and a set of collections.

The boundary this component documents is therefore a connection string and a
schema this repository owns on one side of it. Nothing about MongoDB's own
behaviour, storage engine or operational model is described, and nothing should
be — the `external` type exists precisely so an edge has somewhere to point
without the catalog pretending to describe somebody else's software.

## Why `external` and not `datastore`

The reference deployment installs it, so the reflex is to call it ours. It is
not: the solution owns the *deployment* and does not own the *software*, and the
two candidate types split on ownership of the software rather than on who ran
the installer.

Reading it the other way produces a worse catalog. Typing it `datastore` would
license the reader to expect this page to describe replication, indexes and
failure modes — none of which this survey has any business claiming — and would
put it in the same category as a store the project actually wrote.

The consequence for the framework is worth recording: two independently surveyed
real systems have now typed their bundled third-party stores `external`, and
`datastore` survives in this repository only in the invented fixture. A closed
enum value that no real catalog has ever used is a finding about the enum.

## What is not stated

Any replica count, version requirement or sizing figure on this page. The
clustered deployment's chart has defaults, and those are recorded where
deployment claims belong — in
[ha-cluster](srn://stackstorm/environment/ha-cluster)'s `topology.yaml` — rather
than asserted here as properties of the software.
