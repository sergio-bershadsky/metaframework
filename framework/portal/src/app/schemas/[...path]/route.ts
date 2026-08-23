import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { catalogDir } from '@/lib/catalog'
import { safeCatalogPath } from '@/lib/history/git'
import { EMBEDDED_META_SCHEMAS } from '@/lib/schema/embedded'
import { dirToSrn } from '@/lib/srn/srn'

/**
 * Serve `schema.json` — the retrieval half of the schema-URL projection.
 *
 * A datamodel's **identity** is its canonical URL,
 * `https://schemas.metaframework.dev/acme/datamodel/money`, which is what its
 * `$id` says and what every `$ref` to it says (`lib/schema/url.ts`). This route
 * is where *this deployment* hands the bytes over, under `SCHEMA_BASE_URL` —
 * `http://localhost:3000/schemas/acme/datamodel/money` in dev. The two are
 * deliberately separate: identity must not vary between a laptop and
 * production, while a serving address is a property of a deployment. A resolver
 * that prefers fetching to trusting its cache maps the canonical host onto this
 * route, in resolver config, outside the artifacts (decision-record
 * 2026-08-19-c).
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
 *
 * ## The framework's own eight answer here too
 *
 * Every artifact the framework tells an author to write declares a `$schema` on
 * the canonical host, and the only bytes behind those URLs live in *this*
 * repository's `metaframework` solution. A catalog that is not this repository
 * does not have it, so its portal answered the framework's first authoring
 * instruction with a 404. It now falls back to a copy compiled into the bundle
 * (`lib/schema/embedded.ts`) — identity is still global and singular, and it is
 * only retrieval that becomes local everywhere rather than local here and global
 * on a host that has to be deployed for anyone to read a header they were told
 * to write.
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

  let body: string | undefined
  try {
    // Containment is re-checked after resolving symlinks: safeCatalogPath proves
    // the *string* stays inside the catalog, but a symlink in the tree is the one
    // way a validated path still leaves it.
    const real = await realpath(file)
    const realRoot = await realpath(root)
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      // Not a miss — a refusal, so it must not reach the fallback below. A
      // request that left the catalog gets an answer about that and nothing else.
      return fail('path escapes the catalog through a symlink', 400)
    }
    body = await readFile(real, 'utf8')
  } catch (error) {
    // "Not there" and "could not be read" are different answers, and only the
    // first is a miss the embedded copy may serve. A `schema.json` that exists
    // and cannot be read is this catalog's own fault to see; answering it with a
    // copy that may say something else is how a portal reports a document it
    // never opened. The same distinction `catalogRoot` draws one directory up.
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && code !== 'ENOTDIR') return fail(`no ${ARTIFACT} for ${srn}`, 404)

    // The catalog first, the embedded copy only when it has nothing. This
    // repository *is* a catalog holding the eight, and editing one of them here
    // must show on the next request rather than after a regeneration — while a
    // foreign catalog, which cannot hold them, still gets an answer. Precedence
    // this way round also means the fallback can never shadow a real entity.
    //
    // The three gates above have already run, so nothing reaches this line that
    // could not have reached the catalog read. The key is the request's own path
    // and never a literal: these documents exist only as literals in a compiled
    // chunk, and a constant key is a proof that the other seven are unreachable
    // — one Turbopack does not act on today, which is why `npm run package`
    // greps the built chunks rather than trusting this line.
    body = EMBEDDED_META_SCHEMAS[relDir]
  }
  if (body === undefined) return fail(`no ${ARTIFACT} for ${srn}`, 404)

  // Strong validator over the exact bytes served — a redeploy that does not
  // change a schema costs one 304 instead of a re-download.
  const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`
  const headers = {
    'Content-Type': `${SCHEMA_MEDIA_TYPE}; charset=utf-8`,
    'Cache-Control': CACHE_CONTROL,
    ETag: etag,
    // Where this response came from, for a client that followed a redirect or a
    // proxy. The schema's *identity* is the `$id` in the body, not this path.
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
