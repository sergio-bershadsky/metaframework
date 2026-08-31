#!/usr/bin/env python3
"""
Crawl the locally served portal into a static tree for Cloudflare's asset store.

The portal renders every page at request time (`dynamic = 'force-dynamic'`), so
there is no `next export` to run: the only way to get static HTML is to ask a
running portal for it. That is what this does, following links from `/` until it
stops finding new ones.

The published site is therefore a SNAPSHOT. It does not track edits to
`solutions/`; running `publish.sh` is what makes a change visible.
"""
import re
import sys
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:6363"
OUT = Path(__file__).resolve().parent / "public"

# Routes that serve bytes rather than pages. They are followed and written
# verbatim, keeping the URL's own extension instead of becoming index.html.
RAW = re.compile(r"^/(schemas|artifacts)/")


def fetch(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=30) as r:
            return r.status, r.read(), r.headers.get("content-type", "")
    except urllib.error.HTTPError as e:
        return e.code, b"", ""
    except Exception as e:  # a portal that died mid-crawl must not look like a 404
        print(f"    ! {path}: {e}", file=sys.stderr)
        return 0, b"", ""


def dest(path):
    """A route becomes `<path>/index.html` so directory-style serving resolves it."""
    p = path.split("?")[0].split("#")[0].strip("/")
    if RAW.match("/" + p):
        return OUT / p
    return OUT / "index.html" if not p else OUT / p / "index.html"


def main():
    seen, queue = {"/"}, deque(["/"])
    pages, assets, failed = 0, 0, []
    while queue:
        route = queue.popleft()
        status, body, ctype = fetch(route)
        if status != 200:
            failed.append((route, status))
            continue
        f = dest(route)
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_bytes(body)
        if "html" in ctype:
            pages += 1
            for href in re.findall(rb'href="(/[^"#?]*)"', body):
                link = href.decode()
                if link not in seen and not link.startswith("/_next/"):
                    seen.add(link)
                    queue.append(link)
        else:
            assets += 1

    print(f"    {pages} pages, {assets} raw artifacts, {len(failed)} not written")
    for route, status in failed[:10]:
        print(f"      {status} {route}")
    # A crawl that reached almost nothing is a broken portal, not a small catalog.
    if pages < 50:
        raise SystemExit(f"crawl produced only {pages} pages — refusing to publish that")


if __name__ == "__main__":
    main()
