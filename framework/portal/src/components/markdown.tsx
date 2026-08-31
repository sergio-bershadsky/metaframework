import { isValidElement } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PROSE_ICONS } from '@/lib/catalog/prose-icons'
import { remarkProseIcons } from '@/lib/catalog/remark-prose-icons'
import { CodeBlock } from '@/components/code/code-block'
import { EntityLink } from '@/components/entity-link'
import type { ResolvedMention } from '@/lib/catalog/mentions'
import { SRN_PATTERN } from '@/lib/catalog/mentions'

/**
 * Entity prose.
 *
 * Any SRN in the text becomes a navigable badge, whether it was written as a
 * markdown link or dropped bare into a sentence. Authors reference things the
 * way the framework already asks them to — by SRN — and get linking for free,
 * with no second syntax to learn and nothing to keep in sync.
 *
 * Linking is deliberately limited to SRNs. Matching bare entity *names* would
 * be guesswork: "payment" is a component here and an English word everywhere
 * else, and a false link is worse than no link in a document people review.
 */
export function Markdown({
  children,
  mentions = {},
}: {
  children: string
  /** SRN (as authored) → resolution, from mentionsIn(). */
  mentions?: Record<string, ResolvedMention>
}) {
  return (
    <div
      className="max-w-3xl text-[14.5px] leading-7 text-foreground/85
                 [&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-foreground
                 [&_h2]:mt-7 [&_h2]:mb-2.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground
                 [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:uppercase [&_h3]:tracking-wider [&_h3]:text-muted-foreground
                 [&_p]:my-3
                 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5
                 [&_li]:my-1 [&_li]:marker:text-muted-foreground
                 [&_strong]:font-semibold [&_strong]:text-foreground
                 [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground
                 [&_hr]:my-6 [&_hr]:border-border
                 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[13px]
                 [&_th]:border [&_th]:border-border [&_th]:bg-surface [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium
                 [&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkProseIcons]}
        urlTransform={allowSrnUrls}
        components={
          {
          // `:icon-name:` from remarkProseIcons. Sized in `em` and coloured by
          // `currentColor`, so a glyph inherits whatever it sits inside —
          // a table cell, a heading, a bold run — instead of needing a variant
          // per context.
          //
          // The three numbers are measured, not chosen. `vertical-align` rather
          // than a transform, because only the former participates in line
          // layout — a translated glyph overlaps the line above it and the line
          // box never knows. `-0.13em` puts the box centre on the text's
          // cap-height centre: for an inline-block the box bottom sits on the
          // baseline, so the correction is (cap - size)/2, and cap is ~0.7em in
          // this family. Lucide draws inside ~20 of its 24 viewBox units, so
          // `0.95em` of box is ~1.15x cap of ink — icons need to run slightly
          // larger than caps to read as the same weight. `mx-0.12em` is
          // breathing room on both sides, because the glyph may sit either side
          // of the text and markdown only supplies a space on one.
          //
          // Verified in a browser at two font sizes: the glyph's optical centre
          // lands 0.03px from the cap-height centre in a 13px table cell and in
          // a 14.5px paragraph. The previous values were 2.59px low.
          // react-markdown types `components` against known HTML element
          // names, so a custom element needs the cast. The plugin is the only
          // producer of this node, and its `name` is safelisted before the node
          // is emitted, so the cast narrows nothing the renderer relies on.
          proseicon: (({ name }: { name?: string }) => {
            const Glyph = name ? PROSE_ICONS[name] : undefined
            if (!Glyph) return null
            return (
              <Glyph
                aria-label={name}
                role="img"
                className="mx-[0.12em] inline-block size-[0.95em] shrink-0 align-[-0.13em] text-current"
                strokeWidth={2}
              />
            )
          }) as never,
          a({ href, children: label }) {
            if (href?.startsWith('srn://')) {
              const mention = mentions[href]
              return (
                <EntityLink
                  target={mention?.target ?? null}
                  reference={href}
                  version={mention?.version}
                  href={mention?.href}
                  className="mx-0.5"
                />
              )
            }
            return (
              // `focusable` is the console's only focus indicator — a
              // third-party stylesheet in the bundle sets `:focus { outline:
              // none }` on everything, so a control without this class has no
              // ring at all, not even the browser's. `hover:underline` does not
              // fire on focus, so an author's link was the one tab stop on an
              // entity page that showed nothing when reached by keyboard. The
              // class defines a `:focus-visible` outline and nothing else, so
              // the resting and hover appearance are unchanged.
              <a
                href={href}
                className="focusable rounded text-primary underline-offset-4 hover:underline"
                {...(href?.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                {label}
              </a>
            )
          },
          // Bare SRNs sitting in ordinary prose are linked too, so authors are
          // not forced to write a markdown link around every mention.
          p({ children: content }) {
            return <p>{linkifyChildren(content, mentions)}</p>
          },
          li({ children: content }) {
            return <li>{linkifyChildren(content, mentions)}</li>
          },
          td({ children: content, style }) {
            return <td style={style}>{linkifyChildren(content, mentions)}</td>
          },
          // remark-gfm emits a real `<thead>` with real `<th>`s, but no `scope`.
          // A pipe table can only ever have column headers, so the answer is
          // always `col` — which is the fix and also why it is safe to state
          // unconditionally here rather than per table. `style` carries the
          // column alignment mdast-util-to-hast derives from `|:---:|`; it is
          // passed through because overriding the element would otherwise drop
          // it. Nothing else about the cell changes.
          th({ children: content, style }) {
            return (
              <th scope="col" style={style}>
                {content}
              </th>
            )
          },
          code({ className, children: content }) {
            if (className) return <code className="font-code text-[13px]">{content}</code>
            return (
              <code className="rounded border border-border bg-surface px-1 py-0.5 font-code text-[0.88em] text-foreground/90">
                {content}
              </code>
            )
          },
          // A fenced block is handed to Monaco's colouriser rather than drawn
          // as flat text. It is intercepted at `pre` rather than at `code`
          // because only the outer element can be replaced wholesale — matching
          // on `code` alone would leave the block wrapped in a second <pre>.
          pre({ children: content }) {
            const fence = fenceOf(content)
            if (fence) return <CodeBlock code={fence.code} language={fence.language} />
            return (
              <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-surface p-3.5 font-code text-[13px] leading-[1.3]">
                {content}
              </pre>
            )
          },
          } as Components
        }
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/**
 * The source and language of a fenced block, or null for anything else a `<pre>`
 * may contain. react-markdown hands `pre` a single `code` child carrying the
 * fence's text and a `language-…` class; an indented block has the same child
 * with no class, which is still a fence and still worth rendering as one — as
 * plaintext, which is what an unlabelled fence is.
 */
function fenceOf(children: React.ReactNode): { code: string; language?: string } | null {
  if (!isValidElement(children)) return null
  const props = children.props as { className?: string; children?: React.ReactNode }
  const text = props.children
  if (typeof text !== 'string') return null
  const language = (props.className ?? '').match(/language-([\w-]+)/)?.[1]
  return { code: text.replace(/\n$/, ''), language }
}

/**
 * react-markdown sanitises hrefs through `urlTransform`, whose default drops
 * every scheme outside http/https/mailto/tel — which silently blanked every
 * `srn://` link. This restores the framework's own scheme while keeping the
 * protections that matter: `javascript:` and `data:` stay blocked.
 */
function allowSrnUrls(url: string): string {
  const normalized = url.trim().toLowerCase()
  if (normalized.startsWith('javascript:') || normalized.startsWith('data:') || normalized.startsWith('vbscript:')) {
    return ''
  }
  return url
}

/**
 * Replace bare SRNs inside already-rendered children with badges. Only plain
 * strings are touched, so SRNs inside code spans or existing links are left
 * exactly as the author wrote them.
 */
function linkifyChildren(children: React.ReactNode, mentions: Record<string, ResolvedMention>): React.ReactNode {
  if (typeof children === 'string') return linkifyText(children, mentions)
  if (Array.isArray(children)) {
    return children.map((child, index) =>
      typeof child === 'string' ? (
        <span key={index}>{linkifyText(child, mentions)}</span>
      ) : (
        child
      ),
    )
  }
  return children
}

function linkifyText(text: string, mentions: Record<string, ResolvedMention>): React.ReactNode {
  if (!text.includes('srn://')) return text

  const parts: React.ReactNode[] = []
  let cursor = 0

  for (const match of text.matchAll(SRN_PATTERN)) {
    const ref = match[0]
    const start = match.index ?? 0
    if (start > cursor) parts.push(text.slice(cursor, start))
    const mention = mentions[ref]
    parts.push(
      <EntityLink
        key={`${ref}-${start}`}
        target={mention?.target ?? null}
        reference={ref}
        version={mention?.version}
        href={mention?.href}
        className="mx-0.5"
      />,
    )
    cursor = start + ref.length
  }

  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}
