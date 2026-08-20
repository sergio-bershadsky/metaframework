import matter from 'gray-matter'
import { ArrowUpRight, ChevronRight, FileWarning } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EntityLink } from '@/components/entity-link'
import { CapabilityRealizedBy, CAPABILITY_DERIVED_EDGES } from '@/components/entity/capability-realized-by'
import { EntityArtifacts } from '@/components/entity/entity-artifacts'
import { EntityChildren } from '@/components/entity/entity-children'
import { EntityDetails } from '@/components/entity/entity-details'
import { EntityGraph } from '@/components/entity/entity-graph'
import { EntityRelations } from '@/components/entity/entity-relations'
import { EntityVersionNotice, EntityVersionProblem } from '@/components/entity/entity-version-notice'
import { METRIC_STAT_FIELDS, MetricStats } from '@/components/entity/metric-stats'
import { KindBadge, StatusBadge } from '@/components/kind-badge'
import { LifecycleChip } from '@/components/lifecycle-chip'
import { Markdown } from '@/components/markdown'
import { SrnAddress } from '@/components/srn-address'
import { VersionPicker, type VersionOption } from '@/components/version-picker'
import {
  type Catalog,
  type CommonFrontmatter,
  type Diagnostic,
  EDGE_TYPES,
  type EdgeType,
  type Entity,
  type Relation,
  ancestorsOf,
  childrenOf,
  descendantsOf,
  commonFrontmatterSchema,
  entityHref,
  getCatalog,
} from '@/lib/catalog'
import { srnFromSegments } from '@/lib/catalog/href'
import { mentionsIn } from '@/lib/catalog/mentions'
import { type EntityHistory, getEntityHistory, readFileAtRevision } from '@/lib/history/git'
import { formatSrn, parseSrn, resolveRef } from '@/lib/srn/srn'
import { kindStyle } from '@/lib/ui/kind'
import { lifecycleOf } from '@/lib/ui/lifecycle'

/**
 * One entity, at whichever version the URL asks for.
 *
 * `?v=N` is the whole state of this page. Keeping it in the URL rather than in
 * client state is what makes a historical view shareable — "look at the
 * datamodel as it was when we agreed the contract" is a link, not a sequence of
 * clicks — and it keeps the render on the server, where the git reads already
 * live.
 *
 * The version list costs one `git log` plus one `git show` per commit, and the
 * page now pays for it unconditionally because the picker sits in the header.
 * That is deliberate: an affordance that only appears after a round trip is an
 * affordance most readers never discover. The history module caches per commit
 * for the life of the process, so the cost lands once per entity.
 */

const ENTITY_DOCUMENT = 'index.md'

export async function generateMetadata(props: PageProps<'/catalog/[...srn]'>): Promise<Metadata> {
  const [{ srn: segments }, query] = await Promise.all([props.params, props.searchParams])
  const catalog = await getCatalog()
  const entity = catalog.entities.get(srnFromSegments(segments))
  if (!entity) return { title: 'Not found' }

  // The title reflects what was *requested*, not what could be produced: a
  // shared `?v=2` link must not preview as if it were the current document,
  // even when v2 turns out to be unreachable.
  const requested = requestedVersion(query.v)
  const historical = requested !== null && requested !== entity.frontmatter.version
  return {
    title: historical ? `${entity.frontmatter.title} · v${requested}` : entity.frontmatter.title,
    description: entity.frontmatter.summary,
  }
}

