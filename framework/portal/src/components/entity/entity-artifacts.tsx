import { AlertTriangle, Link2 } from 'lucide-react'
import Link from 'next/link'
import { ArtifactBlock } from '@/components/code/artifact-block'
import { JourneyDiagram, type JourneyStepTarget } from '@/components/diagrams/journey-diagram'
import { DeferredArazzoGraph, LinkedStateChart, NavigableSequenceDiagram } from '@/components/diagrams/navigable'
import type { SequenceParticipant } from '@/components/diagrams/sequence-diagram'
import { JourneyLegend, type JourneyLegendStep } from '@/components/entity/journey-legend'
import { SectionHeading } from '@/components/entity/section-heading'
import { SchemaLineage } from '@/components/schema/schema-lineage'
import { StoplightSchemaView } from '@/components/schema/stoplight-schema-view'
import { stateChartAnchors, workflowAnchors } from '@/lib/artifacts/anchors'
import { monacoLanguage } from '@/lib/artifacts/language'
import type { AnchorPaths } from '@/lib/artifacts/source-map'
import { catalogDir, entityHref, getSchemaRegistry } from '@/lib/catalog'
import type { Artifact, Catalog, Entity } from '@/lib/catalog'
import { resolveMention } from '@/lib/catalog/mentions'
import { journeySummary, parseJourney, type JourneyStep } from '@/lib/journey/journey'
import { readArazzo, type ArazzoDescription } from '@/lib/protocol/arazzo'
import { arazzoGroundingDiagnostics } from '@/lib/protocol/arazzo-grounding'
import { parseStates } from '@/lib/protocol/states'
import { transportDiagnostics } from '@/lib/protocol/transport-checks'
import { parseWorkflow } from '@/lib/protocol/workflow'
import { bundleSchema } from '@/lib/schema/dereference'
import { buildLineage } from '@/lib/schema/lineage'
import { resolveRef } from '@/lib/srn/srn'
import { cn } from '@/lib/utils'

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
 * its schema, a protocol is its workflows, a journey is its walk. Everything
 * else arrives collapsed,
 * because a page that opens twelve editors is a page that opens slowly.
 */
