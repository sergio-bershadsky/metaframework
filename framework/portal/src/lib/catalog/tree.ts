import type { EntityKind } from './frontmatter'
import type { Catalog } from './types'

/**
 * A serialisable projection of the catalog for the client-side tree. Entities
 * carry far more than the sidebar needs; sending the whole graph across the
 * RSC boundary would balloon the payload for every page.
 */
export interface TreeNode {
  srn: string
  name: string
  title: string
  kind: EntityKind
  status: string
  version: number
  children: TreeNode[]
  /** True when the entity itself has diagnostics of severity `error`. */
  hasError: boolean
}

export function buildTree(catalog: Catalog): TreeNode[] {
  const errored = new Set(
    catalog.diagnostics.filter((d) => d.severity === 'error' && d.srn).map((d) => d.srn as string),
  )

  const kindOrder: EntityKind[] = [
    'product',
    'component',
    'protocol',
    'datamodel',
    'actor',
    'environment',
    'requirement',
    'adr',
  ]

  function node(srn: string): TreeNode | null {
    const entity = catalog.entities.get(srn)
    if (!entity) return null
    return {
      srn: entity.srn,
      name: entity.frontmatter.name,
      title: entity.frontmatter.title,
      kind: entity.kind,
      status: entity.frontmatter.status,
      version: entity.frontmatter.version,
      hasError: errored.has(entity.srn),
      children: entity.children
        .map(node)
        .filter((child): child is TreeNode => Boolean(child))
        .sort((a, b) => {
          const byKind = kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind)
          return byKind !== 0 ? byKind : a.name.localeCompare(b.name)
        }),
    }
  }

  return catalog.solutions.map(node).filter((n): n is TreeNode => Boolean(n))
}

/** SRNs from the root down to `srn`, so the tree can auto-expand to it. */
export function pathToSrn(srn: string): string[] {
  const body = srn.replace('srn://', '')
  const segments = body.split('/')
  const chain: string[] = []
  for (let i = 1; i <= segments.length; i++) {
    chain.push(`srn://${segments.slice(0, i).join('/')}`)
  }
  return chain
}
