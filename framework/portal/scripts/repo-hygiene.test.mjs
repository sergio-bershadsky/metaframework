import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  CHECKS,
  DIAGNOSTICS_BUNDLE,
  DIAGNOSTICS_REGISTER,
  REPO_ROOT,
  checkDiagnosticSync,
  checkDistilledFrom,
  checkManifestIdentity,
  checkMarkdownTables,
  checkNulBytes,
  checkStrayFiles,
  checkTrackedBinaries,
  checkVerbatimBlocks,
  outsideFences,
  pipeColumns,
  runHygiene,
  trackedFiles,
} from './repo-hygiene.mjs'

/**
 * A gate that cannot fail is worse than no gate: it buys the same confidence and
 * pays none of it back. So every check here is driven twice — once over a
 * synthetic tree carrying the exact defect it was written for (it must go RED),
 * and once over a corrected copy of that tree (it must go green). The real
 * repository is then asserted clean at the bottom, which is what actually runs
 * on every push.
 *
 * The RED cases are not hypotheticals. Each one reproduces a defect that shipped
 * in this repository during 0.2.0 and was found by a human on a second or third
 * pass over the same file.
 */

let parent
let root

/** Write a file under the fixture root, creating parents. */
async function put(relative, contents) {
  const abs = path.join(root, relative)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, contents)
  return relative
}

/** Run one check over an explicit file list, as if git tracked exactly those. */
const run = (check, files) => check({ root, files })
const codes = (findings) => findings.map((f) => f.message)

beforeAll(async () => {
  parent = await mkdtemp(path.join(tmpdir(), 'repo-hygiene-'))
})

/**
 * A fresh tree per test, not per file. `checkDiagnosticSync` scans a whole
 * directory rather than a supplied file list, so a source written by an earlier
 * test would still be read by a later one — which is how the first draft of this
 * suite got a phantom `E_QUIET` into a diagnostic-sync fixture.
 */
beforeEach(async () => {
  root = await mkdtemp(path.join(parent, 'case-'))
})

afterAll(async () => {
  await rm(parent, { recursive: true, force: true })
})

/* --------------------------------------------------------- (e) stray files */

describe('stray-files', () => {
  it('goes RED on a scratch script committed at the repository root', async () => {
    const files = [await put('validate_fixture.py', 'print(1)\n')]
    const findings = run(checkStrayFiles, files)
    expect(findings).toHaveLength(1)
    expect(findings[0].file).toBe('validate_fixture.py')
    expect(findings[0].message).toMatch(/ALLOWED_ROOT_FILES/)
  })

  it('goes RED on a tracked file in an unknown tree', async () => {
    const files = [await put('tmpwork/notes.md', '# notes\n')]
    expect(run(checkStrayFiles, files)).toHaveLength(1)
  })

  it('goes RED on an editor leftover anywhere', async () => {
    const files = [await put('docs/roadmap.md.orig', 'x\n')]
    expect(codes(run(checkStrayFiles, files))).toEqual([
      expect.stringContaining('scratch pattern'),
    ])
  })

  it('is green on the known trees and root files', () => {
    const files = [
      'README.md',
      'LICENSE',
      'package.json',
      '.gitignore',
      '.env.example',
      'docs/roadmap-0.2.0.md',
      'framework/portal/src/lib/catalog/load.ts',
      'solutions/acme/index.md',
      'marketplace/plugins/metaframework/skills/add-entity/SKILL.md',
      'scripts/release.sh',
      '.github/workflows/ci.yml',
      '.claude-plugin/marketplace.json',
    ]
    expect(run(checkStrayFiles, files)).toEqual([])
  })

  it('never judges an untracked file — the owner’s spike stays the owner’s', async () => {
    // Written into the fixture tree but deliberately absent from the file list,
    // which is what "untracked" means to this check.
    await put('spike_free_scheduling.ipynb', '{}\n')
    await put('spike_free_scheduling.html', '<html></html>\n')
    expect(run(checkStrayFiles, ['README.md'])).toEqual([])
  })
})

/* ---------------------------------------------------- (b) tracked binaries */

