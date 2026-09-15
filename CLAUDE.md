# Working in this repository

## The rule that is easiest to skip, and is not optional

**Every change that adds or amends a feature MUST also update
`solutions/metaframework/`.**

This repository's product *is* a catalog format, and `solutions/metaframework/`
is this product described in its own format. A feature that ships without
reaching it makes the framework's central claim — that a catalog stays true to
the system it describes — false about the one catalog every reader will check
first.

It has been skipped **eleven times** since 2026-08-22 (`git log --since` over
`framework/portal/src`, `framework/portal/bin` and `framework/spec`, filtered to
commits that touched none of `solutions/metaframework/`): prose icons, the
`--app` window, the port fallback, the lifecycle guide, the embedded
meta-schemas, `E_DM_NOT_ADDITIVE`, the zod split, and more. That is the reason
this file exists.

### Where it lands

| You changed                                      | Update                                                      |
|--------------------------------------------------|-------------------------------------------------------------|
| the portal — rendering, loader, diagnostics, CLI | `solutions/metaframework/product/portal/component/…`        |
| `framework/spec/` — any contract                 | `solutions/metaframework/product/specification/component/…` |
| the plugin bundle under `marketplace/`           | `solutions/metaframework/product/authoring-kit/…`           |
| deploy, CI, the image, the published sites       | `solutions/metaframework/product/devops/…`                  |
| a decision, not just an implementation           | a new `solutions/metaframework/adr/NNNN-…`                  |

Bump the entity's `version` when you do — `evolution.md` requires it, and
`metaframework check --since origin/main` enforces it on pull requests.

### What counts as "amends"

Prose that is now wrong is an amendment. If a component's description says the
portal opens a browser tab and it now opens an app window, the description is a
false statement about a shipped product — the same defect class as a stale
`distilled-from` marker, and the one no gate can catch.

### What does NOT require it

A refactor that changes no behaviour a reader could observe, a test, a typo, a
version bump. If you cannot name the sentence that became untrue, there is
nothing to write.

## The three trees

A change to a **contract** lands in three places or it is not done:

1. `framework/spec/` — normative, and the version in its frontmatter moves
2. `framework/portal/` — the implementation that enforces it
3. `marketplace/plugins/metaframework/` — the distilled bundle an installed
   plugin reads, whose `distilled-from` marker must name the new spec version

`repo-hygiene.mjs` enforces the third against the first. Nothing enforces the
second, and nothing enforces the self-description rule above — those are yours.

## Gates, before any commit

```bash
npm run hygiene                                   # 8 checks, repository-wide
npm --prefix framework/portal run typecheck
npx --prefix framework/portal eslint src bin scripts   # run FROM framework/portal
npm --prefix framework/portal test
node framework/portal/bin/metaframework.mjs check      # 0 errors is the pass condition
```

Warnings are true statements. Fix them or record why they stand — never silence
a rule to make a number go down.

## Releasing

`git tag vX.Y.Z && git push origin vX.Y.Z` publishes the package (npm trusted
publishing, no token) and both sites. `scripts/bump-version.py X.Y.Z` moves all
five version claims together; `manifest-identity` refuses a release where they
disagree. `gh workflow run release.yml` refreshes the sites alone.
