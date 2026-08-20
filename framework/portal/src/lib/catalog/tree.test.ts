import { describe, expect, it } from 'vitest'
import { ENTITY_KINDS, type EntityKind, type Status } from './frontmatter'
import {
  applyLens,
  countMatches,
  filterSignature,
  filterTree,
  isTreeLens,
  KIND_ORDER,
  type LensGroupNode,
  lensNodeId,
  type LensNode,
  matchesFilters,
  NO_FILTERS,
  type TreeFilters,
  type TreeNode,
} from './tree'

/**
 * The lens machinery is pure by construction so it can be tested without a DOM:
 * everything the rail decides — what matches, where a lens inserts a bucket, how
 * buckets are ordered — lives here, and the component only paints the result.
 */

function n(
  name: string,
  kind: EntityKind,
  extra: Partial<TreeNode> = {},
  children: TreeNode[] = [],
): TreeNode {
  return {
    srn: `srn://${name}`,
    name,
    title: name,
    kind,
    status: 'approved',
    version: 1,
    owner: null,
    hasError: false,
    children,
    ...extra,
  }
}

/** Two solutions, and a name that collides across two products on purpose. */
const roots: TreeNode[] = [
  n('acme', 'solution', { owner: 'team-platform' }, [
    n('shop', 'product', { owner: 'team-shop' }, [
      n('checkout', 'component', { owner: 'team-checkout', status: 'review' }, [
        n('settings', 'datamodel', { owner: 'team-checkout', status: 'draft' }),
      ]),
      n('order-placement', 'protocol', { owner: 'team-shop', status: 'deprecated' }),
    ]),
    n('billing', 'product', { owner: 'team-billing' }, [
      n('settings', 'datamodel', { owner: 'team-billing' }),
    ]),
  ]),
  n('brass', 'solution', {}, [n('foundry', 'product', { status: 'draft' })]),
]

/** One container whose children span kinds, statuses and owners out of order. */
const mixed = n('mixed', 'component', {}, [
  n('adr-1', 'adr', { status: 'deprecated', owner: 'team-b' }),
  n('req-1', 'requirement'),
  n('env-1', 'environment', { status: 'review', owner: 'team-a' }),
  n('dm-1', 'datamodel', { status: 'draft' }),
  n('proto-1', 'protocol', { owner: 'team-c' }),
])

const filters = (partial: Partial<TreeFilters>): TreeFilters => ({ ...NO_FILTERS, ...partial })

/**
 * The rendered shape as indented text: `[bucket]` for a virtual group, the
 * entity name otherwise. Asserting on the whole outline is the point — the
 * defect being fixed was structural, and a shape is what makes "this datamodel
 * is still six levels down" readable in a test.
 */
function outline(items: LensNode[], indent = ''): string[] {
  return items.flatMap((item) => [
    `${indent}${item.type === 'group' ? `[${item.key || 'unowned'}]` : item.node.name}`,
    ...outline(item.children, `${indent}  `),
  ])
}

/** Bucket keys of ONE level, in the order the lens put them in. */
function keysOf(items: LensNode[]): string[] {
  return items.flatMap((item) => (item.type === 'group' ? [item.key] : []))
}

/** Every bucket, depth-first, for assertions about the buckets themselves. */
function groupsOf(items: LensNode[]): LensGroupNode[] {
  return items.flatMap((item) => [...(item.type === 'group' ? [item] : []), ...groupsOf(item.children)])
}

describe('KIND_ORDER', () => {
  it('covers the whole ontology, so no kind can fall out of a lens', () => {
    expect([...KIND_ORDER].sort()).toEqual([...ENTITY_KINDS].sort())
  })
})

describe('matchesFilters', () => {
  const node = n('checkout', 'component', { title: 'Checkout flow', status: 'review' })

  it('matches on title as well as name', () => {
    expect(matchesFilters(node, filters({ query: 'flow' }))).toBe(true)
    expect(matchesFilters(node, filters({ query: 'ledger' }))).toBe(false)
  })

  it('composes kind, status and text as a conjunction', () => {
    expect(matchesFilters(node, filters({ kinds: ['component'], statuses: ['review'] }))).toBe(true)
    expect(matchesFilters(node, filters({ kinds: ['component'], statuses: ['approved'] }))).toBe(false)
    expect(matchesFilters(node, filters({ kinds: ['datamodel'], statuses: ['review'] }))).toBe(false)
    expect(matchesFilters(node, filters({ kinds: ['component'], query: 'ledger' }))).toBe(false)
  })

  it('treats an empty filter set as "everything matches"', () => {
    expect(matchesFilters(node, NO_FILTERS)).toBe(true)
  })
})

