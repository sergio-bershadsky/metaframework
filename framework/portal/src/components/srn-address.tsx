'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * An SRN rendered as an address rather than as prose: the scheme is
 * de-emphasised, separators are dimmed so the segments read as a path, and the
 * whole string is one click from the clipboard — SRNs are what you paste into
 * frontmatter, so copying is the primary verb.
 */
export function SrnAddress({
  srn,
  version,
  className,
  copyable = true,
}: {
  srn: string
  version?: number | null
  className?: string
  copyable?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const body = srn.replace('srn://', '')
  const segments = body.split('/')
  const full = version == null ? srn : `${srn}@${version}`

  async function copy() {
    await navigator.clipboard.writeText(full)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <span className={cn('srn inline-flex items-center gap-1.5 group/srn', className)}>
      <span className="srn-scheme">srn://</span>
      <span className="min-w-0">
        {segments.map((segment, index) => (
          <span key={`${segment}-${index}`}>
            {index > 0 && <span className="text-muted-foreground/45">/</span>}
            <span className="text-foreground/85">{segment}</span>
          </span>
        ))}
        {version != null && <span className="text-primary">@{version}</span>}
      </span>
      {copyable && (
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : `Copy ${full}`}
          className="focusable shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition
                     group-hover/srn:opacity-100 focus-visible:opacity-100 hover:text-foreground"
        >
          {copied ? <Check className="size-3.5 text-kind-environment" /> : <Copy className="size-3.5" />}
        </button>
      )}
    </span>
  )
}
