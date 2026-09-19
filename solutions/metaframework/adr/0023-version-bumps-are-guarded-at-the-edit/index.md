---
name: 0023-version-bumps-are-guarded-at-the-edit
kind: adr
version: 1
title: A version bump is guarded at the edit, by a Claude Code hook
summary: A version that never reached a commit can never be rendered, so the warning is raised where the fix is still free — in the agent doing the editing, not in CI.
status: draft
owner: sergio-bershadsky
decision-status: accepted
date: "2026-09-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/git-history
tags:
  - evolution
  - tooling
---

## Context

[0009-git-backed-history](srn://metaframework/adr/0009-git-backed-history) put
an entity's history in git rather than in the catalog, and
[0010-additive-only-evolution](srn://metaframework/adr/0010-additive-only-evolution)
made `version` the thing that moves when a contract surface changes. Together
they mean the portal rebuilds an entity page from *the commit that carried a
given `version`*.

So a `version` that only ever existed in a working tree is a page that can never
be rendered. `git.ts` has a name for that state — `never-written`
(`framework/portal/src/lib/history/git.ts:194`) — and unlike every other miss it
reports, it is permanent rather than pending.

There are two ways to reach it, and only one is recoverable:

| Sequence                                      | Result                                              |
|-----------------------------------------------|-----------------------------------------------------|
| bump, don't commit                            | v1 in HEAD, v2 in the tree. Fine right now.         |
| bump, edit again, commit once                 | v2 existed only in a working tree. Gone for good.   |

The second is the damage; the first is the trap that makes it. Nothing detected
either. `E_VER_UNBUMPED` catches a change carrying no bump and `--since` catches
one in a diff, but neither asks whether a bump ever *reached* a commit.

## Decision

A **Claude Code hook**, not a git hook, in `.claude/settings.json`, backed by
`scripts/entity-version-guard.py`.

The runtime is the argument. `.git/hooks` is not cloned, `--no-verify` skips it,
and CI never runs it — three ways for a git hook to be absent exactly when it is
needed. `.claude/settings.json` is committed and shared, and every edit to this
catalog goes through Claude.

The finding is returned as `additionalContext`, so it reaches the agent doing the
editing rather than a log nobody reads. Two events, because they answer
different questions:

- **PostToolUse** names the entity and what the bump will cost, at the moment of
  the edit.
- **Stop** lists everything left bumped-but-uncommitted, because a turn *ending*
  in that state is how the hole gets made tomorrow.

It never blocks. A half-written entity mid-task is a legitimate state; the claim
is only that a turn should not end in one.

## Consequences

The warning arrives while the fix is still free — amend the commit, or bump
once more. After the second commit there is nothing to fix, which is why a
check that runs later cannot be the answer.

It does **not** replace the checker. A diagnostic reporting the same thing
belongs in `metaframework check`, where CI can see it and where a catalog edited
without Claude is still covered. This hook is the early warning, not the gate;
building it does not discharge that obligation.

The coverage is therefore honest but partial: a human editing this catalog with
an editor and `git commit` gets nothing. That is accepted, because today every
edit here goes through Claude, and a guard that covers the actual workflow beats
a guard that covers a hypothetical one.

`.claude` joins `ALLOWED_TREES` in `repo-hygiene.mjs` with its reason.
`.claude/RESUME.md` is gitignored — local scratch, never tracked.

## Alternatives considered

**A git `pre-commit` hook.** The obvious home, and it fails on distribution:
`.git/hooks` is not cloned, so every contributor would have to install it by
hand; `--no-verify` skips it; CI never runs it. A guard that is absent by
default guards nothing.

**A `metaframework check` diagnostic alone.** Correct, and still wanted — but it
runs after the commit that destroyed the version. By the time CI is red, v2 is
already unreachable and the only remedy is a note in the next commit message.
Detection is not the same as prevention when the window is one commit wide.

**Blocking the edit.** Rejected because the intermediate state is legitimate.
Refusing to write a bumped entity until it is committed would make ordinary
multi-file work impossible, and a guard that fires on the normal case is a guard
people route around.

**Widening `E_VER_UNBUMPED`.** It asks the opposite question — whether a change
carries a bump — and it reads one tree, not history. Teaching it to walk commits
would make a loader diagnostic depend on git state that the loader deliberately
does not have.
