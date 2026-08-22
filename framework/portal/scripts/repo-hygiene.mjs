#!/usr/bin/env node
/**
 * Repo hygiene — the review findings that recurred often enough to deserve a
 * machine.
 *
 * Every defect checked here was found by a human reader during 0.2.0, more than
 * once, after a previous human reader had already looked at the same file and
 * missed it. None of them needs judgement: each is a property of the bytes on
 * disk that a program decides in milliseconds and a tired reader decides badly
 * at the end of a long diff. Converting them is not a nicety — a reviewer who
 * has to hold seven mechanical invariants in mind has that much less attention
 * left for the one thing only a reviewer can do.
 *
 * Replayed against `51d2c53` — the commit where the worst of it was on disk at
 * once — these seven checks report 131 findings, among them the `.pyc`, both raw
 * NUL bytes, and seven bundle/portal diagnostic desyncs. Every one of those was
 * eventually found by a human, one at a time, over several passes.
 *
 * ## Why this lives here and not in `metaframework check`
 *
 * `metaframework check` is the published product (`@bershadsky/metaframework`).
 * Its subject is *a catalog* — a `solutions/` tree discovered by walking up from
 * the user's cwd — and it must keep running on the declared Node floor against
 * catalogs that have nothing to do with this repository. Every check in this
 * file asks about *this repository*: `marketplace/`'s bundled plugin, the
 * portal's own `src/`, the `UNIMPLEMENTED` register inside a test file. Shipping
 * them as a subcommand would ship a mode that can only ever fail for a user.
 *
 * `framework/portal/scripts/` is where build-time-only Node tooling already
 * lives (`assemble-standalone.mjs`); it is already linted in CI
 * (`npx eslint src bin scripts`); it is excluded from the npm tarball by
 * `package.json`'s `files`, so the pack audit stays green and users carry none
 * of it; and vitest already discovers `*.test.mjs` beside it, exactly as it does
 * for `bin/`.
 *
 * ## Two doors, one implementation
 *
 * `repo-hygiene.test.mjs` drives the exported checks two ways: a RED case per
 * check over a synthetic tree — a gate that cannot fail is worse than none — and
 * a GREEN assertion over the real repository. `npm test` therefore runs this
 * gate with no extra CI step. `main()` below is the second door: a
 * dependency-free run for a contributor, and a CI step that lands before
 * `npm ci` so a stray `.pyc` is reported in seconds rather than after a build.
 *
 * ## Extending it
 *
 * The allow-lists are the extension points and are deliberately all at the top,
 * as plain arrays. Adding a tree, a legitimate binary asset or a
 * verbatim-reproduction file is a one-line edit with a comment saying why.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root: three levels up from `framework/portal/scripts/`. */
export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)))

/* ------------------------------------------------------------- allow-lists */

/**
 * The trees a tracked file may live in. Anything else tracked is scratch that
 * escaped, which is the whole point of the check: agents and humans alike leave
 * working files behind, and the ones that get committed are the ones nobody
 * looks at twice. Add a row with a reason, never silently.
 */
export const ALLOWED_TREES = [
  'framework', // the spec and the portal — the product
  'solutions', // the catalogs
  'marketplace', // the Claude Code plugin (the "bundle")
  'docs', // roadmap, decision record, screenshots
  'scripts', // release and migration tooling
  '.github', // CI
  '.claude-plugin', // marketplace manifest
  'docker', // the compose file, the Dockerfiles, the chart and the env templates
]

/** Tracked files allowed at the repository root, exhaustively. */
export const ALLOWED_ROOT_FILES = [
  '.env.example',
  '.gitignore',
  'LICENSE',
  'README.md',
  'package.json',
  'package-lock.json',
]

/**
 * Tracked files that are legitimately binary. Everything else tracked must be
 * NUL-free — see {@link checkNulBytes} for why NUL specifically.
 */
export const BINARY_ASSETS = [
  /^docs\/screenshots\/[^/]+\.png$/, // the README gallery, referenced by raw URLs
  /^framework\/portal\/src\/app\/favicon\.ico$/,
]

