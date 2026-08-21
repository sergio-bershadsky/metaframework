# 0.2.0 — the dialects release

Drafted 2026-08-21 from a seven-lane research pass (XState, Arazzo×2, config,
topology, visualization, release mechanics; every external claim fetched, every
repo number computed). Status per lane is marked; two lanes end in a
**pushback** against the initial direction and need an owner ruling before
their ADRs are written.

**The principle.** The envelope — frontmatter, SRNs, relations, the role table
— stays proprietary: it *is* the product. The payloads behind the roles
standardize, one dialect at a time, **additively**: a new dialect lands beside
the old, the old is warned (`W_ARTIFACT_DIALECT`), nothing breaks. ADR 0014 is
what makes this cheap — `.transport` names a role, not a format, so a dialect
migration never moves an address.

## Decision board

| Lane                       | Direction given           | Research verdict                                                                                                                                          | Status                   |
|----------------------------|---------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------|
| `states.json` → XState v5  | decided                   | already true — all 8 files load via `createMachine`                                                                                                       | **locked**, effort S     |
| Stately.ai adoption        | "as much as possible"     | SaaS disqualified (offline + private catalogs); their schema is a CI conformance target, not our authority; their MIT flow stack has zero statechart code | **researched**, see lane |
| workflows → Arazzo         | leaning yes               | ✋ Arazzo cannot carry multi-party choreography; add `.arazzo` as a sibling role instead                                                                   | **needs ruling**         |
| journey → Arazzo           | suggested ("imho")        | ✋ actor/touches have no Arazzo home; keep mini-spec, record the rejection                                                                                 | **needs ruling**         |
| config → JSON Schema model | decided                   | concrete design ready (`usage: config` datamodels)                                                                                                        | **locked**, effort M–L   |
| topology                   | open to research          | defer the choice, lock the criteria in an ADR; two prototypes                                                                                             | **deferred by design**   |
| transport → AsyncAPI 3.1   | *(not in the given list)* | the largest real migration: 16 protocol entities                                                                                                          | **proposed**, unruled    |

## Lane: states — XState v5 *(locked)*

The research's central finding: **the migration is already done.** The spec's
pinned subset is a proper subset of XState v5 `createMachine` config — zero
foreign keys, zero missing keys — and all 8 `states.json` files in the catalog
construct successfully today. Per-file delta: none. There is no old dialect to
warn about.

Ships in 0.2.0:

- **Spec wording** (S): `kinds/protocol.md` states the contract as "a strict,
  setup-free subset of XState v5 `createMachine` config — the file MUST load
  unchanged". Keep the exclusion list (`context`/`after`/`invoke`/`meta`/
  `parallel`/`history`), adding that `after` and `meta` are excluded by
  policy, not serializability. Guards/actions are reference-only prose
  resolved by consumers.
- **Proof-of-contract test** (S): CI literally runs
  `createMachine(JSON.parse(file))` over every `solutions/**/states.json`
  (dev-dep `xstate` 5.x, MIT), so "directly loadable" is enforced, not
  asserted.
