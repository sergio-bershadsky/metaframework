import type { Catalog, Diagnostic, Entity } from '../catalog/types'
import { headings } from '../markdown/body'

/**
 * The ADR kind — framework/spec/kinds/adr.md — as an executable copy of the five
 * rules the portal promised and did not keep.
 *
 * ADR1 (`decision-status` enum) and ADR5 (the three fields appear only on an
 * ADR) were already enforced by the frontmatter schema and the unknown-field
 * check. The other five sat in the portal's debt register: `E_ADR_DATE`,
 * `E_ADR_DECIDERS`, `E_ADR_SECTIONS`, `W_ADR_ORDINAL` and `W_ADR_SUPERSESSION`.
 * An author following the kind document got no complaint for breaking any of
 * them, which for a bucket that is *the* append-only record of why the
 * architecture is what it is meant the one document class nobody can reconstruct
 * was the one class nothing checked.
 *
 * The kind document draws the split this module follows:
 *
 * - **From the entity alone** — ADR2, ADR3 and ADR4. {@link normalizeAdrDate},
 *   {@link adrFrontmatterIssues} and {@link adrSectionIssues} are pure functions
 *   over one document, collecting spec error classes instead of throwing.
 * - **From the resolved catalog** — ADR6 and ADR7, which need the ADR's
 *   siblings in its bucket and the derived inverse of `supersedes`. Those live
 *   in {@link adrDiagnostics}, which is the whole kind in one call.
 *
 * ## What the loader must stop saying for two of these codes to be reachable
 *
 * `KIND_FRONTMATTER.adr` (lib/catalog/frontmatter.ts) currently pins
 * `date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` and refines `deciders`, so a
 * malformed date and an empty decider list are reported as `E_FM_SCHEMA` — the
 * generic code — rather than as the classes the kind document names for them.
 * `metric` already shows the way out: `target` and `window` are plain strings in
 * the schema precisely so that `kindDiagnostics` can raise `E_MET_TARGET` and
 * `E_MET_WINDOW`. Until the same relaxation lands for `adr`, a bad date is
 * reported twice, under both codes. Nothing in the shipped catalog is in that
 * state — all 60 ADRs carry a quoted, valid date — so the relaxation is a
 * correctness fix, not a gate fix.
 */

/* ------------------------------------------------------------------- model */

export interface AdrIssue {
  /** Spec error class, e.g. `E_ADR_SECTIONS`. */
  code: string
  severity: 'error' | 'warning'
  message: string
}

/**
 * The enforced body template, in the canonical order the portal renders.
 *
 * Presence is enforced; **order is not**, and that is the kind document's own
 * word ("What is *not* enforced: the order of the four headings"). The portal
 * renders them in this order regardless of file order, so a file that lists
 * Consequences first is untidy rather than wrong, and a check that failed it
 * would be inventing a rule.
 */
export const ADR_SECTIONS = ['Context', 'Decision', 'Consequences', 'Alternatives considered'] as const

/** Decision states in which the kind document requires `deciders` (ADR3). */
const DECIDED = ['accepted', 'rejected']

/** `0001-event-sourcing` → 1. Anything else has no ordinal to collide. */
const ORDINAL = /^(\d+)-/

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/* ------------------------------------------------ ADR2 — the `date` field */

export interface AdrDate {
  /** `YYYY-MM-DD`, normalized from either spelling; null when unusable. */
  date: string | null
  /** Why it is unusable, phrased to follow "date "; null when it is fine. */
  reason: string | null
}

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Proleptic Gregorian, which is what ISO-8601 means by a calendar date. */
function daysInMonth(year: number, month: number): number {
  if (month !== 2) return DAYS[month - 1]
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
}

const pad = (value: number, width: number) => String(value).padStart(width, '0')

/**
 * One ADR `date`, normalized to `YYYY-MM-DD` or refused with a reason.
 *
 * Both spellings the kind document admits arrive here, because YAML 1.2 decides
 * which one the author gets: an unquoted `2026-03-11` is a **timestamp** and
 * reaches the loader as a `Date`, while `"2026-03-11"` stays a string. The kind
 * document accepts both and asks the portal to normalize — so this function is
 * also what an ADR list sorts by, not only what the check reads.
 *
 * A `Date` is admitted only at exactly midnight UTC. That is the one instant a
 * date-only timestamp can be, and it is the only test available once YAML has
 * thrown the source text away: `2026-03-11T09:00:00Z` — which the kind document
 * names as a violation in so many words — is a `Date` with a time of day in it,
 * and `2026-03-11T00:00:00Z` is indistinguishable from the bare date it would
 * have to be confused with. Preferring the false negative over the false
 * positive here costs a pedantic timestamp its finding; the other way round
 * would fail the kind document's own worked example.
 */
