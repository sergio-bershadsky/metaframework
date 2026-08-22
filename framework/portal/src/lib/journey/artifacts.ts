import type { Catalog, Diagnostic, Entity } from '../catalog/types'
import { formatSrn, parseSrn, resolveRef } from '../srn/srn'
import { type Journey, type JourneyIssue, parseJourney } from './journey'

/**
 * JRN4, JRN9 and JRN15 — framework/spec/kinds/journey.md, "Entity directory
 * shape" and "Crossing a product boundary" — as an executable copy.
 *
 * `parseJourney` owns the file's own contract and stops exactly where the kind
 * document stops it: it is handed a parsed document and nothing else, so it can
 * neither notice that the document is **absent** (JRN4), nor that something else
 * is sitting **beside** it (JRN9), nor look up what a named protocol's
 * participants are (JRN15). Those were the three journey rows left in the debt
 * register, and each names its missing input rather than a missing branch.
 *
 * The two halves need different things and are exported separately for that
 * reason:
 *
 * - {@link journeyDirectoryIssues} needs a **directory listing** — every entry,
 *   not the artifact list. The loader reads four extensions and drops the rest,
 *   so `steps.txt` and a stray `journeys/` subdirectory are invisible to
 *   `entity.artifacts` by construction. JRN9 is precisely a rule about what the
 *   loader chose not to read.
 * - {@link journeyProtocolIssues} needs the **resolved catalog**, for one join:
 *   the protocol's `participants` list.
 */

export const JOURNEY_ARTIFACT = 'journey.yaml'
const ENTITY_DOCUMENT = 'index.md'

/**
 * One entry of an entity directory, as `readdir(dir, { withFileTypes: true })`
 * reports it. Deliberately not `Dirent`: a caller synthesising a listing in a
 * test should not have to construct one, and the two fields below are the whole
 * of what JRN9 asks.
 */
export interface DirectoryEntry {
  name: string
  directory: boolean
}

/* ------------------------------------------------- JRN4 and JRN9: the directory */

/**
 * The journey entity directory, judged.
 *
 * A journey holds "exactly two files" and the artifact filename is "bare and
 * fixed". Both rules exist for the same reason: the entity's frontmatter says
 * nothing about the path, so `journey.yaml` is the only thing that makes a
 * journey a journey rather than a paragraph of prose — and a file named
 * `journey.yml` or `place-an-order.yaml` is a path the portal will never read,
 * silently, while the author believes it is authored.
 *
 * The recognised set is short and closed: `index.md`, `journey.yaml`, and any
 * `*.md` prose sibling ("allowed and carry no machine semantics"). Everything
 * else — including a subdirectory of any name, since the kind admits none — is
 * `W_JRN_ARTIFACT_UNKNOWN`.
 *
 * Dot- and underscore-prefixed entries are skipped, which is the loader's own
 * convention for every directory it walks (`.DS_Store`, `_scratch/`). It costs
 * nothing here: those names are already unreadable as artifacts everywhere else
 * in the portal, so warning about one would be the only place in the catalog
 * where an editor's droppings are a finding.
 */
export function journeyDirectoryIssues(entries: readonly DirectoryEntry[]): JourneyIssue[] {
  const issues: JourneyIssue[] = []
  const visible = entries.filter((entry) => !entry.name.startsWith('.') && !entry.name.startsWith('_'))

  // JRN4. Pathed at the directory rather than at a filename, because the finding
  // is an absence and there is no line for it to sit on.
  if (!visible.some((entry) => !entry.directory && entry.name === JOURNEY_ARTIFACT)) {
    issues.push({
      code: 'E_JRN_ARTIFACT_MISSING',
      severity: 'error',
      message:
        `no ${JOURNEY_ARTIFACT} — a journey's frontmatter says nothing about the path, so an entity without ` +
        'its artifact asserts nothing at all. A path under design carries a short one and `status: draft`.',
      path: '',
    })
  }

  // JRN9.
  for (const entry of visible) {
    if (recognised(entry)) continue
    issues.push({
      code: 'W_JRN_ARTIFACT_UNKNOWN',
      severity: 'warning',
      message: entry.directory
        ? `"${entry.name}/" — a journey entity has no subdirectories: exactly one path per entity, and two paths are two entities`
        : `"${entry.name}" is not a file this kind defines — the artifact is named exactly ${JOURNEY_ARTIFACT}, ` +
          'and only *.md prose siblings may sit beside it',
      path: entry.name,
    })
  }

  return issues
}

function recognised(entry: DirectoryEntry): boolean {
  if (entry.directory) return false
  if (entry.name === ENTITY_DOCUMENT || entry.name === JOURNEY_ARTIFACT) return true
  return entry.name.endsWith('.md')
}

/* ------------------------------------------------ JRN15: the protocol join */

