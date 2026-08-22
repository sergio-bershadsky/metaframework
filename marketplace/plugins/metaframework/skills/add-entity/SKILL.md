---
name: add-entity
description: This skill should be used when the user asks to "add a product", "add a component", "add a service to the catalog", "create an actor", "add an environment", "write an ADR", "record a decision", "add a requirement", "add an NFR", "add a capability", "what can the business do", "add a customer journey", "map the path a user takes", "add a metric", "add a KPI", "put a number on this", "start a solution root", "add an entity to the catalog", "where does this component belong", or otherwise names one of the mechanical metaframework kinds to create — product, component, actor, environment, adr, requirement, capability, journey, metric, or the solution root. It carries the placement decision, the per-kind frontmatter contract, forward-only relation wiring, the prose each kind owes a reader, and the catalog check that closes the loop. For `datamodel` use `model-data` and for `protocol` use `protocol-design` — those two carry artifact contracts this skill does not; for designing a whole tree at once use `solution-design`, and for changing an entity that already exists use `evolve-entity`.
---

# Add an entity to a metaframework catalog

One procedure, ten kinds. `product`, `component`, `actor`, `environment`, `adr`,
`requirement`, `capability`, `journey`, `metric` and the `solution` root differ
only in which frontmatter fields they require and what their prose must say — the
ordering of decisions, the placement grammar, the relation rules and the
validation step are identical. `datamodel` and `protocol` are excluded because
they own artifact contracts (`schema.json`, `transport.yaml`, `states.json`,
`workflows/`) with their own skills.

