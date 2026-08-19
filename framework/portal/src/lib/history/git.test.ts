import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  clearHistoryCache,
  diffAgainstParent,
  diffRevisions,
  getEntityHistory,
  listEntityFiles,
  readFileAtRevision,
  resolveVersion,
  safeCatalogPath,
} from './git'

/**
 * These tests drive a real git repository rather than a mock. The whole point of
 * this module is the fidelity of its interaction with the git CLI — stderr
 * wording, exit codes, shallow clones — and a mock would assert the mock.
 */

const ORDER = 'acme/shop/datamodel/order'
const DOCUMENT = `${ORDER}/index.md`

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
  const dir = await mkdtemp(path.join(tmpdir(), 'metaframework-history-'))
  scratch.push(dir)
  return dir
}

interface Repo {
  root: string
  catalogDir: string
  write(relPath: string, content: string): Promise<void>
  commit(subject: string): string
}

async function makeRepo(): Promise<Repo> {
  const root = await tempDir()
  const catalogDir = path.join(root, 'solutions')
  await mkdir(catalogDir, { recursive: true })
  git(root, ['init', '-b', 'main', '--quiet'])

  return {
    root,
    catalogDir,
    async write(relPath, content) {
      const file = path.join(catalogDir, relPath)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    },
    commit(subject) {
      git(root, ['add', '-A'])
      git(root, ['commit', '--quiet', '-m', subject])
      return git(root, ['rev-parse', 'HEAD']).trim()
    },
  }
}

/** An entity document at a given version/status, with a body that changes with it. */
function document(version: number, status: string, extra = ''): string {
  return [
    '---',
    'name: order',
    'kind: datamodel',
    `version: ${version}`,
    'title: Order',
    'summary: A placed order.',
    `status: ${status}`,
    '---',
    '',
    `Version ${version} of the order model.`,
    extra,
    '',
  ].join('\n')
}

let repo: Repo
let c1: string
let c2: string
let c3: string
let c4: string

beforeAll(async () => {
  repo = await makeRepo()

  // The worked example from evolution.md: a status-only commit that does not
  // bump, so version 1 must resolve to c2 rather than c1.
  await repo.write(DOCUMENT, document(1, 'draft'))
  c1 = repo.commit('add order')

  await repo.write(DOCUMENT, document(1, 'approved'))
  c2 = repo.commit('approve order')

  await repo.write(DOCUMENT, document(2, 'review', 'Added the optional discount.'))
  await repo.write(`${ORDER}/schema.json`, '{\n  "$id": "srn://acme/shop/datamodel/order@2"\n}\n')
  c3 = repo.commit('order: optional discount')

  await repo.write(DOCUMENT, document(3, 'approved', 'Added the refunded state.'))
  c4 = repo.commit('order: refunded state')

  clearHistoryCache()
})

afterAll(async () => {
  for (const dir of scratch) await rm(dir, { recursive: true, force: true })
})

describe('getEntityHistory', () => {
  it('lists every commit that touched the entity, newest first', async () => {
    const history = await getEntityHistory(ORDER, { catalogDir: repo.catalogDir })

    expect(history.unavailable).toBeNull()
    expect(history.revisions.map((r) => r.hash)).toEqual([c4, c3, c2, c1])
    expect(history.revisions[0].subject).toBe('order: refunded state')
    expect(history.revisions[0].author).toBe('Fixture')
    expect(new Date(history.revisions[0].date).getTime()).toBeGreaterThan(0)
  })

  it('records the frontmatter version each commit carried', async () => {
    const history = await getEntityHistory(ORDER, { catalogDir: repo.catalogDir })
    expect(history.revisions.map((r) => r.version)).toEqual([3, 2, 1, 1])
    expect(history.currentVersion).toBe(3)
  })

  it('indexes a version to the LAST commit carrying it, so status-only follow-ups win', async () => {
    const history = await getEntityHistory(ORDER, { catalogDir: repo.catalogDir })
    expect(history.versions).toEqual({ '1': c2, '2': c3, '3': c4 })
  })

  it('reports a clean, unshallow history as such', async () => {
    const history = await getEntityHistory(ORDER, { catalogDir: repo.catalogDir })
    expect(history.shallow).toBe(false)
    expect(history.truncated).toBe(false)
    expect(history.diagnostics).toEqual([])
  })
})

