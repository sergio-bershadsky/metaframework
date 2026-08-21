import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Catalog health, always visible. Integrity is enforced at load time, so the
 * masthead is the only place inside the portal where a broken reference can
 * announce itself — hiding it behind a page nobody visits would defeat the
 * validation entirely. (`metaframework check` runs the same loader from a
 * terminal and exits non-zero; this is the in-portal half of the same answer.)
 */
export function DiagnosticsIndicator({ errors, warnings }: { errors: number; warnings: number }) {
  const healthy = errors === 0 && warnings === 0

  return (
    <Link
      href="/diagnostics"
      className={cn(
        'focusable inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs transition',
        healthy
          ? 'border-border text-muted-foreground hover:text-foreground'
          : errors > 0
            ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15'
            : 'border-warning/40 bg-warning/10 text-warning hover:bg-warning/15',
      )}
    >
      {healthy ? (
        <>
          <CheckCircle2 className="size-3.5" aria-hidden />
          Catalog valid
        </>
      ) : (
        <>
          {errors > 0 ? <XCircle className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
          <span className="font-mono">
            {errors > 0 && `${errors} error${errors === 1 ? '' : 's'}`}
            {errors > 0 && warnings > 0 && ' · '}
            {warnings > 0 && `${warnings} warning${warnings === 1 ? '' : 's'}`}
          </span>
        </>
      )}
    </Link>
  )
}
