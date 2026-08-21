---
name: protocol-design
description: This skill should be used when the user asks to "add a protocol", "describe how these components talk", "document this API in the catalog", "add an event bus between these services", "write transport.yaml", "add a workflow to a protocol", "draw a sequence diagram from the catalog", "add states.json", "write the XState machine for a conversation", "bind an OpenAPI or AsyncAPI file", "declare participants and aliases", "pick point-to-point vs bus vs request-response", or asks where a protocol directory belongs / what its nearest common ancestor is — in a metaframework solution catalog under `solutions/`. It owns the `protocol` kind only — use `add-entity` for a product, component, actor, environment, ADR or requirement, and `model-data` for the payload datamodels a protocol references. For changing an EXISTING published protocol, decide the mechanism with `evolve-entity` first.
---

# Authoring a protocol

A protocol says who talks, over which wire, in what order, and through which
conversation states. It is the richest kind in the ontology and feeds the most
derived views: the participant graph, one sequence diagram per workflow, a state
chart, and the message × datamodel matrix.

Everything except `index.md` is optional. A protocol with only `index.md` is
legal — an intent-level protocol under design that derives no diagrams.

```text
solutions/acme/protocol/settlement/
├── index.md              REQUIRED   frontmatter + prose
├── transport.yaml        OPTIONAL   the wire binding — exactly one transport
├── states.json           OPTIONAL   XState-subset conversation machine
├── openapi.yaml          OPTIONAL   external spec, recognised by being linked from transport.yaml
└── workflows/            OPTIONAL   asset dir, never an entity, no index.md at any depth
    └── settle-order.yaml            one workflow; name = filename stem
```

## Where the rules live

**Read `framework/spec/kinds/protocol.md` in full when the repository has it —
it is authoritative and it is the largest kind document in the spec.** When it is
absent, the bundled `_shared/references/protocols.md` is the distilled rule copy:
the artifact contracts, the alias contract and every `E_PROTO_*` code. This
skill's own `references/artifacts.md` sits on top of it as the authoring
companion, anchored to the shipped fixtures.

| Need                                                     | Read                                                              |
|----------------------------------------------------------|-------------------------------------------------------------------|
| The protocol rules: artifacts, aliases, `E_PROTO_*`      | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/protocols.md`    |
| `transport.yaml`, workflow YAML, `states.json` while authoring | `references/artifacts.md`                                    |
| A complete protocol, verbatim, with an audit checklist   | `references/worked-protocol.md`                                    |
| NCA placement, artifact filenames, `x-` escape           | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/structure.md`    |
| `participants`, `style`, `conforms-to`, relations        | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/frontmatter.md`  |
| Payload reference syntax, the `..` arithmetic            | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/srn.md`          |
| Version bumps, the swap procedure                        | `${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/evolution.md`    |
| Payload datamodels                                       | the `model-data` skill                                            |

## Procedure

1. **List the participants** — the entities, then an alias for each. (§1 & 3)
2. **Compute the NCA** from the component/product participants; that is the
   directory. Actors are excluded. (§2)
3. **Check the back-edges** on each component/product participant. (§1 & 3)
4. **Pick `style`** with the decision rule below. (§4)
5. **Write `index.md`** — common frontmatter plus `participants` and `style`,
   then prose saying why this conversation is a versioned contract at all.
6. **Write `transport.yaml`** — one transport; external spec link **XOR**
   surface list. (`references/artifacts.md`)
7. **Write `workflows/*.yaml`** — one file per named exchange. (same)
8. **Write `states.json`** only if the conversation has states worth naming.
   (same)
9. **Run the catalog check** and report the result. (§Finish)

Steps 1–4 are decisions and step 2 is irreversible: a protocol at the wrong NCA
costs a swap, because entities are never moved. Steps 5–8 are mechanical.

## 1 & 3. Participants, aliases, and who owns which fact

`participants` is a list of `{ alias, ref, role? }`, at least two entries
(`E_PROTO_PARTICIPANTS`), aliases kebab-case and unique
(`E_PROTO_ALIAS_DUP`), each `ref` resolving to a **component, product, or actor**
(`E_PROTO_PARTICIPANT_KIND`). A participant carries no title — the portal labels
the lifeline from the target entity, so copying a title here only drifts.

**The component side owns the edge; the protocol side owns the alias.** Both
facts exist and neither is redundant:

