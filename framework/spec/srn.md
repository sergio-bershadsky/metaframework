---
kind: spec
name: srn
version: 1
status: review
title: SRN — Solution Resource Name
summary: The complete SRN grammar — syntax, parsing algorithm, disk resolution, version semantics, relative references, usage contexts, and validation rules.
---

# SRN — Solution Resource Name

The SRN is the single identity and reference syntax of the framework. Every
entity has exactly one SRN; the SRN maps 1:1 to the entity's directory under
`solutions/`; and the same syntax is used in frontmatter, JSON Schema, workflow
YAML, and prose. There is no second addressing scheme.

```text
srn://{solution}/{product}/{components...}/{kind}/{name}[@{version}]
```

## Syntax

Character-level grammar (ABNF, RFC 5234):

```abnf
srn          = "srn://" solution *( "/" segment ) [ "@" version ]

solution     = segment
segment      = word *( "-" word )        ; kebab-case, 1–64 chars total
word         = 1*( lower / digit )
version      = nzdigit *digit            ; positive integer, no leading zeros

lower        = %x61-7A                   ; a-z
digit        = %x30-39                   ; 0-9
nzdigit      = %x31-39                   ; 1-9
```

Constraints beyond the ABNF:

- The `@version` suffix MAY appear only on the **final** segment. `srn://acme/
  shop@2/checkout` is `E_SRN_SYNTAX`.
- No trailing slash, no query string, no fragment, no percent-encoding, no
  uppercase, no empty segments. `srn://acme//shop`, `srn://acme/shop/`,
  `srn://acme/Shop` are all `E_SRN_SYNTAX`.
- In RFC 3986 terms, `srn` is a hierarchical scheme in which the **solution
  occupies the authority position** and everything after it is the path. This
  is deliberate: relative references (below) can therefore never leave the
  solution — sealed universes fall out of the URI grammar itself.

The ABNF is purely syntactic; the split into containers, kind, and name is
semantic and defined by the parsing algorithm below. The four semantic shapes:

```text
srn://{solution}                                            [@v]  # solution
srn://{solution}/{product}[/{component}...]                 [@v]  # product / component
srn://{solution}/{kind}/{name}                              [@v]  # solution-level entity
srn://{solution}/{product}[/{component}...]/{kind}/{name}   [@v]  # owned entity
```

Examples (from the decision record):

```text
srn://acme                                          # solution
srn://acme/shop                                     # product
srn://acme/shop/checkout/payment                    # (sub)component
srn://acme/shop/checkout/payment/datamodel/order@1  # datamodel, pinned to v1
srn://acme/shop/protocol/order-events@1             # product-level protocol
srn://acme/actor/customer@1                         # solution-level actor
```

## Reserved kind keywords

```text
datamodel  protocol  actor  environment  adr  requirement
```

These six words are the only kind markers. They MUST NOT be used as solution,
product, component, or entity **names** (`E_SRN_RESERVED`) — they may appear in
an SRN only in the kind position. This keeps parsing single-pass and keeps
`grep 'srn://.*/datamodel/'` unambiguous.

```text
srn://acme/shop/datamodel/order      # legal — "datamodel" is the kind marker
srn://protocol/shop/...              # ILLEGAL — solution named "protocol"
srn://acme/shop/adr/adr              # ILLEGAL — entity named "adr"
```

## Parsing algorithm

Scan left to right. Segment 1 (the authority) is the solution. Scan the
remaining segments for the **first** reserved kind keyword: everything before
it is the container path (product, then components); the keyword is the kind;
exactly one segment — the name — MUST follow it. No keyword found ⇒ the SRN
addresses a container.

Reference implementation (normative for behavior, not for code style):

```python
import re

RESERVED_KINDS = {"datamodel", "protocol", "actor", "environment", "adr", "requirement"}
SEGMENT = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
VERSION = re.compile(r"[1-9][0-9]*")

def parse_srn(ref: str):
    if not ref.startswith("srn://"):
        raise SrnError("E_SRN_SYNTAX", "missing srn:// scheme")
    body, version = ref[6:], None
    if "@" in body:
        body, _, v = body.rpartition("@")
        if "/" in v or not VERSION.fullmatch(v):
            raise SrnError("E_SRN_SYNTAX", "@version must be a positive integer "
                                           "on the final segment")
        version = int(v)
    segments = body.split("/")
    if not all(SEGMENT.fullmatch(s) and len(s) <= 64 for s in segments):
        raise SrnError("E_SRN_SYNTAX", f"bad segment in {ref!r}")
    solution, rest = segments[0], segments[1:]
    if solution in RESERVED_KINDS:
        raise SrnError("E_SRN_RESERVED", "reserved keyword as solution name")
    containers, kind, name = [], None, None
    for i, seg in enumerate(rest):
        if seg in RESERVED_KINDS:
            kind, tail = seg, rest[i + 1:]
            if len(tail) != 1:
                raise SrnError("E_SRN_SYNTAX", "exactly one name must follow the kind")
            name = tail[0]
            if name in RESERVED_KINDS:
                raise SrnError("E_SRN_RESERVED", "reserved keyword as entity name")
            break
        containers.append(seg)
    # containers == [product, *component_path] when non-empty
    return Srn(solution, containers, kind, name, version)
```

