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
 * | glyph   | none                       | a stage marker                  |
 *
 * The absence of colour is a decision, not an omission: colour is ontology in
 * this console and hue means "which kind". Status already borrows the alert
 * registers; a second borrower would leave three different meanings on one
 * channel. The marker carries what colour would have carried, and carries it
 * better — lifecycle is a *sequence*, and a marker says where in the sequence
 * this is, which no single colour can.
 */
export function LifecycleChip({ stage, className }: { stage: LifecycleStage; className?: string }) {
  const position = stage.index >= 0 ? ` — stage ${stage.index + 1} of ${stage.total}` : ''
  const phase = stage.inTail ? ', in the sunset/retired tail' : ''

  return (
    <span
      title={`Lifecycle: ${stage.label}${position}${phase} — the delivery state of the thing described, not of this description`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-raised px-2 py-0.5',
        'text-[11px] font-medium text-foreground/80',
        className,
      )}
    >
      <StageMarker stage={stage} />
      <span className="sr-only">Lifecycle: </span>
      {stage.label}
    </span>
  )
}

/**
 * Where in the sequence this is — and why that is not a progress bar.
 *
 * The first version of this filled every tick up to the current stage, which is
 * the natural encoding for a sequence and the wrong one for THIS sequence. A
 * `released` component filled 3 of 5 and a `sunset` one filled 4 of 5, so the
 * eye read the dying component as the further-along and therefore healthier of
 * the two. The last two stages are decay, not progress; there is no quantity
 * here that gets larger as things get better, and a cumulative fill asserts that
 * there is.
 *
 * So nothing accumulates. Exactly one tick is lit — the current stage — and the
 * ticks are split into the run-up and the {@link LIFECYCLE_TAIL} it ends in,
 * set apart by a gap and dropped to a lower, shorter baseline. What the glyph
 * now claims is only what is true: which stage of how many, and whether that
 * stage is on the way in or on the way out.
 *
 * A value outside the kind's sequence (`index === -1`) lights nothing rather
 * than guessing a position — the loader is what complains about the value; this
 * only declines to invent a place for it.
 */
function StageMarker({ stage }: { stage: LifecycleStage }) {
  return (
    // `items-end` so the tail's shorter ticks hang from a lower line rather than
    // floating in the middle of the run-up's.
    <span className="flex h-2.5 items-end gap-[2px]" aria-hidden>
      {Array.from({ length: stage.total }, (_, position) => {
        const tail = position >= stage.tailFrom
        const current = position === stage.index
        return (
          <span
            key={position}
            className={cn(
              'block rounded-full',
              // Two channels for the marker, because one 2px bar told apart from
              // its neighbours by lightness alone is not enough at 11px.
              current ? 'w-[3px]' : 'w-[2px]',
              // The step down is the whole tail signal, so it has to survive the
              // current tick being taller: a lit tail tick is still shorter than
              // an unlit run-up one.
              tail ? 'h-1.5' : 'h-2.5',
              current ? 'bg-foreground' : 'bg-border-strong',
              // Only before the first tail tick, and only when there is a run-up
              // in front of it to be set apart from.
              tail && position === stage.tailFrom && stage.tailFrom > 0 && 'ml-[3px]',
            )}
          />
        )
      })}
    </span>
  )
}