export async function EntityArtifacts({ entity, catalog }: { entity: Entity; catalog: Catalog }) {
  if (entity.artifacts.length === 0) return null

  const participants = protocolParticipants(entity, catalog)
  const blocks = await Promise.all(
    entity.artifacts.map((artifact) => describe(entity, artifact, participants, catalog)),
  )

  // Promoted first, otherwise the loader's order (alphabetical by path).
  const ordered = [...blocks].sort((a, b) => Number(b.primary) - Number(a.primary))

  return (
    <section className="mt-10" aria-labelledby="section-artifacts">
      <div className="flex flex-wrap items-baseline gap-3">
        <SectionHeading id="section-artifacts">Artifacts</SectionHeading>
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
  catalog: Catalog,
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
        // Extra room on the left: an expandable row's chevron is pulled into
        // the gutter by a negative margin, far enough that at an even `p-4` it
        // touched the panel edge. The padding is asymmetric because the cause
        // is — nothing hangs off the other three sides.
        //
        // `bg-surface` because Mosaic paints no background of its own and the
        // panel's is several ancestors away, which leaves anything that pins
        // itself inside this box sitting on nothing.
        <div className="max-h-[520px] overflow-auto bg-surface py-4 pr-4 pl-6">
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
      // A workflow is parsed best-effort, so an over-long note or an orphan
      // return leaves `workflow` non-null and the diagram perfectly readable —
      // and until this footer existed those issues were rendered nowhere at
      // all, on this page or on /diagnostics. The journey block had solved this
      // already; the two now say the same thing in the same place.
      footer: workflow && issues.length > 0 ? <ArtifactFindings issues={issues} /> : undefined,
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
      // Same reason as the workflow block above: a machine whose `id` disagrees
      // with the protocol name still draws, and the complaint had nowhere to go.
      //
      // `path` is dropped: `parseStates` speaks Diagnostic, whose path is the
      // *file*, and this block is already titled with that file. The workflow
      // and journey parsers put an in-document position there instead, which is
      // the thing worth showing.
      footer:
        chart && diagnostics.length > 0 ? (
          <ArtifactFindings
            issues={diagnostics.map((issue) => ({
              code: issue.code,
              severity: issue.severity,
              message: issue.message,
            }))}
          />
        ) : undefined,
    }
  }

  if (entity.kind === 'protocol' && artifact.file === ARAZZO_FILE) {
    const description = readArazzo(artifact.data)
    const grounding = arazzoGroundingDiagnostics(artifact.data, {
      siblings: entity.artifacts,
      srn: entity.srn,
    })

    return {
      ...base,
      role: 'Orchestration',
      // Never promoted. `workflows/` is the authoritative choreography and keeps
      // the top of the page; an Arazzo Description is one executor's path
      // through the same exchange, which is a second view and not the first one
      // ([0020](srn://metaframework/adr/0020-arazzo-as-a-sibling-role)).
      primary: false,
      visual: description ? (
        // No frame of its own: the block is the frame.
        <DeferredArazzoGraph
          description={description}
          sourceHrefs={arazzoSourceHrefs(entity, description)}
          className="rounded-none border-0"
        />
      ) : (
        <Undrawable
          messages={['The document declares no `workflows` array, so there are no steps to draw.']}
          what="drawn"
        />
      ),
      // One rule reaches this artifact, and only one: `W_PROTO_ARAZZO_UNGROUNDED`
      // asks whether the sources and step references land inside artifacts this
      // entity carries. Nothing here validates an Arazzo Description — the
      // framework has no Arazzo grammar to assert — so a document this reader
      // cannot draw still says so in the panel rather than as a defect, and the
      // findings below are about references between files.
      //
      // Same call, same arguments as `lib/catalog/artifact-checks.ts`: the two
      // surfaces must derive the same findings from the same file. `path` is
      // dropped for the same reason it is on `states.json` — the block is
      // already titled with the file, and the in-document position the message
      // carries is the part worth showing.
      footer:
        grounding.length > 0 ? (
          <ArtifactFindings
            issues={grounding.map((issue) => ({
              code: issue.code,
              severity: issue.severity,
              message: issue.message,
            }))}
          />
        ) : undefined,
    }
  }

  if (entity.kind === 'protocol' && artifact.file === TRANSPORT_FILE) {
    // The transport reader, in whichever of the two dialects the file declares.
    // Same call, same arguments as `lib/catalog/artifact-checks.ts` — the two
    // surfaces must derive the same findings from the same file, and this one is
    // the reason that rule is written down: a `transport.yaml` was rendered here
    // as bytes for two releases while its rules sat in the debt register.
    //
    // No `visual`. There is nothing to draw that the document does not already
    // say better than a picture of it would — the workflows are the choreography
    // and they have the diagram — so this branch adds findings and a role and
    // leaves the source block exactly as it was.
    const frontmatter = entity.frontmatter as { title?: unknown; participants?: unknown }
    const findings = transportDiagnostics(artifact.data, {
      ...(artifact.dialect ? { dialect: artifact.dialect } : {}),
      srn: entity.srn,
      ...(typeof frontmatter.title === 'string' ? { title: frontmatter.title } : {}),
      ...(Array.isArray(frontmatter.participants) ? { participants: frontmatter.participants } : {}),
    })

    return {
      ...base,
      role: 'Wire',
      primary: primaryFor(entity, artifact),
      // `path` is dropped for the reason it is on `states.json` and `arazzo.yaml`
      // — the block is already titled with the file, and the in-document
      // position the message carries is the part worth showing.
      footer:
        findings.length > 0 ? (
          <ArtifactFindings
            issues={findings.map((issue) => ({
              code: issue.code,
              severity: issue.severity,
              message: issue.message,
            }))}
          />
        ) : undefined,
    }
  }

  if (entity.kind === 'journey' && artifact.file === JOURNEY_FILE) {
    const { journey, issues } = parseJourney(artifact.data, {
      entityName: entity.frontmatter.name,
      journeySrn: entity.srn,
      protagonist: typeof entity.frontmatter.actor === 'string' ? entity.frontmatter.actor : undefined,
    })
    const resolved = journey ? journey.steps.map((step) => resolveStep(catalog, entity.srn, step)) : []

    return {
      ...base,
      role: 'Path',
      primary: true,
      visual:
        journey && journey.steps.length > 0 ? (
          // No frame of its own: the block is the frame, and a panel inside a
          // panel reads as two things rather than one artifact.
          <JourneyDiagram
            steps={resolved.map(({ draw }) => draw)}
            summary={journeySummary(journey)}
            className="rounded-none border-0"
          />
        ) : (
          <Undrawable messages={issues.map((issue) => `${issue.code}: ${issue.message}`)} what="drawn" />
        ),
      // The ladder is a footer rather than part of the drawing: it belongs to
      // the artifact but to neither pane, exactly like a schema's sources. The
      // findings sit with it rather than in the block's `error` banner — that
      // banner means "unparsed, nothing derived", and a journey that crosses an
      // undocumented boundary parsed perfectly well and is drawn.
      footer:
        resolved.length > 0 ? (
          <div className="space-y-3">
            <JourneyLegend steps={resolved.map(({ legend }) => legend)} />
            <ArtifactFindings issues={issues} />
          </div>
        ) : undefined,
    }
  }

  return { ...base, primary: primaryFor(entity, artifact) }
}

