import { describe, expect, it } from 'vitest'
import { bodyLines, headings } from './body'

/**
 * The scanner both enforced body templates read through. Its only job is to not
 * be fooled by an example, which is exactly what the catalog is full of.
 */

const text = (body: string) => headings(body).map((heading) => `${heading.level}:${heading.text}`)

describe('headings', () => {
  it('reads ATX headings with their level and text', () => {
    expect(text('## Context\n\nSome prose.\n\n### Detail\n\n## Decision\n')).toEqual([
      '2:Context',
      '3:Detail',
      '2:Decision',
    ])
  })

  it('records the line each heading sits on, 0-based', () => {
    expect(headings('intro\n\n## Context\n').map((heading) => heading.line)).toEqual([2])
  })

  it('ignores headings inside a fenced block', () => {
    // The kind documents and half the ADRs in the catalog quote the template as
    // an example; an example heading is not a heading.
    const body = ['## Context', '', '```markdown', '## Decision', '## Consequences', '```', '', '## Decision'].join('\n')
    expect(text(body)).toEqual(['2:Context', '2:Decision'])
  })

  it('does not let a ``` inside a ~~~ block close the outer fence', () => {
    // A plain toggle reads the inner fence as the end of the outer one and turns
    // the rest of the document into code — every check downstream stops firing.
    const body = ['~~~markdown', '```', '## Decision', '```', '~~~', '', '## Context'].join('\n')
    expect(text(body)).toEqual(['2:Context'])
  })

  it('treats a fence nested in a list item as code', () => {
    const body = ['- item', '', '  ```yaml', '  ## not a heading', '  ```', '', '## Context'].join('\n')
    expect(text(body)).toEqual(['2:Context'])
  })

  it('runs an unclosed fence to the end of the body', () => {
    expect(text('```\n## Context\n')).toEqual([])
  })

  it('strips a closing ATX sequence', () => {
    expect(text('## Context ##\n')).toEqual(['2:Context'])
  })

  it('refuses a hash with no space and a hash indented four spaces', () => {
    // `#Context` is a paragraph; four spaces makes an indented code block.
    expect(text('#Context\n')).toEqual([])
    expect(text('    ## Context\n')).toEqual([])
  })

  it('does not read a setext underline as a heading', () => {
    // `---` under a paragraph is a thematic break to most authors, and reading
    // it as an h2 would invent section boundaries in bodies that have none.
    expect(text('Context\n---\n\n## Decision\n')).toEqual(['2:Decision'])
  })
})

describe('bodyLines', () => {
  it('marks the fence lines themselves as code', () => {
    expect(bodyLines('a\n```\nb\n```\nc').map((line) => line.fenced)).toEqual([false, true, true, true, false])
  })
})
