import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { assertArtifactRole } from '../srn/artifacts'
import { type SrnSegment, SrnError, formatSrn, parseSrn, resolveRef } from '../srn/srn'
import type { Catalog, Diagnostic, Entity } from '../catalog/types'

/**
 * The containment rules — what a component may declare and contain, where a
 * component directory may sit, what a product's actors may be, what a solution
 * directory must hold, and where a protocol belongs — as an executable copy of
 * `framework/spec/kinds/{component,product,solution}.md` and
 * `framework/spec/structure.md`.
 *
 * Eight classes the kind documents state and `metaframework check` did not keep.
 * They ship as one module because they are grouped by **input**, not by kind:
 * every one of them is answerable from the resolved catalog plus a single
 * directory listing, and none of them needs anything else — no artifact parser,
 * no schema registry, no git history. That is also why the entry point is one
 * call: an integrator wires {@link structureDiagnostics} once and gets all eight.
 *
 * The split inside is the same one `lib/environment/environment.ts` draws:
 *
 * - **Graph rules** (T1, T2, T3, CV7, PD3 and the NCA rule) read the resolved
 *   catalog, because each asks about a *second* entity — the kind an edge points
 *   at, the kind of a child, the pair chain of a participant. They are pure
 *   functions of {@link Catalog}.
 * - **Disk rules** (CV5 and S1) cannot be answered from the catalog at all, and
 *   that is exactly why they were never implemented. A symlinked directory has
 *   `isDirectory() === false` under `withFileTypes`, so the loader's walk never
 *   descends into one and no entity is ever created for it; a solution directory
 *   with no `index.md` yields one `E_STRUCT_MISSING_INDEX` per child and nothing
 *   at all when it is empty. Both need the listing to be *taken*, with the
 *   loader's own hidden/underscore skip applied — {@link listCatalogDirectories}
 *   is that collector, and the only impure export here.
 */

/* ------------------------------------------------------------------- input */

/**
 * One directory under the catalog root, as the filesystem reports it.
 *
 * The shape is deliberately three flags rather than a `Dirent`: it is the whole
 * of what the two disk rules need, it is trivially constructible in a test, and
 * it keeps every check below pure.
 */
export interface CatalogDirectory {
  /**
   * Catalog-relative path with `/` separators and no leading slash —
   * `acme`, `acme/product/shop`, `acme/product/shop/component/ledger`.
   */
  path: string
  /** The entry is a symbolic link rather than a real directory. */
  symlink: boolean
  /** The directory holds an `index.md`, i.e. it is an entity directory. */
  hasIndex: boolean
}

/**
 * Every directory under the catalog root, symlinks included.
 *
 * Mirrors the loader's traversal in the two ways that matter. Dot- and
 * underscore-prefixed names are skipped, so a `_scratch` directory is no more a
 * solution here than it is there. And a symlink is **recorded but never
 * followed**: descending would resolve the very reuse-by-linking that CV5
 * forbids into a second copy of a subtree, with a cycle as the reward for a link
 * that points at an ancestor.
 */
export async function listCatalogDirectories(catalogDir: string): Promise<CatalogDirectory[]> {
  const found: CatalogDirectory[] = []

  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = path.join(dir, entry.name)

      if (entry.isSymbolicLink()) {
        found.push({ path: relPath, symlink: true, hasIndex: false })
        continue
      }

      const children = await readdir(full, { withFileTypes: true }).catch(() => [])
      found.push({
        path: relPath,
        symlink: false,
        hasIndex: children.some((child) => child.isFile() && child.name === 'index.md'),
      })
      await walk(full, relPath)
    }
  }

  await walk(catalogDir, '')
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

/* ------------------------------------------------------------ entry point */

/**
 * Every containment rule, in one list.
 *
 * `directories` is {@link listCatalogDirectories} over the same root the catalog
 * was loaded from. Pass `[]` and the six graph rules still run — the two disk
 * rules simply have nothing to read, which is a truthful "nothing observed"
 * rather than a silent pass.
 */
export function structureDiagnostics(catalog: Catalog, directories: CatalogDirectory[]): Diagnostic[] {
  return [
    ...solutionRootDiagnostics(directories),
    ...symlinkDiagnostics(directories),
    ...componentTypeDiagnostics(catalog),
    ...dependencyCycleDiagnostics(catalog),
    ...primaryActorDiagnostics(catalog),
    ...protocolPlacementDiagnostics(catalog),
  ]
}

/* ------------------------------------------------------------------ shared */

const document = (entity: Entity) => `${entity.relDir}/index.md`

