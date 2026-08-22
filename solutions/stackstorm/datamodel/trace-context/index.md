---
name: trace-context
kind: datamodel
version: 1
title: Trace context
summary: The two-field correlation token that rides every trigger dispatch and every announcement — an existing trace's id, or a tag that will start one.
status: review
owner: sergio-bershadsky
usage: exchange
abstract: false
tags:
  - bus
  - correlation
---

The smallest thing the bus carries, and the only field on it that is not about
the message itself. A trace context says *which story this message belongs to*:
either the id of a trace record that already exists, or a free-form tag that the
receiver will use to open one. Both halves are optional in the sense that the
type permits either, and the service that reads it refuses a context that
carries neither.

It rides two of the five bus conversations described here — every trigger
dispatch and every announcement — as a member of the published wrapper rather
than as a header. AMQP has message headers and this system does not use them for
correlation; the token is inside the body, which is why it is a datamodel and not
a transport field.

## Where the receiver fills it in

A dispatch may legitimately arrive with no context at all, and the rules engine
does not treat that as an error: it mints one from the trigger instance it has
just created and uses that as the tag. So an absent trace context is not a
missing field, it is the ordinary case for the first message in a story — and
the trace still exists afterwards, because the *consumer* created it. That is the
same asymmetry the
[trigger-dispatch-message](srn://stackstorm/datamodel/trigger-dispatch-message@1)
page records about the trigger instance itself.

## Two field names worth pausing on

The wire key for the id is `id_`, with a trailing underscore, because the
serialized form of the context object is its Python instance dictionary and the
attribute avoids shadowing a builtin. Nothing strips it on the way out.

The tag's wire key is `trace_tag`, and the constant that names it is called
`TRACE_ID`. A reader who greps for the constant and expects the value to be an
id will find a tag; the two are different things in this system, and only one of
them is unique.

## Field names here are the catalog's, not the wire's

Every property below is kebab-case with the real wire key stated in its
`description`, following the convention the
[kubeedge](srn://kubeedge) catalog arrived at independently for the same reason:
this framework's vocabulary is kebab-case everywhere and the described system's
is not. The cost is stated on
[key-value-pair](srn://stackstorm/datamodel/key-value-pair@1), where it bites
hardest — a renamed schema cannot validate a real instance, and this entity
therefore carries no `examples/` directory, because any file in one would have to
be a document the system never produces.

Read at `v3.9.0`:
[`st2common/st2common/models/api/trace.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/api/trace.py),
[`st2common/st2common/constants/trace.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/constants/trace.py),
[`st2common/st2common/services/trace.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/services/trace.py).
