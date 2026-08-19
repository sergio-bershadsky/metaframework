import { FileCode2 } from 'lucide-react'
import type { Entity } from '@/lib/catalog'

/**
 * Artifacts carry the machine-readable substance of an entity. This is the
 * dispatch point: specialised renderers (schema explorer, sequence diagram,
 * state chart) claim the artifacts they understand, and anything unclaimed
 * falls back to source. The fallback is deliberate — an artifact the portal
 * cannot draw must still be reviewable.
 */
export function EntityArtifacts({ entity }: { entity: Entity }) {
  if (entity.artifacts.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Artifacts</h2>

      <div className="mt-4 space-y-4">
        {entity.artifacts.map((artifact) => (
          <details key={artifact.file} className="panel group overflow-hidden" open={entity.artifacts.length <= 2}>
            <summary
              className="focusable flex cursor-pointer list-none items-center gap-2 px-4 py-2.5
                         text-[13px] transition hover:bg-surface-raised/60"
            >
              <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="font-mono text-foreground/85">{artifact.file}</span>
              <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                {artifact.extension.replace('.', '')}
              </span>
            </summary>
            <pre className="max-h-[32rem] overflow-auto border-t border-border bg-background/40 p-4 text-[12.5px] leading-6">
              <code className="font-mono text-foreground/80">{artifact.raw.trimEnd()}</code>
            </pre>
          </details>
        ))}
      </div>
    </section>
  )
}
