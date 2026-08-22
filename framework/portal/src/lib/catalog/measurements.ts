import type { Catalog, Diagnostic, Entity } from './types'

/**
 * ADR 0018, "Measured facts are derived, or they are dated", as an executable
 * copy of the one clause of it a machine can decide.
 *
 * A **measured fact** is a number an author obtained by running a command
 * against a repository and then typed into a paragraph — `wc -l`,
 * `git rev-list --count`, a test runner's tally. The test the record sets is
 * that the command can be written down. It is emphatically not an SLO, a
 * target, a design constant or a domain figure: `99.9%` on an environment and
 * `four characters` on a coupon code are *decisions*, and a decision does not go
 * stale on somebody else's commit.
 *
 * The record's own census is the reason this module exists. Sixty-five resolved
 * claims in the catalog were checked against the commit they were written at and
 * **71% were already false**, every one of them typed by a careful author inside
 * three calendar days. Three quantities carried two contradictory authored
 * values in entities that did not know about each other.
 *
 * ## What is decidable, and what is deliberately not attempted
 *
 * The record priced enforcement and named the hard part: "a prose scanner that
 * must decide which digit in an English sentence was a claim". That scanner does
 * not exist here and this module does not pretend to be it. What it implements
 * is the one shape the record itself calls **mechanically unambiguous** — a
 * backticked path followed by a count, `` `polar.ts` (300 lines) `` — widened by
 * exactly one principled step: {@link ALWAYS_MEASURED} units, whose nouns are
 * produced by a command and by nothing else. Nobody sets a target in *lines* or
 * budgets a design in *commits*.
 *
 * Everything outside those two shapes is left alone on purpose. A bare digit
 * beside a countable noun — "three components", "nine kinds", "two-letter ISO
 * 3166-1 code" — is overwhelmingly a design statement in this catalog, and a
 * check that fired on it would report a hundred non-findings to catch a dozen
 * real ones. The cost of that trade is stated where an author will read it: this
 * catches the population that actually drifted, not every way to write a number.
 *
 * ## The two clauses, and why they are two codes
 *
 * The decision has a current-state half and an ADR half, and they are different
 * rules with different fixes:
 *
 * - `W_PROSE_MEASUREMENT` — a **current-state** entity states a measured
 *   quantity as a digit. The fix is editorial: keep the claim, drop the digit
 *   ("the single largest module in `src/lib`"), or let the portal derive it.
 * - `W_ADR_MEASUREMENT` — an **ADR** states one with nothing dating it. The fix
 *   is to anchor it: a calendar date, or better a commit, which is what keeps
 *   ADR 0013's `148 files, 10,768 insertions` exact forever while a working-tree
 *   measurement in the same bucket has already rotted.
 *
 * Both are warnings, and for the reason `W_ARTIFACT_DIALECT` is: an existing
 * catalog must be able to adopt the framework without its build turning red, and
 * a stale digit is a document that is wrong, not a document that is broken.
 */

/* -------------------------------------------------------------- vocabulary */

/**
 * Units that are a measurement wherever they appear, path or no path.
 *
 * Each is a noun only a command produces. There is no such thing as a target
 * expressed in lines, a budget expressed in commits, or a domain quantity
 * expressed in insertions — so a number in front of one of these was measured,
 * and the sentence carrying it goes stale on the next commit.
 */
const ALWAYS_MEASURED = ['line', 'commit', 'insertion', 'deletion'] as const

/**
 * Units that are a measurement only when the sentence names the file or
 * directory they were counted over.
 *
 * Every one of these doubles as an ordinary design noun — "three files", "two
 * entities", "the four tests we care about" — so the backticked path is what
 * separates `` `skills/_shared/references/` — ten markdown files `` from a
 * sentence about how many things a design has. The path is the evidence that a
 * command was run.
 */
