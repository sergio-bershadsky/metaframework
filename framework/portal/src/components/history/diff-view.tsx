'use client'

import { FileWarning, Scissors } from 'lucide-react'
// Type-only: erased at compile time, so the server-only git module never
// reaches the client bundle.
import type { DiffHunk, FileDiff } from '@/lib/history/git'
import { cn } from '@/lib/utils'

/**
 * A unified diff rendered as a real table.
 *
 * Two decisions carry the design. Colour follows the console's rule — added
 * lines borrow the environment hue (the only green in the system), removed lines
 * the destructive red — so a diff never introduces a colour that means nothing
 * elsewhere. And the markers are semantic rather than decorative: the `+`/`-`
 * glyphs are aria-hidden and each row carries a screen-reader word, because a
 * diff read aloud as bare source is worthless.
 */

export interface DiffViewProps {
  diff: FileDiff | null
  loading?: boolean
  /** Human label for what is being compared, e.g. "9a3f21c → working tree". */
  comparison?: string
  className?: string
}

export function DiffView({ diff, loading = false, comparison, className }: DiffViewProps) {
  if (loading) return <DiffSkeleton className={className} />

  if (!diff) {
    return <Notice className={className}>Choose a revision to see what changed.</Notice>
  }

  if (diff.unavailable) {
    return (
      <Notice className={className} tone="warning">
        <span className="font-mono text-[11px] uppercase tracking-wider">{diff.unavailable.reason}</span>
        <span className="mx-1.5 opacity-40">·</span>
        {diff.unavailable.message}
        {diff.unavailable.hint && <span className="block text-[12px] opacity-80">{diff.unavailable.hint}</span>}
      </Notice>
    )
  }

  if (diff.binary) {
    return <Notice className={className}>Binary file — the portal renders text diffs only.</Notice>
  }

  if (diff.identical) {
    return <Notice className={className}>No changes to this file between the two revisions.</Notice>
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-background/40', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-3 py-2">
        <span className="truncate font-mono text-[12px] text-foreground/85">{diff.path}</span>
        <DiffStat added={diff.added} removed={diff.removed} />
        {comparison && (
          <span className="ml-auto truncate font-mono text-[11px] text-muted-foreground">{comparison}</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-collapse text-[12.5px] leading-[1.55]">
          <caption className="sr-only">
            {`Unified diff of ${diff.path}: ${diff.added} lines added, ${diff.removed} lines removed`}
            {comparison ? `, comparing ${comparison}` : ''}
          </caption>
          {diff.hunks.map((hunk, index) => (
            <Hunk key={`${hunk.oldStart}-${hunk.newStart}-${index}`} hunk={hunk} />
          ))}
        </table>
      </div>

      {diff.truncated && (
        <p className="flex items-center gap-1.5 border-t border-border px-3 py-2 text-[12px] text-warning">
          <Scissors className="size-3.5" aria-hidden />
          The patch is longer than this view renders; trailing hunks were dropped.
        </p>
      )}
    </div>
  )
}

/** The +/− tally. Exported so a collapsed affordance can show it without the table. */
export function DiffStat({ added, removed, className }: { added: number; removed: number; className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center gap-2 font-mono text-[11px]', className)}>
      <span className="text-kind-environment">+{added}</span>
      <span className="text-destructive">−{removed}</span>
      <span className="sr-only">{`${added} lines added, ${removed} lines removed`}</span>
    </span>
  )
}

/** One hunk is one row group, so its `@@` header is a real heading for the rows it covers. */
function Hunk({ hunk }: { hunk: DiffHunk }) {
  return (
    <tbody>
      <tr>
        <th
          scope="rowgroup"
          colSpan={3}
          className="border-y border-border bg-surface-raised/50 px-3 py-1 text-left font-normal"
        >
          <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
            {`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}
          </span>
          {hunk.section && (
            <span className="ml-2 font-mono text-[11px] text-muted-foreground/70">{hunk.section}</span>
          )}
        </th>
      </tr>

      {hunk.lines.map((line, index) => (
        <tr
          key={index}
          className={cn(
            line.type === 'added' && 'bg-kind-environment/10',
            line.type === 'removed' && 'bg-destructive/10',
          )}
        >
          <Gutter value={line.oldLine} />
          <Gutter value={line.newLine} />
          <td className="w-full py-px pr-4 pl-2 align-top">
            <span
              aria-hidden
              className={cn(
                'mr-2 inline-block w-2 font-mono select-none',
                line.type === 'added' && 'text-kind-environment',
                line.type === 'removed' && 'text-destructive',
                line.type === 'context' && 'text-transparent',
              )}
            >
              {line.type === 'added' ? '+' : line.type === 'removed' ? '−' : ' '}
            </span>
            {line.type !== 'context' && <span className="sr-only">{`${line.type} line: `}</span>}
            <code
              className={cn(
                'font-mono whitespace-pre [tab-size:2]',
                line.type === 'added' && 'text-foreground',
                line.type === 'removed' && 'text-foreground/70',
                line.type === 'context' && 'text-muted-foreground',
              )}
            >
              {line.text || ' '}
            </code>
            {line.noNewline && (
              <span className="ml-2 font-mono text-[11px] text-warning">no newline at end of file</span>
            )}
          </td>
        </tr>
      ))}
    </tbody>
  )
}

/**
 * Line numbers are chrome, not content: `select-none` keeps them out of a
 * copied selection so pasting a diff yields source, not source interleaved with
 * numbers.
 */
function Gutter({ value }: { value: number | null }) {
  return (
    <td
      aria-hidden
      className="w-px border-r border-border/60 px-2 py-px text-right align-top font-mono
                 text-[11px] tabular-nums text-muted-foreground/60 select-none"
    >
      {value ?? ''}
    </td>
  )
}

function Notice({
  children,
  tone = 'muted',
  className,
}: {
  children: React.ReactNode
  tone?: 'muted' | 'warning'
  className?: string
}) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px]',
        tone === 'warning' ? 'text-warning' : 'text-muted-foreground',
        className,
      )}
    >
      {tone === 'warning' && <FileWarning className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
      <span className="min-w-0">{children}</span>
    </p>
  )
}

function DiffSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface p-3', className)}
      role="status"
      aria-label="Loading diff"
    >
      <div className="space-y-1.5">
        {[92, 64, 78, 48, 84].map((width, index) => (
          <div
            key={index}
            className="h-3 animate-pulse rounded bg-surface-raised"
            style={{ width: `${width}%`, animationDelay: `${index * 70}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
