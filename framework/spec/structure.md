---
kind: spec
name: structure
version: 7
status: review
title: Directory structure
summary: The full directory layout contract — monorepo layout, the eleven kind buckets at every level, the entity-directory convention, placement, naming rules, the artifact role table, and the dialects each role's file may declare.
---

# Directory structure

This document is the layout contract for the repository. The portal loader,
every author, and every AI agent MUST be able to rely on it exactly as written.

Because SRN ≡ path ([srn.md](srn.md)), almost every rule here is the same rule
stated as directories. Where the two documents overlap, srn.md is normative and
this one is the projection onto the filesystem.

## Monorepo layout

The repository root has exactly these top-level areas:

| Path                | Contents                                                            |
|---------------------|---------------------------------------------------------------------|
| `framework/spec/`   | This specification, written in the framework's own format.          |
| `framework/portal/` | The Next.js portal (read-only presentation over `solutions/`).      |
| `solutions/`        | All described solutions. The only place solution entities may live. |
| `docs/`             | Repository meta-documents (decision record, contributor notes).     |

The portal reads `solutions/` and `.git/` only. Nothing under `framework/` or
`docs/` is part of any solution catalog.

## Kind buckets at every level

Below a solution directory, the tree strictly alternates **kind bucket** and
**entity directory**:

```text
solutions/{solution}( /{kind}/{name} )*
```

- A **kind bucket** is a directory named exactly after one of the eleven
  reserved kinds. It is not an entity, has no `index.md`, and has no SRN.
- An **entity directory** is a directory inside a bucket. It holds `index.md`,
  and — if its kind is a container — further kind buckets.

The consequence is that a directory listing anywhere in the catalog answers
"what is in here?" without knowing any vocabulary beyond the eleven kinds:

```bash
$ ls -d solutions/acme/*/                       # a solution holds buckets only
actor  adr  datamodel  environment  product  protocol  requirement

$ ls -d solutions/acme/product/*/               # a bucket holds entities only
billing  shop

$ ls -d solutions/acme/product/shop/*/          # a product holds buckets only
adr  component  datamodel  protocol  requirement
```

