# Directory structure — layout, artifacts, placement

> Distilled from `framework/spec/structure.md` (version 12), the container rules
> in `framework/spec/kinds/solution.md`, and the "Entity directory shape" /
> "Sibling artifacts" / "Body template" sections of the other
> `framework/spec/kinds/*.md`. **When `framework/spec/` is present in the
> repository, it is authoritative and wins over this file.** This bundled copy
> exists because an installed plugin cannot see the repo spec.

Because SRN ≡ path (`srn.md`), most rules here are the same rules stated as
directories. Where the two disagree, `srn.md` is normative.

## Repository layout

**`solutions/` is the only directory any of this requires.** A repository that
holds nothing but a catalog is the normal case, and it checks like any other:
`metaframework check` walks up from the working directory until it finds a
`solutions/` directory containing at least one `<name>/index.md`, the way git
finds `.git`. (`--dir <path>` or `CATALOG_DIR` overrides the search.)

The framework's own repository puts three more directories around it:

| Path                | Contents                                                            |
|---------------------|---------------------------------------------------------------------|
| `framework/spec/`   | The specification, written in the framework's own format.           |
| `framework/portal/` | The Next.js portal — read-only presentation over `solutions/`.      |
| `solutions/`        | All described solutions. The only place solution entities may live. |
| `docs/`             | Repository meta-documents (decision record, contributor notes).     |

None of the three is a prerequisite for authoring or checking a catalog: the CLI
carries its own compiled portal, and `framework/spec/` outranks this bundle only
where it happens to be present.

The portal reads `solutions/` and `.git/` only.

## Buckets and entity directories alternate

```text
solutions/{solution}( /{kind}/{name} )*
```

- A **kind bucket** is a directory named exactly after one of the twelve reserved
  kinds. It is not an entity, has no `index.md`, and has no SRN.
- An **entity directory** is a directory inside a bucket. It holds `index.md`
  and — if its kind is a container — further kind buckets.

```bash
$ ls -d solutions/acme/*/                # a solution holds buckets only
actor  adr  capability  datamodel  environment  journey  product  protocol  requirement

$ ls -d solutions/acme/product/*/         # a bucket holds entities only
billing  fulfilment  growth  identity  shop

$ ls -d solutions/acme/product/shop/*/    # a product holds buckets only
adr  component  datamodel  metric  protocol  requirement
```

A bucket MUST NOT hold an `index.md` or loose files. A bucket MAY be absent when
the owner has no entities of that kind; empty buckets should not be committed.

## The entity rule

**A directory under `solutions/` is an entity if and only if it contains an
`index.md`.** There are no other markers. An entity directory holds:

- `index.md` — REQUIRED. Frontmatter plus prose. The prose carries **no
  level-1 heading**: `title` is already the page's h1, and a second one leaves
  the document with no outline (`E_STRUCT_BODY_H1`). Sections start at `##`.
  It also carries **no measured number** — see below.
- **Sibling artifacts** — kebab-case, **bare** filenames named by role, never
  prefixed with the entity name. `schema.json`, not `order.schema.json`.
- **Asset subdirectories** — named for their role (`workflows/`, `examples/`),
  therefore never one of the twelve kinds, and containing **no `index.md` at any
  depth** (`E_STRUCT_NESTED_ENTITY`).

## Inline icons in prose

**`:name:` renders as an icon when `name` is in the closed vocabulary; every
other colon pair is left exactly as written.** Catalog markdown admits no raw
HTML, and this is the one glyph escape hatch — chiefly for table cells.

```markdown
| `approved` | :check: |
| `draft`    | :x:     |
```

- **Unknown name → literal text.** There is no diagnostic; a typo shows up as
  `:chekc:` on the page, which is the review signal.
- **Narrow pattern.** Lowercase letters and digits, single hyphens, never
  starting with a digit — so `10:30` and other existing colon pairs cannot
  match.
- **Code is exempt.** A colon pair in a code span or fenced block is untouched,
  so the syntax can be documented in prose that uses it.

The vocabulary grows by appending and a name is never repurposed. Do not invent
names: if the one you want is absent, the answer is a spec change, not a
different spelling.

## Measured numbers do not go in prose

**A number you obtained by running a command MUST NOT be written as a digit in
an entity's prose.** Violation is `W_PROSE_MEASUREMENT`. The `adr/` bucket is
the single exception, and there the measurement MUST say when it was taken
(`W_ADR_MEASUREMENT`).