`journey` is the one kind here that owns an artifact — a REQUIRED `journey.yaml`
— but it is a flat ordered list with four keys per row, not a mini-language, so
it stays in this procedure. Its format is in
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/journeys.md`.

## Where the rules live

**If `framework/spec/` exists in the repository, read it — it is authoritative.**
`framework/spec/kinds/<kind>.md` for the kind at hand, plus `srn.md`,
`structure.md` and `frontmatter.md`. Otherwise read the distilled reference
bundled with this plugin, which is the only copy an installed plugin can see:

- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/srn.md` — the consolidating principle (SRN / schema URL / disk path), identity, placement, relative-reference traps
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/structure.md` — layout, artifacts, enforced body sections
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/frontmatter.md` — common contract, per-kind fields, edge legality
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/environments.md` — `environment`, `actor`, `adr` and `requirement` in detail: `topology.yaml`, `config.yaml`, the enum rationales, the acceptance-criteria and ADR-section rules
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/journeys.md` — the `journey.yaml` mini-spec: step nodes, the no-branching rule, the 2–12 cap, the product-crossing check
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/evolution.md` — versioning, the swap

Do not restate those rules back at the user. This skill is the procedure; those
are the rules.

## Procedure

### 1. Confirm a new entity is the right answer

Not every fact deserves a directory. Before creating anything, check whether the
information belongs in an existing entity's prose or as an added relation edge.
Common false positives: a "component" that is an architectural layer rather than
a thing with an inside; a requirement with no acceptance criteria (that is prose,
or an ADR); an ADR for a decision nobody argued about (that is a paragraph in the
owning entity); a "metric" that is a second view of a number already described
(one number, one metric — but a dashboard is not an entity).

Since `capability` landed, the word *capability* means a kind. When someone says
"this component is a capability", find out which they mean — the reserved kind,
or the loose English sense — before creating anything. That ambiguity is the most
likely source of a wrongly-kinded entity in this whole procedure.

If the answer is "this belongs in an existing entity", say so and stop.

### 2. Pick the kind

| The thing is…                                                     | Kind          |
|-------------------------------------------------------------------|---------------|
| A funded, owned unit of delivery a customer could name            | `product`     |
| A deployable, embeddable or externally-operated unit of software  | `component`   |
| A person, system or credential *outside* the described software   | `actor`       |
| A target things are deployed to                                   | `environment` |
| An obligation with checkable acceptance criteria                  | `requirement` |
| A decision that was taken, on a date, by named people             | `adr`         |
| Something the **business can do**, that survives a rewrite        | `capability`  |
| One actor's **ordered path** across the solution                  | `journey`     |
| One **number** the solution observes about itself                 | `metric`      |

The two that get confused: a **requirement** states an obligation that holds
from now on and can be tested; an **ADR** records that a choice was made, why,
and what was rejected. A rule with no test is not a requirement. A decision with
no alternatives considered is not an ADR.

An **actor** is never a component. Anything the organisation operates is a
component even if it behaves autonomously; anything it does not operate but
*talks to* is an `external` component; a non-human identity that *initiates*
work — a release bot, a service account — is an actor.

**Capability, product, component, requirement, journey.** Five kinds compete for
the same sentence. Apply in order; the first `yes` wins:

| # | Question                                                                | If yes                                                                   |
| - | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1 | Is it funded, delivered and owned as a unit — a team and a roadmap?     | `product`. `shop` is a product; *sell goods online* is what it realizes. |
| 2 | Does it have an inside we describe — code, a runtime, an interface?     | `component`. A capability has no inside; it is realized, not built.      |
| 3 | Is it a statement that must be **true**, decidable by written criteria? | `requirement`. *Orders dispatch within 24 h* passes or fails.            |
| 4 | Does the **order** of steps across the solution matter to it?           | `journey`. A capability is a verb, a journey is a path.                  |
| 5 | Otherwise — the business can do it, and it survives a rewrite           | `capability`.                                                            |

The mechanical test when the table leaves it ambiguous: **write the sentence,
then imagine replacing every system behind it** — different vendor, language,
team. If the sentence needs rewriting it described the implementation and belongs
to a component or product. If it stands unchanged it is a capability.

```text
Fulfil an order                     # survives the rewrite  → capability
Run the fulfilment service          # dies with the service → component
Dispatch within 24 hours at p95     # decidable, pass/fail  → requirement
Ship the 2026 logistics platform    # funded and owned      → product
```

An actor's `goal` is **not** a capability: a goal is what a counterpart wants
*from* us, in their language, owned by the actor entity; a capability is what
*we* can do, in ours. "See an order's status without contacting support" is a
goal; "Report order status" is the capability serving it.

A **metric** is not a requirement and not a capability. A requirement is a
*commitment* that can be unmet; a metric is an *observation* that is nobody's
fault. A capability is what the business can do; a metric is how well it is being
done. The pattern the kind exists for is the pair: a `must` requirement with a
metric that `measures` it is a commitment you can actually check. One number, one
metric — a dashboard with nine tiles is nine metrics.

### 3. Place it — before writing a single line

Placement is grammar. A misplaced directory has **no SRN at all**, so the loader
rejects it while reading the tree, before any frontmatter is parsed.

| Kind          | May live in                             |
|---------------|-----------------------------------------|
| `product`     | the solution, and nowhere else          |
| `component`   | a product or a component                |
| `actor`       | the solution, and nowhere else          |
| `environment` | the solution, and nowhere else          |
| `capability`  | the solution, and nowhere else          |
| `journey`     | the solution, and nowhere else          |
| `adr`         | the solution, a product, or a component |
| `requirement` | the solution, a product, or a component |
| `metric`      | the solution, a product, or a component |

For `adr`, `requirement` and `metric`, **scope is responsibility, not
visibility.** Put it in the bucket of the container answerable for it. Any entity
in the solution may reference any of them regardless of where they sit, so "who
else needs to read it" is never the placement argument. A solution-level
requirement is a claim that no single component can discharge it —
`gdpr-erasure` in the acme fixture is solution-level for exactly that reason.

For a **metric** the question is *whose number is this?*, and it is a different
question from *what is this number about?*. Placement answers the first;
`measures` answers the second. A component-owned metric measuring a
solution-level capability is the ordinary case, not a smell — but a metric filed
outside the ownership line of a subject that *has* one (a component filing a
number about a sibling it does not own) is `W_MET_SUBJECT_SCOPE`.

`capability` and `journey` are solution-level for reasons worth stating out loud
when someone proposes otherwise. Two products may realize one capability, and the
second one arriving must not require moving the first one's SRN — capabilities
also outlive their realizers, so an address owned by the thing most likely to be
retired is the wrong address. A journey crosses product boundaries **by design**;
a product owning one would be claiming a path whose ends it cannot see. Neither
owns anything: a `metric/` bucket inside a capability or a journey is
`E_SRN_PLACEMENT`.

**State the resulting SRN and the resulting disk path out loud before creating
anything**, and get agreement if the placement is not obvious:

```text
srn://acme/product/shop/component/checkout/requirement/idem-cap
solutions/acme/product/shop/component/checkout/requirement/idem-cap/index.md