describe('resolveVersion', () => {
  it('resolves a pinned old version to its snapshot commit', async () => {
    const resolution = await resolveVersion(ORDER, 1, { catalogDir: repo.catalogDir })
    expect(resolution).toEqual({ version: 1, commit: c2, current: false, code: null, hint: null })
  })

  it('resolves the current version to the filesystem, not to a commit', async () => {
    const resolution = await resolveVersion(ORDER, 3, { catalogDir: repo.catalogDir })
    expect(resolution.current).toBe(true)
    expect(resolution.commit).toBeNull()
  })

  it('reports E_SRN_VERSION for a version that never existed', async () => {
    const resolution = await resolveVersion(ORDER, 9, { catalogDir: repo.catalogDir })
    expect(resolution.code).toBe('E_SRN_VERSION')
    expect(resolution.commit).toBeNull()
  })
})

describe('readFileAtRevision', () => {
  it('reads the entity document as it stood at a commit', async () => {
    const revision = await readFileAtRevision(DOCUMENT, c1, { catalogDir: repo.catalogDir })
    expect(revision.content).toContain('status: draft')
    expect(revision.content).toContain('version: 1')
    expect(revision.unavailable).toBeNull()
  })

  it('reads the working tree when the commit is null', async () => {
    const revision = await readFileAtRevision(DOCUMENT, null, { catalogDir: repo.catalogDir })
    expect(revision.content).toContain('version: 3')
  })

  it('reports a file that did not yet exist at that commit instead of throwing', async () => {
    const revision = await readFileAtRevision(`${ORDER}/schema.json`, c1, { catalogDir: repo.catalogDir })
    expect(revision.content).toBeNull()
    expect(revision.unavailable?.reason).toBe('not-committed')
  })

  it('refuses a revision that is not a hash', async () => {
    const revision = await readFileAtRevision(DOCUMENT, 'HEAD~1; rm -rf /', { catalogDir: repo.catalogDir })
    expect(revision.content).toBeNull()
    expect(revision.unavailable?.reason).toBe('git-error')
  })
})

describe('listEntityFiles', () => {
  it('lists the entity directory as it stood at a commit, paths relative to it', async () => {
    expect(await listEntityFiles(ORDER, c3, { catalogDir: repo.catalogDir })).toEqual(['index.md', 'schema.json'])
    expect(await listEntityFiles(ORDER, c1, { catalogDir: repo.catalogDir })).toEqual(['index.md'])
  })

  it('excludes a nested entity: its files belong to its own history', async () => {
    const nested = await makeRepo()
    await nested.write('acme/shop/index.md', document(1, 'draft'))
    await nested.write('acme/shop/transport.yaml', 'kind: kafka\n')
    await nested.write('acme/shop/checkout/index.md', document(1, 'draft'))
    await nested.write('acme/shop/checkout/workflows/place-order.yaml', 'steps: []\n')
    const head = nested.commit('product with a child component')
    clearHistoryCache()

    expect(await listEntityFiles('acme/shop', head, { catalogDir: nested.catalogDir })).toEqual([
      'index.md',
      'transport.yaml',
    ])
    expect(await listEntityFiles('acme/shop/checkout', head, { catalogDir: nested.catalogDir })).toEqual([
      'index.md',
      'workflows/place-order.yaml',
    ])
  })
})