The test is whether you can write the command down: `wc -l`,
`git rev-list --count HEAD`, `ls`, a test runner's tally. If you can, the number
goes stale on the next commit and the document that carries it becomes wrong
without anyone touching it. If you cannot — an SLO, a target, a design constant,
a domain figure — it is a **decision**, it does not drift, and this rule does not
touch it. `99.9%`, `four characters`, `twelve kinds`: all fine.

| Do not write                                                     | Write instead                                       |
|------------------------------------------------------------------|-----------------------------------------------------|
| "`src/lib/history/git.ts`, 895 lines, the largest module here"   | "`src/lib/history/git.ts`, the largest module here" |
| "instrumenting 23,277 lines of someone else's product"           | "instrumenting a product we do not own, by hand"    |
| "**AC-2** The run reports 16 test files and 395 tests passing"   | "**AC-2** Every suite passes and the run exits zero"|
| "the catalog knows all 197 entity names"                         | "the catalog knows every entity name"               |

An **ordinal** claim (*largest*, *the only*, *more than any other*) is cheap to
keep true; a **cardinal** one is the reverse. Where the count itself is the
point and the count is over the catalog graph — entities beneath a container,
artifacts beneath it — the portal derives and renders it beside the prose, so
the sentence keeps the claim and the surface carries the number. Never
interpolate a placeholder into the sentence: this framework has exactly one
reference syntax, and a paragraph whose numbers are template calls reads to
`grep` as a paragraph with no numbers in it.

In an ADR, anchor the number to a **commit** rather than a date where you can —
"brass landed as `ec0f4be`: 148 files, 10,768 insertions" is verifiable forever,
while a working-tree measurement is only ever true for one afternoon. The anchor
scopes the whole section it appears in, so state it once per section, not once
per row. The frontmatter `date` does not count: it moves when
`decision-status` does.

## Where each kind may live

Every row is a grammar rule; a violation is `E_SRN_PLACEMENT` raised while the
path is parsed, not a later loader check.

| Kind          | Bucket may sit in                               | Example path                                                           |
|---------------|-------------------------------------------------|------------------------------------------------------------------------|
| `product`     | the solution, and nowhere else                  | `solutions/acme/product/shop/`                                         |
| `component`   | a product or a component                        | `solutions/acme/product/shop/component/checkout/component/payment/`    |
| `actor`       | the solution, and nowhere else                  | `solutions/acme/actor/customer/`                                       |
| `environment` | the solution, and nowhere else                  | `solutions/acme/environment/production/`                               |
| `capability`  | the solution, and nowhere else                  | `solutions/acme/capability/order-fulfilment/`                          |
| `journey`     | the solution, and nowhere else                  | `solutions/acme/journey/first-purchase/`                               |
| `datamodel`   | the solution, a product, or a component         | `solutions/acme/product/shop/component/checkout/datamodel/cart/`       |
| `adr`         | the solution, a product, or a component         | `solutions/acme/product/shop/adr/0001-event-sourcing/`                 |
| `requirement` | the solution, a product, or a component         | `solutions/acme/product/shop/component/checkout/requirement/idem-cap/` |
| `metric`      | the solution, a product, or a component         | `solutions/acme/product/shop/metric/checkout-conversion/`              |
| `assumption`  | the solution, a product, or a component         | `solutions/acme/product/shop/assumption/nightly-reconciliation/`       |
| `protocol`    | the nearest common ancestor of its participants | `solutions/acme/product/shop/protocol/order-placement/`                |

Datamodels, ADRs, requirements and metrics are **owner-scoped**: they live in the
bucket of the container *responsible* for them. Scope is responsibility, not
visibility — any entity in the solution may reference any of them. A **metric**
is scoped exactly as a requirement is, and for the same reason: a number is only
meaningful about *something*, so it sits with whatever is accountable for it,
from the solution down to the deepest component. What it *measures* is an edge,
not its placement — a component-owned metric may `measures` a solution-level
capability.

```text
solutions/acme/product/shop/metric/checkout-conversion/index.md      # product-owned
solutions/acme/product/fulfilment/metric/delivery-on-time-rate/index.md
                                                                     # …another product
solutions/acme/product/identity/metric/p99-authz-check/index.md      # a metric bucket may
                                                                     # also sit on the solution
                                                                     # or a component, at any depth
```

**Capabilities and journeys are solution-level** for kind-specific reasons worth
spelling out. A capability is something the business can do; the products and
components that make it real point *up* at it with a `realizes` edge, so putting
the capability inside one of them would invert the statement — and two products
realizing one capability would then be unwriteable. A journey crosses the
solution by definition, so an owner deep in the tree would be claiming a path
whose ends it cannot see.

