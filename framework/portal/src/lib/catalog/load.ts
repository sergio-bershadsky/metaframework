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
  unknownFields,
} from './frontmatter'
import type { Artifact, Catalog, Diagnostic, Entity, Relation } from './types'
import { SrnError, type Srn, formatSrn, parseSrn, resolveRef } from '../srn/srn'

const ENTITY_DOCUMENT = 'index.md'
const ARTIFACT_EXTENSIONS = new Set(['.json', '.yaml', '.yml', '.md'])

/** Kinds that may contain child entity directories (structure.md). */
const CONTAINER_KINDS = new Set<EntityKind>(['solution', 'product', 'component'])

/** Kinds whose bucket may only sit at solution level (structure.md). */
const SOLUTION_ONLY_KINDS = new Set<EntityKind>(['actor', 'environment'])

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

  if (parsed.kind && SOLUTION_ONLY_KINDS.has(parsed.kind) && parsed.containers.length > 0) {
    diagnostics.push({
      code: 'E_STRUCT_KIND_PLACEMENT',
      severity: 'error',
      message: `${parsed.kind} may only live at solution level`,
      path: relDir,
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

/** Kind implied by an entity's position on disk (frontmatter.md). */
function kindFromPosition(srn: Srn): EntityKind {
  if (srn.kind) return srn.kind
  if (srn.containers.length === 0) return 'solution'
  if (srn.containers.length === 1) return 'product'
  return 'component'
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
    artifacts.push({
      file: relFile,
      extension: extension as Artifact['extension'],
      data: parseArtifact(extension, raw),
      raw,
    })
  }
  return artifacts.sort((a, b) => a.file.localeCompare(b.file))
}

function parseArtifact(extension: string, raw: string): unknown {
  try {
    if (extension === '.json') return JSON.parse(raw)
    if (extension === '.yaml' || extension === '.yml') return parseYaml(raw)
  } catch {
    return null
  }
  return null
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
  const { solution, containers, kind } = entity.parsed
  // An owned entity's parent is its bucket's owner; a container's parent is the
  // container above it. Either way: drop the entity-identifying tail.
  const parentContainers = kind ? containers : containers.slice(0, -1)
  if (!kind && containers.length === 0) return null
  return formatSrn({ solution, containers: parentContainers, kind: null, name: null, version: null })
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
        // Historic versions live in git, not on disk; the git index resolves
        // them lazily. Flag the mismatch so a stale pin is visible.
        diagnostics.push({
          code: 'E_SRN_VERSION',
          severity: 'warning',
          message: `"${relation.ref}" pins v${relation.version} but current is v${target.frontmatter.version}`,
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
