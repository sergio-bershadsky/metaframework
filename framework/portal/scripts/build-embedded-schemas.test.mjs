import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { EMBEDDED_META_SCHEMAS } from '@/lib/schema/embedded'
import { EMBEDDED_MODULE, renderEmbeddedModule } from './build-embedded-schemas.mjs'
import { CANONICAL_SCHEMA_HOST, REPO_ROOT, SERVED_DIR, collect } from './build-schema-site.mjs'

/**
 * The embedded copies, held to the catalog they were copied from.
 *
 * The portal now answers the framework's own `$schema` URLs out of a module of
 * string literals, because a catalog that is not this repository has no
 * `metaframework` solution to read them from. That buys a copy, and a copy is
 * only worth having while it is true — so the generator is re-run here on every
 * `npm test` and the result compared byte for byte. Editing a meta-schema and
 * forgetting to regenerate is a red suite, not a portal quietly serving last
 * week's contract to everybody who is not looking at this repository.
 *
 * The failure this file is really guarding against is the one
 * `state-machine-document.schema.json` already demonstrates: a generated
 * document drifts from its generator, the drift is noticed, and it is parked in
 * an `it.todo` because closing it turns out to be work. There is nothing to park
 * here — regenerating is one command — provided the comparison actually fails
 * when the copies are wrong, which is what the second half of this file is for.
 */

const temps = []

afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

/**
 * The real eight, copied into a temp tree, with one document rewritten. The
 * point is a tree that is *almost* this repository: a mutation the generator
 * must still notice is the only thing that proves the equality below compares
 * two things rather than one.
 */
function treeLike({ omit = null, mutate = null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'embedded-schemas-'))
  temps.push(root)
  for (const { name, body } of collect(REPO_ROOT)) {
    if (name === omit) continue
    const dir = path.join(root, 'solutions', SERVED_DIR, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'schema.json'), mutate?.name === name ? mutate.body : body)
  }
  return root
}

const checkedIn = () => readFileSync(EMBEDDED_MODULE, 'utf8')

describe('the checked-in module', () => {
  it('is exactly what the generator emits today', () => {
    expect(checkedIn()).toBe(renderEmbeddedModule(REPO_ROOT))
  })

  it('holds every document the canonical host publishes, and nothing else', () => {
    const expected = collect(REPO_ROOT).map(({ name }) => `${SERVED_DIR}/${name}`)
    // Its own floor: two empty lists are equal, and a generator that embedded
    // nothing would pass every other assertion in this file.
    expect(expected.length).toBeGreaterThan(0)
    expect(Object.keys(EMBEDDED_META_SCHEMAS).sort()).toEqual(expected.sort())
  })

  it('carries the bytes of the file it copies, through the escaping and back', () => {
    // The round trip, asserted on the value rather than on the module text:
    // a template literal normalises some characters and escapes others, and
    // these documents contain backticks and backslashes. Byte-identity here is
    // what lets the route serve a copy and call it the document.
    for (const { name, body } of collect(REPO_ROOT)) {
      expect(EMBEDDED_META_SCHEMAS[`${SERVED_DIR}/${name}`], name).toBe(body)
    }
  })

  it('is keyed by the address each document claims as its identity', () => {
    // `collect` refuses a document whose `$id` disagrees with where the *site*
    // would serve it; this is the other end of the same join — the key the
    // route indexes by, which is what the portal actually answers at.
    for (const [key, body] of Object.entries(EMBEDDED_META_SCHEMAS)) {
      expect(JSON.parse(body).$id, key).toBe(`${CANONICAL_SCHEMA_HOST}/${key}`)
    }
  })
})

describe('the drift the comparison has to catch', () => {
  it('sees a single changed byte in a source schema', () => {
    const [{ name, body }] = collect(REPO_ROOT)
    const root = treeLike({ mutate: { name, body: body.replace('"title"', '"titel"') } })
    expect(renderEmbeddedModule(root)).not.toBe(checkedIn())
  })

  it('sees a schema that stopped being copied at all', () => {
    const [{ name }] = collect(REPO_ROOT)
    const root = treeLike({ omit: name })
    expect(collect(root).length).toBe(collect(REPO_ROOT).length - 1)
    expect(renderEmbeddedModule(root)).not.toBe(checkedIn())
  })

  it('refuses a document whose $id disagrees with where it would be served', () => {
    // Inherited from `build-schema-site.mjs`, not restated: one refusal, two
    // consumers. A document that calls itself something other than where it
    // lives poisons every resolver that fetches it.
    const [{ name, body }] = collect(REPO_ROOT)
    const root = treeLike({
      mutate: { name, body: body.replace(`${SERVED_DIR}/${name}`, `${SERVED_DIR}/somewhere-else`) },
    })
    expect(() => renderEmbeddedModule(root)).toThrow(/would be served at .* but its \$id says/)
  })
})
