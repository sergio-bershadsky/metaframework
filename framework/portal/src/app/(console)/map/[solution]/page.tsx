import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DeferredSolutionMap } from '@/components/diagrams/deferred-solution-map'
import type { MapKind, SolutionMapLink, SolutionMapNode } from '@/components/diagrams/solution-map'
import { type Catalog, entitiesOfSolution, getCatalog } from '@/lib/catalog'
import { CONTAINER_KINDS } from '@/lib/catalog/frontmatter'

/**
 * The solution map.
 *
 * One route per solution rather than a client-side switcher over all of them:
 * "which solution am I looking at" is the coarsest piece of state on this page,
 * and a solution is a sealed universe — nothing on this canvas can ever
 * reference across the boundary — so the URL is where it belongs. A shared link
 * then lands on the same map, which a switcher held in component state could
 * never promise.
 *
 * The page is a pure projection of the catalog down to STRUCTURE: solutions,
 * products and components, containment, and the dependency edges between them.
 * Everything else the catalog knows is deliberately absent — the map answers
 * "how is this solution put together", and a protocol or datamodel on the same
 * canvas answers a question the entity pages already answer better.
 */

/** The only kinds the map draws. Everything else belongs to an entity page. */
const MAP_KINDS = new Set<string>(CONTAINER_KINDS)

/** Frontmatter edges that count as crossing the structure. */
const CROSSING_EDGES = new Set(['depends-on', 'uses'])

function solutionName(srn: string): string {
  return srn.replace('srn://', '')
}

export async function generateMetadata(props: PageProps<'/map/[solution]'>): Promise<Metadata> {
  const { solution } = await props.params
  const catalog = await getCatalog()
  const entity = catalog.entities.get(`srn://${solution}`)
  if (!entity) return { title: 'Not found' }
  return {
    title: `Map · ${entity.frontmatter.title}`,
    description: `Products and components of ${entity.frontmatter.title}, and the dependencies between them.`,
  }
}

export default async function SolutionMapPage(props: PageProps<'/map/[solution]'>) {
  const { solution } = await props.params
  const catalog = await getCatalog()
  const root = `srn://${solution}`
  const entity = catalog.entities.get(root)
  if (!entity || !catalog.solutions.includes(root)) notFound()

  const { nodes, links } = projectStructure(catalog, root)
  const products = nodes.filter((node) => node.kind === 'product').length
  const components = nodes.filter((node) => node.kind === 'component').length
  const crossing = links.filter((link) => link.relation !== 'contains').length

  return (
    <div className="flex h-full min-h-0 flex-col px-8 py-6">
      <header className="shrink-0">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <div>
            <p className="font-mono text-xs tracking-[0.18em] text-muted-foreground uppercase">Structure</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{entity.frontmatter.title}</h1>
          </div>
          <SolutionSwitcher catalog={catalog} current={root} />
        </div>

        <p className="mt-2.5 max-w-3xl text-[13.5px] leading-relaxed text-muted-foreground">
          {/* Every line here costs the canvas its height, and the canvas is
              where the legibility went: at 1920x1080 one extra wrapped line
              takes 22px off the map and roughly 3% off its zoom. */}
          Products and components only. The view stops at the products;{' '}
          <span className="font-mono text-[12.5px]">+n</span> counts what a box contains and this view is not
          drawing. Click any box to re-centre on it.{' '}
          <span className="font-mono text-[12.5px] text-foreground/70">
            {products} product{products === 1 ? '' : 's'} · {components} component
            {components === 1 ? '' : 's'} · {crossing} dependenc{crossing === 1 ? 'y' : 'ies'}
          </span>
        </p>
      </header>

      <div className="mt-5 min-h-0 flex-1">
        {/* Keyed by solution: switching route replaces the map rather than
            re-centring the old one, which would animate between two graphs that
            share no nodes. */}
        <DeferredSolutionMap
          key={root}
          nodes={nodes}
          links={links}
          root={root}
          label={`Structure of ${entity.frontmatter.title}`}
          className="h-full"
        />
      </div>
    </div>
  )
}

function SolutionSwitcher({ catalog, current }: { catalog: Catalog; current: string }) {
  if (catalog.solutions.length < 2) return null

  return (
    <nav aria-label="Solution" className="flex items-center gap-1 rounded-md border border-border bg-surface p-0.5">
      {catalog.solutions.map((srn) => {
        const active = srn === current
        return (
          <Link
            key={srn}
            href={`/map/${solutionName(srn)}`}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'focusable rounded-sm bg-surface-raised px-2 py-1 font-mono text-[11.5px] text-foreground'
                : 'focusable rounded-sm px-2 py-1 font-mono text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground'
            }
          >
            {solutionName(srn)}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * The catalog, projected onto the map's two edge languages.
 *
 * Containment comes from the entity tree, which the loader has already built
 * and validated; dependency comes from resolved `depends-on` and `uses`
 * relations. A relation pointing at a datamodel or a protocol is dropped rather
 * than pulling that entity onto the canvas — the map's promise is that only
 * structure appears on it, and a promise with exceptions is not one.
 */
function projectStructure(
  catalog: Catalog,
  root: string,
): { nodes: SolutionMapNode[]; links: SolutionMapLink[] } {
  const entities = entitiesOfSolution(catalog, root).filter((entity) => MAP_KINDS.has(entity.kind))
  const present = new Set(entities.map((entity) => entity.srn))

  const nodes: SolutionMapNode[] = entities.map((entity) => ({
    srn: entity.srn,
    name: entity.frontmatter.name,
    title: entity.frontmatter.title,
    kind: entity.kind as MapKind,
    parent: entity.parent && present.has(entity.parent) ? entity.parent : null,
  }))

  const links: SolutionMapLink[] = []
  const seen = new Set<string>()
  const add = (link: SolutionMapLink) => {
    const key = `${link.from}--${link.relation}--${link.to}`
    if (seen.has(key)) return
    seen.add(key)
    links.push(link)
  }

  for (const entity of entities) {
    if (entity.parent && present.has(entity.parent)) {
      add({ from: entity.parent, to: entity.srn, relation: 'contains' })
    }
    for (const relation of entity.relations) {
      if (!CROSSING_EDGES.has(relation.edge)) continue
      if (!relation.target || relation.target === entity.srn || !present.has(relation.target)) continue
      add({ from: entity.srn, to: relation.target, relation: relation.edge as 'depends-on' | 'uses' })
    }
  }

  return { nodes, links }
}
