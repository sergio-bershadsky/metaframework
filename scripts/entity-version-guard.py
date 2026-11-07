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

The second is what this guards, in four places (ADR 0025 amends 0023):

  --edited   PostToolUse on Edit/Write: names the bump at the moment of the edit.
  --bash     PostToolUse on Bash: the same, for sed/python edits the Edit
             matcher never sees — reports only damage (jumps, regressions).
  --summary  Stop: blocks the turn ONCE when bumps are left uncommitted, and
             tells Claude to ask the owner — never to commit on its own.
  --staged   git pre-commit (.githooks/pre-commit): refuses a commit whose
             staged version skips one or goes down. The only mode that blocks
             outright, because it is the moment the damage would become history.

`metaframework check --since` is the CI gate behind all of them.
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


def staged_version(root: Path, rel: str):
    """The version in the index — what the commit being made will carry."""
    out = subprocess.run(
        ["git", "show", f":{rel}"], capture_output=True, text=True, cwd=root
    )
    return version_in(out.stdout) if out.returncode == 0 else None


def parent_versions(root: Path, rel: str):
    """Versions in every parent of the commit being made: HEAD, plus MERGE_HEAD
    while a conflicted merge is being concluded — a branch that committed v2 and
    v3 separately legitimately brings v3 against a HEAD still at v1."""
    versions = [committed_version(root, rel)]
    merge = subprocess.run(
        ["git", "rev-parse", "-q", "--verify", "MERGE_HEAD"],
        capture_output=True, text=True, cwd=root,
    )
    if merge.returncode == 0:
        out = subprocess.run(
            ["git", "show", f"MERGE_HEAD:{rel}"], capture_output=True, text=True, cwd=root
        )
        versions.append(version_in(out.stdout) if out.returncode == 0 else None)
    return [v for v in versions if v is not None]


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
    root = repo_root()
    mode = sys.argv[1] if len(sys.argv) > 1 else "--edited"

    # Git hands a hook whatever stdin the committer had — often a terminal — so
    # reading it there would hang the commit. Only Claude Code sends a payload.
    if mode == "--staged":
        sys.exit(staged(root))

    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        payload = {}

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

    if mode == "--bash":
        damage = []
        for rel in changed_entities(root):
            working, committed, message = one_file(root, rel)
            if message and working is not None and committed is not None and working != committed + 1:
                damage.append(message)
        if damage:
            emit("PostToolUse", "\n".join(damage))
        sys.exit(0)

    # --summary, at Stop: nothing should be left bumped-but-uncommitted.
    pending = []
    for rel in changed_entities(root):
        working, committed, _ = one_file(root, rel)
        if working is not None and committed is not None and working != committed:
            srn = "srn://" + rel[len("solutions/") : -len("/index.md")]
            pending.append(f"  {srn}  v{committed} in HEAD -> v{working} in the tree")
    if pending and not payload.get("stop_hook_active"):
        # Block once per turn. stop_hook_active is set on the continuation this
        # block causes, so the second Stop passes and there is no loop.
        json.dump(
            {
                "decision": "block",
                "reason": "Entity versions bumped but not committed:\n"
                + "\n".join(pending)
                + "\n\nA version with no commit is one the portal can never rebuild, and "
                "editing the entity again before committing destroys it. Do NOT commit on "
                "your own: ask the owner (AskUserQuestion) whether to commit these now, "
                "listing the entities and their versions, then end the turn.",
            },
            sys.stdout,
        )
    sys.exit(0)


def staged(root: Path) -> int:
    """pre-commit: refuse a staged version that skips a number or goes down."""
    out = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=AM", "--", "solutions"],
        capture_output=True, text=True, cwd=root,
    )
    problems = []
    for rel in out.stdout.splitlines():
        rel = rel.strip().strip('"')
        if not ENTITY.search(rel):
            continue
        new = staged_version(root, rel)
        parents = parent_versions(root, rel)
        if new is None or not parents:
            continue  # unreadable, or a new entity whose first commit carries it
        srn = "srn://" + rel[len("solutions/") : -len("/index.md")]
        top = max(parents)
        if new > top + 1:
            lost = ", ".join(f"v{n}" for n in range(top + 1, new))
            problems.append(
                f"  {srn}: v{top} -> v{new} in one commit; {lost} would never exist in git."
            )
        elif new < min(parents):
            problems.append(f"  {srn}: v{min(parents)} -> v{new}, a version going down.")
    if not problems:
        return 0
    sys.stderr.write(
        "pre-commit: entity versions must step by one, one commit per step.\n"
        + "\n".join(problems)
        + "\n\nThe portal rebuilds @N from the commit carrying `version: N`. Commit the\n"
        "intermediate version first (set it back, commit, bump again, commit).\n"
    )
    return 1


if __name__ == "__main__":
    main()