/** Path segments that only ever appear in build output or tool caches. */
export const DETRITUS_SEGMENTS = [
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  'node_modules',
  '.next',
  '.turbo',
  '.venv',
  'coverage',
]

/** Extensions that are compiled artefacts, never sources. */
export const DETRITUS_EXTENSIONS = [
  '.pyc',
  '.pyo',
  '.pyd',
  '.class',
  '.o',
  '.obj',
  '.a',
  '.lib',
  '.so',
  '.dylib',
  '.dll',
  '.exe',
  '.wasm',
  '.whl',
  '.tsbuildinfo',
]

/** Basename shapes that mean "somebody was mid-something". */
export const SCRATCH_PATTERNS = [
  /\.(bak|orig|rej|swp|swo|tmp)$/,
  /~$/,
  /^scratch[-_.]/,
  /^tmp[-_.]/,
]

/** Extensions treated as source for the NUL-byte check's wording. */
export const TEXT_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.py',
  '.sh',
  '.css',
  '.html',
  '.txt',
  '.toml',
]

/**
 * Bundle files whose entire purpose is reproducing catalog files. Every fenced
 * block in one of these must declare what it is — `<!-- verbatim: path -->`,
 * `<!-- verbatim-excerpt: path -->`, or `<!-- verbatim-exempt: reason -->` — so
 * that adding an example without wiring it to its source is the failure rather
 * than the silent default.
 */
export const VERBATIM_FILES = [
  'marketplace/plugins/metaframework/skills/add-entity/references/worked-examples.md',
  'marketplace/plugins/metaframework/skills/protocol-design/references/worked-protocol.md',
]

/** The bundle's diagnostic inventory, and the two things it must agree with. */
export const DIAGNOSTICS_BUNDLE =
  'marketplace/plugins/metaframework/skills/validate-catalog/references/diagnostics.md'
export const DIAGNOSTICS_REGISTER = 'framework/portal/src/lib/catalog/diagnostic-coverage.test.ts'
export const EMITTER_ROOTS = ['framework/portal/src', 'framework/portal/bin']

/* ------------------------------------------------------------------ helpers */

/**
 * Every path git tracks *and* that is still on disk, repo-relative. Fixed argv,
 * no shell, no interpolation: the argument vector is a constant, so there is
 * nothing here to inject into.
 *
 * The existence filter is not belt-and-braces. `git ls-files` lists the index,
 * and a file deleted from the working tree without staging the deletion —
 * `rm x` rather than `git rm x`, the ordinary state of a developer mid-change —
 * is in the index and not on disk. Every check reads its files, so an unguarded
 * list threw ENOENT out of `main` and the gate died with a Node stack trace
 * instead of reporting on the hundreds of files it could read. A checker that
 * crashes on a routine working-tree state is worse than one that skips a file,
 * because the crash hides every other finding.
 *
 * Filtered here rather than at each of the eight read sites, so a check added
 * later inherits the guarantee instead of having to remember it: the list a
 * check receives is readable, and that is the contract.
 */
export function trackedFiles(root = REPO_ROOT) {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
  return out
    .toString('utf8')
    .split('\0')
    .filter((p) => p.length > 0)
    .filter((p) => existsSync(path.join(root, p)))
}

const finding = (check, file, message, line) => ({ check, file, message, line })

const readBytes = (root, file) => readFileSync(path.join(root, file))

/**
 * Read as text. `Buffer.toString('utf8')` keeps a NUL byte as `\0` rather
 * than treating the whole file as binary and giving up — precisely the
 * difference between this and the `grep` that read `git.ts` as empty.
 */
const readText = (root, file) => readBytes(root, file).toString('utf8')

const ext = (file) => path.extname(file).toLowerCase()
const isBinaryAsset = (file) => BINARY_ASSETS.some((re) => re.test(file))
const isTest = (file) => /\.test\.[cm]?[jt]sx?$/.test(file)

