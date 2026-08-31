import type { Parent, Root, Text } from 'mdast'
import { visit } from 'unist-util-visit'
import { isProseIcon, PROSE_ICON_PATTERN } from './prose-icons'

/**
 * Turn `:icon-name:` in prose into an element the renderer can map.
 *
 * Runs over text nodes only, so a colon pair inside a code span or a fenced
 * block is untouched — an author writing `:lock-open:` in an example is
 * documenting the syntax, not using it.
 *
 * Unknown names are left exactly as they were found. That is the important half
 * of the behaviour: a typo renders as the literal text the author typed, which
 * is visible in review, rather than silently disappearing or throwing.
 */
export function remarkProseIcons() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
      if (!parent || index === undefined) return
      if (!node.value.includes(':')) return

      const out: Array<Text | Parent> = []
      let cursor = 0
      PROSE_ICON_PATTERN.lastIndex = 0
      for (const match of node.value.matchAll(PROSE_ICON_PATTERN)) {
        const name = match[1]
        if (!isProseIcon(name)) continue
        const at = match.index
        if (at > cursor) out.push({ type: 'text', value: node.value.slice(cursor, at) })
        out.push({
          type: 'emphasis',
          children: [],
          data: { hName: 'proseicon', hProperties: { name } },
        } as unknown as Parent)
        cursor = at + match[0].length
      }
      if (!out.length) return
      if (cursor < node.value.length) out.push({ type: 'text', value: node.value.slice(cursor) })
      parent.children.splice(index, 1, ...(out as Parent['children']))
      return index + out.length
    })
  }
}
