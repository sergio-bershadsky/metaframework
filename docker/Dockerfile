# The portal, as one image — built here, placed twice.
#
# ADR 0005 decided two topologies over one artifact set: `docker/compose.yaml`
# places this image on a laptop and `docker/chart/` places the same image on a
# cluster. Neither of them builds anything the other does not, and this file is
# the only thing either of them builds.
#
# Build it from the REPOSITORY ROOT, never from this directory:
#
#   docker build -f docker/Dockerfile -t metaframework-portal .
#
# The context has to sit above this file because the image is assembled out of
# `framework/portal/` and the repository-root `LICENSE`. Compose says the same
# thing as `context: ..` with `dockerfile: docker/Dockerfile`.
#
# Two things are deliberately absent, and their absence is the design:
#
#  - **The catalog.** It arrives as a mount named by `CATALOG_DIR`. An image
#    with somebody's `solutions/` baked inside it is not one image, it is one
#    image per catalog, and the second reader of it cannot tell which. The
#    build cannot bake one in even by accident: `docker/Dockerfile.dockerignore`
#    keeps the catalog out of the build context entirely.
#  - **A supervisor.** ADR 0005 rejects "a single Dockerfile running everything
#    under a supervisor", so this image runs exactly one process: the portal's
#    compiled server. `catalog-router`, `repo-sync` and `signoz` are separate
#    placements in the topologies and separate containers if they ever exist —
#    none of them has a line of code today, which is reported rather than
#    papered over.

# Node, once, for both stages — the build and the run must not disagree about
# the runtime, and one ARG is how that is enforced rather than remembered. It
# holds a whole tag rather than a version, and is named for that: the official
# images already export `NODE_VERSION=22.23.2` into the environment, and a build
# argument sharing the name while holding `22-bookworm-slim` would be two
# different answers to one word.
#
# 22 because that is what `.github/workflows/ci.yml` runs the suite on, so the
# image runs the Node the repository is actually tested against. The package's
# floor is `>=20.9.0` — re-proved by a later step of that same job against the
# packaged CLI, and held in `bin/metaframework.mjs` by spelling `__dirname` the
# long way. Nothing in this file needs anything above it, so
# `--build-arg NODE_TAG=20.9.0-bookworm-slim` reproduces the floor exactly
# and `24-bookworm-slim` (Active LTS) moves up. The default is not the floor
# because Node 20 reached end of security support on 2026-04-30, and a runtime
# image is the one place that matters.
#
# Debian slim rather than Alpine: the traced `node_modules` carries no native
# `.node` binary today, but Next resolves `@next/swc-*` and `@img/*` by libc,
# and a musl base turns "the trace changed" into a link error at runtime rather
# than a build failure here.
ARG NODE_TAG=22-bookworm-slim

# --------------------------------------------------------------------- build
FROM node:${NODE_TAG} AS build

# The build is offline apart from the registry: the portal self-hosts its fonts
# and bundles Monaco (see next.config.ts), so nothing else reaches out.
ENV NEXT_TELEMETRY_DISABLED=1

# NODE_ENV is deliberately NOT production here. Every dependency this portal has
# is a devDependency — there is no `dependencies` block in package.json at all —
# so an install under NODE_ENV=production would fetch nothing and `next build`
# would fail on the first import.

WORKDIR /src/framework/portal

# The lockfile on its own layer, ahead of the source. The install is the slow
# step and it depends on nothing else; editing a component must not reinstall
# Next.
COPY framework/portal/package.json framework/portal/package-lock.json ./

