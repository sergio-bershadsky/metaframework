import { describe, expect, it } from 'vitest'
import { fitCanvasHeight } from './layout'

/**
 * `fitCanvasHeight` is the part of diagram layout that can be asserted on
 * without a browser: it is arithmetic over a measured height, so the number it
 * produces is checkable here rather than by looking at a screenshot and hoping.
 * Placement itself belongs to ELK, which is not this module's to re-test.
 */

describe('fitCanvasHeight', () => {
  it('shrinks to the content plus canvas padding', () => {
    expect(fitCanvasHeight(300, 480)).toBe(364)
  })

  it('caps at the supplied ceiling so a tall graph pans instead of growing', () => {
    expect(fitCanvasHeight(2000, 480)).toBe(480)
  })

  it('falls back to a floor when nothing has been laid out', () => {
    expect(fitCanvasHeight(null, 480)).toBe(220)
  })
})