const MEASURED_WITH_SUBJECT = [
  'file',
  'module',
  'document',
  'directory',
  'directories',
  'entity',
  'entities',
  'entry',
  'entries',
  // "6 instances of `config.yaml`" is `find … | wc -l` and nothing else. The
  // word does have a design sense — replica counts in a `topology.yaml` are
  // instances of a service — which is precisely why it needs the path: a
  // replica range is authored beside `component:`, never beside a filename.
  'instance',
  'test',
  'byte',
] as const

/** Byte-scale units, which are only ever the output of measuring something. */
const SIZE_UNITS = ['kB', 'KB', 'MB', 'GB', 'KiB', 'MiB'] as const

/**
 * Spelled-out counts.
 *
 * `one` is absent and its absence is load-bearing: "on one line", "one file at a
 * time" and "one entry per host" are ordinary English about structure, not
 * counts of anything, and admitting the word would make the check unusable. A
 * count of one also cannot drift in the way that matters — the claims this
 * record was opened over were 895, 3,562, 23,277.
 */
const NUMBER_WORDS = [
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
] as const

/**
 * A count: digits with optional thousands separators, or a spelled number.
 *
 * A spelled number is refused after "the", where it is almost always
 * anaphora rather than a census — "the window between **the two commits**",
 * "the three files named above". Digits are not refused there, because "of the
 * 3,440 lines under `src/components/diagrams/`" is a back-reference to a
 * measurement and is exactly as stale as the measurement it points at.
 */