describe('filterTree', () => {
  it('keeps non-matching ancestors so a hit is never shown without its context', () => {
    const kept = filterTree(roots, filters({ query: 'order-placement' }))
    expect(kept.map((node) => node.name)).toEqual(['acme'])
    expect(kept[0].children.map((node) => node.name)).toEqual(['shop'])
    expect(kept[0].children[0].children.map((node) => node.name)).toEqual(['order-placement'])
  })

  it('filters by status, and the retained ancestors are not matches', () => {
    const active = filters({ statuses: ['draft'] })
    const kept = filterTree(roots, active)
    expect(kept.map((node) => node.name)).toEqual(['acme', 'brass'])
    // acme is context; the draft datamodel under checkout is the actual hit.
    expect(matchesFilters(kept[0], active)).toBe(false)
    expect(matchesFilters(kept[0].children[0].children[0].children[0], active)).toBe(true)
  })

  it('returns the input untouched when nothing is filtering', () => {
    expect(filterTree(roots, NO_FILTERS)).toBe(roots)
  })
})

describe('countMatches', () => {
  it('counts real matches, not the ancestors kept for context', () => {
    const active = filters({ statuses: ['draft'] })
    expect(countMatches(filterTree(roots, active), active)).toBe(2)
  })

  it('counts every node when nothing is filtering', () => {
    expect(countMatches(roots, NO_FILTERS)).toBe(9)
  })
})

describe('applyLens', () => {
  it('is the identity transform under hierarchy, node for node', () => {
    const view = applyLens(roots, 'hierarchy')

    expect(groupsOf(view)).toEqual([])
    expect(outline(view)).toEqual([
      'acme',
      '  shop',
      '    checkout',
      '      settings',
      '    order-placement',
      '  billing',
      '    settings',
      'brass',
      '  foundry',
    ])
    // The same TreeNode objects, not copies: the rail keys rows on their srn and
    // re-reads status and owner straight off them.
    const [first] = view
    expect(first.type === 'entity' && first.node).toBe(roots[0])
  })

  it('groups WITHIN each branch: a deep entity keeps every ancestor above it', () => {
    // The defect this replaces flattened the catalog — `settings` came out a
    // sibling of `acme`. Containment is what an SRN encodes, so it survives the
    // lens and the buckets are inserted between the levels, never instead.
    expect(outline(applyLens(roots, 'kind'))).toEqual([
      '[solution]',
      '  acme',
      '    [product]',
      '      shop',
      '        [component]',
      '          checkout',
      '            [datamodel]',
      '              settings',
      '        [protocol]',
      '          order-placement',
      '      billing',
      '        [datamodel]',
      '          settings',
      '  brass',
      '    [product]',
      '      foundry',
    ])
  })

  it('counts a bucket by its DIRECT members, never by its subtree', () => {
    const groups = groupsOf(applyLens(roots, 'kind'))

    expect(groups.map((group) => [group.key, group.count])).toEqual([
      ['solution', 2],
      ['product', 2],
      ['component', 1],
      ['datamodel', 1],
      ['protocol', 1],
      ['datamodel', 1],
      ['product', 1],
    ])
    // The solution bucket holds nine entities in total and still counts 2:
    // expanding it reveals exactly two rows.
    expect(groups.every((group) => group.count === group.children.length)).toBe(true)
  })

  it('orders kind buckets by the ontology, not by what it met first', () => {
    // `adr` leads the leaf kinds: a decision is authored against the container
    // itself, so KIND_ORDER ranks it with structure rather than behind every
    // artifact the container happens to hold.
    expect(keysOf(applyLens(mixed.children, 'kind'))).toEqual([
      'adr',
      'protocol',
      'datamodel',
      'environment',
      'requirement',
    ])
  })

  it('orders status buckets by lifecycle and counts each one', () => {
    const level = applyLens(mixed.children, 'status')
    expect(groupsOf(level).map((group) => [group.key, group.count])).toEqual([
      ['draft', 1],
      ['review', 1],
      ['approved', 2],
      ['deprecated', 1],
    ])
  })

  it('sorts owner buckets alphabetically and puts the unowned bucket last', () => {
    expect(keysOf(applyLens(mixed.children, 'owner'))).toEqual(['team-a', 'team-b', 'team-c', ''])
  })

  it('keeps a bucket whose members all landed in it — the lens is a stated intent', () => {
    const bag = n('bag', 'component', {}, [
      n('zeta', 'protocol'),
      n('alpha', 'datamodel'),
      n('beta', 'datamodel'),
    ])
    // Three approved children, one bucket, still drawn: skipping the level would
    // make the tree lie about how many groups exist.
    expect(outline(applyLens(bag.children, 'status'))).toEqual([
      '[approved]',
      '  zeta',
      '  alpha',
      '  beta',
    ])
  })

  it('leaves members in their sibling order rather than re-sorting inside a bucket', () => {
    const bag = n('bag', 'component', {}, [
      n('zeta', 'protocol', { owner: 'team-a' }),
      n('alpha', 'datamodel', { owner: 'team-a' }),
    ])
    // KIND_ORDER put the protocol first; a name sort would have flipped them.
    expect(outline(applyLens(bag.children, 'owner'))).toEqual(['[team-a]', '  zeta', '  alpha'])
  })

  it('never emits an empty bucket', () => {
    const view = applyLens(roots, 'status')
    // Four statuses exist; the root level only holds approved solutions.
    expect(keysOf(view)).toEqual(['approved'])
    expect(groupsOf(view).every((group) => group.count > 0)).toBe(true)
  })

  it('scopes to whatever roots it is handed, which is how solution focus works', () => {
    expect(outline(applyLens(roots[0].children, 'owner'))).toEqual([
      '[team-billing]',
      '  billing',
      '    [team-billing]',
      '      settings',
      '[team-shop]',
      '  shop',
      '    [team-checkout]',
      '      checkout',
      '        [team-checkout]',
      '          settings',
      '    [team-shop]',
      '      order-placement',
    ])
  })

  it('composes with a filter: context ancestors survive, and stay context', () => {
    const active = filters({ statuses: ['draft'] })
    const kept = filterTree(roots, active)

    expect(outline(applyLens(kept, 'kind'))).toEqual([
      '[solution]',
      '  acme',
      '    [product]',
      '      shop',
      '        [component]',
      '          checkout',
      '            [datamodel]',
      '              settings',
      '  brass',
      '    [product]',
      '      foundry',
    ])
    // Opacity means "context, not a match" and nothing else: the retained
    // ancestors fail the filter, and only the two drafts are hits.
    expect(matchesFilters(kept[0], active)).toBe(false)
    expect(countMatches(kept, active)).toBe(2)
  })
})

