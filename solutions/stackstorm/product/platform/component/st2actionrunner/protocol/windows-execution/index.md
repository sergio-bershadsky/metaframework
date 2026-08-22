---
name: windows-execution
kind: protocol
version: 1
title: Windows execution
summary: Three runners reaching Windows machines over WinRM — a protocol whose wire genuinely is HTTP, and whose http binding block would describe nothing about it.
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
  - standard: WS-Management (DMTF DSP0226)
    url: https://www.dmtf.org/standards/wsman
tags:
  - winrm
  - remote
  - ontology-strain
---

The other half of the outbound story. Three shipped runners reach a Windows
machine over WinRM: a command prompt command, a PowerShell command, and a
PowerShell script. They are a separate protocol entity from
[remote-execution](srn://stackstorm/product/platform/component/st2actionrunner/protocol/remote-execution@1)
for the reason the framework gives — one transport per protocol, and a protocol
offered over two wire technologies is two entities.

## The interesting difference from the SSH half

WinRM *is* HTTP. The runners take a scheme, defaulting to the secure one, and a
port, defaulting to the secure one; the body is a SOAP envelope and the
authentication mechanism is chosen from a list of seven, defaulting to a
Windows-native scheme rather than to anything an HTTP API would recognise.

So `kind: http` would be **true about the wire** and would still describe nothing
about the protocol. The block's required field is a base path, and there is no
base path; its optional surface list is a table of methods, paths and request and
response models, and there are no paths — there is one endpoint and an envelope
whose action lives inside the body. This is a sharper finding than the SSH one:
there the enum has no value; here it has a value that is literally correct and
whose binding block is empty of anything true.

That is the seam between "the wire" and "the protocol on the wire", and the
framework's `transport.kind` conflates them. Every other value in the enum picks
a wire whose usual protocol is the one the binding block describes; WinRM is the
case where those come apart.

## One host, not many

Unlike the SSH runners, these take a single host per execution. The parameter is
singular, so the fan-out an operator wants is a workflow rather than a parameter,
and a catalog reader can tell the two runners apart by that alone.

## No transport artifact

None is authored, for the reason above: a `kind: http` file whose only required
field would be an invented base path states a falsehood in the one field a reader
would trust. The entity is `index.md` alone, which the framework permits, and the
absence is the finding.

## Sources

Read at `v3.9.0`:
[`contrib/runners/winrm_runner/winrm_runner/runner.yaml`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/runners/winrm_runner/winrm_runner/runner.yaml),
[`contrib/runners/winrm_runner/winrm_runner/winrm_base.py`](https://github.com/StackStorm/st2/blob/v3.9.0/contrib/runners/winrm_runner/winrm_runner/winrm_base.py).
