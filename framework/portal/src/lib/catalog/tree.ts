import { type EntityKind, STATUSES, type Status } from './frontmatter'
import type { Catalog } from './types'

/**
 * A serialisable projection of the catalog for the client-side tree. Entities
 * carry far more than the sidebar needs; sending the whole graph across the
 * RSC boundary would balloon the payload for every page.
 */
export interface TreeNode {
  srn: string
  name: string
  title: string
  kind: EntityKind
  status: Status
  version: number
  /** Frontmatter owner, or null when the entity declares none. */
  owner: string | null
  children: TreeNode[]
  /** True when the entity itself has diagnostics of severity `error`. */
  hasError: boolean
}

/**
 * Sibling order in the hierarchy, and group order under the Kind lens.
 *
 * Containers first, then the things they own in the order an architect reads
 * them: behaviour (protocol, datamodel), participants (actor, environment),
 * intent (capability, journey), then the paperwork (requirement, metric, adr).
 * `solution` only ever appears at the root of the hierarchy, but the root is a
 * level like any other and the Kind lens buckets it too, so the order is
 * exhaustive over the ontology.
 *
 * The three newest kinds are inserted where they read rather than appended:
 * a capability and a journey belong beside the participants they involve, and a
 * metric belongs beside the requirement it puts a number on. No pair of the
 * original nine changed places.
 */
export const KIND_ORDER: readonly EntityKind[] = [
  'solution',
  'product',
  'component',
  'protocol',
  'datamodel',
  'actor',
  'environment',
  'capability',
  'journey',
  'requirement',
  'metric',
  'adr',
]

export function buildTree(catalog: Catalog): TreeNode[] {
  const errored = new Set(
    catalog.diagnostics.filter((d) => d.severity === 'error' && d.srn).map((d) => d.srn as string),
  )

  function node(srn: string): TreeNode | null {
    const entity = catalog.entities.get(srn)
    if (!entity) return null
    return {
      srn: entity.srn,
      name: entity.frontmatter.name,
      title: entity.frontmatter.title,
      kind: entity.kind,
      status: entity.frontmatter.status,
      version: entity.frontmatter.version,
      owner: entity.frontmatter.owner ?? null,
      hasError: errored.has(entity.srn),
      children: entity.children
        .map(node)
        .filter((child): child is TreeNode => Boolean(child))
        .sort((a, b) => {
          const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
          return byKind !== 0 ? byKind : a.name.localeCompare(b.name)
        }),
    }
  }

  return catalog.solutions.map(node).filter((n): n is TreeNode => Boolean(n))
}

/** SRNs from the root down to `srn`, so the tree can auto-expand to it. */
export function pathToSrn(srn: string): string[] {
  const body = srn.replace('srn://', '')
  const segments = body.split('/')
  const chain: string[] = []
  for (let i = 1; i <= segments.length; i++) {
    chain.push(`srn://${segments.slice(0, i).join('/')}`)
  }
  return chain
}

/* ------------------------------------------------------------------ lenses */

/**
 * How the rail arranges the same scope.
 *
 * Hierarchy is the catalog's own shape — containment, which is what an SRN
 * encodes. The other three do not replace it: they bucket each container's own
 * children, and go on doing so at every level below. Grouping is a per-level
 * TRANSFORM, never a projection — a datamodel six levels down stays six levels
 * down and merely gains a bucket header above it. Flattening the catalog to
 * answer "what data models exist" destroyed the one thing the tree is for.
 */
export const TREE_LENSES = ['hierarchy', 'kind', 'status', 'owner'] as const
export type TreeLens = (typeof TREE_LENSES)[number]
/** Every lens but hierarchy — the ones that actually emit buckets. */
export type GroupLens = Exclude<TreeLens, 'hierarchy'>

export function isTreeLens(value: unknown): value is TreeLens {
  return typeof value === 'string' && (TREE_LENSES as readonly string[]).includes(value)
}

