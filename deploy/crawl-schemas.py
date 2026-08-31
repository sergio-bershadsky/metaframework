#!/usr/bin/env python3
"""
Crawl every datamodel schema into a static tree rooted the way `$id` addresses it.

The portal *serves* schemas under `/schemas/{srn-path}`, but a schema's `$id` is
`https://schemas.metaframework.dev/{srn-path}` — host plus the SRN path, no
prefix. So this writes each document at the path its own `$id` claims, which is
the only layout that makes those URLs dereferenceable.

Files are extensionless on purpose, because the `$id`s are. `_headers` is what
gives them `application/schema+json`; without it the asset store would infer a
type from an extension that is deliberately absent.
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:6363"
HERE = Path(__file__).resolve().parent
OUT = HERE / "schemas" / "public"
CATALOG = HERE.parent / "solutions"
HOST = "https://schemas.metaframework.dev"


def schema_paths():
    """Every datamodel with a schema.json, as its SRN path."""
    return sorted(str(p.parent.relative_to(CATALOG)) for p in CATALOG.rglob("schema.json"))


def main():
    written, failed, mismatched = 0, [], []
    for path in schema_paths():
        url = f"{BASE}/schemas/{path}"
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                body = r.read()
        except urllib.error.HTTPError as e:
            failed.append((path, e.code))
            continue

        # The document must claim the identity we are about to publish it at,
        # or we would be serving a schema whose `$id` points somewhere else —
        # which is worse than not serving it, because tooling would follow it.
        try:
            claimed = json.loads(body).get("$id")
        except json.JSONDecodeError as e:
            failed.append((path, f"not JSON: {e}"))
            continue
        if claimed != f"{HOST}/{path}":
            mismatched.append((path, claimed))
            continue

        f = OUT / path
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(body)
        written += 1

    (OUT / "_headers").write_text(
        "# Schema documents are extensionless, matching the `$id`s that address\n"
        "# them, so the asset store has no extension to infer a type from.\n"
        "/*\n"
        "  Content-Type: application/schema+json; charset=utf-8\n"
        "  Access-Control-Allow-Origin: *\n"
    )

    print(f"    {written} schemas written, {len(failed)} failed, {len(mismatched)} with a mismatched $id")
    for path, why in (failed + mismatched)[:10]:
        print(f"      {path}: {why}")
    if failed or mismatched:
        raise SystemExit("refusing to publish an incomplete or mislabelled schema set")
    if written < 50:
        raise SystemExit(f"only {written} schemas — refusing to publish that")


if __name__ == "__main__":
    main()
