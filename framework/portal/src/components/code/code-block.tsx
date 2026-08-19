'use client'

import { Fragment, useEffect, useState } from 'react'
import { monacoLanguage } from '@/lib/artifacts/language'
import { cn } from '@/lib/utils'

/**
 * A fenced code block in prose — tokenised by Monaco, but not an editor.
 *
 * `monaco.editor.colorize()` runs the same tokenizer and resolves the same
 * theme as the editor does, with no editor instance behind it. That matters for
 * two reasons a page of prose makes obvious: a document can hold a dozen fences,
 * and a dozen editors is a dozen scroll containers, resize observers and cursor
 * targets; and an editor in the middle of a paragraph is a keyboard trap — Tab
 * types a tab instead of moving on.
 *
 * Colorize hands back an HTML string. Rather than inject it, the string is
 * parsed in an inert document and rebuilt as React elements, carrying nothing
 * across but each token's class name and its text. Monaco's own line renderer
 * already escapes everything it emits; this keeps the guarantee local instead
 * of borrowing it.
 *
 * The plain text renders first and stays if colouring never arrives, so a
 * failure costs syntax colour and nothing else.
 *
 * `./monaco` is reached through an `import()` inside the effect rather than at
 * the top of the file. A static import would be a static edge from every page
 * that renders prose — the entity page renders `<Markdown>` unconditionally —
 * so Monaco's configuration, theme and SRN link provider rode along on pages
 * whose prose holds no fence at all. The effect already declines to run for
 * plaintext, so this makes the module obey the same condition the work does.
 */

interface CodeToken {
  className: string
  text: string
}

export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string
  /** Fence label (`yaml`) or file extension (`.json`). */
  language?: string
  className?: string
}) {
  const [lines, setLines] = useState<CodeToken[][] | null>(null)
  const resolved = monacoLanguage(language)

  useEffect(() => {
    if (resolved === 'plaintext') return
    let alive = true
    import('./monaco')
      .then((module) => module.loadMonaco())
      .then((monaco) => monaco.editor.colorize(code, resolved, { tabSize: 2 }))
      .then((markup) => {
        if (alive) setLines(toTokenLines(markup))
      })
      .catch(() => {
        // Colour is an enhancement; the text below is already readable.
      })
    return () => {
      alive = false
    }
  }, [code, resolved])

  return (
    <pre
      className={cn(
        'my-4 overflow-x-auto rounded-lg border border-border bg-surface p-3.5 font-mono text-[12.5px] leading-6',
        className,
      )}
      data-language={resolved}
    >
      {lines === null ? (
        <code className="text-foreground/85">{code}</code>
      ) : (
        <code>
          {lines.map((tokens, line) => (
            <Fragment key={line}>
              {line > 0 && '\n'}
              {tokens.map((token, index) => (
                <span key={index} className={token.className || undefined}>
                  {token.text}
                </span>
              ))}
            </Fragment>
          ))}
        </code>
      )}
    </pre>
  )
}

/**
 * Monaco's colorized markup as data.
 *
 * Each line is a `<span>` wrapping one `<span class="mtkN">` per token, and the
 * lines are separated by `<br/>` — so the walk has to descend rather than read
 * the top level, or every line comes back as a single unclassed run of text.
 *
 * `DOMParser` builds the markup in an inert document — no scripts run, nothing
 * is attached to the live page — and only class names and text cross back over.
 * Non-breaking spaces are normalised so a copied block pastes as the source
 * rather than as the rendering.
 */
function toTokenLines(markup: string): CodeToken[][] {
  const lines: CodeToken[][] = [[]]

  const parsed = new DOMParser().parseFromString(`<div>${markup}</div>`, 'text/html')
  const root = parsed.body.firstElementChild
  if (!root) return lines

  const walk = (node: Node, className: string) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeName === 'BR') {
        lines.push([])
        continue
      }
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent ?? '').replace(/\u00a0/g, ' ')
        if (text !== '') lines[lines.length - 1].push({ className, text })
        continue
      }
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as Element
        // The innermost element carrying a class wins; a bare wrapper inherits.
        walk(element, element.getAttribute('class') ?? className)
      }
    }
  }

  walk(root, '')

  // Colorize terminates every line, including the last, so the tail is an
  // artefact of the format rather than a line in the source.
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop()
  return lines
}