Notes pinned by tests:

- `srn://acme/actor/customer` → containers `[]`, kind `actor` — a solution-level
  entity, not a product named `actor` (the keyword scan wins; a product named
  `actor` is illegal anyway).
- `srn://acme/shop/datamodel` → `E_SRN_SYNTAX` (kind with no name — kind
  buckets are not addressable).
- `srn://acme/shop/datamodel/order/extra` → `E_SRN_SYNTAX` (more than one
  segment after the kind).

## Resolution to disk paths

Strip `srn://`, prefix `solutions/`; the result is the entity **directory**.
The entity document is `index.md` inside it. The `@version` suffix never
appears on disk.

```python
def to_dir(srn) -> str:
    parts = ["solutions", srn.solution, *srn.containers]
    if srn.kind:
        parts += [srn.kind, srn.name]
    return "/".join(parts)          # + "/index.md" for the entity document
```

```text
srn://acme/shop/checkout/payment/datamodel/order@1
→ solutions/acme/shop/checkout/payment/datamodel/order/          (directory)
→ solutions/acme/shop/checkout/payment/datamodel/order/index.md  (document)
```

If the directory or its `index.md` does not exist, the reference is dangling:
`E_SRN_DANGLING`.

## Version suffix semantics

- `@N` pins the reference to integer version `N` of the target entity.
- No suffix means **latest** — whatever version is currently on the
  filesystem. Latest is a moving target by design; pin when you need
  reproducibility (schemas SHOULD pin, see below).
- Only current versions exist on the filesystem ([evolution.md](evolution.md)).
  Resolution of `@N`:

  1. Read the target's `index.md`; if its frontmatter `version` equals `N`,
     resolve on the filesystem.
  2. Otherwise consult the git-backed version→commit index and read the entity
     directory at that commit.
  3. If `N` is in neither (never existed, or `N` greater than current):
     `E_SRN_VERSION`.

- The suffix MAY appear on container SRNs too (`srn://acme/shop@2` — version 2
  of the product entity `shop`); the primary use is pinning leaf entities.

## Relative references

`srn://` is hierarchical, so relative references are resolved per RFC 3986 §5.
The base URI is **the URI of the referring document**, which yields exactly the
semantics of relative file paths on disk:

| Referring context                                | Base URI                                                      |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `index.md`, sibling YAML artifacts, prose        | the document's own URI: `{entity-srn}/{path-within-entity}`   |
| JSON Schema `$ref`                               | the schema's `$id` — the **versioned** SRN                    |

Consequences, with the base entity `srn://acme/shop/checkout` (document
`solutions/acme/shop/checkout/index.md`):

```text
datamodel/cart               → srn://acme/shop/checkout/datamodel/cart
payment/datamodel/order@2    → srn://acme/shop/checkout/payment/datamodel/order@2
../protocol/order-events     → srn://acme/shop/protocol/order-events
/actor/customer              → srn://acme/actor/customer          # path-absolute:
                                                                  # solution root
```

Relative references behave exactly like `cd` from the entity's directory —
because the SRN *is* the disk path.

Inside JSON Schema, the base is the `$id` itself (stock RFC 3986 / JSON Schema
behavior — no custom resolver). With
`"$id": "srn://acme/shop/checkout/payment/datamodel/order@1"`:

```text
refund@1                     → srn://acme/shop/checkout/payment/datamodel/refund@1
../../../datamodel/base@1    → srn://acme/shop/datamodel/base@1
/datamodel/money@1           → srn://acme/datamodel/money@1
```

(The last segment of a `$id` is the versioned name, so a bare `refund@1` lands
on the sibling datamodel — standard "replace the last segment" resolution.)

Rules:

