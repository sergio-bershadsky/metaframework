---
name: git
kind: actor
version: 1
title: git
summary: The git binary the portal shells out to for every historical read, and whose absence the portal is built to survive.
status: review
owner: sergio-bershadsky
actor-type: external-system
goals:
  - Be asked only read-only questions, through an argv array and never a shell string.
  - Answer with the commits that touched one entity directory, without following renames.
  - Be allowed to be absent, so that a tree without a git binary still renders.
tags:
  - history
  - external
---

# git

A binary the portal invokes and does not ship. It is the storage layer for every
version of every entity older than the working tree: the catalog keeps only
current versions on disk, so a `?v=2` page is a `git show` and nothing else.

`framework/portal/src/lib/history/git.ts` is 895 lines and holds the whole
conversation. It calls `execFile` with an argv array, never a shell string, with
`GIT_OPTIONAL_LOCKS=0`, `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, a 15-second timeout
and a 32 MB buffer. It pins `-c log.follow=false` — the comment says why:
`evolution.md` forbids moving an entity, and the version→commit index does not
follow renames, so a user's global config must not be allowed to change what the
index resolves to.

## Nothing here throws

That is the design claim, and it is the reason this counterpart is named at all.
Every failure is classified into one of four values —
`no-git-binary | not-a-repository | not-committed | git-error` — so the portal
can say *why* the past is unreachable instead of showing an error page. Naming
git as an actor is what turns that enumeration into a describable set of outcomes
rather than an implementation detail buried in a union type. The obligation is
carried by
[catalog-renders-without-git](srn://metaframework/product/portal/requirement/catalog-renders-without-git).

## Where the ontology strains

`goals` is required on every actor, with at least one item, and is specified as
"what this actor wants from the solution, in its own terms". A binary wants
nothing. The three goals above are the *terms of the invocation* restated in the
actor's voice, because the alternative — inventing a motive for `git log` — would
be worse, and leaving the field empty is `E_FM_SCHEMA`.

There is also no protocol entity for this conversation, and that is deliberate.
A protocol would need a `transport.yaml`, whose `kind` enum is closed at
`http | grpc | amqp | kafka | websocket | in-process`, and none of those is a
local subprocess exec. Forcing `in-process` plus an `x-` nuance field would
manufacture a conversation out of a library calling a binary. The degradation
story lives here and in the requirement instead. This actor is consequently
named in no participant list and would be `W_ACTOR_ORPHAN` if that check were
implemented, which it is not.

## What is not modelled

The repository's remote, its branches, and its tags. The portal reads local
history only, and reads it through exactly four operations. There are no git
tags in this repository at all (`git tag | wc -l` returns 0), so no release
process is being described here or anywhere else in this catalog.
