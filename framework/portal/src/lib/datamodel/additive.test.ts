import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import { clearHistoryCache } from '../history/git'
import { additiveDiagnostics, datamodelEvolutionDiagnostics } from './additive'

/**
 * Two halves, tested the way each can be.
 *
 * The comparator is pure — two documents in, diagnostics out — so it is driven
 * with object literals, one pair per row of `kinds/datamodel.md`'s mechanical
 * table. Every row gets both directions: the tightening that must go RED and the
 * loosening beside it that must stay GREEN. A check that only ever sees
 * violations cannot tell whether it is a rule or a rubber stamp.
 *
 * The git half drives a real repository, for the reason `git.test.ts` gives: the
 * fidelity of the interaction with the git CLI is the thing under test, and a
 * mock would assert the mock.
 */

/* ------------------------------------------------------------------ the pure half */

/** A schema.json correct in every respect, so a spread overrides exactly one key. */
const doc = (extra: Record<string, unknown> = {}) => ({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://schemas.metaframework.dev/acme/datamodel/order',
  'x-srn': 'srn://acme/datamodel/order',
  type: 'object',
  ...extra,
})

const codes = (previous: unknown, current: unknown) => additiveDiagnostics(previous, current).map((d) => d.code)
const messages = (previous: unknown, current: unknown) => additiveDiagnostics(previous, current).map((d) => d.message)

