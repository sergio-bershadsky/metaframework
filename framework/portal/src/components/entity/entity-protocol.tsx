import { AlertTriangle } from 'lucide-react'
import { SequenceDiagram, type SequenceParticipant } from '@/components/diagrams/sequence-diagram'
import { StateChartDiagram } from '@/components/diagrams/state-chart'
import type { Catalog, Entity } from '@/lib/catalog'
import { parseStates } from '@/lib/protocol/states'
import { parseWorkflow } from '@/lib/protocol/workflow'
import { resolveRef } from '@/lib/srn/srn'

/**
 * A protocol's derived diagrams.
 *
 * Parsing happens on the server so the client receives plain data and the
 * diagrams stay presentational. Anything that fails to parse degrades to a
 * visible notice rather than a blank panel — the raw artifact is still listed
 * below, so a malformed workflow is reviewable even when it is not drawable.
 */
export function EntityProtocol({ entity, catalog }: { entity: Entity; catalog: Catalog }) {
  if (entity.kind !== 'protocol') return null

  const declared = (entity.frontmatter as { participants?: Array<{ alias: string; ref: string; role?: string }> })
    .participants

  const participants: Record<string, SequenceParticipant> = {}
  for (const participant of declared ?? []) {
    let target: Entity | undefined
    try {
      target = catalog.entities.get(resolveRef(entity.srn, participant.ref))
    } catch {
      target = undefined
    }
    participants[participant.alias] = {
      srn: target?.srn ?? participant.ref,
      kind: target?.kind ?? 'component',
      label: target?.frontmatter.title ?? participant.alias,
      role: participant.role,
    }
  }

  const aliases = Object.keys(participants)

  const workflows = entity.artifacts
    .filter((artifact) => artifact.file.startsWith('workflows/') && artifact.data)
    .map((artifact) => {
      const stem = artifact.file.replace(/^workflows\//, '').replace(/\.ya?ml$/, '')
      const { workflow, issues } = parseWorkflow(artifact.data, {
        fileStem: stem,
        aliases,
        protocolSrn: entity.srn,
      })
      return { file: artifact.file, workflow, issues }
    })

  const statesArtifact = entity.artifacts.find((artifact) => artifact.file === 'states.json')
  const states = statesArtifact?.data
    ? parseStates(statesArtifact.data, { entityName: entity.frontmatter.name, srn: entity.srn })
    : null

  if (workflows.length === 0 && !states?.chart) return null

  return (
    <>
      {workflows.length > 0 && (
        <section className="mt-10">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Exchanges</h2>
            <span className="font-mono text-[11px] text-muted-foreground">
              derived from {workflows.length} workflow{workflows.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="mt-4 space-y-6">
            {workflows.map(({ file, workflow, issues }) => (
              <div key={file}>
                <p className="mb-2 font-mono text-[11px] text-muted-foreground">{file}</p>
                {workflow ? (
                  <div className="panel overflow-hidden p-3">
                    <SequenceDiagram workflow={workflow} participants={participants} />
                  </div>
                ) : (
                  <Unrenderable messages={issues.map((issue) => `${issue.code}: ${issue.message}`)} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {states?.chart && (
        <section className="mt-10">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Conversation state
            </h2>
            <span className="font-mono text-[11px] text-muted-foreground">states.json</span>
          </div>
          <div className="panel mt-4 overflow-hidden">
            <StateChartDiagram chart={states.chart} />
          </div>
        </section>
      )}
    </>
  )
}

function Unrenderable({ messages }: { messages: string[] }) {
  return (
    <div className="rounded-lg border border-warning/35 bg-warning/[0.07] p-3 text-[13px]">
      <p className="flex items-center gap-2 font-medium text-warning">
        <AlertTriangle className="size-4" aria-hidden />
        This artifact could not be drawn
      </p>
      <ul className="mt-1.5 space-y-1 text-foreground/80">
        {messages.slice(0, 6).map((message, index) => (
          <li key={index} className="font-mono text-[11.5px]">
            {message}
          </li>
        ))}
      </ul>
    </div>
  )
}
