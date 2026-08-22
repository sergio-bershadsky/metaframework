---
name: remote-execution
kind: protocol
version: 1
title: Remote execution
summary: The outbound half of the whole product — commands and scripts run over SSH on machines the catalog describes only as an actor, on a wire the transport enum does not have.
status: review
owner: sergio-bershadsky
style: request-response
participants:
  - alias: action-runner
    ref: /product/platform/component/st2actionrunner
    role: client
  - alias: managed-host
    ref: /actor/managed-host
    role: server
conforms-to:
  - standard: Secure Shell (SSH-2)
    url: https://www.rfc-editor.org/rfc/rfc4251
tags:
  - ssh
  - remote
  - ontology-strain
---

This is what StackStorm is *for*. An automation that only ever talked to
StackStorm would be a filing cabinet; the point is that an action reaches a
machine and does something there. Two of the shipped runners do that over SSH:
one runs a command, the other copies a script across and runs that.

The protocol has two participants, a request, a reply, a well-known wire and a
published specification. It has **no `transport.yaml`**, because
`transport.kind` is a closed set of six values and none of them is SSH.

## What the conversation actually is

A single action names one or more hosts — the parameter is a comma-delimited
string, not a list — and the runner opens a session to each, in parallel by
default. Credentials come from the action's parameters or from the installation's
own defaults: a username, and then either a private key with an optional
passphrase or a password. An optional bastion host is a second hop, and an
optional privilege escalation is a third layer of credential.

The result is per host: each one contributes its own exit status, standard output
and standard error, and the action's single result is a mapping from host to
those. So one action execution is *N* conversations, and the framework's
`participants` list has no way to say that the far side is a set whose size is a
runtime parameter.

## What the enum costs here

`http` is false. `grpc` is false. `amqp`, `kafka` and `websocket` are false.
`in-process` is emphatically false — the whole point is that the code runs
somewhere else, under a different operating system, as a different user.

The nearest thing to an honest mini-spec file would be a `kind` chosen for its
shape rather than its truth plus an `x-wire: ssh` key, which is exactly what the
[brass](srn://brass) catalog did for a stdio transport and what ADR 0013 recorded
as a finding rather than as a solution. This catalog does not repeat it: an
artifact whose one required field is wrong is worse than no artifact, because the
wrong value is what a reader's tooling will believe.

The consequence is visible on this page. There is no transport card, no surface
list, and the message-by-datamodel matrix is empty for a protocol that moves more
bytes than any other in the system.

## The far side is an actor, and that is also a strain

A machine StackStorm runs commands on is not a component of this solution — it is
not built here, not deployed here, and its software is not described here. The
ontology's answer is an actor, and
[managed-host](srn://stackstorm/actor/managed-host) is one.

But an actor cannot be the target of any forward edge except a protocol
participant, so nothing in the catalog can say "the action runner depends on
these machines being reachable". The dependency is the product's whole reason to
exist and it is expressible only as a participant entry and this paragraph. The
same seam is recorded, from the opposite side, on the
[kubeedge](srn://kubeedge) catalog's device mappers, where a gateway fronts
physical hardware that is correctly an actor.

## Sources

Read at `v3.9.0`:
[`contrib/runners/remote_runner/remote_runner/runner.yaml`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/runners/remote_runner/remote_runner/runner.yaml),
[`contrib/runners/remote_runner/remote_runner/remote_command_runner.py`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/runners/remote_runner/remote_runner/remote_command_runner.py),
[`contrib/runners/remote_runner/remote_runner/remote_script_runner.py`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/runners/remote_runner/remote_runner/remote_script_runner.py).