- **Simulation widget** (M) — the "widgets that XState uses" ask: rendering
  stays mermaid `stateDiagram-v2` (locked by decision-record amendment
  2026-08-19-e; `@xstate/graph` is explicitly NOT added — `toDirectedGraph`
  gives structure without layout and duplicates `parseStates`). The new layer
  is interactive: a client component dynamic-imports `xstate` (**31.6 kB gz**
  measured over the real transitive ESM chunk set — a correction; an earlier
  draft said 14.5 kB) as a **second** lazy import behind the Simulate click,
  never a top-level import, or every protocol page pays for a widget nobody
  opened. It builds `createMachine(config).provide({ guards })` with per-guard
  pass/fail toggles (guard names come from `parseStates` edges — they are
  prose, and unimplemented guards *throw* at send-time, so stubs are
  mandatory), event buttons gated by `snapshot.can()`, and fired actions
  logged through core xstate's own `inspect` callback (unimplemented actions
  no-op while still emitting `@xstate.action` — verified in the shipped
  bundle). No Stately package is involved and nothing leaves the browser.

  Four details the first draft got wrong or missed, each a likely ship defect:
  - **The highlight needs a prop and its own class.** The join is the
    `byAnchor` map built in `decorate()` and nulled on cleanup — not a bare
    `state-<alias>` lookup — and it must NOT reuse `smc-linked`, which the
    anchor-hover effect clears on every pass (simulation state would vanish
    the moment someone moused over the source pane).
  - **Highlight the ancestor chain**, via the existing `ancestors()` walk:
    lighting the leaf only looks broken on 4 of the 8 catalog machines.
  - **Accessibility**: the SVG host is `aria-hidden`, so a simulation living
    only in SVG classes is invisible to a screen reader. Current state and
    event log need a real live region outside the host.
  - **Guard toggles must not read as evidence.** Guards are prose, so a
    toggle panel shows branching the *reviewer* chose. Label the control
    hypothetical, and distinguish "not accepted in this state" from "blocked
    by a guard you turned off" — `snapshot.can()` conflates them.

Open, post-0.2.0: canned walkthroughs (enumerate paths over the `parseStates`
edge model, not `@xstate/graph`), multi-machine `states/` directory.

## Lane: Stately.ai — how far we lean on it *(researched 2026-08-21)*

Asked directly: use stately.ai as much as possible, for visualization and for
their JSON specs. The answer splits three ways, and only one of the three is
adoptable.

**The SaaS is structurally disqualified — not a trade-off, a mismatch.** Every
Studio surface (`/registry/editor/embed/…`, `editor.stately.ai/embed`, the
`createStatelyEmbed` iframe) is a remote document fetched at view time, so a
portal with no external network renders nothing. Worse, **embed URLs do not
exist for private machines**: producing one for a company's private
architecture means publishing that architecture to Stately's servers as public
or unlisted. On top of that: "Embed Stately into your own apps" is an
*Enterprise* line item, the SDK is public alpha, the free tier goes read-only
after a 7-day trial (so any author workflow imposes $33/mo/seat on our users),
the REST API returns 401 unauthenticated with no anonymous read path, and the
editor host app is not distributed on npm — self-hosting routes to Enterprise
sales. There is also **no deep-link import**: no URL API, no query prefill;
`registry/new` is behind login. The only working deep link rewrites a GitHub
file URL, and Studio ingests **TypeScript ASTs**, not JSON, writing machines
back as JS/TS with identity in source *comments* — which a `states.json`
cannot carry. An "Open in Stately" button would therefore be a bare advert.

**Their JSON schema is real but cannot be our authority** — and this corrects
the earlier pass, which found only the draft-07 *serialized-definition* file.
`https://stately.ai/schemas/xstate.json` now exists: draft 2020-12, `$id` set,
live, byte-identical to the MIT copy shipped in `@statelyai/sdk`. But it
validates only the **normalized** surface (array targets, object guards,
`{type}` actions), so all 8 catalog files fail it *as authored*; its
`additionalProperties: false` forbids the very `$schema` key that would point
at it; and it is unversioned, undocumented, one commit old, carried by an 0.x
package. So:

- **We publish our own meta-schema** (S, ½–1 day): generate it from the
  existing zod `machineSchema` in `lib/protocol/states.ts` (zod v4 emits JSON
  Schema; ajv already ships), give it a framework-owned versioned `$id`,
  golden-file it against all 8 files, and associate it **by filename** rather
  than by an in-file `$schema` key.
- **Their schema becomes a downstream conformance target** (M, +1 day): a
  ~20-line normalizer plus a CI job validating every normalized `states.json`
  against a **vendored** copy. The researcher ran exactly this: **8/8 pass
  today.** That converts "our subset really is XState" from a claim in the
  decision record into a machine-checked fact, at zero runtime cost and zero
  SaaS exposure. The same normalizer, used forward, gives users a one-way
  **export to XState JSON**. Export is safe; import is not.

