---
name: mappers-go
kind: component
version: 1
title: mappers-go
summary: The previous generation — a collection of hand-written fieldbus mappers plus an SDK, superseded by the scaffold and last touched well over a year before this survey.
status: review
owner: sergio-bershadsky
component-type: library
lifecycle: sunset
tags:
  - devices
  - legacy
x-package: github.com/kubeedge/mappers-go
---

How mappers used to be written. Before the scaffold existed, the project shipped
this: a repository of concrete drivers, one per protocol family, and beside them
a software development kit for writing another one. Both approaches are still
sitting there, and neither has moved in a long time.

## What is in it

Two construction methods, which the repository's own front page presents as
alternatives
(<https://github.com/kubeedge/mappers-go/blob/v1.13.0/README.md>): a directory of
implemented mappers, and a Go SDK that handles the KubeEdge-facing side so a
developer supplies only a driver. The implemented set covers Modbus in two
generations, Bluetooth Low Energy, OPC-UA, ONVIF and GigE Vision, with a virtual
device for testing.

That protocol list is the most useful thing this component contributes to the
catalog, and it is why
[physical-device](srn://kubeedge/actor/physical-device) can name real fieldbus
families instead of gesturing at "industrial protocols". The families are
evidence from a shipped implementation rather than from a marketing page.

## Why `lifecycle: sunset`, and what that claim is made of

This is the component that tests whether an open-source `lifecycle` can be
stated at all, so the evidence is given rather than summarised.

Nobody published a deprecation notice. What exists is a divergence between two
repositories, measured on 2026-08-22:

- This repository's most recent push is dated 2024-10-31 — 660 days, or twenty-one
  months, before that measurement. Its most recent tag is `v1.13.0`; the most
  recent GitHub *release* it ever produced is `v1.6.0`, published 2021-02-27, so
  even its release stream stopped years before its tag stream did.
- Its successor was pushed within six months of the same measurement, carries a
  tag matching the runtimes' current minor, and is staged inside the main
  repository so it moves with them.
- The successor's own front page opens by describing itself as a way to make
  writing mappers easier and links straight back here for the word "mappers".

`sunset` means still usable, being replaced, no new consumers. That is exactly
what those three facts describe, and nothing stronger is claimed: the code still
works, nobody has removed it, and a person starting a mapper today is pointed
somewhere else.

This is the shape an open-source lifecycle judgement has to take. There is no
investment ledger to read, so the evidence is activity — and activity is
genuinely informative as long as the reader is told which activity was measured
and when.

## The library discipline, and the one part of it this fails

`library`, so it declares no environment, which is correct: nothing here runs
anywhere on its own.

The discipline also expects a library to be depended on by at least one
component, and this one is depended on by none. That is not a modelling mistake
to be papered over — it is precisely the state a superseded library is in, and it
is the same fact `lifecycle: sunset` states from the other side. The catalog's
only forward statement about the relationship lives on
[mapper-framework](srn://kubeedge/product/device-integration/component/mapper-framework),
which points here with `supersedes`; the inverse shows on this page without
anyone authoring it.

## Why the document is not deprecated

`status` is the review state of this description, and this description is
current, accurate and newly written. The thing described is being replaced;
the description of it is not. Setting `status: deprecated` here would say the
catalog had finished a swap and retired a page, which is a different claim and
an untrue one.