export interface TreeFilters {
  /** Already trimmed and lower-cased by the caller. */
  query: string
  kinds: EntityKind[]
  statuses: Status[]
}

export const NO_FILTERS: TreeFilters = { query: '', kinds: [], statuses: [] }

export function isFiltering(filters: TreeFilters): boolean {
  return filters.query.length > 0 || filters.kinds.length > 0 || filters.statuses.length > 0
}

/**
 * Does this node itself satisfy every active filter?
 *
 * The distinction matters: the hierarchy keeps non-matching ancestors so a hit
 * is never shown without its context, and this predicate is what tells those
 * ancestors apart from real matches — which is the one and only thing the tree
 * expresses through opacity.
 */
export function matchesFilters(node: TreeNode, filters: TreeFilters): boolean {
  const byKind = filters.kinds.length === 0 || filters.kinds.includes(node.kind)
  const byStatus = filters.statuses.length === 0 || filters.statuses.includes(node.status)
  const byText = filters.query.length === 0 || matchesText(node, filters.query)
  return byKind && byStatus && byText
}

/** A row matching on its title rather than its name is still a match. */
export function matchesText(node: TreeNode, query: string): boolean {
  return node.name.toLowerCase().includes(query) || node.title.toLowerCase().includes(query)
}

/**
 * Keep a node when it matches, or when any descendant does. Retaining
 * non-matching ancestors is what lets a match stay findable: a bare list of hits
 * loses the one thing the tree is for, which is where a thing sits.
 */
export function filterTree(nodes: TreeNode[], filters: TreeFilters): TreeNode[] {
  if (!isFiltering(filters)) return nodes

  const walk = (node: TreeNode): TreeNode | null => {
    const children = node.children.map(walk).filter((child): child is TreeNode => child !== null)
    if (!matchesFilters(node, filters) && children.length === 0) return null
    return { ...node, children }
  }

  return nodes.map(walk).filter((node): node is TreeNode => node !== null)
}

/* --------------------------------------------------------- the rail's nodes */

/**
 * What the rail draws, after a lens has been applied.
 *
 * Grouping happens INSIDE each branch, so its output is still a tree — and a
 * tree whose levels alternate between two things the renderer draws very
 * differently: real entities, and virtual buckets. A discriminated union states
 * that, and one recursive component then draws the whole rail.
 *
 * The alternative — a bucket masquerading as a `TreeNode` with a synthetic srn
 * and a borrowed kind — was rejected: it would let a bucket flow into
 * `entityHref`, `matchesFilters` or `kindStyle` and come out looking navigable.
 * "Virtual, not navigable, no kind icon" is a rule the old flat lenses upheld
 * only by having a separate renderer branch nobody was allowed to cross. Here
 * the type upholds it, which is the difference between a convention and a
 * constraint.
 */
export type LensNode = LensEntityNode | LensGroupNode

export interface LensEntityNode {
  type: 'entity'
  node: TreeNode
  /** Already transformed: under a grouping lens these are the entity's buckets. */
  children: LensNode[]
}

/** A virtual, non-navigable bucket. `key` is '' for the no-owner bucket. */
export interface LensGroupNode {
  type: 'group'
  /**
   * The lens that produced this bucket. Carried per node rather than threaded
   * through the renderer, so a bucket is self-describing — and so the type
   * itself rules out a bucket under `hierarchy`, which emits none.
   */
  lens: GroupLens
  key: string
  /**
   * DIRECT members — exactly what expanding this bucket reveals. Deliberately
   * not a subtree total: grandchildren sit in their own buckets one level down,
   * and counting them here would promise rows this bucket does not hold.
   */
  count: number
  children: LensNode[]
}