describe('additiveDiagnostics — the eight decidable rows', () => {
  it('row 1: a removed property is RED, a kept-and-deprecated one GREEN', () => {
    const before = doc({ properties: { id: { type: 'string' }, status: { type: 'string' } } })

    expect(codes(before, doc({ properties: { id: { type: 'string' } } }))).toEqual(['E_DM_NOT_ADDITIVE'])
    // evolution.md: "`deprecated: true` is the additive replacement for property
    // removal." The declaration stays; only the intent changes.
    expect(
      codes(before, doc({ properties: { id: { type: 'string' }, status: { type: 'string', deprecated: true } } })),
    ).toEqual([])
  })

  it('row 1: a rename is caught as the removal it is', () => {
    const before = doc({ properties: { total: { type: 'number' } } })
    const after = doc({ properties: { amount: { type: 'number' } } })
    expect(messages(before, after)[0]).toContain('#/properties/total')
  })

  it('row 2: a name added to "required" is RED, a name removed GREEN', () => {
    const before = doc({ required: ['id'], properties: { id: {}, status: {} } })

    expect(codes(before, doc({ required: ['id', 'status'], properties: { id: {}, status: {} } }))).toEqual([
      'E_DM_NOT_ADDITIVE',
    ])
    // evolution.md marks this "legal (rarely wise, but additive)".
    expect(codes(before, doc({ required: [], properties: { id: {}, status: {} } }))).toEqual([])
  })

  it('row 2: an optional property added with the name in "required" is still RED', () => {
    // The trap the config kind states outright: the property is new, so it looks
    // like an addition, and every instance without it is now invalid.
    const before = doc({ properties: { id: {} } })
    const after = doc({ required: ['retries'], properties: { id: {}, retries: { type: 'integer' } } })
    expect(codes(before, after)).toEqual(['E_DM_NOT_ADDITIVE'])
  })

  it('row 3: a removed enum member is RED, an added one GREEN', () => {
    const before = doc({ properties: { status: { enum: ['placed', 'paid'] } } })

    expect(codes(before, doc({ properties: { status: { enum: ['paid'] } } }))).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(codes(before, doc({ properties: { status: { enum: ['placed', 'paid', 'refunded'] } } }))).toEqual([])
  })

  it('row 3: an enum where any value was accepted is RED; dropping the enum is GREEN', () => {
    const open = doc({ properties: { tag: { type: 'string' } } })
    const closed = doc({ properties: { tag: { type: 'string', enum: ['a', 'b'] } } })

    expect(codes(open, closed)).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(codes(closed, open)).toEqual([])
  })

  it('row 3: a `const` is judged as the enum of one that it is', () => {
    const open = doc({ properties: { kind: { type: 'string' } } })
    const pinned = doc({ properties: { kind: { const: 'card' } } })

    expect(codes(open, pinned)).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(codes(pinned, doc({ properties: { kind: { enum: ['card', 'sepa'] } } }))).toEqual([])
  })

  it('row 3: enum members are compared by value, not by key order', () => {
    const before = doc({ properties: { p: { enum: [{ a: 1, b: 2 }] } } })
    const after = doc({ properties: { p: { enum: [{ b: 2, a: 1 }] } } })
    expect(codes(before, after)).toEqual([])
  })

  it('row 4: a narrowed "type" is RED, a widened one GREEN', () => {
    const nullable = doc({ properties: { id: { type: ['string', 'null'] } } })
    const strict = doc({ properties: { id: { type: 'string' } } })

    expect(codes(nullable, strict)).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(codes(strict, nullable)).toEqual([])
  })

  it('row 4: "integer" → "number" widens, and the reverse narrows', () => {
    const integer = doc({ properties: { n: { type: 'integer' } } })
    const number = doc({ properties: { n: { type: 'number' } } })

    // Every integer is a number: a plain set difference would call this a
    // narrowing, and it is the one containment the vocabulary has.
    expect(codes(integer, number)).toEqual([])
    expect(codes(number, integer)).toEqual(['E_DM_NOT_ADDITIVE'])
  })

  it('row 4: adding "type" where the position accepted anything is RED', () => {
    expect(codes(doc({ properties: { p: {} } }), doc({ properties: { p: { type: 'string' } } }))).toEqual([
      'E_DM_NOT_ADDITIVE',
    ])
    expect(codes(doc({ properties: { p: { type: 'string' } } }), doc({ properties: { p: {} } }))).toEqual([])
  })

  it('row 5: a tightened bound is RED, a relaxed one GREEN', () => {
    const wide = doc({ properties: { name: { maxLength: 256, minItems: 0 } } })

    expect(codes(wide, doc({ properties: { name: { maxLength: 64, minItems: 0 } } }))).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(codes(wide, doc({ properties: { name: { maxLength: 256, minItems: 1 } } }))).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(codes(wide, doc({ properties: { name: { maxLength: 512, minItems: 0 } } }))).toEqual([])
  })

  it('row 5: a bound written where none stood is RED, and minLength 0 is not', () => {
    const open = doc({ properties: { name: { type: 'string' } } })

    expect(codes(open, doc({ properties: { name: { type: 'string', maxLength: 64 } } }))).toEqual(['E_DM_NOT_ADDITIVE'])
    // An absent `minLength` denotes 0, so writing it down changes nothing.
    expect(codes(open, doc({ properties: { name: { type: 'string', minLength: 0 } } }))).toEqual([])
  })

  it('row 6: a pattern added where none stood is RED; a changed one is deliberately silent', () => {
    const open = doc({ properties: { sku: { type: 'string' } } })
    const patterned = doc({ properties: { sku: { type: 'string', pattern: '^[a-z]+$' } } })

    expect(codes(open, patterned)).toEqual(['E_DM_NOT_ADDITIVE'])
    // Regular-expression containment is not decided here: firing on every edit
    // would report a genuine loosening as a break.
    expect(codes(patterned, doc({ properties: { sku: { type: 'string', pattern: '^[a-z]{3}$' } } }))).toEqual([])
    expect(codes(patterned, open)).toEqual([])
  })

  it('row 7: closing a schema is RED, opening one GREEN', () => {
    const open = doc({ properties: { id: {} } })
    const closed = doc({ properties: { id: {} }, additionalProperties: false })

    expect(codes(open, closed)).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(codes(closed, open)).toEqual([])
  })

  it('row 8: a retargeted $ref is RED, an untouched one GREEN', () => {
    const money = 'https://schemas.metaframework.dev/acme/datamodel/money'
    const before = doc({ properties: { total: { $ref: money } } })

    expect(
      codes(before, doc({ properties: { total: { $ref: `${money}-minor` } } })),
    ).toEqual(['E_DM_NOT_ADDITIVE'])
    // A target evolving additively is no edit here at all.
    expect(codes(before, doc({ properties: { total: { $ref: money } } }))).toEqual([])
  })

  it('row 8: names the ENTITY, so a rewritten schema-identity grammar is not a retarget', () => {
    // The three spellings this catalog's own `$ref`s have carried, in ADR order:
    // a relative path (0005), a serving address (0006), the canonical URL (0007).
    // Every migration between them rewrote the bytes and moved no target.
    const canonical = 'https://schemas.metaframework.dev/acme/datamodel/money'
    const serving = 'http://localhost:3000/schemas/acme/datamodel/money'
    const relative = '../../../../datamodel/money/schema.json'

    for (const old of [serving, relative]) {
      expect(codes(doc({ properties: { total: { $ref: old } } }), doc({ properties: { total: { $ref: canonical } } }))).toEqual([])
    }
    // And the check has not gone blind: two canonical URLs still answer.
    expect(
      codes(
        doc({ properties: { total: { $ref: serving } } }),
        doc({ properties: { total: { $ref: 'https://schemas.metaframework.dev/acme/datamodel/coupon' } } }),
      ),
    ).toEqual([])
    expect(
      codes(
        doc({ properties: { total: { $ref: canonical } } }),
        doc({ properties: { total: { $ref: 'https://schemas.metaframework.dev/acme/datamodel/coupon' } } }),
      ),
    ).toEqual(['E_DM_NOT_ADDITIVE'])
  })

  it('row 8: a document-local fragment is compared as written', () => {
    // `#/$defs/…` addresses a shape in this same file: no host, no migration,
    // nothing to resolve.
    expect(
      codes(doc({ properties: { p: { $ref: '#/$defs/a' } } }), doc({ properties: { p: { $ref: '#/$defs/b' } } })),
    ).toEqual(['E_DM_NOT_ADDITIVE'])
    expect(
      codes(doc({ properties: { p: { $ref: '#/$defs/a' } } }), doc({ properties: { p: { $ref: '#/$defs/a' } } })),
    ).toEqual([])
  })
})