**Their MIT code is worth exactly one thing, and it is not rendering.** Stately
now publishes an MIT flow stack (`@statelyai/flow`, `flow-react`, `flow-dom`,
`@statelyai/graph`) — but `@statelyai/flow` contains **zero** statechart code
(verified: 0 grep hits); it is a generic node-graph canvas, so statechart
semantics would be entirely ours to write. It does not beat mermaid, which
supplies exactly the statechart layout semantics (nested regions, pseudostates,
self-loops) the Stately OSS stack lacks. It also carries a supply-chain gap: no
public repo, no LICENSE file in the tarball, no sourcemaps, docs 404. And
`@statelyai/mcp` is MIT **with a carve-out** explicitly reserving Stately's
state-machine graph interface as proprietary — the clearest statement available
that their visualization is not open.

What *is* unambiguously ours: **`createBrowserInspector`'s transport is pure
`postMessage` with a configurable `url`** — no HTTP, no WebSocket, no API key,
no account anywhere in that code path — and every `@xstate.actor` event carries
`definition: safeStringify(logic.config)`, i.e. the authoring config. A portal
`/inspect` route could therefore give **live inspection of a user's own running
app** with no SaaS at all, reusing `states.ts` + `mermaid.ts` +
`state-chart.tsx`. Two hard conditions: implement the receiver ourselves
(~20 lines, origin allowlist) because `createBrowserReceiver` performs **no
origin check**, and note `BrowserAdapter` posts with `targetOrigin: '*'` —
any window landing in the named `xstateinspector` target can read the whole
machine. Post-0.2.0, and only with those pinned.

**Instead of an Open-in-Studio button: "Copy as `createMachine()`"** (S). It
delivers the entire user benefit — get this machine into a real editor — with
zero network, no destination baked in, and serves Studio, VS Code, or a test
file equally.

