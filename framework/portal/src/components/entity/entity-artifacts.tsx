import { AlertTriangle, Link2 } from 'lucide-react'
import Link from 'next/link'
import { ArtifactBlock } from '@/components/code/artifact-block'
import { LinkedStateChart, NavigableSequenceDiagram } from '@/components/diagrams/navigable'
import type { SequenceParticipant } from '@/components/diagrams/sequence-diagram'
import { SchemaLineage } from '@/components/schema/schema-lineage'
import { StoplightSchemaView } from '@/components/schema/stoplight-schema-view'
import { stateChartAnchors, workflowAnchors } from '@/lib/artifacts/anchors'
import { monacoLanguage } from '@/lib/artifacts/language'
import type { AnchorPaths } from '@/lib/artifacts/source-map'
import { catalogDir, entityHref, getSchemaRegistry } from '@/lib/catalog'
import type { Artifact, Catalog, Entity } from '@/lib/catalog'
import { parseStates } from '@/lib/protocol/states'
import { parseWorkflow } from '@/lib/protocol/workflow'
import { bundleSchema } from '@/lib/schema/dereference'
import { buildLineage } from '@/lib/schema/lineage'
import { resolveRef } from '@/lib/srn/srn'

/**
 * Every artifact of an entity, one block each.
 *
 * This section replaces three that used to be independent: the datamodel's
 * "Shape", the protocol's "Exchanges" and "Conversation state", and a raw list
 * of every file at the foot of the page. That arrangement rendered
 * `workflows/place-order.yaml` twice — as a diagram near the top and as YAML at
 * the bottom — with nothing connecting the two, and it meant that whether an
 * artifact appeared at all depended on which renderer happened to claim it.
 *
 * Now the file is the unit. A renderer that understands an artifact contributes
 * its drawing; one that does not contributes nothing, and the source is still
 * there. A file that will not even parse still gets a block, with the parser's
 * complaint above the lines that caused it — that artifact is the one somebody
 * most needs to see.
 *
 * The kind's primary artifact is promoted to the top and opened: a datamodel is
 * its schema, a protocol is its workflows. Everything else arrives collapsed,
 * because a page that opens twelve editors is a page that opens slowly.
 */
export async function EntityArtifacts({ entity, catalog }: { entity: Entity; catalog: Catalog }) {
  if (entity.artifacts.length === 0) return null

  const participants = protocolParticipants(entity, catalog)
  const blocks = await Promise.all(
    entity.artifacts.map((artifact) => describe(entity, artifact, participants)),
  )

  // Promoted first, otherwise the loader's order (alphabetical by path).
  const ordered = [...blocks].sort((a, b) => Number(b.primary) - Number(a.primary))

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Artifacts</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {entity.artifacts.length} file{entity.artifacts.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {ordered.map((block) => (
          <ArtifactBlock
            key={block.file}
            file={block.file}
            extension={block.extension}
            source={block.source}
            language={block.language}
            modelPath={block.modelPath}
            id={block.id}
            role={block.role}
            defaultOpen={block.primary}
            error={block.error}
            anchors={block.anchors}
            visual={block.visual}
            footer={block.footer}
          />
        ))}
      </div>

      {/* Directly under the schema block, because it answers the question the
          block just raised. Stoplight inlines `allOf` into one flat shape — the
          right default, and the reason provenance is gone from what is on
          screen. This is the only thing that flattening dropped. */}
      <SchemaLineageSection entity={entity} />
    </section>
  )
}

/**
 * Field-to-ancestor attribution for a datamodel, or nothing at all.
 *
 * Server-only: {@link getSchemaRegistry} holds an ajv instance. It is the same
 * memoised registry the loader already built, so this costs a map lookup and a
 * graph walk, not a second parse of the catalog.
 */
async function SchemaLineageSection({ entity }: { entity: Entity }) {
  if (entity.kind !== 'datamodel') return null
  const registry = await getSchemaRegistry()
  const view = buildLineage(registry, entity.srn)
  if (!view) return null
  return <SchemaLineage view={view} />
}

/* ----------------------------------------------------------------- blocks */

interface DescribedArtifact {
  file: string
  extension: string
  source: string
  language: string
  modelPath: string
  id: string
  role?: string
  primary: boolean
  error: string | null
  anchors: AnchorPaths
  visual?: React.ReactNode
  footer?: React.ReactNode
}

/**
 * What this file is, what it draws as, and where its elements live in it.
 *
 * The dispatch is by entity kind *and* file, exactly as the spec defines the
 * artifacts of each kind — `schema.json` on anything but a datamodel is just a
 * JSON file, and treating it as a shape would be a guess.
 */