# `npm ci` is what this line wants to be, and it cannot be today. The tracked
# framework/portal/package-lock.json is missing four entries that a Linux ideal
# tree requires, and npm refuses the entire install over them:
#
#   npm error `npm ci` can only install packages when your package.json and
#   npm error package-lock.json ... are in sync.
#   npm error Missing: @emnapi/runtime@1.11.3 from lock file
#   npm error Missing: @emnapi/core@1.11.3 from lock file
#
# Not a container artefact and not this file's doing: the same lockfile fails
# `npm ci` in `.github/workflows/ci.yml`, and has since 2026-08-21 — run
# 32513522676 on main dies on this exact error 13 seconds in. Reproduced here on
# 2026-08-22 with npm 10.1.0, 10.9.8 and 11.17.0, on linux/arm64 and linux/amd64
# alike; the same file installs cleanly under npm 11.6.2 on darwin/arm64, which
# is where it was written. `--omit=optional` does not help — npm validates the
# whole lock before it applies the filter.
#
# `npm install` is not a licence to float. With a lockfile present npm keeps
# every version it pins and adds only what is missing: regenerating the lock
# inside this base image and diffing it against the tracked one gives four
# entries added (`@emnapi/core` and `@emnapi/runtime`, hoisted and again under
# `@tailwindcss/oxide-wasm32-wasi`), nothing removed and no version changed.
# What they are is the runtime of the wasm fallbacks, which never loads while
# the native bindings are there.
#
# This line becomes `npm ci` again on the day the lockfile is regenerated on
# Linux, which is also the day CI goes green. Until then it is one command with
# its reason attached, rather than a `npm ci || npm install` that would hide the
# defect from the next reader and from CI at the same time.
RUN npm install --no-audit --no-fund

# The terms travel with every copy, and an image is a copy.
# `scripts/assemble-standalone.mjs` reads the repository-root LICENSE and stops
# the build if it is missing or has lost its `Required Notice:` line, which is
# PolyForm Noncommercial's obligation rather than a courtesy. It lands at
# /src/LICENSE because the script looks two directories above the portal.
COPY LICENSE /src/LICENSE

COPY framework/portal ./

# `next build` with `output: 'standalone'`, then assemble-standalone.mjs, which
# is not optional finishing: it copies `.next/static` and `public/` into the
# traced tree (Next leaves them out assuming a CDN, and there is none in front
# of this), rewrites the manifest so `"type": "module"` matches the ESM
# `server.js` Next emitted, and drops the Monaco chunks no server render can
# reach. Its own comment on the first of those: "the server boots, HTML renders,
# and every stylesheet and script 404s".
RUN npm run package

# ------------------------------------------------------------------- runtime
FROM node:${NODE_TAG} AS runtime

WORKDIR /app

# The whole of the assembled tree and nothing else: server.js, .next/, the
# traced slice of node_modules, public/, the rewritten package.json, LICENSE.
# `src/`, the tests and `framework/spec/` are absent for the same reason CI's
# pack audit fails the build if they reach the published tarball — nothing reads
# them at runtime.
#
# `bin/` is absent for a different reason, and it is a choice rather than an
# oversight. The CLI is the published entry point, but it is a launcher for a
# laptop: it walks up from `cwd` looking for a catalog, claims the port before
# the server can, defaults to 127.0.0.1, and forces METAFRAMEWORK_MODE. A
# container has already answered every one of those questions — the mount, the
# port, the bind address, the mode — so shipping the launcher would ship a
# second, quieter answer to each. `docker exec` against /api/status gives the
# same diagnostics `metaframework check` prints.
#
# Owned by `node` (uid 1000, the user the official images already carry) as the
# files are written, rather than chowned in a later RUN: a second pass over the
# whole tree would copy every one of those files into a second layer to change
# one field. The number is the placements' business too: whatever they mount at
# /catalog has to be readable by uid 1000, or the user has to be overridden in
# both topologies at once.
COPY --from=build --chown=node:node /src/framework/portal/.next/standalone ./

# The mount point, so that an image started with no volume behind it still has
# a directory to read. The loader answers a missing catalog with an empty one
# (`readdir(...).catch(() => [])`), so the failure mode for a forgotten mount is
# a portal reporting zero solutions — visible on the page and in /api/status —
# rather than a crash loop that hides the typo.
RUN mkdir -p /catalog && chown node:node /catalog

# Nothing here writes, and the standalone server has never needed root.
USER node

# The listen port. NODE_ENV is not declared beside it on purpose: `server.js`
# sets it to production itself, and a second declaration would be a second
# answer to a question that already has one.
ENV PORT=3000

