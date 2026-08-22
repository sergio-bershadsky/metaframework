import { describe, expect, it } from 'vitest'
import { COMPONENT_TYPES, COMPONENT_TYPE_STYLES } from './component-type'
import { KIND_STYLES } from './kind'
import type { EntityKind } from '../catalog/frontmatter'

/**
 * One glyph, one meaning — across both typing registers at once.
 *
 * The console asks a reader to learn two vocabularies: `kind`, twelve values
 * drawn by the sidebar, the badges, the entity links and both graphs; and
 * `component-type`, ten values drawn by the chip and the legend. They are
 * deliberately separated by hue — the component-type register sits a whole tier
 * darker and less chromatic, so a chip is never misread as a badge
 * ([0003-colour-is-ontology](srn://metaframework/product/portal/adr/0003-colour-is-ontology)).
 *
 * Hue was guarded. The glyph was not, and it is the stronger signal of the two:
 * shape survives at 12px, at a glance, and for a reader who cannot distinguish
 * the hues at all. Three icons were shared across the registers before this
 * file existed — `Server` between `environment` and `service`, `ScrollText`
 * between `adr` and `content`, `Package` between `product` and `application` —
 * which meant the console taught a silhouette on one page and reused it for
 * something else on the next.
 *
 * Reference identity is the right comparison and not a shortcut: two entries
 * that name the same import are the same React component object, so `===`
 * catches exactly the duplication a reader sees. Comparing rendered `displayName`
 * would additionally catch two *different* imports that happen to draw the same
 * artwork, which lucide does not do, at the cost of depending on a field the
 * library does not promise. `displayName` is used only to name the offender in
 * the failure message.
 *
 * Scope is the two registers a reader is asked to learn as vocabularies. Icons
 * used decoratively elsewhere in the console — a chevron, a section marker —
 * are not identities and are deliberately out.
 */

/** What to call an icon in a failure message; lucide sets `displayName`. */
function label(icon: unknown): string {
  const named = icon as { displayName?: string; name?: string }
  return named.displayName ?? named.name ?? String(icon)
}

const KINDS = Object.keys(KIND_STYLES) as EntityKind[]

/** Every glyph the two registers draw, tagged with the slot that draws it. */
const SLOTS: { slot: string; icon: unknown }[] = [
  ...KINDS.map((kind) => ({ slot: `kind:${kind}`, icon: KIND_STYLES[kind].icon })),
  ...COMPONENT_TYPES.map((type) => ({
    slot: `component-type:${type}`,
    icon: COMPONENT_TYPE_STYLES[type].icon,
  })),
]

/** Slots sharing one icon, as `Name: slot, slot` lines a reader can act on. */
function collisions(slots: typeof SLOTS): string[] {
  const byIcon = new Map<unknown, string[]>()
  for (const { slot, icon } of slots) {
    byIcon.set(icon, [...(byIcon.get(icon) ?? []), slot])
  }
  return [...byIcon.entries()]
    .filter(([, sharing]) => sharing.length > 1)
    .map(([icon, sharing]) => `${label(icon)}: ${sharing.join(', ')}`)
    .sort()
}

describe('icon identity', () => {
  it('gives every kind its own glyph', () => {
    expect(collisions(SLOTS.filter((entry) => entry.slot.startsWith('kind:')))).toEqual([])
  })

  it('gives every component-type its own glyph', () => {
    expect(collisions(SLOTS.filter((entry) => entry.slot.startsWith('component-type:')))).toEqual([])
  })

  it('never reuses one glyph across the two registers, whatever the hue', () => {
    // The point of the test. A duplicate here is invisible to the hue
    // separation the two registers rely on, because it is the same shape.
    expect(collisions(SLOTS)).toEqual([])
  })

  it('covers every slot both registers declare', () => {
    // Guards the guard: if a register grows and this file reads a stale list,
    // the checks above would pass while the new value went unexamined. Derived
    // from the same maps the console draws from, so it cannot fall behind.
    expect(SLOTS.length).toBe(KINDS.length + COMPONENT_TYPES.length)
    expect(new Set(SLOTS.map((entry) => entry.slot)).size).toBe(SLOTS.length)
  })
})