async function describe(
  entity: Entity,
  artifact: Artifact,
  participants: Record<string, SequenceParticipant>,
): Promise<DescribedArtifact> {
  const base: DescribedArtifact = {
    file: artifact.file,
    extension: artifact.extension,
    source: artifact.raw.replace(/\s+$/, '\n'),
    language: monacoLanguage(artifact.extension),
    modelPath: modelPathFor(entity, artifact),
    id: blockId(artifact.file),
    primary: false,
    error: artifact.error ?? null,
    anchors: {},
  }

  if (artifact.error) return { ...base, primary: primaryFor(entity, artifact) }

  if (entity.kind === 'datamodel' && artifact.file === SCHEMA_FILE) {
    const { schema, sources, error } = await bundleSchema(entity, catalogDir())
    return {
      ...base,
      role: 'Shape',
      primary: true,
      visual: error ? (
        <Undrawable messages={[error]} what="resolved" />
      ) : (
        <div className="max-h-[520px] overflow-auto p-4">
          <StoplightSchemaView schema={schema} />
        </div>
      ),
      footer: sources.length > 0 ? <ComposedFrom sources={sources} /> : undefined,
    }
  }

  if (entity.kind === 'protocol' && artifact.file.startsWith('workflows/')) {
    const stem = artifact.file.replace(/^workflows\//, '').replace(/\.ya?ml$/, '')
    const { workflow, issues } = parseWorkflow(artifact.data, {
      fileStem: stem,
      aliases: Object.keys(participants),
      protocolSrn: entity.srn,
    })

    return {
      ...base,
      role: 'Exchange',
      primary: true,
      anchors: workflow ? workflowAnchors(workflow) : {},
      visual: workflow ? (
        // No frame of its own: the block is the frame, and a panel inside a
        // panel reads as two things rather than one artifact.
        <NavigableSequenceDiagram
          workflow={workflow}
          participants={participants}
          className="rounded-none border-0"
        />
      ) : (
        <Undrawable messages={issues.map((issue) => `${issue.code}: ${issue.message}`)} what="drawn" />
      ),
    }
  }

  if (entity.kind === 'protocol' && artifact.file === STATES_FILE) {
    const { chart, diagnostics } = parseStates(artifact.data, {
      entityName: entity.frontmatter.name,
      srn: entity.srn,
    })

    return {
      ...base,
      role: 'Conversation state',
      primary: false,
      anchors: chart ? stateChartAnchors(chart, artifact.data) : {},
      visual: chart ? (
        // The block already draws the frame; a second one inside it reads as a
        // nested panel rather than as one artifact.
        <LinkedStateChart chart={chart} className="rounded-none border-0" />
      ) : (
        <Undrawable messages={diagnostics.map((issue) => `${issue.code}: ${issue.message}`)} what="drawn" />
      ),
    }
  }

  return { ...base, primary: primaryFor(entity, artifact) }
}

const SCHEMA_FILE = 'schema.json'
const STATES_FILE = 'states.json'

/**
 * Which artifact leads.
 *
 * The two kinds that own a signature artifact say so. Every other kind carries
 * at most a file or two, and below three there is nothing to prioritise between
 * — so they all open, which is what the old artifacts list did.
 */
function primaryFor(entity: Entity, artifact: Artifact): boolean {
  if (entity.kind === 'datamodel') return artifact.file === SCHEMA_FILE
  if (entity.kind === 'protocol') return artifact.file.startsWith('workflows/')
  return entity.artifacts.length <= 2
}

/** A Monaco model uri. Unique across the catalog, and stable across reopens. */
function modelPathFor(entity: Entity, artifact: Artifact): string {
  return `file:///${entity.srn.replace('srn://', '')}/${artifact.file}`
}

/** The fragment a block's permalink points at. */
function blockId(file: string): string {
  return `artifact-${file.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

/* ------------------------------------------------------------ participants */

/** A protocol's declared aliases, resolved to the entities they stand for. */
function protocolParticipants(entity: Entity, catalog: Catalog): Record<string, SequenceParticipant> {
  if (entity.kind !== 'protocol') return {}

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
  return participants
}

/* ------------------------------------------------------------------ parts */

/**
 * The file parsed, but the portal cannot turn it into a picture. Said in the
 * block rather than instead of it: the source pane beside this is the answer.
 */
function Undrawable({ messages, what }: { messages: string[]; what: 'drawn' | 'resolved' }) {
  return (
    <div className="p-3">
      <p className="flex items-center gap-2 text-[13px] font-medium text-warning">
        <AlertTriangle className="size-4" aria-hidden />
        This artifact could not be {what}
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

/** Which other entities' schemas this one was bundled from. */
function ComposedFrom({ sources }: { sources: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-[11px] tracking-wider text-muted-foreground uppercase">
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
  )
}
