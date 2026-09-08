import { describe, expect, it } from 'vitest'
import { KIND_FRONTMATTER } from './frontmatter'
import { COMPONENT_LIFECYCLE, PRODUCT_LIFECYCLE } from './vocabulary'

/**
 * The two lifecycle enums are the values the console has to explain, so they
 * have to be readable without dragging zod into the browser — the same reason
 * `COMPONENT_TYPES` lives in ./vocabulary. These assertions exist so the array
 * and the schema built over it can never drift apart.
 */
describe('lifecycle vocabularies', () => {
  it('a product runs concept → retired, in that order', () => {
    expect(PRODUCT_LIFECYCLE).toEqual([
      'concept', 'incubating', 'active', 'maintenance', 'sunset', 'retired',
    ])
  })

  it('a component runs planned → retired, and never says "active"', () => {
    expect(COMPONENT_LIFECYCLE).toEqual([
      'planned', 'in-development', 'released', 'sunset', 'retired',
    ])
    expect(COMPONENT_LIFECYCLE).not.toContain('active')
  })

  it('the schemas accept exactly what the arrays list, and nothing else', () => {
    for (const value of PRODUCT_LIFECYCLE) {
      expect(KIND_FRONTMATTER.product.safeParse({ lifecycle: value }).success, value).toBe(true)
    }
    for (const value of COMPONENT_LIFECYCLE) {
      const parsed = KIND_FRONTMATTER.component.safeParse({ 'component-type': 'service', lifecycle: value })
      expect(parsed.success, value).toBe(true)
    }
  })

  /** The two overlap only at the end, which is why they are two enums. */
  it('refuses a product value on a component and the reverse', () => {
    expect(KIND_FRONTMATTER.product.safeParse({ lifecycle: 'released' }).success).toBe(false)
    expect(
      KIND_FRONTMATTER.component.safeParse({ 'component-type': 'service', lifecycle: 'active' }).success,
    ).toBe(false)
  })
})
