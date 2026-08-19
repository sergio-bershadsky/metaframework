'use client'

import { ChevronDown, GitCommitVertical, History, Info, RotateCw, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { DiffView } from '@/components/history/diff-view'
import { VersionBadge } from '@/components/kind-badge'
// Type-only: erased at compile time, so the server-only git module never
// reaches the client bundle.
import type { EntityHistory, FileDiff, FileRevision } from '@/lib/history/git'
import { cn } from '@/lib/utils'

/**
 * The previous-version affordance the decision record requires on every
 * artifact.
 *
 * It fetches on expand rather than on render: git is a subprocess per read, and
 * an entity page must not pay for history nobody opened. The same laziness is
 * what makes the degraded case cheap — a catalog outside git costs one failed
 * `rev-parse` and renders an explanation, never a broken page.
 *
 * State here is derived wherever it can be. Selection falls back to the newest
 * revision and every fetched payload carries the key it was fetched for, so
 * "loading" is a comparison rather than a flag an effect has to set.
 */

export type HistoryView = 'commit' | 'current' | 'source'

export interface HistoryPanelProps {
  /** Catalog-relative entity directory, e.g. `acme/shop/checkout`. */
  relDir: string
  /**
   * Files of the entity as they exist now, relative to `relDir`. `index.md` is
   * always offered; artifacts should be passed so each one gets the affordance.
   */
  files?: string[]
  /** File to open on, so an artifact can link straight into its own history. */
  initialFile?: string
  /** Server-rendered history, to skip the first round trip. */
  initialHistory?: EntityHistory
  defaultOpen?: boolean
  className?: string
}

const ENTITY_DOCUMENT = 'index.md'

const VIEW_LABELS: Record<HistoryView, { label: string; description: string }> = {
  commit: { label: 'Changed here', description: 'diff against the parent commit' },
  current: { label: 'Vs. current', description: 'diff against the working tree' },
  source: { label: 'Source', description: 'the whole file at this revision' },
}

interface Payload {
  key: string
  diff?: FileDiff
  revision?: FileRevision
}

interface Keyed<T> {
  key: string
  value: T
}

export function HistoryPanel({
  relDir,
  files,
  initialFile,
  initialHistory,
  defaultOpen = false,
  className,
}: HistoryPanelProps) {
  const [open, setOpen] = useState(defaultOpen || Boolean(initialHistory))
  const [history, setHistory] = useState<EntityHistory | null>(initialHistory ?? null)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const [chosen, setChosen] = useState<string | null>(null)
  const [file, setFile] = useState(initialFile ?? ENTITY_DOCUMENT)
  const [view, setView] = useState<HistoryView>('commit')

  const [tree, setTree] = useState<Keyed<string[]> | null>(null)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [viewError, setViewError] = useState<Keyed<string> | null>(null)

  // Selection is derived, so opening the panel can never land on nothing.
  const selected = chosen ?? history?.revisions[0]?.hash ?? null
  const loadingHistory = open && !history && !historyError
  const viewKey = `${selected}\u0000${file}\u0000${view}`
  const loadingView =
    selected !== null && payload?.key !== viewKey && viewError?.key !== viewKey

  const mounted = useIsClient()
  const listId = useId()
  const fileSelectId = useId()

  useEffect(() => {
    if (!open || history || historyError) return
    const controller = new AbortController()

    getJson<{ history: EntityHistory }>(historyUrl(relDir, { op: 'log' }), controller.signal)
      .then((body) => setHistory(body.history))
      .catch((error: unknown) => {
        if (!isAbort(error)) setHistoryError(messageOf(error))
      })

    return () => controller.abort()
  }, [open, history, historyError, relDir])

  useEffect(() => {
    if (!selected || tree?.key === selected) return
    const controller = new AbortController()

    getJson<{ files: string[] }>(historyUrl(relDir, { op: 'files', commit: selected }), controller.signal)
      .then((body) => setTree({ key: selected, value: body.files }))
      .catch(() => undefined)

    return () => controller.abort()
  }, [relDir, selected, tree])

  useEffect(() => {
    if (!selected || payload?.key === viewKey || viewError?.key === viewKey) return
    const controller = new AbortController()
    const target = `${relDir}/${file}`

    const request =
      view === 'source'
        ? getJson<{ revision: FileRevision }>(
            historyUrl(target, { op: 'show', commit: selected }),
            controller.signal,
          ).then((body) => setPayload({ key: viewKey, revision: body.revision }))
        : getJson<{ diff: FileDiff }>(
            historyUrl(target, {
              op: 'diff',
              commit: selected,
              against: view === 'commit' ? 'parent' : 'worktree',
            }),
            controller.signal,
          ).then((body) => setPayload({ key: viewKey, diff: body.diff }))

    request.catch((error: unknown) => {
      if (!isAbort(error)) setViewError({ key: viewKey, value: messageOf(error) })
    })

    return () => controller.abort()
  }, [relDir, file, view, selected, viewKey, payload, viewError])

  const current = history?.revisions.find((revision) => revision.hash === selected) ?? null
  const filesAtRevision = tree?.key === selected ? tree.value : null
  const options = fileOptions(files, initialFile, filesAtRevision)
  const shown = payload?.key === viewKey ? payload : null

  return (
    <section className={cn('panel overflow-hidden', className)} aria-label="Version history">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        className="focusable flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px]
                   transition hover:bg-surface-raised/60"
      >
        <History className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="font-medium">History</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {history
            ? `${history.revisions.length} revision${history.revisions.length === 1 ? '' : 's'}`
            : 'git-backed'}
        </span>
        <ChevronDown
          className={cn('ml-auto size-3.5 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div id={listId} className="border-t border-border">
          {loadingHistory && <PanelNotice>Reading git history…</PanelNotice>}

          {historyError && (
            <PanelNotice tone="warning">
              {historyError}
              <button
                type="button"
                onClick={() => setHistoryError(null)}
                className="focusable ml-2 inline-flex items-center gap-1 rounded text-[12px] underline
                           underline-offset-2 hover:text-foreground"
              >
                <RotateCw className="size-3" aria-hidden />
                Retry
              </button>
            </PanelNotice>
          )}

          {history?.unavailable && (
            <PanelNotice tone={history.unavailable.reason === 'not-committed' ? 'muted' : 'warning'}>
              <span className="font-mono text-[11px] tracking-wider uppercase">{history.unavailable.reason}</span>
              <span className="mx-1.5 opacity-40">·</span>
              {history.unavailable.message}
              <span className="mt-1 block text-[12px] opacity-80">
                {history.unavailable.hint ??
                  'Previous versions live in git history, not on disk — without a repository the portal can only show what is current.'}
              </span>
            </PanelNotice>
          )}

          {history && !history.unavailable && (
            <>
              {(history.shallow || history.truncated) && (
                <p className="flex items-start gap-2 border-b border-border bg-warning/[0.06] px-4 py-2 text-[12px] text-warning">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    {history.shallow
                      ? 'Shallow clone — older revisions are not in this checkout. Run `git fetch --unshallow` to see them.'
                      : `Only the ${history.revisions.length} most recent revisions are listed.`}
                  </span>
                </p>
              )}

              <div className="grid lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
                <ol
                  aria-label="Revisions"
                  className="max-h-[26rem] divide-y divide-border overflow-y-auto border-border lg:max-h-[34rem] lg:border-r"
                >
                  {history.revisions.map((revision, index) => (
                    <li key={revision.hash}>
                      <button
                        type="button"
                        onClick={() => setChosen(revision.hash)}
                        aria-current={revision.hash === selected}
                        className={cn(
                          'focusable block w-full px-4 py-2.5 text-left transition',
                          revision.hash === selected
                            ? 'bg-primary/[0.09] shadow-[inset_2px_0_0_0_var(--primary)]'
                            : 'hover:bg-surface-raised/60',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <GitCommitVertical className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <code className="font-mono text-[11.5px] text-primary">{revision.short}</code>
                          {revision.version !== null && <VersionBadge version={revision.version} />}
                          {index === 0 && (
                            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                              latest
                            </span>
                          )}
                          <time
                            dateTime={revision.date}
                            title={revision.date}
                            className="ml-auto shrink-0 text-[11px] text-muted-foreground"
                          >
                            {mounted ? relativeTime(revision.date) : revision.date.slice(0, 10)}
                          </time>
                        </span>
                        <span className="mt-1 block truncate text-[12.5px] text-foreground/85">
                          {revision.subject}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">{revision.author}</span>
                      </button>
                    </li>
                  ))}
                </ol>

                <div className="min-w-0 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label
                      htmlFor={fileSelectId}
                      className="text-[11px] tracking-wider text-muted-foreground uppercase"
                    >
                      File
                    </label>
                    <select
                      id={fileSelectId}
                      value={file}
                      onChange={(event) => setFile(event.target.value)}
                      className="focusable max-w-full min-w-0 rounded-md border border-border bg-surface-raised
                                 px-2 py-1 font-mono text-[12px] text-foreground"
                    >
                      {options.map((option) => (
                        <option key={option.file} value={option.file}>
                          {option.present ? option.file : `${option.file} — not at this revision`}
                        </option>
                      ))}
                    </select>

                    <div
                      role="group"
                      aria-label="What to show"
                      className="ml-auto flex overflow-hidden rounded-md border border-border"
                    >
                      {(Object.keys(VIEW_LABELS) as HistoryView[]).map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setView(key)}
                          aria-pressed={view === key}
                          title={VIEW_LABELS[key].description}
                          className={cn(
                            'focusable px-2 py-1 text-[11.5px] transition',
                            view === key
                              ? 'bg-primary/15 text-primary'
                              : 'text-muted-foreground hover:bg-surface-raised hover:text-foreground',
                          )}
                        >
                          {VIEW_LABELS[key].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {current && (
                    <p className="mb-3 text-[12px] text-muted-foreground">
                      <span className="font-mono text-foreground/70">{current.short}</span> — {current.subject}
                      {current.version !== null && (
                        <span className="font-mono"> (the entity was at v{current.version} here)</span>
                      )}
                    </p>
                  )}

                  {viewError?.key === viewKey && <PanelNotice tone="warning">{viewError.value}</PanelNotice>}

                  {view === 'source' ? (
                    <SourceView revision={shown?.revision ?? null} loading={loadingView} />
                  ) : (
                    <DiffView
                      diff={shown?.diff ?? null}
                      loading={loadingView}
                      comparison={
                        current
                          ? view === 'commit'
                            ? `parent → ${current.short}`
                            : `${current.short} → working tree`
                          : undefined
                      }
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function SourceView({ revision, loading }: { revision: FileRevision | null; loading: boolean }) {
  if (loading) return <PanelNotice>Reading the file at that revision…</PanelNotice>
  if (!revision) return <PanelNotice>Choose a revision.</PanelNotice>
  if (revision.content === null) {
    return (
      <PanelNotice>{revision.unavailable?.message ?? 'The file does not exist at this revision.'}</PanelNotice>
    )
  }

  return (
    <pre className="max-h-[32rem] overflow-auto rounded-lg border border-border bg-background/40 p-4 text-[12.5px] leading-6">
      <code className="font-mono text-foreground/80">{revision.content.trimEnd()}</code>
    </pre>
  )
}

function PanelNotice({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'warning' }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 px-4 py-3 text-[13px]',
        tone === 'warning' ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      {tone === 'warning' ? (
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      ) : (
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      )}
      <span className="min-w-0">{children}</span>
    </p>
  )
}

// --- plumbing ----------------------------------------------------------------

interface FileOption {
  file: string
  /** False when the file exists now but not at the selected revision. */
  present: boolean
}

/**
 * The union of what exists now and what existed then, so an artifact added
 * later still appears — flagged rather than silently missing.
 */
function fileOptions(
  files: string[] | undefined,
  initialFile: string | undefined,
  atRevision: string[] | null,
): FileOption[] {
  const now = new Set<string>([ENTITY_DOCUMENT, ...(files ?? []), ...(initialFile ? [initialFile] : [])])
  const then = new Set(atRevision ?? [])
  return [...new Set([...now, ...then])]
    .sort((a, b) => (a === ENTITY_DOCUMENT ? -1 : b === ENTITY_DOCUMENT ? 1 : a.localeCompare(b)))
    .map((file) => ({ file, present: atRevision === null || then.has(file) }))
}

function historyUrl(relPath: string, query: Record<string, string>): string {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/')
  return `/api/history/${encoded}?${new URLSearchParams(query)}`
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (body as { error?: string } | null)?.error
    throw new Error(error ?? `history request failed (${response.status})`)
  }
  return body as T
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'history request failed'
}

/**
 * Relative dates are non-deterministic, so they must not be rendered during
 * SSR. useSyncExternalStore gives the server `false` and the client `true`
 * without a setState-in-effect, which React 19 rightly rejects.
 */
const neverChanges = () => () => {}
function useIsClient(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  )
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1_000],
]

/** Intl rather than hand-rolled thresholds — plurals and locale are not ours to guess. */
function relativeTime(iso: string): string {
  const delta = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(delta)) return iso
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  for (const [unit, ms] of UNITS) {
    if (Math.abs(delta) >= ms || unit === 'second') return format.format(Math.round(delta / ms), unit)
  }
  return iso
}
