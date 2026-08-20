import { Map as MapIcon } from 'lucide-react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCatalog } from '@/lib/catalog'

export const metadata: Metadata = { title: 'Map' }

/**
 * `/map` has no map of its own to show.
 *
 * A map is always a map OF something, and with more than one solution in the
 * catalog there is no defensible default beyond "the first one". So this route
 * exists only to hand the reader to `/map/{solution}` — which is where the
 * state actually lives, and what a shared link has to carry. The masthead can
 * then link to a stable address without knowing which solutions exist.
 */
export default async function MapIndexPage() {
  const catalog = await getCatalog()
  const first = catalog.solutions[0]
  if (first) redirect(`/map/${first.replace('srn://', '')}`)

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
        <MapIcon className="size-7 text-muted-foreground" aria-hidden />
        <h1 className="text-base font-medium">No solution to map</h1>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          The map draws products and components. Add a solution to the catalog and it will appear here.
        </p>
      </div>
    </div>
  )
}
