import type { Root } from 'mdast'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { describe, expect, it } from 'vitest'
import { remarkProseIcons } from './remark-prose-icons'

/**
 * Driven through the real parser rather than a hand-built tree: the claim the
 * plugin makes is about *markdown* — that a colon pair inside a code span is
 * untouched — and only the parser decides what became an `inlineCode` node.
 */
const pipeline = unified().use(remarkParse).use(remarkGfm).use(remarkProseIcons)
const parse = (markdown: string): Root => pipeline.runSync(pipeline.parse(markdown)) as Root

/** Flatten to the sequence a reader would see: icon names and literal text. */
function flatten(tree: Root): string[] {
  const out: string[] = []
  visit(tree, (node) => {
    const data = (node as { data?: { hName?: string; hProperties?: { name?: string } } }).data
    if (data?.hName === 'proseicon') out.push(`icon:${data.hProperties?.name}`)
    else if (node.type === 'text') out.push(`text:${(node as { value: string }).value}`)
    else if (node.type === 'inlineCode') out.push(`code:${(node as { value: string }).value}`)
    else if (node.type === 'code') out.push(`fence:${(node as { value: string }).value}`)
  })
  return out
}

describe('remarkProseIcons', () => {
  it('replaces a known name with an icon node', () => {
    expect(flatten(parse('a :check: b'))).toEqual(['text:a ', 'icon:check', 'text: b'])
  })

  it('handles an icon at the very start and one at the very end', () => {
    expect(flatten(parse(':check: middle :x:'))).toEqual(['icon:check', 'text: middle ', 'icon:x'])
  })

  /** The cursor arithmetic: a second icon must not re-emit the text before the first. */
  it('replaces every icon in one text node, in order, with no text lost', () => {
    expect(flatten(parse('a :check: b :x: c'))).toEqual([
      'text:a ', 'icon:check', 'text: b ', 'icon:x', 'text: c',
    ])
  })

  it('handles two icons written back to back', () => {
    expect(flatten(parse(':check::x:'))).toEqual(['icon:check', 'icon:x'])
  })

  it('leaves an unknown name as the literal text the author typed', () => {
    expect(flatten(parse('a :rocket: b'))).toEqual(['text:a :rocket: b'])
  })

  it('keeps the unknown name and still replaces the known one beside it', () => {
    expect(flatten(parse(':rocket: and :check:'))).toEqual(['text::rocket: and ', 'icon:check'])
  })

  /** The documented reason authors can write the syntax while documenting it. */
  it('does not touch a colon pair inside a code span', () => {
    expect(flatten(parse('write `:check:` to get one'))).toEqual([
      'text:write ', 'code::check:', 'text: to get one',
    ])
  })

  it('does not touch a colon pair inside a fenced block', () => {
    expect(flatten(parse('```\n:check:\n```'))).toEqual(['fence::check:'])
  })

  it('leaves a clock time alone', () => {
    expect(flatten(parse('the 10:30 train'))).toEqual(['text:the 10:30 train'])
  })

  it('reaches an icon nested inside emphasis', () => {
    expect(flatten(parse('**bold :check: here**'))).toEqual([
      'text:bold ', 'icon:check', 'text: here',
    ])
  })

  it('reaches an icon inside a table cell', () => {
    const tree = parse('| a |\n|---|\n| :check: |\n')
    const kinds: string[] = []
    visit(tree, (n) => kinds.push(n.type))
    expect(kinds).toContain('tableCell')
    expect(flatten(tree)).toContain('icon:check')
  })

  it('is idempotent — a second pass finds nothing left to replace', () => {
    const once = parse('a :check: b')
    const twice = remarkProseIcons()(once) ?? once
    expect(flatten(twice as Root)).toEqual(['text:a ', 'icon:check', 'text: b'])
  })
})
