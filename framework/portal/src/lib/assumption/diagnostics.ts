import type { Catalog, Diagnostic } from '../catalog/types'
import { headings } from '../markdown/body'

/**
 * Every assumption rule the portal can enforce, over a resolved catalog
 * (kinds/assumption.md, A2–A3 and A6–A8).
 *
 * Pure: the entity graph is the only input — no filesystem, no registry, no
 * git — so it composes exactly like `adrDiagnostics` beside it.
 *
 * A1, A4 and A5 are not here: `standing`'s enum is `KIND_FRONTMATTER`'s job
 * (`E_FM_SCHEMA`) and the edge's legal source and target are the edge table's
 * (`E_FM_EDGE_SOURCE`, `E_FM_EDGE_TARGET`). A rule enforced twice is a rule
 * that can disagree with itself.
 */

/** The two sections kinds/assumption.md pins, in the order it writes them. */
export const ASSUMPTION_SECTIONS = ['Basis', 'If this is false'] as const

/** A live belief can go stale; a resolved one has already been answered. */
const LIVE = new Set(['unverified', 'holding'])

/**
 * ISO-8601 calendar date, and a real one. `2026-13-01` matches the shape and is
 * not a date, so the parse has to agree with the digits — `Date.parse` accepts
 * the shape and then rolls over, which is how "31 February" becomes March.
 */
function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/**
 * The dependents of one assumption, from the loader's own inverse index.
 *
 * `catalog.inbound` is already the reverse index this kind exists to query, keyed
 * by resolved SRN. Rebuilding it here from raw frontmatter was the first draft
 * and it was wrong twice over: it duplicated a derivation the loader owns, and
 * it compared an authored reference — which may be relative, `/assumption/x` —
 * against a canonical SRN, so every relative edge read as absent and every
 * assumption looked orphaned.
 */
const dependents = (catalog: Catalog, srn: string): string[] =>
  (catalog.inbound.get(srn) ?? []).filter((edge) => edge.edge === 'assumes').map((edge) => edge.from)

export function assumptionDiagnostics(catalog: Catalog, today = new Date()): Diagnostic[] {
  const out: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'assumption') continue
    const fm = entity.frontmatter as unknown as Record<string, unknown>
    const path = `${entity.relDir}/index.md`
    const at = (code: string, severity: 'error' | 'warning', message: string) =>
      out.push({ code, severity, message, path, srn: entity.srn })

    // A2 — the date must be readable, or nothing downstream can be trusted.
    if (!isCalendarDate(fm['review-by'])) {
      at('E_ASM_REVIEW_DATE', 'error', `review-by is not an ISO-8601 calendar date (YYYY-MM-DD)`)
    } else if (LIVE.has(String(fm.standing)) && new Date(`${fm['review-by']}T00:00:00Z`) < today) {
      // A7 — only a live belief can be stale.
      at('W_ASM_STALE', 'warning', `review-by ${fm['review-by']} has passed and standing is still "${fm.standing}"`)
    }

    // A3 — the pinned sections. The near miss is named, because a wrong level is
    // a one-character fix and "sections are wrong" is a trip to the spec.
    const found = headings(entity.body)
    const present = new Set(found.filter((h) => h.level === 2).map((h) => h.text))
    for (const section of ASSUMPTION_SECTIONS) {
      if (present.has(section)) continue
      const wrongLevel = found.find((h) => h.text === section && h.level !== 2)
      const hint = wrongLevel
        ? ` — body line ${wrongLevel.line + 1} has it at level ${wrongLevel.level}, and both sections are level 2`
        : ''
      at('E_ASM_SECTIONS', 'error', `body has no "## ${section}" section${hint}`)
    }

    // A8 — a belief nothing rests on is dead weight or an unwired edge, and only
    // a reader can say which, so it is a warning.
    const rests = dependents(catalog, entity.srn)
    if (rests.length === 0) {
      at('W_ASM_ORPHAN', 'warning', 'nothing assumes this — either it is unused, or an edge was never authored')
    }

    // A6 — the reverse index, reported. Raised against the DEPENDENT: it is the
    // entity that has to act, and the one whose page a reader is likely on.
    if (fm.standing === 'broken') {
      for (const from of rests) {
        const dependent = catalog.entities.get(from)
        out.push({
          code: 'W_ASM_BROKEN_DEPENDENT',
          severity: 'warning',
          message: `assumes ${entity.srn}, whose standing is "broken" — this entity rests on a belief known to be false`,
          path: dependent ? `${dependent.relDir}/index.md` : from,
          srn: from,
        })
      }
    }
  }
  return out
}