```text
solutions/acme/capability/order-fulfilment/index.md            # legal
solutions/acme/journey/first-purchase/index.md                 # legal
solutions/acme/product/shop/capability/pricing/index.md        # ILLEGAL — E_SRN_PLACEMENT
solutions/acme/product/shop/journey/checkout-flow/index.md     # ILLEGAL — E_SRN_PLACEMENT
```

All three newest kinds are **leaves**: a capability is not a folder for the
metrics about it, and a journey is not a folder for the steps it lists — its
steps are an artifact, not entities.

```text
solutions/acme/capability/order-fulfilment/metric/lead-time/index.md
                                                    # ILLEGAL — E_SRN_PLACEMENT:
                                                    #   a capability owns nothing
```

### The protocol NCA rule

A protocol lives at the nearest common ancestor of its **component and product**
participants, computed over whole `{kind}/{name}` **pairs**, never raw segments.
Actors are excluded — they are solution-level, so counting them would collapse
every protocol to the root. Four fixture protocols, one per placement outcome
(the catalog ships more):

```text
checkout + inventory + payment                       → product/shop
  solutions/acme/product/shop/protocol/order-placement/

checkout + checkout/tax-engine                       → product/shop + component/checkout
  solutions/acme/product/shop/component/checkout/protocol/tax-quoting/

payment + billing/ledger + billing/reconciliation    → none (products diverge)
  solutions/acme/protocol/settlement/

support-agent (actor, excluded) + billing/ledger     → that one component
  solutions/acme/product/billing/component/ledger/protocol/refund-request/
```

A protocol below the NCA of its declared participants is `W_STRUCT_PROTOCOL_NCA`
(a warning — the participants list may legitimately lead the directory by a
commit or two during a swap).

## Artifacts each kind defines

| Kind          | Required siblings  | Optional siblings                                                                                             | Asset dirs   | Enforced body sections            |
|---------------|--------------------|---------------------------------------------------------------------------------------------------------------|--------------|-----------------------------------|
| `solution`    | —                  | any (attachments; portal previews, attaches no semantics)                                                     | —            | —                                 |
| `product`     | —                  | any (attachments)                                                                                             | —            | —                                 |
| `component`   | —                  | any (attachments)                                                                                             | —            | —                                 |
| `datamodel`   | `schema.json`      | —                                                                                                             | `examples/`  | —                                 |
| `protocol`    | —                  | `transport.yaml`, `states.json`, `openapi.yaml`, `arazzo.yaml`; others bound via `transport.yaml` `spec.file` | `workflows/` | —                                 |
| `actor`       | —                  | —                                                                                                             | —            | —                                 |
| `environment` | —                  | `topology.yaml`, `config.yaml`                                                                                | —            | —                                 |
| `adr`         | —                  | supporting material (linked, not interpreted)                                                                 | —            | four, see below                   |
| `requirement` | —                  | supporting material (linked, not interpreted)                                                                 | —            | `## Acceptance criteria`          |
| `capability`  | —                  | supporting material (linked, not interpreted)                                                                 | —            | —                                 |
| `journey`     | **`journey.yaml`** | extra `*.md` prose siblings                                                                                   | —            | —                                 |
| `metric`      | —                  | supporting material (linked, not interpreted)                                                                 | —            | —                                 |
| `assumption`  | —                  | supporting material (linked, not interpreted)                                                                 | —            | `## Basis`, `## If this is false` |

Rules that catch authors out:

- A datamodel without `schema.json` is `E_DM_SCHEMA_MISSING`. Every file in
  `examples/` MUST validate against that schema (`E_DM_EXAMPLE_INVALID`).
- **`journey.yaml` is the one REQUIRED artifact besides `schema.json`**
  (`E_JRN_ARTIFACT_MISSING`), and the filename is bare and fixed. A journey's
  frontmatter says nothing about the path, so a journey without its artifact
  asserts nothing at all and is indistinguishable from a paragraph of prose.
  There is no `journeys/` subdirectory and no second file: two paths are two
  entities. Format in `journeys.md`.
- **`capability` and `metric` define no siblings.** Each is `index.md`. A
  capability's interior is a sentence and everything structured about it is an
  edge held by the entity on the other end; a metric's structure is already four
  frontmatter scalars, so a `metric.yaml` would only restate them, a
  `values.csv` would put observations in a catalog that describes rather than
  samples the system, and a `query.sql` would bind the description to one
  collection tool and rot silently.
- Protocol sibling names are **fixed and bare**: `transport.yaml`,
  `states.json`, `openapi.yaml` and `arazzo.yaml` (both recognised, and neither
  has a field table anywhere in the framework — the fixed name is what makes
  them addressable as `.openapi` and `.arazzo`; `arazzo.json` is **not**
  recognised). An external spec in any *other* format is still bound via
  `transport.yaml` `spec.file`; a free-named file is
  never addressable. Anything else unrecognised is `W_PROTO_ARTIFACT_UNKNOWN`.
  `workflows/` is the only recognised asset subdirectory: one `*.yaml` per
  workflow, kebab-case, no nesting.
