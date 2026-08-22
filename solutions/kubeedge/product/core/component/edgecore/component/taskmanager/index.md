---
name: taskmanager
kind: component
version: 1
title: Task manager (edge)
summary: Performs the local half of a fleet operation — replace the runtime binary, pre-pull an image, rewrite a config file — and reports the outcome.
status: review
owner: sergio-bershadsky
component-type: job
lifecycle: released
criticality: 3
relations:
  depends-on:
    - ../edgehub
    - /product/core/component/keadm
tags:
  - upgrade
  - operations
x-deployment-unit: edgecore
---

The node end of the operations the cloud declares. It has the same name as
[its cloud counterpart](srn://kubeedge/product/core/component/cloudcore/component/taskmanager)
because the upstream project uses one word for both halves; they are separate
entities because they do genuinely different things.

**Trigger.** An instruction arriving over the cloud-edge channel, originating
from a job resource an operator declared in the cluster.

**Effect.** Carries out the local action — pulling an image ahead of a rollout,
rewriting the runtime's configuration, or upgrading the runtime binary itself —
and reports the result back up.

## The awkward part: upgrading the process it lives in

An upgrade replaces the edge runtime, and this module *is* the edge runtime. The
work is therefore delegated to the installer, which is why
[keadm](srn://kubeedge/product/core/component/keadm) is in the `depends-on` set:
a component that runs inside a process cannot be the thing that restarts it.

That dependency is also what makes the backup and rollback subcommands the
installer carries matter operationally rather than decoratively. An upgrade
driven from the cloud that goes wrong leaves a node that has to recover with no
help from the cloud, because the thing that broke is the thing that was
listening.

The release train this survey covers added a check that an upgrade is not skipped
when a binary of the target version is already present
(<https://github.com/kubeedge/kubeedge/blob/v1.23.1/CHANGELOG/CHANGELOG-1.23.md>),
which is the kind of detail that only appears once a mechanism has been used in
anger.

## Blast radius

`criticality: 3` for the same reason as its cloud counterpart — nothing running
depends on it, and a fleet without it is upgraded by hand. Its failure mode is
nevertheless the worst in the edge runtime, because it is the only module whose
job is to modify the node itself.