describe('tracked-binaries', () => {
  it('goes RED on the .pyc that shipped inside the plugin', () => {
    const files = [
      'marketplace/plugins/metaframework/skills/review-solution/scripts/__pycache__/catalog_facts.cpython-313.pyc',
    ]
    const findings = run(checkTrackedBinaries, files)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/__pycache__/)
  })

  it('goes RED on a compiled artefact outside a cache directory', () => {
    expect(codes(run(checkTrackedBinaries, ['scripts/catalog_facts.pyc']))).toEqual([
      expect.stringContaining('git rm --cached'),
    ])
  })

  it('is green on the sources beside it', () => {
    const files = [
      'marketplace/plugins/metaframework/skills/review-solution/scripts/catalog_facts.py',
      'framework/portal/src/lib/history/git.ts',
    ]
    expect(run(checkTrackedBinaries, files)).toEqual([])
  })
})

/* --------------------------------------------------------- (c) NUL bytes */

describe('nul-bytes', () => {
  it('goes RED on a TypeScript source carrying a raw NUL', async () => {
    const files = [await put('framework/portal/src/lib/history/git.ts', 'const a = 1\u0000\n')]
    const findings = run(checkNulBytes, files)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/skips it in silence/)
  })

  it('reads the whole file, not a prefix', async () => {
    // The NUL that hid in `git.ts` was not on line 1, and the cheap way to ask
    // "is this binary" — sniff the first few kilobytes — would have missed it
    // exactly as grep did.
    const buried = `${'// filler\n'.repeat(4000)}const a = 1\u0000\n`
    const files = [await put('framework/portal/src/lib/history/git.ts', buried)]
    const findings = run(checkNulBytes, files)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/offset 40011/)
  })

  it('is green on the same file once the NUL is gone', async () => {
    const files = [await put('framework/portal/src/lib/clean.ts', 'const a = 1\n')]
    expect(run(checkNulBytes, files)).toEqual([])
  })

  it('lets a declared binary asset through', async () => {
    const files = [await put('docs/screenshots/01-solution-map.png', Buffer.from([137, 80, 0, 1]))]
    expect(run(checkNulBytes, files)).toEqual([])
  })

  it('does not let an undeclared binary through', async () => {
    const files = [await put('docs/screenshots/notes.pdf', Buffer.from([37, 80, 0, 1]))]
    expect(codes(run(checkNulBytes, files))).toEqual([
      expect.stringContaining('BINARY_ASSETS allow-list'),
    ])
  })
})

/* -------------------------------------------------- (d) table alignment */

describe('table-alignment', () => {
  const aligned = ['| Code   | Meaning |', '|--------|---------|', '| `E_A`  | first   |', ''].join(
    '\n',
  )
  const ragged = ['| Code   | Meaning |', '|--------|---------|', '| `E_A` | first   |', ''].join(
    '\n',
  )
  const compact = ['| Code | Meaning |', '| --- | --- |', '| `E_LONGER` | first |', ''].join('\n')

  it('goes RED when one row was edited without re-padding', async () => {
    const files = [await put('docs/ragged.md', ragged)]
    const findings = run(checkMarkdownTables, files)
    expect(findings).toHaveLength(1)
    expect(findings[0].line).toBe(1)
    expect(findings[0].message).toMatch(/ragged table borders/)
  })

  it('is green on the padded style', async () => {
    expect(run(checkMarkdownTables, [await put('docs/aligned.md', aligned)])).toEqual([])
  })

  it('is green on the compact style, which claims no alignment', async () => {
    expect(run(checkMarkdownTables, [await put('docs/compact.md', compact)])).toEqual([])
  })

  it('does not count an escaped pipe inside a code span as a border', async () => {
    const escaped = [
      '| Code   | Meaning     |',
      '|--------|-------------|',
      '| `E_A`  | `a \\| b`    |',
      '',
    ].join('\n')
    expect(run(checkMarkdownTables, [await put('docs/escaped.md', escaped)])).toEqual([])
  })

  it('ignores a ragged table reproduced inside a fenced block', async () => {
    const fenced = ['Example:', '', '```markdown', ...ragged.split('\n'), '```', ''].join('\n')
    expect(run(checkMarkdownTables, [await put('docs/fenced.md', fenced)])).toEqual([])
  })

  it('honours fence length, so a ``` block inside a ```` block is content', () => {
    const source = ['````markdown', '```', '| a | b |', '```', '````', '| real |'].join('\n')
    expect(outsideFences(source).map((l) => l.text)).toEqual(['| real |'])
  })

  it('measures columns in code points, so an emoji does not shift them', () => {
    expect(pipeColumns('| 🚀 |')).toEqual([0, 4])
  })
})