Nesting rules, all of them enforced by the SRN grammar (`E_SRN_PLACEMENT`, see
[srn.md](srn.md#placement-is-grammar)) rather than by a filesystem pass:

- A **solution** is the top-level unit and a sealed universe: no reference of
  any kind may cross from one solution into another ([srn.md](srn.md), rule V6).
- A **product** lives in the solution's `product/` bucket and nowhere else.
- A **component** lives in a `component/` bucket inside a product or inside
  another component; components nest arbitrarily deep. A sub-component is not a
  distinct thing — it is a component whose owner happens to be a component.
- Components are product-owned. Reuse of a component elsewhere in the same
  solution is by SRN reference, never by copying or symlinking the directory.
- Only products and components own buckets. Every other kind is a leaf: a
  datamodel, protocol, actor, environment, adr, requirement, capability,
  journey, or metric directory contains artifacts, never further entities.
- **Solution-level kinds** — `actor`, `environment`, `capability`, `journey` —
  have their bucket directly under the solution and nowhere else.
  **Owner-scoped kinds** — `datamodel`, `protocol`, `adr`, `requirement`,
  `metric` — have their bucket under the solution, under a product, or under a
  component at any depth. `metric` is scoped exactly as `requirement` is
  ([srn.md](srn.md)).

Example — `payment` is a sub-component of `checkout`, which belongs to the
`shop` product of the `acme` solution:

```text
solutions/acme/product/shop/component/checkout/component/payment/
→ srn://acme/product/shop/component/checkout/component/payment
```

Each `component/` in that path is a bucket directory, not a name. The word
repeats because the kind repeats, which is exactly the point: the kind of every
entity on the path is written down, never inferred from how deep it sits.

## Entity directories

**Rule:** a directory under `solutions/` is an entity **iff** it contains an
`index.md`. There are no other markers.

Every entity — containers (solution, product, component) and leaf kinds
(datamodel, protocol, actor, environment, adr, requirement, capability,
journey, metric) alike — is a directory holding:

- `index.md` — REQUIRED. YAML frontmatter (see
  [frontmatter.md](frontmatter.md)) plus free prose.
- Sibling artifacts — OPTIONAL. YAML/JSON/markdown files carrying the
  machine-readable substance of the entity (e.g. `schema.json` for a datamodel,
  `transport.yaml` for a protocol, `journey.yaml` for a journey). Which siblings
  a kind defines is the artifact role table
  ([below](#the-artifact-role-table)), stated normatively there for all kinds; each
  kind's `kinds/*.md` document carries its own rows as an excerpt, together
  with the semantics and requiredness of each file. Which *dialect* the bytes of
  such a file are written in is a separate question, answered by the file itself
  under a key this document fixes per role
  ([below](#the-dialect-behind-the-role)).
- Asset subdirectories — OPTIONAL. An entity directory MAY contain
  subdirectories to organize its artifacts (e.g. `workflows/`, `examples/` —
  the depth-2 rows of the role table, [below](#the-artifact-role-table)). An
  asset subdirectory is named for its role and is therefore never one of the
  eleven kinds; it MUST NOT contain an `index.md` at any depth, otherwise it
  would itself parse as an entity.

```text
solutions/acme/product/shop/protocol/order-placement/
├── index.md              # the entity document (frontmatter + prose)
├── states.json           # sibling artifact
├── transport.yaml        # sibling artifact
└── workflows/            # asset subdirectory — no index.md inside
    ├── cancel-order.yaml
    └── place-order.yaml
```

### The document body

**Rule:** the prose in `index.md` MUST NOT contain a level-1 heading. Sections
start at `##`. Violation is `E_STRUCT_BODY_H1`
([below](#structure-error-classes)).

The title is already stated, once, in frontmatter `title`, and the portal
renders it as the page's `<h1>`. A `#` in the prose therefore produces a second
`<h1>` on the same page — a document with two top-level headings has no outline,
which is what a screen reader's heading navigation and every outline-consuming
tool read the page by. In practice the duplicate was never a *different* title
either: every entity in this repository opened with `# <title>`, byte-identical
to the frontmatter field the header had just printed, so the rule removes a
repetition rather than a section.

```markdown
---
name: order
kind: datamodel
title: Order
# … the rest of the frontmatter
---

The order aggregate as the payment component owns it: …

## Invariants the schema cannot express
```

The rule is on the **source**, not on the renderer. Demoting authored headings
at render time would fix the outline while leaving the file — which is what
review reads, in a diff and on any git host — saying something the page does not
say. Level in the source and level on the page agree.

Both markdown spellings of a level-1 heading are covered: `# Title`, and `Title`
underlined with `=`. A `#` inside a fenced block is prose about a path or a
shell, not a heading, and is never flagged.

Which headings each kind then uses is that kind's business: `kinds/adr.md` pins
four level-2 sections, `kinds/requirement.md` pins one, and the rest leave them
conventional. No kind may pin a level-1 heading.

Kind buckets are the mirror image: they hold entity directories and nothing
else.

- A kind bucket MUST NOT contain an `index.md`. It has no SRN —
  `srn://acme/product/shop/datamodel` is not addressable by grammar
  ([srn.md](srn.md#parsing-algorithm)) — so an `index.md` there would be an
  entity whose own name is a reserved keyword (`E_SRN_RESERVED`).
- A kind bucket MUST NOT contain loose files or asset subdirectories: its
  children are entity directories, each with an `index.md`. The loader detects
  the violation only where it breaks something — an entity whose owner has no
  document is `E_STRUCT_MISSING_INDEX` ([below](#structure-error-classes)) —
  because a childless directory without `index.md` is indistinguishable from an
  asset directory.
- A kind bucket MAY be absent when the owner has no entities of that kind.
  Empty kind buckets SHOULD NOT be committed (git does not track empty
  directories anyway).

## Where each kind may live

Every row below is a grammar rule, not a convention. A path that violates it has
no SRN at all, so the loader reports `E_SRN_PLACEMENT` while reading the
directory rather than after building the graph. Example paths are real entities
in the fixture under `solutions/`, except the three marked **†** — `capability`,
`journey` and `metric` are the newest kinds and no fixture entity of them exists
yet, so those rows are illustrative.

| Kind          | Bucket may sit in                               | Example path                                                           |
|---------------|-------------------------------------------------|------------------------------------------------------------------------|
| `product`     | the solution, and nowhere else                  | `solutions/acme/product/shop/`                                         |
| `component`   | a product or a component                        | `solutions/acme/product/shop/component/checkout/component/payment/`    |
| `actor`       | the solution, and nowhere else                  | `solutions/acme/actor/customer/`                                       |
| `environment` | the solution, and nowhere else                  | `solutions/acme/environment/production/`                               |
| `capability`  | the solution, and nowhere else                  | `solutions/acme/capability/order-fulfilment/` †                        |
| `journey`     | the solution, and nowhere else                  | `solutions/acme/journey/place-an-order/` †                             |
| `datamodel`   | the solution, a product, or a component         | `solutions/acme/product/shop/component/checkout/datamodel/cart/`       |
| `adr`         | the solution, a product, or a component         | `solutions/acme/product/shop/adr/0001-event-sourcing/`                 |
| `requirement` | the solution, a product, or a component         | `solutions/acme/product/shop/component/checkout/requirement/idem-cap/` |
| `metric`      | the solution, a product, or a component         | `solutions/acme/product/shop/metric/checkout-conversion/` †            |
| `protocol`    | the nearest common ancestor of its participants | `solutions/acme/product/shop/protocol/order-placement/`                |

Rules:

- An `actor/`, `environment/`, `capability/` or `journey/` bucket below solution
  level is `E_SRN_PLACEMENT`. All four describe the solution's universe;
  products and components reference them, never own them.

  ```text
  solutions/acme/product/shop/actor/customer/index.md   # ILLEGAL — E_SRN_PLACEMENT
  solutions/acme/actor/customer/index.md                # legal
  ```

  For the two newest of the four, the reason is worth spelling out. A
  **capability** is something the business can do; the products and components
  that make it real point *up* at it with a `realizes` edge
  ([frontmatter.md](frontmatter.md)), so putting the capability inside one of
  them would invert the statement. A **journey** crosses the solution by
  definition — its ordered steps touch several products — so an owner deep in
  the tree would be claiming a path whose ends it cannot see.

  ```text
  solutions/acme/capability/order-fulfilment/index.md            # legal
  solutions/acme/journey/place-an-order/index.md                 # legal
  solutions/acme/product/shop/capability/pricing/index.md        # ILLEGAL — E_SRN_PLACEMENT
  solutions/acme/product/shop/journey/checkout-flow/index.md     # ILLEGAL — E_SRN_PLACEMENT
  ```

- A `product/` bucket below solution level is `E_SRN_PLACEMENT`, and so is a
  `component/` bucket directly under the solution. Products are the solution's
  only structural children; components are always inside one.

  ```text
  solutions/acme/product/shop/product/billing/index.md  # ILLEGAL — E_SRN_PLACEMENT
  solutions/acme/component/checkout/index.md            # ILLEGAL — E_SRN_PLACEMENT
  ```

- A bucket inside a leaf entity is `E_SRN_PLACEMENT` — a datamodel, protocol,
  actor, environment, adr, requirement, capability, journey, or metric owns
  nothing. The last three are leaves like every other non-container: a
  capability is not a folder for the metrics about it, and a journey is not a
  folder for the steps it lists (its steps are an artifact, not entities).

  ```text
  solutions/acme/datamodel/money/datamodel/currency/index.md   # ILLEGAL — E_SRN_PLACEMENT
  solutions/acme/capability/order-fulfilment/metric/lead-time/index.md
                                                               # ILLEGAL — E_SRN_PLACEMENT:
                                                               #   a capability owns nothing
  ```

- Datamodels, ADRs, requirements, and metrics are **owner-scoped**: they live in
  the bucket of the container that owns them. Owner scope is a statement of
  responsibility, not visibility — any entity in the solution may reference
  them. A **metric** is scoped exactly as a requirement is, and for the same
  reason: a number is only meaningful about *something*, so it sits with
  whatever is accountable for it, from the solution down to the deepest
  component. What it *measures* is an edge, not its placement — a
  component-owned metric may `measures` a solution-level capability.

  ```text
  solutions/acme/metric/order-conversion/index.md                       # solution-owned
  solutions/acme/product/shop/metric/checkout-conversion/index.md       # product-owned
  solutions/acme/product/shop/component/checkout/component/payment/metric/authorization-success/index.md
                                                                        # component-owned, any depth
  ```

- A protocol MUST live at the **nearest common ancestor (NCA)** of its
  *component and product* participants — the entries of the `participants` list
  in the protocol's own `index.md` frontmatter, which is the authoritative input
  to this rule ([kinds/protocol.md](kinds/protocol.md)). The NCA is computed
  over whole `{kind}/{name}` **pairs**, never over raw segments: the longest
  common prefix of the participants' pair chains. Actors MAY participate in a
  protocol but do not affect placement — actors are solution-level, so counting
  them would degenerate every placement to the solution root.

  All four fixture protocols, and the ancestor each one lands on:

  ```text
  # participants: /product/shop/component/checkout, /product/shop/component/inventory,
  #               /product/shop/component/checkout/component/payment
  # common pair prefix: product/shop
  solutions/acme/product/shop/protocol/order-placement/

  # participants: /product/shop/component/checkout,
  #               /product/shop/component/checkout/component/tax-engine
  # common pair prefix: product/shop + component/checkout
  solutions/acme/product/shop/component/checkout/protocol/tax-quoting/

  # participants: /product/shop/component/checkout/component/payment,
  #               /product/billing/component/ledger, /product/billing/component/reconciliation
  # common pair prefix: none — the two products diverge at the first pair
  solutions/acme/protocol/settlement/

  # participants: /actor/support-agent (an actor: excluded), /product/billing/component/ledger
  # one component participant, so the NCA is that component itself
  solutions/acme/product/billing/component/ledger/protocol/refund-request/
  ```

  A protocol placed below the NCA of its declared participants is flagged
  `W_STRUCT_PROTOCOL_NCA` (a warning, not an error: the `participants` list may
  legitimately lead the directory's placement by a commit or two during a swap).

## Naming rules

- Every path segment under `solutions/` — solution names, kind buckets, and
  entity names alike — MUST match:

  ```text
  ^[a-z0-9]+(-[a-z0-9]+)*$        # kebab-case, 1–64 characters
  ```

  Legal: `shop`, `order-placement`, `0001-event-sourcing`.
  Illegal: `Shop` (uppercase), `order_placement` (underscore), `-cart` (leading
  hyphen), `order.v2` (dot), `café` (non-ASCII). Violations are `E_SRN_SYNTAX`
  — naming and SRN share one grammar, because the path *is* the SRN.

  The absence of `.` from this alphabet is normative, not an accident of the
  regex: the dot is the artifact-suffix separator (`{name}.{role}`,
  [below](#the-artifact-role-table)), and its exclusion from names is a
  one-way reservation exactly like the eleven kind keywords. Were a name ever
  allowed to contain a dot, `settlement.transport` could no longer be told
  apart from an entity named `settlement.transport`, and the final-segment
  split that artifact addressing rests on ([srn.md](srn.md)) would be
  ambiguous. The dot never returns to the name alphabet.

- The eleven reserved kind keywords —

  ```text
  product  component  datamodel  protocol  actor  environment  adr  requirement
  capability  journey  metric
  ```

  — MUST NOT be used as a solution or entity name. They may appear only as
  bucket directories, at the odd positions of the path. Violation:
  `E_SRN_RESERVED`. The second line is the later arrival: the list grows by
  **appending**, never by re-sorting, and adopting a word takes it out of
  circulation as a name everywhere at once — which is why the collision check
  runs before an adoption, not after ([srn.md](srn.md), decision-record
  amendment 2026-08-20-a).

  ```text
  solutions/acme/protocol/                     # legal — kind bucket at solution level
  solutions/acme/product/actor-portal/         # legal — a name, one level down, not a keyword
  solutions/acme/product/component/index.md    # ILLEGAL — E_SRN_RESERVED: a product named
                                               #   "component"
  solutions/acme/actor-portal/index.md         # ILLEGAL — E_SRN_SYNTAX: a solution's child is
                                               #   a bucket, and this is not one of the eleven
  ```

  Note the last line: bucketing tightened this rule. Previously a solution's
  children were a mix of buckets and product names, so `actor-portal` was a fine
  product name at that level. Now every child of a solution directory is a
  bucket, so the name moves down one level into `product/` — where it is still
  legal, because it is still not a reserved word.

- `index.md` is a reserved filename: it may appear only as an entity document.
  Sibling artifact filenames MUST be kebab-case, **bare** — never prefixed with
  the entity name — and carry a standard extension (`.md`, `.yaml`, `.json`);
  e.g. `schema.json`, `transport.yaml`, `states.json`, `openapi.yaml`,
  `topology.yaml`. The per-kind vocabulary of these files is the artifact role
  table ([below](#the-artifact-role-table)).

  ```text
  datamodel/order-line/schema.json                # correct — named by role
  datamodel/order-line/order-line.schema.json     # ILLEGAL — prefixed with the entity name
  protocol/order-placement/transport.yaml         # correct
  ```

  A kind document MAY additionally recognise a foreign extension for a file it
  merely *links* rather than interprets — `pricing.proto`, `schema.graphql`
  under a protocol's `spec.file` ([kinds/protocol.md](kinds/protocol.md)). Such
  a file is named by the external tool's convention; everything the framework
  itself parses obeys the rule above, and only fixed-name files are addressable
  ([below](#the-artifact-role-table)). `openapi.yaml` — once the leading
  example of this class — is a fixed protocol artifact in its own right and
  sits in the role table; the free-named `spec.file` mechanism remains for the
  other formats.

- The frontmatter `name` field MUST equal the entity's directory name
  (`E_FM_NAME_MISMATCH`, see [frontmatter.md](frontmatter.md)), and the
  frontmatter `kind` field MUST equal the bucket the directory sits in
  (`E_FM_KIND_LOCATION`). Neither is inferred from depth any more; both are read
  straight off the path.

## The artifact role table

Sibling artifacts are addressable. A dot suffix on the **final** segment of an
SRN names one artifact of that entity, and the artifact's path is derived from
the entity's path through the table below:

```text
srn://{solution}( /{kind}/{name} )*.{artifact}[@{version}]

srn://acme/protocol/settlement.transport
→ solutions/acme/protocol/settlement/transport.yaml
srn://acme/datamodel/money.examples.forty-nine-ninety
→ solutions/acme/datamodel/money/examples/forty-nine-ninety.json
```

`@{version}` is a coordinate of the **entity**, never of the file — an artifact
has no version of its own, so `settlement.transport@2` means "the transport
artifact of `settlement@2`", resolved by the same version→commit machinery as
the entity itself. The suffix grammar, the lexing order, versioned resolution,
and the fence on which surfaces may write an artifact SRN at all are
[srn.md](srn.md)'s; what this document owns is the `{artifact}` vocabulary —
the **role table**, kind × role × file × depth:

| Kind          | Role               | File                    | Depth |
|---------------|--------------------|-------------------------|-------|
| `datamodel`   | `schema`           | `schema.json`           | 1     |
| `datamodel`   | `examples.<name>`  | `examples/<name>.json`  | 2     |
| `protocol`    | `transport`        | `transport.yaml`        | 1     |
| `protocol`    | `states`           | `states.json`           | 1     |
| `protocol`    | `openapi`          | `openapi.yaml`          | 1     |
| `protocol`    | `workflows.<name>` | `workflows/<name>.yaml` | 2     |
| `journey`     | `journey`          | `journey.yaml`          | 1     |
| `environment` | `topology`         | `topology.yaml`         | 1     |
| `environment` | `config`           | `config.yaml`           | 1     |

Every kind absent from the table — solution, product, component, actor, adr,
requirement, capability, metric — defines **no roles at all**: any artifact
suffix on an SRN of such a kind is `E_SRN_ARTIFACT` ([srn.md](srn.md)).

Rules:

- **The table is a spec constant.** Like the list of eleven reserved kinds, it
  is part of the grammar, not of any catalog: converting
  `…/settlement.transport` to a path takes this table and nothing else — never
  a directory listing, never a frontmatter read. That is what keeps the
  consolidating principle of [srn.md](srn.md) intact. Each kind document
  ([kinds/datamodel.md](kinds/datamodel.md),
  [kinds/protocol.md](kinds/protocol.md), [kinds/journey.md](kinds/journey.md),
  [kinds/environment.md](kinds/environment.md)) carries its own rows as an
  excerpt, and [srn.md](srn.md#the-role-table) restates the table in full so
  its validation rules read standalone — every one of those is a mirror. The
  normative statement, the one a new role is appended to first, is this one.

- **Closed set, fixed depth.** A role is one segment deep except the two
  named-file families, `examples.<name>` and `workflows.<name>`, which are
  exactly two deep with `<name>` in the segment alphabet above. An unknown role
  for the addressed kind, a known role at the wrong depth, any artifact suffix
  on a kind with no roles, and every malformed suffix shape that survives the
  lexer — all are `E_SRN_ARTIFACT`, checkable against this table before any
  disk access. A **legal** role whose file is absent on disk is
  `E_SRN_DANGLING` instead: the table states identity, not obligation. Whether
  a file must exist (`schema.json`, `journey.yaml`) or may (`transport.yaml`,
  `states.json`, `openapi.yaml`, `topology.yaml`, `config.yaml`, every
  `workflows/*` and `examples/*` member) remains each kind document's contract.

  ```text
  srn://acme/actor/customer.transport            # ILLEGAL — E_SRN_ARTIFACT: actor has no roles
  srn://acme/protocol/settlement.spec            # ILLEGAL — E_SRN_ARTIFACT: not a protocol role
  srn://acme/datamodel/money.examples            # ILLEGAL — E_SRN_ARTIFACT: examples.* is depth 2
  srn://acme/environment/production.topology.eu  # ILLEGAL — E_SRN_ARTIFACT: topology is depth 1
  srn://acme/product/fulfilment/protocol/tracking-events.states
                                                 # E_SRN_DANGLING — legal role, but this protocol
                                                 #   has no states.json on disk
  ```

- **The role erases the extension, so the extension is fixed.** The dot form
  writes `transport`, never `transport.yaml`: role → file appends an extension
  this table pins, and file → role strips it. Both directions MUST be functions
  of the table alone, which forbids two things at once: two roles of one kind
  sharing a file, and one role's file varying its extension. A role spelled
  "`transport.*`" would make the reverse map need a directory listing to learn
  which extension exists, and two files differing only in extension would
  collapse into one role. Fixed filenames are what keep the extension-erasing
  map injective.

- **Free-named files are not addressable.** A protocol's `transport.yaml` MAY
  bind an external spec document with a free name in a foreign convention —
  `pricing.proto`, `schema.graphql` under `spec.file`
  ([kinds/protocol.md](kinds/protocol.md)). Such files are legal and linked,
  but no artifact SRN reaches them: a free name would carry both name and
  extension outside the spec constant, so conversion would need exactly the
  directory listing the previous rule forbids. `openapi.yaml` was promoted out
  of this class into the row above — recognised by its fixed bare name, served
  as bytes, not parsed — and that promotion is how another format becomes
  addressable: the table grows a fixed name; it never reaches out to free
  ones.

- **Growth is additive, and additive only.** A new role is an additive spec
  change to the owning kind's document plus this table — the same appending
  discipline the eleven-kind list follows. Renaming or removing a row breaks
  every SRN written against it and is a breaking change to this specification.

- **This is the one licensed bend in SRN ≡ path.** For entities the identity is
  literal, segment for segment. An artifact SRN maps **through** the table —
  `settlement.transport` names `transport.yaml`, not a file called `transport`
  — so the path is derived rather than transcribed. The bend has exactly the
  shape of the reserved-kind list itself: a finite constant in the spec,
  consulted in both directions, never a catalog read. What the principle
  guarantees — the path from the SRN, the SRN from the path, with the spec
  alone — holds unbroken.

## The dialect behind the role

The role table is a spec constant, and it answers exactly one question: **where a
file is and what it is called**. It says nothing about the bytes inside. A
`transport.yaml` is a `transport.yaml` whether it holds the mini-spec
[kinds/protocol.md](kinds/protocol.md) defines or the AsyncAPI document that
same kind now admits on the wires AsyncAPI describes — one role, one filename,
one SRN, two grammars, both live at this revision. Which of the two a given file
is written in is that file's **dialect**, and the answer lives in the file,
never in the table.

Keeping the two apart is exactly what artifact addressing bought. A role names a
file, never a format: `.transport` is *the transport role of this protocol*, not
*the transport mini-spec*. Had the role named the format, standardizing that
format would have moved the address, and every referrer would have had to be
rewritten to keep saying the same thing about the same file. Because the role is
the address, a payload may standardize inside a filename that stays put — and
then the one thing missing is a way for a reader to tell which of the two it is
holding. Inferring it from which keys happen to be present is not that way:
shape-sniffing is a second grammar nobody wrote down, kept in step with the real
ones by hand, and two dialects sharing a prefix of keys are indistinguishable
under it right up until the day they are not.

**Rule:** every addressable artifact declares its own dialect, in its own bytes,
under a key fixed by the table below for the dialect it is written in
(decision-record amendment 2026-08-21-a; the transport role's second row is
[0017-transport-asyncapi](srn://metaframework/adr/0017-transport-asyncapi)).
Where the format already discriminates itself the native key is used and the
framework invents nothing; where it does not, the artifact carries
`$schema` holding the canonical URL of the framework meta-schema that defines
the dialect. Those meta-schemas are ordinary datamodel entities of the
framework's own `specification` product, so their URLs are ordinary canonical
schema URLs ([srn.md](srn.md)) on the one canonical host, and they share one
prefix:

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
| `journey`     | `journey`          | `journey.yaml`          | the mini-spec | `$schema`  | `{meta}/journey-document`        |
| `environment` | `topology`         | `topology.yaml`         | the mini-spec | `$schema`  | `{meta}/topology-document`       |
| `environment` | `config`           | `config.yaml`           | the mini-spec | `$schema`  | `{meta}/config-document`         |

The row order is the role table's own, and that is not decoration: this table is
**total** over that one, every role of it answered, `none` included. A role added
above without a ruling here would be a role whose dialect nobody decided, which
is indistinguishable from a role that carries none — so the two tables grow
together or neither does.

Total, not one-to-one. A role carries **one or more** dialect rows — nine roles,
ten rows at this revision — and where it carries several they are ordered
**most canonical first**. That order is read twice, and both readings are
normative: it is the dialect a headerless file is told to add, and it is the
dialect a file declaring two of the keys is read under. Rows are added to a role
under the same additive discipline as everything else here; a dialect is never
removed from one, because the files written in it do not stop existing.

The value is an **identity**, and it is read as one. Recognition is a string
comparison against this table: no URL is fetched, and a reader that cannot reach
the host loses nothing at all. It carries no `@version` either, for the reason
every canonical schema URL carries none — it names a *dialect*, not a revision of
one. An additive dialect change is a superset extension of the same meta-schema
entity, which keeps its name, its URL, and therefore this string; a non-additive
one is a swap to a new meta-schema entity with a new name and a new URL
([evolution.md](evolution.md)), which is what "a new dialect lands beside the
old" means one level up.

Four of the rulings above carry their reasons rather than implying them.

- **A datamodel's `$schema` is not the framework's to spend.** On a JSON Schema
  document `$schema` already means the meta-schema of the *JSON Schema dialect*,
  and [kinds/datamodel.md](kinds/datamodel.md) already REQUIRES it to be exactly
  `https://json-schema.org/draft/2020-12/schema` (`E_DM_DIALECT`). Pointing it
  at a framework URL instead would break every stock validator and buy nothing.
  The row is in the table because the role has a discriminator, not because the
  framework supplied one.

- **`examples/<name>.json` carries no discriminator, ever.** That is a rule, not
  an omission. An example is an *instance* of its sibling `schema.json`: its
  dialect is that schema's dialect and it has none of its own. Injecting
  `$schema` would add a property the schema must then admit, and
  `additionalProperties: false` is ordinary in a catalog schema — so the
  discriminator would make the example fail the very document it exemplifies.
  `W_ARTIFACT_DIALECT` ([below](#the-legacy-dialect-and-its-warning)) MUST NOT
  be raised on an `examples/*` file.

- **`openapi.yaml` is the shape every future standard takes.** A format that
  already names itself keeps doing so, and the framework adds nothing beside it.
  The value is written `3.1.x` rather than `3.1.0` because OpenAPI versions the
  *document*: `3.1.1` is the same dialect with errata applied, and a reader that
  recognised only the exact string would complain about a correct file whose
  author had done nothing but track a patch release. Recognition is therefore
  the whole `3.1` line, while the advice a headerless file gets still names one
  concrete, pasteable value. The framework rows need no such latitude — a
  meta-schema URL carries no version to widen.

- **`transport` is the role that has two, and it is not a migration window.**
  [kinds/protocol.md](kinds/protocol.md) admits an AsyncAPI 3.x document under
  the same filename for the wires AsyncAPI describes, and keeps the mini-spec for
  the wires it does not — an `in-process` call has no host to put in a Server
  Object and there is no gRPC binding to bind, so the mini-spec row is load-
  bearing permanently and both rows stay. The mini-spec is listed first because
  every wire can use it, so it is the right advice for a headerless file. The
  AsyncAPI value is written `3.x` rather than `3.1.x` on the standard's own text
  — AsyncAPI promises a minor increment stays usable by tooling built for a lower
  minor and that tooling ignores the patch, which is a wider promise than
  OpenAPI's and earns a wider band. Which `kind` may use which dialect is the
  kind document's ruling, not this table's: this table says only how a reader
  tells them apart.

### An artifact that declares one, and one that does not

`solutions/acme/protocol/settlement/transport.yaml` is the worked case, and every
revision below is real — it is the same file at three of its own versions, and
each was on disk at the commit named, cut off after the keys that make the point.
**The current file is the third one**, so read the first two as history rather
than as the fixture. At `settlement@2`, before this rule landed, it was in the
legacy dialect. Nothing in it is a discriminator — `kind: kafka` names the wire
protocol the transport uses, which is content, and a second dialect of this same
role could carry that key unchanged.

```yaml
# solutions/acme/protocol/settlement/transport.yaml — the legacy dialect
kind: kafka
summary: Settlement facts published by shop and consumed by billing.
encoding: avro
```

The same artifact at `settlement@3`, declaring its dialect. One line is added at
the top and no other line changes; the filename, the SRN
`srn://acme/protocol/settlement.transport`, and every reference written against
it are untouched:

```yaml
# solutions/acme/protocol/settlement/transport.yaml — the transport-document dialect
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: kafka
summary: Settlement facts published by shop and consumed by billing.
encoding: avro
```

And the same artifact again at `settlement@4`, which is what is on disk now: the
whole document was rewritten into the other dialect this role admits, and the
discriminator changed with it, because the discriminator belongs to the grammar
rather than to the file. This is the case the separation was built for — the
bytes are unrecognisable beside the block above, and the address did not move:

```yaml
# solutions/acme/protocol/settlement/transport.yaml — the AsyncAPI dialect
asyncapi: 3.1.0
x-srn: srn://acme/protocol/settlement
info:
  title: Settlement
  version: unversioned
  description: Settlement facts published by shop and consumed by billing.
defaultContentType: application/vnd.apache.avro
```

In a JSON artifact the key is a member of the root object, in the same position
and to the same effect:

```json
{
  "$schema": "https://schemas.metaframework.dev/metaframework/product/specification/datamodel/state-machine-document",
  "id": "order-placement",
  "initial": "requested"
}
```

The `2 → 3` in that sequence is the rest of the rule. Adding the line is a
content change to a sibling artifact, so it bumps the owning entity's `version`
by exactly 1, in the same commit, like any other change to any other artifact
([evolution.md](evolution.md)) — and the bump is per **entity**, not per file. A
protocol that gains a header in `transport.yaml`, `states.json` and two workflow
files in one commit bumps once. The `3 → 4` obeys the same arithmetic for the
same reason: a dialect rewrite is an ordinary content change to one artifact, and
it buys no extra bump for being a large one.

### The legacy dialect, and its warning

An artifact carrying no recognisable discriminator is read as the **legacy
dialect** — the format this specification and the relevant kind document define
today — and is warned, never broken.

| Code                 | Meaning                                                                                   |
|----------------------|-------------------------------------------------------------------------------------------|
| `W_ARTIFACT_DIALECT` | An artifact declares no dialect, or one unknown for its role; read as the legacy dialect. |

The class is a warning, and it is raised on the entity that **owns** the file,
because an artifact is not an entity and has no diagnostics of its own. It has
two message forms, both ending in the same clause, because that clause is the
contract:

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

Whatever the header says or fails to say, the file is still parsed, still
rendered, and still checked against the legacy grammar: nothing in this rule can
make a catalog that loads today stop loading. Two rows are silent rather than
warned — `examples/<name>.json`, which has no dialect to declare, and
`schema.json`, whose missing header is already the error `E_DM_DIALECT` and needs
no second complaint about one fact. The warning has no forcing function on
purpose; `E_DM_DIALECT` is what a terminal state looks like, and promoting the
other roles to it is a later decision, available only once every file carries a
header.

### The framework-owned key is read once, then removed

`$schema` on the six framework-owned rows is not part of any kind's grammar, and
no kind document carries a row for it. The loader reads it, records the dialect
on the artifact, and deletes the key from the parsed document before the kind's
own validator is handed anything — so `states.json` still rejects every unknown
key under `E_PROTO_STATES_SUBSET`, a `journey.yaml` still rejects one under
`E_JRN_SCHEMA`, and neither carves out an exception for the header. Deletion
happens whether or not the value was recognised: leaving an unrecognised one in
place would convert this warning into an unknown-key *error* downstream, which is
the one outcome "never broken" forbids.

A **native** discriminator is never stripped. `openapi:`, `asyncapi:` and a
datamodel's `$schema` belong to their own formats, and a document that arrived
without them would be the poorer document. That asymmetry is what resolves a
`transport.yaml` declaring both of its role's keys with no rule of its own: the
first matching row wins, so the file is read as the mini-spec, `asyncapi:`
survives the strip it was never subject to, and the mini-spec's own field table
rejects it as an unknown non-`x-` top-level key. The bytes are untouched in every case: what the
portal serves as the file — its source pane, its artifact route — is the file as
authored, header included, and the stripped document is an internal parse
product that is never served as the document.

The distinction from the `x-` extension hatch is the point rather than a
technicality. `x-` is open-ended and belongs to **authors**: any key, any shape,
any number of them, and the framework promises only not to look. What this rule
adds is one key, spelled one way, at the artifact root and nowhere else,
optional, owned by the framework and removed by it. Spelling the discriminator
`x-schema` to slip it past the strict validators would have been the framework
hiding inside the mechanism it gave its users.

### Filenames stay

**A dialect change touches no row of the role table.** A dialect is a property of
a file's contents; the table maps kind × role to a fixed name, and a new dialect
inside an existing filename is not an amendment to it. `transport.yaml` holding
AsyncAPI is still `transport.yaml`, still `srn://acme/protocol/settlement.transport`,
still one row.

The converse is the ruling that matters: **a lane that wants a new filename must
come back for a role-table amendment**, under the additive-growth rule that
governs every other row ([above](#the-artifact-role-table)).

```text
transport.yaml grows an AsyncAPI dialect   # no row moves, no address moves
arazzo.yaml beside workflows/              # a new role — append a row above first
```

The two are different changes with different blast radii. A new row mints
addresses and obliges every SRN parser, in this document and in each of its
mirrors; a new dialect obliges only the reader of that one file. Collapsing them
would let any payload lane rewrite the identity grammar as a side effect of
changing a payload, which is exactly what separating role from dialect exists to
prevent.

## Annotated example tree

Abridged from the real fixture under `solutions/` — every path below exists on
disk. Directories are listed before files:

```text
solutions/
└── acme/                                   # solution                 srn://acme
    ├── actor/                              # kind bucket — never an entity, never an index.md
    │   └── customer/                       # srn://acme/actor/customer
    │       └── index.md
    ├── adr/
    │   └── 0001-single-currency/           # srn://acme/adr/0001-single-currency
    │       └── index.md
    ├── datamodel/
    │   └── money/                          # srn://acme/datamodel/money
    │       ├── examples/                   # asset dir — no index.md at any depth
    │       │   └── forty-nine-ninety.json  # srn://acme/datamodel/money.examples.forty-nine-ninety
    │       ├── index.md
    │       └── schema.json                 # srn://acme/datamodel/money.schema
    ├── environment/
    │   └── production/                     # srn://acme/environment/production
    │       ├── index.md
    │       └── topology.yaml               # srn://acme/environment/production.topology
    ├── product/                            # the product bucket — products live nowhere else
    │   ├── billing/                        # srn://acme/product/billing
    │   │   ├── component/
    │   │   │   └── ledger/                 # srn://acme/product/billing/component/ledger
    │   │   │       └── index.md
    │   │   └── index.md
    │   └── shop/                           # product                  srn://acme/product/shop
    │       ├── adr/
    │       │   └── 0001-event-sourcing/    # srn://acme/product/shop/adr/0001-event-sourcing
    │       │       └── index.md
    │       ├── component/                  # the component bucket, repeated at every level
    │       │   ├── checkout/               # component                srn://…/component/checkout
    │       │   │   ├── component/
    │       │   │   │   └── payment/        # sub-component — a component pair again
    │       │   │   │       ├── datamodel/
    │       │   │   │       │   └── order/  # srn://…/payment/datamodel/order
    │       │   │   │       │       ├── index.md
    │       │   │   │       │       └── schema.json
    │       │   │   │       └── index.md
    │       │   │   ├── datamodel/
    │       │   │   │   └── cart/           # srn://…/component/checkout/datamodel/cart
    │       │   │   │       └── index.md
    │       │   │   ├── requirement/
    │       │   │   │   └── idem-cap/       # srn://…/checkout/requirement/idem-cap
    │       │   │   │       └── index.md
    │       │   │   └── index.md
    │       │   └── inventory/              # srn://acme/product/shop/component/inventory
    │       │       └── index.md
    │       ├── datamodel/
    │       │   └── order-line/             # srn://acme/product/shop/datamodel/order-line
    │       │       ├── index.md
    │       │       └── schema.json
    │       ├── protocol/                   # NCA of the participants = the shop product
    │       │   └── order-placement/        # srn://acme/product/shop/protocol/order-placement
    │       │       ├── workflows/          # asset dir — no index.md
    │       │       │   └── place-order.yaml
    │       │       └── index.md
    │       └── index.md
    ├── protocol/                           # NCA of the participants = the solution
    │   └── settlement/                     # srn://acme/protocol/settlement
    │       ├── workflows/
    │       │   └── settle-order.yaml       # srn://acme/protocol/settlement.workflows.settle-order
    │       ├── index.md
    │       └── transport.yaml              # srn://acme/protocol/settlement.transport
    ├── requirement/
    │   └── gdpr-erasure/                   # srn://acme/requirement/gdpr-erasure
    │       └── index.md
    └── index.md                            # the solution's entity document
```

The four elided SRNs in full:

```text
srn://acme/product/shop/component/checkout
srn://acme/product/shop/component/checkout/component/payment/datamodel/order
srn://acme/product/shop/component/checkout/datamodel/cart
srn://acme/product/shop/component/checkout/requirement/idem-cap
```

### The newest three, on disk

`capability`, `journey` and `metric` have no fixture entities yet, so they are
shown separately — the tree above is real, this one is illustrative. Nothing
here is a new layout rule; the point is that three more buckets slot into the
same alternation:

```text
solutions/
└── acme/
    ├── capability/                             # solution-level bucket, beside actor/
    │   └── order-fulfilment/                   # srn://acme/capability/order-fulfilment
    │       └── index.md                        #   a leaf — no buckets inside
    ├── journey/                                # solution-level bucket
    │   └── place-an-order/                     # srn://acme/journey/place-an-order
    │       ├── index.md
    │       └── journey.yaml                    # sibling artifact: the ordered steps
    ├── metric/                                 # owner-scoped bucket, here at the solution
    │   └── order-conversion/                   # srn://acme/metric/order-conversion
    │       └── index.md
    └── product/
        └── shop/
            ├── metric/                         # the same bucket, owned by the product
            │   └── checkout-conversion/        # srn://acme/product/shop/metric/checkout-conversion
            │       └── index.md
            └── component/
                └── checkout/
                    └── metric/                 # …and again, owned by a component
                        └── p99-latency/        # srn://…/component/checkout/metric/p99-latency
                            └── index.md
```

The `metric/` bucket repeats for the same reason `datamodel/` and `requirement/`
do: the bucket names the kind, the owner names the accountability, and neither is
inferred from depth. `capability/` and `journey/` cannot repeat — a second
occurrence anywhere below the solution is `E_SRN_PLACEMENT`.

## Structure error classes

Placement is grammar now, so the structural checks are only what the grammar
cannot see: a document that should exist and does not, an entity where no entity
may be, two directories claiming one SRN, and a document whose prose opens a
heading level the page has already used ([above](#the-document-body)).

| Code                     | Meaning                                                                                    |
|--------------------------|--------------------------------------------------------------------------------------------|
| `E_STRUCT_MISSING_INDEX` | A directory that owns an entity has no `index.md`, so the owner's SRN resolves to nothing. |
| `E_STRUCT_NESTED_ENTITY` | An `index.md` sits directly below an entity that is not a container.                       |
| `E_STRUCT_DUPLICATE_SRN` | Two directories resolve to the same SRN.                                                   |
| `E_STRUCT_BODY_H1`       | An `index.md` body carries a level-1 heading; the page already renders `title` as the h1.  |
| `W_STRUCT_PROTOCOL_NCA`  | Protocol not at the NCA of its component/product participants.                             |

Notes on each, because the grammar overlaps them:

- `E_STRUCT_MISSING_INDEX` is what a missing entity document looks like **from
  below**. The loader walks the tree, parses each entity directory as an SRN,
  and then links each entity to its owner; when the owner directory has no
  `index.md` there is no owner entity to link to, and the diagnostic is reported
  against the orphan. A directory without `index.md` is otherwise
  indistinguishable from an asset directory, so nothing is reported until
  something below it needs a parent — meaning an entity-less leaf directory
  inside a bucket is a silent no-op, not a diagnostic.

  ```text
  solutions/acme/product/shop/component/checkout/               # index.md deleted here …
  solutions/acme/product/shop/component/checkout/component/payment/index.md
  # E_STRUCT_MISSING_INDEX, reported against payment:
  #   "parent entity srn://acme/product/shop/component/checkout has no index.md"
  ```

- `E_STRUCT_NESTED_ENTITY` fires when a non-container entity has a child
  directory holding `index.md`. The grammar rejects that path too — the asset
  directory's name is not a kind bucket, or the leaf kind may own nothing — but
  the structural diagnostic is kept because it names the **owner**, whereas the
  SRN error can only say the path is not an SRN.

  ```text
  solutions/acme/datamodel/money/examples/index.md
  # E_STRUCT_NESTED_ENTITY — an entity below a datamodel (owner: srn://acme/datamodel/money)
  # E_SRN_SYNTAX          — and "…/datamodel/money/examples" is not a legal SRN either
  ```

  Below the entity's immediate children only the grammar catches it. In
  `solutions/acme/product/shop/protocol/order-placement/workflows/rogue/index.md`
  the directory directly above `rogue` is an asset directory, not an entity, so
  no owner is available to blame and the sole diagnostic is `E_SRN_SYNTAX`
  (`"workflows" is not a kind bucket`).

- `E_STRUCT_DUPLICATE_SRN` cannot arise from two distinct paths on a
  case-sensitive filesystem, since SRN ≡ path. It exists for the cases that
  break that assumption — a symlinked directory, or a case-insensitive
  filesystem folding two names into one. The loader keeps the first entity and
  reports the second.

`E_STRUCT_KIND_PLACEMENT` is **retired**. Every placement violation it used to
cover is now `E_SRN_PLACEMENT`, raised by the parser, and is listed in
[srn.md](srn.md#placement-is-grammar) as rules P1–P4.

`W_ARTIFACT_DIALECT` is defined in this document too, beside the table it
belongs to ([above](#the-legacy-dialect-and-its-warning)), and not in the table
here: it is about the bytes of a file rather than about where anything sits, and
it is the one class in this document that is cross-kind by construction — the
same warning on a protocol, a journey and an environment.

SRN-level naming and artifact-addressing violations (`E_SRN_SYNTAX`,
`E_SRN_RESERVED`, `E_SRN_ARTIFACT`, `E_SRN_DANGLING`) are defined in
[srn.md](srn.md); frontmatter violations in
[frontmatter.md](frontmatter.md). All are enforced by the catalog loader, which
`metaframework check` runs.
