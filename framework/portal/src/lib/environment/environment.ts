import { z } from 'zod'
import type { ConfigContract, ConfigContracts } from '../schema/config-contract'
import { CONFIG_KEY } from '../schema/config-contract'
import { assertArtifactRole } from '../srn/artifacts'
import { SrnError, formatSrn, parseSrn, resolveRef } from '../srn/srn'
import type { Catalog, Diagnostic, Entity } from '../catalog/types'

/**
 * The environment artifacts — framework/spec/kinds/environment.md, `topology.yaml`
 * and `config.yaml` — as an executable copy, plus the join the config contract
 * finally makes possible.
 *
 * Both files were *parsed* by the loader and validated by nothing: seven codes
 * the kind document defines sat in the portal's debt register with the same
 * sentence beside them, "environment artifacts are parsed into artifact.data and
 * never validated". An author following the spec got no complaint for breaking
 * it. This module is that gap, in two layers the kind document itself draws the
 * line between:
 *
 * - **The content model** (ENV4, ENV5, ENV7, ENV8 and the syntactic half of
 *   ENV11) is checkable from the entity alone, so {@link parseTopology} and
 *   {@link parseConfig} are pure functions from raw YAML to a typed model,
 *   collecting spec error classes instead of throwing — the shape `parseJourney`
 *   and `parseWorkflow` already set, and for the same reason: loading is
 *   fail-soft everywhere here, so a `config.yaml` with one bad entry must still
 *   yield the other five.
 * - **The joins** (ENV6, ENV9, ENV10 and ENV12–ENV15) need the resolved catalog,
 *   and the last four need a *second entity's* schema. Those live in
 *   {@link environmentDiagnostics}, which is handed the contracts
 *   `lib/schema/config-contract.ts` read.
 *
 * The `$schema` dialect header (ADR 0015) is admitted at the artifact root and
 * nowhere else. The loader has already stripped it by the time either parser
 * runs, so nothing in the catalog depends on the admission; it is named in the
 * key lists below so a caller holding raw file bytes reads the legacy dialect
 * instead of raising a schema error on the header the spec told the author to
 * write. A host entry and a config entry are not artifact roots and gain nothing.
 */

/* ------------------------------------------------------------------- model */

export interface Region {
  name: string
  zones?: string[]
  notes?: string
}

export interface Host {
  /** SRN reference exactly as authored. */
  component: string
  regions?: string[]
  replicas?: { min: number; max: number }
  scaling?: string
  notes?: string
}

export interface Topology {
  regions: Region[]
  hosts: Host[]
}

export interface ConfigEntry {
  key: string
  /** SRN reference exactly as authored; absent means environment-wide. */
  for?: string
  secret: boolean
  value?: string | number | boolean
  source?: string
  description?: string
}

export interface EnvIssue {
  /** Spec error class, e.g. `E_ENV_CONFIG_SCHEMA`. */
  code: string
  severity: 'error' | 'warning'
  message: string
  /** Positional path inside the document, e.g. `config[3].value`. */
  path: string
}

/* ------------------------------------------------------------------ schema */

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

const oneLine = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !value.includes('\n'), 'must be a single line')

const ref = z.string().min(1).max(240)

const regionSchema = z
  .object({
    name: z.string().regex(KEBAB, 'must be kebab-case').max(64),
    zones: z.array(z.string().min(1).max(32)).optional(),
    notes: z.string().min(1).optional(),
  })
  .catchall(z.unknown())

const hostSchema = z
  .object({
    component: ref,
    regions: z.array(z.string().min(1).max(64)).optional(),
    // `min` ≤ `max` is checked below rather than here so the message names the
    // two numbers; a fixed count is the degenerate range `{ min: n, max: n }`.
    replicas: z
      .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
      .catchall(z.unknown())
      .optional(),
    scaling: oneLine(200).optional(),
    notes: z.string().min(1).optional(),
  })
  .catchall(z.unknown())

