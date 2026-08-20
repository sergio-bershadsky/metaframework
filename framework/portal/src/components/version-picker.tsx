'use client'

import { Check, ChevronDown } from 'lucide-react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { VERSION_CHIP, VERSION_CHIP_CURRENT, VERSION_CHIP_HISTORICAL, VersionBadge } from '@/components/kind-badge'
import { cn } from '@/lib/utils'

/**
 * The version badge, promoted to a control.
 *
 * The catalog keeps only the current version on disk; every earlier one is a
 * commit. That history was already computed and never shown, so the badge that
 * says "v4" was the natural place to hang it — the reader is already looking at
 * the number they want to change.
 *
 * Selection navigates rather than setting state: `?v=N` is server-rendered, so
 * a historical view is shareable, linkable and survives a reload. A client
 * component is used only for the popover mechanics; nothing about *which*
 * version is shown lives here.
 *
 * With one version, or with git unavailable, the caller passes no options and
 * this degrades to the plain badge — a dropdown with a single dead entry is a
 * worse affordance than no dropdown at all.
 */

export interface VersionOption {
  version: number
  /**
   * Author date of the commit carrying this version, ISO 8601 with offset.
   * Empty for a current version git has never seen — an entity edited but not
   * yet committed still has to appear in its own picker.
   */
  date: string
  subject: string
  short: string
  /** True for the version on the filesystem right now. */
  current: boolean
}

export function VersionPicker({
  href,
  selected,
  current,
  options,
  reach,
  className,
}: {
  /** The entity's canonical route, without a query. */
  href: string
  /** The version being rendered. */
  selected: number
  /** The version on disk. */
  current: number
  /** Every version in history, newest first. */
  options: VersionOption[]
  /**
   * The floor of the version index, when it sits above v1 — see HistoryReach.
   * A list that silently starts at v7 claims the entity has no earlier past;
   * this is what lets the list say "starts here" instead.
   */
  reach?: { earliest: number; short: string; date: string } | null
  className?: string
}) {
  const historical = selected !== current

  if (options.length < 2) {
    return <VersionBadge version={selected} historical={historical} className={className} />
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Version ${selected} of ${options.length} — choose another`}
        className={cn(
          VERSION_CHIP,
          historical ? VERSION_CHIP_HISTORICAL : VERSION_CHIP_CURRENT,
          'focusable gap-1 transition hover:brightness-125',
          className,
        )}
      >
        v{selected}
        <ChevronDown className="size-3 opacity-70" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-80 max-w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuLabel className="text-[11px] tracking-wider uppercase">
          {options.length} versions in git
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {options.map((option) => (
          <DropdownMenuItem key={option.version} asChild className="items-start gap-2 px-1.5 py-1.5">
            {/* The current version addresses itself with the bare route: the
                canonical URL of "latest" must not carry a pin that goes stale
                the moment the entity is edited. */}
            <Link href={option.current ? href : `${href}?v=${option.version}`}>
              <Check
                className={cn('mt-0.5 size-3.5 shrink-0', option.version === selected ? 'opacity-100' : 'opacity-0')}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      'font-mono text-[12px] font-medium',
                      option.current ? 'text-primary' : 'text-foreground/85',
                    )}
                  >
                    v{option.version}
                  </span>
                  {option.current && (
                    <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                      current
                    </span>
                  )}
                  {/* The ISO date, not a relative one: this renders on the
                      server, and "3 days ago" would differ on hydration. */}
                  {option.date && (
                    <time
                      dateTime={option.date}
                      title={option.date}
                      className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground"
                    >
                      {option.date.slice(0, 10)}
                    </time>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{option.subject}</span>
              </span>
            </Link>
          </DropdownMenuItem>
        ))}

        {/* The end of the list, said out loud. Without it a list that starts at
            v7 reads as "this entity has seven versions and I am showing them
            all", and a reader who then types ?v=1 and is refused concludes the
            portal is broken. It is the last item because that is where the
            reader arrives asking the question. */}
        {reach && (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              The list starts at <span className="font-mono">v{reach.earliest}</span> —{' '}
              <code className="font-mono text-[11px]">{reach.short}</code> is the oldest commit touching this
              path. {reach.earliest === 2 ? 'v1 is' : `v1–v${reach.earliest - 1} are`} older than it and
              cannot be shown here.
            </p>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
