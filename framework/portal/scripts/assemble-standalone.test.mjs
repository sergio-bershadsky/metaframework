import { describe, expect, it } from 'vitest'
import { missingFromBundle } from './assemble-standalone.mjs'
import { collect } from './build-schema-site.mjs'

/**
 * The bytes that have no file.
 *
 * Everything else this package ships can be checked by looking for it on disk;
 * the eight meta-schemas cannot, because they travel as string literals
 * compiled into the server. `missingFromBundle` is the assertion that they
 * arrived, and it is separated from the assembly it runs inside for exactly one
 * reason: a check whose failure has never been observed is not a check. Four of
 * those were found in this repository in two days.
 */

const urls = collect().map(({ url }) => url)

describe('missingFromBundle', () => {
  it('has URLs to look for', () => {
    // The floor. Over an empty list every assertion below is vacuously true.
    expect(urls.length).toBeGreaterThan(0)
  })

  it('finds nothing missing when every URL is somewhere in the chunks', () => {
    // Spread across two chunks, because that is how the build emits them: the
    // question is whether the bundle holds the URL, not whether one file does.
    const half = Math.ceil(urls.length / 2)
    const chunks = [urls.slice(0, half).join('|'), urls.slice(half).join('|')]
    expect(missingFromBundle(chunks, urls)).toEqual([])
  })

  it('names exactly the one that was dropped', () => {
    // One missing, not all of them: the loss this is really watching for is
    // partial — an optimiser that keeps the entry something reaches and proves
    // the rest unused — and a check that only noticed an empty bundle would
    // miss it while looking like it was working.
    const dropped = urls[urls.length - 1]
    const chunks = [urls.filter((url) => url !== dropped).join('|')]
    expect(missingFromBundle(chunks, urls)).toEqual([dropped])
  })

  it('reports every URL when there are no chunks at all', () => {
    expect(missingFromBundle([], urls)).toEqual(urls)
  })

  it('is not fooled by a prefix of the URL it is looking for', () => {
    // Extensionless paths nest: `…/datamodel/transport-document` and a
    // hypothetical `…/datamodel/transport` would pass a sloppier test. The
    // shorter string must not satisfy the longer one.
    const [first] = urls
    expect(missingFromBundle([first.slice(0, -1)], [first])).toEqual([first])
  })
})