/** Recursive listing of a directory, repo-relative. A missing directory is empty. */
function walk(root, dir) {
  if (!existsSync(path.join(root, dir))) return []
  const out = []
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of readdirSync(path.join(root, current), { withFileTypes: true })) {
      const rel = `${current}/${entry.name}`
      if (entry.isDirectory()) stack.push(rel)
      else out.push(rel)
    }
  }
  return out.sort()
}

/* ------------------------------------------ (b) no tracked build detritus */

/**
 * A 45 KB `.pyc` rode into the shipped plugin inside
 * `marketplace/plugins/metaframework/skills/review-solution/scripts/` and stayed
 * there until somebody grepped for it: nothing in the pipeline reads the
 * marketplace tree, `.gitignore` gained its `*.py[cod]` rule only afterwards,
 * and an ignore rule does not untrack what is already tracked.
 */
export function checkTrackedBinaries({ files }) {
  const findings = []
  for (const file of files) {
    const hit = file.split('/').find((s) => DETRITUS_SEGMENTS.includes(s))
    if (hit) {
      findings.push(
        finding('tracked-binaries', file, `tracked inside a build/cache directory (\`${hit}\`)`),
      )
      continue
    }
    if (DETRITUS_EXTENSIONS.includes(ext(file))) {
      findings.push(
        finding(
          'tracked-binaries',
          file,
          `a compiled artefact (\`${ext(file)}\`) is tracked; untrack it with \`git rm --cached\``,
        ),
      )
    }
  }
  return findings
}

/* --------------------------------------------------- (c) no raw NUL bytes */

/**
 * Three source files carried raw NUL bytes. The damage was not that they failed
 * to compile — they compiled fine — but that `grep` classifies a file holding a
 * NUL as binary and skips it *in silence*. `lib/history/git.ts` was invisible to
 * every grep-based audit for as long as its NUL survived, so every "no hits,
 * therefore clean" conclusion drawn over it was vacuous. This check reads bytes,
 * which is the only way to see the thing that hides from the tool you would
 * otherwise reach for.
 */
export function checkNulBytes({ root, files }) {
  const findings = []
  for (const file of files) {
    if (isBinaryAsset(file)) continue
    const at = readBytes(root, file).indexOf(0)
    if (at === -1) continue
    findings.push(
      finding(
        'nul-bytes',
        file,
        TEXT_EXTENSIONS.includes(ext(file))
          ? `raw NUL byte at offset ${at} — grep reads this file as binary and skips it in silence`
          : `binary content (NUL at offset ${at}) tracked outside the BINARY_ASSETS allow-list`,
      ),
    )
  }
  return findings
}

/* --------------------------------------------------- (e) no stray scratch */

/**
 * Tracked files only, on purpose. An untracked file in the working tree is the
 * author's business — the owner's `spike_free_scheduling.ipynb` sits in the root
 * right now and is nobody's defect. A *committed* stray is the repository's
 * problem permanently, and that is what actually happened: earlier runs left
 * Python scratch in the root, and one such file was committed.
 */
export function checkStrayFiles({ files }) {
  const findings = []
  for (const file of files) {
    const segments = file.split('/')
    if (segments.length === 1) {
      if (!ALLOWED_ROOT_FILES.includes(file)) {
        findings.push(
          finding(
            'stray-files',
            file,
            'tracked at the repository root; add it to ALLOWED_ROOT_FILES with a reason, or remove it',
          ),
        )
      }
    } else if (!ALLOWED_TREES.includes(segments[0])) {
      findings.push(
        finding(
          'stray-files',
          file,
          `\`${segments[0]}/\` is not a known tree; add it to ALLOWED_TREES with a reason, or remove the file`,
        ),
      )
    }
    const base = segments[segments.length - 1]
    const scratch = SCRATCH_PATTERNS.find((re) => re.test(base))
    if (scratch) {
      findings.push(finding('stray-files', file, `basename matches a scratch pattern (${scratch})`))
    }
  }
  return findings
}