**Also ship `CSP default-src 'self'`** (S, tested against mermaid's inline
styles and Monaco's workers): the item that turns "offline" from an accident
into a guarantee.

## Lane: workflows — Arazzo *(pushback — needs ruling)*

The field-by-field mapping killed the direct migration. An Arazzo step
**legally requires** one of `operationId`/`operationPath`/`workflowId` (1.1
adds `channelPath` for AsyncAPI sources) — it models *one executor chaining
API operations*. The mini-spec models **multi-party choreography**: `from`/`to`
participant aliases, actor and in-process participants, self-calls, event
fan-out, paired call/return arrows, display-only prose guards, structured
`alt`/`opt`/`loop` fragments. None of that has an Arazzo carrier beyond `x-`
extensions — which would be the mini-spec rebuilt inside a goto-graph with
fake operation grounding, strictly worse authoring for zero rendering gain.
`sourceDescriptions` is also closed to openapi|asyncapi|arazzo: gRPC, GraphQL,
and in-process protocols can never be grounded.

**Recommended shape** (mirrors the `openapi.yaml` promotion exactly):

- New role-table row: role `arazzo` → fixed name `arazzo.yaml`, addressable as
  `srn://…/{protocol}.arazzo`, OPTIONAL, bytes-only in 0.2.0 (portal renders
  an attachment card; `E_SRN_DANGLING` when absent). Sensible only where
  grounding documents exist (`openapi.yaml`, or a linked AsyncAPI spec).
- The mini-spec **stays the authoritative choreography source** — sequence
  diagrams keep rendering from it, unwarned. Arazzo is a *different artifact*
  (orchestration/test surface), not a new dialect of the same role, so no
  deprecation applies.
- Consumers gain now: Redocly CLI / Spectral lint as a warn-only shell-out in
  `metaframework check`; Respect-executable E2E contract tests against
  environment entities. Honest sizing: lint and Respect are real; Arazzo
  visualization and codegen tooling do not exist yet (verified against
  Redocly's roadmap) — the portal renders it itself (see Visualization).
- Guard against drift between the two descriptions of one exchange: a scope
  rule (arazzo.yaml describes the initiator-facing surface only) plus a
  W-class tether — every `operationId` in `arazzo.yaml` resolves into
  `openapi.yaml`.

Effort: S for the role + spec; M with lint shell-out and the tether check.
Open: a later `metaframework derive arazzo` generating initiator-perspective
skeletons from call/return pairs; AsyncAPI adoption for kafka protocols to
unlock 1.1 channel steps; the extension prefix (`x-srn-*` — `x-arazzo`/
`x-oai-*`/`x-oas-*` are reserved by the OpenAPI Initiative).

## Lane: journey *(pushback — needs ruling)*

The "sequence of flows" intuition identifies the wrong neighbour: Arazzo is
the industry standard for the **protocol workflow file** — the thing
`journey.md`'s NOT-table already fences off — not for an actor's path across
touchpoints, for which **no industry machine format exists** (mermaid
`journey` was evaluated and rejected in `mermaid.ts` for its mandatory
satisfaction scores; BPMN is rejected in the spec by name). Concretely:
`actor`, `touches`, and the three-state `protocol` field — the mechanism of
`W_JRN_UNDOCUMENTED_INTEGRATION`, the kind's flagship check — have no Arazzo
home except `x-`, while Arazzo's required fields (`stepId`,
`sourceDescriptions` ≥ 1, one operation/workflow per step) demand fabricated
values on typical journeys and import the branching the kind forbids.

Recommended: **keep the mini-spec unchanged**; add one "considered and
rejected" paragraph in `journey.md` naming Arazzo beside the BPMN paragraph,
so the decision is recorded (S). Optional, only if a concrete consumer
appears: a best-effort read-only Arazzo *export* for fully API-carried paths
(M, zero spec change). Deferred: relaxing JRN16 so a step's `protocol` may
cite `…/protocol/x.workflows.name` — additive and cheap, but it re-opens a
just-locked fence for a gain prose citations already provide; revisit after
the workflows lane lands and a consumer needs machine-readable step→workflow
binding.

## Lane: config — JSON Schema model, YAML/JSON instances *(locked direction, design ready)*

- **Contract entity**: a component's config contract is an ordinary datamodel
  in that component's `datamodel/` bucket with new `usage: config` (enum
  grows additively: `storage|exchange|both|config`). Discipline: root
  `object`; flat scalar properties named `^[A-Z][A-Z0-9_]*$` (env-var
  reality; nesting stays out of 0.2.0 so the provides⊇requires join stays
  well-defined); `writeOnly: true` marks a secret key; `default:` carries
  non-secret defaults and is FORBIDDEN on `writeOnly` properties; at most one
  config contract per bucket. All existing machinery — canonical `$id`/
  `x-srn`, Ajv 2020-12 registry, `E_DM_NOT_ADDITIVE`, `examples/`, `allOf`
  mixins for shared surfaces (`OTEL_*`) — applies unchanged. **No new role,
  no new edge**: the component↔contract link is ownership-by-placement plus
  `usage: config`.
- **config.yaml**: format unchanged (fully additive migration for the 6
  existing files); the new dialect additionally permits native-typed
  `value:` scalars; each entry's contract is derived from its `for:` target —
  no `schema:` ref field.
- **New diagnostics**: `E_ENV_CONFIG_VALUE` (a `value:` fails the key's
  subschema), `W_ENV_CONFIG_MISSING` (**the provides ⊇ requires check** — a
  hosted component's required-no-default key not declared by the
  environment), `W_ENV_CONFIG_UNDECLARED` (`for:`-scoped key absent from the
  target's contract), `E_ENV_SECRET_MISMATCH` (`secret:` disagrees with
  `writeOnly:`), `E_DM_CONFIG_SECRET_DEFAULT` (a secret value in git),
  `E_DM_CONFIG_SHAPE` (contract violates the flat/casing discipline).