describe('diffs', () => {
  it('returns structured hunks with line numbers on both sides', async () => {
    const diff = await diffRevisions(DOCUMENT, c1, c4, { catalogDir: repo.catalogDir })

    expect(diff.unavailable).toBeNull()
    expect(diff.identical).toBe(false)
    expect(diff.hunks.length).toBeGreaterThan(0)

    const removed = diff.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.type === 'removed')
    const addedLines = diff.hunks.flatMap((hunk) => hunk.lines).filter((line) => line.type === 'added')
    expect(removed.map((line) => line.text)).toContain('version: 1')
    expect(addedLines.map((line) => line.text)).toContain('version: 3')
    expect(diff.added).toBe(addedLines.length)
    expect(diff.removed).toBe(removed.length)

    // Every line carries a number on exactly the sides it exists on.
    for (const line of diff.hunks.flatMap((hunk) => hunk.lines)) {
      expect(line.oldLine === null).toBe(line.type === 'added')
      expect(line.newLine === null).toBe(line.type === 'removed')
    }

    const first = diff.hunks[0]
    expect(first.lines[0].newLine).toBe(first.newStart)
  })

  it('reports two identical revisions as no changes', async () => {
    const diff = await diffRevisions(DOCUMENT, c4, c4, { catalogDir: repo.catalogDir })
    expect(diff.identical).toBe(true)
    expect(diff.hunks).toEqual([])
    expect(diff.unavailable).toBeNull()
  })

  it('diffs a root commit against the empty tree rather than failing on a missing parent', async () => {
    const diff = await diffAgainstParent(DOCUMENT, c1, { catalogDir: repo.catalogDir })
    expect(diff.unavailable).toBeNull()
    expect(diff.removed).toBe(0)
    expect(diff.added).toBeGreaterThan(0)
  })

  it('diffs a commit against the working tree when `to` is null', async () => {
    const dirty = await makeRepo()
    await dirty.write(DOCUMENT, document(1, 'approved'))
    const head = dirty.commit('add order')
    await dirty.write(DOCUMENT, document(2, 'review', 'Uncommitted work.'))
    clearHistoryCache()

    const diff = await diffRevisions(DOCUMENT, head, null, { catalogDir: dirty.catalogDir })
    expect(diff.to).toBeNull()
    expect(diff.identical).toBe(false)
    expect(diff.hunks.flatMap((hunk) => hunk.lines).map((line) => line.text)).toContain('version: 2')
  })

  it('refuses a revision that is not a hash', async () => {
    const diff = await diffRevisions(DOCUMENT, '--output=/tmp/pwned', c4, { catalogDir: repo.catalogDir })
    expect(diff.unavailable?.reason).toBe('git-error')
    expect(diff.hunks).toEqual([])
  })
})

describe('E_VER_REGRESSION', () => {
  it('flags a version that jumps by more than one', async () => {
    const jumpy = await makeRepo()
    await jumpy.write(DOCUMENT, document(1, 'draft'))
    jumpy.commit('v1')
    await jumpy.write(DOCUMENT, document(3, 'draft'))
    jumpy.commit('v3')
    clearHistoryCache()

    const history = await getEntityHistory(ORDER, { catalogDir: jumpy.catalogDir })
    expect(history.diagnostics.map((d) => d.code)).toEqual(['E_VER_REGRESSION'])
    expect(history.diagnostics[0].message).toContain('1 → 3')
  })

  it('flags a version that goes backwards', async () => {
    const backwards = await makeRepo()
    await backwards.write(DOCUMENT, document(2, 'draft'))
    backwards.commit('v2')
    await backwards.write(DOCUMENT, document(1, 'draft'))
    backwards.commit('v1')
    clearHistoryCache()

    const history = await getEntityHistory(ORDER, { catalogDir: backwards.catalogDir })
    expect(history.diagnostics[0]?.code).toBe('E_VER_REGRESSION')
    expect(history.diagnostics[0]?.severity).toBe('error')
  })
})

