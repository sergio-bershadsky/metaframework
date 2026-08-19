import { ChevronRight, FileWarning } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EntityArtifacts } from '@/components/entity/entity-artifacts'
import { EntityChildren } from '@/components/entity/entity-children'
import { EntityRelations } from '@/components/entity/entity-relations'
import { KindBadge, StatusBadge, VersionBadge } from '@/components/kind-badge'
import { Markdown } from '@/components/markdown'
import { SrnAddress } from '@/components/srn-address'
import { ancestorsOf, childrenOf, entityHref, getCatalog } from '@/lib/catalog'
import { srnFromSegments } from '@/lib/catalog/href'
import { kindStyle } from '@/lib/ui/kind'

export async function generateMetadata(props: PageProps<'/catalog/[...srn]'>): Promise<Metadata> {
  const { srn: segments } = await props.params
  const catalog = await getCatalog()
  const entity = catalog.entities.get(srnFromSegments(segments))
  return entity
    ? { title: entity.frontmatter.title, description: entity.frontmatter.summary }
    : { title: 'Not found' }
}

export default async function EntityPage(props: PageProps<'/catalog/[...srn]'>) {
  const { srn: segments } = await props.params
  const srn = srnFromSegments(segments)
  const catalog = await getCatalog()
  const entity = catalog.entities.get(srn)
  if (!entity) notFound()

  const ancestors = ancestorsOf(catalog, srn)
  const children = childrenOf(catalog, srn)
  const inbound = catalog.inbound.get(srn) ?? []
  const diagnostics = catalog.diagnostics.filter((d) => d.srn === srn)
  const style = kindStyle(entity.kind)
  const Icon = style.icon

  return (
    <article className="px-8 py-8">
      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {ancestors.map((ancestor) => (
          <span key={ancestor.srn} className="flex items-center gap-1">
            <Link href={entityHref(ancestor.srn)} className="focusable rounded font-mono hover:text-foreground">
              {ancestor.frontmatter.name}
            </Link>
            <ChevronRight className="size-3 opacity-50" aria-hidden />
          </span>
        ))}
        <span className="font-mono text-foreground/80">{entity.frontmatter.name}</span>
      </nav>

      <header className="animate-rise">
        <div className="flex items-start gap-3.5">
          <span
            className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border ${style.border} ${style.bg}`}
          >
            <Icon className={`size-4.5 ${style.text}`} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{entity.frontmatter.title}</h1>
            <SrnAddress srn={entity.srn} version={entity.frontmatter.version} className="mt-1.5" />
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          {entity.frontmatter.summary}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <KindBadge kind={entity.kind} />
          <StatusBadge status={entity.frontmatter.status} />
          <VersionBadge version={entity.frontmatter.version} />
          {entity.frontmatter.owner && (
            <span className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {entity.frontmatter.owner}
            </span>
          )}
          {entity.frontmatter.tags?.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      </header>

      {diagnostics.length > 0 && (
        <section className="mt-6 rounded-lg border border-destructive/35 bg-destructive/[0.07] p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-destructive">
            <FileWarning className="size-4" aria-hidden />
            {diagnostics.length} problem{diagnostics.length === 1 ? '' : 's'} in this entity
          </h2>
          <ul className="mt-2.5 space-y-1.5">
            {diagnostics.map((diagnostic, index) => (
              <li key={index} className="flex gap-2 text-[13px] leading-relaxed">
                <code className="shrink-0 font-mono text-[11.5px] text-destructive/90">{diagnostic.code}</code>
                <span className="text-foreground/80">{diagnostic.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="rule-fade my-7" />

      {entity.body && <Markdown>{entity.body}</Markdown>}

      <EntityArtifacts entity={entity} />
      <EntityRelations entity={entity} catalog={catalog} inbound={inbound} />
      <EntityChildren entities={children} />
    </article>
  )
}
