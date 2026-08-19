import { Hexagon, Map as MapIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CatalogTree } from '@/components/catalog-tree'
import { DiagnosticsIndicator } from '@/components/diagnostics-indicator'
import { getCatalog } from '@/lib/catalog'
import { buildTree } from '@/lib/catalog/tree'

/**
 * Console chrome: a fixed rail on the left for the catalog, a thin masthead for
 * identity and catalog health, and an unconstrained main area — diagrams need
 * the width, so the content column is not centred or max-width-clamped.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const catalog = await getCatalog()
  const tree = buildTree(catalog)
  const errors = catalog.diagnostics.filter((d) => d.severity === 'error').length
  const warnings = catalog.diagnostics.filter((d) => d.severity === 'warning').length

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
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
          {/* The rail answers "where is X"; the map answers "how is this put
              together". Different questions, so the map gets its own way in
              rather than living inside a tree node. */}
          <Link
            href="/map"
            className="focusable flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            <MapIcon className="size-3.5" aria-hidden />
            Map
          </Link>
          <span className="h-4 w-px bg-border" aria-hidden />
          <DiagnosticsIndicator errors={errors} warnings={warnings} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* The tree owns its own scrolling so the filter bar stays pinned. */}
        <aside className="w-72 shrink-0 overflow-hidden border-r border-border bg-surface/40">
          <CatalogTree roots={tree} />
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