export function normalizeAdrDate(value: unknown): AdrDate {
  if (value === undefined || value === null) {
    return { date: null, reason: 'is missing — an ADR records when its decision reached this standing' }
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { date: null, reason: 'is not a valid date' }
    const time = value.getUTCHours() * 3600 + value.getUTCMinutes() * 60 + value.getUTCSeconds()
    if (time !== 0 || value.getUTCMilliseconds() !== 0) {
      return {
        date: null,
        reason: `"${value.toISOString()}" carries a time of day — a decision date is a calendar date, with no time and no timezone`,
      }
    }
    const year = value.getUTCFullYear()
    return { date: `${pad(year, 4)}-${pad(value.getUTCMonth() + 1, 2)}-${pad(value.getUTCDate(), 2)}`, reason: null }
  }

  if (typeof value !== 'string') {
    return { date: null, reason: `is a ${typeof value}, not an ISO-8601 calendar date` }
  }

  const match = value.match(ISO_DATE)
  if (!match) {
    return { date: null, reason: `"${value}" is not a bare ISO-8601 calendar date (YYYY-MM-DD)` }
  }

  const [, year, month, day] = match
  const [y, m, d] = [Number(year), Number(month), Number(day)]
  if (m < 1 || m > 12) {
    return { date: null, reason: `"${value}" names month ${month}, and a year has twelve` }
  }
  const last = daysInMonth(y, m)
  if (d < 1 || d > last) {
    return { date: null, reason: `"${value}" is not a real calendar date — ${year}-${month} has ${last} days` }
  }

  return { date: value, reason: null }
}

/* ------------------------------------------- ADR2 and ADR3, per document */

/** The ADR's `decision-status` when it is a string at all; the enum is ADR1's. */
export function decisionStatus(entity: Entity): string | null {
  const value = (entity.frontmatter as Record<string, unknown>)['decision-status']
  return typeof value === 'string' ? value : null
}

/**
 * ADR2 and ADR3 — the two frontmatter rules that carry their own error class.
 *
 * `deciders` is judged only when it is absent or an empty list. A `deciders:`
 * that is a string, or a list with a blank entry, is a *shape* error and stays
 * `E_FM_SCHEMA`'s: this class means "nobody is recorded as having made this
 * call", and saying that about a field whose type is wrong would report the
 * same defect twice under two codes.
 *
 * The trigger set is `accepted` and `rejected`, exactly as ADR3 and the error
 * class table both write it — **not** `superseded`. A superseded ADR was
 * accepted once and will normally carry the deciders it was accepted with, but
 * demanding them retroactively is a rule the kind document does not state.
 */
export function adrFrontmatterIssues(frontmatter: Record<string, unknown>): AdrIssue[] {
  const issues: AdrIssue[] = []

  const { reason } = normalizeAdrDate(frontmatter.date)
  if (reason !== null) {
    issues.push({ code: 'E_ADR_DATE', severity: 'error', message: `date ${reason}` })
  }

  const status = frontmatter['decision-status']
  const deciders = frontmatter.deciders
  const empty = deciders === undefined || deciders === null || (Array.isArray(deciders) && deciders.length === 0)
  if (typeof status === 'string' && DECIDED.includes(status) && empty) {
    issues.push({
      code: 'E_ADR_DECIDERS',
      severity: 'error',
      message: `decision-status is "${status}" and deciders is ${deciders === undefined ? 'absent' : 'empty'} — a decision that was taken has people accountable for it`,
    })
  }

  return issues
}

/* ------------------------------------------------- ADR4 — the body template */

/**
 * ADR4 — the four canonical sections, present, at level 2, spelled exactly.
 *
 * One finding per missing section rather than one per document: each of the four
 * is a separate thing the format exists to make somebody write, and a report
 * that says "sections are wrong" sends the author back to the kind document
 * while a report that says "Alternatives considered is missing, but there is a
 * level-3 heading with that text on line 24" is a fix.
 *
 * Duplicates are deliberately not a finding. The kind document enforces presence
 * — "a missing heading, a wrong level, or altered text" — and says nothing about
 * a section appearing twice, so refusing it would be this module legislating.
 */
export function adrSectionIssues(body: string): AdrIssue[] {
  const found = headings(body)
  const present = new Set(found.filter((heading) => heading.level === 2).map((heading) => heading.text))

  return ADR_SECTIONS.filter((section) => !present.has(section)).map((section) => {
    // The near miss is what an author actually did: `### Alternatives
    // considered`, or `## Alternatives Considered`. Naming it turns a rule
    // restatement into a one-character diff.
    const near = found.find(
      (heading) => heading.text.toLowerCase().replace(/\s+/g, ' ') === section.toLowerCase() && heading.text !== section,
    )
    const nearLevel = found.find((heading) => heading.text === section && heading.level !== 2)
    const hint = nearLevel
      ? ` — body line ${nearLevel.line + 1} has it at level ${nearLevel.level}, and the four sections are level 2`
      : near
        ? ` — body line ${near.line + 1} spells it "${near.text}"`
        : ''
    return {
      code: 'E_ADR_SECTIONS',
      severity: 'error' as const,
      message: `body has no "## ${section}" section${hint}`,
    }
  })
}

/* -------------------------------------------------------------------- joins */

/**
 * Every ADR rule the portal can enforce, over a resolved catalog.
 *
 * Pure: the entity graph is the only input. No filesystem, no registry, no git —
 * so it composes exactly like `artifactDiagnostics` in lib/catalog/index.ts.
 */
