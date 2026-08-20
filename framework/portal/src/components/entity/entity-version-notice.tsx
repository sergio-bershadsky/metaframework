import { ArrowRight, GitCommitVertical, History, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The banner that keeps a historical page from being mistaken for the truth.
 *
 * A catalog is a normative document: someone reads a datamodel and then builds
 * against it. Rendering an old revision at a shareable URL is only safe if the
 * page says, loudly and before anything else, that what follows is not what is
 * current — and offers one click back. This sits above the header for exactly
 * that reason; below it, the reader has already started reading.
 *
 * The console's warning register (amber border, faint wash, amber text) is the
 * same one used for shallow clones and truncated logs, so "this is stale, not
 * broken" is a colour the reader already knows.
 */

const BOX = 'rounded-lg border border-warning/35 bg-warning/[0.07] p-4'

/**
 * What the version→commit index can and cannot reach, in one sentence.
 *
 * Used by both boxes below, and by nothing else, because it is the same fact in
 * both places: the reader is looking at git-backed history, and history that
 * stops short of v1 is history with a floor. Saying which floor, and why, is the
 * difference between "there is only one version" and "there is one version I can
 * show you" — see HistoryReach in lib/history/git.ts.
 */
export function ReachNote({ earliest, short, date }: { earliest: number; short: string; date: string }) {
  const below = earliest === 2 ? 'v1' : `v1–v${earliest - 1}`
  return (
    <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
      Git history for this path starts at{' '}
      <code className="font-mono text-[11.5px] text-warning/90">{short}</code>{' '}
      <time dateTime={date}>{date.slice(0, 10)}</time>, where the entity already carried{' '}
      <span className="font-mono">v{earliest}</span>. {below} {earliest === 2 ? 'was' : 'were'} written before
      that commit and {earliest === 2 ? 'is' : 'are'} not reachable from here — the version index does not
      follow renames, because evolution.md forbids moving an entity at all.
    </p>
  )
}

export function EntityVersionNotice({
  version,
  current,
  total,
  reach,
  date,
  subject,
  short,
  href,
  /** Sections that exist on the current page but cannot be shown historically. */
  hidden,
  /** The historical frontmatter did not satisfy today's contract. */
  degraded = false,
  className,
}: {
  version: number
  current: number
  /** How many versions the picker can offer — not the entity's version count. */
  total: number
  /** The floor of the version index, when it sits above v1. */
  reach?: { earliest: number; short: string; date: string } | null
  date: string
  subject: string
  short: string
  href: string
  hidden?: string[]
  degraded?: boolean
  className?: string
}) {
  return (
    <section className={cn(BOX, 'animate-rise', className)} aria-label="Historical version">
      {/* A paragraph, not a heading: this banner sits above the h1 so that it
          cannot be scrolled past, and a heading there would put the document
          outline out of order for anyone navigating by headings. The section's
          aria-label carries the name instead. */}
      {/* "Version 7 of 2" is what the old wording produced once a rename put the
          version number above the count of versions git can reach. The number
          and the count are different things, so they are said separately. */}
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-warning">
        <History className="size-4 shrink-0" aria-hidden />
        Version {version} — not the latest
        <span className="font-normal text-muted-foreground">
          ({total} version{total === 1 ? '' : 's'} available here)
        </span>
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-foreground/80">
        This page is rebuilt from git, not from disk. The catalog currently holds{' '}
        <span className="font-mono text-warning">v{current}</span>, and everything below is the entity as it stood
        at <span className="font-mono text-warning">v{version}</span>.
      </p>

      {reach && <ReachNote earliest={reach.earliest} short={reach.short} date={reach.date} />}

      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
        <GitCommitVertical className="size-3.5 shrink-0 self-center" aria-hidden />
        <code className="font-mono text-[11.5px] text-warning/90">{short}</code>
        <time dateTime={date} title={date} className="font-mono text-[11.5px]">
          {date.slice(0, 10)}
        </time>
        <span className="min-w-0 text-foreground/70">{subject}</span>
      </p>

      {hidden && hidden.length > 0 && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          {/* Naming what is missing is the point: a silently shorter page reads
              as "this entity had no relations", which is a different claim. */}
          {/* Phrased as a property of the view, not a claim about this entity:
              saying "this had no children at v2" would be a stronger statement
              than anything reachable from one index.md. */}
          A historical view never reconstructs {hidden.join(', ')} — each is derived from other entities, or from
          sibling files with histories of their own, so showing today&rsquo;s beside v{version} prose would mix
          timeframes. Outgoing relations are shown: this document authored them.
        </p>
      )}

      {degraded && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          This revision&rsquo;s frontmatter does not satisfy today&rsquo;s contract; fields that could not be read
          fall back to the current ones.
        </p>
      )}

      <Link
        href={href}
        className="focusable mt-3 inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10
                   px-2.5 py-1 text-[12.5px] font-medium text-warning transition hover:bg-warning/15"
      >
        Go to the current version (v{current})
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </section>
  )
}

/**
 * The requested version could not be produced — a bad pin, a catalog outside
 * git, a shallow clone, or a version older than this path's history reaches.
 * The page still renders the current entity beneath this, because a broken query
 * parameter is no reason to show nothing.
 *
 * The headline splits on WHY. "No such version" and "not reachable from here"
 * send a reader to two different places — one to fix their link, the other to
 * the repository — and a single wording for both sends half of them to the
 * wrong one.
 */
export function EntityVersionProblem({
  requested,
  current,
  reason,
  unreachable = false,
  hint,
  href,
  className,
}: {
  /** What the URL asked for, exactly as it was written. */
  requested: string
  current: number
  reason: string
  /** The version existed; the index simply does not reach back to it. */
  unreachable?: boolean
  hint?: string | null
  href: string
  className?: string
}) {
  return (
    <section className={cn(BOX, 'animate-rise', className)} aria-label="Version not available">
      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-warning">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {unreachable ? (
          <>
            <code className="font-mono">?v={requested}</code> is out of reach, not missing
          </>
        ) : (
          <>
            Cannot show <code className="font-mono">?v={requested}</code>
          </>
        )}
      </p>

      <p className="mt-2 text-[13px] leading-relaxed text-foreground/80">{reason}</p>
      {hint && <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{hint}</p>}

      <p className="mt-2 text-[12.5px] text-muted-foreground">
        Showing the current version, <Link href={href} className="focusable rounded font-mono text-warning underline underline-offset-2">v{current}</Link>.
      </p>
    </section>
  )
}
