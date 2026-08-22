# 0.2.0 — the dialects release

`@bershadsky/metaframework` 0.2.0. Prepared 2026-08-22 against `07633c5` plus
the release-preparation change in the working tree. Nothing here is published,
committed or tagged; the version in `framework/portal/package.json` is bumped
and the tarball is the thing the owner decides to push.

Read [roadmap-0.2.0.md](roadmap-0.2.0.md) for what was *planned*. This document
is what the commits actually contain, and two lanes ended somewhere the plan
did not send them.

---

## The registry state, which the version numbers do not tell you

npm holds exactly one version of this package:

```console
$ npm view @bershadsky/metaframework versions
[ '0.1.0' ]                       # published 2026-08-21T07:16:50Z
```

**0.1.1 was never published.** The bump commit exists (`1b344e0`, "release:
0.1.1 — version bump only") and the tarball was never pushed, so 0.1.1 is a
number in git and nowhere else. Anyone who installed this package has 0.1.0,
cut at `9589564`.

That has two consequences worth stating rather than papering over:

- **0.2.0 is the first published release since 0.1.0**, and it carries 0.1.1's
  content as well as its own. 0.1.1's whole content was the README gaining the
  screenshot gallery — npm renders the README from the tarball, so those images
  have never reached an npm reader.
- **The publish mechanics are unproven.** `scripts/release.sh` has been written
  and read; it has authenticated and published exactly once, for 0.1.0, before
  the token flow was written down. The roadmap's step 2 was "unpark 0.1.1 to
  de-risk 0.2.0's mechanics for the cost of one token", and that step was
  skipped. Run `npm run release:dry` first (below); it is now the only rehearsal
  left.

Between 0.1.0's commit and this one: **23 commits**, five of them the unpublished
0.1.1 lineage and eighteen the 0.2.0 work.

---

## What an installer actually gets

The published tarball is the CLI and a compiled server, and nothing else:

| In the tarball        | Not in the tarball                            |
| --------------------- | --------------------------------------------- |
| `bin/*.mjs` — the CLI | `src/` — sources                              |
| `.next/standalone/`   | `framework/spec/` — the specification         |
| `README.md`           | `solutions/` — this repository's own catalogs |
|                       | `marketplace/` — the Claude Code plugin       |

Measured with `npm pack --dry-run` at 0.2.0: **1,466 files, 8.6 MB packed,
37.4 MB unpacked, zero leaks** against CI's pack audit (which fails on any
`src/`, `.test.`, `solutions/` or `framework/spec/` path). Installing still adds
exactly one package — the server is compiled in, so there are no transitive
dependencies.

The floor is **Node 20.9**, which is Next 16's own. CI proves it rather than
asserting it: the assembled CLI is run under 20.9.0 in a dedicated step, on the
reasoning that the dev toolchain's Node (22, because vitest 4 needs 20.12+) is a
different promise from the one made to an installer.

---

## What shipped

Lane by lane, against the roadmap's decision board. Two rows are the ones to
read carefully.

| Lane                       | Direction given          | What 0.2.0 contains                                                          |
| -------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| `states.json` → XState v5  | decided                  | shipped — and the migration turned out to be already done                    |
| Stately.ai adoption        | "as much as possible"    | **ruled the other way** — SaaS disqualified; their schema is a CI target     |
| workflows → Arazzo         | leaning yes              | **ruled the opposite way** — Arazzo is a sibling role, the mini-spec leads   |
| journey → Arazzo           | suggested                | **ruled the other way** — mini-spec kept, the rejection recorded in the spec |
| config → JSON Schema model | decided                  | shipped in full, including the environment join                              |
| topology                   | open to research         | deferred by design — meta-schema published, criteria locked in ADR 0016      |
| transport → AsyncAPI 3.1   | not in the original list | shipped partially — 11 of 31 transports, by design rather than by fatigue    |

### The two lanes that went the other way

**workflows → Arazzo was ruled the opposite of its direction.** The brief leaned
towards replacing the `workflows/*.yaml` mini-spec with the OpenAPI Initiative's
Arazzo. The field mapping killed it: an Arazzo step names one operation and the
format models **one executor chaining API calls**, while the mini-spec models
**multi-party choreography** — `from`/`to` over declared aliases, actor and
`in-process` participants, self-calls, event fan-out, paired `call`/`return`
arrows, `alt`/`opt`/`loop` fragments. None of that has an Arazzo carrier outside
`x-` extensions. There is also a hard fence in Arazzo's own grammar:
`sourceDescriptions[].type` admits only `openapi`, `asyncapi` and `arazzo`, so
gRPC, GraphQL and `in-process` protocols could never have migrated at all.

