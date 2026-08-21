import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'
import {
  EDGE_SOURCE_KINDS,
  EDGE_TARGET_KINDS,
  type EdgeType,
  type EntityKind,
  KIND_FRONTMATTER,
  commonFrontmatterSchema,
  kindDiagnostics,
  unknownFields,
} from './frontmatter'
import type { Artifact, Catalog, Diagnostic, Entity, Relation } from './types'
import { SrnError, type Srn, formatSrn, parentSrn, parseSrn, resolveRef } from '../srn/srn'

const ENTITY_DOCUMENT = 'index.md'
const ARTIFACT_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.md'])

/** Kinds that may contain child entity directories (structure.md). */
const CONTAINER_KINDS = new Set<EntityKind>(['solution', 'product', 'component'])


export interface LoadOptions {
  /** Absolute path to the directory holding solution roots. */
  catalogDir: string
}

/**
 * Walk the catalog and build the entity graph.
 *
 * Loading is fail-soft: violations are collected as diagnostics rather than
 * thrown, so the portal can render a broken catalog *and show why* instead of
 * failing to a blank page. Callers that need strictness (CI) fail on any
 * diagnostic of severity `error`.
 */
export async function loadCatalog({ catalogDir }: LoadOptions): Promise<Catalog> {
  const diagnostics: Diagnostic[] = []
  const entities = new Map<string, Entity>()
  const solutions: string[] = []

  const solutionDirs = await listDirectories(catalogDir)
  for (const solutionName of solutionDirs) {
    const srn = `srn://${solutionName}`
    solutions.push(srn)
    await walk(path.join(catalogDir, solutionName), catalogDir, entities, diagnostics)
  }

  linkHierarchy(entities, diagnostics)
  const inbound = resolveRelations(entities, diagnostics)
  checkGraphShape(entities, inbound, diagnostics)

  return { entities, solutions, diagnostics, inbound }
}

async function listDirectories(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort()
}

/**
 * Recursive descent. A directory is an entity iff it holds an index.md
 * (structure.md); anything else is either a kind bucket or an asset directory.
 */
async function walk(
  dir: string,
  catalogDir: string,
  entities: Map<string, Entity>,
  diagnostics: Diagnostic[],
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const isEntity = entries.some((entry) => entry.isFile() && entry.name === ENTITY_DOCUMENT)

  let entity: Entity | null = null
  if (isEntity) {
    entity = await readEntity(dir, catalogDir, entities, diagnostics)
  }

  for (const child of entries.filter((entry) => entry.isDirectory())) {
    if (child.name.startsWith('.') || child.name.startsWith('_')) continue
    const childDir = path.join(dir, child.name)
    const childIsEntity = await hasEntityDocument(childDir)

    if (childIsEntity && entity && !CONTAINER_KINDS.has(entity.kind)) {
      diagnostics.push({
        code: 'E_STRUCT_NESTED_ENTITY',
        severity: 'error',
        message: `entity nested inside a non-container ${entity.kind} entity`,
        path: path.relative(catalogDir, childDir),
        srn: entity.srn,
      })
    }
    await walk(childDir, catalogDir, entities, diagnostics)
  }
}

async function hasEntityDocument(dir: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.some((entry) => entry.isFile() && entry.name === ENTITY_DOCUMENT)
}

