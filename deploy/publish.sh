#!/usr/bin/env bash
# Publish the catalog to https://metaframework.dev.
#
# Validate, crawl the local portal to static HTML, deploy the asset store. The
# published site is a snapshot: running this is what makes a catalog change
# visible.
#
# The Cloudflare credential lives in the repository-root .env (gitignored) and is
# never printed, never passed on a command line where `ps` could read it, and
# never sent anywhere but Cloudflare.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
PORT="${PORT:-6390}"
CLI="$REPO/framework/portal/bin/metaframework.mjs"

echo "==> validating — never publish a catalog that does not check"
node "$CLI" check --dir "$REPO/solutions"

echo "==> building the portal so the crawl serves current code"
npm --prefix "$REPO/framework/portal" run package >/dev/null

echo "==> serving the catalog on :$PORT"
node "$CLI" --dir "$REPO/solutions" --port "$PORT" --no-watch >/tmp/metaframework-publish.log 2>&1 &
PORTAL=$!
trap 'kill "$PORTAL" 2>/dev/null || true' EXIT
for _ in $(seq 1 45); do
  curl -sf -o /dev/null -m 2 "http://127.0.0.1:$PORT/" && break || sleep 2
done

echo "==> crawling to ./public"
rm -rf "$HERE/public"
python3 "$HERE/crawl.py" "http://127.0.0.1:$PORT"

# The crawl captures HTML only; the chunks it references are built assets.
mkdir -p "$HERE/public/_next"
cp -R "$REPO/framework/portal/.next/standalone/.next/static" "$HERE/public/_next/static"
for f in favicon.ico icon.svg; do
  curl -sf "http://127.0.0.1:$PORT/$f" -o "$HERE/public/$f" || true
done
echo "    $(find "$HERE/public" -type f | wc -l | tr -d ' ') files, $(du -sh "$HERE/public" | cut -f1)"

echo "==> deploying"
if [ -f "$REPO/.env" ]; then
  set -a; . "$REPO/.env"; set +a
fi
: "${CF_TOKEN:?CF_TOKEN is not set — see .env.example}"
: "${CF_ACCOUNT:?CF_ACCOUNT is not set — see .env.example}"
export CLOUDFLARE_API_TOKEN="$CF_TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$CF_ACCOUNT"
cd "$HERE"
npx --yes wrangler@4 deploy "$@"

echo "==> done — https://metaframework.dev"
