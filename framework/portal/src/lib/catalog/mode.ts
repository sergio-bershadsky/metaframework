/**
 * Which of the two things this process is: a portal serving somebody's live
 * working tree, or a deployed build serving a catalog that was fixed when the
 * image was made.
 *
 * The distinction used to be spelled `NODE_ENV`, and that was wrong the moment
 * the portal shipped as a CLI. `next start` sets `NODE_ENV=production` because
 * that is what a compiled bundle is — it says nothing about whether the
 * filesystem underneath is going to move. The CLI runs a production build over
 * a directory the user is editing *right now*; a deployment runs the same
 * production build over a directory nobody will touch until the next release.
 * Same NODE_ENV, opposite answers to "may I read this once and keep it?".
 *
 * - **working-tree** — the filesystem is the source of truth on every request:
 *   fingerprint the catalog per request, re-read it when the fingerprint moves,
 *   and run a watcher so an open browser hears about the edit. `next dev` and
 *   the CLI are both this.
 * - **deployment** — the catalog is static input to a build: read once per
 *   process, no watcher, no per-request stat walk. This is still the right
 *   trade for a hosted portal and the decision record's reasoning for it stands.
 */
export type ServingMode = 'working-tree' | 'deployment'

/** The env var the CLI sets; also usable by hand to test either mode locally. */
export const MODE_ENV_VAR = 'METAFRAMEWORK_MODE'

const MODES: readonly string[] = ['working-tree', 'deployment']

/**
 * Read the mode. Explicit beats inferred: {@link MODE_ENV_VAR} decides when it
 * names a mode, and only then. An unrecognised value falls back to the NODE_ENV
 * inference rather than throwing — a typo in an env var must not stop a server
 * from serving, and the inference is the same answer this code gave before the
 * mode existed.
 *
 * Takes the environment as an argument so the predicate is pure and testable;
 * callers pass nothing and get `process.env`.
 */
export function servingMode(env: Partial<NodeJS.ProcessEnv> = process.env): ServingMode {
  const configured = env[MODE_ENV_VAR]
  if (configured && MODES.includes(configured)) return configured as ServingMode
  return env.NODE_ENV === 'production' ? 'deployment' : 'working-tree'
}

/** True when the catalog on disk may change under a running server. */
export function servingWorkingTree(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return servingMode(env) === 'working-tree'
}

/** The env var the CLI's `--no-watch` sets. */
export const LIVE_RELOAD_ENV_VAR = 'METAFRAMEWORK_LIVE_RELOAD'

const DISABLED = new Set(['0', 'off', 'false', 'no'])

/**
 * Whether to push reloads at the browser.
 *
 * A narrower switch than the mode, and deliberately so. `--no-watch` turns off
 * the *push* — the fs.watch subscription and the open SSE connection — and
 * nothing else: the per-request fingerprint still runs, so an edit is still on
 * screen the moment the reader reloads the page. Mapping the flag onto
 * `deployment` instead would have frozen the catalog at boot, which is the
 * behaviour that made a CLI-shaped portal useless in the first place, and the
 * flag's name would then be a lie about what it did.
 *
 * Off in a deployment regardless, because there is nothing to watch there.
 */
export function liveReloadEnabled(env: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  if (!servingWorkingTree(env)) return false
  const configured = env[LIVE_RELOAD_ENV_VAR]
  return !(configured && DISABLED.has(configured.toLowerCase()))
}