/** Kind fields survive the common schema's `catchall`, untyped. Narrow here. */
function field(entity: Entity, name: string): unknown {
  return (entity.frontmatter as Record<string, unknown>)[name]
}

function stringField(entity: Entity, name: string): string | null {
  const value = field(entity, name)
  return typeof value === 'string' ? value : null
}

/* -------------------------------------------------------------------- S1 */

/**
 * S1 (kinds/solution.md) — every directory directly under `solutions/` contains
 * an `index.md`.
 *
 * The register's note on this code was precise: the case *did* produce a
 * diagnostic, `E_STRUCT_MISSING_INDEX`, once per orphaned descendant, and that
 * class names the child rather than the directory that is actually missing a
 * document. A solution root with no children produced nothing whatsoever. Both
 * are the same fact and it belongs on the directory: a solution is the sealed
 * universe every SRN beneath it is named against, so an unnamed one makes every
 * path under it unaddressable.
 *
 * No `srn` on the diagnostic, deliberately. There is no entity to link to —
 * that is the finding.
 */
export function solutionRootDiagnostics(directories: CatalogDirectory[]): Diagnostic[] {
  return directories
    .filter((directory) => !directory.path.includes('/') && !directory.symlink && !directory.hasIndex)
    .map((directory) => ({
      code: 'E_SOL_NO_ROOT',
      severity: 'error' as const,
      message: 'no index.md — a directory directly under the catalog root is a solution, and a solution states itself',
      path: directory.path,
    }))
}

/* ------------------------------------------------------------------- CV5 */

/**
 * CV5 (kinds/component.md) — a component directory is a real directory, never a
 * symlink.
 *
 * Position decides what a directory is: the grammar reads `…/component/<name>`
 * as a component whatever the inode says, so the check is the bucket the link
 * sits in and nothing else. It cannot be a check on the catalog, because a
 * symlink never becomes an entity — `readdir(…, { withFileTypes: true })`
 * reports `isDirectory() === false` for one, so the loader's walk skips it and
 * the whole subtree behind the link is invisible to every other rule in the
 * portal. Silence, for the one arrangement the kind document spends four
 * numbered reasons refusing.
 */
export function symlinkDiagnostics(directories: CatalogDirectory[]): Diagnostic[] {
  return directories
    .filter((directory) => {
      if (!directory.symlink) return false
      const segments = directory.path.split('/')
      return segments.length >= 2 && segments[segments.length - 2] === 'component'
    })
    .map((directory) => ({
      code: 'E_COMP_SYMLINK',
      severity: 'error' as const,
      message:
        'component directory is a symlink — a component is owned by one product and sits at one path; ' +
        'reuse is authored on the reusing side as a "depends-on" edge, never by linking the directory',
      path: directory.path,
    }))
}

/* ------------------------------------------------------------ T1, T2, T3 */

/** T2's list, verbatim: the types that name a runtime of their own. */
const RUNTIME_TYPES = new Set(['service', 'ui', 'job', 'datastore', 'gateway'])

/**
 * The two lifecycle stages at which "runs nowhere" is the accurate record.
 *
 * The kind document defines them and the definitions decide this: `planned` is
 * "Described and agreed; not being built yet — no code exists", and `retired` is
 * "No longer running anywhere … nothing calls it and nothing deploys it". A
 * component in either state that named an environment would be making a false
 * claim, so T2 on those two would be a warning no honest author could clear.
 *
 * The other three are not exempt, and `in-development` least of all: the kind
 * document's own example is `lifecycle: in-development` with
 * `uses: [/environment/staging]` beside it, captioned "not shipped to its
 * consumers yet … but it does run here". Built-and-unreleased is precisely when
 * the environment edge starts carrying information, and `sunset` is defined as
 * "still running, but being replaced".
 */
const UNDEPLOYED_LIFECYCLES = new Set(['planned', 'retired'])

/**
 * T1, T2 and T3 (kinds/component.md, "Declaring environments" and the type
 * disciplines).
 *
 * All three are one pass because all three read the same two facts about a
 * component: which of its `uses` edges resolve to an environment, and which of
 * its children are components. Neither is answerable from the entity alone —
 * `uses` is one edge over four target kinds, so "declares an environment" is a
 * question about the *target's* kind and nothing about the edge itself.
 */
