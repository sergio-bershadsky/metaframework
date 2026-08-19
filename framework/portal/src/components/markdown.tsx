import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { entityHref } from '@/lib/catalog/href'

/**
 * Entity prose. `srn://` links are rewritten to portal routes so a reference
 * written for a human reading the raw file also works as navigation — the same
 * string serves both readers, which is the point of having one ref syntax.
 */
export function Markdown({ children }: { children: string }) {
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
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children: label }) {
            if (href?.startsWith('srn://')) {
              return (
                <Link
                  href={entityHref(href.replace(/@\d+$/, ''))}
                  className="font-mono text-[0.92em] text-primary underline-offset-4 hover:underline"
                >
                  {label}
                </Link>
              )
            }
            return (
              <a
                href={href}
                className="text-primary underline-offset-4 hover:underline"
                {...(href?.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
              >
                {label}
              </a>
            )
          },
          code({ className, children: content }) {
            const isBlock = Boolean(className)
            if (isBlock) return <code className="font-mono text-[13px]">{content}</code>
            return (
              <code className="rounded border border-border bg-surface px-1 py-0.5 font-mono text-[0.88em] text-foreground/90">
                {content}
              </code>
            )
          },
          pre({ children: content }) {
            return (
              <pre className="my-4 overflow-x-auto rounded-lg border border-border bg-surface p-3.5 text-[13px] leading-6">
                {content}
              </pre>
            )
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