/* ---------------------------------------- (d) markdown table alignment */

const FENCE = /^(\s*(?:>\s?)*)(`{3,}|~{3,})(.*)$/
const TABLE_ROW = /^\s*(?:>\s?)*\|/
const DELIMITER_ROW = /^\s*(?:>\s?)*\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/

/**
 * Unescaped pipes only. A `\|` inside a code span is a literal character in a
 * cell, not a cell border, and counting it is how a "misalignment" that is not
 * one gets reported. Indices are code points, not UTF-16 units, so an emoji in a
 * cell does not shift the columns after it.
 */
export function pipeColumns(line) {
  const chars = [...line]
  const columns = []
  for (let i = 0; i < chars.length; i += 1) {
    if (chars[i] === '|' && !(i > 0 && chars[i - 1] === '\\')) columns.push(i)
  }
  return columns
}

function cellsOf(line, columns) {
  const chars = [...line]
  const cells = []
  for (let i = 0; i < columns.length - 1; i += 1) {
    cells.push(chars.slice(columns[i] + 1, columns[i + 1]).join(''))
  }
  return cells
}

/**
 * A markdown document's lines that are not inside a fenced block, honouring
 * CommonMark fence lengths: a block opened with ```` closes only on a run of
 * four or more backticks, so a ``` fence *inside* it is content. Getting this
 * wrong reads reproduced markdown as live markdown — and the bundle is full of
 * reproduced markdown.
 */
export function outsideFences(source) {
  const lines = source.split('\n')
  const out = []
  let open = null
  for (let i = 0; i < lines.length; i += 1) {
    const match = FENCE.exec(lines[i])
    if (open) {
      if (match && match[2][0] === open.char && match[2].length >= open.length && !match[3].trim()) {
        open = null
      }
      continue
    }
    if (match) {
      open = { char: match[2][0], length: match[2].length }
      continue
    }
    out.push({ line: i + 1, text: lines[i] })
  }
  return out
}

/**
 * A table is legal in exactly two shapes, and mixing them is the defect.
 *
 * **Aligned** — every row's unescaped-pipe columns are identical. This is the
 * repository's dominant style (319 of 348 tables when the check was written) and
 * the one the authoring rule is about: a ragged right edge in a padded table is
 * a defect, not a cosmetic nit, because the padding is a claim that the edges
 * line up.
 *
 * **Compact** — every cell is exactly `| content |`, one space each side. Column
 * indices then cannot line up and were never claiming to. Forcing the README's
 * two-cell screenshot gallery (900-character cells) into alignment would produce
 * a 900-character delimiter row: worse on every axis the rule exists to serve.
 *
 * A table that is neither has been edited without re-padding, which is exactly
 * the recurring defect. Twenty-four of them existed when this was written.
 */
export function checkMarkdownTables({ root, files }) {
  const findings = []
  for (const file of files.filter((f) => ext(f) === '.md')) {
    let block = []
    const flush = () => {
      const rows = block
      block = []
      if (rows.length < 2 || !DELIMITER_ROW.test(rows[1].text)) return
      const columns = rows.map((r) => pipeColumns(r.text))
      const aligned = new Set(columns.map((c) => c.join(','))).size === 1
      const compact = rows.every((r, i) =>
        cellsOf(r.text, columns[i]).every((c) => c === ` ${c.trim()} `),
      )
      if (aligned || compact) return
      const reference = columns[0].join(',')
      const offender = columns.findIndex((c) => c.join(',') !== reference)
      findings.push(
        finding(
          'table-alignment',
          file,
          `ragged table borders: the header row has pipe columns [${reference}], ` +
            `line ${rows[offender].line} has [${columns[offender].join(',')}]. ` +
            'Pad every cell to one width, or write the whole table in compact `| a | b |` form.',
          rows[0].line,
        ),
      )
    }
    for (const entry of outsideFences(readText(root, file))) {
      if (TABLE_ROW.test(entry.text)) block.push(entry)
      else flush()
    }
    flush()
  }
  return findings
}

/* ------------------------------------------- (f) distilled-from markers */

const DISTILLED = /`(framework\/spec\/[A-Za-z0-9._/-]+\.md)`\s*\(\s*(?:version\s+)?(\d+)\s*\)/g
const FRONTMATTER_VERSION = /^version:\s*(\d+)\s*$/m

/**
 * Each bundled reference opens with "Distilled from `framework/spec/x.md`
 * (version N)". That marker is the only thing telling a reader how stale the
 * distillation is, and it is written by hand at a moment when the spec's version
 * is not on screen — so it drifts the first time the spec is edited and the
 * bundle is not.
 *
 * The text is normalised before matching: these markers live inside blockquotes
 * and wrap across lines, so `> ` prefixes and newlines collapse to single
 * spaces. Without that, a marker that happened to wrap between the path and the
 * version would escape the check silently, which is the failure mode of every
 * line-oriented grep over this file.
 *
 * The word `version` is optional in the match, and that is not cosmetic. A
 * marker naming several documents at once writes the first in full and the rest
 * bare — "`environment.md` (version 6), with the field detail of `actor.md`
 * (5), `adr.md` (3)" — and requiring the keyword made every continuation
 * invisible here. One of them was stale by a whole normative rule while this
 * check reported clean, which is worse than not having the check: a green gate
 * is read as a claim about the file, not about the sentences the regex
 * happened to reach. Any parenthesised integer after a spec path is a version
 * claim and is checked as one.
 */
export function checkDistilledFrom({ root, files }) {
  const findings = []
  for (const file of files.filter((f) => f.startsWith('marketplace/') && ext(f) === '.md')) {
    const flat = readText(root, file)
      .replace(/\n\s*>\s?/g, ' ')
      .replace(/\s+/g, ' ')
    for (const [, spec, claimed] of flat.matchAll(DISTILLED)) {
      const abs = path.join(root, spec)
      if (!existsSync(abs)) {
        findings.push(
          finding('distilled-from', file, `marker names \`${spec}\`, which does not exist`),
        )
        continue
      }
      const found = FRONTMATTER_VERSION.exec(readFileSync(abs, 'utf8'))
      if (!found) {
        findings.push(
          finding('distilled-from', file, `\`${spec}\` carries no \`version:\` frontmatter`),
        )
      } else if (found[1] !== claimed) {
        findings.push(
          finding(
            'distilled-from',
            file,
            `claims \`${spec}\` version ${claimed}; the file is at version ${found[1]} — re-distil, then move the marker`,
          ),
        )
      }
    }
  }
  return findings
}

/* -------------------------------------- (g) claimed-verbatim blocks */

const MARKER = /^\s*<!--\s*(verbatim|verbatim-excerpt|verbatim-exempt)\s*:\s*(.+?)\s*-->\s*$/

/**
 * Fenced blocks paired with the marker that precedes them, if any. The marker
 * must be the nearest preceding non-blank line — anything looser and "which
 * block did that claim mean" becomes a judgement call, which is the thing being
 * removed.
 */
export function fencedBlocks(source) {
  const lines = source.split('\n')
  const blocks = []
  let lastNonBlank = null
  let i = 0
  while (i < lines.length) {
    const match = FENCE.exec(lines[i])
    if (!match) {
      if (lines[i].trim()) lastNonBlank = lines[i]
      i += 1
      continue
    }
    const char = match[2][0]
    const length = match[2].length
    const body = []
    let j = i + 1
    while (j < lines.length) {
      const close = FENCE.exec(lines[j])
      if (close && close[2][0] === char && close[2].length >= length && !close[3].trim()) break
      body.push(lines[j])
      j += 1
    }
    const marker = lastNonBlank ? MARKER.exec(lastNonBlank) : null
    blocks.push({
      line: i + 1,
      info: match[3].trim(),
      content: body.length ? `${body.join('\n')}\n` : '',
      marker: marker ? { kind: marker[1], value: marker[2] } : null,
    })
    lastNonBlank = null
    i = j + 1
  }
  return blocks
}

/**
 * An excerpt is usually framed by the bundle's own words: a caption naming the
 * source — `# solutions/acme/…/transport.yaml — verbatim through the first
 * channel` — and, at the end, an elision note saying what was left out. Neither
 * line is in the file, so both are stripped before the comparison.
 *
 * The frame is recognised narrowly: a run of *whole-line comments* at one end or
 * the other, carrying either the target's basename or an ellipsis. Only the ends
 * are stripped, so the rule can remove the bundle's own annotations and nothing
 * else — a divergence in the middle of the excerpt still fails, and a trailing
 * comment can only excuse itself.
 */
export function stripFraming(content, target) {
  const lines = content.split('\n')
  const isComment = (line) => /^\s*(#|\/\/|--|<!--)/.test(line)
  const isBlank = (line) => line.trim() === ''
  const signals = (line) =>
    line.includes(path.basename(target)) || /\u2026|\.\.\./.test(line)

  let start = 0
  let end = lines.length
  while (end > start && isBlank(lines[end - 1])) end -= 1

  // A run of the bundle's own comment lines at either end — the caption above
  // and the elision note below — is framing, not content, provided at least one
  // line in the run says so by naming the file or trailing off in an ellipsis.
  let head = start
  while (head < end && (isComment(lines[head]) || isBlank(lines[head]))) head += 1
  if (head > start && lines.slice(start, head).some((l) => isComment(l) && signals(l))) start = head

  let tail = end
  while (tail > start && (isComment(lines[tail - 1]) || isBlank(lines[tail - 1]))) tail -= 1
  if (tail < end && lines.slice(tail, end).some((l) => isComment(l) && signals(l))) end = tail

  while (end > start && isBlank(lines[end - 1])) end -= 1
  return lines.slice(start, end).join('\n')
}

/**
 * Two bundle files reproduce catalog files wholesale so that an installed plugin
 * — which cannot see this repository — still shows an author real examples. That
 * only works while the copies are true, and a copy drifts the moment its source
 * is edited by someone who does not know the copy exists. It was caught by hand
 * twice this release; by hand is exactly how it will be missed the third time.
 */
export function checkVerbatimBlocks({ root, files }) {
  const findings = []
  for (const file of files.filter((f) => f.startsWith('marketplace/') && ext(f) === '.md')) {
    const mustMark = VERBATIM_FILES.includes(file)
    for (const block of fencedBlocks(readText(root, file))) {
      if (!block.marker) {
        if (mustMark) {
          findings.push(
            finding(
              'verbatim-blocks',
              file,
              'fenced block in a verbatim-reproduction file carries no `<!-- verbatim: … -->`, ' +
                '`<!-- verbatim-excerpt: … -->` or `<!-- verbatim-exempt: … -->` marker',
              block.line,
            ),
          )
        }
        continue
      }
      if (block.marker.kind === 'verbatim-exempt') continue
      const target = block.marker.value
      const abs = path.join(root, target)
      if (!existsSync(abs) || !statSync(abs).isFile()) {
        findings.push(
          finding(
            'verbatim-blocks',
            file,
            `marker names \`${target}\`, which is not a file`,
            block.line,
          ),
        )
        continue
      }
      const source = readFileSync(abs, 'utf8')
      if (block.marker.kind === 'verbatim') {
        if (block.content !== source && block.content !== `${source}\n`) {
          findings.push(
            finding(
              'verbatim-blocks',
              file,
              `block claims to reproduce \`${target}\` whole and does not byte-match it (${describeDrift(block.content, source)})`,
              block.line,
            ),
          )
        }
      } else if (!source.includes(stripFraming(block.content, target))) {
        findings.push(
          finding(
            'verbatim-blocks',
            file,
            `block claims to be an excerpt of \`${target}\` and is not a contiguous slice of it`,
            block.line,
          ),
        )
      }
    }
  }
  return findings
}

function describeDrift(block, source) {
  const limit = Math.min(block.length, source.length)
  for (let i = 0; i < limit; i += 1) {
    if (block[i] !== source[i]) {
      return `first difference at line ${source.slice(0, i).split('\n').length} of the source`
    }
  }
  return `the block is ${block.length} bytes, the file ${source.length}`
}

/* ------------------------------------ (a) bundle ↔ portal diagnostic sync */

const SECTION = /^## (\d)\. /
const BACKTICKED_CODE = /`([EW]_[A-Z0-9_]*[A-Z0-9])`/g
const DEFINITION_ROW = /^\s*\|\s*`([EW]_[A-Z0-9_]+)`\s*\|/
const CODE_LITERAL = /'([EW]_[A-Z0-9_]+)'/g

function bundleSections(source) {
  const sections = new Map()
  let current = null
  for (const line of source.split('\n')) {
    const heading = SECTION.exec(line)
    if (heading) {
      current = Number(heading[1])
      sections.set(current, [])
    }
    if (current) sections.get(current).push(line)
  }
  return sections
}

const backtickedCodes = (lines) =>
  new Set([...lines.join('\n').matchAll(BACKTICKED_CODE)].map(([, code]) => code))

const definitionRows = (lines) =>
  new Set(
    lines
      .map((l) => DEFINITION_ROW.exec(l))
      .filter(Boolean)
      .map(([, code]) => code),
  )

/** Every diagnostic code literal the shipped (non-test) portal source emits. */
export function emittedCodes(root = REPO_ROOT, roots = EMITTER_ROOTS) {
  const codes = new Set()
  for (const dir of roots) {
    for (const file of walk(root, dir)) {
      if (!/\.(ts|tsx|mjs)$/.test(file) || isTest(file)) continue
      for (const [, code] of readText(root, file).matchAll(CODE_LITERAL)) codes.add(code)
    }
  }
  return codes
}

/**
 * The `UNIMPLEMENTED` register's keys, read out of the coverage test that owns
 * it. Commented-out rows do not count: a key parked behind `//` is a note, not a
 * register entry.
 */
export function registerKeys(root = REPO_ROOT, file = DIAGNOSTICS_REGISTER) {
  const source = readText(root, file)
  const start = source.indexOf('const UNIMPLEMENTED')
  if (start === -1) return null
  const end = source.indexOf('\n}\n', start)
  if (end === -1) return null
  const keys = new Set()
  for (const line of source.slice(start, end).split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue
    const key = /^([EW]_[A-Z0-9_]+):/.exec(trimmed)
    if (key) keys.add(key[1])
  }
  return keys
}

/**
 * The bundle's diagnostic inventory desynced from the portal six times in one
 * release, in both directions: a code gained an emitter and stayed listed under
 * "nothing emits these", and a new code shipped with no row at all. Both are
 * decidable from the bytes, and both mislead an author badly — the inventory's
 * entire value is that section 2 is *believable*.
 *
 * The bundle's own conventions supply the vocabulary, so nothing here is a
 * hand-maintained exception list:
 *
 * - **Section 1 definition rows** (`| \`CODE\` | … |`) are the claim "this code
 *   is emitted". A code merely *mentioned* in section 1 prose is a
 *   cross-reference, not a claim.
 * - **Section 2's backticked codes**, minus those rows and minus section 3's
 *   table, are the claim "nothing emits this". The three half-implemented
 *   journey rules and the two codes cited as firing *instead of* a gap fall out
 *   automatically, because the bundle already gives each of them a section 1
 *   row — no allow-list required, and no allow-list to rot.
 * - **Section 3's first column** is the claim "never emit or cite this".
 *
 * `UNIMPLEMENTED` in the coverage test is the authority the bundle itself names,
 * so the two must hold the same set exactly. That equality is the check that
 * would have caught all six.
 */
export function checkDiagnosticSync({ root = REPO_ROOT } = {}) {
  const bundle = DIAGNOSTICS_BUNDLE
  if (!existsSync(path.join(root, bundle))) {
    return [finding('diagnostic-sync', bundle, 'the bundle diagnostic inventory is missing')]
  }
  const sections = bundleSections(readText(root, bundle))
  for (const n of [1, 2, 3]) {
    if (!sections.has(n)) {
      return [finding('diagnostic-sync', bundle, `section ${n} heading ("## ${n}. …") not found`)]
    }
  }
  const findings = []
  const emitted = emittedCodes(root)
  const documented = definitionRows(sections.get(1))
  const retired = definitionRows(sections.get(3))
  const gaps = new Set(
    [...backtickedCodes(sections.get(2))].filter((c) => !documented.has(c) && !retired.has(c)),
  )
  const say = (message) => findings.push(finding('diagnostic-sync', bundle, message))

  for (const code of [...gaps].sort()) {
    if (emitted.has(code)) {
      say(
        `section 2 says nothing emits \`${code}\`, but the portal emits it — move its row into section 1`,
      )
    }
  }
  for (const code of [...emitted].sort()) {
    if (!documented.has(code)) {
      say(`the portal emits \`${code}\` and section 1 has no definition row for it`)
    }
  }
  for (const code of [...retired].sort()) {
    if (emitted.has(code)) say(`section 3 retires \`${code}\`, but the portal still emits it`)
  }

  const register = registerKeys(root)
  if (register === null) {
    findings.push(
      finding(
        'diagnostic-sync',
        DIAGNOSTICS_REGISTER,
        'the `UNIMPLEMENTED` register could not be read; the bundle has no authority to agree with',
      ),
    )
    return findings
  }
  for (const code of [...register].sort()) {
    if (!gaps.has(code)) {
      say(`\`${code}\` is in the portal's UNIMPLEMENTED register and section 2 does not name it`)
    }
  }
  for (const code of [...gaps].sort()) {
    if (!register.has(code)) {
      say(`section 2 names \`${code}\` as a gap and the portal's UNIMPLEMENTED register does not`)
    }
  }
  return findings
}

/* ------------------------------------------------------------------ runner */

export const CHECKS = [
  { id: 'stray-files', title: 'no tracked file outside a known tree', run: checkStrayFiles },
  { id: 'tracked-binaries', title: 'no compiled artefact is tracked', run: checkTrackedBinaries },
  { id: 'nul-bytes', title: 'no raw NUL byte in a tracked source', run: checkNulBytes },
  { id: 'table-alignment', title: 'markdown table borders line up', run: checkMarkdownTables },
  {
    id: 'distilled-from',
    title: 'distilled-from markers name the live spec version',
    run: checkDistilledFrom,
  },
  {
    id: 'verbatim-blocks',
    title: 'claimed-verbatim blocks byte-match their source',
    run: checkVerbatimBlocks,
  },
  {
    id: 'diagnostic-sync',
    title: 'the bundle inventory agrees with the portal',
    run: checkDiagnosticSync,
  },
]

export function runHygiene({ root = REPO_ROOT, files } = {}) {
  const tracked = files ?? trackedFiles(root)
  return CHECKS.flatMap((check) => check.run({ root, files: tracked }))
}

function main() {
  const files = trackedFiles(REPO_ROOT)
  let total = 0
  for (const check of CHECKS) {
    const findings = check.run({ root: REPO_ROOT, files })
    total += findings.length
    process.stdout.write(
      `${findings.length === 0 ? 'ok  ' : 'FAIL'} ${check.id.padEnd(17)} ${check.title}\n`,
    )
    for (const f of findings) {
      process.stdout.write(`       ${f.file}${f.line ? `:${f.line}` : ''}: ${f.message}\n`)
    }
  }
  process.stdout.write(
    total === 0
      ? `\n${files.length} tracked files, ${CHECKS.length} checks, clean\n`
      : `\n${total} finding${total === 1 ? '' : 's'} across ${files.length} tracked files\n`,
  )
  process.exitCode = total === 0 ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
