import type { Catalog, Diagnostic, Entity } from '../catalog/types'
import { bodyLines, headings } from '../markdown/body'

/**
 * The requirement kind — framework/spec/kinds/requirement.md — for the three
 * rules the portal defined and never checked.
 *
 * REQ1–REQ3 and REQ6 are the frontmatter schema's and were already enforced.
 * `E_REQ_CRITERIA`, `W_REQ_UNIMPLEMENTED` and `W_REQ_WONT_IMPLEMENTED` were not:
 * the debt register's entry for the last two read "the inbound `implements`
 * index exists; nothing reads it", which is the whole traceability graph the
 * kind exists for, derived and then never asked a question.
 *
 * Two layers, split where the kind document splits them:
 *
 * - **REQ4 and REQ5** are a body parse — {@link parseAcceptanceCriteria}, pure
 *   over one document. It returns the criteria as well as the findings, because
 *   the kind document promises the same list as a rendered checklist and a
 *   second reader of the same pinned shape would be a second thing to drift.
 * - **REQ7 and REQ8** are one join each against the derived inverse of
 *   `implements`, and live in {@link requirementDiagnostics}.
 */

/* ------------------------------------------------------------------- model */

export interface ReqIssue {
  /** Always `E_REQ_CRITERIA`: the kind document gives the section one class. */
  code: 'E_REQ_CRITERIA'
  severity: 'error'
  message: string
}

export interface Criterion {
  /** The criterion — the item's first line, bullet removed, as authored. */
  text: string
  /** 0-based line of the item within the body. */
  line: number
  /** Everything nested beneath it, verbatim: Given/When/Then, a table, code. */
  detail: string[]
}

export interface AcceptanceCriteria {
  criteria: Criterion[]
  issues: ReqIssue[]
}

/** The pinned heading, at level 2, with this casing. REQ4 is these two facts. */
export const CRITERIA_HEADING = 'Acceptance criteria'

/**
 * REQ5's cap, and it is on the item's **first physical line** — "each item's
 * first line is one criterion, ≤ 200 characters", read literally.
 *
 * The other available reading is the item's first *paragraph*, lazy
 * continuation lines folded in, and it was measured before being rejected: over
 * the shipped catalogs it fires on **roughly one criterion in ten**, because
 * every markdown file here is wrapped at roughly eighty columns and a two-line
 * criterion is the norm. At commit `8e7a16c` that was 28 of 254 criteria, in
 * eleven requirements across two of the three solutions — a commit rather than
 * "now", so the figure stays checkable (`git ls-tree -r 8e7a16c solutions`, then
 * this parser, folding each criterion's `detail` up to the first blank line,
 * bullet or fence). A check that fails a tenth of legal, idiomatic content is a
 * wrong check.
 *
 * The literal reading is not toothless either, which is what makes it the right
 * one: in a repository that wraps its prose, the only way to produce the
 * violation the kind document names — "a 600-character paragraph as a single
 * bullet" — is to put the paragraph on one line, and that is exactly what this
 * catches. It caught one the first time it ran, at `8e7a16c`: a 701-character
 * bullet in `metaframework/product/portal/requirement/green-test-suite`, since
 * rewritten. Nothing in the tree violates it now, which is the outcome a check
 * is for and not evidence that it is idle.
 */
export const CRITERION_MAX = 200

/** A top-level bullet. `*` and `+` are CommonMark's other two unordered markers. */
const BULLET = /^(\s{0,3})([-*+])([ \t]+)(.*)$/
/** Any bullet, at any depth, so nesting can be told from a new item. */
const ANY_BULLET = /^(\s*)([-*+])[ \t]+/
/** `- [ ]` / `- [x]`, measured after the marker has been stripped. */
const TASK = /^\[[ xX]\]\s/

const issue = (message: string): ReqIssue => ({ code: 'E_REQ_CRITERIA', severity: 'error', message })

/**
 * The acceptance-criteria section: its items, and every way it is malformed.
 *
 * The parse stops at the first structural failure — no heading, two headings, or
 * a section that does not open with a list — because everything after it is a
 * guess about what the author meant. Once the shape holds, all the per-item
 * rules are reported together: an author fixing a 600-character bullet wants to
 * be told about the other one in the same pass.
 */