srn://acme/capability/order-fulfilment            # solution-level, always one pair deep
solutions/acme/capability/order-fulfilment/index.md

srn://acme/journey/first-purchase                 # …and its REQUIRED artifact
solutions/acme/journey/first-purchase/index.md
solutions/acme/journey/first-purchase/journey.yaml

srn://acme/product/shop/metric/checkout-conversion   # owner-scoped, like a requirement
solutions/acme/product/shop/metric/checkout-conversion/index.md
```

The two lines of each pair are the same string in two views — the SRN is the
identity and the disk path is its storage — so writing one out is writing the
other, and neither is a second addressing scheme (`srn.md`).

Placement is effectively permanent: entities are **never moved or renamed**,
because the SRN is the identity and the disk path is that identity's storage
(`srn.md`) — moving the directory changes the identity, and the git-backed
version history does not follow the move. A relocation later is a full swap
(`evolution.md`). Spend the minute now.

### 4. Name it

Kebab-case, `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 chars. Never one of the eleven
reserved kinds — `product`, `component`, `datamodel`, `protocol`, `actor`,
`environment`, `adr`, `requirement`, `capability`, `journey`, `metric` are
bucket names only.

Name the thing for what it is, not for where it sits or what it is made of:
`checkout`, not `shop-checkout-service`. ADRs take an ordinal prefix, unique
**per bucket** and never reused: `0001-single-currency`, `0002-change-data-capture`.

The three newest kinds each name themselves differently, and each has one trap:

- **capability** — a kebab-case noun phrase naming the doing,
  `order-fulfilment`, `identity-verification`. No ordinal. The trap is that the
  nominalized slug reads like the name of a service, which is exactly the
  confusion the kind exists to prevent — so `title` states the capability as the
  verb phrase the business actually says (`title: Fulfil an order`) and `summary`
  opens with a verb. `title: Order Fulfilment Service` is not a build error; it
  is a review defect.
- **journey** — a kebab-case verb phrase naming the **outcome**, in the actor's
  language: `first-purchase`, `coupon-redemption`, `return-a-parcel`. Not
  the internal process (`order-fulfilment-flow`). No ordinal.
- **metric** — a short slug of the thing observed, `checkout-conversion`,
  `delivery-on-time-rate`, `p99-authz-check`. No ordinal and **no unit
  suffix**: the unit is inside `target`, and `latency-ms` goes stale the moment
  the target moves to seconds.

### 5. Write the frontmatter

Every entity carries the common contract — `name` (MUST equal the directory
name), `kind` (MUST equal the bucket), `version` (integer), `title`, `summary`
(one line, ≤ 200 chars), `status` — plus its own required fields:

| Kind          | Required kind fields                                                    | Optional            | Sensible values for a new entity               |
| ------------- | ----------------------------------------------------------------------- | ------------------- | ---------------------------------------------- |
| `solution`    | `vision`                                                                | `scope`, `contacts` | `vision` in the user's own words               |
| `product`     | `lifecycle`                                                             | `primary-actors`    | `lifecycle: concept` or `incubating`           |
| `component`   | `component-type`, `lifecycle`                                           | `criticality`       | `lifecycle: planned` for a design-first entity |
| `actor`       | `actor-type`, `goals` (≥ 1)                                             | —                   | goals verb-first, from the actor's side        |
| `environment` | `environment-type`                                                      | —                   | —                                              |
| `requirement` | `requirement-type`, `priority`                                          | —                   | `priority` is one of must/should/could/wont    |
| `adr`         | `decision-status`, `date`; `deciders` once accepted/rejected            | —                   | `decision-status: proposed` while arguing      |
| `capability`  | **none at all**                                                         | —                   | the common contract is the whole frontmatter   |
| `journey`     | `actor`                                                                 | —                   | one SRN, not a list; the protagonist           |
| `metric`      | `metric-type`, `target`, `window`, `direction`                          | —                   | quote `target` and `window`, always            |

