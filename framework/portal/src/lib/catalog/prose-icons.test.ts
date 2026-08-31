import { describe, expect, it } from 'vitest'
import { PROSE_ICON_PATTERN, PROSE_ICONS, isProseIcon } from './prose-icons'

/**
 * The safelist and the pattern are the two halves of "existing documents cannot
 * change meaning by having this feature added underneath them". The pattern
 * decides what is even a candidate; the safelist decides what resolves.
 */
describe('isProseIcon', () => {
  it('accepts every name in the vocabulary', () => {
    for (const name of Object.keys(PROSE_ICONS)) expect(isProseIcon(name)).toBe(true)
  })

  it('rejects a name that is not in it', () => {
    expect(isProseIcon('rocket')).toBe(false)
  })

  /**
   * `PROSE_ICONS` is a plain object literal, so it carries Object.prototype.
   * `Object.hasOwn` is what keeps `:constructor:` from resolving to a function
   * and reaching the renderer as a component.
   */
  it('does not resolve an inherited property', () => {
    for (const key of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(isProseIcon(key)).toBe(false)
    }
  })
})

describe('PROSE_ICON_PATTERN', () => {
  const matches = (text: string) => [...text.matchAll(new RegExp(PROSE_ICON_PATTERN))].map((m) => m[1])

  it('matches a lowercase name and a hyphenated one', () => {
    expect(matches('a :check: and :lock-open: here')).toEqual(['check', 'lock-open'])
  })

  it('finds two icons written back to back', () => {
    expect(matches(':check::x:')).toEqual(['check', 'x'])
  })

  /** The colon pairs that already exist in prose and must keep their meaning. */
  it('leaves a clock time alone, because a name may not start with a digit', () => {
    expect(matches('the 10:30 train')).toEqual([])
    expect(matches('10:30:45')).toEqual([])
  })

  it('does not match uppercase, underscores or a doubled hyphen', () => {
    expect(matches(':Check:')).toEqual([])
    expect(matches(':lock_open:')).toEqual([])
    expect(matches(':lock--open:')).toEqual([])
  })

  it('does not match an empty pair or a lone colon', () => {
    expect(matches('::')).toEqual([])
    expect(matches('a : b')).toEqual([])
  })

  /**
   * The pattern is a module-level `/g` regex, so `lastIndex` is shared mutable
   * state between every caller. This pins that a stale `lastIndex` cannot make a
   * later reader miss a match.
   */
  it('is not left mid-string by a previous consumer', () => {
    PROSE_ICON_PATTERN.lastIndex = 5
    expect(matches(':check: x')).toEqual(['check'])
    PROSE_ICON_PATTERN.lastIndex = 0
  })
})