- All protocol artifacts are optional. A protocol with only `index.md` is legal
  (intent-level, under design); it simply derives no diagrams.
- **Artifacts carry no version of their own.** A top-level `version:` key in
  `transport.yaml`, `topology.yaml`, `config.yaml`, or a workflow file is a
  shape violation. The entity's frontmatter `version` covers the whole
  directory. The one framework-owned key those files *do* carry at the top level
  is the `$schema` dialect header below, and it is not a second version number:
  it names the grammar the file is written in and carries no `@N`.
- The `x-` escape hatch reaches into `transport.yaml`, `workflows/*.yaml`,
  `topology.yaml` and `config.yaml`: unknown keys at any level are rejected
  unless `x-` prefixed. `states.json` is exempt — it is an XState machine
  configuration and unknown keys there are `E_PROTO_STATES_SUBSET`.
- The **dialect header is admitted by name**, not through the `x-` hatch: the
  bullet above never applies to it, because the loader removes it before any
  kind's validator sees the document. `x-` stays the hatch for *authors'* keys;
  `$schema` is one key, spelled one way, at the artifact root and nowhere else,
  and it belongs to the framework.
- An ADR body MUST carry exactly these four level-2 headings, exact text and
  casing (`E_ADR_SECTIONS`); order is not enforced and extra sections are fine:

  ```markdown
  ## Context
  ## Decision
  ## Consequences
  ## Alternatives considered
  ```

- A requirement body MUST carry `## Acceptance criteria` exactly once, at level
  2, with this casing (`E_REQ_CRITERIA`). `## Rationale` and `## Out of scope`
  are conventional, not enforced.

### Artifact roles — the addressable files

A dot suffix on an SRN's final segment addresses one file of the entity
(`srn.md` for the syntax and the fence). The role vocabulary is a **closed,
per-kind table with fixed filenames** — a spec constant, like the reserved
kinds: SRN→path conversion needs the spec, never a catalog read.

| Kind          | Role               | File                    |
|---------------|--------------------|-------------------------|
| `datamodel`   | `schema`           | `schema.json`           |
| `datamodel`   | `examples.<name>`  | `examples/<name>.json`  |
| `protocol`    | `transport`        | `transport.yaml`        |
| `protocol`    | `states`           | `states.json`           |
| `protocol`    | `openapi`          | `openapi.yaml`          |
| `protocol`    | `workflows.<name>` | `workflows/<name>.yaml` |
| `protocol`    | `arazzo`           | `arazzo.yaml`           |
| `journey`     | `journey`          | `journey.yaml`          |
| `environment` | `topology`         | `topology.yaml`         |
| `environment` | `config`           | `config.yaml`           |

Every other kind has **no roles at all**. Fixed roles are depth 1;
`workflows.<name>` and `examples.<name>` are the only depth-2 forms. Anything
outside the table is `E_SRN_ARTIFACT` (static — no catalog read); a legal role
whose file is absent is `E_SRN_DANGLING` (`transport.yaml` is optional on a
protocol).

### Artifact dialects — the grammar inside the file

A **role** is an address: which file, under which name. It is a spec constant,
answered by the table above with no disk read. A **dialect** is the grammar of
the bytes behind that address, and only the file can answer it — `transport.yaml`
holds either the mini-spec `protocols.md` defines **or** an AsyncAPI 3.x
document, and both are live today. One role, one filename, one SRN, two
grammars.

Keeping the two apart is what artifact addressing bought. `.transport` is *the
transport role of this protocol*, never *the transport mini-spec*: had the role
named the format, standardizing that format would have moved the address, and
every referrer would have been rewritten to keep saying the same thing about the
same file. Inferring the dialect from which keys happen to be present is not the
alternative — that is a second grammar nobody wrote down, and two dialects
sharing a prefix of keys are indistinguishable under it right up until they are
not.

**Every addressable artifact declares its own dialect, in its own bytes**, under
a key fixed per role — one key for eight of the ten roles, two for `transport`,
which recognises two dialects, and none at all for `examples.<name>`, which is
an instance of its sibling schema and carries that schema's dialect rather than
declaring one of its own. Where the format discriminates itself
the native key does the work and the framework invents nothing; where it does
not, the file carries `$schema` holding the canonical URL of the meta-schema that
defines the dialect. Those meta-schemas are ordinary datamodel entities of the
framework's own `specification` product, so the URLs are ordinary canonical
schema URLs sharing one prefix:

