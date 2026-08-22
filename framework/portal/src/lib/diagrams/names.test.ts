import { describe, expect, it } from 'vitest'
import { EDGE_TYPES } from '@/lib/catalog/frontmatter'
import { RELATION_VERB, entityPhrase, nodeButtonLabel, relationSentence } from './names'

/**
 * These are accessible names — strings nobody ever sees, which is exactly why
 * they need pinning. A caption that drifts from its drawing is invisible to
 * every gate this repository has: it type-checks, it renders, it looks right,
 * and it is wrong only for the reader who cannot check.
 *
 * There is no rendered-component test in this repository and this run did not
 * add one. What CAN be held without a DOM is the vocabulary itself, so that is
 * what is held here: the words, and the rule that every relation has one.
 */

describe('RELATION_VERB — how a relation is said out loud', () => {
  it('covers every edge type the frontmatter contract allows', () => {
    for (const edge of EDGE_TYPES) {
      expect(RELATION_VERB[edge], `no spoken form for ${edge}`).toBeTruthy()
    }
  })

  it('speaks the hyphenated key as words', () => {
    // The whole point: `depends-on` is a token in a file. The legend, the
    // caption and now the edge label all say "depends on".
    expect(RELATION_VERB['depends-on']).toBe('depends on')
    for (const verb of Object.values(RELATION_VERB)) {
      expect(verb).not.toContain('-')
    }
  })

  it('names containment, which is the map spine and no edge type at all', () => {
    expect(RELATION_VERB.contains).toBe('contains')
  })
})

describe('the sentences a drawing is read as', () => {
  it('names a box the way the caption does — with its kind, which is drawn as colour', () => {
    expect(entityPhrase('ledger', 'component')).toBe('ledger (component)')
  })

  it('builds one edge as a full sentence', () => {
    expect(relationSentence(entityPhrase('ledger', 'component'), RELATION_VERB.uses, entityPhrase('settlement', 'protocol'))).toBe(
      'ledger (component) uses settlement (protocol).',
    )
  })

  /**
   * The measured defect, as a sentence built the way it now is. React Flow
   * exposes every edge as a `role="img"` carrying its `ariaLabel`, so that
   * string is a second, complete reading of the picture — and it was reading
   * out a different, more verbose diagram than the one drawn:
   *
   *   was:  srn://acme/product/billing depends-on srn://acme/…/component/payment
   *   is:   billing (product) depends on payment (component).
   *
   * Both endpoints are display names, and the verb is the legend's word, so a
   * reader of the label and a reader of the picture are told the same thing.
   */
  it('reads an edge in the drawing’s own words, never the model’s', () => {
    const sentence = relationSentence(
      entityPhrase('billing', 'product'),
      RELATION_VERB['depends-on'],
      entityPhrase('payment', 'component'),
    )
    expect(sentence).toBe('billing (product) depends on payment (component).')
    expect(sentence).not.toContain('srn://')
    expect(sentence).not.toContain('depends-on')
  })
})

describe('nodeButtonLabel — a box that is also a button', () => {
  it('says the kind, which the box itself carries only as a glyph and a hue', () => {
    expect(nodeButtonLabel('ledger', 'Component', 'Double-entry books')).toBe('ledger, component — Double-entry books')
  })

  it('never runs the name into the title, which is what text content alone did', () => {
    // The measured defect was an accessible name of "settlementSettlement":
    // two spans, no separator, and the kind missing altogether.
    const label = nodeButtonLabel('settlement', 'Protocol', 'Settlement')
    expect(label).not.toContain('settlementSettlement')
    expect(label).toBe('settlement, protocol — Settlement')
  })
})
