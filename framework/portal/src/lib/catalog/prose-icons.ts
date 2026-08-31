/**
 * Inline icons in entity prose: `:icon-name:` becomes a Lucide glyph.
 *
 * Catalog markdown is rendered without `rehype-raw`, so an author cannot drop an
 * `<svg>` or an `<i data-lucide>` into a document — the pipeline escapes it and
 * the reader sees the tag as text. That is the right default: prose in this
 * catalog is reviewed content, and admitting arbitrary HTML would make every
 * document a place where markup can hide. This gives authors the one thing they
 * actually wanted from raw HTML — a glyph in a table cell — without opening the
 * rest of it.
 *
 * The name set is a **safelist**, not a passthrough to Lucide. Two reasons: a
 * dynamic lookup would pull the whole icon package into the client bundle, which
 * is the cost `navigable.tsx` already goes to some trouble to avoid; and a fixed
 * vocabulary keeps documents comparable, since an icon whose meaning varies by
 * author is decoration rather than notation.
 */

import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Check,
  CircleDot,
  Clock,
  Flag,
  Lock,
  LockOpen,
  Minus,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react'

/** The vocabulary. Adding a name here is the only way to use it in prose. */
export const PROSE_ICONS: Record<string, LucideIcon> = {
  'lock-open': LockOpen,
  lock: Lock,
  check: Check,
  x: X,
  ban: Ban,
  minus: Minus,
  flag: Flag,
  target: Target,
  clock: Clock,
  'circle-dot': CircleDot,
  'shield-check': ShieldCheck,
  'alert-triangle': AlertTriangle,
  'triangle-alert': TriangleAlert,
  'arrow-right': ArrowRight,
  sparkles: Sparkles,
}

/**
 * `:name:` where the name is a safelisted icon.
 *
 * Deliberately narrow: lowercase, digits and single hyphens, bounded length. A
 * colon pair around anything else — a time like `10:30`, a ratio, a Ruby symbol
 * in prose — does not match, so existing documents cannot change meaning by
 * having this feature added underneath them.
 */
export const PROSE_ICON_PATTERN = /:([a-z][a-z0-9]*(?:-[a-z0-9]+)*):/g

/** Whether a name resolves. The renderer is the only consumer; there is no loader lint. */
export function isProseIcon(name: string): boolean {
  return Object.hasOwn(PROSE_ICONS, name)
}
