import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { Entity } from '@/lib/catalog'
import { cn } from '@/lib/utils'

/**
 * A metric's numbers, as a stat block rather than a definition list.
 *
 * `target`, `window` and `direction` are the whole substance of a metric page —
 * they are what somebody opens it to read — so they sit above the prose in the
 * shape a number belongs in, not buried in the generic Details list with
 * `metric-type` and a dozen common fields. The page renders them here and
 * `EntityDetails` is told to skip them, so each field still appears exactly
 * once.
 *
 * Direction is drawn as an ARROW. `higher-is-better` and `lower-is-better`
 * differ by one word in the middle of a hyphenated token, and the reader's
 * question — is more of this good? — is a direction, which is what an arrow is
 * for. The sentence stays beside it and in the tooltip; the arrow is what the
 * eye gets first.
 *
 * Every value is read defensively. The kind's frontmatter contract lands with
 * the kind document, and a metric authored against a contract this portal has
 * not caught up with must still render what it does carry — the loader is what
 * complains about a missing or malformed field, not this.
 */

/** The fields this block owns. `EntityDetails` is given the same list to skip. */
export const METRIC_STAT_FIELDS = ['metric-type', 'target', 'window', 'direction'] as const

export function MetricStats({ entity }: { entity: Entity }) {
  const frontmatter = entity.frontmatter as Record<string, unknown>
  const type = scalar(frontmatter['metric-type'])
  const target = scalar(frontmatter.target)
  const window = scalar(frontmatter.window)
  const direction = scalar(frontmatter.direction)

  if (!type && !target && !window && !direction) return null

  return (
    <section className="mt-6">
      <div className="panel divide-y divide-border sm:flex sm:divide-x sm:divide-y-0">
        <Stat label="Target" value={target} emphasis />
        <Stat label="Window" value={window} />
        <Stat
          label="Direction"
          value={direction}
          render={(value) => <Direction value={value} />}
        />
        <Stat label="Type" value={type} />
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  emphasis = false,
  render,
}: {
  label: string
  value: string | null
  emphasis?: boolean
  render?: (value: string) => React.ReactNode
}) {
  return (
    <div className="min-w-0 flex-1 px-4 py-3">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <div
        className={cn(
          'mt-1 font-mono break-words',
          // The target is the number the metric exists for; everything else on
          // the block is the context that makes it readable.
          emphasis ? 'text-[17px] text-foreground' : 'text-[13.5px] text-foreground/85',
        )}
      >
        {value === null ? (
          <span className="text-[13px] text-muted-foreground italic">not stated</span>
        ) : render ? (
          render(value)
        ) : (
          value
        )}
      </div>
    </div>
  )
}

/**
 * Which way is better, as an arrow in the metric's own hue.
 *
 * A value the ontology does not know renders as the word with a neutral dash:
 * the console does not get to decide that an unrecognised direction points up.
 */
function Direction({ value }: { value: string }) {
  const known: Record<string, { Icon: typeof ArrowUp; sentence: string }> = {
    'higher-is-better': { Icon: ArrowUp, sentence: 'higher is better' },
    'lower-is-better': { Icon: ArrowDown, sentence: 'lower is better' },
  }
  const match = known[value]
  const Icon = match?.Icon ?? Minus

  return (
    <span className="flex items-center gap-1.5" title={match?.sentence ?? value}>
      <Icon className={cn('size-4 shrink-0', match ? 'text-kind-metric' : 'text-muted-foreground')} aria-hidden />
      <span className="text-[13.5px] text-foreground/85">{match?.sentence ?? value}</span>
    </span>
  )
}

/** A frontmatter value as one line of text, or null when there is nothing to show. */
function scalar(value: unknown): string | null {
  if (typeof value === 'string') return value.trim().length > 0 ? value.trim() : null
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}