/* --------------------------------------------------- (f) distilled-from */

describe('distilled-from', () => {
  const bundleFile = 'marketplace/plugins/metaframework/skills/_shared/references/structure.md'

  beforeEach(async () => {
    await put('framework/spec/structure.md', '---\nname: structure\nversion: 9\n---\n')
  })

  it('goes RED when the spec moves on and the marker does not', async () => {
    const files = [
      await put(bundleFile, '# S\n\n> Distilled from `framework/spec/structure.md` (version 8).\n'),
    ]
    const findings = run(checkDistilledFrom, files)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/claims .* version 8; the file is at version 9/)
  })

  it('is green once the marker catches up', async () => {
    const files = [
      await put(bundleFile, '# S\n\n> Distilled from `framework/spec/structure.md` (version 9).\n'),
    ]
    expect(run(checkDistilledFrom, files)).toEqual([])
  })

  it('sees a marker that wraps across blockquote lines', async () => {
    const files = [
      await put(
        bundleFile,
        '# S\n\n> Distilled from `framework/spec/structure.md`\n> (version 3), with the\n> container rules.\n',
      ),
    ]
    expect(codes(run(checkDistilledFrom, files))).toEqual([
      expect.stringContaining('version 3; the file is at version 9'),
    ])
  })

  it('goes RED when the marker names a spec document that does not exist', async () => {
    const files = [
      await put(bundleFile, '> Distilled from `framework/spec/kinds/ghost.md` (version 1).\n'),
    ]
    expect(codes(run(checkDistilledFrom, files))).toEqual([
      expect.stringContaining('does not exist'),
    ])
  })
})

/* ------------------------------------------------- (g) verbatim blocks */

