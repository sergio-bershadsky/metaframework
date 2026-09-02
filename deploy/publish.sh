#!/usr/bin/env bash
# Publish the catalog to https://metaframework.dev and the schema documents to
# https://schemas.metaframework.dev.
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

# The deploy needs ACCOUNT-level Workers:Edit. It does NOT need zone access: the
# hostnames are attached once as zone Workers routes (see README.md), so a
# content update never touches DNS. `CF_TOKEN` in this repo's .env holds the
# zone half and not the account half, which is why an explicitly exported
# CLOUDFLARE_API_TOKEN wins over it.
if [ -f "$REPO/.env" ]; then
  set -a; . "$REPO/.env"; set +a
fi
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-${CF_DEPLOY_TOKEN:-${CF_TOKEN:-}}}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-${CF_ACCOUNT:-}}"
: "${CLOUDFLARE_API_TOKEN:?no token — set CF_DEPLOY_TOKEN in .env, or export CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?no account — set CF_ACCOUNT in .env}"

echo "==> checking the credential before spending a build on it"
code=$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts")
if [ "$code" != "200" ]; then
  cat >&2 <<MSG
publish: the token cannot reach Workers on this account (HTTP $code).

  A content deploy needs one grant:  Account -> Workers Scripts -> Edit
  It needs nothing at zone level; the hostnames are already routed.

  Set CF_DEPLOY_TOKEN in .env to a token that has it, or export
  CLOUDFLARE_API_TOKEN before running this.
MSG
  exit 1
fi

# BUILD FIRST, then validate. `metaframework check` runs the assembled
# standalone server, so on a clean checkout — which is what CI always is — the
# check cannot run until the build has produced one. Validating first read
# correctly and only ever worked on a machine that had built before.
echo "==> building the portal so the crawl serves current code"
npm --prefix "$REPO/framework/portal" run package >/dev/null

echo "==> validating — never publish a catalog that does not check"
node "$CLI" check --dir "$REPO/solutions"

echo "==> serving the catalog on :$PORT"
node "$CLI" --dir "$REPO/solutions" --port "$PORT" --no-watch >/tmp/metaframework-publish.log 2>&1 &
PORTAL=$!
trap 'kill "$PORTAL" 2>/dev/null || true' EXIT
for _ in $(seq 1 45); do
  curl -sf -o /dev/null -m 2 "http://127.0.0.1:$PORT/" && break || sleep 2
done

echo "==> crawling the catalog to ./public"
rm -rf "$HERE/public"
python3 "$HERE/crawl.py" "http://127.0.0.1:$PORT"

echo "==> crawling the schemas to ./schemas/public"
rm -rf "$HERE/schemas/public"
python3 "$HERE/crawl-schemas.py" "http://127.0.0.1:$PORT"

# The crawl captures HTML only; the chunks it references are built assets.
mkdir -p "$HERE/public/_next"
cp -R "$REPO/framework/portal/.next/standalone/.next/static" "$HERE/public/_next/static"
for f in favicon.ico icon.svg; do
  curl -sf "http://127.0.0.1:$PORT/$f" -o "$HERE/public/$f" || true
done
echo "    $(find "$HERE/public" -type f | wc -l | tr -d ' ') files, $(du -sh "$HERE/public" | cut -f1)"

echo "==> deploying"
# Two Workers, deployed in this order on purpose: a catalog page is readable
# whether or not its schemas resolve, but a schema host that lags the catalog
# hands tooling a stale document. Schemas last means they are never ahead.
( cd "$HERE" && npx --yes wrangler@4 deploy "$@" )
( cd "$HERE/schemas" && npx --yes wrangler@4 deploy "$@" )

echo "==> done"
echo "    https://metaframework.dev"
echo "    https://schemas.metaframework.dev   (every \$id in the catalog)"
