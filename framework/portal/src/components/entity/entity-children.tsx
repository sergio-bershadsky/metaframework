import Link from 'next/link'
import { KindBadge, StatusBadge } from '@/components/kind-badge'
import type { Entity } from '@/lib/catalog'
import { entityHref } from '@/lib/catalog/href'
import { kindStyle } from '@/lib/ui/kind'

/** Children grouped by kind — the catalog view of "what is inside this thing". */
export function EntityChildren({ entities }: { entities: Entity[] }) {
  if (entities.length === 0) return null

  const groups = new Map<string, Entity[]>()
  for (const entity of entities) {
    const group = groups.get(entity.kind) ?? []
    group.push(entity)
    groups.set(entity.kind, group)
  }

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Contents</h2>

      <div className="mt-4 space-y-6">
        {[...groups.entries()].map(([kind, group]) => {
          const style = kindStyle(kind as Entity['kind'])
          return (
            <div key={kind}>
              <div className="mb-2 flex items-center gap-2">
                <KindBadge kind={kind as Entity['kind']} />
                <span className="font-mono text-[11px] text-muted-foreground">{group.length}</span>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.map((entity) => (
                  <li key={entity.srn}>
                    <Link
                      href={entityHref(entity.srn)}
                      className={`focusable group block rounded-lg border border-border bg-surface/60 p-3 transition
                                  hover:border-border-strong hover:bg-surface`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[13px] font-medium text-foreground/90">
                          {entity.frontmatter.name}
                        </span>
                        <span className={`shrink-0 font-mono text-[11px] ${style.text}`}>
                          v{entity.frontmatter.version}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted-foreground">
                        {entity.frontmatter.summary}
                      </p>
                      {entity.frontmatter.status !== 'approved' && (
                        <StatusBadge status={entity.frontmatter.status} className="mt-2" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
