'use client'

import { Check, ChevronRight, Copy, FileCode2, FileWarning, Link2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { AnchorLinkProvider, type AnchorLink } from './anchor-link'
import { type AnchorPaths, anchorsAt, buildSourceIndex } from '@/lib/artifacts/source-map'
import { cn } from '@/lib/utils'

/**
 * The editor is mounted lazily — a closed block renders no `SourceView` — but
 * until now the *module* was still imported eagerly, so every entity page put
 * `@monaco-editor/react` and everything `./monaco` configures into its bundle
 * whether or not it held a single artifact. Mount-laziness and import-laziness
 * are different questions and only the second one is about bytes.
 *
 * `ssr: false` rather than a plain dynamic import because there was never a
 * server pass worth keeping: `SourceView` renders "Loading source…" until
 * `loadMonaco()` resolves in an effect, which cannot happen on the server. The
 * placeholder below says the same thing in the same box, so the split is
 * invisible — the pane's height is set by the block, not by the editor.
 */
const SourceView = dynamic(() => import('./source-view').then((module) => module.SourceView), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-0 flex-1 place-items-center bg-surface">
      <span className="font-mono text-[11px] text-muted-foreground">Loading source…</span>
    </div>
  ),
})

/**
 * One artifact, one block — carrying both its drawing and its source.
 *
 * A protocol page used to render `workflows/place-order.yaml` twice: once as a
 * sequence diagram near the top, once as raw YAML in a list at the bottom, with
 * nothing saying they were the same file. Whichever one you were looking at,
 * the other was somewhere else on the page and out of reach.
 *
 * So the artifact is the unit. Side by side when the column is wide enough for
 * both, tabs when it is not — never two disconnected sections. Selecting an
 * element in the drawing lights the lines that authored it, and moving the caret
 * lights the element those lines produce (see `anchor-link.tsx`).
 *
 * Everything derived from the file is computed on the server and arrives as
 * data; this component owns the disclosure, the layout decision, and the join
 * between the two panes.
 */

export interface ArtifactBlockProps {
  /** Path relative to the entity directory, e.g. `workflows/place-order.yaml`. */
  file: string
  /** `.yaml`, `.json`, `.md` — shown as the block's format chip. */
  extension: string
  source: string
  /** Monaco language id for the source pane. */
  language: string
  /** Stable model uri; one per artifact across the whole catalog. */
  modelPath: string
  /** DOM id, and the fragment the block's permalink points at. */
  id: string
  /** What this file is, in the reader's words: `Shape`, `Exchange`. */
  role?: string
  /** Open on arrival — the promoted artifact for the entity's kind. */
  defaultOpen?: boolean
  /** Why the file could not be parsed. The block still renders; it never vanishes. */
  error?: string | null
  /** Anchor id → path into the file, built beside the parser on the server. */
  anchors?: AnchorPaths
  /** The drawing, when the portal can produce one for this artifact. */
  visual?: React.ReactNode
  /** Anything belonging to the artifact but to neither pane — e.g. its sources. */
  footer?: React.ReactNode
}

/**
 * Below this the two panes stop being readable side by side and become tabs.
 * A sequence diagram in a 400px column is a horizontal scrollbar with a picture
 * behind it.
 */
const SIDE_BY_SIDE_AT = 960

type Pane = 'visual' | 'source'

