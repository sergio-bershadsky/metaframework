#!/usr/bin/env python3
"""Rewrite every catalog `schema.json` onto HTTP-resolvable identity.

Decision record 2026-08-19-c supersedes 2026-08-19-b: a schema is identified by
the URL the portal actually serves it at, and every cross-entity `$ref` is that
same absolute URL for its target. This script performs the migration exactly,
which is the point of writing it rather than hand-editing fourteen files.

Per document:

  * add ``$id`` = the entity's schema URL, immediately after ``$schema``
  * rewrite every relative-path ``$ref`` to the absolute schema URL of the
    entity it resolves to, verifying that entity exists
  * drop the retired ``x-srn`` annotation — ``$id`` now carries identity
  * leave local JSON Pointers (``#/$defs/...``) untouched

The base URL is never hand-typed: it comes from SCHEMA_BASE_URL, exactly as
``framework/portal/src/lib/schema/url.ts`` reads it, so the strings on disk and
the strings the portal computes are produced by one source of truth.

The script is idempotent and **origin-agnostic on input**: an ``$id`` or ``$ref``
that is already a schema URL is re-based onto the configured origin rather than
rejected. That is what makes it the tool for the portability rule as well as for
the one-time migration — change SCHEMA_BASE_URL, run this, commit the result.

Usage::

    python3 scripts/migrate_schema_ids.py [--check] [--catalog solutions]

``--check`` reports what would change and exits non-zero if anything would,
which makes the script usable as a drift guard as well as a one-shot migration.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

DEFAULT_SCHEMA_BASE_URL = "http://localhost:3000"
SCHEMA_ROUTE = "/schemas"
SCHEMA_ARTIFACT = "schema.json"
ENTITY_DOCUMENT = "index.md"

# Mirrors RESERVED_KINDS in framework/portal/src/lib/srn/srn.ts. A path segment
# in one of these positions is a kind bucket, not an entity name.
RESERVED_KINDS = {
    "product",
    "component",
    "datamodel",
    "protocol",
    "actor",
    "environment",
    "adr",
    "requirement",
}

SEGMENT = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class MigrationError(Exception):
    """A defect in the catalog that the migration must not paper over."""


def schema_base_url() -> str:
    base = os.environ.get("SCHEMA_BASE_URL", "").strip() or DEFAULT_SCHEMA_BASE_URL
    return base.rstrip("/")


def schema_url(catalog_path: str) -> str:
    """`acme/datamodel/money` -> the URL the portal serves its schema at."""
    return f"{schema_base_url()}{SCHEMA_ROUTE}/{catalog_path}"


def assert_srn_path(catalog_path: str, context: str) -> None:
    """The catalog-relative entity directory must be a legal SRN path.

    Solution, then a strict alternation of kind bucket and name. This is the
    same grammar the portal's parser enforces; checking it here means a rewritten
    `$ref` can never name something the loader would refuse to address.
    """
    parts = catalog_path.split("/")
    if len(parts) < 2 or (len(parts) - 1) % 2 != 0:
        raise MigrationError(f"{context}: {catalog_path!r} is not a {{solution}}/({{kind}}/{{name}})+ path")
    solution, rest = parts[0], parts[1:]
    if not SEGMENT.match(solution) or solution in RESERVED_KINDS:
        raise MigrationError(f"{context}: {solution!r} is not a legal solution name")
    for index in range(0, len(rest), 2):
        kind, name = rest[index], rest[index + 1]
        if kind not in RESERVED_KINDS:
            raise MigrationError(f"{context}: {kind!r} is not a kind bucket in {catalog_path!r}")
        if not SEGMENT.match(name) or name in RESERVED_KINDS:
            raise MigrationError(f"{context}: {name!r} is not a legal entity name in {catalog_path!r}")


def resolve_relative_ref(from_dir: str, ref: str, context: str) -> str:
    """Resolve a relative-path `$ref` the way a stock validator would.

    `from_dir` is the referring entity's catalog-relative directory. Returns the
    target entity's catalog-relative directory; raises when the reference does
    not name a `schema.json` inside the catalog.
    """
    segments = from_dir.split("/")
    for segment in ref.split("/"):
        if segment in ("", "."):
            continue
        if segment == "..":
            if not segments:
                raise MigrationError(f"{context}: {ref!r} climbs above the catalog root")
            segments.pop()
            continue
        segments.append(segment)

    if len(segments) < 2 or segments[-1] != SCHEMA_ARTIFACT:
        raise MigrationError(f"{context}: {ref!r} does not name a {SCHEMA_ARTIFACT}")
    target = "/".join(segments[:-1])
    if segments[0] != from_dir.split("/")[0]:
        raise MigrationError(f"{context}: {ref!r} leaves solution {from_dir.split('/')[0]!r}")
    return target


def target_of_absolute_ref(ref: str, context: str) -> str:
    """Catalog path an already-absolute schema URL addresses, whatever its origin.

    Deliberately origin-agnostic: this is what lets the script *re-base* a
    migrated catalog onto a new SCHEMA_BASE_URL, not merely convert a fresh one.
    The origin is discarded and rebuilt from the environment, so running the
    script is always "normalise every reference onto the configured base".
    """
    marker = f"{SCHEMA_ROUTE}/"
    at = ref.find(marker)
    if at == -1:
        raise MigrationError(f"{context}: {ref!r} is an absolute URL but not a schema URL ({marker} missing)")
    path = ref[at + len(marker) :]
    if not path or "#" in path or "?" in path:
        raise MigrationError(f"{context}: {ref!r} is not a bare schema address")
    if "@" in path:
        raise MigrationError(f"{context}: {ref!r} carries a version pin — a schema URL addresses the current schema")
    return path


def rewrite_refs(node, from_dir: str, catalog: Path, context: str, seen: list[str]):
    """Walk the document, replacing every cross-entity `$ref` with its URL."""
    if isinstance(node, list):
        return [rewrite_refs(item, from_dir, catalog, context, seen) for item in node]
    if not isinstance(node, dict):
        return node

    out = {}
    for key, value in node.items():
        if key == "$ref" and isinstance(value, str):
            if value.startswith("#"):
                # A local JSON Pointer resolves inside this document; it was
                # never affected by the reference form and is not touched.
                out[key] = value
                continue
            if value.startswith(("http://", "https://")):
                # Already migrated: re-base it onto the configured origin. On an
                # unchanged SCHEMA_BASE_URL this is a no-op, which is what makes
                # the script idempotent.
                target = target_of_absolute_ref(value, context)
            else:
                target = resolve_relative_ref(from_dir, value, context)
            assert_srn_path(target, context)
            # The proof that the URL will dereference: the file it maps to is
            # on disk right now, and it belongs to a real entity.
            if not (catalog / target / SCHEMA_ARTIFACT).is_file():
                raise MigrationError(f"{context}: {value!r} -> {target}/{SCHEMA_ARTIFACT} does not exist")
            if not (catalog / target / ENTITY_DOCUMENT).is_file():
                raise MigrationError(f"{context}: {value!r} -> {target} has no {ENTITY_DOCUMENT} — not an entity")
            url = schema_url(target)
            if url != value:
                seen.append(f"{value} -> {url}")
            out[key] = url
            continue
        out[key] = rewrite_refs(value, from_dir, catalog, context, seen)
    return out


def migrate_document(document: dict, from_dir: str, catalog: Path, context: str) -> tuple[dict, list[str]]:
    seen: list[str] = []
    rewritten = rewrite_refs(document, from_dir, catalog, context, seen)

    # Key order is part of the artifact's readability: dialect first, then
    # identity, then the schema proper. `x-srn` is retired — $id says it now,
    # and says it in a form a validator can act on.
    out: dict = {}
    if "$schema" in rewritten:
        out["$schema"] = rewritten["$schema"]
    out["$id"] = schema_url(from_dir)
    for key, value in rewritten.items():
        if key in ("$schema", "$id", "x-srn"):
            continue
        out[key] = value
    return out, seen


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--catalog", default="solutions", help="catalog root (default: solutions)")
    parser.add_argument("--check", action="store_true", help="report changes without writing; exit 1 if any")
    args = parser.parse_args()

    catalog = Path(args.catalog).resolve()
    if not catalog.is_dir():
        print(f"catalog root {catalog} does not exist", file=sys.stderr)
        return 2

    files = sorted(catalog.rglob(SCHEMA_ARTIFACT))
    if not files:
        print(f"no {SCHEMA_ARTIFACT} found under {catalog}", file=sys.stderr)
        return 2

    print(f"base URL: {schema_base_url()}  ({len(files)} schema documents)\n")
    changed = 0
    refs_total = 0
    failures: list[str] = []

    for file in files:
        from_dir = file.parent.relative_to(catalog).as_posix()
        context = f"{from_dir}/{SCHEMA_ARTIFACT}"
        original = file.read_text(encoding="utf-8")

        try:
            assert_srn_path(from_dir, context)
            document = json.loads(original)
            if not isinstance(document, dict):
                raise MigrationError(f"{context}: not a JSON object")
            migrated, refs = migrate_document(document, from_dir, catalog, context)
        except (MigrationError, json.JSONDecodeError) as error:
            failures.append(str(error))
            print(f"  FAIL {context}: {error}")
            continue

        rendered = json.dumps(migrated, indent=2, ensure_ascii=True) + "\n"
        refs_total += len(refs)

        if rendered == original:
            print(f"  ok   {context} (already migrated)")
            continue

        changed += 1
        if args.check:
            print(f"  DIFF {context}: $id={migrated['$id']}, {len(refs)} $ref(s)")
        else:
            file.write_text(rendered, encoding="utf-8")
            print(f"  wrote {context}: $id={migrated['$id']}, {len(refs)} $ref(s)")
        for line in refs:
            print(f"         {line}")

    print(f"\n{changed} file(s) {'would change' if args.check else 'rewritten'}; {refs_total} $ref(s) resolved")
    if failures:
        print(f"{len(failures)} failure(s)", file=sys.stderr)
        return 2
    return 1 if (args.check and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
