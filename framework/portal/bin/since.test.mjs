import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { repositoryRoot, unbumpedSince } from './since.mjs'

/**
 * The gate answers one question — "did the net change to this entity come with
 * a version bump" — so every test here is a different way of changing an entity
 * and a different correct answer. The cases that matter are the ones where a
 * naive implementation says yes: a status-only edit, a brand-new entity, and a
 * change to a child that the parent must not be blamed for.
 */

const scratch = []
afterAll(async () => {
  await Promise.all(scratch.map((dir) => rm(dir, { recursive: true, force: true })))
})

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' })

function document(version, status, body = 'Body.') {
  return [
    '---',
    'name: order',
    'kind: datamodel',
    `version: ${version}`,
    'title: Order',
    'summary: An order.',
    `status: ${status}`,
    '---',
    '',
    body,
    '',
  ].join('\n')
}

async function makeRepo() {
  const root = await mkdtemp(path.join(tmpdir(), 'metaframework-since-'))
  scratch.push(root)
  git(root, ['init', '-b', 'main', '--quiet'])
  git(root, ['config', 'user.email', 't@t'])
  git(root, ['config', 'user.name', 't'])

  const write = async (rel, content) => {
    const file = path.join(root, rel)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, content)
  }
  const commit = (subject) => {
    git(root, ['add', '-A'])
    git(root, ['commit', '--quiet', '-m', subject])
    return git(root, ['rev-parse', 'HEAD']).trim()
  }
  return { root, write, commit }
}

/** Everything under solutions/, which is what the CLI passes. */
const inCatalog = (file) => file.startsWith('solutions/')

describe('unbumpedSince', () => {
  it('catches an artifact changed without a version bump', async () => {
    const repo = await makeRepo()
    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'review'))
    await repo.write('solutions/acme/datamodel/order/schema.json', '{"title":"Order"}')
    const base = repo.commit('add order')

    await repo.write('solutions/acme/datamodel/order/schema.json', '{"title":"Order","x":1}')

    const result = await unbumpedSince({ repoRoot: repo.root, ref: base, inCatalog })
    expect(result.ok).toBe(true)
    expect(result.unbumped).toHaveLength(1)
    expect(result.unbumped[0].dir).toBe('solutions/acme/datamodel/order')
    expect(result.unbumped[0].version).toBe(1)
    expect(result.unbumped[0].changed).toEqual(['solutions/acme/datamodel/order/schema.json'])
  })

  it('passes when the version moved with the content', async () => {
    const repo = await makeRepo()
    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'review'))
    await repo.write('solutions/acme/datamodel/order/schema.json', '{}')
    const base = repo.commit('add order')

    await repo.write('solutions/acme/datamodel/order/schema.json', '{"x":1}')
    await repo.write('solutions/acme/datamodel/order/index.md', document(2, 'review'))

    const result = await unbumpedSince({ repoRoot: repo.root, ref: base, inCatalog })
    expect(result.unbumped).toEqual([])
    expect(result.entitiesTouched).toBe(1)
  })

  it('exempts a status-only edit, as evolution.md requires', async () => {
    const repo = await makeRepo()
    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'review'))
    const base = repo.commit('add order')

    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'approved'))

    expect((await unbumpedSince({ repoRoot: repo.root, ref: base, inCatalog })).unbumped).toEqual([])
  })

  it('still catches prose that changed alongside the status', async () => {
    const repo = await makeRepo()
    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'review'))
    const base = repo.commit('add order')

    // The exemption covers the status line, not everything in its commit.
    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'approved', 'Reworded.'))

    const result = await unbumpedSince({ repoRoot: repo.root, ref: base, inCatalog })
    expect(result.unbumped).toHaveLength(1)
  })

  it('does not blame a parent for a child entity', async () => {
    const repo = await makeRepo()
    await repo.write('solutions/acme/index.md', document(1, 'review'))
    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'review'))
    const base = repo.commit('solution and child')

    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'review', 'Child edit.'))

    const result = await unbumpedSince({ repoRoot: repo.root, ref: base, inCatalog })
    expect(result.unbumped.map((entity) => entity.dir)).toEqual(['solutions/acme/datamodel/order'])
  })

  it('says nothing about a brand-new entity', async () => {
    // There is no previous version it could have failed to bump.
    const repo = await makeRepo()
    await repo.write('solutions/acme/index.md', document(1, 'review'))
    const base = repo.commit('solution only')

    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'review'))
    await repo.write('solutions/acme/datamodel/order/schema.json', '{}')

    expect((await unbumpedSince({ repoRoot: repo.root, ref: base, inCatalog })).unbumped).toEqual([])
  })

  it('ignores files outside the catalog', async () => {
    const repo = await makeRepo()
    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'review'))
    await repo.write('README.md', 'hello')
    const base = repo.commit('add order and a readme')

    await repo.write('README.md', 'hello again')

    const result = await unbumpedSince({ repoRoot: repo.root, ref: base, inCatalog })
    expect(result.entitiesTouched).toBe(0)
    expect(result.unbumped).toEqual([])
  })

  it('reports an unresolvable ref rather than passing silently', async () => {
    const repo = await makeRepo()
    await repo.write('solutions/acme/datamodel/order/index.md', document(1, 'review'))
    repo.commit('add order')

    const result = await unbumpedSince({ repoRoot: repo.root, ref: 'no-such-ref', inCatalog })
    expect(result.ok).toBe(false)
    expect(result.failure).toContain('no-such-ref')
  })

  it('finds the repository root, and answers null outside one', async () => {
    const repo = await makeRepo()
    expect(await repositoryRoot(repo.root)).toBe(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: repo.root, encoding: 'utf8' }).trim())

    const loose = await mkdtemp(path.join(tmpdir(), 'metaframework-norepo-'))
    scratch.push(loose)
    expect(await repositoryRoot(loose)).toBeNull()
  })
})
