import { Hexagon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CatalogTree } from '@/components/catalog-tree'
import { DiagnosticsIndicator } from '@/components/diagnostics-indicator'
import { MapLink } from '@/components/map-link'
import { getCatalog } from '@/lib/catalog'
import { buildTree } from '@/lib/catalog/tree'

/**
 * Console chrome: a fixed rail on the left for the catalog, a thin masthead for
 * identity and catalog health, and an unconstrained main area — diagrams need
 * the width, so the content column is not centred or max-width-clamped.
 *
 * ## Why `fixed inset-0` and `overflow-clip` rather than `h-dvh overflow-hidden`
 *
 * Both were the obvious spelling and both were wrong, in the same way: the
 * masthead would vanish after navigating away from a scrolled page, and stay
 * vanished until a full reload, because there was no scrollbar to put it back.
 *
 * `overflow: hidden` still makes an element a **scroll container**. It removes
 * the scrollbar and the ability to scroll by gesture; it does not remove the
 * ability to be scrolled by script. On a client-side navigation the App Router
 * brings the new segment into view, and the browser's scroll-into-view walks
 * *every* scrollable ancestor. This element was one, because content inside it
 * overflowed — so it scrolled by exactly the masthead's height, 48px, and the
 * masthead went with it. Measured directly: `scrollTop: 48` on a box whose
 * `scrollHeight` was 2376 against a `clientHeight` of 2048.
 *
 * `overflow: clip` clips identically and is *not* a scroll container, so
 * scroll-into-view skips it. That fixes this element and hands the same
 * problem one level up: with the shell clipped, the scroll lands on the
 * document instead, which is also scrollable and also has no visible
 * scrollbar. Hence `fixed inset-0` — the shell occupies the same box it did
 * under `h-dvh`, but anchored to the viewport, so a document scroll cannot
 * displace it whatever put the overflow there.
 *
 * Both halves are load-bearing and were verified separately: `clip` alone
 * leaves the document scrolling (two of three navigations still lost the
 * masthead, which is the intermittency the bug was reported with); `fixed`
 * alone leaves this element scrolling. The flakiness was never randomness — it
 * was whether the destination page happened to overflow.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const catalog = await getCatalog()
  const tree = buildTree(catalog)
  const errors = catalog.diagnostics.filter((d) => d.severity === 'error').length
  const warnings = catalog.diagnostics.filter((d) => d.severity === 'warning').length

  return (
    <div className="fixed inset-0 flex flex-col overflow-clip">
      {/* The rail is in the layout, so every route puts the whole catalog
          between the top of the document and the page — measured at 233 tab
          stops before `main` with one solution in focus, 810 with all five. A
          skip link is the only thing that shortens that, and it has to be here
          rather than per-page because the rail is here.

          Parked off-screen by TRANSFORM rather than by `sr-only`, deliberately:
          `sr-only` sets `position: absolute` and `focus:not-sr-only` sets it
          back to `static`, and which of those two wins is decided by Tailwind's
          own utility ordering rather than by the order they are written in. A
          translate has no such conflict — the box is laid out once, in flow,
          and only moves. The shell is `overflow-clip`, so the parked position
          is genuinely invisible; it is `fixed`, so `absolute` resolves against
          it. */}
      <a
        href="#main"
        className="focusable absolute top-2 left-2 z-50 -translate-y-16 rounded-md border border-border
                   bg-surface px-3 py-1.5 text-[12.5px] text-foreground transition-transform
                   focus:translate-y-0 motion-reduce:transition-none"
      >
        Skip to content
      </a>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link href="/" className="focusable flex items-center gap-2 rounded">
          <Hexagon className="size-4 text-primary" strokeWidth={2.5} aria-hidden />
          <span className="font-mono text-[13px] font-semibold tracking-tight">metaframework</span>
        </Link>
        <span className="h-4 w-px bg-border" aria-hidden />
        <span className="text-xs text-muted-foreground">
          {catalog.entities.size} {catalog.entities.size === 1 ? 'entity' : 'entities'} in{' '}
          {catalog.solutions.length} {catalog.solutions.length === 1 ? 'solution' : 'solutions'}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {/* A client component for one reason: the target depends on where the
              reader is, and both halves of that — the open route and the rail's
              focus — only exist in the browser. See map-link.tsx. */}
          <MapLink />
          <span className="h-4 w-px bg-border" aria-hidden />
          <DiagnosticsIndicator errors={errors} warnings={warnings} />
        </div>
      </header>

      {/* `overflow-clip`, not `overflow-hidden`, for the reason in the docstring:
          hidden would make this a second scroll container for scroll-into-view
          to find. Only `main` below is allowed to scroll. */}
      <div className="flex min-h-0 flex-1 overflow-clip">
        {/* The tree owns its own scrolling so the filter bar stays pinned. */}
        <aside className="w-72 shrink-0 overflow-clip border-r border-border bg-surface/40">
          <CatalogTree roots={tree} />
        </aside>
        {/* `tabIndex={-1}` is what makes the skip link above actually land:
            a fragment target that cannot hold focus scrolls the page and leaves
            focus where it was, which puts the reader back at the top of the
            rail. -1 rather than 0 — this must be a focus TARGET, not a tab
            stop. It paints nothing: the only focus ring in this console is
            `.focusable`, which this is not. */}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
