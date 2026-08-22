import type { Catalog, Entity } from '../catalog/types'
import { SrnError, formatSrn, parseSrn, resolveRef } from '../srn/srn'
import { TOPOLOGY_ARTIFACT, parseTopology } from './environment'
import type { Host, Region, Topology } from './environment'

/**
 * `topology.yaml` → Structurizr DSL, as a **derived export** and nothing else.
 *
 * This is the prototype
 * [0016-topology-format-deferred](srn://metaframework/adr/0016-topology-format-deferred)
 * left open. That record rejected Structurizr as a *migration* on criteria (d)
 * and (e) — a `containerInstance` points at a Structurizr element rather than at
 * an SRN, and `description` strings were judged unable to hold 67% of a file —
 * while accepting that its semantics are the only surveyed match for the two
 * criteria that killed everything else: the environment is the subject of a
 * `deploymentEnvironment` (criterion a), nothing deploys from the model
 * (criterion b), and `instances` takes a **range** (criterion c). A derived
 * export tests that claim without moving a byte of the source.
 *
 * So: **one authority, one direction.** `topology.yaml` stays exactly as it is,
 * this module never writes, and nothing in the portal reads the DSL back. The
 * function is pure — catalog and one environment entity in, text out — because
 * the whole point is that the mapping is checkable in a unit test rather than
 * demonstrated by a screenshot.
 *
 * Every fact that has no C4 home is emitted as a `metaframework.*` **property**
 * rather than dropped, and that deserves to be read as the finding it is:
 * `properties` is an untyped string map, so the export is lossless in the places
 * it is lossless *because Structurizr has an extension point*, not because C4
 * models the concept. The distinction matters to anybody re-reading criterion
 * (d) — smuggling an SRN through a property is exactly what "the join back to
 * the component graph becomes a mapping table somebody maintains" describes, and
 * it is fine here only because the mapping table is this file and it is
 * regenerated rather than maintained.
 *
 * What genuinely cannot survive is reported rather than hidden: see
 * {@link ExportNote} and the `COMMENTS_DROPPED`, `RANGE_SPLIT_ACROSS_REGIONS`
 * and `COMPONENT_FLATTENED` codes in particular.
 *
 * The grammar targeted is `structurizr/structurizr` v2026.06.28 — verified
 * against `DeploymentNodeParser` (`deploymentNode <name> [description]
 * [technology] [tags] [instances]`), `DeploymentNode.setInstances` (a bare
 * number must be ≥ 1; a range is `\d+..\d+` with lower ≤ upper),
 * `IdentifiersRegister` (`\w[a-zA-Z0-9_-]*`, matched case-insensitively) and
 * `Tokenizer`/`Tokens` (quoted tokens, `\"` and `\n` unescaped on read).
 */

/* ------------------------------------------------------------------- notes */

/**
 * One thing the export could not carry, or carried only by convention.
 *
 * `dropped` means the fact is not in the output at all; `lossy` means it is
 * there but a reader of the DSL alone cannot recover the original claim;
 * `info` records a mapping decision that is faithful but worth stating.
 */
export interface ExportNote {
  code:
    | 'COMMENTS_DROPPED'
    | 'SYNTHETIC_PLACE'
    | 'HOST_UNRESOLVED'
    | 'HOST_NOT_DEPLOYABLE'
    | 'REGION_UNDECLARED'
    | 'COMPONENT_FLATTENED'
    | 'PRODUCT_OVERRIDE_FLATTENED'
    | 'RANGE_SPLIT_ACROSS_REGIONS'
    | 'ZONES_DECLARED_EMPTY'
    | 'RELATIONSHIPS_OMITTED'
    | 'NAME_DISAMBIGUATED'
    | 'BACKSLASH_UNREPRESENTABLE'
    | 'TOPOLOGY_UNPARSED'
  severity: 'info' | 'lossy' | 'dropped'
  /** Positional path inside `topology.yaml`, or '' for a whole-file fact. */
  path: string
  message: string
}