# Load-bearing, not decoration. `server.js` takes its BIND ADDRESS from
# $HOSTNAME, and both Docker and Kubernetes set $HOSTNAME to a name (the
# container id, the pod name). Inherited, the server tries to bind a hostname
# and dies with EADDRNOTAVAIL — the same trap `bin/metaframework.mjs` documents
# and overwrites for the same reason.
ENV HOSTNAME=0.0.0.0

# Where the catalog is expected. Named rather than discovered: the walk-up
# search lives in bin/discover.mjs, which is the CLI and is not in this image;
# `server.js` on its own would fall back to `<cwd>/../../solutions`.
ENV CATALOG_DIR=/catalog

# The catalog is a mount, so it can change while this process runs — which is
# precisely the premise `deployment` mode denies ("a catalog that was fixed when
# the image was made", src/lib/catalog/mode.ts). It was not; it was mounted.
# Left to infer, `server.js` sets NODE_ENV=production and the mode would come
# out `deployment`: every edit under a bind mount, and every mirror repo-sync
# writes onto the volume, would stay invisible until the container restarted.
#
# The cost is a stat-walk of the catalog per request, measured at ~7ms for 862
# entries in fingerprint.ts's own note. Set METAFRAMEWORK_MODE=deployment when
# the mount is genuinely read-only and frozen; that is a placement's decision,
# and both topologies are free to make it.
ENV METAFRAMEWORK_MODE=working-tree

# OpenTelemetry at the boundary, per ADR 0004 — the configuration surface, and
# nothing behind it. There is no SDK and no exporter in this image; these are
# the two variables `environment/production/config.yaml` names, declared here so
# that `docker inspect` answers "what telemetry can this be pointed at" without
# anyone reading the chart.
#
# Empty rather than absent, because a Dockerfile has no way to declare a
# variable without a value — and because the OpenTelemetry environment-variable
# specification requires it to mean the same thing: "The SDK MUST interpret an
# empty value of an environment variable the same way as when the variable is
# unset."
ENV OTEL_EXPORTER_OTLP_ENDPOINT= \
    OTEL_SERVICE_NAME=

# Documentation, not a published port — the placement decides what to publish.
# 3000 is the standalone server's own default and the only port number anywhere
# in the catalog (`environment/local/config.yaml`); the deployment environments
# name none, so inventing a different one would invent it twice.
EXPOSE 3000

# /api/status is the endpoint that already answers this question — it is what
# `metaframework check` polls, which is how CI proves the catalog end to end. A
# 200 from it means the catalog has finished parsing, which is later than the
# port opening: the standalone server answers 404 for a window after it prints
# its own "Ready", and a check without a start period would kill a server three
# hundred milliseconds from working. That window is what `--start-period` is for,
# and it is why the probe does not treat 404 as healthy — a permanent 404 is a
# broken route table and should be seen.
#
# `r.ok` and nothing else. It is tempting to fail the check when the catalog has
# errors, since the endpoint reports them; that would be backwards. A catalog
# with errors is still served on purpose, and /diagnostics is where a reader
# goes to see them — an orchestrator that killed the container for it would
# remove the only thing able to explain the failure.
#
# `node -e` rather than curl or wget so that no package has to be installed into
# a runtime image to ask it one question; `fetch` has been global since Node 18.
#
# `--start-interval` needs Docker 25 or newer (API 1.44). It is worth the floor:
# without it the first probe does not run until `--interval` has elapsed, so a
# container ready in four seconds reports `starting` for thirty, and anything
# waiting on `service_healthy` waits with it.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# One process. Next's own `startServer` installs SIGINT/SIGTERM handlers —
# "Make sure commands gracefully respect termination signals (e.g. from Docker)"
# — and exits 143 on SIGTERM, so PID 1 here stops when it is told to and there
# is nothing for an init shim to reap.
CMD ["node", "server.js"]

LABEL org.opencontainers.image.title="metaframework portal" \
      org.opencontainers.image.description="Serves a metaframework solution catalog, mounted at CATALOG_DIR" \
      org.opencontainers.image.source="https://github.com/sergio-bershadsky/metaframework" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"