describe('graceful degradation', () => {
  it('degrades instead of throwing when there is no repository at all', async () => {
    const bare = await tempDir()
    await mkdir(path.join(bare, ORDER), { recursive: true })
    await writeFile(path.join(bare, DOCUMENT), document(1, 'draft'))
    clearHistoryCache()

    const history = await getEntityHistory(ORDER, { catalogDir: bare })
    expect(history.unavailable?.reason).toBe('not-a-repository')
    expect(history.revisions).toEqual([])
    expect(history.versions).toEqual({})
    // The filesystem is still readable, so the current version is still known.
    expect(history.currentVersion).toBe(1)

    const diff = await diffRevisions(DOCUMENT, 'a'.repeat(40), null, { catalogDir: bare })
    expect(diff.unavailable?.reason).toBe('not-a-repository')
    expect(await listEntityFiles(ORDER, 'a'.repeat(40), { catalogDir: bare })).toEqual([])
  })

  it('degrades when the catalog directory does not exist', async () => {
    clearHistoryCache()
    const history = await getEntityHistory(ORDER, { catalogDir: path.join(tmpdir(), 'metaframework-absent-xyz') })
    expect(history.unavailable?.reason).toBe('not-a-repository')
    expect(history.revisions).toEqual([])
  })

  it('reports an entity inside a real repository that was never committed', async () => {
    const fresh = await makeRepo()
    await fresh.write('acme/shop/datamodel/other/index.md', document(1, 'draft'))
    fresh.commit('commit an unrelated entity')
    // Written, then deliberately left out of the index.
    await fresh.write(DOCUMENT, document(1, 'draft'))
    clearHistoryCache()

    const history = await getEntityHistory(ORDER, { catalogDir: fresh.catalogDir })
    expect(history.unavailable?.reason).toBe('not-committed')
    expect(history.revisions).toEqual([])
    // The filesystem still answers "what is current", which is the point of
    // degrading rather than failing.
    expect(history.currentVersion).toBe(1)
  })

  it('marks a shallow clone and hints at how to deepen it', async () => {
    const clone = await tempDir()
    execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${repo.root}`, clone], {
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    })
    clearHistoryCache()

    const catalogDir = path.join(clone, 'solutions')
    const history = await getEntityHistory(ORDER, { catalogDir })
    expect(history.shallow).toBe(true)
    expect(history.revisions).toHaveLength(1)
    expect(history.currentVersion).toBe(3)

    // The versions the truncated history cannot reach fail loudly but usefully.
    const resolution = await resolveVersion(ORDER, 1, { catalogDir })
    expect(resolution.code).toBe('E_SRN_VERSION')
    expect(resolution.hint).toMatch(/unshallow/)
  })
})

describe('safeCatalogPath', () => {
  const options = { catalogDir: '/catalog' }

  it('accepts an ordinary catalog path', () => {
    expect(safeCatalogPath('acme/shop/datamodel/order/index.md', options)).toBe(
      'acme/shop/datamodel/order/index.md',
    )
    expect(safeCatalogPath('acme/shop/protocol/x/workflows/place-order.yaml', options)).toBe(
      'acme/shop/protocol/x/workflows/place-order.yaml',
    )
  })

  it('rejects every shape of traversal', () => {
    for (const attempt of [
      '../../etc/passwd',
      'acme/../../etc/passwd',
      '/etc/passwd',
      'acme//shop',
      '.git/config',
      'acme/.git/config',
      'acme\\shop',
      'acme/shop\u0000.md',
      '--upload-pack=touch /tmp/pwned',
      '',
    ]) {
      expect(safeCatalogPath(attempt, options), attempt).toBeNull()
    }
  })

  it('rejects non-strings', () => {
    expect(safeCatalogPath(undefined, options)).toBeNull()
    expect(safeCatalogPath(42, options)).toBeNull()
    expect(safeCatalogPath(['acme'], options)).toBeNull()
  })

  it('refuses to read outside the catalog even through a rejected path', async () => {
    const revision = await readFileAtRevision('../../../../etc/passwd', null, { catalogDir: repo.catalogDir })
    expect(revision.content).toBeNull()
    expect(revision.unavailable?.reason).toBe('git-error')
  })
})