const topologySchema = z
  .object({
    regions: z.array(z.unknown()).optional(),
    hosts: z.array(z.unknown()),
  })
  .catchall(z.unknown())

const entrySchema = z
  .object({
    key: z.string().regex(CONFIG_KEY, 'must be SCREAMING_SNAKE_CASE').max(128),
    for: ref.optional(),
    secret: z.boolean().optional(),
    // A key holds one scalar. A list is a delimiter convention the runtime owns,
    // and a contract types it as a string with a pattern.
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    source: z.string().min(1).max(240).optional(),
    description: oneLine(200).optional(),
  })
  .catchall(z.unknown())

const configSchema = z
  .object({
    config: z.array(z.unknown()),
  })
  .catchall(z.unknown())

const TOPOLOGY_FILE_KEYS = ['$schema', 'regions', 'hosts']
const REGION_KEYS = ['name', 'zones', 'notes']
const HOST_KEYS = ['component', 'regions', 'replicas', 'scaling', 'notes']
const REPLICAS_KEYS = ['min', 'max']
const CONFIG_FILE_KEYS = ['$schema', 'config']
const ENTRY_KEYS = ['key', 'for', 'secret', 'value', 'source', 'description']

/** Fixed artifact names, so a caller never spells them twice. */
export const TOPOLOGY_ARTIFACT = 'topology.yaml'
export const CONFIG_ARTIFACT = 'config.yaml'

function zodMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ')
}

/**
 * Unknown non-`x-` keys. The `x-` hatch is the kind document's and it is a hatch
 * for *authors'* keys — `$schema` is admitted by name, at the artifact root only,
 * which is why the caller passes the list rather than this deciding.
 */
function unknownKeys(value: Record<string, unknown>, known: string[]): string[] {
  return Object.keys(value).filter((key) => !known.includes(key) && !key.startsWith('x-'))
}

/* ------------------------------------------------------------ topology.yaml */

export interface ParseTopologyResult {
  /** Null only when the file shape is unusable; otherwise best-effort. */
  topology: Topology | null
  issues: EnvIssue[]
}

export function parseTopology(data: unknown): ParseTopologyResult {
  const issues: EnvIssue[] = []
  const error = (path: string, message: string) =>
    issues.push({ code: 'E_ENV_TOPOLOGY_SCHEMA', severity: 'error', message, path })

  const file = topologySchema.safeParse(data)
  if (!file.success) {
    error('', zodMessage(file.error))
    return { topology: null, issues }
  }

  for (const key of unknownKeys(file.data, TOPOLOGY_FILE_KEYS)) {
    error(key, `unknown top-level key "${key}" (prefix it x- to keep it)`)
  }

  const regions: Region[] = []
  const declared = new Set<string>()
  ;(file.data.regions ?? []).forEach((raw, index) => {
    const path = `regions[${index}]`
    const parsed = regionSchema.safeParse(raw)
    if (!parsed.success) {
      error(path, zodMessage(parsed.error))
      return
    }
    for (const key of unknownKeys(parsed.data, REGION_KEYS)) {
      error(`${path}.${key}`, `unknown key "${key}" (prefix it x- to keep it)`)
    }
    if (declared.has(parsed.data.name)) {
      error(`${path}.name`, `region "${parsed.data.name}" is declared twice`)
    }
    declared.add(parsed.data.name)
    regions.push(parsed.data as Region)
  })

  const hosts: Host[] = []
  file.data.hosts.forEach((raw, index) => {
    const path = `hosts[${index}]`
    const parsed = hostSchema.safeParse(raw)
    if (!parsed.success) {
      error(path, zodMessage(parsed.error))
      return
    }
    for (const key of unknownKeys(parsed.data, HOST_KEYS)) {
      error(`${path}.${key}`, `unknown key "${key}" (prefix it x-${key} to keep it)`)
    }

    const replicas = parsed.data.replicas
    if (replicas) {
      for (const key of unknownKeys(replicas, REPLICAS_KEYS)) {
        error(`${path}.replicas.${key}`, `unknown key "${key}" — a replica range is min and max`)
      }
      if (replicas.min > replicas.max) {
        error(`${path}.replicas`, `min ${replicas.min} exceeds max ${replicas.max} — a range no count can sit in`)
      }
    }

    // ENV7. Absent `regions` means "placement not recorded", never "everywhere",
    // so an empty list and a missing key are different statements and only the
    // named-but-undeclared case is a finding.
    for (const name of parsed.data.regions ?? []) {
      if (declared.has(name)) continue
      issues.push({
        code: 'E_ENV_REGION_UNKNOWN',
        severity: 'error',
        message: `region "${name}" is not declared in this file's regions list`,
        path: `${path}.regions`,
      })
    }

    hosts.push(parsed.data as Host)
  })

  return { topology: { regions, hosts }, issues }
}

