/**
 * The two facts a body check needs before it can read a document: which lines
 * are prose, and where the headings are.
 *
 * `lib/catalog/load.ts` already carries two private copies of the fence toggle —
 * `hasLevelOneHeading` and `linkableProse` — and both exist for the reason this
 * one does: the spec, its ADRs and half the requirements in this catalog quote
 * markdown *as an example*, and an example heading is not a heading. The two
 * kind checks that read a body (kinds/adr.md's four sections, and
 * kinds/requirement.md's acceptance criteria) would each have needed a third and
 * fourth copy, so they share this one instead.
 *
 * Deliberately not a markdown parser. It answers exactly the questions the two
 * enforced templates ask — "is this line inside a fence" and "what ATX headings
 * does this body have" — and nothing else, because a real parser here would put
 * a dependency and a syntax tree behind a check whose whole surface is two
 * regular expressions.
 */

export interface BodyLine {
  text: string
  /**
   * Inside a fenced code block, the fence lines themselves included. A
   * `## Context` in an example block is code, and so is the ``` that opened it.
   */
  fenced: boolean
}

export interface Heading {
  /** 0-based index into the body's lines — a heading's address for a message. */
  line: number
  /** 1–6, from the number of leading `#`. */
  level: number
  /** Heading text, trimmed, with any closing `###` sequence removed. */
  text: string
}

/**
 * Any indentation, not CommonMark's 0–3: a fence nested inside a list item sits
 * deeper, and its contents are still code. This matches `linkableProse`, which
 * makes the same call for the same reason.
 */
const FENCE = /^\s*(`{3,}|~{3,})(.*)$/

/** ATX only, 0–3 spaces of indentation, `#` followed by space or end of line. */
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/

/** A closing ATX sequence: `## Foo ##` names the section `Foo`. */
const CLOSING = /[ \t]+#+$/

/**
 * Split a body into lines, each marked prose or code.
 *
 * The fence state tracks the marker **character and length** rather than
 * toggling on any run of three: a ``` block quoted inside a ~~~ block is the
 * ordinary way to show a fenced example, and a plain toggle reads the inner
 * fence as the end of the outer one — which silently turns the rest of the
 * document into code and makes every check downstream of it stop firing. An
 * unclosed fence runs to the end of the body, as CommonMark says it does.
 */
export function bodyLines(body: string): BodyLine[] {
  const lines: BodyLine[] = []
  let open: string | null = null

  for (const text of body.split('\n')) {
    const fence = text.match(FENCE)
    if (fence) {
      const marker = fence[1]
      if (open === null) {
        open = marker
        lines.push({ text, fenced: true })
        continue
      }
      // A closing fence is the same character, at least as long, and carries no
      // info string.
      if (marker[0] === open[0] && marker.length >= open.length && fence[2].trim() === '') {
        open = null
        lines.push({ text, fenced: true })
        continue
      }
    }
    lines.push({ text, fenced: open !== null })
  }

  return lines
}

/**
 * Every ATX heading in a body, in document order, skipping fenced blocks.
 *
 * Takes either the raw body or the lines {@link bodyLines} already produced, so
 * a caller that needs both — the acceptance-criteria parser needs the headings
 * *and* the fence state of the lines between two of them — scans once. The
 * `line` on each heading indexes that same array either way.
 *
 * Setext headings (`Context` underlined with `===` or `---`) are not recognised,
 * and that is the safe direction: `---` under a paragraph is a setext h2 to
 * CommonMark and a thematic break to most authors, so reading it as a heading
 * would invent section boundaries in bodies that have none. Both enforced
 * templates pin the `##` spelling, so a setext section is a missing section —
 * which is what these checks then report.
 */
export function headings(source: string | BodyLine[]): Heading[] {
  const found: Heading[] = []
  const lines = typeof source === 'string' ? bodyLines(source) : source
  lines.forEach((line, index) => {
    if (line.fenced) return
    const match = line.text.match(ATX)
    if (!match) return
    const text = (match[2] ?? '').replace(CLOSING, '').trim()
    found.push({ line: index, level: match[1].length, text })
  })
  return found
}
