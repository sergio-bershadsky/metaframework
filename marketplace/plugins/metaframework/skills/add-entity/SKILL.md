---
name: add-entity
description: This skill should be used when the user asks to "add a product", "add a component", "add a service to the catalog", "create an actor", "add an environment", "write an ADR", "record a decision", "add a requirement", "add an NFR", "start a solution root", "add an entity to the catalog", "where does this component belong", or otherwise names one of the mechanical metaframework kinds to create — product, component, actor, environment, adr, requirement, or the solution root. It carries the placement decision, the per-kind frontmatter contract, forward-only relation wiring, the prose each kind owes a reader, and the catalog check that closes the loop. For `datamodel` use `model-data` and for `protocol` use `protocol-design` — those two carry artifact contracts this skill does not; for designing a whole tree at once use `solution-design`, and for changing an entity that already exists use `evolve-entity`.
---

# Add an entity to a metaframework catalog

One procedure, seven kinds. `product`, `component`, `actor`, `environment`,
`adr`, `requirement` and the `solution` root differ only in which frontmatter
fields they require and what their prose must say — the ordering of decisions,
the placement grammar, the relation rules and the validation step are identical.
`datamodel` and `protocol` are excluded because they own artifact contracts
(`schema.json`, `transport.yaml`, `states.json`, `workflows/`) with their own
skills.

## Where the rules live

**If `framework/spec/` exists in the repository, read it — it is authoritative.**
`framework/spec/kinds/<kind>.md` for the kind at hand, plus `srn.md`,
`structure.md` and `frontmatter.md`. Otherwise read the distilled reference
bundled with this plugin, which is the only copy an installed plugin can see:

- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/srn.md` — identity, placement, relative-reference traps
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/structure.md` — layout, artifacts, enforced body sections
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/frontmatter.md` — common contract, per-kind fields, edge legality
- `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/evolution.md` — versioning, the swap

Do not restate those rules back at the user. This skill is the procedure; those
are the rules.

## Procedure

### 1. Confirm a new entity is the right answer

Not every fact deserves a directory. Before creating anything, check whether the
information belongs in an existing entity's prose or as an added relation edge.
Common false positives: a "component" that is a layer rather than a capability;
a requirement with no acceptance criteria (that is prose, or an ADR); an ADR for
a decision nobody argued about (that is a paragraph in the owning entity).

If the answer is "this belongs in an existing entity", say so and stop.

### 2. Pick the kind

| The thing is…                                                     | Kind          |
|-------------------------------------------------------------------|---------------|
| A named business capability a team owns and a customer could name | `product`     |
| A deployable, embeddable or externally-operated unit of software  | `component`   |
| A person, system or credential *outside* the described software   | `actor`       |
| A target things are deployed to                                   | `environment` |
| An obligation with checkable acceptance criteria                  | `requirement` |
| A decision that was taken, on a date, by named people             | `adr`         |

The two that get confused: a **requirement** states an obligation that holds
from now on and can be tested; an **ADR** records that a choice was made, why,
and what was rejected. A rule with no test is not a requirement. A decision with
no alternatives considered is not an ADR.

An **actor** is never a component. Anything the organisation operates is a
component even if it behaves autonomously; anything it does not operate but
*talks to* is an `external` component; a non-human identity that *initiates*
work — a release bot, a service account — is an actor.

### 3. Place it — before writing a single line

Placement is grammar. A misplaced directory has **no SRN at all**, so the loader
rejects it while reading the tree, before any frontmatter is parsed.

| Kind          | May live in                             |
|---------------|-----------------------------------------|
| `product`     | the solution, and nowhere else          |
| `component`   | a product or a component                |
| `actor`       | the solution, and nowhere else          |
| `environment` | the solution, and nowhere else          |
| `adr`         | the solution, a product, or a component |
| `requirement` | the solution, a product, or a component |

For `adr` and `requirement`, **scope is responsibility, not visibility.** Put it
in the bucket of the container answerable for it. Any entity in the solution may
reference any of them regardless of where they sit, so "who else needs to read
it" is never the placement argument. A solution-level requirement is a claim
that no single component can discharge it — `gdpr-erasure` in the acme fixture
is solution-level for exactly that reason.

**State the resulting SRN and the resulting disk path out loud before creating
anything**, and get agreement if the placement is not obvious:

```text
srn://acme/product/shop/component/checkout/requirement/idem-cap
solutions/acme/product/shop/component/checkout/requirement/idem-cap/index.md
```

Placement is effectively permanent: entities are **never moved or renamed**,
because the SRN is the path and the git-backed version history does not follow a
move. A relocation later is a full swap (`evolution.md`). Spend the minute now.

### 4. Name it

Kebab-case, `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 chars. Never one of the eight
reserved kinds — `product`, `component`, `datamodel`, `protocol`, `actor`,
`environment`, `adr`, `requirement` are bucket names only.

