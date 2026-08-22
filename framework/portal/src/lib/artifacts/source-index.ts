import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import type { SourceSpan } from './source-map'

/**
 * The document index — paths into an artifact ↔ the lines they were authored on.
 *
 * ## Why this is not in `./source-map`
 *
 * Because it is the only thing here that needs a YAML parser, and a YAML parser
 * is 99.8 KB. `artifact-block.tsx` is a `'use client'` module, so importing
 * `buildSourceIndex` from `./source-map` put the whole of `yaml` in the
 * first-load JS of every entity page — including the kinds that carry no YAML
 * artifact at all — while the editor beside it was already deferred. The file's
 * own header draws that distinction for Monaco (mount-laziness is not
 * import-laziness) and then did not apply it to this.
 *
 * So the index is reached the way `SourceView` is: by a dynamic `import()` at
 * the moment a block opens. It is genuinely needed in the browser — it is what
 * joins the caret to the drawing — but only once a block is open, which is
 * exactly when Monaco is loading anyway.
 *
 * `./source-map` keeps everything that is pure string work: the span type, the
 * positional-path grammar and the anchor lookup. Those stay statically imported,
 * because they cost nothing and the block needs them before it opens.
 *
 * ## Why YAML indexes JSON too
 *
 * `yaml`'s `parseDocument` keeps a character range on every node, and YAML 1.2
 * is a strict JSON superset — so the same pass indexes `states.json` and
 * `schema.json`. One mechanism, not one per format.
 */

export interface SourceIndex {
  /** Line span of the node at this path; null when the path is not present. */
  spanOf(path: readonly string[]): SourceSpan | null
  /** The deepest path whose node covers this 1-based line; null above them all. */
  pathAt(line: number): string[] | null
  /** Total lines in the source, so callers can clamp without re-splitting it. */
  lines: number
}

/** Map keys and sequence indices are joined by a character no path segment may hold. */
const SEPARATOR = '\0'

interface Entry {
  path: string[]
  startLine: number
  endLine: number
}

/**
 * Index one artifact's source.
 *
 * A malformed document is not an error here: `parseDocument` is fail-soft and
 * returns whatever it could build, so a file with one bad line still maps every
 * node above and below it. An index over a broken file is strictly better than
 * no index — the source pane is exactly where a broken file gets read.
 */
export function buildSourceIndex(source: string): SourceIndex {
  const starts = lineStarts(source)
  const entries: Entry[] = []
  const byPath = new Map<string, Entry>()

  const record = (path: string[], span: [number, number]) => {
    const startLine = lineOf(starts, span[0])
    // `range[1]` is the offset *after* the value, which for a block node sits at
    // the start of the following line; stepping back one character keeps the
    // span off a line the value does not occupy.
    const endLine = lineOf(starts, Math.max(span[0], span[1] - 1))
    const entry: Entry = { path, startLine, endLine }
    entries.push(entry)
    byPath.set(path.join(SEPARATOR), entry)
  }

  const visit = (node: unknown, path: string[], span: [number, number] | null) => {
    const own = span ?? rangeOf(node)
    if (own) record(path, own)

    if (isMap(node)) {
      for (const pair of node.items) {
        if (!isScalar(pair.key)) continue
        const key = String(pair.key.value)
        const keyRange = rangeOf(pair.key)
        const valueRange = rangeOf(pair.value)
        // The span of a mapping entry runs from its key to the end of its value:
        // highlighting `payload:` without the line it names reads as a bug.
        const pairSpan: [number, number] | null = keyRange
          ? [keyRange[0], valueRange ? valueRange[1] : keyRange[1]]
          : null
        visit(pair.value, [...path, key], pairSpan)
      }
      return
    }

    if (isSeq(node)) {
      node.items.forEach((item, index) => visit(item, [...path, String(index)], null))
    }
  }

  try {
    const document = parseDocument(source)
    if (document.contents) visit(document.contents, [], null)
  } catch {
    // parseDocument only throws on inputs it cannot even tokenise. An empty
    // index still lets the source render; nothing else depends on it.
  }

  // Deepest first, so `pathAt` can take the first hit rather than scan on.
  const ordered = [...entries].sort((a, b) => b.path.length - a.path.length)

  return {
    lines: starts.length,
    spanOf(path) {
      const entry = byPath.get(path.join(SEPARATOR))
      return entry ? { startLine: entry.startLine, endLine: entry.endLine } : null
    },
    pathAt(line) {
      for (const entry of ordered) {
        if (entry.path.length === 0) continue
        if (line >= entry.startLine && line <= entry.endLine) return entry.path
      }
      return null
    },
  }
}

function rangeOf(node: unknown): [number, number] | null {
  const range = (node as { range?: [number, number, number] } | null | undefined)?.range
  if (!range || typeof range[0] !== 'number' || typeof range[1] !== 'number') return null
  return [range[0], range[1]]
}

/** Character offset of the start of every line, so offsets convert in one lookup. */
function lineStarts(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) starts.push(index + 1)
  }
  return starts
}

function lineOf(starts: number[], offset: number): number {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (starts[mid] <= offset) low = mid
    else high = mid - 1
  }
  return low + 1
}
