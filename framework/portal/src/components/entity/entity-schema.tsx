import { FileWarning, Link2 } from 'lucide-react'
import Link from 'next/link'
import { StoplightSchemaView } from '@/components/schema/stoplight-schema-view'
import { catalogDir, entityHref } from '@/lib/catalog'
import type { Entity } from '@/lib/catalog'
import { bundleSchema } from '@/lib/schema/dereference'

/**
 * The datamodel's shape. Bundling happens on the server so the client receives
 * one self-contained document — the viewer never has to fetch anything, and a
 * broken `$ref` surfaces here as a message instead of an empty panel.
 */
export async function EntitySchema({ entity }: { entity: Entity }) {
  if (entity.kind !== 'datamodel') return null
  if (!entity.artifacts.some((artifact) => artifact.file === 'schema.json')) return null

  const dir = catalogDir()
  const { schema, sources, error } = await bundleSchema(entity, dir)

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Shape</h2>
        <span className="font-mono text-[11px] text-muted-foreground">schema.json · JSON Schema 2020-12</span>
      </div>

      {error ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/[0.07] p-3 text-[13px] text-destructive">
          <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Could not resolve this schema: {error}</span>
        </p>
      ) : (
        <div className="panel mt-3 overflow-hidden p-4">
          <StoplightSchemaView schema={schema} />
        </div>
      )}

      {sources.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <Link2 className="size-3" aria-hidden />
            composed from
          </span>
          {sources.map((source) => {
            const srn = `srn://${source.replace(/\/schema\.json$/, '')}`
            return (
              <Link
                key={source}
                href={entityHref(srn)}
                className="focusable rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px]
                           text-foreground/80 transition hover:border-border-strong hover:text-foreground"
              >
                {srn.replace('srn://', '')}
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