export function parseAcceptanceCriteria(body: string): AcceptanceCriteria {
  const lines = bodyLines(body)
  const found = headings(lines)
  const pinned = found.filter((heading) => heading.level === 2 && heading.text === CRITERIA_HEADING)

  if (pinned.length === 0) {
    // The near miss again: `## Acceptance Criteria` and `### Acceptance
    // criteria` are the two ways this is got wrong, and both are one keystroke
    // from right.
    const near = found.find((heading) => heading.text.toLowerCase() === CRITERIA_HEADING.toLowerCase())
    const hint = near
      ? ` — body line ${near.line + 1} has "${'#'.repeat(near.level)} ${near.text}"`
      : ' — a requirement whose criteria cannot be found is a requirement nobody can verify'
    return { criteria: [], issues: [issue(`no "## ${CRITERIA_HEADING}" section${hint}`)] }
  }

  if (pinned.length > 1) {
    const at = pinned.map((heading) => `body line ${heading.line + 1}`).join(', ')
    return {
      criteria: [],
      issues: [
        issue(
          `"## ${CRITERIA_HEADING}" appears ${pinned.length} times (${at}) — the heading is a stable address and there is one set of criteria`,
        ),
      ],
    }
  }

  const start = pinned[0].line
  const end = found.find((heading) => heading.line > start)?.line ?? lines.length
  const section = lines.slice(start + 1, end)

  const openerIndex = section.findIndex((line) => line.text.trim() !== '')
  if (openerIndex === -1) {
    return { criteria: [], issues: [issue(`"## ${CRITERIA_HEADING}" is empty — the list has at least one item`)] }
  }

  // The opener is judged as authored, fenced or not: a section that starts with
  // a code block starts with a code block, and the rule is that the content
  // *begins* with the list, before any other heading and before anything else.
  const opener = section[openerIndex]
  const first = opener.text.match(BULLET)
  if (!first || opener.fenced) {
    return {
      criteria: [],
      issues: [
        issue(
          `"## ${CRITERIA_HEADING}" does not open with an unordered list — body line ${start + openerIndex + 2} is ${openerShape(opener.text)}`,
        ),
      ],
    }
  }

  // The first bullet fixes what "top level" means for the rest of the section.
  // CommonMark decides nesting by the parent item's content column, so a fixed
  // 0–3 test would read `  - detail` under `- item` as a second criterion.
  const baseIndent = first[1].length
  const criteria: Criterion[] = []

  for (let index = openerIndex; index < section.length; index++) {
    const line = section[index]
    const bullet = line.fenced ? null : line.text.match(ANY_BULLET)
    if (bullet && bullet[1].length === baseIndent) {
      criteria.push({ text: line.text.match(BULLET)?.[4] ?? '', line: start + 1 + index, detail: [] })
      continue
    }
    // Everything else — nested items, lazy continuation, a fenced block — is the
    // current criterion's detail, which the kind document leaves free.
    criteria[criteria.length - 1]?.detail.push(line.text)
  }

  const issues: ReqIssue[] = []
  for (const criterion of criteria) {
    // The blank line before the next item or the next heading belongs to
    // neither; a renderer handed it would show an empty paragraph of detail.
    while (criterion.detail.at(-1)?.trim() === '') criterion.detail.pop()

    if (TASK.test(criterion.text)) {
      issues.push(
        issue(
          `body line ${criterion.line + 1} uses task-list syntax — completion is not catalog data; whether an obligation is claimed is the incoming "implements" edges`,
        ),
      )
      continue
    }
    if (criterion.text.length > CRITERION_MAX) {
      issues.push(
        issue(
          `body line ${criterion.line + 1} is ${criterion.text.length} characters — one criterion is one line of at most ${CRITERION_MAX}; the argument for it belongs in nested detail or a section of its own`,
        ),
      )
    }
  }

  return { criteria, issues }
}

/** What the opener actually was, for a message that does not make the author guess. */
function openerShape(text: string): string {
  const trimmed = text.trim()
  if (/^\s*(```|~~~)/.test(text)) return 'a fenced code block'
  if (/^\s{0,3}\d+[.)]\s/.test(text)) return 'an ordered list'
  if (/^\s{0,3}>/.test(text)) return 'a block quote'
  if (/^\s{0,3}\|/.test(text)) return 'a table'
  if (ANY_BULLET.test(text)) return 'an indented list item, not a top-level one'
  return `prose ("${trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed}")`
}

/* -------------------------------------------------------------------- joins */

/** The MoSCoW value when it is a string at all; the enum itself is REQ2's. */
export function priority(entity: Entity): string | null {
  const value = (entity.frontmatter as Record<string, unknown>).priority
  return typeof value === 'string' ? value : null
}

/**
 * Every requirement rule the portal can enforce, over a resolved catalog.
 *
 * Pure: the entity graph is the only input — `catalog.inbound` already holds the
 * derived inverse of `implements`, and it holds only edges whose target resolved
 * and whose source kind may author them, so a dangling or illegal claim cannot
 * quietly satisfy REQ7. No filesystem, no registry, no git.
 */
export function requirementDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'requirement') continue
    const path = `${entity.relDir}/index.md`

    for (const found of parseAcceptanceCriteria(entity.body).issues) {
      diagnostics.push({ ...found, path, srn: entity.srn })
    }

    const implementers = (catalog.inbound.get(entity.srn) ?? []).filter((edge) => edge.edge === 'implements')
    const moscow = priority(entity)

    // REQ7. A warning, not an error, and the kind document says why: a `must`
    // written before anything implements it is the normal order of work. It is
    // also the number the solution dashboard leads with, so it is *meant* to
    // stand on a catalog that is otherwise clean — an unclaimed obligation is a
    // true statement about the system, not a defect in the description.
    //
    // No exemption for `status: deprecated`. A superseded requirement whose
    // implementers have all migrated is left holding `priority: must` and no
    // edges, and that state is worth the same look: either the priority is stale
    // or the migration is unfinished, and only the author knows which.
    if (moscow === 'must' && implementers.length === 0) {
      diagnostics.push({
        code: 'W_REQ_UNIMPLEMENTED',
        severity: 'warning',
        message: 'priority is "must" and no component or product implements it — an obligation the catalog states and nobody has claimed',
        path,
        srn: entity.srn,
      })
    }

    // REQ8, the inverse: the catalog claims to satisfy something it declared out
    // of scope. `wont` is a recorded non-goal rather than a deletion, so an
    // `implements` edge pointing at one is either a stale priority or a wrong
    // edge — both worth a human look, neither knowable from here.
    if (moscow === 'wont' && implementers.length > 0) {
      diagnostics.push({
        code: 'W_REQ_WONT_IMPLEMENTED',
        severity: 'warning',
        message: `priority is "wont" — a recorded non-goal — yet ${implementers.map((edge) => edge.from).join(', ')} claims to implement it`,
        path,
        srn: entity.srn,
      })
    }
  }

  return diagnostics
}