describe('additiveDiagnostics — the walk', () => {
  it('finds a violation nested under properties, $defs and items', () => {
    const before = doc({
      $defs: { line: { properties: { sku: {}, qty: {} } } },
      properties: { lines: { type: 'array', items: { $ref: '#/$defs/line' } } },
    })
    const after = doc({
      $defs: { line: { properties: { sku: {} } } },
      properties: { lines: { type: 'array', items: { $ref: '#/$defs/line' } } },
    })
    expect(messages(before, after)).toEqual([expect.stringContaining('#/$defs/line/properties/qty')])
  })

  it('walks allOf branch-for-branch when the arity holds', () => {
    const base = 'https://schemas.metaframework.dev/acme/datamodel/base-record'
    const before = doc({ allOf: [{ $ref: base }, { properties: { total: {} } }] })
    const after = doc({ allOf: [{ $ref: base }, { properties: {} }] })
    expect(messages(before, after)).toEqual([expect.stringContaining('#/allOf/1/properties/total')])
  })

  it('says nothing inside a schema array whose length moved', () => {
    // Inserting a branch shifts every later position, so an element-wise walk
    // would report each shifted $ref as retargeted. Legal per evolution.md
    // ("Add an `allOf` branch introducing only optional properties") and, more
    // to the point, not decidable positionally.
    const a = 'https://schemas.metaframework.dev/acme/datamodel/a'
    const b = 'https://schemas.metaframework.dev/acme/datamodel/b'
    expect(codes(doc({ allOf: [{ $ref: a }] }), doc({ allOf: [{ $ref: b }, { $ref: a }] }))).toEqual([])
  })

  it('never walks into "not" or "if", where every rule would have the wrong sign', () => {
    // Removing a property from a `not` branch LOOSENS the schema around it.
    expect(codes(doc({ not: { properties: { x: {} } } }), doc({ not: { properties: {} } }))).toEqual([])
    expect(codes(doc({ if: { properties: { x: {} } } }), doc({ if: { properties: {} } }))).toEqual([])
    // `then` has ordinary polarity and is walked.
    expect(codes(doc({ then: { properties: { x: {} } } }), doc({ then: { properties: {} } }))).toEqual([
      'E_DM_NOT_ADDITIVE',
    ])
  })

  it('reports every violation in one document rather than the first', () => {
    const before = doc({ required: [], properties: { a: {}, b: { enum: ['x', 'y'] } } })
    const after = doc({ required: ['a'], properties: { a: {}, b: { enum: ['x'] } } })
    expect(codes(before, after)).toEqual(['E_DM_NOT_ADDITIVE', 'E_DM_NOT_ADDITIVE'])
  })

  it('carries the version span, the path and the SRN a caller supplies', () => {
    const found = additiveDiagnostics(doc({ properties: { a: {} } }), doc({ properties: {} }), {
      path: 'acme/datamodel/order/schema.json',
      srn: 'srn://acme/datamodel/order',
      previousVersion: 3,
      currentVersion: 4,
    })
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('error')
    expect(found[0].path).toBe('acme/datamodel/order/schema.json')
    expect(found[0].srn).toBe('srn://acme/datamodel/order')
    expect(found[0].message).toContain('v3 → v4')
  })

  it('says nothing about two identical documents, or about a non-object', () => {
    expect(codes(doc({ properties: { a: {} } }), doc({ properties: { a: {} } }))).toEqual([])
    expect(codes(null, doc())).toEqual([])
    expect(codes(doc(), 'not a schema')).toEqual([])
  })
})

