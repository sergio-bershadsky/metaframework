---
name: 0001-nextjs-16-async-request-apis
kind: adr
version: 1
title: Next.js 16 with async request APIs
summary: The portal is built on Next.js 16.3.1 and React 19.2, which makes params and searchParams Promises everywhere and Turbopack the default bundler.
status: review
owner: sergio
decision-status: accepted
date: "2026-08-19"
deciders:
  - sergio
tags:
  - stack
  - nextjs
---

# Next.js 16 with async request APIs

## Context

The founding decision record, written the same morning, named "Next.js 15" in
its stack section. What was actually scaffolded a few hours later was **Next.js
16.3.1** with React 19.2 — the current release at scaffold time. `package.json`
still pins both exactly: `"next": "16.3.1"`, `"react": "19.2.8"`.

The gap mattered because 16 is not a version bump a codebase can be written
against by habit. Request APIs became async-only, the default bundler changed,
route prop types moved to generated helpers, and `middleware` was renamed. Code
written for 15 compiles against 16 in most places and fails in exactly the
places a reviewer does not look.

The decision record is append-only, so the founding text could not be corrected.
It was amended instead, as `2026-08-19-a`, in commit `6a1b1f1` at 12:15 — and the
amendment says why in its own words: "this file follows the framework's own
additive-only principle — history is extended, never edited."

## Decision

The portal targets **Next.js 16.3.1 and React 19.2**, and every consequence of
16's request model is treated as binding on all portal code:

- `params` and `searchParams` in `page`, `layout` and `route` are Promises and
  are awaited. Synchronous access was removed in 16, not deprecated.
- Turbopack is the default bundler for `dev` and `build`.
- Route prop types come from generated helpers (`PageProps<'/route'>`,
  `LayoutProps`), produced by `next typegen`.
- `middleware` is `proxy`; Partial Prerendering flags are gone.

## Consequences

- Every dynamic route in the portal opens with an `await` on its params. Both
  route handlers in this product do (`const { path: segments } = await
  context.params`), and so does the entity page.
- The catalog is read inside async server components as a matter of course,
  which is what makes `getCatalog()` a per-request memoised promise rather than
  a module-level value.
- The founding decision record now contains a factually wrong stack line that
  will never be corrected. Anyone reading it must read the amendments too. That
  is the cost of append-only, paid in full and on the first day.
- Pinning exact versions rather than ranges means an upgrade is a visible diff.
  Nothing tests the upgrade path; there is no CI, so a bump is verified by one
  person running `npm test` and opening the app.
- Turbopack as default was inherited, not chosen. No measurement of it against
  webpack exists in this repository.

## Alternatives considered

- **Downgrade to Next.js 15 to match the record.** Rejected on sight: rewriting
  a working scaffold to agree with a paragraph is the tail wagging the dog, and
  15's synchronous request APIs are the thing being removed, not the thing being
  preferred.
- **Edit the founding record's stack line.** This was the real fork, and the
  answer to it defines the repository. Editing would have been one line and
  would have destroyed the property the framework is built on — that history is
  extended, never rewritten. The amendment cost more and is the reason the
  additive rule is credible when it is applied to a schema.
- **Pin a version range (`^16`) instead of an exact version.** Rejected: with no
  CI and no lockfile discipline enforced by anything, a range means the stack can
  move under a reader who did nothing.