export function componentTypeDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'component') continue
    const type = stringField(entity, 'component-type')
    if (type === null) continue // E_FM_SCHEMA (CV2) has already said so.

    const environments = entity.relations.filter(
      (relation) =>
        relation.edge === 'uses' &&
        relation.target !== null &&
        catalog.entities.get(relation.target)?.kind === 'environment',
    )

    // T1. An error, not a warning: a library has no runtime, so the edge is not
    // early or stale — it is a category mistake, and the reading it invites
    // ("this library is deployed to production") is one the kind cannot have.
    if (type === 'library') {
      for (const relation of environments) {
        diagnostics.push({
          code: 'E_COMP_LIBRARY_ENVIRONMENT',
          severity: 'error',
          message: `a library declares no environment — "${relation.ref}" names ${relation.target}, and a library runs inside its consumers`,
          path: document(entity),
          srn: entity.srn,
        })
      }
    }

    // T2, the SHOULD. A warning because the honest reasons are real: a component
    // may be described before anyone has decided where it runs.
    const lifecycle = stringField(entity, 'lifecycle')
    if (
      RUNTIME_TYPES.has(type) &&
      environments.length === 0 &&
      !(lifecycle !== null && UNDEPLOYED_LIFECYCLES.has(lifecycle))
    ) {
      diagnostics.push({
        code: 'W_COMP_NO_ENVIRONMENT',
        severity: 'warning',
        message: `a ${type} declares no environment — add a "uses" edge to the environment entities it runs in`,
        path: document(entity),
        srn: entity.srn,
      })
    }

    // T3. Child *components* only: an external MAY own the datamodels and
    // protocols that describe the seam — that is how the boundary gets
    // documented at all — and what it may not own is a decomposition of
    // somebody else's system.
    if (type === 'external') {
      for (const child of entity.children) {
        if (catalog.entities.get(child)?.kind !== 'component') continue
        diagnostics.push({
          code: 'E_COMP_EXTERNAL_CHILD',
          severity: 'error',
          message: `an external component contains ${child} — we describe the boundary of a system we do not own, never its insides`,
          path: document(entity),
          srn: entity.srn,
        })
      }
    }
  }

  return diagnostics
}

/* ------------------------------------------------------------------- CV7 */

/**
 * CV7 — the `depends-on` graph among components is acyclic.
 *
 * "Among components", exactly as written: `depends-on` also targets products,
 * and a component→product→component loop is a different statement (a product is
 * a portfolio line, not a build unit) that the kind document does not make. The
 * graph is therefore the component-to-component edges only.
 *
 * A warning, because the kind document says so in as many words — "dependency
 * cycles among components are legal but flagged … so they are a deliberate
 * choice rather than an accident". One diagnostic per cycle rather than one per
 * member: a cycle is a single fact about a set, and three copies of it on three
 * pages is the same fact three times. It is filed on the lexicographically first
 * member so the choice is stable across runs.
 */
export function dependencyCycleDiagnostics(catalog: Catalog): Diagnostic[] {
  const graph = new Map<string, string[]>()
  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'component') continue
    const targets = entity.relations
      .filter((relation) => relation.edge === 'depends-on' && relation.target !== null)
      .map((relation) => relation.target as string)
      .filter((target) => catalog.entities.get(target)?.kind === 'component')
    graph.set(entity.srn, [...new Set(targets)].sort())
  }

  return stronglyConnected(graph)
    .map((component) => cycleThrough(graph, component))
    .filter((cycle): cycle is string[] => cycle !== null)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((cycle) => {
      const entity = catalog.entities.get(cycle[0])
      return {
        code: 'W_COMP_DEP_CYCLE',
        severity: 'warning' as const,
        message: `"depends-on" cycle: ${[...cycle, cycle[0]].join(' → ')}`,
        path: entity ? document(entity) : cycle[0],
        ...(entity ? { srn: entity.srn } : {}),
      }
    })
}

/**
 * Tarjan's strongly-connected components, iterative so a deep dependency chain
 * cannot overflow the stack on a catalog nobody has stress-tested.
 */
function stronglyConnected(graph: Map<string, string[]>): string[][] {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []
  let counter = 0

  for (const root of graph.keys()) {
    if (index.has(root)) continue
    const work: Array<{ node: string; edge: number }> = [{ node: root, edge: 0 }]

    while (work.length > 0) {
      const frame = work[work.length - 1]
      const { node } = frame

      if (frame.edge === 0) {
        index.set(node, counter)
        low.set(node, counter)
        counter += 1
        stack.push(node)
        onStack.add(node)
      }

      const edges = graph.get(node) ?? []
      let descended = false
      while (frame.edge < edges.length) {
        const next = edges[frame.edge]
        frame.edge += 1
        if (!index.has(next)) {
          work.push({ node: next, edge: 0 })
          descended = true
          break
        }
        if (onStack.has(next)) low.set(node, Math.min(low.get(node) ?? 0, index.get(next) ?? 0))
      }
      if (descended) continue

      if (low.get(node) === index.get(node)) {
        const component: string[] = []
        for (;;) {
          const member = stack.pop() as string
          onStack.delete(member)
          component.push(member)
          if (member === node) break
        }
        found.push(component)
      }

      work.pop()
      const parent = work[work.length - 1]?.node
      if (parent !== undefined) low.set(parent, Math.min(low.get(parent) ?? 0, low.get(node) ?? 0))
    }
  }

  return found
}