/* -------------------------------------------------------------- config.yaml */

export interface ParseConfigResult {
  entries: ConfigEntry[] | null
  issues: EnvIssue[]
}

export function parseConfig(data: unknown): ParseConfigResult {
  const issues: EnvIssue[] = []
  const error = (path: string, message: string) =>
    issues.push({ code: 'E_ENV_CONFIG_SCHEMA', severity: 'error', message, path })

  const file = configSchema.safeParse(data)
  if (!file.success) {
    error('', zodMessage(file.error))
    return { entries: null, issues }
  }

  for (const key of unknownKeys(file.data, CONFIG_FILE_KEYS)) {
    error(key, `unknown top-level key "${key}" (prefix it x- to keep it)`)
  }

  const entries: ConfigEntry[] = []
  const seen = new Map<string, number>()

  file.data.config.forEach((raw, index) => {
    const path = `config[${index}]`
    const parsed = entrySchema.safeParse(raw)
    if (!parsed.success) {
      error(path, zodMessage(parsed.error))
      return
    }
    for (const key of unknownKeys(parsed.data, ENTRY_KEYS)) {
      error(`${path}.${key}`, `unknown key "${key}" (prefix it x-${key} to keep it)`)
    }

    const entry: ConfigEntry = { ...(parsed.data as ConfigEntry), secret: parsed.data.secret === true }

    // Uniqueness is per `(key, for)` pair: the same key legitimately appears
    // once environment-wide and once narrowed to a component. The separator is
    // written as an escape and never as a literal byte: a raw NUL in a source
    // file makes the whole module read as binary — `file` calls it data, and
    // grep matches nothing in it, silently. It cannot occur in either half
    // anyway: `key` has passed CONFIG_KEY by here, so the pair splits at the
    // separator and two different pairs cannot share an identity.
    const identity = `${entry.key}\u0000${entry.for ?? ''}`
    const first = seen.get(identity)
    if (first !== undefined) {
      error(
        `${path}.key`,
        `"${entry.key}"${entry.for ? ` for "${entry.for}"` : ' (environment-wide)'} is already declared at config[${first}]`,
      )
    } else {
      seen.set(identity, index)
    }

    // ENV8, and it is absolute: this file is reviewable in git, so everything in
    // it is public. A `source:` is a locator and never the value.
    if (entry.secret && entry.value !== undefined) {
      issues.push({
        code: 'E_ENV_SECRET_VALUE',
        severity: 'error',
        message: `"${entry.key}" is marked secret and carries a value — a secret value never enters the catalog, at any status`,
        path: `${path}.value`,
      })
    }
    if (entry.secret && entry.source === undefined) {
      error(`${path}.source`, `"${entry.key}" is marked secret and names no source — a secret declares where its value comes from`)
    }

    entries.push(entry)
  })

  return { entries, issues }
}

/* -------------------------------------------------------------------- joins */

