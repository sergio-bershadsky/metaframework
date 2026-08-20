'use client'

import Editor from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { CONSOLE_THEME, loadMonaco, setSrnNavigator } from './monaco'
import type { SourceSpan } from '@/lib/artifacts/source-map'
import { entityHref } from '@/lib/catalog/href'
import { cn } from '@/lib/utils'

/**
 * An artifact's source, in a real editor.
 *
 * A `<pre>` cannot do the two things this view exists for: highlight the exact
 * lines a diagram element was authored on, and turn every `srn://` in the file
 * into a link to that entity. Monaco does both — the first with decorations,
 * the second with a link provider we own, which is precisely the navigation a
 * JSON language service could not give us (it links same-document pointers and
 * nothing else).
 *
 * It is read-only, and it exists only while its disclosure is open. A dozen
 * editors on one page is not viable, so a closed block costs nothing: the block
 * that owns this component does not render it until it is opened.
 */

export interface SourceViewProps {
  value: string
  /** A Monaco language id — `yaml`, `json`, `markdown`, `plaintext`. */
  language: string
  /** Stable model uri, one per artifact, so view state survives a reopen. */
  path: string
  /** Lines to light up, from the visual side. */
  highlight?: SourceSpan | null
  /** The line the caret moved to — the reverse half of the join. */
  onLine?: (line: number) => void
  /**
   * Explicit canvas height. Omit it to let the container size the editor —
   * which is what a pane stretched by the drawing beside it needs.
   */
  height?: number
  /** Announced to screen readers when focus lands in the editor. */
  label: string
  className?: string
}

/** Read-only means read-only: no suggestions, no context menu, no wheel capture. */
const OPTIONS: Monaco.editor.IStandaloneEditorConstructionOptions = {
  readOnly: true,
  domReadOnly: true,
  automaticLayout: true,
  minimap: { enabled: false },
  lineNumbersMinChars: 3,
  glyphMargin: false,
  folding: true,
  scrollBeyondLastLine: false,
  renderLineHighlight: 'none',
  fontFamily: 'var(--font-plex-mono), ui-monospace, SFMono-Regular, monospace',
  fontSize: 12.5,
  lineHeight: 20,
  padding: { top: 10, bottom: 10 },
  // The editor sits inside a scrolling document. Consuming the wheel at the end
  // of the file would trap the page — the same rule the diagrams follow.
  scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9, alwaysConsumeMouseWheel: false },
  overviewRulerLanes: 0,
  overviewRulerBorder: false,
  hideCursorInOverviewRuler: true,
  contextmenu: false,
  occurrencesHighlight: 'off',
  selectionHighlight: false,
  renderWhitespace: 'none',
  stickyScroll: { enabled: false },
  // Rainbow brackets would be the one place in this console where colour means
  // nesting depth rather than entity kind.
  bracketPairColorization: { enabled: false },
  quickSuggestions: false,
  wordBasedSuggestions: 'off',
  // Tab moves focus on rather than doing nothing: in a read-only editor the
  // default is a keyboard trap with no exit a reader would guess at.
  tabFocusMode: true,
  links: true,
}

export function SourceView({
  value,
  language,
  path,
  highlight = null,
  onLine,
  height,
  label,
  className,
}: SourceViewProps) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null)
  const onLineRef = useRef(onLine)
  const labelRef = useRef(label)

  useEffect(() => {
    onLineRef.current = onLine
    labelRef.current = label
  })

  // `@monaco-editor/react` fetches Monaco from a CDN unless it is handed an
  // instance first, so the editor is not rendered until ours is configured.
  useEffect(() => {
    let alive = true
    loadMonaco().then(
      () => {
        if (alive) setReady(true)
      },
      () => {
        if (alive) setReady(false)
      },
    )
    return () => {
      alive = false
    }
  }, [])

  // The link opener is a Monaco singleton but the router is not; swapping the
  // callback keeps navigation client-side without registering a second opener.
  useEffect(() => {
    setSrnNavigator((srn) => router.push(entityHref(srn)))
  }, [router])

  const handleMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor
    decorationsRef.current = editor.createDecorationsCollection([])
    editor.updateOptions({ ariaLabel: labelRef.current })
    editor.onDidChangeCursorPosition((event) => onLineRef.current?.(event.position.lineNumber))
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    const decorations = decorationsRef.current
    if (!editor || !decorations) return

    if (!highlight) {
      decorations.clear()
      return
    }

    decorations.set([
      {
        range: {
          startLineNumber: highlight.startLine,
          startColumn: 1,
          endLineNumber: highlight.endLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'code-anchor-lines',
          linesDecorationsClassName: 'code-anchor-gutter',
        },
      },
    ])

    // Only scroll when the reader cannot already see it: yanking the viewport
    // under someone who is reading the lines you just lit is worse than nothing.
    const visible = editor.getVisibleRanges()[0]
    const inView =
      visible !== undefined &&
      highlight.startLine >= visible.startLineNumber &&
      highlight.startLine <= visible.endLineNumber
    if (!inView) editor.revealLineInCenterIfOutsideViewport(highlight.startLine)
  }, [highlight])

  if (!ready) {
    return (
      <div
        className={cn('grid place-items-center bg-surface', className)}
        style={height === undefined ? undefined : { height }}
        role="status"
        aria-live="polite"
      >
        <span className="font-mono text-[11px] text-muted-foreground">Loading source…</span>
      </div>
    )
  }

  return (
    <div className={cn('bg-surface', className)} style={height === undefined ? undefined : { height }}>
      <Editor
        value={value}
        language={language}
        path={path}
        theme={CONSOLE_THEME}
        height="100%"
        options={OPTIONS}
        onMount={handleMount}
        loading={<span className="font-mono text-[11px] text-muted-foreground">Loading source…</span>}
      />
    </div>
  )
}
