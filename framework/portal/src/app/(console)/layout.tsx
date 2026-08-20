import { AppShell } from '@/components/app-shell'
import { LiveReload } from '@/components/live-reload'
import { liveReloadEnabled } from '@/lib/catalog/mode'

export default function ConsoleLayout({ children }: LayoutProps<'/'>) {
  return (
    <AppShell>
      {children}
      {/* Only where the catalog can change under the server: a deployed build
          has nothing to announce and must not be asked to hold a stream open.
          `metaframework --no-watch` opts out of the push for the same reason a
          deployment never had it — see liveReloadEnabled. */}
      {liveReloadEnabled() && <LiveReload />}
    </AppShell>
  )
}