/**
 * Every environment rule that needs more than one document.
 *
 * Composed into the catalog by `lib/catalog/index.ts`, after the schema registry
 * exists — not through `artifact-checks.ts` with the other mini-spec parsers,
 * because four of these rules read a *datamodel's* flattened schema and that is
 * exactly what the registry is for. The parser issues above are folded in here
 * too, so one call produces everything an environment can be told about and the
 * two halves cannot disagree about which file they came from.
 */
export function environmentDiagnostics(catalog: Catalog, contracts: ConfigContracts): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'environment') continue
    diagnostics.push(...checkEnvironment(catalog, contracts, entity))
  }

  return diagnostics
}

function checkEnvironment(catalog: Catalog, contracts: ConfigContracts, environment: Entity): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const topology = environment.artifacts.find((artifact) => artifact.file === TOPOLOGY_ARTIFACT)
  const config = environment.artifacts.find((artifact) => artifact.file === CONFIG_ARTIFACT)

  const emit = (file: string, issue: EnvIssue) =>
    diagnostics.push({
      code: issue.code,
      severity: issue.severity,
      message: issue.path ? `${issue.path}: ${issue.message}` : issue.message,
      path: `${environment.relDir}/${file}`,
      srn: environment.srn,
    })

  // A file that would not parse is ENV4's and ENV5's business, not somebody
  // else's: both rules read "`topology.yaml` **parses** and matches the schema
  // above". The loader keeps the parser's message on the artifact and raises
  // nothing, so without this branch a `config.yaml` with a duplicate key was
  // silently skipped by every check in the portal — the strictest possible file
  // and the most broken one produced the same empty report.
  if (topology?.error) {
    emit(TOPOLOGY_ARTIFACT, {
      code: 'E_ENV_TOPOLOGY_SCHEMA',
      severity: 'error',
      message: `does not parse as YAML: ${topology.error}`,
      path: '',
    })
  } else if (topology) {
    const { topology: parsed, issues } = parseTopology(topology.data)
    for (const issue of issues) emit(TOPOLOGY_ARTIFACT, issue)
    for (const issue of hostJoins(catalog, environment, parsed)) emit(TOPOLOGY_ARTIFACT, issue)
  }

  if (config?.error) {
    emit(CONFIG_ARTIFACT, {
      code: 'E_ENV_CONFIG_SCHEMA',
      severity: 'error',
      message: `does not parse as YAML: ${config.error}`,
      path: '',
    })
  } else if (config) {
    const { entries, issues } = parseConfig(config.data)
    for (const issue of issues) emit(CONFIG_ARTIFACT, issue)
    for (const issue of configJoins(catalog, contracts, environment, entries)) emit(CONFIG_ARTIFACT, issue)
  }

  return diagnostics
}

/* ------------------------------------------------------------ resolution */

interface Target {
  srn: string
  entity: Entity | null
}

/**
 * Resolve one artifact reference against the environment, reporting the fence
 * every reference surface in this framework shares.
 *
 * ENV11 in the kind document's own split: a suffix outside the addressed kind's
 * role table fails first as `E_SRN_ARTIFACT` (V5 is static and precedes every
 * surface class), and a legal role on a legal kind survives the role table only
 * to be refused here — a host entry and a `for:` name entities, and an artifact
 * has no kind to be a component or a product.
 */
function resolveTarget(
  environment: Entity,
  catalog: Catalog,
  reference: string,
  path: string,
  issues: EnvIssue[],
): Target | null {
  try {
    const parsed = parseSrn(resolveRef(environment.srn, reference))
    if (parsed.artifact !== null) {
      assertArtifactRole(parsed.kind, parsed.artifact, reference)
      issues.push({
        code: 'E_ENV_TARGET_KIND',
        severity: 'error',
        message: `"${reference}" addresses the "${parsed.artifact}" artifact of an entity — this names an entity, and an artifact has no kind`,
        path,
      })
      return null
    }
    const srn = formatSrn({ ...parsed, version: null })
    return { srn, entity: catalog.entities.get(srn) ?? null }
  } catch (cause) {
    issues.push({
      code: cause instanceof SrnError ? cause.code : 'E_SRN_SYNTAX',
      severity: 'error',
      message: cause instanceof Error ? cause.message : String(cause),
      path,
    })
    return null
  }
}

