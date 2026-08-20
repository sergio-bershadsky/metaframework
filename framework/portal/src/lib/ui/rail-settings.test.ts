import { describe, expect, it } from 'vitest'
import { solutionOfPath } from './rail-settings'

/**
 * The rail and the masthead's Map link both have to answer "which solution is
 * the reader in" from a URL alone, in the browser, with no catalog to consult.
 * A solution is the first SRN segment and nothing else — that is what makes the
 * answer a slice rather than a lookup, and what these cases pin down.
 */
describe('solutionOfPath', () => {
  it('reads the solution out of an entity route at any depth', () => {
    expect(solutionOfPath('/catalog/acme')).toBe('srn://acme')
    expect(solutionOfPath('/catalog/acme/product/shop')).toBe('srn://acme')
    expect(solutionOfPath('/catalog/metaframework/product/portal/adr/0005-stoplight')).toBe(
      'srn://metaframework',
    )
  })

  it('decodes the segment, because the route is percent-encoded', () => {
    expect(solutionOfPath('/catalog/two%20words/product/shop')).toBe('srn://two words')
  })

  it('has no answer off /catalog — including the map, which the caller handles', () => {
    expect(solutionOfPath('/')).toBeNull()
    expect(solutionOfPath('/diagnostics')).toBeNull()
    expect(solutionOfPath('/map/acme')).toBeNull()
    // Not a solution route: `/catalog` alone names no solution, and neither does
    // a trailing slash. Returning `srn://` for either would focus the rail on an
    // entity that cannot exist.
    expect(solutionOfPath('/catalog')).toBeNull()
    expect(solutionOfPath('/catalog/')).toBeNull()
  })
})