describe('filterSignature', () => {
  it('is stable for the same filter state, whatever order the sets were toggled in', () => {
    expect(filterSignature(filters({ kinds: ['component', 'datamodel'], statuses: ['draft', 'review'] })))
      .toBe(filterSignature(filters({ kinds: ['datamodel', 'component'], statuses: ['review', 'draft'] })))
    expect(filterSignature(NO_FILTERS)).toBe(filterSignature(filters({})))
  })

  it('changes when any dimension changes — that change is what drops the fold overrides', () => {
    const base = filterSignature(filters({ query: 'set' }))
    expect(filterSignature(filters({ query: 'sett' }))).not.toBe(base)
    expect(filterSignature(filters({ query: 'set', kinds: ['datamodel'] }))).not.toBe(base)
    expect(filterSignature(filters({ query: 'set', statuses: ['draft'] }))).not.toBe(base)
  })

  it('keeps the dimensions apart: a kind token cannot impersonate a status token', () => {
    expect(filterSignature(filters({ kinds: ['component'] })))
      .not.toBe(filterSignature(filters({ statuses: ['component' as Status] })))
  })
})

describe('lensNodeId', () => {
  const entity = (node: TreeNode): LensNode => ({ type: 'entity', node, children: [] })

  it('is the srn for a root entity, and path-qualified below one', () => {
    const parent = lensNodeId(null, entity(n('acme', 'solution')))
    expect(parent).toBe('srn://acme')
    expect(lensNodeId(parent, entity(n('shop', 'product')))).toBe('srn://acme>srn://shop')
  })

  it('tells identical buckets on different levels apart — collapsing one must not fold the rest', () => {
    // Under the Kind lens a `group:kind:datamodel` bucket recurs at every level
    // that holds a datamodel; only the path above it makes each one unique.
    const bucket: LensNode = { type: 'group', lens: 'kind', key: 'datamodel', count: 1, children: [] }
    const underShop = lensNodeId('srn://acme>srn://shop', bucket)
    const underBilling = lensNodeId('srn://acme>srn://billing', bucket)
    expect(underShop).not.toBe(underBilling)
    expect(underShop).toBe('srn://acme>srn://shop>group:kind:datamodel')
  })
})

describe('isTreeLens', () => {
  it('rejects anything a stale preference might carry', () => {
    expect(isTreeLens('hierarchy')).toBe(true)
    expect(isTreeLens('owner')).toBe(true)
    expect(isTreeLens('tags')).toBe(false)
    expect(isTreeLens(undefined)).toBe(false)
    expect(isTreeLens(3)).toBe(false)
  })
})

describe('status coverage', () => {
  it('exercises every status the tree must draw a treatment for', () => {
    const seen = new Set<Status>()
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        seen.add(node.status)
        walk(node.children)
      }
    }
    walk(roots)
    expect([...seen].sort()).toEqual(['approved', 'deprecated', 'draft', 'review'])
  })
})