/** The target as a deployable container, or null with the finding already filed. */
function deployable(target: Target | null, path: string, issues: EnvIssue[]): Entity | null {
  if (!target) return null
  if (!target.entity) {
    issues.push({
      code: 'E_SRN_DANGLING',
      severity: 'error',
      message: `resolves to ${target.srn}, which does not exist`,
      path,
    })
    return null
  }
  if (target.entity.kind !== 'component' && target.entity.kind !== 'product') {
    issues.push({
      code: 'E_ENV_TARGET_KIND',
      severity: 'error',
      message: `resolves to ${target.srn}, whose kind is "${target.entity.kind}" — placement and configuration name a component or a product`,
      path,
    })
    return null
  }
  return target.entity
}

/**
 * Does this container declare the environment?
 *
 * Membership is authored on the component side and this document defines no
 * second channel, so the question is only ever about `uses` edges. A **product**
 * target is the shorthand "every component beneath it, with these settings", so
 * it is satisfied by the product itself or by any component in its subtree —
 * the entry is about whichever of them run here, and demanding the declaration
 * from the product would invent the second channel the kind refuses.
 */
function declaresEnvironment(catalog: Catalog, container: Entity, environmentSrn: string): boolean {
  const declares = (entity: Entity) =>
    entity.relations.some((relation) => relation.edge === 'uses' && relation.target === environmentSrn)

  if (declares(container)) return true
  if (container.kind === 'component') return false
  return subtreeOf(catalog, container).some(declares)
}

/** Every entity strictly beneath `container`, itself excluded. */
function subtreeOf(catalog: Catalog, container: Entity): Entity[] {
  const found: Entity[] = []
  const walk = (srn: string) => {
    const entity = catalog.entities.get(srn)
    if (!entity) return
    found.push(entity)
    for (const child of entity.children) walk(child)
  }
  for (const child of container.children) walk(child)
  return found
}

/** Components in this container's subtree, the container included when it is one. */
function componentsUnder(catalog: Catalog, container: Entity): Entity[] {
  const under = subtreeOf(catalog, container).filter((entity) => entity.kind === 'component')
  return container.kind === 'component' ? [container, ...under] : under
}

/** Is `candidate` this entity, or somewhere above it on the containment chain? */
function covers(catalog: Catalog, candidate: string, srn: string): boolean {
  let cursor: string | null = srn
  while (cursor) {
    if (cursor === candidate) return true
    cursor = catalog.entities.get(cursor)?.parent ?? null
  }
  return false
}

/* -------------------------------------------------------- topology joins */

function hostJoins(catalog: Catalog, environment: Entity, topology: Topology | null): EnvIssue[] {
  if (!topology) return []
  const issues: EnvIssue[] = []

  topology.hosts.forEach((host, index) => {
    const path = `hosts[${index}].component`
    const target = deployable(resolveTarget(environment, catalog, host.component, path, issues), path, issues)
    if (!target) return

    // ENV9. A warning and not an error on the same grounds as
    // W_STRUCT_PROTOCOL_NCA: during a rollout the topology may legitimately lead
    // the component's own declaration by a commit or two.
    if (declaresEnvironment(catalog, target, environment.srn)) return
    issues.push({
      code: 'W_ENV_HOST_UNDECLARED',
      severity: 'warning',
      message: `${target.srn} is placed here but declares no "uses" edge to ${environment.srn} — membership is authored on the component side`,
      path,
    })
  })

  return issues
}

/* ---------------------------------------------------------- config joins */