- **Secrets, three layers**: contract (git: schema + `writeOnly`),
  declaration (git: key + `source` locator), value (vault/deploy-time only) —
  ENV8 preserved and strengthened.
- **Helm export**: `values.schema.json` from the same contract, but bundled
  self-contained (deref into `$defs` — Helm ≥ 3.18.5 has a relative-`$ref`
  regression, and ≤ 3.18.4 silently ignores 2020-12 keywords; the export must
  state a minimum Helm version or down-project to draft-07).

Effort M–L — honest sizing because config.yaml is *parsed but never
validated* today, so 0.2.0 implements the v1 checks (ENV5/ENV8/ENV10) plus
the new join, not just the delta.

## Lane: topology *(deferred by design)*

Survey result (project liveness verified per candidate): Compose-as-topology
is lossy (kills replica ranges — negative value); OAM/KubeVela and Radius
mean adopting a control plane (L); TOSCA 2.0 was OASIS-approved in 2025 but
its tooling is dormant (xOpera idle since 2022). Nothing earns a migration
while `topology.yaml` states *reviewable claims* and nothing generates
deploys from it — ADR 0005 currently hand-maintains compose and chart, so no
consumer exists.

0.2.0 does: (1) publish the topology meta-schema (S); (2) an **ADR-of-record
that defers the choice but locks the criteria** so the survey is never
re-run: environment-centric axis (never a second membership channel),
claim-not-deployable (drift is a warning), lossless replica ranges/regions,
SRN referential integrity, reviewer prose as first-class, toolchain shipping
releases in the current year, and the reopening trigger — the devops
component actually *generating* compose/chart. Two prototypes worth running,
neither touching the role table: a **Structurizr DSL derived export** (C4
deployment view from topology.yaml + the component graph — the only surveyed
format whose semantics match "placement is a claim"; S–M) and **Score as a
component-side `score.yaml` inside the devops product only** (score-compose
/ score-k8s directly test "one artifact set, two topologies"; M, noting
score-helm is deprecated).

## Cross-cutting: dialect machinery *(the critical path)*

Lane-independent, and 0.2.0 is shippable on this alone:

1. **Discriminator table** (decision-record amendment 2026-08-21-a + ADR
   0015): native keys where the standard has one (`asyncapi:`, `arazzo:`,
   `openapi:`, `$schema`); canonical-meta-schema `$schema:` for proprietary
   roles and `states.json`. Absent discriminator = legacy dialect →
   `W_ARTIFACT_DIALECT`, warned never broken. Spelled anything but
   `version:` (evolution.md forbids that key in artifacts). Filenames stay —
   the role table is untouched; a lane wanting a new filename comes back for
   a role-table amendment.
2. **Meta-schemas**: 5 already exist as datamodel entities under
   `product/specification/datamodel/` (transport-document,
   state-machine-document, workflow-document, schema-document,
   entity-frontmatter) — served by `/schemas` today, legally. Author the 3
   missing: journey-document, topology-document, config-document (S; zero
   route/host work).
3. **Portal enforcement** (M): admit the discriminator key in every strict
   validator, emit `W_ARTIFACT_DIALECT` for legacy shape, strip `$schema`
   before the `createMachine` contract test.

## Cross-cutting: visualization

- **States**: mermaid stays (locked); the simulation widget is the addition
  (M, above). Cheap adjacent win: mermaid 11's state renderer honours
  `config.layout`, so `layout: 'elk'` is a one-line layout-quality upgrade (S)
  — gated on resolving `@mermaid-js/layout-elk`'s `elkjs ^0.9.3` pin against
  our `^0.12.0`.