const SCHEMA_FILE = 'schema.json'
const STATES_FILE = 'states.json'
const JOURNEY_FILE = 'journey.yaml'
const ARAZZO_FILE = 'arazzo.yaml'
const TRANSPORT_FILE = 'transport.yaml'

/**
 * Where each source description of an Arazzo file leads.
 *
 * Arazzo names its sources by a relative URI-reference — `./transport.yaml`,
 * `./openapi.yaml` — which ADR 0020 requires to be a sibling artifact of the
 * same entity. So the target is the artifact block for that file, on this same
 * page, and the join is exact: the url has to name an artifact the entity
 * actually carries, or the source gets no link rather than a dead one.
 *
 * A plain object because the graph is a client component reached through
 * `next/dynamic` and this function runs on the server — a lookup closure could
 * not cross that boundary.
 */
function arazzoSourceHrefs(entity: Entity, description: ArazzoDescription): Record<string, string> {
  const carried = new Set(entity.artifacts.map((artifact) => artifact.file))
  const hrefs: Record<string, string> = {}
  for (const source of description.sources) {
    if (source.name === null || source.url === null) continue
    const file = source.url.replace(/^\.\//, '')
    if (!carried.has(file)) continue
    hrefs[source.name] = `#${blockId(file)}`
  }
  return hrefs
}

/**
 * One parsed step, resolved against the catalog twice over: once for the
 * drawing (labels and a hue) and once for the legend (real link targets).
 *
 * Both halves come from the same {@link resolveMention} call, so the badge under
 * the picture and the box in it can never disagree about what a reference
 * points at.
 */
function resolveStep(
  catalog: Catalog,
  baseSrn: string,
  step: JourneyStep,
): { draw: JourneyStepTarget; legend: JourneyLegendStep } {
  const actor = resolveMention(catalog, baseSrn, step.actor)
  const touches = resolveMention(catalog, baseSrn, step.touches)
  const protocol = step.protocol ? resolveMention(catalog, baseSrn, step.protocol) : null

  return {
    draw: {
      ordinal: step.ordinal,
      // The resolved name where there is one, the raw reference's tail where
      // there is not — a drawing that silently dropped an unresolved step would
      // hide the one thing worth seeing.
      actor: actor.target?.name ?? step.actorLabel,
      touches: touches.target?.name ?? step.touchesLabel,
      ...(step.protocol ? { via: protocol?.target?.name ?? step.protocolLabel } : {}),
      actorCarried: step.protocolNone,
      // The band is the owning product's name, which is what the reader knows
      // it by — `product/shop` is the pair, `shop` is the word on the tab.
      band: step.owningProduct?.replace(/^product\//, '') ?? null,
      crossing: step.crossing,
      handoff: step.handoff,
      kind: touches.target?.kind ?? null,
      srn: touches.target?.srn ?? null,
    },
    legend: {
      ordinal: step.ordinal,
      actor: actor.target,
      actorRef: step.actor,
      handoff: step.handoff,
      touches: touches.target,
      touchesRef: step.touches,
      crossing: step.crossing,
      protocol: protocol?.target ?? null,
      ...(step.protocol ? { protocolRef: step.protocol } : {}),
      actorCarried: step.protocolNone,
      ...(step.note ? { note: step.note } : {}),
    },
  }
}

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

/**
 * What a mini-spec parser found in a file it could still draw.
 *
 * `W_JRN_UNDOCUMENTED_INTEGRATION` is the finding the journey kind exists to
 * produce, so it belongs beside the walk rather than only in /diagnostics.
 * Errors appear here too: a step count outside 2–12, a note past the 200-char
 * cap, a state machine whose `id` is not the protocol's name — all are real
 * violations of files that nonetheless render, and hiding them until the
 * diagnostics page would be the portal knowing something the page it is on does
 * not say.
 *
 * The same list serves all three parsers because it is the same claim in each
 * case: this drawing is correct, and this file is still wrong.
 */
function ArtifactFindings({
  issues,
}: {
  issues: ReadonlyArray<{ code: string; severity: string; message: string; path?: string }>
}) {
  if (issues.length === 0) return null

  return (
    <ul className="space-y-1">
      {issues.map((issue, index) => (
        <li key={index} className="flex gap-2 text-[12.5px] leading-relaxed">
          <code
            className={cn(
              'shrink-0 font-mono text-[11px]',
              issue.severity === 'error' ? 'text-destructive' : 'text-warning',
            )}
          >
            {issue.code}
          </code>
          {/* The in-document position, where the parser gave one. `steps[3]` is
              what turns "a note is too long" into a place to look, and the
              source pane beside this block is addressed the same way. */}
          {issue.path ? (
            <code className="shrink-0 font-mono text-[11px] text-muted-foreground">{issue.path}</code>
          ) : null}
          <span className="text-foreground/75">{issue.message}</span>
        </li>
      ))}
    </ul>
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
