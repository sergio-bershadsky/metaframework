'use client'

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import type { Diagnostic } from '@/lib/catalog/types'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/**
 * The version check, as a chip that resolves.
 *
 * This is the one check on an entity page that cannot be answered from disk: it
 * walks the entity's commits and diffs consecutive pairs, which is slow enough
 * that it streams in after the page rather than holding up first paint. That
 * creates a UI problem the loader diagnostics never had — for a second or so
 * there is nothing on screen, and then possibly still nothing, and a reader
 * cannot tell "passed" from "still working" from "this repository has no git".
 *
 * So the chip is always present and always says which of the three it is:
 *
 * | state      | glyph            | means                                        |
 * | ---------- | ---------------- | -------------------------------------------- |
 * | `checking` | spinner          | the walk is running; this is the Suspense fallback |
 * | `clean`    | tick, muted      | every commit that changed content bumped `version` |
 * | `findings` | warning, coloured| it did not, and the count is the button       |
 *
 * Only the third is interactive, because only the third has anything to show.
 * A tick that opened an empty dialog would train people to stop pressing it.
 *
 * Absence is the fourth state and is deliberately silent: where git cannot
 * answer, the server renders nothing at all rather than a fourth glyph nobody
 * can act on. An unbumped version is a claim about commits, so with no commits
 * there is no claim to make either way — and `catalog-renders-without-git`
 * requires the page to degrade rather than explain itself here.
 */
export function VersionCheck({ findings }: { findings: Diagnostic[] }) {
  const errors = findings.filter((finding) => finding.severity === 'error').length
  const warnings = findings.length - errors

  if (findings.length === 0) {
    return (
      <Chip tone="quiet" title="Every commit that changed this entity's content also bumped its version.">
        <CheckCircle2 className="size-3.5" aria-hidden />
        Versions consistent
      </Chip>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          title="Content changed without a version bump — press for the commits"
          className={cn(
            'focusable inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition',
            errors > 0
              ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
              : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15',
          )}
        >
          {errors > 0 ? (
            <XCircle className="size-3.5" aria-hidden />
          ) : (
            <AlertTriangle className="size-3.5" aria-hidden />
          )}
          <span className="font-mono">
            {findings.length} version {findings.length === 1 ? 'issue' : 'issues'}
          </span>
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            Content changed without a version bump
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            Every content change bumps <code className="font-code">version</code>; only a commit
            touching <code className="font-code">status:</code> alone is exempt. Where this
            happened, one version number names two different files — so a reference pinned to it
            resolves to whichever the index recorded, not to what is on disk now.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {findings.map((finding, index) => (
            <div
              key={`${finding.path}-${index}`}
              className="rounded-md border border-border bg-surface p-2.5"
            >
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'font-code text-[11px]',
                    finding.severity === 'error' ? 'text-destructive' : 'text-warning',
                  )}
                >
                  {finding.code}
                </span>
                <span className="truncate font-code text-[11px] text-muted-foreground">
                  {finding.path}
                </span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-foreground/85">
                {finding.message}
              </p>
            </div>
          ))}
        </div>

        <p className="text-[12px] text-muted-foreground">
          {errors > 0 && `${errors} error${errors === 1 ? '' : 's'}`}
          {errors > 0 && warnings > 0 && ' · '}
          {warnings > 0 && `${warnings} warning${warnings === 1 ? '' : 's'}`}
          {' — found by walking this entity’s commits, so it needs git and is absent without it.'}
        </p>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The pending state, rendered as the Suspense fallback so the chip occupies its
 * final size from first paint and nothing below it moves when the answer lands.
 */
export function VersionCheckPending() {
  return (
    <Chip tone="quiet" title="Walking this entity’s commits to check that content changes bumped its version.">
      <Loader2 className="size-3.5 animate-spin" aria-hidden />
      Checking versions…
    </Chip>
  )
}

function Chip({
  tone,
  title,
  children,
}: {
  tone: 'quiet'
  title: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]',
        tone === 'quiet' && 'border-border text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}
