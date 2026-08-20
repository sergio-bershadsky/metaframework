import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounce, isIgnoredPath } from './watch'

/**
 * Three walks have to agree on what the catalog contains — the loader's, the
 * fingerprint's and the watcher's. These cases pin the watcher's half of that
 * agreement, because a disagreement shows up as a page that reloads for a swap
 * file or one that misses a real edit.
 */
describe('isIgnoredPath', () => {
  it('keeps ordinary catalog paths', () => {
    expect(isIgnoredPath('acme/index.md')).toBe(false)
    expect(isIgnoredPath('acme/product/shop/component/checkout/datamodel/cart/schema.json')).toBe(false)
  })

  it('ignores dot and underscore entries, wherever they sit in the path', () => {
    expect(isIgnoredPath('.DS_Store')).toBe(true)
    expect(isIgnoredPath('acme/.index.md.swp')).toBe(true)
    expect(isIgnoredPath('_drafts/checkout/index.md')).toBe(true)
    expect(isIgnoredPath('acme/_scratch/notes.md')).toBe(true)
  })

  it('reads Windows separators too — fs.watch reports the platform’s own', () => {
    expect(isIgnoredPath('acme\\_drafts\\index.md')).toBe(true)
    expect(isIgnoredPath('acme\\product\\shop\\index.md')).toBe(false)
  })

  it('does not mistake a dot inside a name for a dotfile', () => {
    expect(isIgnoredPath('acme/order.v2/index.md')).toBe(false)
    expect(isIgnoredPath('acme/order_v2/index.md')).toBe(false)
  })
})

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('collapses a burst into one call, after the burst', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 150)

    // A "save all" across four files: four events, one reload.
    for (let i = 0; i < 4; i += 1) {
      debounced.trigger()
      vi.advanceTimersByTime(40)
    }
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(150)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('fires again for a change that arrives after the window closed', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 150)

    debounced.trigger()
    vi.advanceTimersByTime(150)
    debounced.trigger()
    vi.advanceTimersByTime(150)

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cancels a pending call — a closed connection must not be notified', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 150)

    debounced.trigger()
    debounced.cancel()
    vi.advanceTimersByTime(1_000)

    expect(fn).not.toHaveBeenCalled()
  })
})