Name the thing for what it is, not for where it sits or what it is made of:
`checkout`, not `shop-checkout-service`. ADRs take an ordinal prefix, unique
**per bucket** and never reused: `0001-single-currency`, `0002-change-data-capture`.

### 5. Write the frontmatter

Every entity carries the common contract — `name` (MUST equal the directory
name), `kind` (MUST equal the bucket), `version` (integer), `title`, `summary`
(one line, ≤ 200 chars), `status` — plus its own required fields:

| Kind          | Required kind fields                                                    | Optional            | Sensible values for a new entity         |
|---------------|-------------------------------------------------------------------------|---------------------|------------------------------------------|
| `solution`    | `vision`                                                                | `scope`, `contacts` | `vision` in the user's own words         |
| `product`     | `lifecycle`                                                             | `primary-actors`    | `lifecycle: concept` or `incubating`     |
| `component`   | `component-type`                                                        | —                   | pick from the closed enum, do not invent |
| `actor`       | `actor-type`, `goals` (≥ 1)                                             | —                   | goals verb-first, from the actor's side  |
| `environment` | `environment-type`                                                      | —                   | —                                        |
| `requirement` | `requirement-type`, `priority`                                          | —                   | `priority` is one of must/should/could/wont |
| `adr`         | `decision-status`, `date`; `deciders` once accepted/rejected/superseded | —                   | `decision-status: proposed` while arguing |

New entities start at `version: 1`, `status: draft`. Enum values are closed —
anything outside them is `E_FM_SCHEMA`. See `_shared/references/frontmatter.md`
for the value sets and the shapes of `vision`, `scope`, `contacts`,
`primary-actors`, `goals`.

Three fields answer three different questions and never substitute for each
other: `status` is the *document's* lifecycle, `lifecycle` is the product's
real-world stage, `decision-status` is the decision's. A retired product with an
approved description is normal.

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

**The requirement and ADR heading rules are specified but not machine-checked by
anything.** `E_REQ_CRITERIA` and `E_ADR_SECTIONS` exist in the specification and
are emitted by no code, so the check passes with the headings missing or
mis-cased. Get them right by hand and verify by reading.

Prose links to other entities MUST use the full `srn://…` form —
`[checkout](srn://acme/product/shop/component/checkout)`. A bare relative path is
indistinguishable from a file link and resolves to nothing. Links create no
edges; they are navigation only.

### 7. Wire relations — forward edges only

`relations` carries **outgoing** edges. The five types, and the judgement each
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
- `supersedes` — swap only. Same kind as the source, authored on the
  **successor**, never on the entity being replaced.

**Never author an inverse edge.** `used-by`, `implemented-by`, `superseded-by`,
`exposed-by` and `depended-on-by` are derived by the portal from the forward
edges. Writing one is `E_FM_SCHEMA`, not a convenience.

Consequence worth internalising: **adding an entity edits no other file.** The
new entity points outward; everything pointing back is computed. Note also that
`primary-actors` on a product is a typed field, not a relation edge — no v1 edge
type accepts an actor target.

Prefer solution-absolute references (`/product/shop/datamodel/money@1`) for
anything outside the current entity. Relative `..` chains are the standing trap:
one `..` pops **one segment**, and a bucket plus a name is **two**, so `..`
alone lands inside the bucket and addresses a sibling. Keep `..` for exactly
that case.

### 8. Validate, and report the result

```bash
cd framework/portal && npx vitest run src/lib/catalog
```

Zero **error** diagnostics is the pass condition. Report pass/fail and every
diagnostic with its code, file and fix. Invoke the **`validate-catalog`** skill
to read the output — it carries the code→cause→fix table, the cascade rules, and
what this check does not cover.

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
- Directories starting with `.` or `_` are skipped entirely by the loader.

## Reference files

- **`references/worked-examples.md`** — one complete, verbatim `index.md` for
  each of the seven kinds, taken from `solutions/acme/`, each annotated with the
  decision it demonstrates. Read it when writing a kind for the first time.
- **`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/`** — the distilled
  specification: `srn.md`, `structure.md`, `frontmatter.md`, `evolution.md`,
  `schemas.md`.