/**
 * Arrange a level, and every level beneath it, for one lens.
 *
 * `hierarchy` is the identity transform — the same tree, restated in the
 * renderer's vocabulary — so the rail keeps one code path instead of two that
 * would have to be kept in agreement.
 *
 * Buckets come out in the lens's own natural order: the ontology order for
 * kinds, the lifecycle order for statuses, alphabetical for owners with the
 * unowned bucket last, because "nobody owns this" is the leftovers. A bucket
 * with no members is never emitted; a level whose members all land in ONE
 * bucket still shows it, because the lens is a stated intent and silently
 * skipping a level would make the tree lie about how many groups exist.
 */
export function applyLens(nodes: TreeNode[], lens: TreeLens): LensNode[] {
  const entity = (node: TreeNode): LensEntityNode => ({
    type: 'entity',
    node,
    children: applyLens(node.children, lens),
  })

  if (lens === 'hierarchy') return nodes.map(entity)

  const buckets = new Map<string, TreeNode[]>()
  for (const node of nodes) {
    const key = lensKey(node, lens)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(node)
    else buckets.set(key, [node])
  }

  return [...buckets.keys()].sort(groupComparator(lens)).map((key) => {
    // Members keep their sibling order — KIND_ORDER, then name, as `buildTree`
    // left them. Inside a bucket they are still siblings of one container, and
    // that is the order every other level of the rail reads in.
    const members = buckets.get(key) as TreeNode[]
    return { type: 'group' as const, lens, key, count: members.length, children: members.map(entity) }
  })
}

function lensKey(node: TreeNode, lens: GroupLens): string {
  if (lens === 'kind') return node.kind
  if (lens === 'status') return node.status
  return node.owner ?? ''
}

function groupComparator(lens: GroupLens): (a: string, b: string) => number {
  if (lens === 'kind') {
    return (a, b) => KIND_ORDER.indexOf(a as EntityKind) - KIND_ORDER.indexOf(b as EntityKind)
  }
  if (lens === 'status') {
    return (a, b) => STATUSES.indexOf(a as Status) - STATUSES.indexOf(b as Status)
  }
  return (a, b) => {
    if (a === b) return 0
    if (a === '') return 1
    if (b === '') return -1
    return a.localeCompare(b)
  }
}

/**
 * A stable identity for one filter state, used to scope the reader's manual
 * collapse/expand overrides while filtering: the same filters mean the same
 * signature, so the overrides survive re-renders, and any CHANGE to the filters
 * produces a new signature, which is the cue to drop the overrides and let the
 * new filter's matches auto-reveal again.
 *
 * Kind and status sets are order-insensitive — toggling a kind off and on again
 * is the same filter, not a new one — so they are sorted before joining. The
 * query is a single search-box line and the sets are enum tokens, so a newline
 * separator cannot collide with content.
 */
export function filterSignature(filters: TreeFilters): string {
  return [
    filters.query,
    [...filters.kinds].sort().join(','),
    [...filters.statuses].sort().join(','),
  ].join('\n')
}

/** Sibling-unique key for one lens node — a React key, and one step of an id. */
export function lensNodeKey(item: LensNode): string {
  return item.type === 'group' ? `group:${item.lens}:${item.key}` : item.node.srn
}

/**
 * A path-qualified id for one lens node, built by chaining `lensNodeKey` from
 * the root down. Sibling-unique keys are not enough for the override map: under
 * the Kind lens a `group:kind:datamodel` bucket exists at every level that holds
 * a datamodel, and collapsing one of them must not collapse the rest. An SRN
 * would do for entities, but buckets have no SRN, so both get the path form.
 */
export function lensNodeId(parentId: string | null, item: LensNode): string {
  const own = lensNodeKey(item)
  return parentId === null ? own : `${parentId}>${own}`
}

/** Total rows matching the filters anywhere in `nodes`. */
export function countMatches(nodes: TreeNode[], filters: TreeFilters): number {
  return nodes.reduce(
    (total, node) => total + (matchesFilters(node, filters) ? 1 : 0) + countMatches(node.children, filters),
    0,
  )
}