/**
 * A concrete cycle through a strongly-connected set, as a path a reader can
 * follow — the set alone says "these five are tangled" without saying which edge
 * to cut. Breadth-first from the smallest member back to itself, so the reported
 * cycle is the shortest one through that member.
 *
 * Returns null for a single node with no self-edge, which is every acyclic node:
 * Tarjan reports those as one-member components too.
 */
function cycleThrough(graph: Map<string, string[]>, component: string[]): string[] | null {
  const members = new Set(component)
  const start = [...component].sort()[0]
  if (component.length === 1 && !(graph.get(start) ?? []).includes(start)) return null

  const previous = new Map<string, string>()
  const queue = [start]
  const seen = new Set<string>()

  while (queue.length > 0) {
    const node = queue.shift() as string
    for (const next of graph.get(node) ?? []) {
      if (!members.has(next)) continue
      if (next === start) {
        const cycle = [node]
        let cursor = node
        while (cursor !== start) {
          cursor = previous.get(cursor) as string
          cycle.push(cursor)
        }
        return cycle.reverse()
      }
      if (seen.has(next)) continue
      seen.add(next)
      previous.set(next, node)
      queue.push(next)
    }
  }

  return null
}

/* ------------------------------------------------------------------- PD3 */

/**
 * PD3 and PD7 (kinds/product.md) — every `primary-actors` entry resolves to an
 * entity whose kind is `actor`.
 *
 * `primary-actors` is a kind field rather than a relation, precisely because no
 * edge type in the common contract may target an actor — which is also why
 * nothing had ever validated it: `collectRelations` never sees the list, so
 * until now a product could name a component, a nonexistent actor, or another
 * solution's, and load clean.
 *
 * The artifact fence is the one every reference surface in this framework
 * shares, and it is written here in the order product.md states it: V5 is static
 * and precedes the surface class, so a suffix outside the addressed kind's role
 * table fails first as `E_SRN_ARTIFACT` — every suffix on an actor SRN does,
 * because actors own no roles — while a suffix that survives the role table,
 * `….transport` on a protocol, reaches PD7's second half and is this class, with
 * the suffix named as the problem.
 *
 * `E_SRN_*` on the way (PD4) is emitted rather than swallowed, exactly as
 * `lib/environment/environment.ts` does for its own reference surface: a
 * reference that resolves to nothing is not a kind mismatch and must not be
 * reported as one, but it is certainly a finding.
 */
export function primaryActorDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'product') continue
    const refs = field(entity, 'primary-actors')
    if (!Array.isArray(refs)) continue // absent, or E_FM_SCHEMA's business.

    const at = (code: string, message: string) =>
      diagnostics.push({ code, severity: 'error' as const, message, path: document(entity), srn: entity.srn })

    for (const ref of refs) {
      if (typeof ref !== 'string') continue

      try {
        const parsed = parseSrn(resolveRef(entity.srn, ref))
        if (parsed.artifact !== null) {
          assertArtifactRole(parsed.kind, parsed.artifact, ref)
          at(
            'E_PROD_ACTOR_TARGET',
            `"${ref}" addresses the ".${parsed.artifact}" artifact of an entity — primary-actors names entities, and an artifact has no kind`,
          )
          continue
        }

        const srn = formatSrn({ ...parsed, version: null })
        const target = catalog.entities.get(srn)
        if (!target) {
          at('E_SRN_DANGLING', `"${ref}" resolves to ${srn}, which does not exist`)
          continue
        }
        if (target.kind !== 'actor') {
          at('E_PROD_ACTOR_TARGET', `"${ref}" resolves to a ${target.kind} (${srn}) — a primary actor is an actor`)
        }
      } catch (cause) {
        at(
          cause instanceof SrnError ? cause.code : 'E_SRN_SYNTAX',
          cause instanceof Error ? cause.message : String(cause),
        )
      }
    }
  }

  return diagnostics
}

/* ---------------------------------------------------------------- NCA */

