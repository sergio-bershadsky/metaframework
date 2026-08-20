'use client'

import { Map as MapIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { solutionOfPath, useRailSettings } from '@/lib/ui/rail-settings'

/**
 * The masthead's way into the map, pointed at the solution the reader is in.
 *
 * The rail answers "where is X"; the map answers "how is this put together".
 * Different questions, so the map gets its own way in rather than living inside
 * a tree node.
 *
 * It used to link to `/map`, which redirects to `catalog.solutions[0]` — the
 * first solution on disk, alphabetically `acme`, a fixture. So a reader deep in
 * the metaframework's own catalog, with the rail focused on it, clicked Map and
 * landed on somebody else's system. The redirect is not wrong: `/map` genuinely
 * has no map of its own to show, and "the first one" is the only answer a route
 * with no context can give. Context is what the masthead has and the route does
 * not, so the resolution moves here.
 *
 * Precedence is the open route, then the focused solution, then the route's own
 * guess. The route wins because it is the more specific statement of where the
 * reader is — a focus is a standing preference, an open page is a fact — and
 * with the rail now following the entity across a solution boundary the two only
 * disagree for the render in which the reader is arriving. A map already open
 * counts as the open route for the same reason: `/map` would otherwise bounce a
 * reader looking at brass over to the first solution on disk.
 */
export function MapLink() {
  const pathname = usePathname()
  const { focus } = useRailSettings()

  const solution = solutionOfPath(pathname) ?? solutionOfMapPath(pathname) ?? (focus || null)
  // `/map` is the fallback and not an error: with no entity open and no focus
  // chosen there is nothing to be contextual about, and the route's redirect is
  // then exactly the right behaviour.
  const href = solution ? `/map/${solution.replace('srn://', '')}` : '/map'

  return (
    <Link
      href={href}
      className="focusable flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
    >
      <MapIcon className="size-3.5" aria-hidden />
      Map
    </Link>
  )
}

/** `/map/{solution}` → that solution's SRN. `/map` itself has no answer. */
function solutionOfMapPath(pathname: string): string | null {
  if (!pathname.startsWith('/map/')) return null
  const first = pathname.slice('/map/'.length).split('/')[0]
  return first ? `srn://${decodeURIComponent(first)}` : null
}
