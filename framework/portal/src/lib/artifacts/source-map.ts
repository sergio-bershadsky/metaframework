/**
 * Where a value lives in the file it was authored in.
 *
 * The diagrams on an entity page are projections of an artifact: a sequence
 * diagram *is* `workflows/place-order.yaml`, a state chart *is* `states.json`.
 * Until now nothing connected the two — the picture and its source were two
 * unrelated blocks on the page. Joining them needs one thing the parsers never
 * produced: the line range each element was authored on.
 *
 * The module is deliberately pure and format-agnostic: it maps *paths into the
 * document* to line spans, and knows nothing about workflows, state machines or
 * diagrams. `anchors.ts` owns that vocabulary.
 *
 * ## What is here and what is next door
 *
 * Everything in this file is string work with no dependencies: the span type,
 * the positional-path grammar, the anchor lookup, the line count. The pass that
 * actually reads the document — `buildSourceIndex`, and the 99.8 KB `yaml`
 * parser it needs — lives in `./source-index`, so a client module can have the
 * cheap half statically and reach the expensive half by `import()` when a block
 * opens. See that file for the measurement.
 */

/** A 1-based, inclusive line span — the unit Monaco decorations speak in. */
export interface SourceSpan {
  startLine: number
  endLine: number
}

/**
 * How many lines the source has.
 *
 * `SourceIndex.lines` says the same thing, but it costs a YAML parse to get to.
 * The artifact block sizes its source pane from the file's length on *every*
 * render, open or closed, so it needs the number before it is allowed to load a
 * parser. One scan, no allocation — `split('\n').length` would build the array
 * and throw it away.
 */
export function lineCount(source: string): number {
  let lines = 1
  for (let index = 0; index < source.length; index++) {
    if (source.charCodeAt(index) === 10) lines += 1
  }
  return lines
}

/* ------------------------------------------------------------------ paths */

/**
 * `steps[4].alt[0].steps[2]` → `['steps', '4', 'alt', '0', 'steps', '2']`.
 *
 * The positional step key is the protocol spec's own idea, not this portal's:
 * workflow steps carry no ids, so the spec addresses them by position and the
 * parser emits exactly this string. It is already the join key between a
 * diagram element and the YAML that produced it — nothing had to be invented.
 */
export function parsePositionalPath(path: string): string[] {
  const segments: string[] = []
  for (const match of path.matchAll(/\[(\d+)\]|([^.[\]]+)/g)) {
    segments.push(match[1] ?? match[2])
  }
  return segments
}

/** The inverse of `parsePositionalPath`. */
export function formatPositionalPath(path: readonly string[]): string {
  return path
    .map((segment, index) => {
      if (/^\d+$/.test(segment)) return `[${segment}]`
      return index === 0 ? segment : `.${segment}`
    })
    .join('')
}

/* ---------------------------------------------------------------- anchors */

/**
 * Anchor id → the path into the artifact that produced it.
 *
 * Deliberately a plain record of plain arrays: it is built on the server, where
 * the parsed artifact already exists, and crosses the RSC boundary to the block
 * that owns the editor. Anchor ids stay in each diagram's own vocabulary — a
 * workflow step path, a state node id — so no diagram has to learn a second one.
 */
export type AnchorPaths = Record<string, string[]>

/** Does `prefix` name this node or one of its ancestors? */
function encloses(prefix: readonly string[], path: readonly string[]): boolean {
  if (prefix.length > path.length) return false
  return prefix.every((segment, index) => segment === path[index])
}

/**
 * Every anchor enclosing a document path, deepest first.
 *
 * A cursor resting on `payload:` is inside the step that declares it, which is
 * inside the `alt` branch, which is inside the fragment. Returning the whole
 * chain lets the diagram light the message *and* the fragment that contains it,
 * which is what the reader is actually looking at.
 */
export function anchorsAt(anchors: AnchorPaths, path: readonly string[] | null): string[] {
  if (!path) return []
  return Object.entries(anchors)
    .filter(([, anchorPath]) => encloses(anchorPath, path))
    .sort((a, b) => b[1].length - a[1].length)
    .map(([id]) => id)
}