New entities start at `version: 1`, `status: draft`. Enum values are closed —
anything outside them is `E_FM_SCHEMA`. See `_shared/references/frontmatter.md`
for the value sets and the shapes of `vision`, `scope`, `contacts`,
`primary-actors`, `goals`, and the metric target grammars.

`component-type` has ten values. The three newest, one line each:

- `content` — a versioned content artifact, consumed by being read by a person
  or a model, shipped into or served from a host runtime it does not own.
- `application` — a fully-packaged program a user installs and runs as one
  unit; the shipped distribution, not the surfaces or services inside it.
- `specification` — a set of normative documents whose contract surface is the
  text itself, consumed by reference and never executed.

Every value carries obligations and review flags — the per-type disciplines
table in `_shared/references/decomposition.md`.

**`status` is the review state of the DESCRIPTION; `lifecycle` is the delivery
state of the THING DESCRIBED.** Four fields answer four different questions and
never substitute for each other: `status` is this document's, `lifecycle` on a
product is its portfolio stage, `lifecycle` on a component is its delivery stage,
`decision-status` is the decision's. The axes cross and every cell is legal — a
`status: approved` component at `lifecycle: planned` is the design-first normal
case, and a retired product with an approved description is normal too.

A **shared field name is not a shared enum.** `lifecycle` on a component is
`planned | in-development | released | sunset | retired`; on a product it is
`concept | incubating | active | maintenance | sunset | retired`. The schema is a
discriminated union on `kind`, so `lifecycle: incubating` on a component is
`E_FM_SCHEMA`. The `active`/`maintenance` split is deliberately absent from the
component set: it is an *investment* distinction, decided at the product line, and
copying it down would create a second ledger with no source of truth. A component
in a product on `maintenance` is still simply `released`.

`lifecycle` is coarse and global on purpose. Per-environment release state lives
in the environment edges and `topology.yaml`, so a component live in staging and
not production is `lifecycle: in-development` with `uses: /environment/staging` —
never a value like `released-in-staging`.

**A capability adds no fields, and that is a decision, not a placeholder.** Any
kind-specific field on one is `E_FM_UNKNOWN_FIELD` — `capability-type`,
`maturity`, `lifecycle`, `realized-by` alike. Resist inventing one: a strategy
classification goes in `tags` (no semantics attached), a score of how well the
doing is done is a `metric`, and additive-only evolution makes a speculative field
permanent. The substance of a capability is its name, its sentence and its edges.

For a **metric**, `target` and `window` are quoted strings and the unit lives
inside the literal — one scalar, one truth, and no `unit:` field to disagree with
it. Quoting is load-bearing for exactly one case, a `count` target of `1200`,
which YAML turns into an integer before validation sees it.

Unknown top-level fields are an error unless prefixed `x-`. Kind fields do not
leak: the frontmatter schema is a discriminated union on position, so
`actor-type` on a product is `E_FM_UNKNOWN_FIELD` like any other stray key.

### 6. Write prose worth reading

The body is the reason the catalog exists; the frontmatter is only its index. A
body that restates the frontmatter in sentences is a defect. Write what the
fields cannot carry:

- **solution** — the reading order, the boundary, the conventions every entity
  below inherits (units, identifiers, timestamps).
- **product** — what it owns and what it deliberately does not; why its
  components are split the way they are; which coupling to other products is
  intentional.
- **component** — the one responsibility, stated in a sentence; why each
  dependency exists; for a `library`, why it declares no environment; for an
  `external`, where the ownership boundary actually falls and at what fidelity
  the outside is described.
- **actor** — the boundary of the role, what it is *not*, and which other actor
  it is confused with. Never describe behaviour, only surfaces touched.
