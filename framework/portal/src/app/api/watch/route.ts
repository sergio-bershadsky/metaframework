import { catalogDir } from '@/lib/catalog'
import { liveReloadEnabled, servingWorkingTree } from '@/lib/catalog/mode'
import { watchCatalog } from '@/lib/catalog/watch'

/**
 * The live-reload stream: one held-open connection per browser tab, one event
 * per real change to the catalog on disk.
 *
 * Server-sent events rather than a websocket because the traffic is one-way and
 * two bytes wide — the browser never tells the server anything — and because
 * `EventSource` reconnects by itself, which is the whole error-handling story
 * for a laptop that was asleep.
 *
 * **This route ships in every build, and answers 404 in a deployed one.** A
 * deployment serves a catalog that cannot move under it, so there is nothing to
 * announce and no watcher to start; the alternative — compiling the route out —
 * would mean two different route tables for one bundle, and a client that asks
 * for a route the build removed gets the same 404 anyway. The client only
 * connects in working-tree mode, so in practice nobody asks.
 */

// fs.watch rules out the edge runtime; say so rather than rely on the default.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Comment frames keep proxies and idle connections from dropping the stream. */
const HEARTBEAT_MS = 25_000

export async function GET(request: Request): Promise<Response> {
  if (!servingWorkingTree()) {
    return Response.json({ error: 'live reload is only served for a working tree' }, { status: 404 })
  }
  // The client is not rendered under `--no-watch`, so nothing should ask; a
  // browser left open from before the flag was passed still might.
  if (!liveReloadEnabled()) {
    return Response.json({ error: 'live reload is disabled (--no-watch)' }, { status: 404 })
  }

  const watch = watchCatalog(catalogDir())
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      const send = (frame: string): void => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(frame))
        } catch {
          // The consumer went away between the abort event and this write.
          open = false
        }
      }

      // Subscribing is what starts the watcher, so the strategy is only known
      // afterwards — hence this order, not the other one.
      const unsubscribe = watch.subscribe((fingerprint) => {
        send(`event: change\ndata: ${JSON.stringify({ fingerprint })}\n\n`)
      })

      // The opening frame is what proves the connection works end to end, and
      // it carries the strategy so a reader can tell live reload apart from
      // live reload that quietly degraded.
      send(`event: ready\ndata: ${JSON.stringify({ strategy: watch.strategy })}\n\n`)

      const heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS)
      heartbeat.unref?.()

      const close = (): void => {
        if (!open) return
        open = false
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // Already closed by the runtime; nothing left to do.
        }
      }

      request.signal.addEventListener('abort', close)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // `no-transform` is the part that matters: a proxy that gzips this stream
      // buffers it, and a buffered event stream is a stream that never arrives.
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      // nginx's own opt-out of the same buffering.
      'X-Accel-Buffering': 'no',
    },
  })
}