describe('verbatim-blocks', () => {
  const bundleFile = 'marketplace/plugins/metaframework/skills/model-data/references/worked-pair.md'
  const entity = 'solutions/acme/index.md'
  const entityBody = '---\nname: acme\nkind: solution\nversion: 4\n---\n\n## Reading order\n'

  const page = (marker, body) => `# Example\n\n${marker}\n\n\`\`\`markdown\n${body}\`\`\`\n`

  beforeEach(async () => {
    await put(entity, entityBody)
  })

  it('goes RED when the catalog file moves and the copy does not', async () => {
    const files = [
      await put(
        bundleFile,
        page(`<!-- verbatim: ${entity} -->`, entityBody.replace('version: 4', 'version: 3')),
      ),
    ]
    const findings = run(checkVerbatimBlocks, files)
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/does not byte-match it \(first difference at line 4/)
  })

  it('is green when the copy is exact', async () => {
    const files = [await put(bundleFile, page(`<!-- verbatim: ${entity} -->`, entityBody))]
    expect(run(checkVerbatimBlocks, files)).toEqual([])
  })

  it('accepts a contiguous excerpt and rejects a stitched one', async () => {
    const good = await put(bundleFile, page(`<!-- verbatim-excerpt: ${entity} -->`, '---\nname: acme\nkind: solution\n'))
    expect(run(checkVerbatimBlocks, [good])).toEqual([])

    const stitched = await put(
      bundleFile,
      page(`<!-- verbatim-excerpt: ${entity} -->`, '---\nname: acme\nversion: 4\n'),
    )
    expect(codes(run(checkVerbatimBlocks, [stitched]))).toEqual([
      expect.stringContaining('not a contiguous slice'),
    ])
  })

  it('drops a caption naming the source, and only such a caption', async () => {
    const captioned = await put(
      bundleFile,
      page(
        `<!-- verbatim-excerpt: ${entity} -->`,
        '# solutions/acme/index.md — the frontmatter only\n---\nname: acme\nkind: solution\n',
      ),
    )
    expect(run(checkVerbatimBlocks, [captioned])).toEqual([])

    const smuggled = await put(
      bundleFile,
      page(`<!-- verbatim-excerpt: ${entity} -->`, '# an unrelated remark\n---\nname: acme\n'),
    )
    expect(run(checkVerbatimBlocks, [smuggled])).toHaveLength(1)
  })

  it('drops a trailing elision note, and still fails on a real divergence', async () => {
    const elided = await put(
      bundleFile,
      page(
        `<!-- verbatim-excerpt: ${entity} -->`,
        '---\nname: acme\nkind: solution\n\n# … the rest of the frontmatter follows, and then the body.\n# The whole file is in worked-examples.md.\n',
      ),
    )
    expect(run(checkVerbatimBlocks, [elided])).toEqual([])

    const drifted = await put(
      bundleFile,
      page(
        `<!-- verbatim-excerpt: ${entity} -->`,
        '---\nname: acme\nkind: product\n\n# … the rest of the frontmatter follows.\n',
      ),
    )
    expect(run(checkVerbatimBlocks, [drifted])).toHaveLength(1)
  })

  it('goes RED when the marker points at a file that no longer exists', async () => {
    const files = [
      await put(bundleFile, page('<!-- verbatim: solutions/acme/gone/index.md -->', 'x\n')),
    ]
    expect(codes(run(checkVerbatimBlocks, files))).toEqual([
      expect.stringContaining('is not a file'),
    ])
  })

  it('requires every block in a verbatim-reproduction file to declare itself', async () => {
    const file = 'marketplace/plugins/metaframework/skills/add-entity/references/worked-examples.md'
    const files = [await put(file, '# Worked examples\n\n```markdown\nanything\n```\n')]
    expect(codes(run(checkVerbatimBlocks, files))).toEqual([
      expect.stringContaining('carries no `<!-- verbatim: … -->`'),
    ])
  })

  it('lets a declared exemption through', async () => {
    const file = 'marketplace/plugins/metaframework/skills/add-entity/references/worked-examples.md'
    const files = [
      await put(file, '# Worked examples\n\n<!-- verbatim-exempt: a fragment, not a file -->\n\n```yaml\nrelations:\n```\n'),
    ]
    expect(run(checkVerbatimBlocks, files)).toEqual([])
  })
})

/* ------------------------------------------------- (a) diagnostic sync */