- **Stately Studio, recorded as closed** (see the Stately lane): an embedded
  Studio iframe is impossible for a private catalog and dead offline; an
  "Open in Stately" button has no deep-link mechanism to link to; and wiring
  `@statelyai/inspect` at their hosted inspector would ship the verbatim
  `states.json`, description strings included, over `targetOrigin: '*'` to a
  page whose retention we cannot audit. All three rejected with reasons, the
  same way the topology ADR closes its survey.
- **Arazzo**: render-it-ourselves is confirmed necessary (Redocly
  visualization: not started; the only visualizer is a VS Code extension). A
  React Flow step-graph behind the existing `navigable.tsx` code-split:
  steps as nodes; implicit-order, `goto`, and `dependsOn` edges; criteria
  labels; destructive token on `onFailure` edges; ELK layered layout;
  navigation into referenced workflows/operations. **Zero new dependencies**
  — React Flow 12 and elkjs already ship. (M)
- Open, later: mermaid-flowchart fallback, Arazzo try-it (Respect
  territory), AsyncAPI send/receive styling, simulation-driven walkthrough of
  Arazzo graphs.

## Migration surface (computed at ae7d355)

| Artifact           | acme | brass | metafw | total | migration delta                |
|--------------------|------|-------|--------|-------|--------------------------------|
| `states.json`      | 6    | 2     | 0      | 8     | **zero** — already valid       |
| `workflows/*.yaml` | 12   | 10    | 2      | 24    | none (mini-spec stays)         |
| `journey.yaml`     | 2    | 3     | 4      | 9     | none (mini-spec stays)         |
| `config.yaml`      | 1    | 2     | 3      | 6     | additive (typed `value:` opt)  |
| `topology.yaml`    | 2    | 2     | 3      | 7     | none (meta-schema only)        |
| `transport.yaml`   | —    | —     | —      | 16    | the AsyncAPI lane, if ruled in |

Entity-level: ≤ 33 entity version bumps (17 protocols, 9 journeys, 7
environments) even in the maximal case — bumps are per entity, not per file.

## Release train from HEAD `ae7d355`

1. **[CP]** Land the in-flight artifact-SRN portal implementation (running;
   review-and-commit).
2. *(parallel)* **Unpark 0.1.1**: registry holds 0.1.0 published; the 0.1.1
   bump commit exists but was never published. Needs the npm Automation token
   (human action — the account 2FAs with a security key). De-risks 0.2.0's
   mechanics for the cost of one token.
3. **[CP]** Dialect machinery spec: amendment 2026-08-21-a + ADR 0015 (M).
4. **[CP]** The 3 missing meta-schema datamodels (S).
5. **[CP]** Portal dialect enforcement + `W_ARTIFACT_DIALECT` (M).
6. *(per-lane, parallel, each independently shippable in a 0.2.x)*: states
   spec-wording + proof test + simulation widget; `.arazzo` role + lint
   tether (if ruled); config contracts + joins; topology meta-schema + ADR +
   prototypes; transport → AsyncAPI 3.1.0 (if ruled; M, 16 entities).
7. Ship 0.2.0: bump, README refresh, `scripts/release.sh`.

**Explicit non-gates**: the devops build (`lifecycle: concept`, nothing
exists — it does not gate dialect machinery) and every individual format
lane. 0.2.0 is shippable on steps 1 + 3 + 4 + 5 alone, with lanes riding
0.2.x releases.

## Rulings needed from the owner

1. **Workflows**: accept `.arazzo` as an additive sibling role with the
   mini-spec staying authoritative — or insist on Arazzo as the workflow
   dialect despite the multi-party mismatch documented above?
2. **Journey**: accept keep-and-record-rejection — or pursue the read-only
   Arazzo export despite no identified consumer?
3. **Transport → AsyncAPI 3.1**: in or out of 0.2.0's scope? (Not in the
   original five lanes; it is the largest genuine standardization win left.)
4. **0.1.1 unpark**: provision the npm Automation token now, or fold the
   publish into 0.2.0?