async function readEntity(
  dir: string,
  catalogDir: string,
  entities: Map<string, Entity>,
  diagnostics: Diagnostic[],
): Promise<Entity | null> {
  const relDir = path.relative(catalogDir, dir)
  const docPath = path.join(relDir, ENTITY_DOCUMENT)

  let parsed: Srn
  try {
    parsed = parseSrn(`srn://${relDir.split(path.sep).join('/')}`)
  } catch (error) {
    diagnostics.push({
      code: error instanceof SrnError ? error.code : 'E_SRN_SYNTAX',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      path: relDir,
    })
    return null
  }

  const srn = formatSrn({ ...parsed, version: null })
  const raw = await readFile(path.join(dir, ENTITY_DOCUMENT), 'utf8')
  const { data, content } = matter(raw)

  const result = commonFrontmatterSchema.safeParse(data)
  if (!result.success) {
    for (const issue of result.error.issues) {
      diagnostics.push({
        code: 'E_FM_SCHEMA',
        severity: 'error',
        message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
        path: docPath,
        srn,
      })
    }
    return null
  }
  const frontmatter = result.data
  const expectedKind = kindFromPosition(parsed)

  // Kind-specific fields are layered on top of the common contract; validating
  // against the kind implied by disk position (not the declared one) keeps a
  // mislabelled entity from silently skipping its own rules.
  const kindResult = KIND_FRONTMATTER[expectedKind].safeParse(data)
  if (!kindResult.success) {
    for (const issue of kindResult.error.issues) {
      diagnostics.push({
        code: 'E_FM_SCHEMA',
        severity: 'error',
        message: `${issue.path.join('.') || `(${expectedKind})`}: ${issue.message}`,
        path: docPath,
        srn,
      })
    }
  }

  // Kind rules the schema cannot express, because the spec gives them codes of
  // their own — a metric's target and window literals are the v1 cases.
  for (const issue of kindDiagnostics(expectedKind, data as Record<string, unknown>)) {
    diagnostics.push({
      code: issue.code,
      severity: 'error',
      message: issue.message,
      path: docPath,
      srn,
    })
  }

  for (const field of unknownFields(data as Record<string, unknown>, expectedKind)) {
    diagnostics.push({
      code: 'E_FM_UNKNOWN_FIELD',
      severity: 'error',
      message: `unknown top-level field "${field}" (prefix with x- to keep it local)`,
      path: docPath,
      srn,
    })
  }

  const dirName = path.basename(dir)
  if (frontmatter.name !== dirName) {
    diagnostics.push({
      code: 'E_FM_NAME_MISMATCH',
      severity: 'error',
      message: `frontmatter name "${frontmatter.name}" ≠ directory name "${dirName}"`,
      path: docPath,
      srn,
    })
  }

  if (frontmatter.kind !== expectedKind) {
    diagnostics.push({
      code: 'E_FM_KIND_LOCATION',
      severity: 'error',
      message: `kind "${frontmatter.kind}" contradicts disk position (expected "${expectedKind}")`,
      path: docPath,
      srn,
    })
  }

  // Kind placement (actors and environments at solution level, products directly
  // under the solution, components only inside containers) is enforced by the
  // SRN grammar itself now that every path segment is bucketed — a misplaced
  // entity fails to parse above and never reaches this point.

  if (hasLevelOneHeading(content)) {
    diagnostics.push({
      code: 'E_STRUCT_BODY_H1',
      severity: 'error',
      message: 'body carries a level-1 heading — the page renders `title` as the h1; start sections at "##"',
      path: docPath,
      srn,
    })
  }

  if (entities.has(srn)) {
    diagnostics.push({
      code: 'E_STRUCT_DUPLICATE_SRN',
      severity: 'error',
      message: `duplicate SRN — already defined at ${entities.get(srn)?.relDir}`,
      path: relDir,
      srn,
    })
    return null
  }

  const entity: Entity = {
    srn,
    parsed,
    kind: expectedKind,
    relDir,
    dir,
    frontmatter,
    body: content.trim(),
    artifacts: await readArtifacts(dir),
    relations: collectRelations(frontmatter, srn, diagnostics, docPath),
    parent: null,
    children: [],
  }
  entities.set(srn, entity)
  return entity
}

/**
 * Does the prose carry a heading at level 1?
 *
 * The entity page already renders frontmatter `title` as the document's h1, so
 * a `#` anywhere in the body makes a second one: an outline that no screen
 * reader and no outline-consuming tool can read as a tree. Until this check
 * existed every shipped entity opened with `# <title>` — the same string the
 * header had just printed — so the rule costs authors a heading they were
 * duplicating anyway (framework/spec/structure.md, "The document body").
 *
 * Fenced blocks are skipped, because `# solutions/acme/…` inside a fence is a
 * path comment and the spec's examples are full of them. The fence state is a
 * simple toggle on ``` / ~~~, which is exact for well-formed markdown; a
 * document with an unclosed fence has a bigger problem than this diagnostic.
 */
