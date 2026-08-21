---
name: config
kind: datamodel
version: 1
title: SigNoz configuration
summary: One retention knob on software this solution does not own — the contract states what the deployment must supply, never what the upstream project accepts.
status: review
owner: sergio
usage: config
abstract: false
tags:
  - configuration
  - external
---

[signoz](srn://metaframework/product/devops/component/signoz) is
`component-type: external`: operated here, written elsewhere. A config contract
on an external component is a narrow claim and worth stating precisely — it says
what *this* deployment must supply to the stack, not what the upstream project's
own configuration surface is. `SIGNOZ_TRACE_RETENTION_DAYS` is declared in
[production](srn://metaframework/environment/production)'s `config.yaml` and
somebody has to be the component that reads it; the alternative is an
environment-wide entry no contract knows, which is exactly the dead
configuration this join was built to notice.

## Not required, and the reason is arithmetic rather than principle

`production` calls the key *unset and required* and points at
[every-request-is-traced](srn://metaframework/product/devops/requirement/every-request-is-traced)
AC-6. That sentence is true of `production` and is a statement about a
deployment. A contract is a statement about a component, and this component also
runs in [compose](srn://metaframework/environment/compose), which declares no
retention at all — deliberately, because SigNoz there is a laptop's opt-in
profile rather than the machine sharing an instance with the workload it
watches.

Marking the key `required` would therefore print `W_ENV_CONFIG_MISSING` against
`compose`, and the finding would be false in its own words: the message is *a
process that will not start*, and ClickHouse starts perfectly well on its own
default. The honest reading is that an unbounded retention window is an
availability decision `production` must take and `compose` need not — which is
argued on this component's page and in `production`'s `topology.yaml`, where a
limit stated as a decision-not-yet-made is a first-class artifact rather than a
missing value.

## `integer`, `minimum: 1`

Days, and at least one. A retention of zero is not a smaller window, it is a
trace store that answers nothing, and typing the key is what turns that from a
review comment into a diagnostic. Nothing here is `writeOnly`: a retention
window is a capacity decision, and hiding one in a vault would be the outage
nobody can debug that `E_ENV_SECRET_MISMATCH` exists to prevent in the other
direction.