| Concern                                                       | Authoritative source                       |
|---------------------------------------------------------------|--------------------------------------------|
| Who is in the graph, and which direction each edge runs       | `exposes` / `uses` on the component or product |
| The alias namespace used by `workflows/*.yaml` and the lifelines | `participants` in the protocol's `index.md` |
| Where the protocol directory sits                             | `participants`, filtered to component/product refs |

So writing `participants` is only half the job: the provider component needs
`relations.exposes: [<this protocol>]` and each consumer needs
`relations.uses: [<this protocol>]`, in their own `index.md`. Missing back-edge
is `W_PROTO_PARTICIPANT_UNLINKED`; a component that declares the edge but is
absent from `participants` is `W_PROTO_PARTICIPANT_MISSING`. Both are warnings
because during a swap one side legitimately moves first.

**Actors are exempt from both warnings** — they are personas and external
systems, not catalogued implementations. An external system outside the catalog
(a payment service provider, a broker that is not a component) participates *as
an actor*: `ref: /actor/psp-acquirer`. There is no external-system kind in v1.

## 2. NCA placement — take the prefix pair by pair

A protocol lives at the nearest common ancestor of its **component and product**
participants, computed over whole `{kind}/{name}` **pairs**, never over raw
segments. Taking a prefix at a bare segment lands on a bucket, and a bucket has
no SRN and cannot hold an `index.md`. Four of the shipped protocols, one per
placement outcome:

```text
checkout + inventory + payment                    → product/shop
  solutions/acme/product/shop/protocol/order-placement/

checkout + checkout/tax-engine                    → product/shop + component/checkout
  solutions/acme/product/shop/component/checkout/protocol/tax-quoting/

payment + billing/ledger + billing/reconciliation → (empty: products diverge)
  solutions/acme/protocol/settlement/

support-agent (actor, excluded) + billing/ledger  → that one component
  solutions/acme/product/billing/component/ledger/protocol/refund-request/
```

Row three is why the rule is pairwise: shop and billing share the literal segment
`product`, but `product` alone is a bucket, so the shared prefix is empty and the
protocol belongs at the solution root. Row four is why actors are excluded — they
are solution-level, so counting them collapses every protocol to the root.

Below the NCA is `W_STRUCT_PROTOCOL_NCA` (a warning: the participant list may
lead the directory by a commit during a swap). But adding a participant that
moves the NCA does **not** license a `git mv` — entities are never moved. Getting
the NCA wrong at creation costs a swap.

## 4. `style` — one axis, three values

Apply in order; the rule is total and non-overlapping:

| Question                                            | Answer | `style`            |
|-----------------------------------------------------|--------|--------------------|
| Does the sender name the receiver?                  | no     | `bus`              |
| …and does the protocol contract a correlated reply? | yes    | `request-response` |
| …otherwise                                          | —      | `point-to-point`   |

The value is deliberately coarse — it drives navigation, filtering, and the
default diagram layout, nothing else. Precision lives one level down, in
`transport.kind` and each step's `kind`. **`style` and `transport.kind` are
different axes**: `tax-quoting` is `style: request-response` over
`kind: in-process`, and that is not a contradiction.

Two lints, both warnings: `style: bus` with any `kind: call` step, and
`style: request-response` with no `call`/`return` pair anywhere, are each
`W_PROTO_STYLE_MISMATCH`.

## 6-8. The three artifacts

`transport.yaml` (one transport, `spec` XOR a surface list), `workflows/*.yaml`
(one file per named exchange, fragments capped at depth 3), and `states.json`
(an XState v5 subset describing the conversation, not a participant). The forms,
the required fields per transport kind, the two `message` traps and the XState
subset boundary are all in **`references/artifacts.md`** — read it before
writing any of the three.

Three things worth knowing before you get there:

- **One protocol, one transport.** A protocol offered over two wire technologies
  is two protocol entities (`E_PROTO_TRANSPORT_BINDING`).
- **`spec` and the surface list are mutually exclusive**
  (`E_PROTO_TRANSPORT_SPEC_CONFLICT`). Point at a real OpenAPI/AsyncAPI/`.proto`
  file, or write the lightweight list — never both, because both drift.
- **Artifacts carry no version of their own.** A top-level `version:` key in
  `transport.yaml` or a workflow file is a shape violation; the entity's
  frontmatter `version` covers the whole directory. Unknown keys anywhere need
  the `x-` prefix, except in `states.json`, where they are errors.

## 9. Payload binding

Every payload reference — a step's `payload`, and a surface entry's `request`,
`response`, or `message` — is an ordinary **SRN**, not a schema URL. It must
resolve to a `datamodel` (`E_PROTO_PAYLOAD_KIND`) and **should pin `@version`**:
an unpinned reference silently follows the target's latest, so a contract
reviewed against `order@2` starts describing `order@3` with no diff on this file.