function hasLevelOneHeading(body: string): boolean {
  const lines = body.split('\n')
  let fenced = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    if (/^\s{0,3}#\s/.test(line)) return true
    // Setext: a run of "=" underlining a PARAGRAPH line is an h1 too, and it is
    // the one spelling a `#`-only check would let through. Only a paragraph —
    // the same run under a list item, a table row or a quote is not a heading.
    const previous = index > 0 ? lines[index - 1] : ''
    if (/^\s{0,3}=+\s*$/.test(line) && /^\s{0,3}[^\s#>|*+\-=]/.test(previous)) return true
  }

  return false
}

/**
 * Kind implied by position on disk. With fully bucketed paths this is no longer
 * an inference from depth — every entity states its kind in the path itself,
 * and only the solution root has no bucket.
 */
function kindFromPosition(srn: Srn): EntityKind {
  return srn.kind ?? 'solution'
}

async function readArtifacts(dir: string, prefix = ''): Promise<Artifact[]> {
  const entries = await readdir(path.join(dir, prefix), { withFileTypes: true }).catch(() => [])
  const artifacts: Artifact[] = []

  for (const entry of entries) {
    const relFile = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      // Asset subdirectories hold artifacts; entity directories are walked
      // separately and must not be swallowed as artifacts.
      if (await hasEntityDocument(path.join(dir, relFile))) continue
      artifacts.push(...(await readArtifacts(dir, relFile)))
      continue
    }
    if (entry.name === ENTITY_DOCUMENT) continue

    const extension = path.extname(entry.name)
    if (!ARTIFACT_EXTENSIONS.has(extension)) continue

    const raw = await readFile(path.join(dir, relFile), 'utf8')
    const { data, error } = parseArtifact(extension, raw)
    artifacts.push({
      file: relFile,
      extension: extension as Artifact['extension'],
      data,
      raw,
      ...(error ? { error } : {}),
    })
  }
  return artifacts.sort((a, b) => a.file.localeCompare(b.file))
}

/**
 * Parsing is fail-soft like everything else in the loader, but the reason is
 * kept rather than swallowed: "this file is not valid YAML" is only actionable
 * with the parser's own message and the position it points at.
 */
function parseArtifact(extension: string, raw: string): { data: unknown; error?: string } {
  try {
    if (extension === '.json') return { data: JSON.parse(raw) }
    if (extension === '.yaml' || extension === '.yml') return { data: parseYaml(raw) }
  } catch (cause) {
    return { data: null, error: cause instanceof Error ? cause.message : String(cause) }
  }
  return { data: null }
}

function collectRelations(
  frontmatter: { relations?: Partial<Record<EdgeType, string[]>>; kind: EntityKind },
  srn: string,
  diagnostics: Diagnostic[],
  docPath: string,
): Relation[] {
  const relations: Relation[] = []
  for (const [edge, refs] of Object.entries(frontmatter.relations ?? {}) as Array<[EdgeType, string[]]>) {
    const allowedSources = EDGE_SOURCE_KINDS[edge]
    if (allowedSources !== 'any' && !allowedSources.includes(frontmatter.kind)) {
      diagnostics.push({
        code: 'E_FM_EDGE_SOURCE',
        severity: 'error',
        message: `a ${frontmatter.kind} may not author the "${edge}" edge`,
        path: docPath,
        srn,
      })
      continue
    }

    for (const ref of refs) {
      let target: string | null = null
      let version: number | null = null
      try {
        const resolved = resolveRef(srn, ref)
        const parsedTarget = parseSrn(resolved)
        version = parsedTarget.version
        target = formatSrn({ ...parsedTarget, version: null })
      } catch (error) {
        diagnostics.push({
          code: error instanceof SrnError ? error.code : 'E_SRN_SYNTAX',
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
          path: docPath,
          srn,
        })
      }
      relations.push({ edge, ref, target, version })
    }
  }
  return relations
}

/** Attach each entity to its nearest ancestor entity. */
function linkHierarchy(entities: Map<string, Entity>, diagnostics: Diagnostic[]): void {
  for (const entity of entities.values()) {
    const parentSrn = parentOf(entity)
    if (!parentSrn) continue
    const parent = entities.get(parentSrn)
    if (!parent) {
      diagnostics.push({
        code: 'E_STRUCT_MISSING_INDEX',
        severity: 'error',
        message: `parent entity ${parentSrn} has no ${ENTITY_DOCUMENT}`,
        path: entity.relDir,
        srn: entity.srn,
      })
      continue
    }
    entity.parent = parentSrn
    parent.children.push(entity.srn)
  }

  for (const entity of entities.values()) {
    entity.children.sort()
  }
}

function parentOf(entity: Entity): string | null {
  // Bucketed paths make ownership positional: drop the trailing {kind}/{name}
  // pair and what remains addresses the owner.
  return parentSrn(entity.parsed)
}

/**
 * Verify every relation target exists and is a legal kind for its edge, then
 * derive the inverse index the portal renders as "used by", "implemented by", …
 */
function resolveRelations(
  entities: Map<string, Entity>,
  diagnostics: Diagnostic[],
): Map<string, Array<{ edge: EdgeType; from: string }>> {
  const inbound = new Map<string, Array<{ edge: EdgeType; from: string }>>()

  for (const entity of entities.values()) {
    for (const relation of entity.relations) {
      if (!relation.target) continue

      const target = entities.get(relation.target)
      if (!target) {
        diagnostics.push({
          code: 'E_SRN_DANGLING',
          severity: 'error',
          message: `"${relation.ref}" resolves to ${relation.target}, which does not exist`,
          path: path.join(entity.relDir, ENTITY_DOCUMENT),
          srn: entity.srn,
        })
        continue
      }

      const allowed = EDGE_TARGET_KINDS[relation.edge]
      const legal = allowed === 'same-as-source' ? target.kind === entity.kind : allowed.includes(target.kind)
      if (!legal) {
        diagnostics.push({
          code: 'E_FM_EDGE_TARGET',
          severity: 'error',
          message: `"${relation.edge}" may not target a ${target.kind} (${relation.target})`,
          path: path.join(entity.relDir, ENTITY_DOCUMENT),
          srn: entity.srn,
        })
        continue
      }

      if (relation.version !== null && relation.version !== target.frontmatter.version) {
        // NOT `E_SRN_VERSION`. V8 (srn.md) fails a pin that exists "neither on
        // the filesystem nor in the version→commit index" — a reference to
        // nothing, which is an error. This pin resolves: historic versions live
        // in git, and evolution.md's worked example has `order@1` legitimately
        // reading the v1 snapshot while the entity is at v3. Emitting the error
        // code here for a legal pin put code, severity and the /diagnostics
        // heading in three-way disagreement, and it is the loader that was
        // wrong: only `lib/history/git.ts`, which can actually ask git whether a
        // commit exists, is in a position to raise V8 — and it does.
        //
        // What is true here is narrower and worth saying on its own: the pin has
        // fallen behind. Either a deliberate freeze or a forgotten migration,
        // and only the author knows which, so it is a warning
        // (decision-record amendment 2026-08-20-e).
        diagnostics.push({
          code: 'W_REF_STALE_PIN',
          severity: 'warning',
          message: `"${relation.ref}" pins v${relation.version} but current is v${target.frontmatter.version} — the pin still resolves, from git`,
          path: path.join(entity.relDir, ENTITY_DOCUMENT),
          srn: entity.srn,
        })
      }

      if (target.frontmatter.status === 'deprecated') {
        diagnostics.push({
          code: 'W_REF_DEPRECATED',
          severity: 'warning',
          message: `references deprecated entity ${relation.target}`,
          path: path.join(entity.relDir, ENTITY_DOCUMENT),
          srn: entity.srn,
        })
      }

      const list = inbound.get(relation.target) ?? []
      list.push({ edge: relation.edge, from: entity.srn })
      inbound.set(relation.target, list)
    }
  }
  return inbound
}

/**
 * Checks that need the whole resolved graph rather than one document.
 *
 * Codes and severities are the kind documents': kinds/capability.md,
 * kinds/journey.md and kinds/metric.md. The severity split there is consistent
 * and worth reading as one rule — a violation is an *error* when the entity is
 * meaningless without the fix (a metric with no subject is a figure, not an
 * observation) and a *warning* when it is a true statement about a system still
 * being built (a capability nothing realizes yet) or a judgement call about who
 * owns a number.
 */
function checkGraphShape(
  entities: Map<string, Entity>,
  inbound: Map<string, Array<{ edge: EdgeType; from: string }>>,
  diagnostics: Diagnostic[],
): void {
  for (const entity of entities.values()) {
    const docPath = path.join(entity.relDir, ENTITY_DOCUMENT)
    const at = (code: string, severity: Diagnostic['severity'], message: string) =>
      diagnostics.push({ code, severity, message, path: docPath, srn: entity.srn })

    if (entity.kind === 'capability') {
      // The gap between capabilities described and capabilities realized is the
      // roadmap; on an `approved` capability it is the number a solution
      // dashboard leads with.
      if (!(inbound.get(entity.srn) ?? []).some((edge) => edge.edge === 'realizes')) {
        at('W_CAP_UNREALIZED', 'warning', 'no product or component realizes this capability')
      }
      // Realization is stated once, by the realizer. A capability reaching down
      // to a component says the same thing in the direction that drifts.
      for (const relation of entity.relations) {
        if (relation.edge !== 'uses' || !relation.target) continue
        if (entities.get(relation.target)?.kind !== 'component') continue
        at(
          'W_CAP_REALIZATION_EDGE',
          'warning',
          `"uses" toward component ${relation.target} — realization is the component's "realizes" edge`,
        )
      }
    }

    if (entity.kind === 'journey') {
      // The protagonist is a frontmatter reference rather than a relation, so
      // nothing above resolved it; a journey without a named actor is a list of
      // touches.
      const ref = (entity.frontmatter as { actor?: unknown }).actor
      if (typeof ref === 'string') {
        let target: string | null = null
        try {
          target = formatSrn({ ...parseSrn(resolveRef(entity.srn, ref)), version: null })
        } catch (error) {
          at(
            error instanceof SrnError ? error.code : 'E_SRN_SYNTAX',
            'error',
            error instanceof Error ? error.message : String(error),
          )
        }
        const actor = target ? entities.get(target) : null
        if (target && !actor) {
          at('E_SRN_DANGLING', 'error', `actor "${ref}" resolves to ${target}, which does not exist`)
        } else if (actor && actor.kind !== 'actor') {
          at('E_JRN_ACTOR_KIND', 'error', `actor "${ref}" resolves to a ${actor.kind}, not an actor`)
        }
      }
    }

    if (entity.kind === 'metric') {
      const subjects = entity.relations.filter((relation) => relation.edge === 'measures')
      if (subjects.length === 0) {
        // The one required edge in the ontology. A number with no subject is not
        // an observation, and the kind's whole derived value is reading the edge
        // backwards, from the thing measured to the numbers that measure it.
        at('E_MET_NO_SUBJECT', 'error', 'a metric with no "measures" edge is a figure, not an observation')
      }

      for (const relation of subjects) {
        const subject = relation.target ? entities.get(relation.target) : null
        if (!subject) continue
        // Placement says whose number this is; `measures` says what it is about.
        // They only have to agree where the subject sits in the containment tree
        // at all — a capability is solution-level and owned by nobody, so it
        // constrains nothing.
        const subjectOwner = subject.kind === 'component' ? subject.srn : subject.parent
        if (subject.kind === 'capability' || !subjectOwner || !entity.parent) continue
        if (entity.parent === subjectOwner || isAncestor(entities, entity.parent, subjectOwner)) continue
        at(
          'W_MET_SUBJECT_SCOPE',
          'warning',
          `filed under ${entity.parent}, which neither owns nor contains the owner of ${relation.target}`,
        )
      }
    }
  }
}

/** Whether `candidate` sits somewhere above `srn` on the containment chain. */
function isAncestor(entities: Map<string, Entity>, candidate: string, srn: string): boolean {
  let cursor = entities.get(srn)?.parent ?? null
  while (cursor) {
    if (cursor === candidate) return true
    cursor = entities.get(cursor)?.parent ?? null
  }
  return false
}