describe('diagnostic-sync', () => {
  const source = 'framework/portal/src/lib/catalog/load.ts'

  const bundle = ({ section1, section2, section3 = '' }) =>
    [
      '# Diagnostic code inventory',
      '',
      '## 1. Codes the portal emits',
      '',
      '| Code | Raised when |',
      '|------|-------------|',
      section1,
      '',
      '## 2. Specified but not implemented',
      '',
      section2,
      '',
      '## 3. Retired codes',
      '',
      '| Code | Superseded by |',
      '|------|---------------|',
      section3,
      '',
    ].join('\n')

  const register = (keys) =>
    [
      'const UNIMPLEMENTED: Record<string, string> = {',
      ...keys.map((k) => `  ${k}: 'no emitter',`),
      '}',
      '',
    ].join('\n')

  async function fixture({ emits, section1, section2, section3, keys }) {
    await put(source, emits.map((c) => `push('${c}')`).join('\n'))
    await put(DIAGNOSTICS_BUNDLE, bundle({ section1, section2, section3 }))
    await put(DIAGNOSTICS_REGISTER, register(keys))
  }

  it('is green when the bundle, the source and the register agree', async () => {
    await fixture({
      emits: ['E_FM_SCHEMA'],
      section1: '| `E_FM_SCHEMA` | the schema rejects it |',
      section2: '`E_PROTO_ALIAS_DUP` is a rule nothing runs.',
      keys: ['E_PROTO_ALIAS_DUP'],
    })
    expect(checkDiagnosticSync({ root })).toEqual([])
  })

  it('goes RED when a documented gap gains an emitter', async () => {
    await fixture({
      emits: ['E_FM_SCHEMA', 'E_PROTO_ALIAS_DUP'],
      section1: '| `E_FM_SCHEMA` | the schema rejects it |',
      section2: '`E_PROTO_ALIAS_DUP` is a rule nothing runs.',
      keys: ['E_PROTO_ALIAS_DUP'],
    })
    expect(codes(checkDiagnosticSync({ root }))).toEqual(
      expect.arrayContaining([expect.stringContaining('move its row into section 1')]),
    )
  })

  it('goes RED when a newly emitted code is documented nowhere', async () => {
    await fixture({
      emits: ['E_FM_SCHEMA', 'W_ARTIFACT_DIALECT'],
      section1: '| `E_FM_SCHEMA` | the schema rejects it |',
      section2: '`E_PROTO_ALIAS_DUP` is a rule nothing runs.',
      keys: ['E_PROTO_ALIAS_DUP'],
    })
    expect(codes(checkDiagnosticSync({ root }))).toEqual([
      expect.stringContaining('emits `W_ARTIFACT_DIALECT` and section 1 has no definition row'),
    ])
  })

  it('does not mistake a section 1 cross-reference for a definition row', async () => {
    await fixture({
      emits: ['E_FM_SCHEMA'],
      // The bundle really does cite E_PROTO_PARTICIPANTS from section 1 prose, as
      // the class raised *instead of* the gap. A citation is not a claim that the
      // code is emitted, so it must stay a gap.
      section1:
        '| `E_FM_SCHEMA` | the schema rejects it |\n\nReported as `E_FM_SCHEMA`, never as `E_PROTO_PARTICIPANTS`.',
      section2: '`E_PROTO_PARTICIPANTS` is enforced by the kind schema and never raised by name.',
      keys: ['E_PROTO_PARTICIPANTS'],
    })
    expect(checkDiagnosticSync({ root })).toEqual([])
  })

  it('goes RED when the register knows a gap the bundle does not name', async () => {
    await fixture({
      emits: ['E_FM_SCHEMA'],
      section1: '| `E_FM_SCHEMA` | the schema rejects it |',
      section2: 'Nothing left.',
      keys: ['E_PROTO_ALIAS_DUP'],
    })
    expect(codes(checkDiagnosticSync({ root }))).toEqual([
      expect.stringContaining('UNIMPLEMENTED register and section 2 does not name it'),
    ])
  })

  it('goes RED when the bundle invents a gap the register does not carry', async () => {
    await fixture({
      emits: ['E_FM_SCHEMA'],
      section1: '| `E_FM_SCHEMA` | the schema rejects it |',
      section2: '`E_PROTO_ALIAS_DUP` and `W_PROTO_STYLE_MISMATCH` are rules nothing runs.',
      keys: ['E_PROTO_ALIAS_DUP'],
    })
    expect(codes(checkDiagnosticSync({ root }))).toEqual([
      expect.stringContaining('`W_PROTO_STYLE_MISMATCH` as a gap'),
    ])
  })

  it('goes RED when a retired code comes back', async () => {
    await fixture({
      emits: ['E_FM_SCHEMA', 'E_DM_REF_KIND'],
      section1: '| `E_FM_SCHEMA` | the schema rejects it |',
      section2: '`E_PROTO_ALIAS_DUP` is a rule nothing runs.',
      section3: '| `E_DM_REF_KIND` | `E_SRN_DANGLING` |',
      keys: ['E_PROTO_ALIAS_DUP'],
    })
    expect(codes(checkDiagnosticSync({ root }))).toEqual(
      expect.arrayContaining([expect.stringContaining('section 3 retires `E_DM_REF_KIND`')]),
    )
  })

  it('ignores a code literal in a test file, which is an expectation not an emitter', async () => {
    await put('framework/portal/src/lib/catalog/load.test.ts', "expect(code).toBe('E_GHOST')")
    await fixture({
      emits: ['E_FM_SCHEMA'],
      section1: '| `E_FM_SCHEMA` | the schema rejects it |',
      section2: '`E_PROTO_ALIAS_DUP` is a rule nothing runs.',
      keys: ['E_PROTO_ALIAS_DUP'],
    })
    expect(checkDiagnosticSync({ root })).toEqual([])
  })
})

/* ------------------------------------------------- (h) manifest identity */

