---
name: e2e-harness
kind: component
version: 2
title: End-to-end harness
summary: Playwright multi-browser harness — owns the local runtime composition, and is currently largely stale.
status: draft
owner: sergio-bershadsky
component-type: job
lifecycle: released
relations:
  uses:
    - /environment/local
  depends-on:
    - /product/play/component/server
    - /product/play/component/web-client
  implements:
    - /product/play/requirement/multi-client-e2e
tags:
  - testing
  - playwright
x-package: "@brass/e2e"
---

# End-to-end harness

Five Playwright specs driving n browser contexts against one server: create a room,
join from another context, seat and colour up, start, and play real turns. It is the
only thing in the repository that exercises **multi-actor concurrency**, and it is
also the only thing that currently does not run.

## Status: draft, and why that is the honest pairing

Three of the five specs reference selectors that no longer exist in the client.
`helpers.ts`'s `takeOneTurn` clicks `data-testid="do-action"`, which is gone —
taking `play.spec.ts` and `screenshots.spec.ts` with it. `flat-board.spec.ts` clicks
`view-iso` and `view-flat`, both of which vanished when the board view toggle was
removed. `build-flow.spec.ts` and `map-shot.spec.ts` use only `createAndStart` and
are plausibly still green.

`test-results/.last-run.json` records `"status": "passed"` with no failed tests. That
is almost certainly a single-spec run rather than a full pass, given the three dead
selectors above — but it is an inference from the file's shape, not something the
repository states, and it is written here as an inference.

`pnpm e2e` appears in no GitHub workflow. Nothing runs this on a change.

## Why it is modelled anyway

Three reasons, each of which survives the "nothing imports it" objection.

**It is the only declaration of the local runtime composition.** `playwright.config.ts`'s
`webServer` block starts `@brass/server` and waits for port 8000, starts
`@brass/client` and waits for `http://localhost:5173`, and reuses already-running
instances unless `CI` is set. Delete this component and that description of how the
system is assembled survives only inside a `concurrently` invocation in the root
`package.json`.

**It is the sole consumer of a real, unversioned interface.** The client carries 107
`data-testid` attributes across 69 distinct values, and nothing versions them, tests
them, or marks them as contract. Modelling this component forces that coupling to be
a visible `depends-on` edge — which is precisely where the rot happened. It is not
modelled as a protocol, because it is not message passing; if a reviewer wants it as
a first-class contract, the honest form is a datamodel enumerating the ids, and that
is a decision rather than an omission.

**It proves a different claim from the bot.** The bot validator proves the engine
accepts everything the enumerator offers. Only this proves the *UI* offers nothing
the engine would reject, and only this exercises several clients against one
authority at the same time.

## Not on the runtime path

`component-type: job`: no inbound surface, nothing calls it. It declares only
[local](srn://brass/environment/local), because it exists nowhere else. Its
`screenshots/` and `test-results/` outputs are gitignored development ephemera and
are not modelled.

## The obligation it carries

[multi-client-e2e](srn://brass/product/play/requirement/multi-client-e2e) is a
`should`, in `draft`, and unmet. Recording it as unmet is the point: an obligation
that quietly disappears when its harness rots is worse than one that stays visible
and red.