So `arazzo.yaml` **landed as a sibling role**, not as a dialect: an eleventh row
in the role table, addressable as `srn://…/{protocol}.arazzo`, OPTIONAL, and the
mini-spec stays the authoritative choreography source — undeprecated, unwarned,
and still the only source a sequence diagram derives from. ADR 0020 is the
record. Twelve instances ship, on the protocols that can ground them and nowhere
else.

**Stately.ai adoption was ruled down on shape, not on price.** Embed URLs do not
exist for private machines and every Studio surface is a remote fetch, which a
portal that must run offline cannot use. Their published authoring-config JSON
Schema validates only XState's *normalized* surface, so it became a conformance
target reached through a normalizer rather than the authority `states.json`
points at; `xstate.test.ts` runs every machine in the catalog through it, and
through `createMachine()` itself, with the file list derived from disk. Their MIT flow stack contains no statechart
code, so mermaid stayed.

### Artifacts get addresses, and roles get dialects

The two contracts everything else in this release rides on:

- **ADR 0014 — artifact addresses.** A dot suffix on the final SRN segment
  addresses a sibling file by role: `srn://acme/protocol/settlement.transport`.
  A closed per-kind role table, `@N` staying a coordinate of the parent snapshot,
  and every entity-reference surface fencing the suffix out under its own class.
  An artifact has no clock of its own.
- **ADR 0015 — artifact dialects.** A role names a file and an address; what the
  bytes are written in is the file's business, declared under a native key where
  the format has one (`openapi:`, `asyncapi:`, `arazzo:`, `schema.json`'s own
  `$schema`) and otherwise under `$schema` naming a framework meta-schema. A file
  declaring nothing is read as the legacy dialect and **warned, never broken**
  (`W_ARTIFACT_DIALECT`). That is what makes `transport.yaml` able to become
  AsyncAPI without its address moving.

All 70 legacy artifacts were swept to carry a header in the same commit as the
contract, and three framework meta-schemas that *rejected the very header naming
them* were reopened — following the contract would otherwise have invalidated 48
files at once.

### Config becomes a contract

A component's configuration is now an ordinary datamodel with `usage: config` —
flat `SCREAMING_SNAKE` scalars, `writeOnly` marking a secret, `default` forbidden
on a secret, `required` listing what must be provided. No new role, no new edge;
the link is ownership by placement. What it buys is a join the catalog could not
express before: every required-no-default key of a hosted component's contract
must be declared by the environment hosting it (`W_ENV_CONFIG_MISSING`). Seven
environment classes left the debt register having gained real emitters.

### Transport gains a second dialect

Eleven of the 31 shipped `transport.yaml` are AsyncAPI 3.1 documents; twenty
remain the mini-spec. That split is the design and not unfinished work: AsyncAPI
has no `in-process` protocol and gRPC is not one of its bindings, so a role with
one dialect could not describe this catalog. ADR 0017 records the ruling; ADR
0019 records what the migration did and did not preserve.

### A gate with teeth, and a version gate

- **`metaframework check --since <ref>`** — every entity whose files changed
  since `<ref>` must have bumped its `version`, with `evolution.md`'s status-only
  exemption, exiting non-zero when one did not. Wired into CI on pull requests.
  `E_VER_UNBUMPED` is its portal-side counterpart, walking history rather than a
  diff.
- **`scripts/repo-hygiene.mjs`** — seven checks over every tracked file, each one
  a review finding that recurred often enough to deserve a machine: stray files,
  tracked build artefacts, raw NUL bytes, ragged markdown tables, stale
  distilled-from markers, drifted verbatim copies, and the plugin bundle's
  diagnostic inventory against what the portal emits. Replayed against `51d2c53`
  it reports 131 findings.
- **CI exists**, gating every push and pull request, with a pack audit that fails
  on a tarball leak and a run of the packaged CLI under the declared Node floor.

### Diagnostics stopped being decorative

The largest single change for anyone running `metaframework check`:

| Measured                       | 0.1.1 (`1b344e0`) | 0.2.0 (working tree, 2026-08-22) |
| ------------------------------ | ----------------- | -------------------------------- |
| codes the spec defines         | 108               | 123                              |
| codes something emits          | 61                | 106                              |
| codes in the debt register     | 47                | 17                               |

