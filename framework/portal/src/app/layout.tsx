import type { Metadata } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
})

/**
 * Every page renders at request time, and this is declared once at the root so
 * that a page added later inherits it instead of having to remember.
 *
 * The catalog is request-time input now. A prerendered page is a page whose
 * catalog was captured on whichever machine ran `next build` — for the CLI, the
 * machine that packaged it — so `/`, `/diagnostics` and `/map` would have
 * shipped with this repository's own fixtures baked into them and would never
 * have shown a user their own solutions. Nothing here is cacheable across
 * requests by construction, so forcing dynamic costs a deployment nothing but
 * the render itself: the catalog is still read once per process there.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: {
    default: 'metaframework',
    template: '%s · metaframework',
  },
  description: 'Solution catalog — products, components, protocols and data models.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
