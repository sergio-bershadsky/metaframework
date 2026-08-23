import { catalogDir, getCatalog } from '@/lib/catalog'
import { catalogRoot } from '@/lib/catalog/load'
import { servingMode, servingWorkingTree } from '@/lib/catalog/mode'
import { historyDependentDatamodels } from '@/lib/datamodel/additive'
import { historyAvailability } from '@/lib/history/git'

/**
 * What the CLI knows about the catalog it just started serving.
 *
 * The `metaframework` bin cannot read the catalog itself: the loader is
 * TypeScript compiled into the server bundle, and a second copy of it in the
 * CLI would be a second answer to "is this catalog valid" — the one thing this
 * product exists to have exactly one of. So the CLI asks the server it started.
 * That makes this route three things at once, all of them the same request:
 *
 *  - the readiness probe (`metaframework` polls it until it answers 200, which
 *    is also the moment the catalog has finished parsing),
 *  - the source of the startup banner's counts,
 *  - the whole of `metaframework check`, which is why `diagnostics.items`
 *    carries the full list rather than a summary. CI needs the file and the
 *    rule, not a number.
 *
 * The absolute catalog path is withheld from a deployment. Serving somebody's
 * filesystem layout to the internet is nobody's requirement; locally it is the
 * first thing the user needs to see confirmed.
 *
 * Two fields say what the counts cannot, and both exist because their absence
 * made this route report a clean catalog it had not read or had not fully
 * checked. `catalogRoot` distinguishes a directory holding no solutions from one
 * nothing could read — a forgotten mount is otherwise a green healthcheck over
 * an empty "valid" portal. `history` says whether the git-backed rules could run
 * at all; the published image has no git binary, so there it is the difference
 * between "no findings" and "the checks that find them did not execute".
 *
 * `history` carries `complete` beside `available` because the case that hurts is
 * neither of the obvious two. A shallow clone — `actions/checkout`'s default, so
 * most CI — answers every git call and then stops at its graft point, which
 * silently exempted every datamodel from the additive-schema rule while this
 * route reported `available: true`. `uncheckedDatamodels` says what that cost,
 * and is zero whenever the answer is "nothing", so the report is a measurement
 * rather than a standing caveat nobody reads.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const catalog = await getCatalog()
  // Whether the directory was read at all, which the counts below cannot say:
  // an unmounted volume and a catalog nobody has authored into yet both come
  // back as zero solutions. The healthcheck in front of this route is the whole
  // reason it matters — a green container over a mount that never happened.
  const root = await catalogRoot(catalogDir())
  // And whether the git-backed rules could run. The diagnostics below are the
  // same list either way — `datamodelEvolutionDiagnostics` adds nothing it
  // cannot establish — so without this the verdict is silent about a whole
  // class of check having been skipped. Reported, never counted: an accusation
  // nobody could support is not a diagnostic.
  //
  // `uncheckedDatamodels` is what turns that report from a caveat into a
  // measurement. A limited history costs this catalog exactly the datamodels
  // that would have needed a predecessor commit, and where that is zero there
  // is nothing to warn about — the day-one catalog in a repository with no
  // commits is fully checked, and telling its author otherwise is noise that
  // teaches them to skip the line that will one day matter.
  const history = await historyAvailability({ catalogDir: catalogDir() })
  const limited = !history.available || !history.complete
  const uncheckedDatamodels = limited ? historyDependentDatamodels(catalog).length : 0

  // Counted the way the home page counts them: a top-level directory with no
  // index.md is listed as a solution by the loader but has no entity behind it,
  // and the banner must not promise a card that is not there.
  const solutions = catalog.solutions.filter((srn) => catalog.entities.has(srn)).length

  const errors = catalog.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

  return Response.json(
    {
      mode: servingMode(),
      catalogDir: servingWorkingTree() ? catalogDir() : null,
      // `reason` is a fixed clause and carries no path, so it is reported in
      // both modes; a history *message* can quote the directory it failed on,
      // and so follows `catalogDir` in being withheld from a deployment.
      catalogRoot: { readable: root.readable, reason: root.reason },
      history: {
        available: history.available,
        // A shallow clone reads *some* commits and not the ones this catalog
        // needs, which is why "available" alone was the shape that let a real
        // `E_DM_NOT_ADDITIVE` disappear under `actions/checkout`'s default.
        complete: history.complete,
        reason: history.limit,
        message: servingWorkingTree() ? history.message : null,
        // Like `reason`, a fixed clause naming no path — so it survives into a
        // deployment, where it is the only actionable half of the report.
        hint: history.hint ?? null,
        uncheckedDatamodels,
      },
      solutions,
      entities: catalog.entities.size,
      diagnostics: {
        errors: errors.length,
        warnings: catalog.diagnostics.length - errors.length,
        items: catalog.diagnostics,
      },
    },
    // The catalog moves under a working tree; a cached status is a lie about a
    // tree that has since changed.
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
