'use client'

import { AlertTriangle, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'
import { entityHref } from '@/lib/catalog/href'
import type { TreeNode } from '@/lib/catalog/tree'
import { kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

/**
 * The catalog tree. Kind hue is carried by the node's icon only — colouring the
 * label too would turn a dense sidebar into confetti and destroy scannability,
 * while the icon alone still makes kind identifiable at a glance.
 */
export function CatalogTree({ roots }: { roots: TreeNode[] }) {
  const pathname = usePathname()
  const activeSrn = useMemo(() => {
    if (!pathname.startsWith('/catalog/')) return null
    return `srn://${decodeURIComponent(pathname.slice('/catalog/'.length))}`
  }, [pathname])

  return (
    <nav aria-label="Catalog" className="py-2 text-[13px]">
      {roots.map((root) => (
        <TreeItem key={root.srn} node={root} depth={0} activeSrn={activeSrn} />
      ))}
      {roots.length === 0 && (
        <p className="px-4 py-6 text-xs leading-relaxed text-muted-foreground">
          No solutions found. Add one under <code className="font-mono">solutions/</code>.
        </p>
      )}
    </nav>
  )
}

function TreeItem({
  node,
  depth,
  activeSrn,
}: {
  node: TreeNode
  depth: number
  activeSrn: string | null
}) {
  const onActivePath = activeSrn === node.srn || (activeSrn?.startsWith(`${node.srn}/`) ?? false)
  const [open, setOpen] = useState(depth < 2 || onActivePath)
  const isActive = activeSrn === node.srn
  const style = kindStyle(node.kind)
  const Icon = style.icon
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div
        className={cn(
          'group relative flex items-center gap-1 pr-2',
          isActive && 'bg-primary/10',
          !isActive && 'hover:bg-surface-raised/70',
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isActive && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />}

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
          aria-expanded={hasChildren ? open : undefined}
          className={cn(
            'focusable grid size-4 shrink-0 place-items-center rounded text-muted-foreground',
            !hasChildren && 'invisible',
          )}
        >
          <ChevronRight className={cn('size-3 transition-transform duration-150', open && 'rotate-90')} />
        </button>

        <Link
          href={entityHref(node.srn)}
          className="focusable flex min-w-0 flex-1 items-center gap-2 py-1.5 rounded"
          title={node.title}
        >
          <Icon className={cn('size-3.5 shrink-0', style.text)} aria-hidden />
          <span
            className={cn(
              'truncate font-mono text-[12.5px] tracking-tight',
              isActive ? 'text-foreground' : 'text-foreground/75 group-hover:text-foreground',
              node.status === 'deprecated' && 'line-through opacity-60',
            )}
          >
            {node.name}
          </span>
          {node.hasError && (
            <AlertTriangle className="size-3 shrink-0 text-destructive" aria-label="Has errors" />
          )}
        </Link>
      </div>

      {open && hasChildren && (
        <div className="relative">
          {/* Guide rail: makes deep nesting readable without heavy indentation. */}
          <span
            className="absolute inset-y-0 w-px bg-border"
            style={{ left: `${depth * 12 + 15}px` }}
            aria-hidden
          />
          {node.children.map((child) => (
            <TreeItem key={child.srn} node={child} depth={depth + 1} activeSrn={activeSrn} />
          ))}
        </div>
      )}
    </div>
  )
}