Pinning works here and not in a `schema.json` `$ref` precisely because these are
framework-private catalog references that no external tool reads, while
`schema.json` must stay dereferenceable by stock JSON Schema tooling. Both name
the same entity in two spellings — `/product/shop/datamodel/order` here,
`https://schemas.metaframework.dev/acme/product/shop/datamodel/order` there — and
the projection is exactly what drops the pin, because a schema URL addresses the
*current* schema. That is the consolidating principle (`srn.md`), not two
addressing schemes.

**Write payload references path-absolute** (`/product/shop/datamodel/order@1`).
A relative reference resolves against the referring *file's* URI, so the same
text means different things in `transport.yaml` and in `workflows/x.yaml` — the
workflow file is one level deeper. Worse, the failure profile is asymmetric: an
off-by-one miscount makes the segment count odd and is always rejected, but an
off-by-two stays grammatical and resolves to a *different, legal* entity —
surfacing as `E_SRN_DANGLING` if nothing is there, and as a silently wrong edge
if something is. Path-absolute removes the only case the grammar cannot catch.

`states.json` carries no SRN references at all — it names events and states only.

## Journeys name protocols

One reference surface outside this kind points at protocols: a **journey** step
may carry `protocol: <SRN of a protocol>`, saying how that step reaches what it
touches. Nothing changes here — a protocol is authored the same way whether or
not a journey names it — but two consequences are worth knowing while you decide
whether a protocol is needed at all:

- A journey step that **crosses a product boundary** and names no protocol is
  `W_JRN_UNDOCUMENTED_INTEGRATION`: the catalog has found an integration nobody
  wrote down. The fix is a new protocol entity, authored by this skill. The
  integration-gap panel on the solution dashboard is therefore a queue of
  protocols worth writing.
- A step's named protocol SHOULD list either end of the hop among its
  `participants` (`W_JRN_PROTOCOL_UNRELATED`) — a protocol documenting neither
  end is not documenting the hop.

The `journey.yaml` format itself is not this skill's business: it is in
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/journeys.md`, and journey
entities are authored with `add-entity`.

## Worked example

`references/worked-protocol.md` reproduces `srn://acme/protocol/settlement`
verbatim — frontmatter, Kafka `transport.yaml`, a fan-out workflow, a compound
state machine — followed by the six-point audit checklist to run against any
protocol you write, and pointers to the shipped protocols that exercise the
forms settlement does not.

## Evolving a protocol

Contract surface — removing or repointing any of these requires a **swap**, never
an in-place edit: a `participants` entry; a surface list entry and its
`request`/`response`/`message`; `transport.kind` and the binding block's
addressing fields; a message `name` and its `payload` ref; a state, its
`type: final`, and a transition's event and target.

Metadata — bump `version`, no swap: `title`, `summary`, `note`, `condition`,
`when`, `while`, `role`, `tags`, `description`, prose, and step order within a
workflow.

Adding a participant, a workflow file, a step, a surface entry, a state, or a
transition is additive and always legal. Every change in either category bumps
the entity's `version`, including a change to a single artifact file.

## Finish

Every run that writes files ends here:

```bash
metaframework check
```

Zero **error** diagnostics is the pass condition, and `metaframework check` exits
non-zero when there are any. It locates the catalog by walking up from the working
directory to the nearest `solutions/`, so it runs from anywhere inside a
catalog-only repository — no framework checkout involved. Report pass/fail and
every diagnostic with its code and file. `E_PROTO_*` and `W_PROTO_*` codes are
documented at the end of `framework/spec/kinds/protocol.md`, and — for an
installed plugin that cannot see it — in one table at the end of
`${CLAUDE_PLUGIN_ROOT}/skills/_shared/references/protocols.md`, as well as beside
the rule each one guards in `references/artifacts.md`. The check runs the
protocol validators over the tree — the artifact composition parses every
present `workflows/*.yaml` and `states.json`, so `E_PROTO_*` and `W_PROTO_*`
findings fail the run like any loader code (the one deliberate gap is
`W_PROTO_STATES_EVENT_UNKNOWN`, which nothing emits). Opening the page —
`metaframework` serves on 6363 — shows the same findings drawn as the sequence
diagram and state chart. If a diagnostic demands removing,
renaming, narrowing or moving an entity, that is not a fix — stop and say it
requires a swap.
