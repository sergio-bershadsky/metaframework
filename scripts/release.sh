#!/usr/bin/env bash
#
# Publish @bershadsky/metaframework to npm, headlessly.
#
# The account has `two-factor auth: auth-and-writes`, and the second factor is a
# security key. npm supports that — lib/utils/auth.js takes the "web otp" branch
# and opens a browser for the WebAuthn ceremony — but only with a TTY:
# lib/utils/open-url.js returns early when `!process.stdin.isTTY`. So an
# interactive publish cannot happen from a pipe, a CI runner, or an agent.
#
# An npm **Automation** token is the documented way around that: it carries the
# 2FA bypass, which is exactly what CI publishing relies on. This script feeds
# one to npm through NPM_TOKEN, which framework/portal/.npmrc references.
#
# The token is never printed, never passed on a command line (where it would
# reach `ps`), and never written anywhere but the .env this reads.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  # `set -a` exports everything the file defines, so npm's own env expansion in
  # .npmrc can see NPM_TOKEN. Sourcing rather than parsing keeps quoting rules
  # the shell's problem instead of this script's.
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${NPM_TOKEN:-}" ]; then
  cat >&2 <<'MSG'
release: NPM_TOKEN is not set.

  1. npmjs.com -> Access Tokens -> Generate New Token -> Classic -> Automation
     (Automation carries the 2FA bypass; a Publish token will still demand the
     security key, which cannot be presented without a TTY.)
  2. Put it in .env at the repository root:

       NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

.env is gitignored (`.env*`), and this repository is public — check that the
token never reaches a commit. See .env.example.
MSG
  exit 1
fi

case "$NPM_TOKEN" in
  npm_*) ;;
  *)
    echo "release: NPM_TOKEN does not look like an npm token (expected an 'npm_' prefix)." >&2
    exit 1
    ;;
esac

# Prove the credential works before spending a full build on it. `npm whoami`
# is the cheapest call that exercises the token rather than the user-level
# ~/.npmrc, because framework/portal/.npmrc overrides that for this registry.
cd framework/portal
who=$(npm whoami 2>&1) || {
  echo "release: the token was refused by the registry:" >&2
  echo "  $who" >&2
  exit 1
}
echo "release: authenticated as $who"

# `npm publish` runs prepack, so this is a full build + assemble + pack.
exec npm publish "$@"
