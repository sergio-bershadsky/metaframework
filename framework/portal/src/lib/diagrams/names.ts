import type { EdgeType } from '@/lib/catalog/frontmatter'

/**
 * How a drawing says, in words, what it drew.
 *
 * Every graph in this console states its content twice: once as a picture, and
 * once as text for a reader who is not looking at the picture — a `figcaption`,
 * and an `ariaLabel` on each edge and node React Flow renders. Those two copies
 * were built from different material. The caption was built from the catalog's
 * own display names (`ledger (component) depends on payment (component).`); the
 * edge label was built from whatever the graph model happened to hold, which is
 * the SRN and the frontmatter key — `srn://acme/product/billing depends-on
 * srn://acme/product/shop/component/checkout/component/payment`.
 *
 * Both are true. Only one of them is what the picture states: the boxes are
 * drawn with short names, and no reader of the drawing sees an SRN or a
 * hyphenated relation token. So a reader given the labels was being told about a
 * different, more verbose diagram than the one on screen, in a vocabulary the
 * legend does not use.
 *
 * These are the words. They are here, in a module with no React in it, because
 * that is what lets a test hold them: an accessible name is a string built by a
 * pure function, and it can be pinned exactly like a parser can. Both graphs
 * import them, so the caption and the canvas cannot drift apart again.
 */

/**
 * The word a relation is read aloud with.
 *
 * The frontmatter key is not it: `depends-on` is a token in a file, and every
 * surface that shows the relation to a person — the neighbourhood legend, the
 * map's caption — already writes "depends on". `contains` is here too, though it
 * is no `EdgeType`: the map draws containment as its spine, and a spine edge
 * needs a word like any other.
 */
export const RELATION_VERB = {
  contains: 'contains',
  uses: 'uses',
  exposes: 'exposes',
  'depends-on': 'depends on',
  implements: 'implements',
  realizes: 'realizes',
  measures: 'measures',
  assumes: 'assumes',
  supersedes: 'supersedes',
} satisfies Record<EdgeType | 'contains', string>

/**
 * One box, as the neighbourhood caption names it: `ledger (component)`.
 *
 * The kind is in the phrase because in the drawing it is carried by hue and
 * glyph, and neither of those survives being read out.
 */
export function entityPhrase(name: string, kind: string): string {
  return `${name} (${kind})`
}

/** One edge as a sentence: `ledger (component) uses production (environment).` */
export function relationSentence(source: string, verb: string, target: string): string {
  return `${source} ${verb} ${target}.`
}

/**
 * A graph node's button, as it is announced: `ledger, component — Double-entry
 * books`.
 *
 * The visible box is name-over-title with the kind in the colour and the icon,
 * so a button named by its own text content says "ledgerDouble-entry books" and
 * drops the kind entirely. Commas rather than the visible line break, because
 * this is one utterance.
 */
export function nodeButtonLabel(name: string, kindLabel: string, title: string): string {
  return `${name}, ${kindLabel.toLowerCase()} — ${title}`
}
