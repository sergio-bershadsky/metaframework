import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { type DirectoryEntry } from '../journey/artifacts'
import { type ProtocolDirectoryEntry } from '../protocol/spec-file-checks'
import { type CatalogDirectory, listCatalogDirectories } from '../structure/structure'
import type { Catalog } from './types'

/**
 * What the catalog checks need from the filesystem that the entity graph cannot
 * carry — the directory listings, taken once and handed to the checks that read
 * them.
 *
 * Three of the newly enforced rules are rules about **what the loader chose not
 * to read**, and none of them is decidable from `catalog`:
 *
 * - `E_COMP_SYMLINK` (kinds/component.md CV5). A symlinked directory reports
 *   `isDirectory() === false` under `withFileTypes`, so `walk` never descends
 *   into one and no entity is ever created for it. The whole subtree behind the
 *   link is invisible to every other rule in the portal.
 * - `E_SOL_NO_ROOT` (kinds/solution.md S1). A solution directory with no
 *   `index.md` produces one `E_STRUCT_MISSING_INDEX` per orphaned descendant —
 *   naming the children rather than the directory that is actually missing a
 *   document — and produces nothing whatsoever when it is empty.
 * - `E_JRN_ARTIFACT_MISSING` / `W_JRN_ARTIFACT_UNKNOWN` (kinds/journey.md JRN4,
 *   JRN9). `readArtifacts` reads four extensions and drops the rest, so a
 *   `steps.txt` or a stray subdirectory is absent from `entity.artifacts` by
 *   construction. JRN9 is precisely a rule about the files that never became
 *   artifacts.
 * - `E_PROTO_SPEC_FILE` / `W_PROTO_ARTIFACT_UNKNOWN` (kinds/protocol.md, "Entity
 *   directory shape"). The same rule shape as JRN4/JRN9 one kind over, and the
 *   same reason it cannot be answered from the graph — with one difference that
 *   the listing has to carry: a protocol's linked `spec.file` may sit inside
 *   `workflows/` or an asset subdirectory, and `pricing.proto` never becomes an
 *   artifact at all. So the protocol listing is **recursive** where the journey
 *   listing is one level, and its rows are paths rather than names.
 *
 * Taken here rather than inside `loadCatalog`, and the reason is the same one
 * `lib/catalog/index.ts` gives three times for its other folds: that function is
 * the pure filesystem → entity-graph step, its return value is the graph, and its
 * hermetic temp fixtures assert an exact diagnostics list. Threading two listings
 * through it would put raw `readdir` output on {@link Catalog} — a field every
 * hand-built catalog in the suite would then have to satisfy — to save a second
 * traversal that was measured before being accepted rather than waved through.
 *
 * The price, over the catalog as it stands (345 entities, 478 directories, 9
 * journeys): **~18ms**, against ~105–145ms for `loadCatalog` itself. It is a
 * readdir-only walk over the same tree the loader has just read *and parsed* 345
 * markdown documents and several hundred artifacts out of, and it runs only when
 * the catalog is rebuilt — which the fingerprint already gates at roughly the
 * same ~18ms per request. Worth restating if either number moves by an order of
 * magnitude; not worth a field on the graph today.
 */
export interface CatalogListings {
  /** Every directory under the catalog root, symlinks recorded and not followed. */
  directories: CatalogDirectory[]
  /**
   * Each journey entity's own directory, keyed by SRN.
   *
   * A journey is **absent** rather than empty when its directory could not be
   * read: `journeyArtifactDiagnostics` skips what the map does not hold, and
   * inventing an empty listing would make an unreadable directory report the
   * strictest code here — "no journey.yaml" — about a file that is probably there.
   */
  journeys: Map<string, DirectoryEntry[]>
  /**
   * Each protocol entity's own directory, keyed by SRN, listed **recursively**
   * as entity-relative `/`-separated paths — `transport.yaml`, `workflows`,
   * `workflows/place-order.yaml`.
   *
   * Absent rather than empty when the directory could not be read, for the
   * journeys field's reason and with a softer consequence:
   * `protocolArtifactDiagnostics` keeps the three checks that need no
   * filesystem for a protocol the map does not hold, and drops only the two
   * that do.
   */
  protocols: Map<string, ProtocolDirectoryEntry[]>
}

/**
 * Take all three listings for one catalog root.
 *
 * `catalogDir` is the root `loadCatalog` was given and `catalog` is what it
 * returned, so the per-entity listings are taken for exactly the entities that
 * loaded.
 */
export async function catalogListings(catalogDir: string, catalog: Catalog): Promise<CatalogListings> {
  const of = (kind: string) => [...catalog.entities.values()].filter((entity) => entity.kind === kind)
  const journeyEntities = of('journey')
  const protocolEntities = of('protocol')

  const [directories, listedJourneys, listedProtocols] = await Promise.all([
    listCatalogDirectories(catalogDir),
    Promise.all(journeyEntities.map(async (entity) => [entity.srn, await entries(entity.dir)] as const)),
    Promise.all(protocolEntities.map(async (entity) => [entity.srn, await tree(entity.dir)] as const)),
  ])

  const journeys = new Map<string, DirectoryEntry[]>()
  for (const [srn, listing] of listedJourneys) {
    if (listing !== null) journeys.set(srn, listing)
  }

  const protocols = new Map<string, ProtocolDirectoryEntry[]>()
  for (const [srn, listing] of listedProtocols) {
    if (listing !== null) protocols.set(srn, listing)
  }

  return { directories, journeys, protocols }
}

/** One directory as `{ name, directory }` rows, or null when it cannot be read. */
async function entries(dir: string): Promise<DirectoryEntry[] | null> {
  try {
    const found = await readdir(dir, { withFileTypes: true })
    return found.map((entry) => ({ name: entry.name, directory: entry.isDirectory() }))
  } catch {
    return null
  }
}

/**
 * One directory and everything under it as `{ path, directory }` rows, or null
 * when the *root* cannot be read.
 *
 * A subdirectory that cannot be read is recorded as a row and contributes no
 * children, which is the honest answer: the entry is there, and what is inside
 * it is unknown. Only an unreadable root is null, because then nothing is known
 * and inventing an empty listing would report every fixed artifact as missing.
 *
 * Symlinked directories report `isDirectory() === false` under `withFileTypes`
 * and so are never descended into — the same rule `walk` follows in the loader
 * and `listCatalogDirectories` follows for `E_COMP_SYMLINK`, and the reason a
 * symlink loop cannot make this recursion diverge.
 */
async function tree(dir: string, prefix = ''): Promise<ProtocolDirectoryEntry[] | null> {
  let found
  try {
    found = await readdir(path.join(dir, prefix), { withFileTypes: true })
  } catch {
    return prefix === '' ? null : []
  }
  const rows: ProtocolDirectoryEntry[] = []
  for (const entry of found) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const directory = entry.isDirectory()
    rows.push({ path: rel, directory })
    if (directory) rows.push(...((await tree(dir, rel)) ?? []))
  }
  return rows
}