/* -------------------------------------------------------------- the git half */

const scratch: string[] = []

/** Deterministic git, independent of whatever the developer's ~/.gitconfig says. */
function git(cwd: string, args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', ...args],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    },
  )
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'metaframework-additive-'))
  scratch.push(dir)
  return dir
}

interface Repo {
  catalogDir: string
  write(relPath: string, content: string): Promise<void>
  commit(subject: string): void
}

async function makeRepo(): Promise<Repo> {
  const root = await tempDir()
  const catalogDir = path.join(root, 'solutions')
  await mkdir(catalogDir, { recursive: true })
  git(root, ['init', '-b', 'main', '--quiet'])

  return {
    catalogDir,
    async write(relPath, content) {
      const file = path.join(catalogDir, relPath)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    },
    commit(subject) {
      git(root, ['add', '-A'])
      git(root, ['commit', '--quiet', '-m', subject])
    },
  }
}

const ORDER = 'acme/datamodel/order'

function entityDocument(version: number): string {
  return [
    '---',
    'name: order',
    'kind: datamodel',
    `version: ${version}`,
    'title: Order',
    'summary: A placed order.',
    'status: approved',
    'usage: both',
    '---',
    '',
    `Version ${version} of the order model.`,
    '',
  ].join('\n')
}

const SOLUTION = [
  '---',
  'name: acme',
  'kind: solution',
  'version: 1',
  'title: Acme',
  'summary: The worked example.',
  'status: approved',
  'vision: Sell things reliably.',
  '---',
  '',
  'A solution.',
  '',
].join('\n')

/** evolution.md's own version-1 listing, verbatim in shape. */
const V1_SCHEMA = JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://schemas.metaframework.dev/acme/datamodel/order',
    'x-srn': 'srn://acme/datamodel/order',
    type: 'object',
    required: ['id', 'total'],
    properties: {
      id: { type: 'string' },
      total: { type: 'number' },
      status: { enum: ['placed', 'paid'] },
    },
  },
  null,
  2,
)

/** evolution.md's "Legal version 2 (every v1 instance still validates)". */
const V2_ADDITIVE = JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://schemas.metaframework.dev/acme/datamodel/order',
    'x-srn': 'srn://acme/datamodel/order',
    type: 'object',
    required: ['id', 'total'],
    properties: {
      id: { type: 'string' },
      total: { type: 'number' },
      status: { enum: ['placed', 'paid', 'refunded'] },
      discount: { type: 'number' },
    },
  },
  null,
  2,
)

/** evolution.md's ILLEGAL column, in one document: a removal and a tightening. */
const V2_BREAKING = JSON.stringify(
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://schemas.metaframework.dev/acme/datamodel/order',
    'x-srn': 'srn://acme/datamodel/order',
    type: 'object',
    required: ['id', 'total'],
    properties: {
      id: { type: 'string' },
      amount: { type: 'number' },
    },
  },
  null,
  2,
)

/**
 * A repository holding `acme` with `order` at v1, then whatever the caller puts
 * in the working tree. The v2 document is deliberately left UNCOMMITTED in the
 * breaking case: that is the state a reviewer is in when the check has to speak.
 */
async function repoWithOrder(next: { version: number; schema: string } | null): Promise<Repo> {
  const repo = await makeRepo()
  await repo.write('acme/index.md', SOLUTION)
  await repo.write(`${ORDER}/index.md`, entityDocument(1))
  await repo.write(`${ORDER}/schema.json`, V1_SCHEMA)
  repo.commit('acme: the order model')

  if (next) {
    await repo.write(`${ORDER}/index.md`, entityDocument(next.version))
    await repo.write(`${ORDER}/schema.json`, next.schema)
  }
  clearHistoryCache()
  return repo
}