const COUNT = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+|(?<!the )(?:${NUMBER_WORDS.join('|')}))`

/**
 * What may not sit immediately before a count.
 *
 * A dot rules out the middle and tail of a dotted version, which is the one
 * non-measurement that reads exactly like a count of something: "an AsyncAPI
 * 3.1.0 document" ends in `0 document` and means nothing of the kind. The
 * record's own census stripped "dates and semantic versions" before counting for
 * the same reason. A word character rules out the tail of an identifier.
 */
const NOT_A_COUNT_START = String.raw`(?<![\w.])`

/**
 * A cap is a decision, and it is spelled in front of the number.
 *
 * "the version→commit index reads **at most** 200 commits" is a design constant
 * that happens to be denominated in a unit only a command produces — the one
 * shape that defeats {@link ALWAYS_MEASURED}'s reasoning. The phrases below are
 * what a limit reads like in English, and none of them can precede a census.
 */
const NOT_A_CAP = String.raw`(?<!at most )(?<!up to )(?<!no more than )(?<!the last )(?<!the first )`

/** Plural or singular, so `1 line` and `300 lines` are both a count of lines. */
const plural = (units: readonly string[]) => units.map((unit) => `${unit}s?`).join('|')

/**
 * The hyphenated adjectival form is deliberately NOT read as a count.
 *
 * "a 376-line test" is the same measurement as "376 lines" and rots at the same
 * rate — but the form is also where the catalog's *hypotheticals* live: "a
 * 200-line schema with four `$ref`s", "a two-line `note`", "a three-line CI
 * step". Those describe an illustration or an estimate, not something anybody
 * counted, and asking authors to strip the number out of an example would make
 * the prose worse for no drift avoided. Precision is worth more here than
 * recall, so the adjectival form is left to the author's discipline and the rule
 * in `framework/spec/structure.md` covers it whether or not this module does.
 */
const JOIN = String.raw`\s*`

/**
 * Where a measurement may sit relative to its subject.
 *
 * Both orders occur in the catalog — "`polar.ts` (300 lines)" and "9,832 lines
 * of `framework/spec/`" — and the window is short and may not cross another
 * backtick, so a path three clauses away is never adopted as a subject.
 *
 * It may not cross a double quote either. A quotation is somebody else's
 * sentence, and the path in front of it is the document being quoted rather than
 * the thing a count was taken over: "`index.md` fixes the direction: \"Where two
 * documents appear to disagree…\"" names a precedence rule, not two files.
 */
const NEAR = String.raw`[^\n\`"]{0,64}?`

/**
 * A backticked span that names a file or a directory.
 *
 * Either it contains a `/`, or it ends in a short lowercase extension. That is
 * narrow on purpose: `` `status` `` and `` `higher-is-better` `` are field names
 * and values, not paths, and a check that read them as evidence of measurement
 * would fire on most of the catalog.
 */
const PATH = String.raw`\`[^\`\n]*?(?:/[^\`\n]*|\.[a-z]{1,5})\``

const START = String.raw`${NOT_A_COUNT_START}${NOT_A_CAP}`
const QUANTITY_ALWAYS = String.raw`${START}(${COUNT})${JOIN}(${plural(ALWAYS_MEASURED)})\b`
const QUANTITY_ANY = String.raw`${START}(${COUNT})${JOIN}(${plural([...ALWAYS_MEASURED, ...MEASURED_WITH_SUBJECT])}|${SIZE_UNITS.join('|')})\b`

/**
 * `path … count unit` — the subject leads.
 *
 * Every unit, not only the ones that *need* a subject: a line count beside a
 * path is still a line count, and reporting `` `git.ts`, 1,178 lines `` reads
 * better than reporting `1,178 lines` with the file left out of the sentence.
 * The two passes cannot double-report, because a site is keyed on where its
 * count sits, and both find the same count.
 */
const SUBJECT_FIRST = new RegExp(String.raw`(${PATH})${NEAR}${QUANTITY_ANY}`, 'g')
/** `count unit … path` — the quantity leads. */
const SUBJECT_LAST = new RegExp(String.raw`${QUANTITY_ANY}${NEAR}(${PATH})`, 'g')
/** A unit that needs no subject at all. */
const UNANCHORED = new RegExp(QUANTITY_ALWAYS, 'g')

/* ------------------------------------------------------------------- model */

export interface Measurement {
  /** The claim as authored, whitespace collapsed — what a reader has to find. */
  text: string
  /** The count exactly as written: `1,178`, `300`, `twelve`. */
  count: string
  /** The unit noun that makes it a measurement. */
  unit: string
  /** The backticked path the count was taken over, when the sentence names one. */
  subject: string | null
  /** 1-based line within the entity body. */
  line: number
}

/* ---------------------------------------------------------------- scanning */

/**
 * The body as scannable lines, with fenced blocks blanked rather than removed.
 *
 * Blanked, because a line number that does not survive the strip is a finding an
 * author cannot locate. Fences are skipped for the reason `checkProseArtifacts`
 * skips them: this repository's own spec quotes bad examples inside fences to
 * argue about them, and an example is not a claim. Inline code spans are
 * deliberately **kept** — the path inside one is the evidence.
 */
function scannableLines(body: string): string[] {
  let fenced = false
  return body.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced
      return ''
    }
    return fenced ? '' : line
  })
}

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * Every measured quantity in one entity body.
 *
 * Scanned per line. A measurement that a hard wrap has split across two lines is
 * missed, and that is the accepted floor of a check whose whole value is a
 * near-zero false-positive rate: joining paragraphs first would let a path in
 * one sentence be adopted as the subject of a count in the next.
 *
 * A site found by more than one pattern is reported once, keyed on where the
 * count sits, so `` `git.ts`, 1,178 lines `` is one finding and not two.
 */
export function findMeasurements(body: string): Measurement[] {
  const found: Measurement[] = []

  scannableLines(body).forEach((line, index) => {
    const seen = new Set<number>()

    const record = (at: number, text: string, count: string, unit: string, subject: string | null) => {
      if (seen.has(at)) return
      seen.add(at)
      found.push({ text: collapse(text), count, unit, subject, line: index + 1 })
    }

    for (const match of line.matchAll(SUBJECT_FIRST)) {
      const at = match.index + match[0].lastIndexOf(match[2])
      record(at, match[0], match[2], match[3], match[1])
    }
    for (const match of line.matchAll(SUBJECT_LAST)) {
      record(match.index, match[0], match[1], match[2], match[3])
    }
    for (const match of line.matchAll(UNANCHORED)) {
      record(match.index, match[0], match[1], match[2], null)
    }
  })

  return found.sort((a, b) => a.line - b.line || a.text.localeCompare(b.text))
}

