import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GET, OPTIONS } from './route'

/**
 * The /artifacts route against the shipped catalog — the same posture as the
 * /schemas assertions in fixture-check.test.ts: the handler is called directly
 * with the request Next would have built, so the whole whitelist (path
 * validation, SRN grammar, role table, disk read) runs exactly as deployed.
 */

const CATALOG = path.resolve(process.cwd(), '../../solutions')

function get(segments: string[], headers?: Record<string, string>): Promise<Response> {
  return GET(new Request(`http://localhost:3000/artifacts/${segments.join('/')}`, { headers }), {
    params: Promise.resolve({ path: segments }),
  })
}

describe('/artifacts route', () => {
  it('serves protocol transport bytes as YAML', async () => {
    const response = await get(['acme', 'protocol', 'settlement.transport'])

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/yaml')
    expect(response.headers.get('etag')).toMatch(/^".+"$/)
    expect(response.headers.get('content-location')).toBe('/artifacts/acme/protocol/settlement.transport')
    expect(await response.text()).toBe(
      await readFile(path.join(CATALOG, 'acme/protocol/settlement/transport.yaml'), 'utf8'),
    )
  })

  it('maps a depth-2 family member through the role table', async () => {
    const response = await get(['acme', 'protocol', 'settlement.workflows.settle-order'])

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/yaml')
    expect(await response.text()).toBe(
      await readFile(path.join(CATALOG, 'acme/protocol/settlement/workflows/settle-order.yaml'), 'utf8'),
    )
  })

  it('serves JSON artifacts as application/json', async () => {
    for (const segments of [
      ['acme', 'protocol', 'settlement.states'],
      ['acme', 'datamodel', 'money.examples.forty-nine-ninety'],
    ]) {
      const response = await get(segments)
      expect(response.status, segments.join('/')).toBe(200)
      expect(response.headers.get('content-type'), segments.join('/')).toContain('application/json')
      // Honest media type means the body must actually parse as JSON.
      expect(await response.json()).toBeTypeOf('object')
    }
  })

  it('serves the single-role kinds — journey and environment', async () => {
    for (const segments of [
      ['acme', 'journey', 'first-purchase.journey'],
      ['acme', 'environment', 'production.topology'],
    ]) {
      const response = await get(segments)
      expect(response.status, segments.join('/')).toBe(200)
      expect(response.headers.get('content-type'), segments.join('/')).toContain('application/yaml')
    }
  })

  it('answers .schema with a permanent redirect to the /schemas URL', async () => {
    // One schema document, one URL: the bytes live under /schemas and only
    // there, so the artifact address forwards rather than serving a copy.
    const response = await get(['acme', 'datamodel', 'money.schema'])

    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('/schemas/acme/datamodel/money')
    expect(await response.text()).toBe('')
  })

  it('revalidates with a 304 when the ETag matches', async () => {
    const first = await get(['acme', 'protocol', 'settlement.states'])
    const etag = first.headers.get('etag') as string

    const second = await get(['acme', 'protocol', 'settlement.states'], { 'if-none-match': etag })
    expect(second.status).toBe(304)
    expect(await second.text()).toBe('')
  })

  it('rejects illegal suffixes with the E_SRN_ARTIFACT message', async () => {
    // One case per rule of the role table: role-less kinds (solution, actor),
    // unknown role, family without a name, fixed role with a tail.
    const cases: Array<[string[], string]> = [
      [['acme.anything'], 'solution has no roles'],
      [['acme', 'actor', 'customer.profile'], 'actor has no roles'],
      [['acme', 'protocol', 'settlement.topology'], '"topology" is not a protocol role'],
      [['acme', 'protocol', 'settlement.workflows'], 'workflows.* is depth 2'],
      [['acme', 'datamodel', 'money.schema.extra'], 'schema is depth 1'],
    ]
    for (const [segments, message] of cases) {
      const response = await get(segments)
      expect(response.status, segments.join('/')).toBe(404)
      const { error } = (await response.json()) as { error: string }
      expect(error, segments.join('/')).toContain('E_SRN_ARTIFACT')
      expect(error, segments.join('/')).toContain(message)
    }
  })

  it('rejects suffixes the lexer refuses, with the lexer’s message', async () => {
    const cases: Array<[string[], string]> = [
      // An empty artifact name dies on the segment alphabet.
      [['acme', 'protocol', 'settlement.'], 'bad artifact segment'],
      // The two suffixes compose in exactly one written order.
      [['acme', 'protocol', 'settlement@1.transport'], 'artifact suffix precedes @version'],
    ]
    for (const [segments, message] of cases) {
      const response = await get(segments)
      expect(response.status, segments.join('/')).toBe(404)
      expect(((await response.json()) as { error: string }).error, segments.join('/')).toContain(message)
    }
  })

  it('refuses an entity address — this route serves artifacts only', async () => {
    const response = await get(['acme', 'protocol', 'settlement'])
    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: string }).error).toContain('no artifact suffix')
  })

  it('refuses a pinned read rather than serving today’s bytes under a pin', async () => {
    const response = await get(['acme', 'protocol', 'settlement.transport@1'])
    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: string }).error).toContain('current snapshot')
  })

  it('serves .arazzo as YAML from the entity that ships one', async () => {
    // The role landed in 0020 with no instance anywhere, and this assertion is
    // what changed when the catalog grew one: `settlement.arazzo` used to be a
    // dangling case below. Both states are correct for the same reason — a role
    // is legal because the table says so, and 404 or 200 turns on the file.
    const response = await get(['acme', 'protocol', 'settlement.arazzo'])

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/yaml')
    expect(await response.text()).toBe(
      await readFile(path.join(CATALOG, 'acme/protocol/settlement/arazzo.yaml'), 'utf8'),
    )
  })

  it('names a legal role whose file is absent as dangling', async () => {
    // `openapi` is in the vocabulary and settlement does not ship one;
    // `examples.nope` is a well-formed family member nobody wrote. A role is
    // legal because the table says so, not because a file exists.
    for (const segments of [
      ['acme', 'protocol', 'settlement.openapi'],
      ['acme', 'datamodel', 'money.examples.nope'],
    ]) {
      const response = await get(segments)
      expect(response.status, segments.join('/')).toBe(404)
      expect(((await response.json()) as { error: string }).error, segments.join('/')).toContain(
        'E_SRN_DANGLING',
      )
    }
  })

  it('refuses a path that climbs out of the catalog', async () => {
    for (const segments of [
      ['acme', '..', '..', 'framework', 'spec'],
      ['..', 'framework'],
      ['.git', 'config'],
    ]) {
      const response = await get(segments)
      expect(response.status, segments.join('/')).toBe(400)
    }
  })

  it('answers preflight for cross-origin consumers', async () => {
    const response = await OPTIONS()
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })
})