- A relative reference MUST NOT contain more `..` segments than the base path
  has depth. RFC 3986 would silently clamp the excess at the root; the
  framework rejects it instead as `E_SRN_SYNTAX`, because a clamped reference
  is almost certainly a mistake.
- A network-path reference (`//other-solution/...`) changes the authority —
  the solution — and is therefore `E_SRN_CROSS_SOLUTION`.
- Implementations MAY reuse a stock URL resolver by temporarily rewriting the
  scheme (`srn://` → `http://`), applying RFC 3986 resolution, and rewriting
  back:

  ```python
  from urllib.parse import urljoin

  def resolve(base_doc_uri: str, ref: str) -> str:
      if ref.startswith("srn://"):
          return ref                                   # already absolute
      fake = base_doc_uri.replace("srn://", "http://", 1)
      return urljoin(fake, ref).replace("http://", "srn://", 1)
  ```

## Usage contexts

One syntax, four surfaces. Absolute and relative forms are interchangeable in
all of them; prefer relative for nearby targets, absolute for distant ones.

**1. Frontmatter relations** ([frontmatter.md](frontmatter.md)):

```yaml
relations:
  uses:
    - /datamodel/money@1              # solution-absolute
    - srn://acme/actor/customer       # fully absolute
  exposes:
    - ../protocol/order-events        # relative to this entity's document
```

**2. JSON Schema `$id` and `$ref`** — `$id` MUST be the entity's versioned SRN;
`$ref` SHOULD pin a version so validation is reproducible (an unpinned `$ref`
resolves to latest at build time):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "srn://acme/shop/checkout/payment/datamodel/order@1",
  "type": "object",
  "allOf": [{ "$ref": "/datamodel/base-record@1" }],
  "properties": {
    "total": { "$ref": "/datamodel/money@1" },
    "lines": { "type": "array", "items": { "$ref": "order-line@1" } }
  },
  "required": ["total"]
}
```

The build preloads every schema into the validator registry keyed by `$id`;
fragments (`#/$defs/...`) are ordinary JSON Pointers applied after SRN
resolution and are not part of the SRN grammar.

**3. Workflow / protocol YAML** — participant and message references:

```yaml
# solutions/acme/shop/protocol/order-events/workflows/place-order.yaml
steps:
  - from: srn://acme/actor/customer
    to:   /shop/checkout                          # path-absolute: solution root
    message: ../../../datamodel/order-placed@1    # 3 up → shop/datamodel/order-placed
```

**4. Prose markdown links** — an `srn://` URI is a legal link target; the
portal rewrites it to the entity page, and `grep` still finds it:

```markdown
Checkout persists an [Order](srn://acme/shop/checkout/payment/datamodel/order@1)
per the [order-events](../protocol/order-events) protocol.
```

## Validation rules and error classes

Enforced at portal build/load (no CLI in v1). Rules V1–V4 are per-reference;
V5–V7 require the resolved catalog.

| #  | Rule                                                                  | Error class            |
| -- | --------------------------------------------------------------------- | ---------------------- |
| V1 | Reference parses under the ABNF + constraints (incl. `..` depth).     | `E_SRN_SYNTAX`         |
| V2 | No reserved keyword as solution/product/component/entity name.        | `E_SRN_RESERVED`       |
| V3 | Kind keyword is followed by exactly one name segment.                 | `E_SRN_SYNTAX`         |
| V4 | Reference does not name a foreign solution (authority ≠ own solution).| `E_SRN_CROSS_SOLUTION` |
| V5 | Resolved directory exists and contains `index.md`.                    | `E_SRN_DANGLING`       |
| V6 | Pinned `@N` exists on the filesystem or in the version→commit index.  | `E_SRN_VERSION`        |
| V7 | Target entity's `kind` is legal for the referring field's edge type.  | `E_FM_EDGE_TARGET`     |

Examples of each failure:

```text
V1  srn://acme/shop/                              # trailing slash
V1  srn://acme/shop@2/checkout                    # version not on final segment
V1  ../../../../datamodel/money (from depth 3)    # ".." climbs beyond the solution root
V2  srn://acme/shop/adr/adr                       # entity named "adr"
V4  srn://globex/shop/datamodel/order (from acme) # foreign solution
V5  srn://acme/shop/datamodel/cart                # no such directory
V6  srn://acme/shop/datamodel/order@9             # current is 3, index has 1-3
```

`W_REF_DEPRECATED` (a warning): a reference whose target entity has
`status: deprecated` — legal, but flagged so migrations converge
([evolution.md](evolution.md)).
