import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getCatalog } from '@/lib/catalog'
import { entityHref } from '@/lib/catalog/href'

export const metadata: Metadata = { title: 'Diagnostics' }

/**
 * The validation report. With no CLI in v1, this page *is* the integrity gate —
 * it must name the file, the rule, and the fix, not merely report a count.
 */
export default async function DiagnosticsPage() {
  const catalog = await getCatalog()
  const errors = catalog.diagnostics.filter((d) => d.severity === 'error')
  const warnings = catalog.diagnostics.filter((d) => d.severity === 'warning')

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="animate-rise">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Integrity</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Diagnostics</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every reference, frontmatter field, and directory placement is validated when the catalog loads.
          Errors mean the catalog contradicts the specification; warnings mean it will drift if left alone.
        </p>
      </header>

      <div className="rule-fade my-8" />

      {catalog.diagnostics.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <CheckCircle2 className="size-7 text-kind-environment" aria-hidden />
          <h2 className="text-base font-medium">Catalog is valid</h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Every entity satisfies the frontmatter contract, every reference resolves, and every entity sits
            where its kind allows.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {errors.length > 0 && <Group title="Errors" icon="error" diagnostics={errors} />}
          {warnings.length > 0 && <Group title="Warnings" icon="warning" diagnostics={warnings} />}
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  icon,
  diagnostics,
}: {
  title: string
  icon: 'error' | 'warning'
  diagnostics: Awaited<ReturnType<typeof getCatalog>>['diagnostics']
}) {
  const Icon = icon === 'error' ? XCircle : AlertTriangle
  const tone = icon === 'error' ? 'text-destructive' : 'text-warning'

  return (
    <section>
      <h2 className={`flex items-center gap-2 text-sm font-semibold ${tone}`}>
        <Icon className="size-4" aria-hidden />
        {title}
        <span className="font-mono text-xs font-normal text-muted-foreground">{diagnostics.length}</span>
      </h2>

      <ul className="mt-3 space-y-2">
        {diagnostics.map((diagnostic, index) => (
          <li key={index} className="panel px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <code className={`font-mono text-[11.5px] font-medium ${tone}`}>{diagnostic.code}</code>
              <span className="font-mono text-[12px] text-muted-foreground">{diagnostic.path}</span>
              {diagnostic.srn && (
                <Link
                  href={entityHref(diagnostic.srn)}
                  className="focusable ml-auto rounded font-mono text-[11.5px] text-primary hover:underline"
                >
                  open entity
                </Link>
              )}
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-foreground/85">{diagnostic.message}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