/* ------------------------------------------------------------------ anchors */

/**
 * A date, or a commit-ish in backticks — the two things that turn a measurement
 * into evidence instead of a claim about now.
 *
 * The commit form is the stronger of the two and the record says why: a
 * measurement of a commit cannot drift, while a measurement of a working tree
 * always does. `git ls-tree -r 8e7a16c` still answers in 2030.
 */
const ANCHOR = /\b\d{4}-\d{2}-\d{2}\b|`[0-9a-f]{7,40}`/

/**
 * Which lines of an ADR body sit under an anchor.
 *
 * Scope is the **section** — a heading of any level and everything under it
 * until the next heading — rather than the paragraph. That is how the ADRs that
 * get this right actually read: one sentence, or the heading itself, states the
 * commit every number in the section was taken at ("The census, counted at
 * commit `8e7a16c`"), and the rows below it then carry bare digits. Demanding
 * the date beside every digit would ask authors to restate it in every table
 * cell, which is both unreadable and a fresh way to disagree with yourself.
 *
 * Anything before the first heading is its own scope, so an ADR that dates its
 * numbers in the opening paragraph is covered too.
 */
function anchoredLines(body: string): Set<number> {
  const lines = scannableLines(body)
  const anchored = new Set<number>()

  let start = 0
  const close = (end: number) => {
    if (lines.slice(start, end).some((line) => ANCHOR.test(line))) {
      for (let at = start; at < end; at += 1) anchored.add(at + 1)
    }
  }

  lines.forEach((line, index) => {
    if (!/^#{1,6}\s/.test(line)) return
    close(index)
    start = index
  })
  close(lines.length)

  return anchored
}

/* -------------------------------------------------------------- diagnostics */

/** How a finding names the claim it found, short enough to sit on one line. */
function quote(measurement: Measurement): string {
  const text = measurement.text
  return text.length <= 72 ? text : `${text.slice(0, 69)}…`
}

function checkEntity(entity: Entity): Diagnostic[] {
  const measurements = findMeasurements(entity.body)
  if (measurements.length === 0) return []

  const path = `${entity.relDir}/index.md`

  // The ADR bucket is the framework's only append-only chronological record, so
  // a number in one is dated evidence for a decision taken on a date. Every
  // other kind is a current-state description, and a number in one is a claim
  // about now that nothing keeps true.
  if (entity.kind === 'adr') {
    const anchored = anchoredLines(entity.body)
    return measurements
      .filter((measurement) => !anchored.has(measurement.line))
      .map((measurement) => ({
        code: 'W_ADR_MEASUREMENT',
        severity: 'warning' as const,
        message:
          `line ${measurement.line}: "${quote(measurement)}" states a measured quantity with nothing dating it — ` +
          'an ADR may author a measured number, and MUST say when it was measured. Name the commit it was taken at, ' +
          'in this section or its heading; a measurement of a commit never drifts',
        path,
        srn: entity.srn,
      }))
  }

  return measurements.map((measurement) => ({
    code: 'W_PROSE_MEASUREMENT',
    severity: 'warning' as const,
    message:
      `line ${measurement.line}: "${quote(measurement)}" is a measured quantity in a current-state description — ` +
      'it was true when it was typed and nothing keeps it true. State the claim without the digit ' +
      '("the largest module in `src/lib`"), or let the portal derive it. Only an ADR authors a measured number',
    path,
    srn: entity.srn,
  }))
}

/**
 * Every measured fact the catalog states in prose, judged by which bucket states
 * it.
 *
 * Total over the catalog and answerable from one entity at a time, which is why
 * it is its own fold rather than a passenger on the kind checks: it needs no
 * second entity, no directory listing and no schema registry, and it applies to
 * every kind there is.
 */
export function measurementDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const entity of catalog.entities.values()) diagnostics.push(...checkEntity(entity))
  return diagnostics
}
