---
name: single-writer-match-state
kind: requirement
version: 1
title: Exactly one process holds match state
summary: One replica, Recreate rollouts, and a published warning that every release ends live games — the three faces of one constraint.
status: review
owner: sergio-bershadsky
requirement-type: non-functional
priority: must
relations:
  uses:
    - /environment/production
tags:
  - operations
  - correctness
---

Match state lives in the server pod's heap
([0006-in-memory-match-storage](srn://brass/adr/0006-in-memory-match-storage)),
which turns an ordinary scaling knob into a correctness constraint. A second
replica does not halve the load; it shards matches across pods at random and
splits the socket clients of one game between two authorities that will never
agree again.

This is the rare operational property where the failure is silent corruption
rather than degradation. Nothing errors. Two players simply stop seeing the same
game.

The optimistic concurrency on
[game-transport](srn://brass/protocol/game-transport) — a `stateID` and a
per-match queue — has no notion of a competing writer, so this requirement is
also what makes
[legal-move-enforcement](srn://brass/requirement/legal-move-enforcement)'s
serialisation criterion true.

## Acceptance criteria

- **AC-1** `server.replicas` is 1 in the deployed values, and the chart comment states why raising it is unsafe.
- **AC-2** The server Deployment uses `strategy: Recreate`, so no two server pods are ever running at once — not even for the seconds of a rolling update.
- **AC-3** No horizontal autoscaler targets the server workload.
- **AC-4** The release procedure states, in the runbook a human follows, that every deploy ends in-progress games.
- **AC-5** A release is scheduled around play rather than triggered by a merge; CI publishes images and never contacts the cluster.
- **AC-6** Raising the replica count is gated on match state moving out of the process, and nothing else lifts the constraint.

## Rationale

AC-2 is the criterion most likely to be lost by accident, because `Recreate` is
not the Kubernetes default and a template refactor would restore
`RollingUpdate` without any test noticing. The window it protects is small and
the corruption it prevents is total.

AC-4 and AC-5 are in this requirement rather than in a deployment note because
they are how the constraint is actually enforced today: by a person who knows,
following a procedure that says so. That is a weak enforcement mechanism, and
naming it as one is the point.

## Measured where

In [production](srn://brass/environment/production), by reading the rendered
manifests and the runbook. There is no runtime check — a second replica would be
accepted by the cluster and would simply be wrong.

## Out of scope

Multi-region and failover. With one node, one replica and no persistence, high
availability is not a shape this deployment can take.