function configJoins(
  catalog: Catalog,
  contracts: ConfigContracts,
  environment: Entity,
  entries: ConfigEntry[] | null,
): EnvIssue[] {
  if (!entries) return []
  const issues: EnvIssue[] = []

  /**
   * Components that run here, per the only membership channel there is.
   *
   * Each component's **own** `uses` edge, never an ancestor's — "a component
   * declares the environments it is deployed to", and inheriting membership down
   * a subtree would make every component of a deployed product owe this
   * environment its required keys on nobody's say-so. That is deliberately
   * stricter than {@link declaresEnvironment}, which answers a different
   * question: *that* one asks whether a topology or config entry names something
   * that runs here, where a product entry is satisfied by any component beneath
   * it. Both readings are the one that avoids inventing a finding.
   */
  const hosted = [...catalog.entities.values()].filter(
    (entity) =>
      entity.kind === 'component' &&
      entity.relations.some((relation) => relation.edge === 'uses' && relation.target === environment.srn),
  )

  /**
   * Every entry, paired with what its `for:` resolved to.
   *
   * `wide` and a null `target` are deliberately two different facts. An entry
   * with no `for:` is environment-wide and covers every hosted component; an
   * entry whose `for:` did not resolve covers *nothing*, and its finding is
   * already filed. Collapsing the two would let a broken reference silently
   * satisfy ENV14 — the one rule whose whole value is noticing an absence.
   */
  const scoped: Array<{ entry: ConfigEntry; index: number; wide: boolean; target: Entity | null }> = []

  entries.forEach((entry, index) => {
    if (entry.for === undefined) {
      scoped.push({ entry, index, wide: true, target: null })
      return
    }
    const path = `config[${index}].for`
    const target = deployable(resolveTarget(environment, catalog, entry.for, path, issues), path, issues)
    scoped.push({ entry, index, wide: false, target })
    if (!target) return

    // ENV10. Dead configuration: a key scoped to something that does not run
    // here. A warning for the rollout reason ENV9 gives.
    if (!declaresEnvironment(catalog, target, environment.srn)) {
      issues.push({
        code: 'W_ENV_CONFIG_ORPHAN',
        severity: 'warning',
        message: `"${entry.key}" is scoped for ${target.srn}, which declares no "uses" edge to ${environment.srn}`,
        path,
      })
    }
  })

  for (const { entry, index, wide, target } of scoped) {
    if (!wide && !target) continue
    issues.push(...contractJoins(catalog, contracts, hosted, entry, index, target))
  }
  issues.push(...missingKeys(catalog, contracts, hosted, scoped))

  return issues
}

/**
 * Which contracts one entry is checked against.
 *
 * The resolution table in the kind document, verbatim: a `for:` component uses
 * its own contract; a `for:` product uses the contract of each component beneath
 * it; and an entry with no `for:` — which names no target and so has no single
 * contract to consult — is checked against **every hosted contract that declares
 * this key**. That last row is what makes an environment-wide entry checkable at
 * all, and its filter is deliberate in both directions: a key several hosted
 * contracts declare is checked against each of them, and an environment-wide key
 * that no contract declares is not a finding, because a platform key no modelled
 * component reads is the ordinary reason an entry has no `for:`.
 */
function contractsInScope(
  catalog: Catalog,
  contracts: ConfigContracts,
  hosted: Entity[],
  entry: ConfigEntry,
  target: Entity | null,
): ConfigContract[] {
  if (target === null) {
    return hosted
      .map((component) => contracts.get(component.srn))
      .filter((contract): contract is ConfigContract => contract !== undefined)
      .filter((contract) => contract.keys.has(entry.key))
  }
  return componentsUnder(catalog, target)
    .map((component) => contracts.get(component.srn))
    .filter((contract): contract is ConfigContract => contract !== undefined)
}

