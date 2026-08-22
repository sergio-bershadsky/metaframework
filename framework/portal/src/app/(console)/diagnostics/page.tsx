import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getCatalog } from '@/lib/catalog'
import { entityHref } from '@/lib/catalog/href'

export const metadata: Metadata = { title: 'Diagnostics' }

/**
 * The validation report. With no CLI in v1, this page *is* the integrity gate —
 * it must name the file, the rule, and the fix, not merely report a count.
 *
 * `getCatalog` folds the datamodel schema registry's diagnostics into the
 * loader's own (lib/catalog/index.ts), so E_DM_* appears here beside E_FM_* and
 * E_SRN_*. A reader must not have to know which validator found a problem.
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
          Every reference, frontmatter field, directory placement, and datamodel schema is validated when
          the catalog loads. Errors mean the catalog contradicts the specification; warnings mean it will
          drift if left alone.
        </p>
      </header>

      <div className="rule-fade my-8" />

      {catalog.diagnostics.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
          <CheckCircle2 className="size-7 text-kind-environment" aria-hidden />
          <h2 className="text-base font-medium">Catalog is valid</h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Every entity satisfies the frontmatter contract, every reference resolves, every entity sits
            where its kind allows, and every datamodel schema states its own identity and resolves its refs.
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
        {/* An explicit space, because JSX drops the whitespace between an
            expression and the element after it and the heading's accessible
            name came out as "Warnings88". Whitespace-only text between flex
            items is not rendered, so the count still sits where `gap-2` puts
            it — the pixels are unchanged. */}
        {' '}
        <span className="font-mono text-xs font-normal text-muted-foreground">{diagnostics.length}</span>
      </h2>

      <ul className="mt-3 space-y-2">
        {diagnostics.map((diagnostic, index) => (
          <li key={index} className="panel px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <code className={`relative font-mono text-[11.5px] font-medium ${tone}`}>
                {/* Severity is carried by `tone` — a colour class — and by the
                    group heading above. A reader who arrives at one row out of
                    context, from a links list or a deep link, has neither. */}
                <span className="sr-only">{icon === 'error' ? 'Error: ' : 'Warning: '}</span>
                {diagnostic.code}
              </code>{' '}
              <span className="font-mono text-[12px] text-muted-foreground">{diagnostic.path}</span>
              {diagnostic.srn && (
                // `relative` is not cosmetic: `sr-only` is `position: absolute`,
                // and without a positioned ancestor the hidden span is placed
                // against the initial containing block and can extend the
                // document's scroll box. Same lesson as section-heading.tsx.
                <Link
                  href={entityHref(diagnostic.srn)}
                  className="focusable relative ml-auto rounded font-mono text-[11.5px] text-primary hover:underline"
                >
                  open entity
                  {/* 88 links on this page said exactly "open entity", pointing
                      at 49 different places. A links list — the standard way of
                      skimming a page of this shape — read as 88 copies of one
                      link. Real text rather than an `aria-label` so a plain
                      `textContent` reading gets it too. */}
                  <span className="sr-only"> {diagnostic.srn}</span>
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
