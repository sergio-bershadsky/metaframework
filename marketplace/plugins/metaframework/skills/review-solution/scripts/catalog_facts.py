#!/usr/bin/env python3
"""Collect architectural facts about a metaframework solution catalog.

This is a REVIEW AID, not a validator. The portal's catalog check
(`cd framework/portal && npx vitest run src/lib/catalog`) owns legality; this
script owns *shape* questions the checker deliberately does not ask: what is
orphaned, what is deprecated but still referenced, where a protocol sits
relative to its participants, which vocabulary is scoped wrongly.

Every finding it prints is a CANDIDATE. The codes are `R_*` so they can never be
confused with portal diagnostics (`E_*` / `W_*`). Open the files it names and
decide; several checks are heuristics that a well-modelled catalog will trip for
good reasons.

Usage:
    python3 catalog_facts.py [SOLUTION_DIR] [--json]

SOLUTION_DIR is a solution directory, e.g. `solutions/acme`. When omitted, the
script looks for `solutions/` below the working directory and uses the single
solution inside it.

Standard library only. PyYAML is used when importable; otherwise a small
frontmatter-subset parser handles the catalog's YAML (scalars, lists of
scalars, lists of maps, one nested map level) which is all the format allows.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict

KINDS = {
    "product",
    "component",
    "datamodel",
    "protocol",
    "actor",
    "environment",
    "adr",
    "requirement",
}
EDGE_TYPES = ("uses", "exposes", "depends-on", "implements", "supersedes")


# --------------------------------------------------------------------------
# frontmatter
# --------------------------------------------------------------------------

def split_frontmatter(text: str) -> str:
    if not text.startswith("---"):
        return ""
    end = text.find("\n---", 3)
    if end == -1:
        return ""
    return text[text.find("\n") + 1 : end + 1]


def parse_yaml(block: str) -> dict:
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(block)
        return data if isinstance(data, dict) else {}
    except Exception:
        return _mini_yaml(block)


def _unquote(v: str) -> str:
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def _indent(line: str) -> int:
    return len(line) - len(line.lstrip())


def _mini_yaml(block: str) -> dict:
    """Parse the frontmatter subset the framework permits: block scalars, lists
    of scalars, lists of maps, nested maps. Flow style and multi-line scalars
    are not needed by any field this script reads."""
    lines = [l.rstrip() for l in block.splitlines() if l.strip() and not l.lstrip().startswith("#")]
    if not lines:
        return {}
    value, _ = _parse_block(lines, 0, _indent(lines[0]))
    return value if isinstance(value, dict) else {}


def _parse_block(lines: list[str], i: int, indent: int):
    if lines[i].lstrip().startswith("- "):
        return _parse_list(lines, i, indent)
    return _parse_map(lines, i, indent)


def _parse_map(lines: list[str], i: int, indent: int):
    node: dict = {}
    while i < len(lines):
        cur = _indent(lines[i])
        text = lines[i].strip()
        if cur != indent or text.startswith("- ") or ":" not in text:
            break
        key, _, val = text.partition(":")
        key, val = key.strip(), val.strip()
        i += 1
        if val in ("|", ">", "|-", ">-", "|+", ">+"):  # block scalar: keep the text, skip the lines
            buf = []
            while i < len(lines) and _indent(lines[i]) > indent:
                buf.append(lines[i].strip())
                i += 1
            node[key] = " ".join(buf)
            continue
        if val:
            node[key] = _unquote(val)
            continue
        if i < len(lines) and (
            _indent(lines[i]) > indent
            or (_indent(lines[i]) == indent and lines[i].lstrip().startswith("- "))
        ):
            node[key], i = _parse_block(lines, i, _indent(lines[i]))
        else:
            node[key] = None
    return node, i


def _parse_list(lines: list[str], i: int, indent: int):
    node: list = []
    while i < len(lines) and _indent(lines[i]) == indent and lines[i].lstrip().startswith("- "):
        item = lines[i].strip()[2:].strip()
        # `- key: value` opens a map whose remaining keys sit at indent + 2
        if re.match(r"^[a-z0-9][a-z0-9-]*:( |$)", item):
            rest = [" " * (indent + 2) + item] + lines[i + 1 :]
            obj, consumed = _parse_map(rest, 0, indent + 2)
            node.append(obj)
            i += consumed
        else:
            node.append(_unquote(item))
            i += 1
    return node, i


# --------------------------------------------------------------------------
# model
# --------------------------------------------------------------------------

class Entity:
    def __init__(self, path: str, srn_path: str, fm: dict):
        self.path = path                  # directory on disk
        self.srn_path = srn_path          # "acme/product/shop/component/checkout"
        self.fm = fm
        self.kind = str(fm.get("kind", "?"))
        self.name = str(fm.get("name", "?"))
        self.status = str(fm.get("status", "?"))
        self.owner = fm.get("owner")

    @property
    def srn(self) -> str:
        return "srn://" + self.srn_path

    @property
    def pairs(self) -> list[str]:
        """Path below the solution as `{kind}/{name}` pairs."""
        seg = self.srn_path.split("/")[1:]
        return ["/".join(seg[i : i + 2]) for i in range(0, len(seg) - 1, 2)]

    @property
    def owner_path(self) -> str:
        """SRN path of the container that owns this entity ('' for the solution)."""
        seg = self.srn_path.split("/")
        return "/".join(seg[:-2]) if len(seg) > 2 else seg[0]


def strip_version(ref: str) -> tuple[str, str | None]:
    if "@" in ref:
        base, _, ver = ref.rpartition("@")
        return base, ver
    return ref, None


def resolve_ref(ref: str, base_srn_path: str, solution: str) -> str | None:
    """Resolve a catalog reference to an SRN path. None when unresolvable here."""
    ref = ref.strip()
    if not ref:
        return None
    ref, _ = strip_version(ref)
    if ref.startswith("srn://"):
        return ref[len("srn://") :].strip("/")
    if ref.startswith("//"):
        return None  # cross-solution: illegal, the portal reports it
    if ref.startswith("/"):
        return solution + ref.rstrip("/")
    # relative: base is the referring entity's own directory
    seg = base_srn_path.split("/")
    for part in ref.split("/"):
        if part == "..":
            if len(seg) <= 1:
                return None
            seg.pop()
        elif part in ("", "."):
            continue
        else:
            seg.append(part)
    return "/".join(seg)


def collect_refs(fm: dict, srn_path: str, solution: str):
    """Yield (edge_type, target_srn_path, pinned_version) from frontmatter."""
    rel = fm.get("relations") or {}
    if isinstance(rel, dict):
        for edge, refs in rel.items():
            if not isinstance(refs, list):
                continue
            for r in refs:
                if not isinstance(r, str):
                    continue
                _, ver = strip_version(r)
                target = resolve_ref(r, srn_path, solution)
                if target:
                    yield str(edge), target, ver
    for r in fm.get("primary-actors") or []:
        if isinstance(r, str):
            target = resolve_ref(r, srn_path, solution)
            if target:
                yield "primary-actors", target, None
    for p in fm.get("participants") or []:
        if isinstance(p, dict) and isinstance(p.get("ref"), str):
            target = resolve_ref(p["ref"], srn_path, solution)
            if target:
                yield "participants", target, None


def load(solution_dir: str):
    solution_dir = os.path.abspath(solution_dir.rstrip("/"))
    solution = os.path.basename(solution_dir)
    entities: dict[str, Entity] = {}
    for root, dirs, files in os.walk(solution_dir):
        dirs[:] = [d for d in dirs if d not in (".git", "node_modules")]
        if "index.md" not in files:
            continue
        rel = os.path.relpath(root, os.path.dirname(solution_dir))
        with open(os.path.join(root, "index.md"), encoding="utf-8") as fh:
            fm = parse_yaml(split_frontmatter(fh.read()))
        entities[rel] = Entity(root, rel, fm)
    return solution, solution_dir, entities


def build_graph(solution: str, entities: dict[str, Entity]):
    out = defaultdict(list)   # src -> [(edge, target, pin)]
    inc = defaultdict(list)   # target -> [(edge, src, pin)]
    for src, ent in entities.items():
        for edge, target, pin in collect_refs(ent.fm, src, solution):
            out[src].append((edge, target, pin))
            inc[target].append((edge, src, pin))
    return out, inc


def schema_edges(solution: str, entities: dict[str, Entity], inc):
    """Add `$ref` edges read out of every schema.json."""
    marker = "/schemas/" + solution + "/"
    for src, ent in entities.items():
        sfile = os.path.join(ent.path, "schema.json")
        if not os.path.exists(sfile):
            continue
        try:
            with open(sfile, encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        for m in re.finditer(r'"\$ref"\s*:\s*"([^"]+)"', text):
            url = m.group(1)
            if marker not in url:
                continue
            target = solution + "/" + url.split(marker, 1)[1].split("#")[0].rstrip("/")
            if target != src:
                inc[target].append(("$ref", src, None))


def prose_mentions(solution: str, solution_dir: str, entities: dict[str, Entity], inc):
    """Add `srn://` links found in prose. Navigational, not edges — but they are
    evidence that something points at the entity."""
    pattern = re.compile(r"srn://" + re.escape(solution) + r"[a-z0-9/@-]*")
    for src, ent in entities.items():
        doc = os.path.join(ent.path, "index.md")
        try:
            with open(doc, encoding="utf-8") as fh:
                body = fh.read()
        except OSError:
            continue
        body = body[body.find("\n---", 3) :] if body.startswith("---") else body
        for m in pattern.finditer(body):
            target, _ = strip_version(m.group(0)[len("srn://") :].rstrip("/"))
            if target in entities and target != src:
                inc[target].append(("prose", src, None))


# --------------------------------------------------------------------------
# checks
# --------------------------------------------------------------------------

def nca(paths: list[list[str]]) -> list[str]:
    if not paths:
        return []
    common = paths[0]
    for p in paths[1:]:
        i = 0
        while i < min(len(common), len(p)) and common[i] == p[i]:
            i += 1
        common = common[:i]
    return common


def children_of(entities, srn_path) -> list[str]:
    prefix = srn_path + "/"
    return [p for p in entities if p.startswith(prefix)]


def run_checks(solution, entities, out, inc):
    findings = []

    def add(code, srn_path, detail):
        findings.append({"code": code, "srn": "srn://" + srn_path, "detail": detail})

    real_edges = set(EDGE_TYPES)

    for path, ent in sorted(entities.items()):
        if "/" not in path:  # the solution root
            continue
        outgoing = out.get(path, [])
        incoming = inc.get(path, [])
        kids = children_of(entities, path)

        # --- orphan -------------------------------------------------------
        connective = real_edges | {"participants", "primary-actors"}
        has_out = any(e in connective for e, _, _ in outgoing)
        has_in = bool(incoming)
        if not has_out and not has_in and not kids:
            add("R_ORPHAN", path, f"{ent.kind}: no relation edges out, nothing points at it")

        # --- deprecated still referenced ----------------------------------
        if ent.status == "deprecated":
            live = [
                s
                for e, s, _ in incoming
                if e in real_edges and e != "supersedes" and entities[s].status != "deprecated"
            ]
            if live:
                names = sorted(set(live))
                shown = ", ".join(names[:8]) + (f" (+{len(names) - 8} more)" if len(names) > 8 else "")
                add("R_DEPRECATED_LIVE_REF", path, f"still referenced by {len(names)}: {shown}")
            if not any(e == "supersedes" for e, _, _ in incoming):
                add("R_DEPRECATED_NO_SUCCESSOR", path, "deprecated with no supersedes edge pointing at it")

        # --- unfinished swap ----------------------------------------------
        for edge, target, _ in outgoing:
            if edge != "supersedes" or target not in entities:
                continue
            old = entities[target]
            if old.kind == "adr":
                if str(old.fm.get("decision-status")) != "superseded":
                    add(
                        "R_SWAP_UNFINISHED",
                        target,
                        f"superseded by srn://{path} but decision-status is "
                        f"{old.fm.get('decision-status')!r} (expected 'superseded')",
                    )
            elif old.status != "deprecated":
                add(
                    "R_SWAP_UNFINISHED",
                    target,
                    f"superseded by srn://{path} but status is {old.status!r} "
                    "— finish the swap or say why the window is still open",
                )

        # --- draft depended on by settled entities ------------------------
        if ent.status == "draft":
            settled = [s for e, s, _ in incoming if e in real_edges and entities[s].status == "approved"]
            if settled:
                add(
                    "R_DRAFT_DEPENDENCY",
                    path,
                    "draft, but approved entities depend on it: " + ", ".join(sorted(set(settled))),
                )

        # --- kind-specific ------------------------------------------------
        if ent.kind == "product":
            comps = [c for c in kids if c.startswith(path + "/component/")]
            direct = [c for c in comps if c.count("/") == path.count("/") + 2]
            if len(direct) == 1:
                add("R_PRODUCT_ONE_COMPONENT", path, f"single component {direct[0]}")
            if not comps:
                add("R_PRODUCT_NO_COMPONENT", path, "product with no components at all")
            if not [k for k in kids if "/adr/" in k] and len(direct) >= 2:
                add("R_ADR_ABSENT", path, f"{len(direct)} components, no ADR in the subtree")

        if ent.kind == "protocol":
            parts = [t for e, t, _ in outgoing if e == "participants"]
            pp = [entities[t].pairs for t in parts if t in entities and entities[t].kind in ("component", "product")]
            if pp:
                want = nca(pp)
                have = ent.pairs[:-1]
                if want != have:
                    add(
                        "R_PROTOCOL_NCA",
                        path,
                        "sits under "
                        + ("/".join(have) or "<solution>")
                        + "; NCA of its participants is "
                        + ("/".join(want) or "<solution>"),
                    )

        if ent.kind == "requirement":
            if not any(e == "implements" for e, _, _ in incoming):
                pr = str(ent.fm.get("priority", "?"))
                if pr in ("must", "should"):
                    add("R_REQ_UNIMPLEMENTED", path, f"priority {pr}, nothing `implements` it")

        if ent.kind == "environment":
            if not any(e == "uses" for e, _, _ in incoming):
                add("R_ENV_UNUSED", path, "no component declares `uses` toward it — nothing runs here")

        if ent.kind == "actor":
            if ent.status != "deprecated" and not any(
                e in ("participants", "primary-actors") for e, _, _ in incoming
            ):
                add("R_ACTOR_UNWIRED", path, "named by no protocol participant and no product primary-actors")

        if ent.kind == "datamodel":
            # Only structural referrers say anything about scope. A requirement
            # or an ADR naming a model is talking *about* it, not sharing it.
            refs = [
                s
                for e, s, _ in incoming
                if e in ("$ref", "uses", "exposes")
                and entities[s].kind in ("component", "product", "protocol", "datamodel")
            ]
            if refs:
                scope = ent.owner_path
                outside = [r for r in refs if not r.startswith(scope + "/") and r != scope]
                if scope.count("/") == 0:  # solution-level vocabulary
                    tops = {r.split("/")[2] if r.count("/") >= 2 else r for r in refs}
                    if len(tops) == 1 and len(refs) >= 1:
                        add(
                            "R_DM_OVER_PROMOTED",
                            path,
                            "solution-level, but only "
                            + ", ".join(sorted(tops))
                            + " uses it",
                        )
                elif outside:
                    add(
                        "R_DM_UNDER_PROMOTED",
                        path,
                        "owned by "
                        + scope
                        + " but referenced from outside it: "
                        + ", ".join(sorted(set(outside))),
                    )

    findings += duplicate_schemas(entities)
    # A specific finding beats the generic one: an entity already reported for a
    # concrete reason does not also need "nothing points at it".
    specific = {f["srn"] for f in findings if f["code"] != "R_ORPHAN"}
    return [f for f in findings if f["code"] != "R_ORPHAN" or f["srn"] not in specific]


def duplicate_schemas(entities):
    """Datamodels whose schemas describe nearly the same properties."""
    props = {}
    for path, ent in entities.items():
        if ent.kind != "datamodel":
            continue
        sfile = os.path.join(ent.path, "schema.json")
        if not os.path.exists(sfile):
            continue
        try:
            with open(sfile, encoding="utf-8") as fh:
                doc = json.load(fh)
        except (OSError, ValueError):
            continue
        names = set((doc.get("properties") or {}).keys())
        if len(names) >= 3:
            props[path] = names
    findings = []
    seen = sorted(props)
    for i, a in enumerate(seen):
        for b in seen[i + 1 :]:
            inter = props[a] & props[b]
            union = props[a] | props[b]
            if union and len(inter) / len(union) >= 0.8:
                findings.append(
                    {
                        "code": "R_DM_NEAR_DUPLICATE",
                        "srn": "srn://" + a,
                        "detail": f"property set ~{int(100*len(inter)/len(union))}% identical to srn://{b}",
                    }
                )
    return findings


# --------------------------------------------------------------------------
# reporting
# --------------------------------------------------------------------------

EXPLAIN = {
    "R_ORPHAN": "Nothing references it and it references nothing — either it is dead, or an edge is missing.",
    "R_DEPRECATED_LIVE_REF": "A swap was started and never finished; referrers still depend on the old entity.",
    "R_DEPRECATED_NO_SUCCESSOR": "Retired without a successor — legal, but make sure it was intended.",
    "R_SWAP_UNFINISHED": "The successor exists; the predecessor was not marked.",
    "R_DRAFT_DEPENDENCY": "Approved entities rest on an unstable one.",
    "R_PRODUCT_ONE_COMPONENT": "A product that is one component is a component with ceremony.",
    "R_PRODUCT_NO_COMPONENT": "A product with no components describes nothing yet.",
    "R_ADR_ABSENT": "A decomposition this size was decided somehow; no ADR records it.",
    "R_PROTOCOL_NCA": "Protocol placement has drifted from its participant list.",
    "R_REQ_UNIMPLEMENTED": "A requirement nothing implements is a claim nobody owns.",
    "R_ENV_UNUSED": "An environment nothing runs in.",
    "R_ACTOR_UNWIRED": "An actor no interaction reaches.",
    "R_DM_OVER_PROMOTED": "Solution-level vocabulary used by one owner only.",
    "R_DM_UNDER_PROMOTED": "Vocabulary owned by one container but relied on outside it.",
    "R_DM_NEAR_DUPLICATE": "Two models describe nearly the same thing.",
}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("solution", nargs="?", help="solution directory, e.g. solutions/acme")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    target = args.solution
    if not target:
        root = os.path.join(os.getcwd(), "solutions")
        if not os.path.isdir(root):
            ap.error("no solutions/ directory here — pass the solution directory explicitly")
        subs = [d for d in sorted(os.listdir(root)) if os.path.isdir(os.path.join(root, d))]
        if len(subs) != 1:
            ap.error(f"{len(subs)} solutions found — pass one explicitly: {', '.join(subs)}")
        target = os.path.join(root, subs[0])
    if not os.path.isdir(target):
        ap.error(f"not a directory: {target}")

    solution, solution_dir, entities = load(target)
    out, inc = build_graph(solution, entities)
    schema_edges(solution, entities, inc)
    prose_mentions(solution, solution_dir, entities, inc)
    findings = run_checks(solution, entities, out, inc)

    census = defaultdict(int)
    statuses = defaultdict(int)
    for ent in entities.values():
        census[ent.kind] += 1
        statuses[ent.status] += 1

    if args.json:
        print(
            json.dumps(
                {
                    "solution": solution,
                    "entities": len(entities),
                    "by_kind": dict(census),
                    "by_status": dict(statuses),
                    "edges": sum(len(v) for v in out.values()),
                    "findings": findings,
                },
                indent=2,
                sort_keys=True,
            )
        )
        return 0

    print(f"solution srn://{solution} — {len(entities)} entities, "
          f"{sum(len(v) for v in out.values())} outgoing references")
    print("  kinds:  " + ", ".join(f"{k} {v}" for k, v in sorted(census.items())))
    print("  status: " + ", ".join(f"{k} {v}" for k, v in sorted(statuses.items())))
    print()
    if not findings:
        print("No candidates found. That is a real result — say so in the report.")
        return 0
    by_code = defaultdict(list)
    for f in findings:
        by_code[f["code"]].append(f)
    for code in sorted(by_code):
        print(f"{code} — {EXPLAIN.get(code, '')}")
        for f in sorted(by_code[code], key=lambda x: x["srn"]):
            print(f"    {f['srn']}\n        {f['detail']}")
        print()
    print(f"{len(findings)} candidates. Every one is a question, not a verdict — "
          "open the files before writing it up.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
