# Getting started

From an empty directory to a described solution you can navigate in the portal.

This is the long way round, by hand, so that nothing is magic. You will write six
entities — a solution, a product, two components, a data model and a protocol —
and the artifacts that carry their substance: a real `schema.json`, a
`transport.yaml`, and a workflow the portal compiles into a sequence diagram. At
the end you will run the checker, break the catalog on purpose, and watch the
version rule bite.

Nothing here requires reading [the specification](../framework/spec) first. When
you want the rule behind a step rather than the step, the links point at it.

**About the transcripts.** Every command below was run, in order, against the
release this guide ships with, and every block of output is what it printed. Two
things are elided with `…`: the absolute path of wherever you put the repository,
and the version on the portal's banner line. Nothing else is edited.

**If a `$schema:` line is rejected.** The dialect header that steps 7 and 8 put
at the top of `transport.yaml` and `workflows/*.yaml` is a recent addition. If
the check answers `E_PROTO_WF_SCHEMA: Unrecognized key: "$schema"`, you are on an
older release — `npm install -g @bershadsky/metaframework@latest`, then run it
again.

## Contents

| Step                                                               | You get                                                |
|--------------------------------------------------------------------|--------------------------------------------------------|
| [1. Install](#1-install)                                           | The `metaframework` command.                           |
| [2. A repository and a solution](#2-a-repository-and-a-solution)   | The smallest catalog that loads.                       |
| [3. The check loop](#3-the-check-loop)                             | The one command you will run constantly.               |
| [4. A product](#4-a-product)                                       | The ownership line above components.                   |
| [5. Two components](#5-two-components)                             | The first real error, and why it is correct.           |
| [6. A data model](#6-a-data-model)                                 | A `schema.json` that is the type, not a picture of it. |
| [7. A protocol](#7-a-protocol)                                     | Participants, a transport, and the dialect header.     |
| [8. A workflow](#8-a-workflow)                                     | A sequence diagram nobody drew.                        |
| [9. Commit](#9-commit)                                             | History, which the portal reads from git.              |
| [10. Run the portal](#10-run-the-portal)                           | Every page, and the URLs the SRNs project onto.        |
| [11. Change something](#11-change-something)                       | `E_VER_UNBUMPED`, and the rule behind it.              |
| [12. Read the checker](#12-read-the-checker)                       | Three classic mistakes — and what it does *not* check. |
| [13. Let the authoring kit do it](#13-let-the-authoring-kit-do-it) | The same work as an interview, in Claude Code.         |
| [14. Where to go next](#14-where-to-go-next)                       | The spec, in reading order.                            |

## 1. Install

```bash
npm install -g @bershadsky/metaframework
metaframework --version
```

The package declares `"engines": { "node": ">=20.9.0" }` and pulls in no
dependencies — the tarball carries a compiled server, so npm reports `added 1
package` and there is no tree to audit.

Prefer not to install it? `npx @bershadsky/metaframework check` works the same
way everywhere below; the command is just longer.

## 2. A repository and a solution

The portal reads a directory called `solutions/`, and git is where history comes
from, so start with a repository:

```bash
mkdir -p ~/code/shortlink && cd ~/code/shortlink
git init
```

Run the tool now, before there is anything to read, because the error is the
first half of the documentation:

```text
$ metaframework check
metaframework: no solutions/ directory found.

Looked for a `solutions` directory holding at least one <name>/index.md,
starting in the working directory and walking up:
  …/shortlink/solutions
  …/solutions
  …

If you already have a catalog elsewhere, name it:
  metaframework --dir <path>          (or CATALOG_DIR=<path>)
```

It goes on to offer two routes out: the authoring kit, which is
[step 13](#13-let-the-authoring-kit-do-it), and the one-file manual route, which
is this one.

A **solution** is a sealed universe: everything it describes lives under it, and
no reference ever crosses out of it. It is a directory with an `index.md`, and
that file is the whole of the smallest catalog that loads.

`solutions/shortlink/index.md`:

```markdown
---
name: shortlink
kind: solution
version: 1
title: Shortlink
summary: A URL shortener — one product, a web client and an API, described as a catalog.
status: draft
owner: you
vision: >
  Anyone can turn a long URL into a short one that keeps working, and see how
  often it was followed.
scope:
  in:
    - Creating and resolving short links
    - Counting follows
  out:
    - Analytics dashboards
    - Custom domains
---

Shortlink is the smallest solution that still has two components talking to each
other, which is the point at which a catalog starts earning its keep.

## Why it is described here

The description is the contract: the API's shape, the data it stores and the
conversation between the client and the server all live in this tree, and the
portal derives every diagram from them.
```

Six of those frontmatter fields are on **every** entity in the catalog, whatever
its kind, and they are worth learning once:

| Field     | What it is                                                                                          |
|-----------|-----------------------------------------------------------------------------------------------------|
| `name`    | Must equal the directory name. The path is the identity, so the file may not disagree with it.      |
| `kind`    | Must equal the bucket the directory sits in. `solution` is the only kind with no bucket above it.   |
| `version` | An integer, bumped by exactly 1 on every content change. See [step 11](#11-change-something).       |
| `title`   | The page's heading. The prose below never repeats it as an `#` heading — start at `##`.             |
| `summary` | One line, no markdown. This is what every list, card and search result shows.                       |
| `status`  | `draft` → `review` → `approved` → `deprecated`. The review state of **the document**, nothing else. |

`vision` and `scope` are the solution kind's own fields. Every kind adds a few of
its own on top of the six, and using another kind's field is an error rather than
a harmless extra — the contract is a discriminated union on `kind`, not a bag.

## 3. The check loop

```text
$ metaframework check
catalog  …/shortlink/solutions

catalog is valid — 1 entity across 1 solution.
```

That is the loop. `metaframework check` runs the portal's own loader over the
tree, prints every complaint with its code and its file, and exits `1` when any
of them is an error. Warnings exit `0` — a warning is a catalog that will drift,
an error is a catalog that contradicts the specification.

It is also the CI gate; there is no second implementation to keep in step:

```yaml
- run: npx @bershadsky/metaframework check --since origin/main
```

Run it after every step below. The rest of this guide assumes you do.

## 4. A product

Below the solution the tree strictly alternates **kind bucket** and **entity
name**: `product/links/`, then inside it `component/api/`. The bucket says what
kind the thing is, at every level, so nothing is ever inferred from depth. The
eleven bucket words — `product`, `component`, `datamodel`, `protocol`, `actor`,
`environment`, `adr`, `requirement`, `capability`, `journey`, `metric` — are
reserved, and no entity may be named after one.

A **product** is the ownership and funding line: the thing that is budgeted,
staffed and shipped as one. It lives in the solution's `product/` bucket and
nowhere else.

`solutions/shortlink/product/links/index.md`:

```markdown
---
name: links
kind: product
version: 1
title: Links
summary: Create short links, resolve them, and count how often they are followed.
status: draft
owner: you
lifecycle: incubating
---

The whole of Shortlink today: a browser client and the service behind it. It is
one product because it is funded and shipped as one thing, not because it is one
process.
```

`lifecycle` is the product kind's required field, and it is **not** `status` in
different clothes. `status` is the review state of the document you are reading;
`lifecycle` is the real-world stage of the thing described. They move
independently, and every combination is legal — `status: approved` with
`lifecycle: planned` is the design-first normal case this whole framework exists
to make possible.

## 5. Two components

A **component** is the unit that ships, versions, fails, and could be owned by a
team. Components live in a `component/` bucket inside a product or inside another
component, and never directly under the solution.

`solutions/shortlink/product/links/component/web/index.md`:

```markdown
---
name: web
kind: component
version: 1
title: Web client
summary: Single-page client where a visitor pastes a URL and gets a short one back.
status: draft
owner: you
component-type: ui
lifecycle: planned
relations:
  uses:
    - /product/links/protocol/link-api
  depends-on:
    - /product/links/component/api
---

The only surface a visitor sees. It holds no state of its own: every short link
it shows was created by the API and is re-read from it.
```

`solutions/shortlink/product/links/component/api/index.md`:

```markdown
---
name: api
kind: component
version: 1
title: Link API
summary: HTTP service that mints short codes, resolves them, and records follows.
status: draft
owner: you
component-type: service
criticality: 2
lifecycle: planned
relations:
  exposes:
    - /product/links/protocol/link-api
  uses:
    - /product/links/datamodel/link
---

Owns the short-code namespace. A code is minted once and never reissued, which is
why the API is the only writer.
```

`relations` is the semantic graph. Edges are **typed**, **forward-only**, and
written as solution-absolute references — a leading `/` means "from the solution
root", which is shorter and more stable than a chain of `..`:

| Edge         | Points at                                    | Says                                                 |
|--------------|----------------------------------------------|------------------------------------------------------|
| `uses`       | datamodel, protocol, environment, component  | This consumes that — the client side.                |
| `exposes`    | protocol, datamodel                          | This offers that as its surface — the provider side. |
| `depends-on` | component, product                           | Structural dependency, coarser than `uses`.          |
| `implements` | requirement                                  | This satisfies that obligation.                      |
| `realizes`   | capability                                   | This is part of how the business does that thing.    |
| `measures`   | capability, component, protocol, requirement | Authored only by a metric.                           |
| `supersedes` | the same kind as the source                  | The swap edge: successor points at predecessor.      |

You never write the other direction. `used-by`, `exposed-by`, `realized-by` and
the rest are derived at load and rendered on the target's page; authoring both
directions is double bookkeeping that drifts, so an authored inverse is an error.

Now check:

```text
$ metaframework check
catalog  …/shortlink/solutions

error   E_SRN_DANGLING  shortlink/product/links/component/api/index.md
        "/product/links/protocol/link-api" resolves to srn://shortlink/product/links/protocol/link-api, which does not exist
error   E_SRN_DANGLING  shortlink/product/links/component/api/index.md
        "/product/links/datamodel/link" resolves to srn://shortlink/product/links/datamodel/link, which does not exist
error   E_SRN_DANGLING  shortlink/product/links/component/web/index.md
        "/product/links/protocol/link-api" resolves to srn://shortlink/product/links/protocol/link-api, which does not exist

3 errors, 0 warnings — 4 entities across 1 solution.
```

Three errors, and all three are correct. You have promised two things that do not
exist yet. The next two steps create them.

## 6. A data model

A **datamodel** is a directory holding `index.md` and a `schema.json`. The schema
is not a picture of a type — it *is* the type: a real JSON Schema 2020-12
document with a dereferenceable `$id`, so a codebase downstream can `$ref` it,
generate from it and validate against it.

Put it on the product rather than inside `api`, because both components speak in
terms of it.

`solutions/shortlink/product/links/datamodel/link/index.md`:

```markdown
---
name: link
kind: datamodel
version: 1
title: Link
summary: One short code, the URL it points at, and the follow count behind it.
status: draft
owner: you
usage: both
---

The record the API stores and the shape it returns. It is `usage: both` because
the same fields go over the wire and into the database — a distinction worth
keeping only when the two genuinely differ.

## Invariants the schema cannot express

`code` is minted once and never reissued, even after a link is deleted, so an old
short URL can never resolve to somebody else's target.
```

`solutions/shortlink/product/links/datamodel/link/schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schemas.metaframework.dev/shortlink/product/links/datamodel/link",
  "x-srn": "srn://shortlink/product/links/datamodel/link",
  "title": "Link",
  "description": "A short code and the URL it resolves to.",
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "pattern": "^[a-zA-Z0-9]{7}$",
      "description": "The short code as it appears in the URL. Seven characters, minted once."
    },
    "target": {
      "type": "string",
      "format": "uri",
      "description": "Absolute URL the code resolves to. Never relative."
    },
    "created-at": {
      "type": "string",
      "format": "date-time",
      "description": "When the code was minted."
    },
    "follows": {
      "type": "integer",
      "minimum": 0,
      "description": "How many times the code has been resolved."
    }
  },
  "required": [
    "code",
    "target",
    "created-at"
  ]
}
```

Three lines at the top are contract rather than decoration, and the checker holds
you to all three:

- **`$schema`** must be exactly the 2020-12 dialect URI. A schema that does not
  say which JSON Schema it is written in is `E_DM_DIALECT`.
- **`$id`** is the entity's canonical schema URL: the constant host
  `https://schemas.metaframework.dev`, then the SRN path verbatim. It is not
  configuration and it does not vary between your laptop and production — it is
  identity. Getting it wrong is `E_DM_ID_MISMATCH`, and the message prints the
  URL it should have been.
- **`x-srn`** states the same identity in the catalog's own vocabulary, so
  `grep -r x-srn` finds every schema by SRN. Unversioned, always.

One entity, three spellings of one name, all mechanically inter-convertible:

```text
identity    srn://shortlink/product/links/datamodel/link
storage     solutions/shortlink/product/links/datamodel/link/
projection  https://schemas.metaframework.dev/shortlink/product/links/datamodel/link
```

`usage` is the datamodel kind's required field: `storage`, `exchange`, `both`, or
`config` for a model whose instance is one process environment.

## 7. A protocol

A **protocol** is a conversation. It declares who talks (`participants`), in what
shape (`style`), and it owns the artifacts that say how: `transport.yaml` for the
wire, `workflows/*.yaml` for the exchanges, `states.json` for the state machine.

Where the directory goes is not a preference. **A protocol lives at the nearest
common ancestor of its component and product participants.** `web` and `api` are
both inside `product/links`, so the protocol sits on the product.

`solutions/shortlink/product/links/protocol/link-api/index.md`:

```markdown
---
name: link-api
kind: protocol
version: 1
title: Link API
summary: The HTTP conversation between the web client and the API — mint a code, resolve a code.
status: draft
owner: you
style: request-response
participants:
  - alias: web
    ref: /product/links/component/web
    role: client
  - alias: api
    ref: /product/links/component/api
    role: server
---

Everything the web client is allowed to ask the API, and nothing else. The
directory sits on the product because the product is the nearest common ancestor
of the two participants.

## Errors are part of the contract

A code that does not exist answers 404 with no body. The client treats that as a
normal outcome, not as a failure of the call.
```

A protocol needs at least two participants, and each `alias` is the short name
its workflows use as a lifeline. `style` is one of `point-to-point`, `bus` or
`request-response`.

`solutions/shortlink/product/links/protocol/link-api/transport.yaml`, one line
short of finished on purpose:

```yaml
kind: http
summary: JSON over HTTPS, no authentication — the API is public by design.
encoding: json
http:
  base-path: /api/v1
  tls: true
  operations:
    - name: create-link
      method: POST
      path: /links
      request: /product/links/datamodel/link
      response: /product/links/datamodel/link
      summary: Mint a code for a target URL.
    - name: resolve-link
      method: GET
      path: /links/{code}
      response: /product/links/datamodel/link
      summary: Look up the target a code points at.
```

`kind` names the wire — `http`, `grpc`, `amqp`, `kafka`, `websocket` or
`in-process` — and the block keyed by exactly that word carries its binding. One
transport per protocol: a service offered over two wires is two protocol
entities.

### The dialect header

Check now, and you get a warning you have not seen yet:

```text
warning W_ARTIFACT_DIALECT  shortlink/product/links/protocol/link-api/transport.yaml
        transport.yaml declares no dialect — read as the legacy dialect; add `$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document`
```

This is worth understanding rather than just obeying, because it is the shape of
how this framework standardizes anything.

A **role** is an address and a filename — `.transport` means *the transport
artifact of this protocol*, and it maps to `transport.yaml` through a table fixed
in the specification. A **dialect** is the grammar the bytes inside are written
in. Those are deliberately separate: `transport.yaml` may hold the framework's
own mini-spec (what you just wrote) **or** an AsyncAPI 3.x document, on the wires
AsyncAPI describes — and either way it is still the same file at the same
address, so a payload can standardize without a single reference moving.

Which of the two a reader is holding cannot be guessed from the keys present, so
the file says. Where a format already names itself, its own key is used
(`asyncapi:`, `openapi:`); where none exists, the framework's `$schema` names a
meta-schema. Paste the line the warning gives you as the first line of the file:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/transport-document
kind: http
# … the rest of the file unchanged
```

A file that declares nothing is still parsed, still rendered and still checked —
the class is a warning and always will be. Nothing about this rule can make a
catalog that loads today stop loading.

## 8. A workflow

`solutions/shortlink/product/links/protocol/link-api/workflows/create-link.yaml`:

```yaml
$schema: https://schemas.metaframework.dev/metaframework/product/specification/datamodel/workflow-document
name: create-link
title: Create a short link
summary: A visitor pastes a URL in the client and gets a short one back.
participants: [web, api]
steps:
  - message: create-link
    from: web
    to: api
    channel: POST /api/v1/links
    payload: /product/links/datamodel/link
  - alt:
      - when: the target has never been shortened
        steps:
          - message: code-minted
            from: api
            to: web
            kind: return
            payload: /product/links/datamodel/link
      - when: the target already has a code
        steps:
          - message: existing-code
            from: api
            to: web
            kind: return
            note: The same target never gets a second code.
```

That is the whole diagram source. `name` must equal the filename stem, `from` and
`to` are participant aliases, and a step carries exactly one of `message`, `alt`,
`opt` or `loop`. `alt` needs at least two compartments — one branch that might be
skipped is an `opt`, and the two mean different things.

The workflow grammar **is** enforced, unlike the transport body
([step 12](#12-read-the-checker)). Mistype an alias and you get told:

```text
error   E_PROTO_WF_ALIAS  shortlink/product/links/protocol/link-api/workflows/create-link.yaml
        steps[0].to[0]: alias "nobody" is not declared by the protocol
```

With both headers in place the tree is clean:

```text
$ metaframework check
catalog  …/shortlink/solutions

catalog is valid — 6 entities across 1 solution.
```

## 9. Commit

History is git. Nothing else stores it, and the portal reads an older version by
rebuilding it from the commit that carried it — so an uncommitted entity has no
past, and says so.

```bash
git add -A
git commit -m "shortlink: product, components, datamodel, protocol"
```

## 10. Run the portal

```bash
metaframework
```

It binds `127.0.0.1:6363` — loopback, because a catalog is somebody's unreleased
design work and there is no authentication in front of it. If the port is taken
it says so and tells you to pass `--port`; the transcript below was captured that
way, and is otherwise verbatim:

```text
$ metaframework --port 6364

  metaframework …

  catalog    …/shortlink/solutions
  solutions  1
  entities   6
  url        http://127.0.0.1:6364

  Watching the catalog — the open page reloads itself. Ctrl-C to stop.
```

Leave it running and edit a file. The server re-reads the tree and pushes the
change to the open page, which re-renders in place — scroll position, filters and
open panels survive it.

What to look at, and what is derived rather than authored:

| Page                                                 | What it shows                                                                                                                                                      |
|------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/`                                                  | Every solution, with per-kind counts computed from the tree.                                                                                                       |
| `/catalog/shortlink/product/links/protocol/link-api` | Participants, the transport card, the **sequence diagram compiled from `create-link.yaml`** (`alt` compartments included), and a derived `Exposed by` / `Used by`. |
| `/catalog/shortlink/product/links/datamodel/link`    | The rendered schema beside its source, plus composition lineage when a schema uses `allOf`.                                                                        |
| `/catalog/shortlink/product/links/component/api`     | The entity, its outgoing `Exposes` / `Uses`, and a derived `Depended on by` pointing back at `web` — which nobody wrote.                                           |
| `/map/shortlink`                                     | Products and components only, re-centred on whatever you click. Distance is drawn as recession.                                                                    |
| `/diagnostics`                                       | The same list `metaframework check` prints, rendered.                                                                                                              |

Two of those pages exist to prove a claim rather than to be browsed. The
identity you wrote into `schema.json` resolves:

```bash
curl http://127.0.0.1:6364/schemas/shortlink/product/links/datamodel/link
```

and so does the artifact address of a file that is not a schema — the SRN path,
dot suffix and all, is the URL path:

```bash
curl http://127.0.0.1:6364/artifacts/shortlink/product/links/protocol/link-api.transport
curl http://127.0.0.1:6364/artifacts/shortlink/product/links/protocol/link-api.workflows.create-link
```

`srn://…/link-api.transport` → `transport.yaml`. `srn://…/link-api.workflows.create-link`
→ `workflows/create-link.yaml`. The role table does that conversion, and only the
role table: no directory listing, no frontmatter read.

## 11. Change something

Add an expiry to the link schema — a new optional property, which is an additive
change and therefore legal in place:

```json
    "expires-at": {
      "type": "string",
      "format": "date-time",
      "description": "After this instant the code stops resolving. Absent means it never expires."
    }
```

Now ask the checker whether the change followed the rule:

```text
$ metaframework check --since HEAD
catalog  …/shortlink/solutions

catalog is valid — 6 entities across 1 solution.

error   E_VER_UNBUMPED  1 of 1 changed entities
        solutions/shortlink/product/links/datamodel/link — still version 1, but these changed since HEAD:
          solutions/shortlink/product/links/datamodel/link/schema.json

Every content change bumps `version`; only a commit touching `status:` alone is exempt.
Without the bump, one version number names two different files, and a reference
pinned to it resolves to whichever the index recorded rather than to what is on disk.
```

The catalog is *valid* and the change is *illegal*, and those are two different
questions — which is why `--since` is a separate, clearly labelled verdict rather
than another diagnostic. Validity is decidable from the files on disk; this needs
two trees.

Bump `version: 1` to `version: 2` in the datamodel's `index.md` — the bump is per
**entity**, not per file, so one bump covers every artifact you touched in it —
and ask again:

```text
$ metaframework check --since HEAD
catalog  …/shortlink/solutions

catalog is valid — 6 entities across 1 solution.

since    HEAD — 1 entity changed, each either bumped its version or changed only its status.
```

`--since origin/main` is the form CI wants. Outside a git repository the gate
says so and declines to run rather than failing you for it.

The reason the rule is this strict is that **evolution is additive-only**. A
version number is a coordinate other people pin references to, so it must name
exactly one set of bytes forever. You may add an optional property, add an enum
value, relax a constraint, add a whole entity. You may not remove a field, rename
one, narrow an enum, make an optional field required, or move a directory — every
one of those breaks somebody holding a reference. When you genuinely need one,
the move is a **swap**: create the new entity, point it at the old one with
`supersedes`, migrate the referrers, and mark the old one `status: deprecated`.
Nothing is ever deleted.

Commit the bump, restart the portal, and the entity's **History** section now
offers both revisions, each rebuilt from the commit that carried it.

## 12. Read the checker

Three mistakes almost everybody makes once, with what they actually print.

**A component directly under the solution.** Placement is grammar, not
convention: a path that violates it has no SRN at all, so the complaint arrives
while the directory is being read.

```text
error   E_SRN_PLACEMENT  shortlink/component/stray
        E_SRN_PLACEMENT: a component must live inside a product (srn://shortlink/component/stray)
```

**`kind` disagreeing with the bucket.** The bucket is the truth; the file is
checked against it by string comparison.

```text
error   E_FM_KIND_LOCATION  shortlink/product/links/component/web/index.md
        kind "product" contradicts disk position (expected "component")
```

**A hand-written `$id`.** Copy a schema, forget to fix the URL, and the message
hands you the right one:

```text
error   E_DM_ID_MISMATCH  shortlink/product/links/datamodel/link/schema.json
        $id is "https://schemas.metaframework.dev/shortlink/datamodel/link" but this entity's canonical schema URL is https://schemas.metaframework.dev/shortlink/product/links/datamodel/link
```

Codes are prefixed by what they are about: `E_SRN_*` identity and placement,
`E_FM_*` frontmatter, `E_STRUCT_*` layout, `E_DM_*` data models, `E_PROTO_*`
protocols, `E_JRN_*` journeys, `E_ENV_*` environments, `E_VER_*` the version
gate. A `W_` is the same vocabulary at warning severity.

### What it does not check yet

This matters more than the list of what it does, because a checker you trust for
the wrong things is worse than none. Several rules the specification states have
**no enforcement in the portal today**, and the largest group is the protocol
kind's:

- **`transport.yaml`'s body is parsed and never validated.** An unknown
  top-level key, a binding block that does not match `kind`, a surface list
  sitting beside a `spec:` link — all specified, none reported. Try adding
  `bogus-key: what` to yours: the check stays green.
- **Payload references are not kind-checked or resolved.** A workflow step whose
  `payload:` points at a datamodel that does not exist raises nothing. `relations`
  edges *are* resolved — that is the `E_SRN_DANGLING` from step 5 — but this
  surface is not.
- **`participants` is read four ways and judged none of them.** Duplicate
  aliases, a participant that is not a component, and a participant list that
  disagrees with the `exposes`/`uses` edges are all specified and all silent.
- **`E_DM_NOT_ADDITIVE` is not enforced.** Nothing compares your `schema.json`
  against its previous version, so a *removed* property passes the check. The
  additive rule in step 11 is real, and today it is on you and your reviewer.

The workflow mini-spec, frontmatter, SRN resolution, placement, schemas, journeys
and environments *are* enforced. When in doubt, the honest test is the one you
just ran: break it on purpose in a scratch copy and see whether anything says so.

## 13. Let the authoring kit do it

Everything above is hand-work, and hand-work is the right way to learn the shape
once. After that, the **authoring kit** is a Claude Code plugin that interviews
you, proposes an SRN tree, and writes the catalog once you have agreed to it. It
ships the distilled specification with it, so the rules travel with the plugin
and it works in a repository that has no copy of `framework/spec`.

```text
# in Claude Code, from the repository the catalog should live in
/plugin marketplace add sergio-bershadsky/metaframework
/plugin install metaframework@metaframework
```

Three commands, each of which routes to the skill that owns the procedure:

| Command          | For                                                                                  |
|------------------|--------------------------------------------------------------------------------------|
| `/solution-new`  | A whole tree from a description — the interview, the decomposition, the review gate. |
| `/entity-new`    | One entity, routed by kind to the skill that owns its contract.                      |
| `/catalog-check` | Run the check and interpret it — cause and fix per code, and what the check misses.  |

The skills behind them are also invocable directly, and they split by activity
rather than by kind:

| Skill              | Owns                                                                                          |
|--------------------|-----------------------------------------------------------------------------------------------|
| `solution-design`  | Everything before a file is written: capabilities first, then the decomposition and the tree. |
| `add-entity`       | The ten mechanical kinds — placement, frontmatter, relation wiring, the prose each kind owes. |
| `model-data`       | Datamodels: `schema.json`, canonical `$id`, `allOf` composition, config contracts.            |
| `protocol-design`  | Protocols: participants and aliases, `transport.yaml` in either dialect, workflows, states.   |
| `evolve-entity`    | Changing something published — decides additive-in-place versus the swap, then does it.       |
| `validate-catalog` | Running and reading the check; the code → cause → fix table.                                  |
| `review-solution`  | The question the checker cannot answer: is this a *good* description of this system?          |

There is also a `catalog-reviewer` agent for a full pass over a tree.

## 14. Where to go next

You now have a catalog with six entities, a green check, a derived sequence
diagram and one version bump. What it does not have yet: an **actor** (who uses
this), an **environment** (where it runs, with `topology.yaml` and `config.yaml`),
an **adr** (why it is shaped this way), a **requirement** (what it must do), a
**capability**, a **journey**, and a **metric**. All seven are the same shape of
work as steps 4–8 — a directory, an `index.md`, sometimes an artifact.

The specification is [`framework/spec/`](../framework/spec), and it is written in
the framework's own format. Its own reading order:

1. [`structure.md`](../framework/spec/structure.md) — where everything lives on
   disk: buckets, entity directories, the artifact role table, dialects.
2. [`srn.md`](../framework/spec/srn.md) — how everything is named and referenced.
3. [`frontmatter.md`](../framework/spec/frontmatter.md) — what every entity
   declares.
4. [`evolution.md`](../framework/spec/evolution.md) — how anything is allowed to
   change.
5. The kind documents in [`framework/spec/kinds/`](../framework/spec/kinds), one
   per kind.

An author adding a single entity can read structure, frontmatter and the one kind
document, and treat `srn.md` as reference material.

For the tool itself — every flag, what it does when the platform cannot watch a
tree, and what it deliberately does not do — see the
[package README](../framework/portal/README.md). For why the framework is shaped
the way it is, [`docs/decision-record.md`](decision-record.md) is the founding
contract, and the ADRs under
[`solutions/metaframework/adr/`](../solutions/metaframework/adr) are the running
argument.