`lib/catalog/artifact-checks.ts` is most of that: the `journey.yaml`,
`workflows/*.yaml` and `states.json` mini-spec parsers used to be reachable only
from a rendering component, so a broken artifact showed a finding on its own page
while `/diagnostics` reported the catalog clean. They are folded into the load
now, joined by the Arazzo grounding rule (`W_PROTO_ARAZZO_UNGROUNDED`). The kind
disciplines under `lib/{adr,requirement,actor,structure,datamodel}/` account for
most of the rest.

The register is a **ratchet, not an exemption list**: a test fails the moment a
listed code gains an emitter, so implementing a rule forces its line out.

### The catalog itself

324 entities across 3 solutions → **480 across 5**. `kubeedge` and `stackstorm`
were surveyed from their public sources, and they exist to put weight on contracts
the framework had been stating on no evidence — before them, `grpc` transports and
`environment-type: edge` had zero instances anywhere. Both surveys say what they
could not establish rather than inventing it: eighteen components declare no
environment because their sources never state where they run, and the warnings
that produces are left standing.

### Console

The front page teaches the address scheme, the version forms and every kind and
component-type glyph — all **derived** from the loaded catalog and the style
registries rather than written, because a legend that can disagree with the thing
it explains is worse than no legend. Every box on the map is a link rather than
only the focused one. Tags read above the title. The version-check verdict moved
to the breadcrumb line. One glyph now means one thing: three icons had been shared
across the kind and component-type registers.

---

## What is NOT in 0.2.0

Stated plainly, because a release note that only lists wins is an advertisement.

**Seventeen specified diagnostic classes still have no emitter.** Sixteen belong
to the protocol kind and one to datamodels. The authority is `UNIMPLEMENTED` in
`framework/portal/src/lib/catalog/diagnostic-coverage.test.ts`, which names the
gap for every entry:

- **`transport.yaml` is parsed and never validated**, in either dialect —
  `E_PROTO_TRANSPORT_SCHEMA`, `E_PROTO_TRANSPORT_BINDING`,
  `E_PROTO_TRANSPORT_SPEC_CONFLICT`, `E_PROTO_TRANSPORT_ASYNCAPI`,
  `W_PROTO_TRANSPORT_HOST`, `W_PROTO_SPEC_ASYNCAPI`, and
  `W_PROTO_WF_CHANNEL_UNKNOWN`, which needs the transport's surface list to check
  a workflow step's `channel` against. This is the single largest hole in the
  release and every other protocol gap is downstream of it or beside it.
- **The participant surface is read three ways and judged by none** —
  `E_PROTO_PARTICIPANT_KIND`, `E_PROTO_ALIAS_DUP`, `E_PROTO_PAYLOAD_KIND`,
  `W_PROTO_PARTICIPANT_MISSING`, `W_PROTO_PARTICIPANT_UNLINKED`,
  `W_PROTO_STYLE_MISMATCH`. `E_PROTO_PARTICIPANTS` is a different shape again:
  the rule *is* enforced, by a zod `.min(2)`, and reported as `E_FM_SCHEMA`, so
  the class the spec names for it never appears.
- **`E_PROTO_SPEC_FILE` and `W_PROTO_ARTIFACT_UNKNOWN`** — nothing inspects a
  protocol entity directory for the files the spec pins, or for files it does not
  recognise.
- **`E_DM_NOT_ADDITIVE`** — the only rule that needs git. It diffs `schema.json`
  at version N-1 against the working tree, and `loadCatalog` is the pure
  filesystem→graph step; `metaframework check` never spawns git.

**The devops build does not exist.** `product/devops` is `lifecycle: concept`:
no Dockerfile, no `docker/` directory, no chart, no `vercel.json`, no deploy
script. The roadmap named it an explicit non-gate and it stayed one. The three
environment entities describe targets that do not exist, and every page in that
subtree says so.

**Lanes still open:**

- **transport → AsyncAPI is 11 of 31.** Six of the twenty remaining are gRPC and
  `in-process` and can never migrate. The rest await a reviewer, not a migration.
- **journey → Arazzo export** — ruling 2 on the roadmap is still open. The
  mini-spec is kept and the rejection is recorded in `kinds/journey.md`; a
  read-only Arazzo export was left unbuilt because no consumer was identified.
- **topology adopts nothing.** ADR 0016 defers the choice and locks six criteria
  so the survey is never re-run, and names the reopening trigger: the devops
  component actually generating a chart. Both prototypes it proposes — a
  Structurizr DSL export and Score inside the devops product — are unbuilt.
- **No Arazzo lint shell-out and no Respect tests.** Redocly CLI and Spectral
  were named as consumers the `.arazzo` role would unlock; neither is wired into
  `metaframework check`. Nothing in `bin/` shells out to either.
