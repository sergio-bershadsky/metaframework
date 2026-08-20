import { catalogDir, getCatalog } from '@/lib/catalog'
import { servingMode, servingWorkingTree } from '@/lib/catalog/mode'

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
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  const catalog = await getCatalog()

  // Counted the way the home page counts them: a top-level directory with no
  // index.md is listed as a solution by the loader but has no entity behind it,
  // and the banner must not promise a card that is not there.
  const solutions = catalog.solutions.filter((srn) => catalog.entities.has(srn)).length

  const errors = catalog.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')

  return Response.json(
    {
      mode: servingMode(),
      catalogDir: servingWorkingTree() ? catalogDir() : null,
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