export default async function EntityPage(props: PageProps<'/catalog/[...srn]'>) {
  const [{ srn: segments }, query] = await Promise.all([props.params, props.searchParams])
  const srn = srnFromSegments(segments)
  const catalog = await getCatalog()
  const entity = catalog.entities.get(srn)
  if (!entity) notFound()

  const href = entityHref(srn)
  const history = await getEntityHistory(entity.relDir)
  const options = versionOptions(history, entity.frontmatter.version)

  const asked = firstValue(query.v)
  const requested = requestedVersion(query.v)
  const snapshot = await loadSnapshot(entity, history, requested)

  // Everything below reads from `view`. At the current version that is the
  // entity the loader built; at a historical one it is the same object with the
  // fields index.md actually carried at that commit.
  const view = snapshot?.entity ?? entity
  const historical = snapshot !== null
  const ancestors = ancestorsOf(catalog, srn)
  const children = childrenOf(catalog, srn)
  const descendants = descendantsOf(catalog, srn)
  const inbound = catalog.inbound.get(srn) ?? []
  const diagnostics = catalog.diagnostics.filter((d) => d.srn === srn)
  const style = kindStyle(entity.kind)
  const Icon = style.icon
  // Read from `view`, not from `entity`: a revision written before the field
  // existed has no lifecycle, and inheriting today's would date-mix.
  const lifecycle = lifecycleOf(entity.kind, view.frontmatter as Record<string, unknown>)

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

      {/* Above the header, not below it: by the time a reader reaches the prose
          they have already started believing it. */}
      {snapshot && (
        <EntityVersionNotice
          className="mb-6"
          version={snapshot.version}
          current={entity.frontmatter.version}
          total={options.length}
          date={snapshot.date}
          subject={snapshot.subject}
          short={snapshot.short}
          href={href}
          hidden={HIDDEN_AT_HISTORICAL}
          degraded={snapshot.degraded}
        />
      )}

      {!snapshot && asked !== null && requested !== entity.frontmatter.version && (
        <EntityVersionProblem
          className="mb-6"
          requested={asked}
          current={entity.frontmatter.version}
          reason={
            requested === null
              ? `"${asked}" is not a version number — versions are integers from 1.`
              : (history.unavailable?.message ??
                `No commit carries v${requested}; git knows ${describeVersions(options)}.`)
          }
          hint={history.unavailable?.hint ?? null}
          href={href}
        />
      )}

      <header className="animate-rise">
        <div className="flex items-start gap-3.5">
          <span
            className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg border ${style.border} ${style.bg}`}
          >
            <Icon className={`size-4.5 ${style.text}`} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{view.frontmatter.title}</h1>
            <SrnAddress srn={entity.srn} version={view.frontmatter.version} className="mt-1.5" />
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
          {view.frontmatter.summary}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <KindBadge kind={entity.kind} />
          <StatusBadge status={view.frontmatter.status} />
          {/* Immediately beside status, because the pair is the point: this
              says the review state of the description, that says the delivery
              state of the thing. Two chips that looked alike would undo the
              distinction the spec works hardest to draw — see LifecycleChip. */}
          {lifecycle && <LifecycleChip stage={lifecycle} />}
          <VersionPicker
            href={href}
            selected={view.frontmatter.version}
            current={entity.frontmatter.version}
            options={options}
          />
          {view.frontmatter.owner && (
            <span className="inline-flex items-center rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {view.frontmatter.owner}
            </span>
          )}
          {view.frontmatter.tags?.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      </header>

      {/* Diagnostics are the loader's verdict on what is on disk. Repeating them
          over a historical snapshot would attribute today's defects to an old
          revision, so they belong to the current view only. */}
      {!historical && diagnostics.length > 0 && <Diagnostics diagnostics={diagnostics} />}

      {/* A metric's numbers are the substance of its page, not a detail of it,
          so they sit above the prose in the shape a number belongs in. The
          fields are then omitted from Details, so each appears exactly once. */}
      {entity.kind === 'metric' && <MetricStats entity={view} />}

      {/* Same argument, one kind over: a capability adds no frontmatter of its
          own, so what realizes it IS the page. Derived, and hidden on a
          historical view along with every other cross-entity derivation. */}
      {entity.kind === 'capability' && !historical && (
        <CapabilityRealizedBy catalog={catalog} inbound={inbound} />
      )}

      <div className="rule-fade my-7" />

      {view.body && <Markdown mentions={mentionsIn(catalog, view.srn, view.body)}>{view.body}</Markdown>}

      <EntityDetails entity={view} catalog={catalog} omit={detailsOmitted(entity.kind)} />

      {historical ? (
        <HistoricalRelations entity={view} catalog={catalog} />
      ) : (
        <>
          {/* Artifacts lead: a datamodel's schema and a protocol's workflows are
              the substance of those pages, and each now carries its own source
              rather than being echoed by a raw list further down. */}
          <EntityArtifacts entity={view} catalog={catalog} />
          <EntityGraph entity={view} catalog={catalog} />
          <EntityRelations
            entity={view}
            catalog={catalog}
            inbound={inbound}
            omitIncoming={entity.kind === 'capability' ? CAPABILITY_DERIVED_EDGES : undefined}
          />
          <EntityChildren srn={srn} entities={children} descendants={descendants} />
        </>
      )}
    </article>
  )
}

/**
 * The loader's verdict on this entity, in the register its severity earns.
 *
 * Until the three conceptual kinds landed, an entity's diagnostics were errors
 * in practice, and one destructive-red box was an honest summary. It is not any
 * more: capability, journey and metric each ship a *warning* that is a true
 * statement about a system still being built — nothing realizes this yet, this
 * hop crosses a product boundary nobody wrote a protocol for, this number is
 * filed away from what it measures. Painting "no product realizes this
 * capability" in the same red as a schema violation tells a reader to go and
 * fix a design-first catalog for being design-first.
 *
 * So the box takes the register of the WORST severity present, and each row
 * keeps its own — a page with one of each shows the error's red frame and still
 * marks which line is only a warning. /diagnostics has always split them; this
 * is the entity page catching up.
 */
function Diagnostics({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length
  const worst = errors > 0 ? 'error' : 'warning'
  const total = diagnostics.length

  return (
    <section
      className={
        worst === 'error'
          ? 'mt-6 rounded-lg border border-destructive/35 bg-destructive/[0.07] p-4'
          : 'mt-6 rounded-lg border border-warning/35 bg-warning/[0.06] p-4'
      }
    >
      <h2
        className={`flex items-center gap-2 text-sm font-medium ${
          worst === 'error' ? 'text-destructive' : 'text-warning'
        }`}
      >
        <FileWarning className="size-4" aria-hidden />
        {errors > 0
          ? `${total} problem${total === 1 ? '' : 's'} in this entity`
          : `${total} warning${total === 1 ? '' : 's'} on this entity`}
      </h2>
      <ul className="mt-2.5 space-y-1.5">
        {diagnostics.map((diagnostic, index) => (
          <li key={index} className="flex gap-2 text-[13px] leading-relaxed">
            <code
              className={`shrink-0 font-mono text-[11.5px] ${
                diagnostic.severity === 'error' ? 'text-destructive/90' : 'text-warning/90'
              }`}
            >
              {diagnostic.code}
            </code>
            <span className="text-foreground/80">{diagnostic.message}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Kind fields this page draws somewhere better than a definition list.
 *
 * Stated as one function rather than inline at each call site, because the
 * property being kept is global — every kind field appears exactly once on the
 * page — and a property nobody can read in one place is a property that decays.
 */
function detailsOmitted(kind: Entity['kind']): readonly string[] {
  if (kind === 'metric') return METRIC_STAT_FIELDS
  // The lifecycle chip sits in the header beside status, where the contrast
  // between the two is the whole point.
  if (kind === 'product' || kind === 'component') return ['lifecycle']
  return []
}

// --- historical rendering ----------------------------------------------------

/**
 * What a historical page deliberately omits, named for the reader.
 *
 * Every one of these is derived from something *other* than this entity's
 * index.md: inbound edges and the neighbourhood graph come from other entities'
 * current frontmatter, contents from the directory tree as it is now, artifacts
 * and the schema from sibling files whose own history is separate — and the
 * schema in particular is bundled by following `$ref`s across entities, so a
 * "historical" shape would be this revision's skeleton wearing today's parts.
 * Showing any of them beside v2 prose would invite a false reading: that this
 * is how the neighbourhood looked at v2. Outgoing edges are the exception —
 * they are authored in the document itself — so they are reconstructed below.
 */
const HIDDEN_AT_HISTORICAL = [
  'incoming relations',
  'the neighbourhood graph',
  'contents',
  'artifacts and schema',
  'or loader diagnostics',
]

/** Outgoing edge labels. Kept in step with entity-relations.tsx by the type. */
const OUTGOING_LABELS: Record<EdgeType, string> = {
  uses: 'Uses',
  exposes: 'Exposes',
  'depends-on': 'Depends on',
  implements: 'Implements',
  supersedes: 'Supersedes',
  realizes: 'Realizes',
  measures: 'Measures',
}

/**
 * The edges this revision authored, resolved against today's catalog.
 *
 * A target that has since been renamed or deleted renders as unresolved, which
 * is the honest answer: the reference was valid when written and is not now.
 * This is a separate renderer from EntityRelations because that component pairs
 * outgoing edges with derived incoming ones, and an empty incoming column here
 * would read as "nothing referenced this at v2" — a claim nothing supports.
 */
function HistoricalRelations({ entity, catalog }: { entity: Entity; catalog: Catalog }) {
  if (entity.relations.length === 0) return null

  const groups = new Map<EdgeType, Relation[]>()
  for (const relation of entity.relations) {
    groups.set(relation.edge, [...(groups.get(relation.edge) ?? []), relation])
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Relations</h2>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ArrowUpRight className="size-3 text-warning" aria-hidden />
          outgoing only, as authored at v{entity.frontmatter.version}
        </span>
      </div>

      <div className="mt-4 space-y-3.5">
        {[...groups.entries()].map(([edge, relations]) => (
          <div key={edge}>
            <p className="mb-1.5 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              {OUTGOING_LABELS[edge]}
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {relations.map((relation, index) => {
                const target = relation.target ? catalog.entities.get(relation.target) : undefined
                return (
                  <li key={`${relation.ref}-${index}`}>
                    <EntityLink
                      reference={relation.ref}
                      version={relation.version}
                      showTitle
                      target={
                        target
                          ? {
                              srn: target.srn,
                              name: target.frontmatter.name,
                              title: target.frontmatter.title,
                              kind: target.kind,
                            }
                          : null
                      }
                    />
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

// --- reading a version -------------------------------------------------------

interface Snapshot {
  entity: Entity
  version: number
  date: string
  subject: string
  short: string
  /** The revision's frontmatter did not satisfy today's contract. */
  degraded: boolean
}

/**
 * The entity as index.md carried it at the commit that version N resolves to.
 *
 * Returns null — never throws, never 404s — whenever the current version is
 * asked for, the request is malformed, git is unreachable, or no commit carries
 * that version. The caller then renders the current entity with a notice, which
 * is strictly more useful than an error page.
 */
async function loadSnapshot(
  entity: Entity,
  history: EntityHistory,
  requested: number | null,
): Promise<Snapshot | null> {
  if (requested === null || requested === entity.frontmatter.version) return null
  if (history.unavailable) return null

  const commit = history.versions[String(requested)]
  if (!commit) return null

  const revision = await readFileAtRevision(`${entity.relDir}/${ENTITY_DOCUMENT}`, commit)
  if (revision.content === null) return null

  const source = history.revisions.find((candidate) => candidate.hash === commit)
  if (!source) return null

  let data: Record<string, unknown> = {}
  let body = ''
  try {
    const parsed = matter(revision.content)
    data = (parsed.data ?? {}) as Record<string, unknown>
    body = parsed.content.trim()
  } catch {
    // A revision whose frontmatter will not even parse as YAML still has a
    // version and a commit worth showing; the fallback below fills the rest.
    body = revision.content.trim()
  }

  const result = commonFrontmatterSchema.safeParse(data)
  const frontmatter = result.success ? result.data : coerceFrontmatter(data, entity.frontmatter)

  return {
    entity: {
      ...entity,
      frontmatter,
      body,
      // Sibling files are read from disk by the loader and belong to the current
      // revision; carrying them onto a historical page would date-mix.
      artifacts: [],
      children: [],
      relations: relationsOf(frontmatter, entity.srn),
    },
    version: requested,
    date: source.date,
    subject: source.subject,
    short: source.short,
    degraded: !result.success,
  }
}

/**
 * Best-effort frontmatter for a revision written against an older contract.
 *
 * The catalog's contract has evolved and will again, so a document that is
 * perfectly valid at its own commit may fail today's schema. Refusing to render
 * it would make exactly the oldest, most interesting revisions unreachable, so
 * every required field falls back to the current one and the notice says so.
 */
function coerceFrontmatter(data: Record<string, unknown>, fallback: CommonFrontmatter): CommonFrontmatter {
  const text = (value: unknown, spare: string): string =>
    typeof value === 'string' && value.trim().length > 0 ? value : spare

  return {
    ...data,
    name: text(data.name, fallback.name),
    kind: (typeof data.kind === 'string' ? data.kind : fallback.kind) as CommonFrontmatter['kind'],
    version: typeof data.version === 'number' && Number.isInteger(data.version) ? data.version : fallback.version,
    title: text(data.title, fallback.title),
    summary: text(data.summary, fallback.summary),
    status: (typeof data.status === 'string' ? data.status : fallback.status) as CommonFrontmatter['status'],
  } as CommonFrontmatter
}

/**
 * Outgoing edges from a revision's frontmatter.
 *
 * The loader does this too, but as a side effect of validation: it emits
 * diagnostics against the current catalog. Here the same resolution runs
 * silently, because a historical revision is not a thing anyone can fix.
 */
function relationsOf(frontmatter: CommonFrontmatter, srn: string): Relation[] {
  const authored = (frontmatter.relations ?? {}) as Partial<Record<EdgeType, string[]>>
  const relations: Relation[] = []

  for (const [edge, refs] of Object.entries(authored)) {
    if (!(EDGE_TYPES as readonly string[]).includes(edge)) continue
    if (!Array.isArray(refs)) continue

    for (const ref of refs) {
      if (typeof ref !== 'string') continue
      try {
        const parsed = parseSrn(resolveRef(srn, ref))
        relations.push({
          edge: edge as EdgeType,
          ref,
          target: formatSrn({ ...parsed, version: null }),
          version: parsed.version,
        })
      } catch {
        relations.push({ edge: edge as EdgeType, ref, target: null, version: null })
      }
    }
  }
  return relations
}

// --- the version list --------------------------------------------------------

/**
 * One entry per version, newest first.
 *
 * `history.versions` already picks the right commit for each version — the last
 * one carrying it, so a status-only follow-up is what a pin resolves to — and
 * this only attaches the commit's date and subject for display. The current
 * version is included even when git has never seen it (an uncommitted entity),
 * because the picker must always be able to point at where the reader is.
 */
function versionOptions(history: EntityHistory, current: number): VersionOption[] {
  const options = new Map<number, VersionOption>()

  for (const [version, hash] of Object.entries(history.versions)) {
    const revision = history.revisions.find((candidate) => candidate.hash === hash)
    if (!revision) continue
    const value = Number(version)
    options.set(value, {
      version: value,
      date: revision.date,
      subject: revision.subject,
      short: revision.short,
      current: value === current,
    })
  }

  if (!options.has(current)) {
    options.set(current, {
      version: current,
      date: '',
      subject: 'on disk, not yet committed',
      short: 'worktree',
      current: true,
    })
  }

  return [...options.values()].sort((a, b) => b.version - a.version)
}

function describeVersions(options: VersionOption[]): string {
  const versions = options.map((option) => `v${option.version}`)
  if (versions.length === 0) return 'no versions for this entity'
  if (versions.length === 1) return `only ${versions[0]}`
  return `${versions.slice(0, -1).join(', ')} and ${versions[versions.length - 1]}`
}

// --- query parsing -----------------------------------------------------------

type QueryValue = string | string[] | undefined

/** Repeated parameters are a mistake, not a set: the first one wins. */
function firstValue(value: QueryValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

/** `?v=` as a version number, or null when it is absent or not one. */
function requestedVersion(value: QueryValue): number | null {
  const raw = firstValue(value)
  if (raw === null) return null
  if (!/^\d+$/.test(raw)) return null
  const version = Number(raw)
  return Number.isSafeInteger(version) && version >= 1 ? version : null
}