/**
 * The nearest-common-ancestor rule (framework/spec/structure.md) — a protocol
 * lives at the NCA of its component and product participants.
 *
 * Three things the rule states and this implements literally:
 *
 * - The NCA is computed over whole `{kind}/{name}` **pairs**, never over raw
 *   segments. `product/shop` and `product/shopfront` share no prefix at all;
 *   over segments they would share `product`, which is a bucket and not a place.
 * - **Actors are excluded.** They are solution-level, so counting one would
 *   collapse every placement to the solution root. A protocol whose only
 *   participants are actors is therefore unconstrained and yields nothing.
 * - It is a **warning**, because `participants` and the directory legitimately
 *   move a commit or two apart during a swap (protocol.md says the same of the
 *   `exposes`/`uses` cross-check, for the same reason).
 *
 * A protocol with an unresolvable participant is skipped whole rather than
 * checked against what is left. Dropping the broken reference would shrink the
 * participant set, and a smaller set has a *deeper* NCA — so the reward for one
 * dangling ref would be a second, invented finding about placement that is
 * correct for the list as authored. The dangling reference has its own class.
 */
export function protocolPlacementDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'protocol') continue
    const participants = field(entity, 'participants')
    if (!Array.isArray(participants)) continue

    const chains: SrnSegment[][] = []
    let resolvable = true

    for (const participant of participants) {
      const ref = (participant as { ref?: unknown })?.ref
      if (typeof ref !== 'string') {
        resolvable = false
        break
      }
      let target: Entity | undefined
      try {
        const parsed = parseSrn(resolveRef(entity.srn, ref))
        if (parsed.artifact !== null) {
          resolvable = false
          break
        }
        target = catalog.entities.get(formatSrn({ ...parsed, version: null }))
      } catch {
        resolvable = false
        break
      }
      if (!target) {
        resolvable = false
        break
      }
      if (target.kind === 'component' || target.kind === 'product') chains.push(target.parsed.path)
    }

    if (!resolvable || chains.length === 0) continue

    const nca = commonPrefix(chains)
    // Placement is taken from the protocol's own path rather than from
    // `entity.parent`, which is null when the owner has no index.md — a protocol
    // does not stop having a position because its product is missing a document.
    const owner = entity.parsed.path.slice(0, -1)
    if (samePairs(owner, nca)) continue

    diagnostics.push({
      code: 'W_STRUCT_PROTOCOL_NCA',
      severity: 'warning',
      message:
        `filed under ${chainSrn(entity.parsed.solution, owner)}, ${describeOffset(owner, nca)} the nearest common ancestor ` +
        `of its participants — this protocol belongs at ${chainSrn(entity.parsed.solution, [...nca, { kind: 'protocol' as const, name: entity.parsed.name as string }])}`,
      path: document(entity),
      srn: entity.srn,
    })
  }

  return diagnostics
}

/** The longest `{kind}/{name}` prefix every chain shares. */
function commonPrefix(chains: SrnSegment[][]): SrnSegment[] {
  const shortest = Math.min(...chains.map((chain) => chain.length))
  const prefix: SrnSegment[] = []
  for (let position = 0; position < shortest; position += 1) {
    const pair = chains[0][position]
    const shared = chains.every((chain) => chain[position].kind === pair.kind && chain[position].name === pair.name)
    if (!shared) break
    prefix.push(pair)
  }
  return prefix
}

function samePairs(left: SrnSegment[], right: SrnSegment[]): boolean {
  return (
    left.length === right.length &&
    left.every((pair, position) => pair.kind === right[position].kind && pair.name === right[position].name)
  )
}

/**
 * Which way the placement is wrong, in one word.
 *
 * Both directions violate the MUST, and they fail differently. **Below** the NCA
 * is the harmful one structure.md names explicitly: some participant sits
 * outside the protocol's owning subtree, so the contract is invisible from the
 * side of the tree that speaks it. **Above** is over-general rather than
 * unreachable — every participant is still beneath it — and it costs the reader
 * the one thing placement is for: knowing whose contract this is.
 */
function describeOffset(owner: SrnSegment[], nca: SrnSegment[]): string {
  if (samePairs(owner.slice(0, nca.length), nca)) return 'below'
  if (samePairs(nca.slice(0, owner.length), owner)) return 'above'
  return 'off the line of'
}

function chainSrn(solution: string, chain: SrnSegment[]): string {
  return formatSrn({
    solution,
    path: chain,
    kind: chain[chain.length - 1]?.kind ?? null,
    name: chain[chain.length - 1]?.name ?? null,
    artifact: null,
    version: null,
  })
}
