---
name: 0011-lazy-client-modules-and-dev-cache
kind: adr
version: 1
title: Lazy client modules, and a stat-walk cache in development
summary: Heavy client modules are imported lazily so a page that draws nothing ships nothing, and the dev catalog is cached behind a filesystem fingerprint rather than a watcher.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
relations:
  uses:
    - /product/portal/component/catalog-loader
tags:
  - performance
  - measurement
---

## Context

Two costs were measured on the same day and turned out to have the same shape:
work being paid for unconditionally that is needed conditionally.

**On the client**, every `/catalog` route shipped byte-identical JavaScript,
because React Flow and Monaco were statically imported by components the entity
page renders. React Flow alone is a 180 KiB chunk. An actor page draws no graph
and shows no source, and it was loading both.

**On the server in development**, every request re-read and re-parsed the whole
catalog. Against the real tree — 197 entities, 597 filesystem entries — that is
~2.2s of request time, of which ~400ms is the loader and the balance is building
the graph, which grows the heap by ~250MB per rebuild for the render to then pay
to have collected. Between two page loads the answer is almost always "nothing
changed".

## Decision

**Client:** heavy client modules are imported lazily, behind
`next/dynamic({ ssr: false })` reached through thin client wrappers, so a page
that will not draw a diagram does not download the library that draws one. The
sequence diagram is deliberately excluded from this: it stays a static import so
its prose narration remains in the server HTML.

**Server:** in development the catalog is cached behind a **stat-walk
fingerprint** — the newest mtime under the tree plus the number of entries,
directories included — recomputed on every request, with a re-parse only when it
moves. In production the tree is read once per process. The fingerprint walk is
synchronous, against the rule everywhere else in this codebase.

## Consequences

- First load per catalog route fell from **1368 KiB to 1133 KiB** (commit
  `1368318`), and an actor page no longer carries a graph library.
- The dev catalog check costs **~18ms instead of ~2.2s** when nothing changed.
  The synchronous walk is the reason: the `fs/promises` form of the same walk
  measured ~120ms, because 597 awaited operations each need a turn of an event
  loop the dev server keeps busy with watchers and HMR.
- The fingerprint counts entries and stats directories because mtime alone is
  not enough — deleting a file leaves every surviving mtime untouched, and a
  rename changes neither a file's mtime nor the entry count, only the mtime of
  the directory that held it. Both cases were reasoned about before they were
  encountered; neither is covered by an integration test.
- Asking the filesystem every time keeps the skip honest: an edit made while the
  server was down, by another process, or through a `git checkout` is seen
  exactly like an edit in the editor. There is no watcher to mis-wire and no
  state that outlives what it describes.
- Lazy loading moved a class of bug from build time to run time. Three of them
  were found only in a browser, and are recorded in `1368318`'s own body —
  including React Flow reading `measured` off the user node object, which made
  every box `visibility: hidden` when animation frames handed it fresh objects.
- **The numbers have no regression guard.** There is no bundle-size budget, no
  Lighthouse run, no CI. 1368 → 1133 KiB is a measurement from one day, and the
  next careless static import will undo it silently.

## Alternatives considered

- **A filesystem watcher for the dev cache.** The conventional answer, and
  faster still. Rejected because a watcher holds state that can outlive the
  truth: a missed event, a `git checkout` while the process is idle, or an NFS
  mount and the portal serves a catalog that no longer exists, with no way for
  the reader to tell.
- **Hashing file contents instead of stat'ing them.** Correct, and it costs what
  it saves — the point of the fingerprint is to decide whether to parse ~300
  files, and a key that must open those files has already done the expensive
  part.
- **An async fingerprint walk, for consistency with the rest of the codebase.**
  Measured and rejected at ~120ms versus ~18ms. Consistency lost to a factor of
  six on the hot path of every dev request.
- **Caching in production too, keyed the same way.** Unnecessary: the catalog is
  static input to a deployed build, so it is read once per process. This is also
  the one branch of the decision that has never run anywhere — there is no
  deployment.