- **`metaframework derive arazzo`** — generating initiator-perspective skeletons
  from `call`/`return` pairs — is a later idea, not a deferred task.
- **Arazzo 1.1 has no schema this framework can verify against.** The OAI's
  published schema is archived at 1.0 and the 1.1 URL returns 404, which is why
  the artifact is grammar-free by decision. `channelPath` and the
  `{$sourceDescriptions.<name>.url}#/…` spelling are internally consistent across
  the reader, the spec and the corpus, and are **not** verified against the
  Arazzo Specification.

**Not decided here:** the Claude Code plugin manifests
(`.claude-plugin/marketplace.json`, `marketplace/plugins/metaframework/.claude-plugin/plugin.json`)
still read `0.1.0`. The plugin version is not the npm package's version and this
release does not move it; the bundle's content changed substantially, so the
owner may want to.

---

## Verification, at preparation time

Every gate, run 2026-08-22 against the working tree:

```console
$ node framework/portal/scripts/repo-hygiene.mjs
1009 tracked files, 7 checks, clean

$ npm --prefix framework/portal run typecheck        # tsc --noEmit, clean
$ cd framework/portal && npx eslint src bin scripts  # clean

$ npm --prefix framework/portal test
Test Files  52 passed (52)
     Tests  1308 passed | 3 todo (1311)

$ node framework/portal/bin/metaframework.mjs check
0 errors, 35 warnings — 480 entities across 5 solutions.

$ node framework/portal/bin/metaframework.mjs check --since HEAD
since    HEAD — 28 entities changed, each either bumped its version or changed
               only its status.
```

The 35 warnings are deliberate and were triaged one at a time in `07633c5`:
every one was read and given one of three verdicts — the fact exists and is
unwritten, the warning is true and the catalog should say so, or the rule is
miscalibrated. Only the first was fixed by authoring. A warning silenced by a
guess is a lie with a green check beside it.

---

## Publishing: what the owner runs

**Prerequisite, and it cannot be automated.** The npm account has
`two-factor auth: auth-and-writes` and the second factor is a **security key**.
npm can run that ceremony only with a TTY — `lib/utils/open-url.js` returns early
when stdin is not a TTY — so an interactive publish is impossible from a pipe, a
CI runner or an agent. The documented way around it is an **npm Classic →
Automation token**, which carries the 2FA bypass:

1. npmjs.com → Access Tokens → Generate New Token → **Classic** → **Automation**.
   (A *Publish* token still demands the security key and will not work headlessly.)
2. Put it in `.env` at the repository root — gitignored, and this repository is
   public:

   ```bash
   NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

`framework/portal/.npmrc` references `${NPM_TOKEN}`; `scripts/release.sh` sources
the `.env`, refuses a token without the `npm_` prefix, and proves the credential
with `npm whoami` before spending a full build on it.

Then, from the repository root:

```bash
# 0. review and commit — this tree is deliberately left dirty
git status
git add -A && git commit          # nothing here has been committed

# 1. the gates, exactly as CI runs them
node framework/portal/scripts/repo-hygiene.mjs
npm --prefix framework/portal ci        # optional locally; CI's clean install
npm --prefix framework/portal run typecheck
cd framework/portal && npx eslint src bin scripts && cd ../..
npm --prefix framework/portal test
node framework/portal/bin/metaframework.mjs check

# 2. rehearse the publish — builds, packs, lists the tarball; pushes nothing.
#    Needs NPM_TOKEN too: the script authenticates before it packs.
npm run release:dry

# 3. publish
npm run release

# 4. confirm the registry moved
npm view @bershadsky/metaframework versions

# 5. tag, after the registry confirms
git tag -a v0.2.0 -m 'v0.2.0 — the dialects release'
git push origin main --follow-tags
```

`npm run release` is `bash scripts/release.sh`, which `cd`s into
`framework/portal` and ends in `npm publish`. `npm publish` runs `prepack`, which
is `npm run package` — a full `next build` plus `assemble-standalone.mjs` — so the
tarball is built from the tree at publish time and never from a stale
`.next/standalone/`.

**Do not run `npm publish` at the repository root.** The root manifest is
`private: true` and carries a `version` field for one reason only: so that npm
fails with its own "marked as private" message instead of crashing on
`semver.parse(undefined)`.

**If the publish is refused**, the token is the first suspect: `npm whoami` from
`framework/portal` exercises `framework/portal/.npmrc` and the Automation token,
where the same command from anywhere else exercises the interactive credential in
`~/.npmrc` and will happily succeed while the publish fails.
