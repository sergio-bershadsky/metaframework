import {
  diffAgainstParent,
  diffRevisions,
  getEntityHistory,
  isCommitHash,
  listEntityFiles,
  readFileAtRevision,
  safeCatalogPath,
} from '@/lib/history/git'

/**
 * On-demand history reads for the client history panel.
 *
 * The panel is deliberately lazy: an entity page renders without touching git,
 * and only a reader who asks for history pays for a subprocess. That makes this
 * route the one place where a client-supplied path reaches the filesystem, so
 * it is written as a whitelist — a validated catalog-relative path, a validated
 * commit hash, one of four read-only operations, and nothing else.
 */

// child_process rules out the edge runtime; say so rather than rely on the default.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ path: string[] }> }

const IMMUTABLE = 'private, max-age=600'
const VOLATILE = 'no-store'

function fail(message: string, status = 400): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': VOLATILE } })
}

export async function GET(request: Request, context: Params): Promise<Response> {
  const { path: segments } = await context.params

  // Next has already percent-decoded the catch-all segments. Decoding again is
  // the classic traversal hole (`%252e%252e` → `..`), so this deliberately does
  // not, and hands the raw segments straight to the validator.
  const relPath = safeCatalogPath(segments.join('/'))
  if (!relPath) return fail('path is not inside the catalog')

  const query = new URL(request.url).searchParams
  const op = query.get('op') ?? 'log'
  const commit = query.get('commit')

  if (commit !== null && !isCommitHash(commit)) return fail('commit must be a hex object name')

  switch (op) {
    case 'log': {
      // The payload carries `reach` beside `versions`, and a client resolving a
      // pinned `@N` needs both: `versions` says what this path's log can
      // produce, `reach` says where that log stops. Absent the second, a caller
      // reading `{"7": …, "8": …}` has no way to tell "v1 was never written"
      // from "v1 predates a rename this index will not follow" — and the API is
      // the one surface with no prose to explain the difference.
      const history = await getEntityHistory(relPath)
      return Response.json({ op, history }, { headers: { 'Cache-Control': VOLATILE } })
    }

    case 'files': {
      if (!commit) return fail('files requires a commit')
      const files = await listEntityFiles(relPath, commit)
      return Response.json({ op, commit, files }, { headers: { 'Cache-Control': IMMUTABLE } })
    }

    case 'show': {
      const revision = await readFileAtRevision(relPath, commit)
      return Response.json(
        { op, revision },
        { headers: { 'Cache-Control': commit ? IMMUTABLE : VOLATILE } },
      )
    }

    case 'diff': {
      if (!commit) return fail('diff requires a commit')
      const against = query.get('against') ?? 'worktree'

      if (against === 'parent') {
        const diff = await diffAgainstParent(relPath, commit)
        return Response.json({ op, diff }, { headers: { 'Cache-Control': IMMUTABLE } })
      }
      if (against === 'worktree') {
        const diff = await diffRevisions(relPath, commit, null)
        return Response.json({ op, diff }, { headers: { 'Cache-Control': VOLATILE } })
      }
      if (!isCommitHash(against)) return fail('against must be "parent", "worktree" or a hex object name')

      const diff = await diffRevisions(relPath, commit, against)
      return Response.json({ op, diff }, { headers: { 'Cache-Control': IMMUTABLE } })
    }

    default:
      return fail(`unknown op "${op}"`)
  }
}
