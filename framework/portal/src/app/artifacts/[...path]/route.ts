import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { catalogDir } from '@/lib/catalog'
import { safeCatalogPath } from '@/lib/history/git'
import { artifactFile } from '@/lib/srn/artifacts'
import { SCHEME, SrnError, formatSrn, parseSrn } from '@/lib/srn/srn'

/**
 * Serve artifact bytes — the retrieval half of an artifact SRN
 * (framework/spec/srn.md, "`.schema` and the projection").
 *
 * A non-schema artifact has identity (the SRN) and storage (the role's fixed
 * file); this route is where the bytes are handed over, under their honest
 * media type. The URL path after `/artifacts/` is the SRN path verbatim,
 * artifact suffix included:
 *
 *     GET /artifacts/acme/protocol/settlement.transport
 *       → solutions/acme/protocol/settlement/transport.yaml
 *     GET /artifacts/acme/protocol/settlement.workflows.settle-order
 *       → solutions/acme/protocol/settlement/workflows/settle-order.yaml
 *
 * One artifact is exempt from byte-serving: `.schema` already has a URL of its
 * own, because the projection of `….schema` IS the entity's canonical schema
 * URL. A `.schema` request here answers with a permanent redirect to the
 * `/schemas` route, so each schema document is served at exactly one URL.
 *
 * The route serves the current snapshot only; a pinned read is a git operation
 * (evolution.md), so a `@version` in the URL is refused rather than silently
 * answered with today's bytes.
 *
 * Like `/schemas`, this handler is a trust boundary for a client-supplied
 * path, written as a whitelist in three layers: a validated catalog-relative
 * path, the SRN grammar plus the role table (which only a legal artifact
 * address can pass), and a post-`realpath` containment re-check for the one
 * escape a validated path still allows — a symlink inside the catalog.
 */

// Filesystem reads rule out the edge runtime; say so rather than rely on a default.
export const runtime = 'nodejs'
// The catalog is read from disk per request, so the response is never prerendered.
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ path: string[] }> }

/**
 * The role table admits exactly two storage formats. YAML's media type is
 * `application/yaml` (RFC 9512); JSON artifacts — `states.json`,
 * `examples/*.json` — are plain JSON documents, not schemas.
 */
const MEDIA_TYPES: Record<string, string> = {
  '.yaml': 'application/yaml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

/** Same posture as `/schemas`: short-lived in production, uncached in dev. */
const CACHE_CONTROL =
  process.env.NODE_ENV === 'production' ? 'public, max-age=300, stale-while-revalidate=3600' : 'no-store'

/**
 * Artifacts are the contract surface external consumers hold an SRN for, and
 * the catalog is not secret — the same reasoning that opened `/schemas`.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
}

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
  const relPath = safeCatalogPath(segments.join('/'))
  if (!relPath) return fail('path is not inside the catalog', 400)

  // Second gate: the path must parse as an SRN whose final segment carries an
  // artifact suffix, and the suffix must name a role the addressed kind owns.
  // Everything static dies here — E_SRN_SYNTAX for a malformed suffix,
  // E_SRN_ARTIFACT for an unknown role, wrong depth, or a role-less kind — and
  // the SrnError message already names the problem, so it is passed through.
  const ref = `${SCHEME}${relPath}`
  let file: string
  let entityRel: string
  let srn: string
  try {
    const parsed = parseSrn(ref)
    if (parsed.version !== null) {
      return fail(
        `${ref} pins @${parsed.version} — this route serves the current snapshot; a pinned read is a git operation`,
        404,
      )
    }
    if (parsed.artifact === null) {
      return fail(new SrnError('E_SRN_ARTIFACT', 'SRN carries no artifact suffix', ref).message, 404)
    }
    srn = formatSrn(parsed)
    file = artifactFile(parsed.kind, parsed.artifact, srn)
    entityRel = formatSrn({ ...parsed, artifact: null }).slice(SCHEME.length)
  } catch (error) {
    if (error instanceof SrnError) return fail(error.message, 404)
    return fail(`${relPath} is not an artifact address`, 404)
  }

  // `.schema` is in the role table for uniformity, but a schema document is
  // served at exactly one URL — the `/schemas` projection of the entity — so
  // the answer here is a permanent redirect, never a second copy of the bytes.
  if (file === 'schema.json') {
    return new Response(null, {
      status: 308,
      headers: { Location: `/schemas/${entityRel}`, 'Cache-Control': CACHE_CONTROL, ...CORS },
    })
  }

  const root = catalogDir()
  const target = path.join(root, entityRel, file)

  let body: string
  try {
    // Containment is re-checked after resolving symlinks: safeCatalogPath proves
    // the *string* stays inside the catalog, but a symlink in the tree is the one
    // way a validated path still leaves it.
    const real = await realpath(target)
    const realRoot = await realpath(root)
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      return fail('path escapes the catalog through a symlink', 400)
    }
    body = await readFile(real, 'utf8')
  } catch {
    // The vocabulary said yes and the disk said no: a legal role whose file is
    // absent is a dangling reference, exactly as an entity without index.md is.
    return fail(new SrnError('E_SRN_DANGLING', `no ${file} for ${srn}`).message, 404)
  }

  // Strong validator over the exact bytes served — a redeploy that does not
  // change an artifact costs one 304 instead of a re-download.
  const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`
  const headers = {
    'Content-Type': MEDIA_TYPES[path.extname(file)] ?? 'application/octet-stream',
    'Cache-Control': CACHE_CONTROL,
    ETag: etag,
    // Where this response came from; the artifact's *identity* is its SRN.
    'Content-Location': `/artifacts/${relPath}`,
    ...CORS,
  }

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  return new Response(body, { status: 200, headers })
}

/** Preflight for a browser-based consumer fetching an artifact cross-origin. */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: { ...CORS, 'Access-Control-Max-Age': '86400', 'Cache-Control': 'no-store' },
  })
}