- **environment** — the guarantees (availability, residency, change window) and
  where placement and configuration live. Never a roster of what runs there —
  that is derived from components' `uses` edges.
- **requirement** — MUST carry `## Acceptance criteria` exactly once, level 2,
  that exact casing, followed by a bulleted list of at least one item. Add
  `## Rationale` for the failures that forced each criterion, and
  `## Out of scope` for the adjacent obligation this one is not.
- **adr** — MUST carry exactly these four level-2 headings, exact text and
  casing: `## Context`, `## Decision`, `## Consequences`,
  `## Alternatives considered`. Record the alternatives that were genuinely
  argued and why they lost; an ADR whose alternatives are strawmen is worse than
  no ADR.
- **capability** — the lead paragraph *is* the capability, in the business's
  words. Then `## Boundaries` (conventional): where this doing stops, and which
  neighbouring capability picks up. That paragraph is the whole review value — it
  is what stops the capability list from becoming a set of overlapping synonyms
  two quarters from now. `## Not this` names the capability it gets confused
  with. No heading is enforced, because the rest of a capability is a derived
  graph.
- **journey** — the prose says what the path is *for*. `## Outcome` (what the
  actor holds at the end), `## Preconditions`, `## Out of scope` are
  conventional. Nothing here restates the steps: they are in `journey.yaml` and
  the portal renders them as a ladder.
- **metric** — `## Definition` is the section that decides whether the metric is
  real: which events are counted, which are excluded, where the measurement is
  taken, what happens to the edge cases — the content that would otherwise live
  in a query nobody can read. `## Rationale` says why this number and not a
  neighbouring one. `## Known distortions` says how the number can be made to
  look good without the world getting better; every metric can be gamed, and its
  own page is the honest place to say how.

**The requirement and ADR heading rules are specified but not machine-checked by
anything.** `E_REQ_CRITERIA` and `E_ADR_SECTIONS` exist in the specification and
are emitted by no code, so the check passes with the headings missing or
mis-cased. Get them right by hand and verify by reading.

Prose links to other entities MUST use the full `srn://…` form —
`[checkout](srn://acme/product/shop/component/checkout)`. A bare relative path is
indistinguishable from a file link and resolves to nothing. Links create no
edges; they are navigation only.

### 7. Wire relations — forward edges only

`relations` carries **outgoing** edges. The seven types, and the judgement each
one encodes:

- `uses` — "I consume this contract." Toward an `environment` this **is** the
  deployment declaration ("I run here"); environments never keep a roster.
- `depends-on` — coarser and structural: "that component or product must exist
  and function." Both edges between the same pair is normal and means two
  different things.
- `exposes` — "this is my public surface." Only a `component` or `product` may
  author it.
- `implements` — toward a `requirement` only. This is what makes an obligation
  claimed rather than orphaned.
- `realizes` — from a `component` or `product` toward a `capability` only. "This
  is part of how the business does that thing." Not `implements` in different
  clothes: a requirement is an obligation that can be checked, a capability is a
  standing ability that is never "done", and a component often carries both.
  Realization is authored **on the realizer's side only** — a capability never
  points back, and a `uses` edge from a capability to a component is
  `W_CAP_REALIZATION_EDGE`, the inverse written by hand.
- `measures` — authored **only by a `metric`**, toward a capability, component,
  protocol or requirement. It is REQUIRED on a metric: no `measures` edge is
  `E_MET_NO_SUBJECT`, because a number with no subject is a figure, not an
  observation. Prefer exactly one subject; two things measured is usually two
  metrics with two definitions.
- `supersedes` — swap only. Same kind as the source, authored on the
  **successor**, never on the entity being replaced.

**Never author an inverse edge.** `used-by`, `implemented-by`, `realized-by`,
`measured-by`, `superseded-by`, `exposed-by` and `depended-on-by` are derived by
the portal from the forward edges. Writing one is `E_FM_SCHEMA`, not a
convenience.

Consequence worth internalising: **adding an entity edits no other file.** The
new entity points outward; everything pointing back is computed. Note also that
`primary-actors` on a product is a typed field, not a relation edge — no v1 edge
type accepts an actor target, and neither is a journey's `actor`.