```text
{meta} = https://schemas.metaframework.dev/metaframework/product/specification/datamodel
```

| Kind          | Role               | File                    | Dialect       | Key        | Value                            |
|---------------|--------------------|-------------------------|---------------|------------|----------------------------------|
| `datamodel`   | `schema`           | `schema.json`           | JSON Schema   | `$schema`  | the 2020-12 dialect URI (native) |
| `datamodel`   | `examples.<name>`  | `examples/<name>.json`  | its schema's  | none       | — never carries one              |
| `protocol`    | `transport`        | `transport.yaml`        | the mini-spec | `$schema`  | `{meta}/transport-document`      |
| `protocol`    | `transport`        | `transport.yaml`        | AsyncAPI      | `asyncapi` | `3.x` (native)                   |
| `protocol`    | `states`           | `states.json`           | XState subset | `$schema`  | `{meta}/state-machine-document`  |
| `protocol`    | `openapi`          | `openapi.yaml`          | OpenAPI       | `openapi`  | `3.1.x` (native)                 |
| `protocol`    | `workflows.<name>` | `workflows/<name>.yaml` | the mini-spec | `$schema`  | `{meta}/workflow-document`       |
| `protocol`    | `arazzo`           | `arazzo.yaml`           | Arazzo        | `arazzo`   | `1.1.x` (native)                 |
| `journey`     | `journey`          | `journey.yaml`          | the mini-spec | `$schema`  | `{meta}/journey-document`        |
| `environment` | `topology`         | `topology.yaml`         | the mini-spec | `$schema`  | `{meta}/topology-document`       |
| `environment` | `config`           | `config.yaml`           | the mini-spec | `$schema`  | `{meta}/config-document`         |

The rows are the role table's own, in its order, and that is a rule: this table
is **total** over that one, `none` included. A role given a filename without a
dialect ruling would be a role whose dialect nobody decided, which reads exactly
like a role that carries none — so the two tables grow together or neither does.

Total, but not one-to-one: **ten roles, eleven rows**, because the `transport`
role carries two. Where a role has several they are ordered **most canonical
first**, and that order is read twice — it is the dialect a headerless file is
told to add, and the dialect a file declaring two of the keys is read under. The
mini-spec is first for `transport.yaml` because every wire can use it.

**Which of the two a `transport.yaml` may use is decided by its wire, not by
preference**, and it is not a migration window with an end: `kafka`, `websocket`
and `amqp` may be written either way, while `http` (OpenAPI owns that wire, under
its own role), `grpc` (AsyncAPI publishes no binding for it) and `in-process` (a
Server Object REQUIRES a `host`) have the mini-spec only. The per-wire table and
the AsyncAPI form itself are in `protocols.md`; nothing is deprecated here, and a
file correctly declaring either dialect never raises `W_ARTIFACT_DIALECT`.

In YAML the header is the first line of the file; in JSON it is the first member
of the root object. Nothing else about the file changes:

```yaml
# solutions/acme/product/shop/protocol/order-placement/transport.yaml — mini-spec
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: http
summary: JSON over HTTPS, served by checkout at the storefront edge.
encoding: json
```

The same role in another protocol, written in the other dialect. Settlement's
address did not move when its grammar did — it is still
`srn://acme/protocol/settlement.transport` — and the format names itself, so the
framework adds nothing beside it:

```yaml
# solutions/acme/protocol/settlement/transport.yaml — AsyncAPI
asyncapi: 3.1.0
x-srn: srn://acme/protocol/settlement
info:
  title: Settlement
  version: unversioned
```

```json
{
  "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document",
  "id": "order-placement",
  "initial": "submitted"
}
```

Where a file opens on a comment that documents the key beneath it, put the header
first and leave a blank line, so the comment keeps annotating what it was written
for:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/topology-document

# No `regions`: a developer machine is a single unnamed place.
hosts:
  - component: /product/portal
    replicas: { min: 1, max: 1 }
