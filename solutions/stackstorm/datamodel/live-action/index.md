---
name: live-action
kind: datamodel
version: 1
title: Live action
summary: One attempt to run one action — the record whose fourteen-value status is the routing key that moves the whole platform.
status: review
owner: sergio-bershadsky
usage: both
abstract: false
tags:
  - execution
  - bus
---

The unit of work. A live action is one attempt to run one action with one set of
parameters, and it is the only record in this system whose **status is a routing
key**: every transition is published to a topic exchange under the status string
itself, and five durable queues subscribe to five of those strings. The
scheduler waits on `requested`, the runner waits on `scheduled`, `canceling`,
`pausing` and `resuming`. Nothing dispatches on this record except by matching
its status.

That makes the status enum a contract surface twice over — once as data, once as
the wire's address space. The consequence is written up on
[execution-lifecycle](srn://stackstorm/product/platform/protocol/execution-lifecycle@1),
which is the protocol that carries it.

## Fourteen values, and the four sets that constrain them

The enum below is the full membership list, in the order the source declares it.
What the source does *not* declare anywhere is a transition table: the function
that changes a status validates membership and nothing else. What it declares
instead is four named subsets, and those are the closest thing to a machine the
code contains:

- runnable — `requested`, `scheduled`, `pausing`, `paused`, `resuming`
- cancelable — those five minus `scheduled` plus `delayed` and `running`
- completed — `succeeded`, `failed`, `timeout`, `canceled`, `abandoned`
- failed — `failed`, `timeout`, `abandoned`

The state chart on the protocol page is assembled from those subsets and from the
queue bindings, and it says on its face that it is a reconstruction. This schema
states only the enum, because the enum is the part the source states.

## `parameters` and `result` are open on purpose

An action's parameter shape comes from the action's own metadata, which comes
from a pack, which was installed at runtime. The model constrains parameters to
a mapping whose keys are word characters and whose values are any JSON type, and
constrains the result to any JSON type at all. A schema that named parameters
here would be describing one pack.

## The other three objects

`context` carries who asked and why — the user, the parent execution, the rule
that fired. `callback` and `runner-info` are filled by the runner rather than by
the requester. All three are open mappings in the source and are left open here;
the fields inside them are set in several places and enumerated in none.

Read at `v3.9.0`:
[`st2common/st2common/models/api/action.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/models/api/action.py),
[`st2common/st2common/constants/action.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/constants/action.py),
[`st2common/st2common/transport/liveaction.py`](https://github.com/StackStorm/st2/blob/v3.9.0/st2common/st2common/transport/liveaction.py).