A **capability is the one kind that inverts this**, and deliberately so. It
authors nothing, so a freshly created capability is `W_CAP_UNREALIZED` until some
product or component adds a `realizes` edge on its own side. That is not a
mistake to route around — it is the kind's whole point: a capability nothing
realizes is aspiration, not architecture, and the warning is the to-do list. Read
it against `status`: on a `draft` capability it is expected, on an `approved` one
it means the catalog carries an agreed description of something the business
cannot actually do. Losing every realizer later is **not** an evolution event and
never deprecates the capability — `status` describes the document, not the world.

Prefer solution-absolute references (`/product/shop/datamodel/money@1`) for
anything outside the current entity. Relative `..` chains are the standing trap:
one `..` pops **one segment**, and a bucket plus a name is **two**, so `..`
alone lands inside the bucket and addresses a sibling. Keep `..` for exactly
that case.

### 7a. For a journey only — write `journey.yaml`

The one artifact this skill owns, and it is REQUIRED
(`E_JRN_ARTIFACT_MISSING`): a journey's frontmatter says nothing about the path,
so a journey without it asserts nothing at all. Bare, fixed filename. Full format
in `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/journeys.md`; the five rules
that decide whether it is right:

- **The first line declares the dialect.** A role names a file, never a format,
  so `journey.yaml` says in its own bytes which grammar it is written in, under
  a top-level `$schema`:

  ```yaml
  $schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/journey-document
  name: first-purchase
  steps:
    - actor: /actor/customer
      touches: /product/shop
  ```

  No `@version` on that URL — it names the grammar, never a revision of the file,
  and a top-level `version:` is still `E_JRN_SCHEMA`. The key is framework-owned
  and admitted **by name** at the top level, so it is not an unknown key there;
  the loader records the dialect and deletes the key before the mini-spec parser
  is handed the document. Admission is top-level **only** — a step is not an
  artifact root, so a `$schema` inside a step is `E_JRN_SCHEMA` exactly like
  `channel:`. A file declaring nothing is read as the legacy dialect, the format
  `journeys.md` describes, and warned with `W_ARTIFACT_DIALECT` on the journey
  entity; it is never broken. Adding the line to a journey that already exists
  bumps that entity's `version` by exactly 1.
- **`name` equals the entity directory name** (`E_JRN_NAME`), and `steps` is a
  flat list of **2 to 12** entries (`E_JRN_STEP_COUNT` — both bounds are errors,
  because a legible derived diagram is an acceptance criterion of the kind, not
  a preference).
- **Every step carries `actor` and `touches`**, both SRNs, plus an optional
  `protocol` and a one-line `note`. Nothing else: an unknown key is
  `E_JRN_SCHEMA` unless `x-` prefixed. `actor` is repeated on every row on
  purpose — a hand-off must be impossible to overlook, and a field that defaults
  is a field that hides its exceptions.
- **No branching.** `alt`, `opt`, `loop`, `when`, `otherwise`, `branches`,
  `parallel` are `E_JRN_BRANCH`, and the code is the lesson: *a journey that
  branches is two journeys*. Write the second one and name the fork in a `note`.
- **Name a `protocol` on every product crossing.** Consecutive steps whose owning
  products differ and whose later step names none are
  `W_JRN_UNDOCUMENTED_INTEGRATION` — the check the kind exists for. Use the
  literal `protocol: none` when the actor genuinely carries the hop (they re-type
  a tracking number, they click a link in an email): an omission means "not
  written down yet", `none` means "there is nothing to write down", and the
  distinction is why the field has three states. Do **not** silence a real gap
  with `none` — the finding is the point, and the fix is a new protocol entity.

Do not mirror the artifact into `relations`: everything a step touches is already
named there and the portal derives the touch graph from it. Reserve `uses` on a
journey for something no step touches — the standing example is the environment
the path is described in.

### 8. Validate, and report the result

```bash
metaframework check            # npm i -g @bershadsky/metaframework
                               # or: npx @bershadsky/metaframework check
```