```

Rules an author has to get right:

- **The URL carries no `@version`**, for the reason no canonical schema URL
  does: it names a *dialect*, not a revision of one. An additive dialect change
  is a superset extension of the same meta-schema entity — same name, same URL,
  same string in every file that already carries it; a non-additive one is a
  swap to a new meta-schema entity with a new URL (`evolution.md`).
- **Recognition is a string comparison**, never a fetch. The host is the
  project's own, so a framework meta-schema URL is one it can serve — but
  nothing here depends on that: a reader that cannot reach
  `schemas.metaframework.dev` loses nothing, and a catalog's *own* schema URLs
  on that host are served by that catalog's portal, never by this one.
- **Artifact root only.** `$schema` on a workflow step, a topology host entry or
  a journey step is an ordinary unknown key — `E_PROTO_WF_SCHEMA`,
  `E_ENV_TOPOLOGY_SCHEMA`, `E_JRN_SCHEMA`, exactly as `channel:` or `tier:`
  would be there.
- **Read once, then removed.** The loader records the dialect and deletes the
  framework-owned `$schema` from the parsed document before the kind's validator
  is handed anything — which is why `states.json` still rejects every unknown key
  under `E_PROTO_STATES_SUBSET` and why no strict shape had to be loosened.
  Deletion happens whether or not the value was recognised: leaving an
  unrecognised value in place would turn this warning into an unknown-key
  *error* downstream, the one outcome "never broken" forbids. A **native**
  discriminator (`openapi:`, `asyncapi:`, a `schema.json`'s `$schema`) is never
  stripped — it belongs to its own format, and a document that arrived without
  its own version key would be the poorer document. The bytes on disk, and
  everything served from them, are untouched in every case.
- **The key is still admitted by name at the root**, by each role's published
  meta-schema and by the parser behind it, because a meta-schema whose
  `additionalProperties: false` forbade the very key pointing at it could not
  validate the file it describes. It is admitted as an optional, *unpinned*
  string, never a `const`: a value naming some other dialect is a warning, and
  pinning it would restate that ruling as a hard rejection in the one place a
  severity cannot be relaxed. So the file validates as authored, and the
  validators still see it stripped.
- **`examples/<name>.json` carries no discriminator, ever** — a rule, not an
  omission. An example is an *instance* of its sibling `schema.json` and so has
  that schema's dialect, not one of its own; and since `additionalProperties:
  false` is ordinary in a catalog schema, a header would make the example fail
  the very document it exemplifies (`E_DM_EXAMPLE_INVALID`).
- **`schema.json`'s `$schema` is not the framework's to spend.** It already
  means the JSON Schema dialect and MUST stay exactly
  `https://json-schema.org/draft/2020-12/schema` (`E_DM_DIALECT`, `schemas.md`).
  Pointing it at a framework URL would break every stock validator.
- **`openapi:` reads as the whole `3.1` line.** OpenAPI versions the *document*,
  so `3.1.1` is the same dialect with errata applied; recognising only one exact
  string would complain about a correct file whose author tracked a patch
  release. Only the advice below names one pasteable value. Reading that key is
  not interpreting the document: `openapi.yaml` stays bytes-only to the
  framework, which looks at one root key and nothing else.
- **`asyncapi:` reads wider still — the whole `3.x` line** — because AsyncAPI's
  own version-string section promises a minor increment stays usable by tooling
  built for a lower minor and that the patch is not to be considered. Paste
  `3.1.0` when writing a new file. Like `openapi.yaml`, nothing in the portal
  reads this document yet: the dialect is *detected* and recorded, and the rules
  `protocols.md` states for it are specified ahead of any reader. Write the file
  as if they were enforced, because nothing will tell you when they are not.
- **`arazzo:` reads as the whole `1.1` line**, and only that line. Arazzo's
  Versions section is OpenAPI's verbatim — `major`.`minor` designates the feature
  set, the patch is errata tooling should ignore — so `1.1.1` is the same dialect.
  1.0 is legal, shipped Arazzo and is *not* in the band: its `sourceDescriptions`
  cannot name an AsyncAPI document, which is where most groundable protocols in a
  catalog like this one live. A 1.0 file is read, warned, and never broken. Paste
  `arazzo: 1.1.0`. Unlike `openapi.yaml`, the portal does read further than that
  key — it draws a step graph of each workflow — but nothing checks the
  document's *shape*: there is no field table for an Arazzo Description, so an
  unknown key is drawn less rather than reported. The one diagnostic the file can
  raise is `W_PROTO_ARAZZO_UNGROUNDED`, and it is about where the document's
  references land, not about Arazzo (`protocols.md`).

**No header, or one unknown for the role, is the legacy dialect** — the format
this bundle describes today. Recognition is against **every** row the role has,
so `asyncapi: 3.1.0` in a `transport.yaml` is a declared dialect and raises
nothing; a second dialect is not an unrecognised one. The file is still parsed,
still rendered, still checked; nothing here can make a catalog that loads stop
loading. The diagnostic is `W_ARTIFACT_DIALECT`, a **warning**, raised on the
entity that *owns* the file (an artifact is not an entity and has no diagnostics
of its own), in two message forms:

```text
transport.yaml declares no dialect — read as the legacy dialect; add
  `$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document`

transport.yaml declares dialect "https://example.com/foo", which is not a
  known dialect of the transport role — read as the legacy dialect
```

