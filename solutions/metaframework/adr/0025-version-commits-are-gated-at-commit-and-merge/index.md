---
name: 0025-version-commits-are-gated-at-commit-and-merge
kind: adr
version: 1
title: A version that skips its commit is refused at commit, at CI and at merge
summary: 0023's edit-time hook stays, and three gates join it — a git pre-commit, the --since gate in CI, and a repository that cannot squash.
status: draft
owner: sergio-bershadsky
decision-status: accepted
date: "2026-11-07"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/git-history
    - /product/portal/component/console
tags:
  - evolution
  - tooling
---

## Context

[0023](srn://metaframework/adr/0023-version-bumps-are-guarded-at-the-edit)
guards one failure: a `version` bumped twice before a commit, so the middle
number never reaches git and the portal can never rebuild it (`never-written`).
It chose a Claude Code hook that warns and never blocks, and it said in its own
consequences that a `check` diagnostic was "still wanted".

An audit on 2026-11-07 found the guard honest but porous:

| Path to a lost version                         | Covered by 0023                         |
|------------------------------------------------|-----------------------------------------|
| two bumps through Edit/Write, one commit       | warned at the edit                      |
| two bumps through `sed` or a script in Bash    | not until the turn ends                 |
| a commit made outside Claude                   | no                                      |
| v1→v3 in one commit, pushed                    | no — `--since` judged the net diff only |
| a branch committing v2 and v3, squash-merged   | no — GitHub allowed squash              |

The last row defeats every other layer: the branch did everything right, and
the merge still threw v2 away.

## Decision

Keep 0023's hook, and gate the three moments a version becomes history.

- **The commit.** `.githooks/pre-commit` runs `entity-version-guard.py --staged`
  and refuses a staged `version` that is more than one above HEAD (or, while a
  conflicted merge is concluded, above either parent), or lower than it.
  `npm install` at the root activates it through a `prepare` script setting
  `core.hooksPath`.
- **CI.** `metaframework check --since <ref>` reads the `version:` line of each
  commit in `<ref>..HEAD` for every entity whose version moved by more than one,
  and fails with `E_VER_REGRESSION` for each number no commit carries; a version
  that went down fails the same way. An existing code, because evolution.md
  already defines a jump as one.
- **The merge.** Squash merge is disabled on the GitHub repository; merge
  commits and rebase merges keep every commit. `evolution.md` v11 states the
  rule: every version reaches a commit of its own.

0023's hook gains two things: a `Bash` matcher that reports jumps and
regressions after any shell command, and a `Stop` hook that **blocks once** per
turn when bumps are left uncommitted and tells Claude to ask the owner — never
to commit on its own. `stop_hook_active` keeps it from looping.

The front page's authoring guide carries the rules as commit hygiene, so a
reader meets them before a gate does.

## Consequences

A lost version now needs three gates to fail together: a commit made with the
hook not activated (or `--no-verify`), CI skipped, and a squash re-enabled.

The pre-commit hook is the alternative 0023 rejected, and its objection still
holds: `.git/hooks` is not cloned, and `core.hooksPath` is set only when someone
runs `npm install` at the root, which this repository does not otherwise need.
It is accepted as defence in depth, not as the gate — CI is the gate.

The `Stop` block fires once on every turn that ends with an uncommitted bump,
including when the owner has already said "not yet". That nag is the price of
"a turn should not end in one" being a rule rather than a hope.

The `--since` gate now reads history for one question, against its own "two
trees, not a walk" design. The exception is narrow — only for entities whose
version moved by more than one, and only their `version:` line — and it must
walk every parent, because the portal's index does: a version committed on a
merged branch is reachable, and a gate stricter than the index would reject a
correct history.

## Alternatives considered

**Block the edit.** Still rejected, for 0023's reason: a bumped, uncommitted
entity is a legitimate state mid-task.

**A Claude hook on `git commit` instead of a git hook.** It would ship in the
committed settings and need no activation, but it would cover only Claude's
commits. The owner chose the git hook, which covers both once activated.

**Block `Stop` until committed.** Rejected: it would make Claude commit without
being asked.