async function evolutionCodes(repo: Repo) {
  const catalog = await loadCatalog({ catalogDir: repo.catalogDir })
  return datamodelEvolutionDiagnostics(catalog, { catalogDir: repo.catalogDir })
}

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true })
})

describe('datamodelEvolutionDiagnostics — the working tree against the commit', () => {
  it('goes RED on a breaking version 2', async () => {
    const found = await evolutionCodes(await repoWithOrder({ version: 2, schema: V2_BREAKING }))

    expect(found.map((d) => d.code)).toEqual(['E_DM_NOT_ADDITIVE', 'E_DM_NOT_ADDITIVE'])
    expect(found.every((d) => d.severity === 'error')).toBe(true)
    expect(found.every((d) => d.path === `${ORDER}/schema.json`)).toBe(true)
    expect(found.every((d) => d.srn === 'srn://acme/datamodel/order')).toBe(true)
    expect(found.map((d) => d.message)).toEqual([
      expect.stringContaining('#/properties/total'),
      expect.stringContaining('#/properties/status'),
    ])
    expect(found[0].message).toContain('v1 → v2')
  })

  it('stays GREEN on the additive version 2 from evolution.md', async () => {
    expect(await evolutionCodes(await repoWithOrder({ version: 2, schema: V2_ADDITIVE }))).toEqual([])
  })

  it('stays GREEN once the breaking change is committed WITH its bump — the rule is not about commits', async () => {
    // The same two documents, both committed. The comparison is v(N−1) in git
    // against the tree, so committing a violation does not launder it.
    const repo = await repoWithOrder({ version: 2, schema: V2_BREAKING })
    repo.commit('order v2')
    clearHistoryCache()
    expect((await evolutionCodes(repo)).map((d) => d.code)).toEqual(['E_DM_NOT_ADDITIVE', 'E_DM_NOT_ADDITIVE'])
  })

  it('is silent at version 1, which has no predecessor to be a superset of', async () => {
    expect(await evolutionCodes(await repoWithOrder(null))).toEqual([])
  })

  it('is silent when the predecessor commit holds no schema.json', async () => {
    const repo = await makeRepo()
    await repo.write('acme/index.md', SOLUTION)
    await repo.write(`${ORDER}/index.md`, entityDocument(1))
    repo.commit('order, schema to follow')

    await repo.write(`${ORDER}/index.md`, entityDocument(2))
    await repo.write(`${ORDER}/schema.json`, V2_BREAKING)
    clearHistoryCache()

    expect(await evolutionCodes(repo)).toEqual([])
  })

  it('is silent when the predecessor will not parse — that is the commit’s finding', async () => {
    const repo = await makeRepo()
    await repo.write('acme/index.md', SOLUTION)
    await repo.write(`${ORDER}/index.md`, entityDocument(1))
    await repo.write(`${ORDER}/schema.json`, '{ not json')
    repo.commit('order with a broken schema')

    await repo.write(`${ORDER}/index.md`, entityDocument(2))
    await repo.write(`${ORDER}/schema.json`, V2_BREAKING)
    clearHistoryCache()

    expect(await evolutionCodes(repo)).toEqual([])
  })

  it('is silent when the predecessor version was never committed', async () => {
    // v1 skipped straight past the index: the entity arrives at v2. That is
    // `E_VER_REGRESSION`'s finding if it is anyone's, and never an accusation of
    // breaking a version nobody can read.
    const repo = await makeRepo()
    await repo.write('acme/index.md', SOLUTION)
    await repo.write(`${ORDER}/index.md`, entityDocument(2))
    await repo.write(`${ORDER}/schema.json`, V2_BREAKING)
    repo.commit('order, born at v2')
    clearHistoryCache()

    expect(await evolutionCodes(repo)).toEqual([])
  })

  it('is silent without git, like everything else that reads the past', async () => {
    const bare = await tempDir()
    const catalogDir = path.join(bare, 'solutions')
    await mkdir(path.join(catalogDir, ORDER), { recursive: true })
    await writeFile(path.join(catalogDir, 'acme/index.md'), SOLUTION)
    await writeFile(path.join(catalogDir, ORDER, 'index.md'), entityDocument(2))
    await writeFile(path.join(catalogDir, ORDER, 'schema.json'), V2_BREAKING)
    clearHistoryCache()

    expect(await evolutionCodes({ catalogDir } as Repo)).toEqual([])
  })
})