/**
 * `W_JRN_PROTOCOL_UNRELATED` — the protocol a step names is not about this hop.
 *
 * The rule, verbatim: the named protocol SHOULD list, among its `participants`,
 * "either the entity this step `touches` or the entity the previous step
 * touched — where a participant matches if it *is* that entity, *contains* it,
 * or *is contained by* it". A protocol that touches neither end "is not
 * documenting the hop, and the usual cause is a copy-paste from the step above".
 *
 * Two boundaries worth stating, because both are places a looser reading would
 * invent findings:
 *
 * - It is **not** restricted to product crossings. JRN14 is the crossing rule;
 *   JRN15 is stated over "a step's named protocol", and a within-product step
 *   citing an unrelated protocol is the same copy-paste with the same cause.
 * - It fires only once the protocol **resolves to a protocol that exists**.
 *   A dangling or wrong-kind reference is `E_SRN_DANGLING` / `E_JRN_PROTOCOL_KIND`,
 *   and a second complaint about the same character span helps nobody.
 *
 * Containment is decided on the SRN path, on `{kind}/{name}` pair boundaries.
 * SRN ≡ path ≡ URL path, so a prefix *is* the containment chain — and deciding
 * it without a catalog lookup means an end whose entity failed to load still
 * gets the right answer instead of a spurious warning.
 */
export function journeyProtocolIssues(catalog: Catalog, journey: Journey): JourneyIssue[] {
  const issues: JourneyIssue[] = []

  journey.steps.forEach((step, index) => {
    if (!step.protocolSrn) return
    const protocol = catalog.entities.get(step.protocolSrn)
    if (!protocol || protocol.kind !== 'protocol') return

    // Both ends of the hop. Step 0 has no predecessor, so it is judged on its own
    // end alone — the same asymmetry JRN14 gives the first step.
    const ends = [step.touchesSrn, index > 0 ? journey.steps[index - 1].touchesSrn : undefined].filter(
      (end): end is string => typeof end === 'string',
    )
    if (ends.length === 0) return

    const participants = participantSrns(protocol)
    if (participants.some((participant) => ends.some((end) => related(participant, end)))) return

    issues.push({
      code: 'W_JRN_PROTOCOL_UNRELATED',
      severity: 'warning',
      message:
        `${step.protocolSrn} lists neither end of this hop among its participants ` +
        `(${ends.join(' ← ')}) — it is not documenting this step, and the usual cause is a ` +
        'copy-paste from the step above',
      path: `${step.path}.protocol`,
    })
  })

  return issues
}

/** The participants a protocol declares, resolved and unversioned. */
function participantSrns(protocol: Entity): string[] {
  const declared = (protocol.frontmatter as { participants?: unknown }).participants
  if (!Array.isArray(declared)) return []

  const srns: string[] = []
  for (const participant of declared as Array<{ ref?: unknown }>) {
    if (typeof participant.ref !== 'string') continue
    try {
      const parsed = parseSrn(resolveRef(protocol.srn, participant.ref))
      if (parsed.artifact !== null) continue
      srns.push(formatSrn({ ...parsed, version: null }))
    } catch {
      // An unusable participant ref is E_PROTO_PARTICIPANT_KIND's business.
    }
  }
  return srns
}

/** `a` is `b`, contains it, or is contained by it. */
function related(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
}

/* ------------------------------------------------------------ composition */

/**
 * Every journey rule that `parseJourney` cannot reach, as catalog diagnostics.
 *
 * `listings` is keyed by entity SRN and holds the entity directory as
 * `readdir` reports it. It is a parameter rather than a read because this module
 * stays pure: the loader already has the listing in hand — `walk()` and
 * `readArtifacts()` each call `readdir(dir, { withFileTypes: true })` — so the
 * integrator threads what is already read rather than paying for a third stat
 * pass. A journey with no entry in the map is skipped, not assumed empty:
 * inventing `E_JRN_ARTIFACT_MISSING` for a caller that simply did not supply a
 * listing would be the worst possible failure mode for the strictest code here.
 *
 * The journey document is re-parsed for JRN15 and every issue that parse
 * produces is discarded: `artifact-checks.ts` already runs the same parser and
 * owns those findings. Only `journey.steps` is read out of it.
 */
export function journeyArtifactDiagnostics(
  catalog: Catalog,
  listings: ReadonlyMap<string, readonly DirectoryEntry[]>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'journey') continue

    // A directory issue's `path` is the offending entry's name, or empty for the
    // one finding that is an absence — so it becomes the file to open, or the
    // directory when there is no file.
    const listing = listings.get(entity.srn)
    for (const issue of listing ? journeyDirectoryIssues(listing) : []) {
      diagnostics.push({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
        path: issue.path ? `${entity.relDir}/${issue.path}` : entity.relDir,
        srn: entity.srn,
      })
    }

    const artifact = entity.artifacts.find((candidate) => candidate.file === JOURNEY_ARTIFACT)
    if (!artifact || artifact.error) continue
    const { journey } = parseJourney(artifact.data, { journeySrn: entity.srn })
    if (!journey) continue

    for (const issue of journeyProtocolIssues(catalog, journey)) {
      diagnostics.push({
        code: issue.code,
        severity: issue.severity,
        message: `${issue.path}: ${issue.message}`,
        path: `${entity.relDir}/${JOURNEY_ARTIFACT}`,
        srn: entity.srn,
      })
    }
  }

  return diagnostics
}
