import type { LifecycleStage } from '@/lib/ui/lifecycle'
import { cn } from '@/lib/utils'

/**
 * Lifecycle, beside status, and deliberately unlike it.
 *
 * The spec works hard to keep these two apart — `status` is the review state of
 * the description, `lifecycle` is the delivery state of the thing described —
 * and two chips that looked alike would undo that work in the one place a
 * reader actually meets both. So every channel differs:
 *
 * | channel | status chip                | lifecycle chip                  |
 * | ------- | -------------------------- | ------------------------------- |
 * | shape   | rounded rectangle          | pill                            |
 * | case    | UPPERCASE, letter-spaced   | Title case, normal tracking     |
 * | colour  | coded (warning, destructive, environment hue) | none — neutral |
 * | glyph   | none                       | a stage meter                   |
 *
 * The absence of colour is a decision, not an omission: colour is ontology in
 * this console and hue means "which kind". Status already borrows the alert
 * registers; a second borrower would leave three different meanings on one
 * channel. The meter carries what colour would have carried, and carries it
 * better — lifecycle is a *sequence*, and a meter says where in the sequence
 * this is, which no single colour can.
 */
export function LifecycleChip({ stage, className }: { stage: LifecycleStage; className?: string }) {
  return (
    <span
      title={`Lifecycle: ${stage.label} — the delivery state of the thing described, not of this description`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2 py-0.5',
        'text-[11px] font-medium text-foreground/80',
        className,
      )}
    >
      <StageMeter index={stage.index} total={stage.total} />
      <span className="sr-only">Lifecycle: </span>
      {stage.label}
    </span>
  )
}

/**
 * Where in the sequence this is: one bar per stage, lit up to the current one.
 *
 * A value outside the kind's sequence (`index === -1`) lights nothing rather
 * than guessing a position — the loader is what complains about the value; this
 * only declines to invent a place for it.
 */
function StageMeter({ index, total }: { index: number; total: number }) {
  return (
    <span className="flex items-center gap-[2px]" aria-hidden>
      {Array.from({ length: total }, (_, stage) => (
        <span
          key={stage}
          className={cn(
            'block h-2 w-[2px] rounded-full',
            stage <= index ? 'bg-foreground/70' : 'bg-border-strong',
          )}
        />
      ))}
    </span>
  )
}