export interface ExportStats {
  regions: number
  zones: number
  /** Host entries in the file. */
  hosts: number
  /** Host entries that reached the output as at least one deployment node. */
  hostsExported: number
  /** Deployment nodes carrying an instance — one per (host entry × region). */
  placements: number
}

export interface StructurizrExport {
  /** The DSL text, or null when `topology.yaml` is missing or unparseable. */
  dsl: string | null
  notes: ExportNote[]
  stats: ExportStats
}

/* ------------------------------------------------------------- DSL literals */

const IDENTIFIER_SAFE = /[^a-zA-Z0-9_-]/g

/**
 * A quoted DSL token.
 *
 * `Tokens.get` applies exactly two unescapes, `\"` → `"` and `\n` → newline, so
 * those are exactly the two escapes worth writing. A literal backslash has **no**
 * representation: doubling it does not help, because the unescape is a plain
 * regex replace and `\\n` would still yield a newline. Callers detect that case
 * and file `BACKSLASH_UNREPRESENTABLE` rather than silently corrupting prose.
 */
function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"').replace(/\r\n|\r|\n/g, '\\n')}"`
}

/**
 * `instances`, and the one criterion that decided the whole survey.
 *
 * A range survives as a range. A fixed count — `{ min: n, max: n }`, which is how
 * this format spells "a range was considered and closed" — becomes the bare
 * number Structurizr expects, which reads back as the same pair. `{ 0, 0 }` is
 * the single exception: `setInstances` refuses a bare `0`, so it is written as
 * the degenerate range, which the same method accepts.
 */
export function instancesLiteral(replicas: { min: number; max: number }): string {
  if (replicas.min !== replicas.max) return `${replicas.min}..${replicas.max}`
  return replicas.min === 0 ? '0..0' : String(replicas.min)
}

/** An SRN as a DSL identifier: unique by construction, because the SRN is. */
export function identifierFor(srn: string): string {
  const body = srn.replace(/^srn:\/\//, '').replace(IDENTIFIER_SAFE, '_')
  return /^[a-zA-Z0-9_]/.test(body) ? body : `e_${body}`
}

/* ------------------------------------------------------------------ writer */

class Dsl {
  private readonly lines: string[] = []
  private depth = 0

  line(text = ''): void {
    this.lines.push(text ? `${'    '.repeat(this.depth)}${text}` : '')
  }

  open(text: string): void {
    this.line(`${text} {`)
    this.depth += 1
  }

  close(): void {
    this.depth -= 1
    this.line('}')
  }

  block(text: string, body: () => void): void {
    this.open(text)
    body()
    this.close()
  }

  properties(entries: Array<[string, string]>): void {
    if (entries.length === 0) return
    this.block('properties', () => {
      for (const [key, value] of entries) this.line(`${quote(key)} ${quote(value)}`)
    })
  }

  toString(): string {
    return `${this.lines.join('\n')}\n`
  }
}

/* ----------------------------------------------------------------- helpers */

type Property = [string, string]

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** One property, or none — the shape every optional field folds into. */
function prop(key: string, value: string | number | undefined | null): Property[] {
  if (value === undefined || value === null || value === '') return []
  return [[key, String(value)]]
}

/** Author-owned `x-` keys, which `parseTopology` admits and the model ignores. */
function extensionKeys(value: object): Property[] {
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key.startsWith('x-'))
    .map(([key, raw]): Property => [`metaframework.${key}`, typeof raw === 'string' ? raw : JSON.stringify(raw)])
}

/** The nearest ancestor of kind `product` — a component's C4 software system. */
function productOf(catalog: Catalog, entity: Entity): Entity | null {
  let cursor: Entity | null = entity
  while (cursor) {
    if (cursor.kind === 'product') return cursor
    cursor = cursor.parent ? (catalog.entities.get(cursor.parent) ?? null) : null
  }
  return null
}

interface Placement {
  host: Host
  index: number
  /** The resolved container, always a `component` or a `product`. */
  target: Entity
  /** The software system the instance belongs to. */
  system: Entity
  /** Declared regions, or `null` when the entry records no placement. */
  regions: string[] | null
}

/* ------------------------------------------------------------------ export */

/**
 * Derive a Structurizr workspace for one environment.
 *
 * Returns `dsl: null` when the environment has no `topology.yaml` or the file
 * does not parse — an export is not the place to restate `E_ENV_TOPOLOGY_SCHEMA`,
 * which `environmentDiagnostics` already reports against the same file.
 */
export function exportStructurizr(catalog: Catalog, environment: Entity): StructurizrExport {
  const notes: ExportNote[] = []
  const stats: ExportStats = { regions: 0, zones: 0, hosts: 0, hostsExported: 0, placements: 0 }

  const artifact = environment.artifacts.find((candidate) => candidate.file === TOPOLOGY_ARTIFACT)
  if (!artifact || artifact.error) {
    notes.push({
      code: 'TOPOLOGY_UNPARSED',
      severity: 'dropped',
      path: '',
      message: artifact
        ? `${TOPOLOGY_ARTIFACT} does not parse: ${artifact.error}`
        : `${environment.srn} has no ${TOPOLOGY_ARTIFACT}`,
    })
    return { dsl: null, notes, stats }
  }

  const { topology } = parseTopology(artifact.data)
  if (!topology) {
    notes.push({
      code: 'TOPOLOGY_UNPARSED',
      severity: 'dropped',
      path: '',
      message: `${TOPOLOGY_ARTIFACT} does not match the topology-document schema`,
    })
    return { dsl: null, notes, stats }
  }

  // The loss that is not a mapping decision at all. Comments never reach
  // `artifact.data`, so no exporter can carry them however good the mapping is —
  // and in this catalog they are a fifth of the file. Measured from `raw` rather
  // than asserted, because ADR 0016's own consequence section says a stale
  // number is indistinguishable from a wrong one.
  const commentBytes = commentByteCount(artifact.raw)
  if (commentBytes > 0) {
    const total = Buffer.byteLength(artifact.raw, 'utf8')
    notes.push({
      code: 'COMMENTS_DROPPED',
      severity: 'dropped',
      path: '',
      message:
        `${commentBytes} of ${total} bytes (${((100 * commentBytes) / total).toFixed(1)}%) are YAML comments, ` +
        'which the loader never puts in artifact.data — no export can carry them',
    })
  }

  const placements = resolvePlacements(catalog, environment, topology, notes, stats)
  reportSemanticGaps(placements, notes)
  const dsl = write(catalog, environment, artifact.dialect?.declared ?? null, topology, placements, notes, stats)

  for (const value of proseOf(topology)) {
    if (!value.text.includes('\\')) continue
    notes.push({
      code: 'BACKSLASH_UNREPRESENTABLE',
      severity: 'lossy',
      path: value.path,
      message:
        'carries a backslash, and the DSL tokenizer has no escape for one — ' +
        'the reader unescapes \\" and \\n unconditionally, so the character cannot round-trip',
    })
  }

  return { dsl, notes, stats }
}

/**
 * The two gaps that are neither a dropped field nor a mangled one: places where
 * the DSL is perfectly valid and *says something the source does not*.
 *
 * They are the findings worth carrying back to ADR 0016, because neither is
 * visible from the six criteria — both are about what C4 means, not about what
 * it can store.
 */
function reportSemanticGaps(placements: Placement[], notes: ExportNote[]): void {
  const placed = new Set(placements.map((placement) => placement.target.srn))

  for (const placement of placements) {
    if (placement.target.kind !== 'product') continue
    const overridden = placements.filter((other) => other.target.srn.startsWith(`${placement.target.srn}/`))
    if (overridden.length === 0) continue
    notes.push({
      code: 'PRODUCT_OVERRIDE_FLATTENED',
      severity: 'lossy',
      path: `hosts[${placement.index}].component`,
      message:
        `a product entry is the shorthand "every component beneath it, with these settings" and the most specific ` +
        `entry wins, so ${overridden.map((other) => `hosts[${other.index}]`).join(', ')} ` +
        `${overridden.length === 1 ? 'overrides' : 'override'} it. C4 has no override: the software system instance and ` +
        'the container instance are two independent instances, so the overridden component is counted twice',
    })
  }

  // Deliberately not mapped. `depends-on` between two placed elements would be a
  // legal relationship, but Structurizr replicates a static relationship onto
  // *every* instance pair in a deployment group — so with checkout in two
  // regions and inventory in one, the export would assert a cross-region call
  // topology.yaml never claimed. Getting it right needs deployment groups per
  // region, which is a modelling decision this prototype has no mandate to make.
  const edges = placements.reduce(
    (count, placement) =>
      count +
      placement.target.relations.filter(
        (relation) =>
          relation.edge === 'depends-on' && relation.target !== null && placed.has(relation.target),
      ).length,
    0,
  )
  if (edges === 0) return
  notes.push({
    code: 'RELATIONSHIPS_OMITTED',
    severity: 'info',
    path: '',
    message:
      `${edges} "depends-on" ${edges === 1 ? 'edge joins two elements' : 'edges join elements'} placed here, and none is exported — ` +
      'Structurizr replicates a static relationship across every instance in a deployment group, ' +
      'which would invent cross-region calls; this view shows placement only',
  })
}

/** Whole-line YAML comments, in bytes. A `#` inside a scalar is not one. */
function commentByteCount(raw: string): number {
  let bytes = 0
  for (const line of raw.split('\n')) {
    if (!line.trimStart().startsWith('#')) continue
    bytes += Buffer.byteLength(line, 'utf8') + 1
  }
  return bytes
}

function proseOf(topology: Topology): Array<{ path: string; text: string }> {
  const found: Array<{ path: string; text: string }> = []
  topology.regions.forEach((region, index) => {
    if (region.notes) found.push({ path: `regions[${index}].notes`, text: region.notes })
  })
  topology.hosts.forEach((host, index) => {
    if (host.scaling) found.push({ path: `hosts[${index}].scaling`, text: host.scaling })
    if (host.notes) found.push({ path: `hosts[${index}].notes`, text: host.notes })
  })
  return found
}

function resolvePlacements(
  catalog: Catalog,
  environment: Entity,
  topology: Topology,
  notes: ExportNote[],
  stats: ExportStats,
): Placement[] {
  const placements: Placement[] = []
  stats.hosts = topology.hosts.length

  topology.hosts.forEach((host, index) => {
    const path = `hosts[${index}].component`
    let srn: string
    try {
      const parsed = parseSrn(resolveRef(environment.srn, host.component))
      if (parsed.artifact !== null) {
        notes.push({
          code: 'HOST_NOT_DEPLOYABLE',
          severity: 'dropped',
          path,
          message: `"${host.component}" addresses an artifact, which has no C4 element`,
        })
        return
      }
      srn = formatSrn({ ...parsed, version: null })
    } catch (cause) {
      notes.push({
        code: 'HOST_UNRESOLVED',
        severity: 'dropped',
        path,
        message: `"${host.component}" is not a resolvable SRN: ${cause instanceof SrnError ? cause.message : String(cause)}`,
      })
      return
    }

    const target = catalog.entities.get(srn)
    if (!target) {
      notes.push({
        code: 'HOST_UNRESOLVED',
        severity: 'dropped',
        path,
        message: `resolves to ${srn}, which is not in this catalog`,
      })
      return
    }
    if (target.kind !== 'component' && target.kind !== 'product') {
      notes.push({
        code: 'HOST_NOT_DEPLOYABLE',
        severity: 'dropped',
        path,
        message: `resolves to ${srn}, whose kind is "${target.kind}" — C4 deploys software systems and containers`,
      })
      return
    }

    const system = target.kind === 'product' ? target : productOf(catalog, target)
    if (!system) {
      notes.push({
        code: 'HOST_NOT_DEPLOYABLE',
        severity: 'dropped',
        path,
        message: `${srn} has no product ancestor, so there is no software system to hold its container`,
      })
      return
    }

    // C4 has containers inside software systems and no container inside a
    // container, so a component nested under another component becomes a
    // *sibling* of its own parent. This is criterion (d)'s cost restated in the
    // export direction: the containment survives only as a property.
    if (target.kind === 'component' && target.parent !== null && target.parent !== system.srn) {
      notes.push({
        code: 'COMPONENT_FLATTENED',
        severity: 'lossy',
        path,
        message: `${srn} is nested under ${target.parent}; C4 has no container inside a container, so it becomes a sibling container of ${system.srn}`,
      })
    }

    const regions = host.regions ?? null
    if (regions !== null && regions.length > 1 && host.replicas) {
      notes.push({
        code: 'RANGE_SPLIT_ACROSS_REGIONS',
        severity: 'lossy',
        path: `hosts[${index}].replicas`,
        message:
          `one range (${instancesLiteral(host.replicas)}) is stated for ${regions.length} regions; ` +
          'a Structurizr node states instances per node, so the range is repeated and its total becomes ambiguous',
      })
    }

    placements.push({ host, index, target, system, regions })
  })

  return placements
}

/* ------------------------------------------------------------------ writer */

function write(
  catalog: Catalog,
  environment: Entity,
  dialect: string | null,
  topology: Topology,
  placements: Placement[],
  notes: ExportNote[],
  stats: ExportStats,
): string {
  const solution = catalog.entities.get(`srn://${environment.parsed.solution}`) ?? null
  const environmentName = environment.frontmatter.title
  const dsl = new Dsl()

  // C4 names are unique within a scope — software systems across the model,
  // containers within their software system — so a title collision has to be
  // resolved here rather than by whoever loads the workspace. The scopes are
  // kept apart on purpose: a container titled like its own product is legal.
  const names = new Map<string, string>()
  const takenByScope = new Map<string, Set<string>>()
  const elementName = (system: Entity, entity: Entity): string => {
    const cached = names.get(entity.srn)
    if (cached) return cached
    const scope = entity.kind === 'product' ? 'model' : system.srn
    const taken = takenByScope.get(scope) ?? new Set<string>()
    takenByScope.set(scope, taken)
    let name = entity.frontmatter.title
    if (taken.has(name)) {
      name = `${entity.frontmatter.title} (${entity.parsed.name})`
      notes.push({
        code: 'NAME_DISAMBIGUATED',
        severity: 'info',
        path: '',
        message: `"${entity.frontmatter.title}" is already taken in ${scope}; ${entity.srn} is exported as "${name}"`,
      })
    }
    taken.add(name)
    names.set(entity.srn, name)
    return name
  }

  dsl.line(`# Derived from ${environment.srn} — ${TOPOLOGY_ARTIFACT} is the source of truth.`)
  dsl.line('# Generated by the metaframework portal; edits here are overwritten.')
  dsl.line(`# See srn://metaframework/adr/0016-topology-format-deferred.`)
  dsl.block(`workspace ${quote(solution?.frontmatter.title ?? environment.parsed.solution)} ${quote(solution?.frontmatter.summary ?? '')}`, () => {
    dsl.line()
    dsl.block('model', () => {
      writeStaticModel(dsl, placements, elementName)
      dsl.line()
      writeDeployment(dsl, environmentName, topology, placements, elementName, notes, stats)
    })
    dsl.line()
    dsl.block('views', () => {
      dsl.block(
        `deployment * ${quote(environmentName)} ${quote(identifierFor(environment.srn))} ` +
          `${quote(`Derived from ${environment.relDir}/${TOPOLOGY_ARTIFACT}`)}`,
        () => {
          dsl.line('include *')
          dsl.line('autoLayout lr')
        },
      )
    })
    dsl.line()
    dsl.properties([
      ...prop('metaframework.srn', environment.srn),
      ...prop('metaframework.kind', 'environment'),
      ...prop('metaframework.environment-type', text(environment.frontmatter['environment-type'])),
      ...prop('metaframework.artifact', `${environment.relDir}/${TOPOLOGY_ARTIFACT}`),
      ...prop('metaframework.topology.dialect', dialect),
    ])
  })

  return dsl.toString()
}

function writeStaticModel(
  dsl: Dsl,
  placements: Placement[],
  elementName: (system: Entity, entity: Entity) => string,
): void {
  // First-appearance order, so the output is a stable function of the file.
  const systems: Entity[] = []
  const containers = new Map<string, Entity[]>()
  for (const placement of placements) {
    if (!containers.has(placement.system.srn)) {
      systems.push(placement.system)
      containers.set(placement.system.srn, [])
    }
    if (placement.target.kind !== 'component') continue
    const under = containers.get(placement.system.srn) as Entity[]
    if (!under.some((entity) => entity.srn === placement.target.srn)) under.push(placement.target)
  }

  systems.forEach((system, index) => {
    if (index > 0) dsl.line()
    const under = containers.get(system.srn) ?? []
    const open =
      `${identifierFor(system.srn)} = softwareSystem ${quote(elementName(system, system))} ` +
      `${quote(system.frontmatter.summary)} ${quote('metaframework:product')}`
    dsl.block(open, () => {
      dsl.properties([
        ['metaframework.srn', system.srn],
        ['metaframework.kind', 'product'],
      ])
      for (const container of under) {
        const technology = text(container.frontmatter['component-type']) ?? 'component'
        dsl.block(
          `${identifierFor(container.srn)} = container ${quote(elementName(system, container))} ` +
            `${quote(container.frontmatter.summary)} ${quote(technology)} ${quote('metaframework:component')}`,
          () => {
            dsl.properties([
              ['metaframework.srn', container.srn],
              ['metaframework.kind', 'component'],
              // The containment C4 cannot hold. Equal to the software system's
              // SRN for a top-level component, and to another container's for a
              // nested one — which is the whole difference COMPONENT_FLATTENED
              // reports.
              ['metaframework.parent', container.parent ?? system.srn],
            ])
          },
        )
      }
    })
  })
}

function writeDeployment(
  dsl: Dsl,
  environmentName: string,
  topology: Topology,
  placements: Placement[],
  elementName: (system: Entity, entity: Entity) => string,
  notes: ExportNote[],
  stats: ExportStats,
): void {
  const declared = new Set(topology.regions.map((region) => region.name))
  const unplaced = placements.filter(
    (placement) => placement.regions === null || placement.regions.length === 0,
  )
  stats.hostsExported = countExported(placements, declared)

  dsl.block(`deploymentEnvironment ${quote(environmentName)}`, () => {
    topology.regions.forEach((region, index) => {
      if (index > 0) dsl.line()
      stats.regions += 1
      writeRegion(dsl, region, index, placements, elementName, notes, stats)
    })

    if (unplaced.length === 0) return
    if (topology.regions.length > 0) dsl.line()

    // A place has to be invented, because a `containerInstance` may only sit
    // inside a `deploymentNode`. That is the export putting a name on something
    // the source deliberately leaves unnamed — "a developer machine is a single
    // unnamed place" — so it is reported rather than passed off as a mapping.
    const synthetic = topology.regions.length > 0 ? 'Placement not recorded' : environmentName
    notes.push({
      code: 'SYNTHETIC_PLACE',
      severity: 'lossy',
      path: unplaced.length === topology.hosts.length ? '' : unplaced.map((p) => `hosts[${p.index}]`).join(', '),
      message:
        `${unplaced.length} host ${unplaced.length === 1 ? 'entry declares' : 'entries declare'} no region, ` +
        `and a container instance must sit inside a deployment node — a node named "${synthetic}" is invented to hold ${unplaced.length === 1 ? 'it' : 'them'}`,
    })

    dsl.block(
      `deploymentNode ${quote(synthetic)} ` +
        `${quote(topology.regions.length > 0 ? 'The entry records no region.' : 'This environment declares no regions.')} ` +
        `${quote('Unnamed place')} ${quote('metaframework:synthetic')}`,
      () => {
        unplaced.forEach((placement, index) => {
          if (index > 0) dsl.line()
          writeHost(dsl, placement, null, elementName, stats)
        })
      },
    )
  })

  // A region named by a host but absent from `regions` is E_ENV_REGION_UNKNOWN
  // and never reaches here in a clean catalog; the guard keeps the writer total.
  for (const placement of placements) {
    for (const name of placement.regions ?? []) {
      if (declared.has(name)) continue
      notes.push({
        code: 'REGION_UNDECLARED',
        severity: 'dropped',
        path: `hosts[${placement.index}].regions`,
        message: `region "${name}" is not declared in this file, so there is no node to place the instance in`,
      })
    }
  }
}

/**
 * Host entries that actually reached the output.
 *
 * Counted from what the writer emitted rather than from what resolved, because
 * an entry can resolve cleanly and still be dropped — a host naming a region the
 * file never declared has nowhere to go, and reporting it as exported would make
 * the one number a reader checks the one number that lies.
 */
function countExported(placements: Placement[], declared: Set<string>): number {
  const reached = new Set<number>()
  for (const placement of placements) {
    const regions = placement.regions ?? []
    if (regions.length === 0 || regions.some((name) => declared.has(name))) reached.add(placement.index)
  }
  return reached.size
}

function writeRegion(
  dsl: Dsl,
  region: Region,
  regionIndex: number,
  placements: Placement[],
  elementName: (system: Entity, entity: Entity) => string,
  notes: ExportNote[],
  stats: ExportStats,
): void {
  const here = placements.filter((placement) => (placement.regions ?? []).includes(region.name))
  const zones = region.zones

  if (zones !== undefined && zones.length === 0) {
    notes.push({
      code: 'ZONES_DECLARED_EMPTY',
      severity: 'lossy',
      path: `regions[${regionIndex}].zones`,
      message:
        'an empty zones list and an absent one are different claims in this format and produce the same C4 node; ' +
        'the difference survives only in the metaframework.zones.declared property',
    })
  }

  dsl.block(
    `deploymentNode ${quote(region.name)} ${quote(region.notes ?? '')} ${quote('Region')} ${quote('metaframework:region')}`,
    () => {
      dsl.properties([
        ...prop('metaframework.region', region.name),
        // The one place the export beats the notation: absent, empty and
        // populated are three different values here and two different shapes
        // in the node tree.
        ...(zones === undefined ? [] : prop('metaframework.zones.declared', String(zones.length))),
        ...extensionKeys(region),
      ])
      for (const zone of zones ?? []) {
        stats.zones += 1
        dsl.line(
          `deploymentNode ${quote(zone)} ${quote('')} ${quote('Availability zone')} ${quote('metaframework:zone')}`,
        )
      }
      for (const placement of here) {
        dsl.line()
        writeHost(dsl, placement, region.name, elementName, stats)
      }
    },
  )
}

function writeHost(
  dsl: Dsl,
  placement: Placement,
  region: string | null,
  elementName: (system: Entity, entity: Entity) => string,
  stats: ExportStats,
): void {
  const { host, target, system } = placement
  const name = elementName(system, target)
  stats.placements += 1

  dsl.block(
    `deploymentNode ${quote(name)} ${quote(host.notes ?? '')} ` +
      `${quote(target.kind === 'product' ? 'Hosted product' : 'Hosted component')} ${quote('metaframework:host')}`,
    () => {
      if (host.replicas) dsl.line(`instances ${quote(instancesLiteral(host.replicas))}`)
      dsl.properties([
        ...prop('metaframework.srn', target.srn),
        ...prop('metaframework.component', host.component),
        ...prop('metaframework.region', region),
        ...prop('metaframework.replicas.min', host.replicas?.min),
        ...prop('metaframework.replicas.max', host.replicas?.max),
        ...prop('metaframework.scaling', host.scaling),
        ...extensionKeys(host),
      ])
      dsl.line(
        target.kind === 'product'
          ? `softwareSystemInstance ${identifierFor(target.srn)}`
          : `containerInstance ${identifierFor(target.srn)}`,
      )
    },
  )
}
