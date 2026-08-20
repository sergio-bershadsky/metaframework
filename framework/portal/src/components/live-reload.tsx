'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Listens to /api/watch and re-renders the page when the catalog on disk moves.
 *
 * `router.refresh()`, deliberately, and not `location.reload()`. Refresh asks
 * the server for the current route again and merges the new server-component
 * payload into the live tree: the rail keeps the branches the reader expanded,
 * the page keeps its scroll position, an open diagram keeps its pan and zoom,
 * and the filter box keeps what was typed into it. A full reload throws all of
 * that away, and losing your place on every save is exactly the thing this
 * feature exists to avoid.
 *
 * Mounted only where the portal serves a working tree — see the console layout.
 * Renders nothing.
 */
export function LiveReload() {
  const router = useRouter()

  useEffect(() => {
    // EventSource reconnects on its own after a drop, which covers the two
    // cases that actually happen: the server restarting, and a laptop waking up.
    const source = new EventSource('/api/watch')

    const onChange = () => router.refresh()
    const onReady = (event: MessageEvent<string>) => {
      const strategy = (JSON.parse(event.data) as { strategy?: string }).strategy
      if (strategy === 'off') {
        console.warn('[metaframework] live reload is off on the server — reload after editing')
      }
    }

    source.addEventListener('change', onChange)
    source.addEventListener('ready', onReady)

    return () => {
      source.removeEventListener('change', onChange)
      source.removeEventListener('ready', onReady)
      source.close()
    }
  }, [router])

  return null
}