On a native-discriminator role the absent form names that role's own key, since
that is what an author has to paste:

```text
openapi.yaml declares no dialect — read as the legacy dialect; add `openapi: 3.1.0`
```

Two rows are silent rather than warned: `examples/<name>.json`, which has no
dialect to declare, and `schema.json`, whose missing header is already the error
`E_DM_DIALECT` and needs no second complaint about one fact.

**Adding a header bumps the owning entity's `version` by exactly 1** — it is a
content change to a sibling artifact like any other — and the bump is per
**entity**, not per file. A protocol gaining headers in `transport.yaml`,
`states.json` and two workflow files in one commit bumps once. Rewriting a
`transport.yaml` from one of its dialects into the other obeys the same
arithmetic — one ordinary content change, one bump, no extra credit for being a
large diff. Details, and what a dialect migration does to the additive-only rule,
are in `evolution.md`.

**Filenames stay.** A dialect change touches no row of the role table: a dialect
is a property of a file's contents, and a new grammar inside an existing filename
is not an amendment to the map. The converse is the ruling that matters — a lane
that wants a *new filename* must come back for a role-table amendment, under the
additive-growth rule that governs every other row.

```text
transport.yaml grows an AsyncAPI dialect   # no row moves, no address moves
arazzo.yaml beside workflows/              # a new role — a row was appended
```

The second line already happened. `arazzo.yaml` stood in this block as the
hypothetical, came back for the amendment, and is a row of the role table above
rather than a second dialect of `workflows/<name>.yaml` — which is the outcome
the rule exists to force. The next new filename walks the same path.

A new row mints addresses and obliges every SRN parser; a new dialect obliges
only the reader of that one file. Collapsing the two would let a payload change
rewrite the identity grammar as a side effect, which is exactly what separating
role from dialect exists to prevent.

## Naming

- Every path segment under `solutions/` — solution names, buckets, entity names
  alike — MUST match `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 chars. `Shop`,
  `order_placement`, `-cart`, `café` are all `E_SRN_SYNTAX`.
- The twelve reserved kinds — `product`, `component`, `datamodel`, `protocol`,
  `actor`, `environment`, `adr`, `requirement`, `capability`, `journey`,
  `metric` — MUST NOT be used as a solution or entity name (`E_SRN_RESERVED`).
  They appear only as bucket directories, at odd positions.
- `index.md` is reserved for the entity document.
- Sibling filenames are bare, kebab-case, with a standard extension. A file the
  framework only *links* rather than interprets — `pricing.proto`,
  `schema.graphql` under a protocol's `spec.file` — follows the external tool's
  convention instead, and is not addressable, because only fixed-name files are.
  `openapi.yaml` and `arazzo.yaml` are **not** in that class, though
  `openapi.yaml` was once its leading example: both are now fixed bare names
  with their own rows in the role table, both are addressable, and both are
  parsed as YAML into `artifact.data` like every other artifact. What the
  framework declines to do with them is state a *grammar* for them — the only
  rule either can break is the `arazzo.yaml` grounding rule, which asks where
  its references land.
- Frontmatter `name` MUST equal the directory name; frontmatter `kind` MUST
  equal the bucket.

## Container rules (solution, product, component alike)

- **C1 Containment is derived, never authored.** No `children`, `contains`, or
  `parent` field exists — the filesystem is the containment graph.
- **C2 Only containers may hold child entities.** The nine leaf kinds —
  datamodel, protocol, actor, environment, adr, requirement, capability,
  journey, metric — hold artifacts and asset dirs, never entities.
- **C3 A child's version is not the container's version.** Adding, bumping, or
  deprecating a child does not bump the container.
- **C4 Containers define no mandatory siblings.** Their substance is children
  plus prose.
- **C5 Single ownership, single path.** Reuse elsewhere in the solution is by
  SRN reference only — never a copy, never a symlink.
- **C6 Kind fields extend, never replace** the common frontmatter contract.
- **C7 `status` is the document's, not a rollup.** A container may be `approved`
  while its children are `draft`; the portal derives the rollup.

## Annotated tree (abridged from the real fixture)

```text
solutions/
└── acme/                                   # solution                 srn://acme
    ├── actor/                              # kind bucket — never an entity
    │   └── customer/                       # srn://acme/actor/customer
    │       └── index.md
    ├── adr/
    │   └── 0001-single-currency/
    │       └── index.md
    ├── datamodel/
    │   └── money/                          # srn://acme/datamodel/money
    │       ├── examples/                   # asset dir — no index.md at any depth
    │       │   └── forty-nine-ninety.json
    │       ├── index.md
    │       └── schema.json
    ├── environment/
    │   └── production/
    │       ├── config.yaml
    │       ├── index.md
    │       └── topology.yaml
    ├── product/
    │   └── shop/                           # srn://acme/product/shop
    │       ├── adr/
    │       │   └── 0001-event-sourcing/
    │       │       └── index.md
    │       ├── component/
    │       │   ├── checkout/               # srn://…/component/checkout
    │       │   │   ├── component/
    │       │   │   │   └── payment/        # sub-component — a component pair again
    │       │   │   │       ├── datamodel/
    │       │   │   │       │   └── order/
    │       │   │   │       │       ├── examples/
    │       │   │   │       │       ├── index.md
    │       │   │   │       │       └── schema.json
    │       │   │   │       └── index.md
    │       │   │   ├── datamodel/
    │       │   │   │   └── cart/
    │       │   │   ├── protocol/
    │       │   │   │   └── tax-quoting/
    │       │   │   ├── requirement/
    │       │   │   │   └── idem-cap/
    │       │   │   └── index.md
    │       │   └── inventory/
    │       │       └── index.md
    │       ├── datamodel/
    │       │   └── order-line/
    │       ├── protocol/                   # NCA of the participants = the shop product
    │       │   └── order-placement/
    │       │       ├── workflows/          # asset dir — no index.md
    │       │       │   ├── cancel-order.yaml
    │       │       │   └── place-order.yaml
    │       │       ├── index.md
    │       │       ├── states.json
    │       │       └── transport.yaml
    │       ├── requirement/
    │       └── index.md
    ├── protocol/                           # NCA of the participants = the solution
    │   └── settlement/
    ├── requirement/
    │   └── gdpr-erasure/
    └── index.md                            # the solution's entity document
