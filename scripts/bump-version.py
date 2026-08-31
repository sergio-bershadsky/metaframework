#!/usr/bin/env python3
"""
Move every version claim in this repository at once.

`manifest-identity` (framework/portal/scripts/repo-hygiene.mjs) requires five
claims to agree, and `npm version` moves only two of them — package.json and the
lockfile. The other three are edited by hand at the end of a release, which is
the moment attention is lowest. Three releases running, that hand-edit had to be
redone because it was attempted from the wrong working directory.

This script is the *writer*; the hygiene check remains the sole *authority* on
what agreement means. That split is deliberate: if a sixth claim is added to
IDENTITY_CLAIMS and not to this file, the check goes red and the release stops.
The failure mode is a blocked release, never a silent disagreement.

    scripts/bump-version.py 0.3.1
"""

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PORTAL = REPO / "framework/portal"
SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")

# (path, regex, label). Each regex MUST match exactly once: a pattern that stops
# matching is a file that changed shape, and guessing is worse than stopping.
CLAIMS = [
    (".claude-plugin/marketplace.json", re.compile(r'(?m)^(  "version": ")[^"]+(")'), "marketplace.version"),
    (".claude-plugin/marketplace.json", re.compile(r'(?m)^(      "version": ")[^"]+(")'), "marketplace.plugins[0].version"),
    ("marketplace/plugins/metaframework/.claude-plugin/plugin.json", re.compile(r'(?m)^(  "version": ")[^"]+(")'), "plugin.version"),
    ("framework/portal/README.md", re.compile(r"(?m)^(  metaframework )\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$"), "README banner"),
]


def fail(message: str) -> None:
    print(f"bump-version: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: scripts/bump-version.py <version>")
    version = sys.argv[1]
    if not SEMVER.match(version):
        fail(f"{version!r} is not a semver version")

    # Every replacement is computed and validated before a single byte is
    # written. A half-bumped tree is worse than an unbumped one: it passes some
    # greps, fails the check, and the next reader cannot tell how far it got.
    # Accumulated PER FILE, not per claim. Planning each claim from the original
    # text was a bug: two claims in one file each produced a whole-file copy
    # carrying only their own edit, and the second write silently clobbered the
    # first. `marketplace.json` has exactly that shape — a top-level `version`
    # and `plugins[0].version` — so it shipped half-bumped, and only
    # `manifest-identity` caught it.
    planned: dict = {}
    for relative, pattern, label in CLAIMS:
        path = REPO / relative
        text = planned.get(relative, (None, None))[1] or path.read_text()
        replacement = rf"\g<1>{version}" if label == "README banner" else rf"\g<1>{version}\g<2>"
        updated, count = pattern.subn(replacement, text)
        if count != 1:
            fail(f"{relative}: {label} matched {count} times, expected exactly 1 — nothing written")
        planned[relative] = (path, updated)
        print(f"  {relative} :: {label} -> {version}", file=sys.stderr)

    # npm owns package.json and the lockfile together; running it with an
    # explicit cwd is what makes this script immune to where it was invoked.
    subprocess.run(
        ["npm", "version", version, "--no-git-tag-version", "--allow-same-version"],
        cwd=PORTAL, check=True, stdout=subprocess.DEVNULL,
    )
    print(f"  package.json + package-lock.json -> {version}")

    for relative, (path, updated) in planned.items():
        path.write_text(updated)
        print(f"  {relative} -> {version}")

    print("\nverifying with the check that owns the rule...")
    result = subprocess.run(["npm", "run", "hygiene"], cwd=REPO, capture_output=True, text=True)
    line = next((l for l in result.stdout.splitlines() if "manifest-identity" in l), "")
    if result.returncode != 0 or not line.startswith("ok"):
        print(result.stdout, file=sys.stderr)
        fail("hygiene is not green — the claims still disagree")
    print(f"  {line.strip()}\n\nNow: review the diff, commit, then `npm run release`.")


if __name__ == "__main__":
    main()