describe('manifest-identity', () => {
  /**
   * The defect this reproduces shipped in 0.2.0 and no gate could see it: the
   * npm package is PolyForm Noncommercial, and the plugin manifest beside it
   * granted MIT. Three more manifests still read `0.1.0` while npm served
   * `0.2.0`. Every one of those is a claim about the published package made in
   * a file nothing compares to the published package.
   */
  const manifests = async ({
    version = '0.2.1',
    license = 'PolyForm-Noncommercial-1.0.0',
    lockVersion = version,
    marketVersion = version,
    pluginVersion = version,
    pluginLicense = license,
  } = {}) => {
    await put('framework/portal/package.json', JSON.stringify({ version, license }))
    await put(
      'framework/portal/package-lock.json',
      JSON.stringify({ version: lockVersion, packages: { '': { version: lockVersion } } }),
    )
    await put(
      '.claude-plugin/marketplace.json',
      JSON.stringify({ version: marketVersion, plugins: [{ version: marketVersion }] }),
    )
    await put(
      'marketplace/plugins/metaframework/.claude-plugin/plugin.json',
      JSON.stringify({ version: pluginVersion, license: pluginLicense }),
    )
    await put('framework/portal/README.md', `\`\`\`text\n  metaframework ${version}\n\`\`\`\n`)
  }

  it('goes RED when the plugin manifest grants a licence the package does not', async () => {
    await manifests({ pluginLicense: 'MIT' })
    expect(codes(checkManifestIdentity({ root }))).toEqual(
      expect.arrayContaining([expect.stringContaining('MIT')]),
    )
  })

  it('goes RED when a manifest version lags the package', async () => {
    await manifests({ pluginVersion: '0.1.0' })
    expect(codes(checkManifestIdentity({ root }))).toEqual(
      expect.arrayContaining([expect.stringContaining('0.1.0')]),
    )
  })

  it('names every stale pointer, not just the first', async () => {
    await manifests({ marketVersion: '0.1.0' })
    expect(checkManifestIdentity({ root })).toHaveLength(2)
  })

  it('sees the lockfile the published manifest is packed beside', async () => {
    await manifests({ lockVersion: '0.1.1' })
    expect(codes(checkManifestIdentity({ root }))).toEqual(
      expect.arrayContaining([expect.stringContaining('0.1.1')]),
    )
  })

  /**
   * The README's sample banner is a version claim too — it just is not JSON.
   * It is the fifth restatement, and the one a reader meets first.
   */
  it('goes RED when the README banner still prints the previous version', async () => {
    await manifests()
    await put('framework/portal/README.md', '```text\n  metaframework 0.1.0\n```\n')
    expect(codes(checkManifestIdentity({ root }))).toEqual(
      expect.arrayContaining([expect.stringContaining('0.1.0')]),
    )
  })

  it('is green when every manifest agrees', async () => {
    await manifests()
    await put('framework/portal/README.md', '```text\n  metaframework 0.2.1\n```\n')
    expect(checkManifestIdentity({ root })).toEqual([])
  })

  /**
   * An absent manifest must not read as agreement. This is the `embeddedUrls`
   * lesson: the empty answer is the dangerous one, because it reports nothing
   * wrong and exits 0.
   */
  it('goes RED on a manifest it cannot read rather than reporting agreement', async () => {
    await put('framework/portal/package.json', JSON.stringify({ version: '0.2.1', license: 'x' }))
    expect(checkManifestIdentity({ root }).length).toBeGreaterThan(0)
  })

  it('goes RED when the published manifest itself is unparseable', async () => {
    await manifests()
    await put('framework/portal/package.json', '{ not json')
    const findings = checkManifestIdentity({ root })
    expect(findings.map((f) => f.file)).toEqual(['framework/portal/package.json'])
    expect(findings[0].message).toMatch(/not parseable/)
  })
})

/* --------------------------------------------- the repository, as it is */

describe('the repository itself', () => {
  const files = trackedFiles(REPO_ROOT)

  it('tracks a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  for (const check of CHECKS) {
    it(`is clean: ${check.title}`, () => {
      const findings = check.run({ root: REPO_ROOT, files })
      expect(findings.map((f) => `${f.file}${f.line ? `:${f.line}` : ''} — ${f.message}`)).toEqual(
        [],
      )
    })
  }

  it('runs every check through one entry point', () => {
    expect(runHygiene({ root: REPO_ROOT, files })).toEqual([])
  })
})