export function adrDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const adrs = [...catalog.entities.values()].filter((entity) => entity.kind === 'adr')

  for (const adr of adrs) {
    const at = (issue: AdrIssue) =>
      diagnostics.push({ ...issue, path: `${adr.relDir}/index.md`, srn: adr.srn })

    for (const issue of adrFrontmatterIssues(adr.frontmatter as Record<string, unknown>)) at(issue)
    for (const issue of adrSectionIssues(adr.body)) at(issue)
    for (const issue of supersessionIssues(catalog, adr)) at(issue)
  }

  diagnostics.push(...ordinalDiagnostics(adrs))
  return diagnostics
}

/**
 * ADR6 — supersession bookkeeping, both directions, both `W_ADR_SUPERSESSION`.
 *
 * The edge is authored once, on the successor, and the inverse is derived; these
 * two findings are what "derived" costs when the second step of the swap is
 * forgotten. Successors are read off the resolved inverse index, so a
 * `supersedes` that dangles or points at the wrong kind has already been refused
 * as `E_SRN_DANGLING` or `E_FM_EDGE_TARGET` and cannot silently satisfy this
 * rule — which matters, because both halves are checks on an *absence*.
 *
 * The second half fires on one state the kind document itself creates: between
 * step 1 (write the successor, `decision-status: proposed`, with the edge) and
 * step 2 (accept it, and mark the predecessor superseded), the predecessor is
 * legitimately a target that does not say so. The rule is stated flatly and the
 * severity is already the mild one, so the message names the successor's
 * standing instead — a reader seeing "superseded by … (proposed)" can tell a
 * decision in flight from a bump nobody made.
 */
function supersessionIssues(catalog: Catalog, adr: Entity): AdrIssue[] {
  const successors = (catalog.inbound.get(adr.srn) ?? [])
    .filter((edge) => edge.edge === 'supersedes')
    .map((edge) => catalog.entities.get(edge.from))
    .filter((entity): entity is Entity => entity?.kind === 'adr')

  const status = decisionStatus(adr)

  if (status === 'superseded' && successors.length === 0) {
    return [
      {
        code: 'W_ADR_SUPERSESSION',
        severity: 'warning',
        message:
          'decision-status is "superseded" and no ADR supersedes it — the successor authors the "supersedes" edge, and without it this decision has no replacement on record',
      },
    ]
  }

  if (status !== 'superseded' && successors.length > 0) {
    const named = successors.map((entity) => `${entity.srn} (${decisionStatus(entity) ?? 'no decision-status'})`)
    return [
      {
        code: 'W_ADR_SUPERSESSION',
        severity: 'warning',
        message: `superseded by ${named.join(', ')} but its own decision-status is "${status ?? 'absent'}" — step 2 of the swap moves the predecessor to "superseded" and bumps its version`,
      },
    ]
  }

  return []
}

/**
 * ADR7 — one ordinal, one ADR, per bucket.
 *
 * The bucket is the owning container, which is exactly `parent`: an `adr/`
 * bucket belongs to one solution, product or component, and the kind document is
 * explicit that ordinals are per bucket and never per solution — `acme/adr/0001`
 * and `acme/product/shop/adr/0001` are two different ADR-0001s and the SRN
 * already tells them apart.
 *
 * Compared as **numbers**, so `0001` and `001` collide: they are the same
 * ordinal written two ways, and the human shorthand "ADR-1 of the shop" cannot
 * tell them apart either. A name with no ordinal prefix at all is skipped rather
 * than flagged — the four-digit prefix is a SHOULD in the kind document and the
 * spec assigns no class to omitting it, so refusing it here would be a rule this
 * module invented.
 *
 * The finding lands on the **later** ADR in name order and names the earlier
 * one, so a bucket with a collision produces one finding per surplus ADR rather
 * than one per participant.
 */
function ordinalDiagnostics(adrs: Entity[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const buckets = new Map<string, Entity[]>()

  for (const adr of adrs) {
    const bucket = adr.parent ?? '(orphan)'
    const list = buckets.get(bucket) ?? []
    list.push(adr)
    buckets.set(bucket, list)
  }

  for (const bucket of buckets.values()) {
    const claimed = new Map<number, Entity>()
    for (const adr of [...bucket].sort((a, b) => (a.parsed.name ?? '').localeCompare(b.parsed.name ?? ''))) {
      const match = (adr.parsed.name ?? '').match(ORDINAL)
      if (!match) continue
      const ordinal = Number(match[1])
      const first = claimed.get(ordinal)
      if (first) {
        diagnostics.push({
          code: 'W_ADR_ORDINAL',
          severity: 'warning',
          message: `ordinal ${match[1]} is already taken by ${first.parsed.name} in this bucket — ordinals are per bucket, are never reused, and are the shorthand a reader cites`,
          path: `${adr.relDir}/index.md`,
          srn: adr.srn,
        })
        continue
      }
      claimed.set(ordinal, adr)
    }
  }

  return diagnostics
}
