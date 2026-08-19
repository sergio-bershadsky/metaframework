---
kind: spec
name: srn
version: 2
status: review
title: SRN — Solution Resource Name
summary: The complete SRN grammar — bucketed syntax, the pair-walk parsing algorithm, placement as grammar, disk resolution, version semantics, relative references, usage contexts, and validation rules.
---

# SRN — Solution Resource Name

The SRN is the single identity and reference syntax of the framework. Every
entity has exactly one SRN; the SRN maps 1:1 to the entity's directory under
`solutions/`; and the same syntax is used in frontmatter, workflow YAML, and
prose. There is no second addressing scheme for catalog references.

One artifact is deliberately outside this rule: `schema.json` uses relative file
paths so that standard JSON Schema tooling can consume it unaided
([below](#json-schema-is-the-one-exception)). Its identity is still its
entity's SRN — derived from its path rather than written into the file.

Every entity below the solution lives in a **kind bucket**, so an SRN path is a
strict alternation of bucket and name:

```text
srn://{solution}( /{kind}/{name} )*  [@{version}]
```

```text
srn://acme                                                    # solution
srn://acme/product/shop                                       # product
srn://acme/product/shop/component/checkout                    # component
srn://acme/product/shop/component/checkout/component/payment  # sub-component
srn://acme/product/shop/component/checkout/datamodel/cart@1   # component-owned datamodel
srn://acme/product/shop/protocol/order-placement@2            # product-level protocol
srn://acme/actor/customer                                     # solution-level actor
srn://acme/datamodel/money@1                                  # solution-level datamodel
```

## Why buckets

An earlier revision of this grammar wrote a container path bare
(`srn://acme/shop/checkout/payment/datamodel/order`). Three problems followed
from that, and the bucket alternation removes all three.

1. **A solution's children were a mixed bag.** `shop` (a product) sat beside
   `datamodel` and `actor` (buckets), and nothing in the path said which was
   which. Telling them apart required knowing the reserved-word list by heart.
   Now every child of every directory is a bucket:

   ```bash
   $ ls -d solutions/acme/*/          # buckets only, at every level
   actor  adr  datamodel  environment  product  protocol  requirement
   ```

2. **Product vs. component was inferred from depth.** The first container
   segment was a product, deeper ones components — so an entity's kind was a
   property of where it sat, not of what it said. Now the kind is stated at
   every level, and `kindFromPosition()` in the portal loader is one expression:
   the kind the path already names.

3. **Parsing needed lookahead.** The old algorithm scanned the remaining
   segments for the first reserved keyword, then re-interpreted everything
   before it. The new one is a pair walk: read two segments, emit a segment,
   repeat. No lookahead, no reserved-word scan, no backtracking. Placement moved
   into the same walk, so a misplaced entity now fails to *parse* rather than
   failing a separate loader check ([below](#placement-is-grammar)).

The cost is length: the same datamodel is 9 segments instead of 6.

```text
before  srn://acme/shop/checkout/payment/datamodel/order
after   srn://acme/product/shop/component/checkout/component/payment/datamodel/order
```

That cost is paid in **relative** references, where deep `../../../..` chains
became both longer and easier to miscount, which is why solution-absolute
references are now the recommended form for anything outside the current entity
([below](#relative-references)).

## Syntax

Character-level grammar and placement in one ABNF (RFC 5234). The alternation of
`kind` and `name` is structural, so the grammar — not a downstream check —
decides what may own what:

```abnf
srn           = "srn://" solution [ owned ] [ "@" version ]

solution      = segment
name          = segment

; What a solution may own directly. Only a product opens a body.
owned         = "/" ( "product"      "/" name [ body ]
                    / solution-kind  "/" name
                    / scoped-kind    "/" name )

; What a product or a component may own. Components recurse; nothing else does.
body          = "/" ( "component"    "/" name [ body ]
                    / scoped-kind    "/" name )

solution-kind = "actor" / "environment"           ; describe the whole solution
scoped-kind   = "datamodel" / "protocol" / "adr" / "requirement"

segment       = word *( "-" word )                ; kebab-case, 1–64 chars total
word          = 1*( lower / digit )
version       = nzdigit *digit                    ; positive integer, no leading zeros

lower         = %x61-7A                           ; a-z
digit         = %x30-39                           ; 0-9
nzdigit       = %x31-39                           ; 1-9
```

Constraints beyond the ABNF:

- A reserved kind keyword MUST NOT be used as a `solution` or a `name`
  (`E_SRN_RESERVED`, [below](#reserved-kinds)). ABNF cannot express "any
  segment except these eight literals" without unreadable noise, so the rule is
  stated rather than encoded.
- The `@version` suffix MAY appear only on the **final** segment.
  `srn://acme/product/shop@2/component/checkout` is `E_SRN_SYNTAX`.
- No trailing slash, no query string, no fragment, no percent-encoding, no
  uppercase, no empty segments. `srn://acme//product/shop`,
  `srn://acme/product/shop/`, `srn://acme/product/Shop` are all `E_SRN_SYNTAX`.
- In RFC 3986 terms, `srn` is a hierarchical scheme in which the **solution
  occupies the authority position** and everything after it is the path. This
  is deliberate: relative references (below) can therefore never leave the
  solution — sealed universes fall out of the URI grammar itself.

A reference that does not match is classified by **where** it fails, because one
"does not match the ABNF" tells an author nothing:

| Failure                                                          | Error class       |
| ---------------------------------------------------------------- | ----------------- |
| Bad characters, wrong segment count, a word that is not a bucket | `E_SRN_SYNTAX`    |
| A reserved keyword standing in a `solution` or `name` position   | `E_SRN_RESERVED`  |
| Well-formed pairs arranged illegally (a product under a product) | `E_SRN_PLACEMENT` |

## Reserved kinds

There are **eight** kind buckets, and they are the only words that may stand in
a `kind` position:

```text
product  component  datamodel  protocol  actor  environment  adr  requirement
```

They MUST NOT be used as a solution or entity **name** (`E_SRN_RESERVED`) — they
may appear in an SRN only in a kind position. This keeps the pair walk
unambiguous and keeps `grep 'srn://.*/datamodel/'` meaningful.

```text
srn://acme/product/shop/datamodel/order-line   # legal — every odd segment is a bucket
srn://protocol/product/shop                    # ILLEGAL — solution named "protocol"
srn://acme/product/shop/adr/adr                # ILLEGAL — entity named "adr"
srn://acme/product/component                   # ILLEGAL — entity named "component"
```

Two of the eight are **containers** — they may own further entities:

```text
product  component
```

The other six are leaves. `actor` and `environment` are additionally
**solution-level**: they describe the solution as a whole and may only be the
first pair. Both facts are enforced by the grammar, not by convention
([below](#placement-is-grammar)).

## Parsing algorithm

Segment 1 (the authority) is the solution. Everything after it is walked **two
segments at a time**: the first of each pair is the kind, the second is the
name. An odd number of remaining segments is `E_SRN_SYNTAX` — a bucket on its
own is not addressable, because a bucket is a directory, not an entity. The kind
of the SRN is the kind of the last pair; a solution SRN has no pairs and no
kind.

Reference implementation (normative for behavior, not for code style). It is a
line-for-line port of `framework/portal/src/lib/srn/srn.ts`, which is the
executable copy:

```python
import re

RESERVED_KINDS  = {"product", "component", "datamodel", "protocol",
                   "actor", "environment", "adr", "requirement"}
CONTAINER_KINDS = {"product", "component"}          # may own further entities
SOLUTION_KINDS  = {"actor", "environment"}          # may only be the first pair

SEGMENT = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
VERSION = re.compile(r"[1-9][0-9]*")

def parse_srn(ref: str) -> Srn:
    if not isinstance(ref, str) or not ref.startswith("srn://"):
        raise SrnError("E_SRN_SYNTAX", "missing srn:// scheme")
    if any(c in ref for c in "?#%"):
        raise SrnError("E_SRN_SYNTAX", "query, fragment and percent-encoding "
                                       "are not allowed")

    body, version = split_version(ref[len("srn://"):])
    if not body:
        raise SrnError("E_SRN_SYNTAX", "empty SRN")

    segments = body.split("/")
    for s in segments:
        if not SEGMENT.fullmatch(s) or len(s) > 64:
            raise SrnError("E_SRN_SYNTAX", f'bad segment "{s}"')

    solution, rest = segments[0], segments[1:]
    if solution in RESERVED_KINDS:
        raise SrnError("E_SRN_RESERVED",
                       f'reserved keyword "{solution}" as solution name')

    # An odd tail is a bucket with nothing in it; buckets are not addressable.
    if len(rest) % 2 != 0:
        raise SrnError("E_SRN_SYNTAX",
                       "kind bucket is not addressable — a name must follow the kind"
                       if rest[-1] in RESERVED_KINDS else
                       "path must alternate {kind}/{name}")

    path = []
    for kind, name in zip(rest[0::2], rest[1::2]):
        if kind not in RESERVED_KINDS:
            raise SrnError("E_SRN_SYNTAX", f'"{kind}" is not a kind bucket')
        if name in RESERVED_KINDS:
            raise SrnError("E_SRN_RESERVED",
                           f'reserved keyword "{name}" as entity name')
        path.append(Segment(kind, name))

    assert_placement(path)

    last = path[-1] if path else None
    return Srn(solution, path,
               last.kind if last else None,
               last.name if last else None,
               version)


def split_version(body: str):
    """`@version` may pin only the entity the SRN addresses — the final name."""
    head, at, raw = body.rpartition("@")
    if not at:
        return body, None
    if "/" in raw or not VERSION.fullmatch(raw):
        raise SrnError("E_SRN_SYNTAX",
                       "@version must be a positive integer on the final segment")
    if "@" in head:
        raise SrnError("E_SRN_SYNTAX", "multiple @version suffixes")
    return head, int(raw)


def assert_placement(path):
    """Ownership is positional, so it is decided here rather than by the loader:
    a product hangs off the solution, a component off a product or component,
    actors and environments describe the solution as a whole, and a leaf kind
    owns nothing at all."""
    for index, segment in enumerate(path):
        parent = None if index == 0 else path[index - 1].kind

        if parent is not None and parent not in CONTAINER_KINDS:
            raise SrnError("E_SRN_PLACEMENT", f"a {parent} cannot own a {segment.kind}")
        if segment.kind == "product" and parent is not None:
            raise SrnError("E_SRN_PLACEMENT",
                           "a product must be a direct child of the solution")
        if segment.kind == "component" and parent is None:
            raise SrnError("E_SRN_PLACEMENT", "a component must live inside a product")
        if segment.kind in SOLUTION_KINDS and parent is not None:
            raise SrnError("E_SRN_PLACEMENT",
                           f"{segment.kind} may only live at solution level")
```

Notes pinned by tests (`framework/portal/src/lib/srn/srn.test.ts`):

- `srn://acme` → `path` `[]`, `kind` `None`. The solution root is the only SRN
  without a kind.
- `srn://acme/datamodel/money@1` → `path` `[(datamodel, money)]`, `kind`
  `datamodel`. A solution-level entity is one pair, not a special case.
- `srn://acme/product/shop/datamodel` → `E_SRN_SYNTAX` ("kind bucket is not
  addressable"). So is `srn://acme/product`.
- `srn://acme/product/shop/datamodel/cart/extra` → `E_SRN_SYNTAX` ("path must
  alternate").
- `srn://acme/shop/checkout` → `E_SRN_SYNTAX` (`"shop" is not a kind bucket`).
  The pre-bucket flat form does not parse; there is no compatibility mode.

## Placement is grammar

Placement rules are enforced by `parse_srn` itself, in the order below, and
report `E_SRN_PLACEMENT`. They are not a loader pass: a misplaced entity has no
SRN at all, so the portal reports it while reading the directory rather than
after building the graph.

| #   | Rule                                                            | Rejected example                                |
| --- | --------------------------------------------------------------- | ----------------------------------------------- |
| P1  | Only a `product` or a `component` may own anything.             | `srn://acme/datamodel/money/datamodel/currency` |
| P2  | A `product` pair may only be the **first** pair.                | `srn://acme/product/shop/product/billing`       |
| P3  | A `component` pair may never be first — it follows a container. | `srn://acme/component/checkout`                 |
| P4  | `actor` and `environment` may only be the **first** pair.       | `srn://acme/product/shop/actor/operator`        |

More than one rule can apply to the same reference, so the order is fixed: P1
first, then P2, P3, P4. An entity under a leaf kind is therefore reported as an
ownership failure rather than as a misplaced kind, which is the more useful
message — the bucket is fine, the thing above it is not:

```text
srn://acme/actor/customer/requirement/gdpr-erasure   # P1 — "an actor cannot own a requirement"
srn://acme/product/shop/protocol/order-placement/requirement/latency
                                                     # P1 — "a protocol cannot own a requirement"
srn://acme/product/shop/component/checkout/product/billing
                                                     # P2 — parent is a container, but
                                                     #      a product is never nested
srn://acme/product/shop/component/checkout/environment/production
                                                     # P4 — environments are solution-level
```

The placements these rules exist to permit, all of them real entities in the
fixture under `solutions/`:

```text
srn://acme/product/shop                                                     # P2 satisfied
srn://acme/product/shop/component/checkout                                  # P3 satisfied
srn://acme/product/shop/component/checkout/component/payment                # components recurse
srn://acme/product/shop/component/checkout/component/payment/datamodel/order
srn://acme/actor/customer                                                   # P4 satisfied
srn://acme/environment/production
srn://acme/datamodel/money
srn://acme/adr/0001-single-currency
srn://acme/requirement/gdpr-erasure
srn://acme/protocol/settlement
```

Because SRN ≡ path, placement is also a *directory* rule; see
[structure.md](structure.md) for the same table expressed as paths.

## Resolution to disk paths

Strip `srn://`, prefix `solutions/`; the result is the entity **directory**. The
kind buckets are real directories, so the mapping stays a plain string join. The
entity document is `index.md` inside it. The `@version` suffix never appears on
disk.

```python
def to_dir(srn) -> str:
    parts = ["solutions", srn.solution]
    for segment in srn.path:
        parts += [segment.kind, segment.name]
    return "/".join(parts)          # + "/index.md" for the entity document
```

```text
srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3
→ solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/
→ solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/index.md
```

The inverse holds and is used by the loader: a catalog-relative directory is
parsed as an SRN, so a directory that violates the grammar or the placement
rules produces no entity at all and is reported at the path where it was found.

```text
solutions/acme/shop/checkout                  → E_SRN_SYNTAX     ("shop" is not a bucket)
solutions/acme/product/shop/actor/operator    → E_SRN_PLACEMENT  (P4)
```

If the directory or its `index.md` does not exist, the reference is dangling:
`E_SRN_DANGLING`.

## Version suffix semantics

- `@N` pins the reference to integer version `N` of the target entity.
- No suffix means **latest** — whatever version is currently on the
  filesystem. Latest is a moving target by design; pin when you need
  reproducibility.
- Only current versions exist on the filesystem ([evolution.md](evolution.md)).
  Resolution of `@N`:

  1. Read the target's `index.md`; if its frontmatter `version` equals `N`,
     resolve on the filesystem.
  2. Otherwise consult the git-backed version→commit index and read the entity
     directory at that commit.
  3. If `N` is in neither (never existed, or `N` greater than current):
     `E_SRN_VERSION`.

- The suffix MAY appear on a container SRN too (`srn://acme/product/shop@2` —
  version 2 of the product entity `shop`); the primary use is pinning leaf
  entities.
- The suffix pins only the entity the SRN addresses. There is no way to pin an
  ancestor: `srn://acme/product/shop@2/component/checkout` is `E_SRN_SYNTAX`,
  not "checkout as of shop v2".

## Relative references

`srn://` is hierarchical, so relative references are resolved per RFC 3986 §5.
The base URI is **the URI of the referring document**, which yields exactly the
semantics of relative file paths on disk:

| Referring context                         | Base URI                                                    |
| ----------------------------------------- | ----------------------------------------------------------- |
| `index.md`, sibling YAML artifacts, prose | the document's own URI: `{entity-srn}/{path-within-entity}` |

JSON Schema `$ref` is **not** in this table: `schema.json` uses relative file
paths rather than SRNs, so that stock validators and code generators can resolve
it (see [kinds/datamodel.md](kinds/datamodel.md) and the "JSON Schema" note
below).

**Document URIs are base URIs, not references.** A base like
`srn://acme/product/shop/component/checkout/index.md` or
`srn://acme/product/shop/protocol/order-placement/workflows/place-order.yaml`
carries a filename, which the segment grammar above rejects (a dot is not a
legal segment character). That is deliberate and not a contradiction: such a URI
exists only to be *resolved against*, is never written as a reference, and is
therefore never validated as one. Only the **result** of resolution — which
always addresses an entity — must satisfy the ABNF and rules V1–V5.

```text
base   srn://acme/product/shop/component/checkout/index.md   # a document URI: never a reference
ref    ../../protocol/order-placement                        # written by the author
result srn://acme/product/shop/protocol/order-placement      # validated as an SRN
```

### One `..` pops one segment, and a bucket plus a name is two

This is the single trap of the bucketed grammar, and it is worth stating twice:
RFC 3986 arithmetic counts **path segments**, and it knows nothing about pairs.
Climbing out of an entity therefore costs **two** `..` — one for its name and
one for its bucket — and a single `..` lands *inside the bucket*, addressing a
sibling.

With the base entity `srn://acme/product/shop/component/checkout` (document
`solutions/acme/product/shop/component/checkout/index.md`):

```text
datamodel/cart                     → srn://acme/product/shop/component/checkout/datamodel/cart
component/payment/datamodel/order@3
                                   → srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3
../inventory                       → srn://acme/product/shop/component/inventory
                                     # ONE ".." pops the name only — still inside `component/`
../../protocol/order-placement     → srn://acme/product/shop/protocol/order-placement
                                     # TWO pop the whole pair, landing on the owning product
../../../../actor/customer         → srn://acme/actor/customer
                                     # FOUR pop two pairs, landing on the solution root
/datamodel/money@1                 → srn://acme/datamodel/money@1
                                     # path-absolute: from the solution root, no counting
```

Miscounting does not fail silently — it fails, and the class tells you how:

```text
..                                 → E_SRN_SYNTAX     # leaves `/product/shop/component`,
                                                      # a bucket, which is not addressable
../../../datamodel/money           → E_SRN_SYNTAX     # three pops leave a half pair
../../actor/operator               → E_SRN_PLACEMENT  # lands an actor under a product
../../../../../datamodel/money     → E_SRN_SYNTAX     # climbs above the solution root
```

### Prefer solution-absolute references

A reference beginning with `/` is resolved from the solution root and needs no
counting at all. Because bucketed paths are long, that form SHOULD be used for
**anything outside the current entity**; `..` chains SHOULD be limited to short
hops an author can verify at a glance. The fixture under `solutions/` is written
this way throughout:

```yaml
# solutions/acme/product/shop/component/checkout/index.md
relations:
  uses:
    - /environment/production
    - /datamodel/money@1
    - /product/shop/component/checkout/protocol/tax-quoting
  depends-on:
    - /product/shop/component/inventory
    - /product/billing/component/ledger
```

The same two targets written relatively are `../../../../environment/production`
and `../../../../datamodel/money@1` — correct, but nobody reviews them.

Rules:

- A relative reference MUST NOT contain more `..` segments than the base path
  has depth. RFC 3986 would silently clamp the excess at the root; the
  framework rejects it instead as `E_SRN_SYNTAX`, because a clamped reference
  is almost certainly a mistake.
- A network-path reference (`//other-solution/...`) changes the authority —
  the solution — and is therefore `E_SRN_CROSS_SOLUTION`.
- Implementations MAY reuse a stock URL resolver by temporarily rewriting the
  scheme (`srn://` → `http://`), applying RFC 3986 resolution, and rewriting
  back. The resolver produces the *path*; the result MUST still be parsed,
  because alternation and placement are framework rules, not URI rules:

  ```python
  from urllib.parse import urljoin

  def resolve(base_doc_uri: str, ref: str) -> str:
      if ref.startswith("srn://"):
          return ref                                   # already absolute
      fake = base_doc_uri.replace("srn://", "http://", 1)
      return urljoin(fake, ref).replace("http://", "srn://", 1)

  parse_srn(resolve("srn://acme/product/shop/component/checkout/index.md",
                    "../../protocol/order-placement"))
  # → srn://acme/product/shop/protocol/order-placement
  ```

### JSON Schema is the one exception

`schema.json` artifacts do **not** use SRN references. They carry no `$id`, and
every `$ref` is an ordinary relative file path to another `schema.json` — here
as written in
`solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/schema.json`:

```json
{ "$ref": "../../../../../../datamodel/order-line/schema.json" }
{ "$ref": "#/$defs/positive-int" }
```

The reason is interoperability, and it was measured rather than assumed: stock
tooling (`json-schema-to-typescript`, `ajv-cli`, `quicktype`,
`datamodel-code-generator`) resolves relative file references off the
filesystem and fails outright on a private URI scheme. Because JSON Schema
resolves a relative `$ref` against `$id` when `$id` is present, an `srn://`
`$id` would defeat this even with path-style refs — hence no `$id` at all.

Nothing is lost: a schema's identity is its owning entity's SRN, which is
derivable from its path (SRN ≡ path), and the entity's `index.md` already
carries the authoritative `name`/`version`. See
[kinds/datamodel.md](kinds/datamodel.md) for the full rules, including the
optional `x-srn` provenance annotation.

The same "one `..` pops one segment" arithmetic applies, on the same directory
tree — so bucketing lengthened these paths too. Counting up out of
`solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/`:

```text
1 ..  → …/component/payment/datamodel/       6 ..  → …/product/shop/
2 ..  → …/component/payment/                 7 ..  → …/product/
3 ..  → …/component/checkout/component/      8 ..  → solutions/acme/
4 ..  → …/component/checkout/
5 ..  → …/product/shop/component/
```

Six `..` reach the `shop` product; eight reach the solution root. Unlike SRN
references there is no path-absolute escape — a leading `/` in a `$ref` is a
filesystem-absolute path, which no tool can resolve portably — so these chains
are counted, not avoided, and MUST be verified against the tree rather than
estimated.

## Usage contexts

One syntax, four surfaces. Absolute, solution-absolute, and relative forms are
interchangeable in all of them; prefer solution-absolute for anything outside
the current entity.

**1. Frontmatter relations** ([frontmatter.md](frontmatter.md)):

```yaml
relations:
  uses:
    - /datamodel/money@1                              # solution-absolute
    - srn://acme/actor/customer                       # fully absolute
  exposes:
    - /product/shop/protocol/order-placement
```

**2. JSON Schema** — SRNs are **not** used. `schema.json` carries no `$id`, and
`$ref` is a relative file path, so the artifact stays consumable by any standard
validator or generator. The real fixture artifact at
`solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/schema.json`,
abridged:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "x-srn": "srn://acme/product/shop/component/checkout/component/payment/datamodel/order",
  "title": "Order",
  "type": "object",
  "allOf": [
    { "$ref": "../../../../../../../../datamodel/base-record/schema.json" },
    { "$ref": "../../../../../../../../datamodel/auditable/schema.json" }
  ],
  "properties": {
    "total": { "$ref": "../../../../../../../../datamodel/money/schema.json" },
    "payment": { "$ref": "../../../../../../datamodel/payment-method/schema.json" },
    "lines": {
      "type": "array",
      "items": { "$ref": "../../../../../../datamodel/order-line/schema.json" }
    },
    "line-count": { "$ref": "#/$defs/positive-int" }
  },
  "required": ["total"],
  "$defs": { "positive-int": { "type": "integer", "minimum": 1 } }
}
```

Eight `..` climb from the entity directory to `solutions/acme/`, so a
solution-level datamodel is
`../×8 + datamodel/base-record/schema.json` → `solutions/acme/datamodel/base-record/schema.json`;
six climb to `solutions/acme/product/shop/`, so a product-level one is
`../×6 + datamodel/order-line/schema.json` → `solutions/acme/product/shop/datamodel/order-line/schema.json`.
`x-srn` is an optional provenance annotation (unversioned, ignored by
validators), checked against the file's own path at load so it cannot drift.
Fragments (`#/$defs/...`) remain ordinary JSON Pointers into the same document.

**3. Protocol frontmatter and workflow YAML** — participant refs and payload
references. [kinds/protocol.md](kinds/protocol.md) owns both formats: SRNs
appear in the protocol's `participants` list and in a step's `payload`, never
in a step's `from`/`to` (those are participant **aliases**) and never in
`message` (a logical message name):

```yaml
# solutions/acme/product/shop/protocol/order-placement/index.md
participants:
  - alias: customer
    ref: /actor/customer                              # solution-absolute
  - alias: checkout
    ref: /product/shop/component/checkout
  - alias: payment
    ref: /product/shop/component/checkout/component/payment
```

```yaml
# solutions/acme/product/shop/protocol/order-placement/workflows/place-order.yaml
steps:
  - message: submit-order                             # message name, not an SRN
    from: customer                                    # alias, not an SRN
    to: checkout
    payload: /product/shop/datamodel/order-request@1  # solution-absolute
  - message: payment-declined
    from: payment
    to: checkout
    kind: error
    payload: /datamodel/problem@1
```

The base URI of a file under `workflows/` is that file's own URI, one level
deeper than `index.md`, so the same relative text climbs one level less far. The
relative spelling of the first payload above is `../../../datamodel/order-request@1`
— three pops from `…/order-placement/workflows/` to `…/product/shop/` — which is
exactly the kind of count nobody should have to redo during review. Payload refs
there SHOULD be solution-absolute ([kinds/protocol.md](kinds/protocol.md)).

**4. Prose markdown links** — an `srn://` URI is a legal link target; the
portal rewrites it to the entity page, and `grep` still finds it. Prose links
MUST use the **absolute** `srn://` form: a bare relative path in a markdown
link is indistinguishable from an ordinary file link, so the portal leaves it
as a plain file link and no entity page is resolved. Relative and
solution-absolute references belong in the structured surfaces 1–3, where the
field's meaning is fixed.

```markdown
Checkout persists an
[Order](srn://acme/product/shop/component/checkout/component/payment/datamodel/order@3)
per the [order-placement](srn://acme/product/shop/protocol/order-placement) protocol.

<!-- NOT an SRN reference: reads as a relative file link -->
per the [order-placement](../../protocol/order-placement) protocol.
```

## Validation rules and error classes

Enforced at portal build/load (no CLI in v1). Rules V1–V5 are per-reference;
V6–V8 require the resolved catalog.

| #   | Rule                                                                                     | Error class            |
| --- | ---------------------------------------------------------------------------------------- | ---------------------- |
| V1  | Reference parses under the ABNF + constraints (incl. `..` depth).                        | `E_SRN_SYNTAX`         |
| V2  | Path alternates `{kind}/{name}`: every kind is one of the eight, every pair is complete. | `E_SRN_SYNTAX`         |
| V3  | No reserved kind keyword as a solution or entity **name**.                               | `E_SRN_RESERVED`       |
| V4  | Placement is legal — rules P1–P4 above.                                                  | `E_SRN_PLACEMENT`      |
| V5  | Reference does not name a foreign solution (authority ≠ own solution).                   | `E_SRN_CROSS_SOLUTION` |
| V6  | Resolved directory exists and contains `index.md`.                                       | `E_SRN_DANGLING`       |
| V7  | Pinned `@N` exists on the filesystem or in the version→commit index.                     | `E_SRN_VERSION`        |
| V8  | Target entity's `kind` is legal for the referring **relation edge**.                     | `E_FM_EDGE_TARGET`     |

V8 covers the `relations` map of [frontmatter.md](frontmatter.md) only. Every
other typed reference surface — a kind-specific frontmatter field, or an SRN
inside a sibling artifact — carries its own kind-specific class, so an error
message names the surface it came from: `E_PROD_ACTOR_TARGET`
([kinds/product.md](kinds/product.md)), `E_PROTO_PARTICIPANT_KIND` /
`E_PROTO_PAYLOAD_KIND` ([kinds/protocol.md](kinds/protocol.md)),
`E_ENV_TARGET_KIND` ([kinds/environment.md](kinds/environment.md)),
`E_DM_REF_KIND` ([kinds/datamodel.md](kinds/datamodel.md)). V1–V7 apply to all
of them unchanged.

Examples of each failure:

```text
V1  srn://acme/product/shop/                              # trailing slash
V1  srn://acme/product/shop@2/component/checkout          # version not on the final segment
V1  ../../../../../datamodel/money (from a component)     # climbs above the solution root
V2  srn://acme/product/shop/datamodel                     # bucket is not addressable
V2  srn://acme/shop/checkout                              # "shop" is not a kind bucket
V3  srn://acme/product/shop/adr/adr                       # entity named "adr"
V4  srn://acme/product/shop/actor/operator                # actor below solution level
V5  srn://globex/product/shop/datamodel/order (from acme) # foreign solution
V6  srn://acme/product/shop/datamodel/cart                # no such directory
V7  srn://acme/datamodel/money@9                          # current is 1, index has 1
```

The complete error-class list for this document:

| Code                   | Raised when                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| `E_SRN_SYNTAX`         | Characters, segment count, `@version` position, or `..` depth is wrong.   |
| `E_SRN_RESERVED`       | A reserved kind keyword stands where a solution or entity name belongs.   |
| `E_SRN_PLACEMENT`      | Pairs are well-formed but arranged illegally (P1–P4).                     |
| `E_SRN_CROSS_SOLUTION` | A reference names, or a network-path reference implies, another solution. |
| `E_SRN_DANGLING`       | The resolved directory or its `index.md` does not exist.                  |
| `E_SRN_VERSION`        | A pinned `@N` exists neither on disk nor in the version→commit index.     |

`W_REF_DEPRECATED` (a warning): a reference whose target entity has
`status: deprecated` — legal, but flagged so migrations converge
([evolution.md](evolution.md)).
