#!/usr/bin/env python3
"""
Keep an entity's `version` and its git history in step.

The framework reads history from git: the portal rebuilds an entity page from
the commit that carried a given `version`, and `evolution.md` requires `.git` to
be present with unshallow history. So a version that never reached a commit is a
version the portal can never show — `git.ts` calls that state `never-written`,
and it is permanent.

Two ways to get there, and only one is recoverable:

  bumped, not committed      v1 committed, working tree says v2.
                             Fine right now; commit and it is history.

  bumped twice, committed    v1 committed, edited to v2, edited again to v3,
  once                       then committed. v2 existed only in a working tree
                             and can never be reached again.

The second is what this guards. Every edit here goes through Claude, so the
warning goes to Claude — as `additionalContext`, which is fed back into the
model rather than shown and forgotten.

Never blocks. A half-written entity mid-task is a legitimate state; the point is
that the turn should not END in one.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ENTITY = re.compile(r"(^|/)solutions/[^/]+/.*index\.md$")
VERSION = re.compile(r"^version:\s*(\d+)\s*$", re.M)


def repo_root() -> Path:
    out = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True
    )
    return Path(out.stdout.strip()) if out.returncode == 0 else Path.cwd()


def version_in(text: str):
    m = VERSION.search(text or "")
    return int(m.group(1)) if m else None


def committed_version(root: Path, rel: str):
    """The version at HEAD, or None when the file is new or unreadable there."""
    out = subprocess.run(
        ["git", "show", f"HEAD:{rel}"], capture_output=True, text=True, cwd=root
    )
    return version_in(out.stdout) if out.returncode == 0 else None


def working_version(path: Path):
    try:
        return version_in(path.read_text(encoding="utf8", errors="replace"))
    except OSError:
        return None


def emit(event: str, context: str) -> None:
    """Feed the finding back to the model; never block."""
    json.dump(
        {
            "hookSpecificOutput": {"hookEventName": event, "additionalContext": context},
            "suppressOutput": True,
        },
        sys.stdout,
    )
    sys.exit(0)


def changed_entities(root: Path):
    """Entity documents that differ from HEAD, tracked or not."""
    out = subprocess.run(
        ["git", "status", "--porcelain", "--", "solutions"],
        capture_output=True,
        text=True,
        cwd=root,
    )
    for line in out.stdout.splitlines():
        rel = line[3:].strip().strip('"')
        if ENTITY.search(rel):
            yield rel


def one_file(root: Path, rel: str):
    """(working, committed, message) for a single entity, message None when fine."""
    working = working_version(root / rel)
    committed = committed_version(root, rel)
    srn = "srn://" + rel[len("solutions/") : -len("/index.md")]

    if working is None:
        return working, committed, None
    if committed is None:
        return working, committed, None  # new entity: its first commit carries v1
    if working == committed:
        return working, committed, None  # E_VER_UNBUMPED is the checker's job
    if working == committed + 1:
        return (
            working,
            committed,
            f"{srn} is now v{working}; HEAD still has v{committed}. "
            f"Commit before editing this entity again — a second bump before a commit "
            f"leaves v{working} with no commit, and the portal can never show it.",
        )
    if working > committed + 1:
        lost = ", ".join(f"v{n}" for n in range(committed + 1, working))
        return (
            working,
            committed,
            f"{srn} jumped v{committed} -> v{working} with no commit between. "
            f"{lost} will never exist in git and the portal will report them "
            f"'never-written'. Commit each version as you reach it.",
        )
    return (
        working,
        committed,
        f"{srn} is v{working} in the tree but HEAD has the HIGHER v{committed} — "
        f"a version regression (E_VER_REGRESSION).",
    )


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        payload = {}

    root = repo_root()
    mode = sys.argv[1] if len(sys.argv) > 1 else "--edited"

    if mode == "--edited":
        target = (payload.get("tool_input") or {}).get("file_path") or (
            payload.get("tool_response") or {}
        ).get("filePath")
        if not target or not ENTITY.search(str(target)):
            sys.exit(0)
        try:
            rel = str(Path(target).resolve().relative_to(root))
        except ValueError:
            sys.exit(0)
        _, _, message = one_file(root, rel)
        if message:
            emit("PostToolUse", message)
        sys.exit(0)

    # --summary, at Stop: nothing should be left bumped-but-uncommitted.
    pending = []
    for rel in changed_entities(root):
        working, committed, _ = one_file(root, rel)
        if working is not None and committed is not None and working != committed:
            srn = "srn://" + rel[len("solutions/") : -len("/index.md")]
            pending.append(f"  {srn}  v{committed} in HEAD -> v{working} in the tree")
    if pending:
        emit(
            "Stop",
            "Entity versions bumped but not committed:\n"
            + "\n".join(pending)
            + "\n\nCommit them. A version with no commit is one the portal can never "
            "rebuild, and editing the entity again before committing destroys it "
            "permanently.",
        )
    sys.exit(0)


if __name__ == "__main__":
    main()