export function ArtifactBlock({
  file,
  extension,
  source,
  language,
  modelPath,
  id,
  role,
  defaultOpen = false,
  error = null,
  anchors = {},
  visual,
  footer,
}: ArtifactBlockProps) {
  const [pane, setPane] = useState<Pane>(visual ? 'visual' : 'source')
  const [frameRef, width] = useElementWidth<HTMLElement>()
  const panelId = `${useId().replace(/[^a-zA-Z0-9]/g, '')}-panel`

  // The block is open because its kind promotes it, because a permalink points
  // at it, or because someone said so — in that order of precedence. Reading the
  // fragment through `useSyncExternalStore` rather than an effect keeps the
  // disclosure a derived value: there is no moment where the state and the URL
  // disagree, and nothing has to be written back on arrival.
  const fragment = useSyncExternalStore(subscribeToFragment, readFragment, readNothing)
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? (defaultOpen || fragment === `#${id}`)

  const index = useMemo(() => buildSourceIndex(source), [source])

  // Three ways in, in priority order: the pointer over the drawing, a click that
  // outlasts it, and the caret in the source.
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [atCaret, setAtCaret] = useState<readonly string[]>([])

  const onLine = useCallback(
    (line: number) => {
      const next = anchorsAt(anchors, index.pathAt(line))
      // A new array on every caret move would re-render the drawing on every
      // arrow key; the anchors under the caret rarely actually change.
      setAtCaret((previous) => (sameAnchors(previous, next) ? previous : next))
    },
    [anchors, index],
  )

  const link = useMemo<AnchorLink>(
    () => ({
      active: hovered ? [hovered] : selected ? [selected] : atCaret,
      onActivate: setHovered,
      onSelect: (anchor) => setSelected((previous) => (previous === anchor ? null : anchor)),
    }),
    [hovered, selected, atCaret],
  )

  const focused = hovered ?? selected ?? atCaret[0] ?? null
  const highlight = focused ? index.spanOf(anchors[focused] ?? []) : null

  const sideBySide = Boolean(visual) && (width === null || width >= SIDE_BY_SIDE_AT)
  const sourceHeight = Math.min(460, Math.max(160, index.lines * 20 + 26))

  // Height is set on the pane, not on the editor: Monaco fills whatever it is
  // given, and a percentage height inside a container sized by its own content
  // collapses to nothing. Side by side the grid row provides that height — the
  // pane stretches to the drawing beside it — while alone the file's own length
  // does, so a six-line transport.yaml is not shown in a 460px window.
  const sourcePane = (
    <div
      className="flex min-w-0 flex-col"
      style={sideBySide ? { minHeight: sourceHeight } : { height: sourceHeight }}
    >
      {error && (
        <p className="flex items-start gap-2 border-b border-destructive/35 bg-destructive/[0.07] px-3 py-2 text-[12.5px] text-destructive">
          <FileWarning className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            This file could not be parsed, so nothing is derived from it. The source is below, unchanged.
            <span className="mt-0.5 block font-mono text-[11.5px] text-foreground/75">{error}</span>
          </span>
        </p>
      )}
      <SourceView
        value={source}
        language={language}
        path={modelPath}
        highlight={highlight}
        onLine={Object.keys(anchors).length > 0 ? onLine : undefined}
        className="min-h-0 flex-1"
        label={`Source of ${file}`}
      />
    </div>
  )

  return (
    <section ref={frameRef} id={id} className="panel scroll-mt-4 overflow-hidden">
      {/* A disclosure button with its own actions beside it, rather than
          `<details>` with buttons inside the `<summary>`: a summary takes its
          accessible name from everything it contains, so a copy button in there
          renames the disclosure to "workflows/place-order.yaml Exchange YAML
          copy the source of… permalink to…". Nothing is lost by the swap — the
          panel's content is Monaco, so it was never going to work without
          scripting anyway. */}
      <div className="flex items-center gap-2 px-3 py-2 text-[13px]">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setToggled(!open)}
          className="focusable -m-1 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded p-1 text-left"
        >
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
              open && 'rotate-90',
            )}
            aria-hidden
          />
          <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-mono text-foreground/85">{file}</span>
          {role && <span className="shrink-0 text-[11.5px] text-muted-foreground">{role}</span>}
          {error && (
            <span className="shrink-0 rounded border border-destructive/40 px-1 font-mono text-[10.5px] text-destructive">
              unparsed
            </span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
            {extension.replace('.', '')}
          </span>
        </button>
        <CopySourceButton source={source} file={file} />
        <PermalinkButton id={id} file={file} />
      </div>

      <div id={panelId} hidden={!open}>
        {open && (
          <div className="border-t border-border">
            {visual ? (
              sideBySide ? (
                <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] divide-x divide-border">
                  <AnchorLinkProvider value={link}>
                    <div className="min-w-0">{visual}</div>
                  </AnchorLinkProvider>
                  {sourcePane}
                </div>
              ) : (
                <PaneTabs
                  pane={pane}
                  onPane={setPane}
                  file={file}
                  visual={<AnchorLinkProvider value={link}>{visual}</AnchorLinkProvider>}
                  source={sourcePane}
                />
              )
            ) : (
              sourcePane
            )}
            {footer && <div className="border-t border-border px-3 py-2.5">{footer}</div>}
          </div>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- tabs */

/**
 * Two panes, one at a time. Hand-rolled rather than borrowed so the roles are
 * exactly right for what this is — a tablist over the same artifact — and so
 * the chrome stays at console density.
 */
function PaneTabs({
  pane,
  onPane,
  file,
  visual,
  source,
}: {
  pane: Pane
  onPane: (pane: Pane) => void
  file: string
  visual: React.ReactNode
  source: React.ReactNode
}) {
  const base = useId().replace(/[^a-zA-Z0-9]/g, '')
  const tabs: Array<{ value: Pane; label: string }> = [
    { value: 'visual', label: 'Diagram' },
    { value: 'source', label: 'Source' },
  ]

  const move = (direction: 1 | -1) => {
    const at = tabs.findIndex((tab) => tab.value === pane)
    onPane(tabs[(at + direction + tabs.length) % tabs.length].value)
  }

  return (
    <>
      <div
        role="tablist"
        aria-label={`Views of ${file}`}
        className="flex items-center gap-1 border-b border-border px-2 py-1.5"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') move(1)
          else if (event.key === 'ArrowLeft') move(-1)
          else return
          event.preventDefault()
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`${base}-${tab.value}-tab`}
            aria-selected={pane === tab.value}
            aria-controls={`${base}-${tab.value}-panel`}
            tabIndex={pane === tab.value ? 0 : -1}
            onClick={() => onPane(tab.value)}
            className={cn(
              'focusable rounded px-2 py-0.5 font-mono text-[11px] tracking-wider uppercase transition-colors',
              pane === tab.value
                ? 'bg-surface-raised text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-${pane}-panel`}
        aria-labelledby={`${base}-${pane}-tab`}
        tabIndex={0}
        className="focusable min-w-0"
      >
        {pane === 'visual' ? visual : source}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- actions */

function CopySourceButton({ source, file }: { source: string; file: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(source).then(
          () => setCopied(true),
          () => setCopied(false),
        )
      }}
      aria-label={copied ? `${file} copied` : `Copy the source of ${file}`}
      title="Copy source"
      className="focusable shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  )
}

/**
 * A real anchor, so it works from the keyboard, from the context menu, and
 * without JavaScript — and a click also puts the full URL on the clipboard,
 * which is what anybody reaching for a permalink actually wanted.
 */
function PermalinkButton({ id, file }: { id: string; file: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <a
      href={`#${id}`}
      onClick={() => {
        const { origin, pathname, search } = window.location
        navigator.clipboard?.writeText(`${origin}${pathname}${search}#${id}`).then(
          () => setCopied(true),
          () => setCopied(false),
        )
      }}
      aria-label={copied ? `Link to ${file} copied` : `Permalink to ${file}`}
      title="Copy link to this artifact"
      className="focusable shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground"
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Link2 className="size-3.5" aria-hidden />}
    </a>
  )
}

/* ------------------------------------------------------------------ width */

/**
 * The block's own width, not the viewport's. The console has a fixed rail and an
 * unclamped content column, so a media query would answer a question nobody
 * asked — what matters is how much room this block has.
 */
function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number | null] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    setWidth(node.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

/**
 * The document fragment, as an external store. A permalink changes it without
 * React knowing, so it is subscribed to rather than read once.
 */
function subscribeToFragment(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function readFragment(): string {
  return window.location.hash
}

/** No fragment on the server; the client corrects it on hydration. */
function readNothing(): string {
  return ''
}

function sameAnchors(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}
