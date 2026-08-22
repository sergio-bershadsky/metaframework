import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  build,
  CANONICAL_SCHEMA_HOST,
  collect,
  REPO_ROOT,
  SERVED_DIR,
} from './build-schema-site.mjs'

/**
 * The schema site, driven the way the hygiene gate is: a synthetic tree that
 * must make each refusal fire, and the real repository, which must build.
 *
 * The refusals matter more than the happy path here. This script publishes to
 * the open web under the URL every catalog's `$ref`s point at, so its two
 * failure modes are a document that lies about its own identity and a scope
 * that quietly widens to include somebody's private architecture. Both are
 * asserted below.
 */

const temps = []

function tree({ schemas = {}, extra = {} } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'schema-site-'))
  temps.push(root)
  const base = path.join(root, 'solutions', SERVED_DIR)
  for (const [name, doc] of Object.entries(schemas)) {
    mkdirSync(path.join(base, name), { recursive: true })
    writeFileSync(
      path.join(base, name, 'schema.json'),
      typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2),
    )
  }
  for (const [rel, doc] of Object.entries(extra)) {
    mkdirSync(path.join(root, 'solutions', rel), { recursive: true })
    writeFileSync(path.join(root, 'solutions', rel, 'schema.json'), JSON.stringify(doc, null, 2))
  }
  return root
}

const at = (name) => `${CANONICAL_SCHEMA_HOST}/${SERVED_DIR}/${name}`

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

describe('the refusals', () => {
  it('refuses a schema whose $id disagrees with where it would be served', () => {
    const root = tree({ schemas: { 'transport-document': { $id: at('workflow-document') } } })
    // The whole point: a resolver caches what it reads under the $id it read,
    // so serving this would break every $ref that followed the URL here.
    expect(() => collect(root)).toThrow(/would be served at .* but its \$id says/)
  })

  it('refuses a schema with no $id at all', () => {
    const root = tree({ schemas: { 'transport-document': { title: 'no identity' } } })
    expect(() => collect(root)).toThrow(/\(absent\)/)
  })

  it('refuses a schema that is not valid JSON', () => {
    const root = tree({ schemas: { 'transport-document': '{ "$id": ' } })
    expect(() => collect(root)).toThrow(/is not valid JSON/)
  })

  it('serves the framework directory only, whatever else the catalog holds', () => {
    const root = tree({
      schemas: { 'transport-document': { $id: at('transport-document') } },
      // A private catalog's datamodel, sitting in the same tree. Its identity is
      // on this host; its bytes are not this host's to publish.
      extra: { 'acme/datamodel/money': { $id: `${CANONICAL_SCHEMA_HOST}/acme/datamodel/money` } },
    })
    const names = collect(root).map((schema) => schema.name)
    expect(names).toEqual(['transport-document'])
  })
})

describe('the real repository', () => {
  it('builds, and every document is served under the identity it claims', () => {
    const schemas = collect(REPO_ROOT)
    expect(schemas.length).toBeGreaterThan(0)
    for (const { name, url, body } of schemas) {
      expect(url).toBe(at(name))
      expect(JSON.parse(body).$id).toBe(url)
    }
  })

  it('passes the bytes through untouched', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'schema-site-out-'))
    temps.push(out)
    const { schemas } = build({ root: REPO_ROOT, out })
    // Its own floor: a build that served nothing would pass this loop silently,
    // and the preceding test is the only thing establishing otherwise today.
    expect(schemas.length).toBeGreaterThan(0)
    for (const { name } of schemas) {
      const served = readFileSync(path.join(out, SERVED_DIR, name), 'utf8')
      const source = readFileSync(
        path.join(REPO_ROOT, 'solutions', SERVED_DIR, name, 'schema.json'),
        'utf8',
      )
      // A courier, not an editor: reformatting here would mean the document
      // served and the document reviewed are not the same file.
      expect(served).toBe(source)
    }
  })

  it('states the media type, because an extensionless path cannot imply one', () => {
    const out = mkdtempSync(path.join(tmpdir(), 'schema-site-hdr-'))
    temps.push(out)
    build({ root: REPO_ROOT, out })
    const headers = readFileSync(path.join(out, '_headers'), 'utf8')
    expect(headers).toContain(`/${SERVED_DIR}/*`)
    expect(headers).toContain('application/schema+json')
    // Browser-based validators fetch cross-origin; without this they cannot.
    expect(headers).toContain('Access-Control-Allow-Origin: *')
    // The URL addresses the CURRENT schema, so it must not be cached forever.
    expect(headers).toMatch(/max-age=\d{1,4}\b/)
    expect(headers).not.toContain('immutable')
  })
})