```

The tree above is abridged and predates the three newest kinds. Where they sit in
the same fixture:

```text
solutions/acme/
├── capability/                             # solution-level, alphabetically first
│   ├── identity-verification/
│   ├── order-fulfilment/
│   │   └── index.md                        # index.md only — a capability is a sentence
│   └── promotion-pricing/
├── journey/                                # solution-level
│   ├── coupon-redemption/
│   └── first-purchase/
│       ├── index.md
│       └── journey.yaml                    # REQUIRED — the ordered path
└── product/
    ├── fulfilment/metric/                  # owner-scoped, so the bucket hangs
    │   └── delivery-on-time-rate/          #   under whoever answers for the number
    │       └── index.md
    └── shop/metric/
        └── checkout-conversion/
            └── index.md
```

A `metric/` bucket is equally legal directly under the solution or under a
component at any depth; the fixture happens to file all three of its metrics on
products.

## Structure error classes

| Code                     | Meaning                                                                                    |
|--------------------------|--------------------------------------------------------------------------------------------|
| `E_STRUCT_MISSING_INDEX` | A directory that owns an entity has no `index.md`, so the owner's SRN resolves to nothing. |
| `E_STRUCT_NESTED_ENTITY` | An `index.md` sits directly below an entity that is not a container.                       |
| `E_STRUCT_DUPLICATE_SRN` | Two directories resolve to the same SRN (symlink, case-insensitive filesystem).            |
| `E_STRUCT_BODY_H1`       | An `index.md` body carries a level-1 heading; `title` is already the page's h1.            |
| `W_STRUCT_PROTOCOL_NCA`  | Protocol not at the NCA of its component/product participants.                             |
| `W_PROSE_MEASUREMENT`    | A measured number typed into the prose of a current-state entity.                          |
| `E_JRN_ARTIFACT_MISSING` | A journey entity directory with no `journey.yaml` (`journeys.md`).                         |
| `W_JRN_ARTIFACT_UNKNOWN` | Unrecognised file in a journey entity directory.                                           |

`W_ARTIFACT_DIALECT` is this document's too, but it is defined beside the table
it belongs to ("Artifact dialects", above) rather than here: it is about the
bytes of a file rather than about where anything sits, and it is cross-kind by
construction — the same warning on a protocol, a journey and an environment.

`W_PROSE_MEASUREMENT` is cross-kind by **subtraction**: every kind except `adr`,
where the same subject is `W_ADR_MEASUREMENT` and the question is whether the
number says when it was taken ("Measured numbers do not go in prose", above). No
entity raises both.

`E_STRUCT_KIND_PLACEMENT` is **retired** — every placement violation is now
`E_SRN_PLACEMENT` (`srn.md`, P1–P4). A directory without `index.md` and without
entities below it is a silent no-op, not a diagnostic: it is indistinguishable
from an asset directory.