Run it from anywhere inside the catalog repository: it walks **up** for a
`solutions/` directory the way git walks up for `.git`, so there is no working
directory to get right and no requirement that the catalog live inside the
framework monorepo. `--dir <path>` or `CATALOG_DIR=<path>` override the search.

Zero **error** diagnostics is the pass condition — the command exits non-zero on
any error, so the same line is the CI gate. Output is one entry per diagnostic
(`severity  CODE  catalog-relative-path`, then the message) closing with a
summary of the form `<n> errors, <n> warnings — <n> entities across <n> solutions.` Report
pass/fail and every diagnostic with its code, file and fix. Invoke the
**`validate-catalog`** skill to read the output — it carries the code→cause→fix
table, the cascade rules, and what this check does not cover.

## Traps

- **A schema-invalid `index.md` makes the entity vanish**, not merely complain.
  The loader stops after `E_FM_SCHEMA` on the common contract and never registers
  the entity, so every reference to it becomes `E_SRN_DANGLING` and its children
  become `E_STRUCT_MISSING_INDEX`. One bad `summary` produces a wall of unrelated
  errors. Fix schema errors first, then re-run.
- **A wrong `kind:` produces three codes at once.** The kind schema is chosen by
  disk position, not by the declared value, so `kind: actor` in a `product/`
  bucket yields `E_FM_KIND_LOCATION` + `E_FM_SCHEMA` (missing `lifecycle`) +
  `E_FM_UNKNOWN_FIELD` (`actor-type`, `goals`). One mistake, three codes — do
  not chase them separately.
- **A missing `index.md` is silent.** A directory without one is indistinguishable
  from an asset directory, so a typo'd filename yields no diagnostic — the entity
  simply does not exist. If nothing shows up in the catalog, check the filename
  before anything else.
- **Adding a child does not bump the container's version** (rule C3) — but
  editing the container's prose to link the new child *is* a content change and
  does bump it. Decide deliberately which of the two is happening.
- `version: "1"` (string) and `version: 1.0` are both `E_FM_SCHEMA`. So is a
  multi-line `summary`, a `title` over 80 chars, and `priority: won't` — the
  enum value is `wont`, no apostrophe.
- A `library` component has nowhere to run and must not declare
  `uses: /environment/…`. A `draft` component has no business declaring
  production.
- **The catalog check validates `journey.yaml` — with one blind spot.** The
  mini-spec parsers for `journey.yaml`, `workflows/*.yaml` and `states.json`
  run inside the check itself, so `E_JRN_*` and `E_PROTO_*` findings fail the
  run like any loader code. What the check cannot see is a journey entity with
  **no** `journey.yaml` at all — only artifacts that exist are parsed — so
  after creating a journey, confirm the file exists. Opening the page
  (`metaframework` serves on 6363) shows the same findings, drawn.
- **`target: 1200` on a metric is `E_FM_SCHEMA`, and it looks right.** YAML turns
  it into an integer before validation sees it. Quote `target` and `window`
  always, and the rule needs no case analysis. `window: "1 month"` is
  `E_MET_WINDOW` — months are not a fixed duration; durations stop at days.
  `direction: higher` is `E_FM_SCHEMA`; the value spells out the comparison
  because on its own "higher" answers "higher than what?" with nothing.
- **A capability with a `capability-type` is `E_FM_UNKNOWN_FIELD`**, and so is a
  `maturity`, a `lifecycle`, or an authored `realized-by`. The kind adds no
  fields at all. This is the single most likely first-try mistake on it.
- Directories starting with `.` or `_` are skipped entirely by the loader.

## Reference files

- **`references/worked-examples.md`** — one complete `index.md` per kind, each
  annotated with the decision it demonstrates. Every one is verbatim from
  `solutions/acme/`, `capability`, `journey` and `metric` included, and
  repo-hygiene byte-compares each against the catalog. Read it when writing a
  kind for the first time.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`** — the distilled
  specification: `srn.md`, `structure.md`, `frontmatter.md`, `environments.md`,
  `journeys.md`, `evolution.md`, `schemas.md`, `protocols.md`.
