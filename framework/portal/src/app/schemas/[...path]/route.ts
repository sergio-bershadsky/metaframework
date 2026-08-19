import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { catalogDir } from '@/lib/catalog'
import { safeCatalogPath } from '@/lib/history/git'
import { dirToSrn } from '@/lib/srn/srn'

/**
 * Serve `schema.json` at the URL that is its `$id`.
 *
 * This route is the whole reason a datamodel's identity is an HTTP URL rather
 * than a file path: it makes every `$ref` in the catalog **dereferenceable**.
 * `ajv-cli`, `json-schema-to-typescript`, `quicktype` and any browser-based
 * validator can follow `http://localhost:3000/schemas/acme/datamodel/money`
 * without knowing anything about this framework, this repository, or where the
 * files live (decision-record 2026-08-19-c).
 *
 * The URL path after `/schemas/` is the entity's SRN path verbatim:
 *
 *     GET /schemas/acme/product/shop/datamodel/order-line
 *       → solutions/acme/product/shop/datamodel/order-line/schema.json
 *
 * The mapping is a rename, not a lookup, so this handler is the trust boundary
 * for a client-supplied path. It is written as a whitelist in three layers: a
 * validated catalog-relative path, an SRN grammar check that only a datamodel
 * address can pass, and a post-`realpath` containment re-check that catches the
 * one escape a validated path still allows — a symlink inside the catalog.
 */

// Filesystem reads rule out the edge runtime; say so rather than rely on a default.
export const runtime = 'nodejs'
// The catalog is read from disk per request, so the response is never prerendered.
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ path: string[] }> }

/** JSON Schema's own media type. Stock tooling content-negotiates on it. */
const SCHEMA_MEDIA_TYPE = 'application/schema+json'

/**
 * A schema changes only when the catalog is edited, and in production the
 * catalog is static input to a deployed build — but a redeploy must not be
 * shadowed by a stale cache, so the max-age is short and revalidation is cheap
 * (every response carries a content ETag). In development the file on disk is
 * being edited right now, so nothing may be cached at all.
 */
const CACHE_CONTROL =
  process.env.NODE_ENV === 'production' ? 'public, max-age=300, stale-while-revalidate=3600' : 'no-store'

/**
 * A schema is a public contract and the point of the exercise is that *other*
 * tools can read it — including browser-based validators and playgrounds, which
 * are subject to CORS. The route is read-only and the catalog is not secret.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
}

const ARTIFACT = 'schema.json'

function fail(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { 'Cache-Control': 'no-store', ...CORS } },
  )
}

export async function GET(request: Request, context: Params): Promise<Response> {
  const { path: segments } = await context.params

  // Next has already percent-decoded the catch-all segments. Decoding again is
  // the classic traversal hole (`%252e%252e` → `..`), so this deliberately does
  // not, and hands the raw segments straight to the validator.
  const relDir = safeCatalogPath(segments.join('/'))
  if (!relDir) return fail('path is not inside the catalog', 400)

  // Second gate: the path must be a legal entity address whose kind is
  // `datamodel`. Only datamodels own a schema.json, so this turns "any directory
  // under solutions/" into "the handful of directories that can possibly answer".
  let srn: string
  try {
    const parsed = dirToSrn(relDir)
    if (parsed.kind !== 'datamodel') {
      return fail(`${relDir} is a ${parsed.kind ?? 'solution'}, and only a datamodel has a schema`, 404)
    }
    srn = `srn://${relDir}`
  } catch {
    return fail(`${relDir} is not a datamodel address`, 404)
  }

  const root = catalogDir()
  const file = path.join(root, relDir, ARTIFACT)

  let body: string
  try {
    // Containment is re-checked after resolving symlinks: safeCatalogPath proves
    // the *string* stays inside the catalog, but a symlink in the tree is the one
    // way a validated path still leaves it.
    const real = await realpath(file)
    const realRoot = await realpath(root)
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      return fail('path escapes the catalog through a symlink', 400)
    }
    body = await readFile(real, 'utf8')
  } catch {
    return fail(`no ${ARTIFACT} for ${srn}`, 404)
  }

  // Strong validator over the exact bytes served — a redeploy that does not
  // change a schema costs one 304 instead of a re-download.
  const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`
  const headers = {
    'Content-Type': `${SCHEMA_MEDIA_TYPE}; charset=utf-8`,
    'Cache-Control': CACHE_CONTROL,
    ETag: etag,
    // The schema's own identity, for a client that followed a redirect or a proxy.
    'Content-Location': `/schemas/${relDir}`,
    ...CORS,
  }

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(body, { status: 200, headers })
}

/** Preflight for a browser-based validator fetching the schema cross-origin. */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store' },
  })
}
