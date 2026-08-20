import { ArrowRight, FolderOpen } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge, VersionBadge } from '@/components/kind-badge'
import { SrnAddress } from '@/components/srn-address'
import { type Entity, entitiesOfSolution, entityHref, getCatalog } from '@/lib/catalog'
import { KIND_ORDER } from '@/lib/catalog/tree'
import { kindStyle } from '@/lib/ui/kind'

export default async function HomePage() {
  const catalog = await getCatalog()
  const solutions = catalog.solutions
    .map((srn) => catalog.entities.get(srn))
    .filter((entity): entity is Entity => Boolean(entity))

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <header className="animate-rise">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Catalog</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Solutions</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Each solution is a sealed universe: products, components, the protocols between them, and the
          data models they persist and exchange. References never cross a solution boundary.
        </p>
      </header>

      <div className="rule-fade my-8" />

      {solutions.length === 0 ? <EmptyState /> : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {solutions.map((solution, index) => (
            <SolutionCard
              key={solution.srn}
              solution={solution}
              entities={entitiesOfSolution(catalog, solution.srn)}
              index={index}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function SolutionCard({
  solution,
  entities,
  index,
}: {
  solution: Entity
  entities: Entity[]
  index: number
}) {
  // Reading order, the same sequence the rail groups by — see the note on
  // ENTITY_KINDS for why the adoption-ordered list never reaches a reader.
  const counts = KIND_ORDER.map((kind) => ({
    kind,
    count: entities.filter((entity) => entity.kind === kind).length,
  })).filter(({ count, kind }) => count > 0 && kind !== 'solution')

  return (
    <li
      className="panel animate-rise group relative overflow-hidden transition hover:border-border-strong"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <Link href={entityHref(solution.srn)} className="focusable block p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{solution.frontmatter.title}</h2>
            <SrnAddress srn={solution.srn} className="mt-1" copyable={false} />
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{solution.frontmatter.summary}</p>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={solution.frontmatter.status} />
          <VersionBadge version={solution.frontmatter.version} />
        </div>

        <dl className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4">
          {counts.map(({ kind, count }) => {
            const style = kindStyle(kind)
            const Icon = style.icon
            return (
              <div key={kind} className="flex items-center gap-1.5">
                <Icon className={`size-3.5 ${style.text}`} aria-hidden />
                <dt className="sr-only">{style.label}</dt>
                <dd className="font-mono text-xs text-foreground/80">
                  {count} <span className="text-muted-foreground">{style.label.toLowerCase()}</span>
                </dd>
              </div>
            )
          })}
        </dl>
      </Link>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center">
      <FolderOpen className="size-7 text-muted-foreground" aria-hidden />
      <h2 className="text-base font-medium">No solutions in the catalog</h2>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        Create <code className="font-mono text-foreground/80">solutions/&lt;name&gt;/index.md</code> with{' '}
        <code className="font-mono text-foreground/80">kind: solution</code> in its frontmatter, or point the
        portal elsewhere with the <code className="font-mono text-foreground/80">CATALOG_DIR</code> environment
        variable.
      </p>
    </div>
  )
}