function contractJoins(
  catalog: Catalog,
  contracts: ConfigContracts,
  hosted: Entity[],
  entry: ConfigEntry,
  index: number,
  target: Entity | null,
): EnvIssue[] {
  const inScope = contractsInScope(catalog, contracts, hosted, entry, target)
  if (inScope.length === 0) return []
  const issues: EnvIssue[] = []

  // ENV15, `for:`-scoped only. An environment-wide entry is filtered to the
  // contracts that declare the key, so it can never reach this branch — which is
  // the point: a platform key is not a finding.
  const declaring = inScope.filter((contract) => contract.keys.has(entry.key))
  if (target !== null && declaring.length === 0) {
    issues.push({
      code: 'W_ENV_CONFIG_UNDECLARED',
      severity: 'warning',
      message:
        `"${entry.key}" is not a property of ${inScope.length === 1 ? inScope[0].srn : `any config contract under ${target.srn}`}` +
        ' — usually a key renamed or dropped in the component and left behind here',
      path: `config[${index}].key`,
    })
  }

  for (const contract of declaring) {
    // ENV13, both directions and both errors: one of the two files is wrong
    // *now*, and the cost of assuming the more relaxed reading is a credential
    // in a public repository.
    const writeOnly = contract.secret.has(entry.key)
    if (entry.secret !== writeOnly) {
      issues.push({
        code: 'E_ENV_SECRET_MISMATCH',
        severity: 'error',
        message: writeOnly
          ? `"${entry.key}" is writeOnly in ${contract.srn} and this entry does not say secret — omitting it is exactly how a credential slips past ENV8`
          : `"${entry.key}" is marked secret here and is not writeOnly in ${contract.srn} — hiding a non-secret in a vault is an outage nobody can debug`,
        path: `config[${index}].secret`,
      })
    }

    // ENV12. An error rather than a warning because it has no benign transient
    // reading: there is no commit order under which `verbose` becomes a legal
    // log level.
    if (entry.value === undefined) continue
    const reason = contract.accepts(entry.key, entry.value)
    if (reason === null) continue
    issues.push({
      code: 'E_ENV_CONFIG_VALUE',
      severity: 'error',
      message: `${JSON.stringify(entry.value)} fails "${entry.key}" in ${contract.srn}: ${reason}`,
      path: `config[${index}].value`,
    })
  }

  return issues
}

/**
 * ENV14 — provides ⊇ requires, the check this kind has been missing since v1 and
 * the reason the contract exists.
 *
 * For every component hosted here, take its contract's must-provide set —
 * `required` minus every key carrying a `default` — and require an entry whose
 * scope covers that component: `for:` naming it, `for:` naming a container above
 * it, or no `for:` at all. **A declaration with no value counts as provided**,
 * which is the whole shape of the three-layer secret rule: the value arrives at
 * deploy time and the catalog's job was to say the key is expected.
 *
 * The finding is an absence, so it has no line to sit on — it is pathed at the
 * file and names the component, which is what somebody needs in order to fix it.
 */
function missingKeys(
  catalog: Catalog,
  contracts: ConfigContracts,
  hosted: Entity[],
  scoped: Array<{ entry: ConfigEntry; wide: boolean; target: Entity | null }>,
): EnvIssue[] {
  const issues: EnvIssue[] = []

  for (const component of hosted) {
    const contract = contracts.get(component.srn)
    if (!contract) continue

    const provided = new Set(
      scoped
        .filter(({ wide, target }) => wide || (target !== null && covers(catalog, target.srn, component.srn)))
        .map(({ entry }) => entry.key),
    )

    const missing = [...contract.mustProvide].filter((key) => !provided.has(key)).sort()
    if (missing.length === 0) continue
    issues.push({
      code: 'W_ENV_CONFIG_MISSING',
      severity: 'warning',
      message:
        `${component.srn} requires ${missing.map((key) => `"${key}"`).join(', ')} with no default (${contract.srn}), ` +
        'and no entry here declares the key for it — a process that will not start',
      path: '',
    })
  }

  return issues
}
