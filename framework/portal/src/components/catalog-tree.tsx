'use client'

import { AlertTriangle, Check, ChevronRight, Crosshair, ListFilter, Search, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ENTITY_KINDS, type EntityKind } from '@/lib/catalog/frontmatter'
import { entityHref } from '@/lib/catalog/href'
import type { TreeNode } from '@/lib/catalog/tree'
import { kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'metaframework.tree'

/**
 * The catalog tree.
 *
 * Kind hue is carried by the node's icon only — colouring labels too would turn
 * a dense sidebar into confetti and destroy scannability, while the icon alone
 * still makes kind identifiable at a glance.
 *
 * Filtering keeps the ancestors of every match so a hit is never shown without
 * its context, but dims them, so the eye lands on what actually matched.
 */
export function CatalogTree({ roots }: { roots: TreeNode[] }) {
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const [kinds, setKinds] = useState<EntityKind[]>([])
  const [focus, setFocus] = useState<string>('')

  // Focus and kind filters are navigation preferences, not page state: they
  // should survive a reload and a full navigation.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as { kinds?: EntityKind[]; focus?: string }
      if (parsed.kinds) setKinds(parsed.kinds)
      if (parsed.focus) setFocus(parsed.focus)
    } catch {
      /* a corrupt preference must never break navigation */
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ kinds, focus }))
  }, [kinds, focus])

  const activeSrn = useMemo(() => {
    if (!pathname.startsWith('/catalog/')) return null
    return `srn://${decodeURIComponent(pathname.slice('/catalog/'.length))}`
  }, [pathname])

  const solutions = roots.map((root) => ({ srn: root.srn, name: root.name }))

  // Focusing a solution promotes its children to roots: the solution itself is
  // the context you just chose, so repeating it on every row wastes the width.
  const focused = useMemo(() => {
    if (!focus) return roots
    const solution = roots.find((root) => root.srn === focus)
    return solution ? solution.children : roots
  }, [roots, focus])

  const filtered = useMemo(() => filterTree(focused, query.trim().toLowerCase(), kinds), [focused, query, kinds])

  const isFiltering = query.trim().length > 0 || kinds.length > 0
  const matchCount = useMemo(() => (isFiltering ? countMatches(filtered) : 0), [filtered, isFiltering])

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border p-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter catalog…"
            aria-label="Filter catalog by name"
            className="focusable h-8 w-full rounded-md border border-border bg-background pl-7 pr-7
                       font-mono text-[12.5px] text-foreground placeholder:text-muted-foreground/70
                       [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear filter"
              className="focusable absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <KindFilter kinds={kinds} onChange={setKinds} />
          <SolutionFocus solutions={solutions} focus={focus} onChange={setFocus} />
        </div>

        {isFiltering && (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground" role="status">
            {matchCount === 0 ? 'no matches' : `${matchCount} match${matchCount === 1 ? '' : 'es'}`}
          </p>
        )}
      </div>

      <nav aria-label="Catalog" className="min-h-0 flex-1 overflow-y-auto py-2 text-[13px]">
        {filtered.map((root) => (
          <TreeItem
            key={root.srn}
            node={root}
            depth={0}
            activeSrn={activeSrn}
            query={query.trim().toLowerCase()}
            expandAll={isFiltering}
          />
        ))}

        {filtered.length === 0 && (
          <p className="px-4 py-6 text-xs leading-relaxed text-muted-foreground">
            {isFiltering ? (
              <>
                Nothing matches. Try a different term
                {kinds.length > 0 && ', or clear the kind filter'}.
              </>
            ) : (
              <>
                No solutions found. Add one under <code className="font-mono">solutions/</code>.
              </>
            )}
          </p>
        )}
      </nav>
    </div>
  )
}

function KindFilter({ kinds, onChange }: { kinds: EntityKind[]; onChange: (kinds: EntityKind[]) => void }) {
  const toggle = (kind: EntityKind) =>
    onChange(kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'focusable inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] transition',
          kinds.length > 0
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <ListFilter className="size-3.5" aria-hidden />
        {kinds.length > 0 ? `${kinds.length} kind${kinds.length === 1 ? '' : 's'}` : 'Kind'}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">Show only</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ENTITY_KINDS.map((kind) => {
          const style = kindStyle(kind)
          const Icon = style.icon
          return (
            <DropdownMenuCheckboxItem
              key={kind}
              checked={kinds.includes(kind)}
              onCheckedChange={() => toggle(kind)}
              onSelect={(event) => event.preventDefault()}
              className="text-[12.5px]"
            >
              <Icon className={cn('mr-1.5 size-3.5', style.text)} aria-hidden />
              {style.label}
            </DropdownMenuCheckboxItem>
          )
        })}
        {kinds.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={() => onChange([])}
              className="focusable w-full rounded px-2 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Clear kind filter
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SolutionFocus({
  solutions,
  focus,
  onChange,
}: {
  solutions: Array<{ srn: string; name: string }>
  focus: string
  onChange: (focus: string) => void
}) {
  const current = solutions.find((solution) => solution.srn === focus)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'focusable inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-[11.5px] transition',
          current
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <Crosshair className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate font-mono">{current ? current.name : 'Focus'}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">Focus on solution</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={focus} onValueChange={onChange}>
          <DropdownMenuRadioItem value="" className="text-[12.5px]">
            All solutions
          </DropdownMenuRadioItem>
          {solutions.map((solution) => (
            <DropdownMenuRadioItem key={solution.srn} value={solution.srn} className="font-mono text-[12.5px]">
              {solution.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {current && (
          <p className="border-t border-border px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
            Showing the contents of{' '}
            <span className="font-mono text-foreground/80">{current.name}</span>; the solution row is hidden.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TreeItem({
  node,
  depth,
  activeSrn,
  query,
  expandAll,
}: {
  node: TreeNode
  depth: number
  activeSrn: string | null
  query: string
  expandAll: boolean
}) {
  const onActivePath = activeSrn === node.srn || (activeSrn?.startsWith(`${node.srn}/`) ?? false)
  const [open, setOpen] = useState(depth < 2 || onActivePath)
  const isActive = activeSrn === node.srn
  const style = kindStyle(node.kind)
  const Icon = style.icon
  const hasChildren = node.children.length > 0
  const expanded = expandAll || open
  // While filtering, an ancestor kept only for context is dimmed so the eye
  // lands on the rows that actually matched. A row matching on its title rather
  // than its name is still a match — dimming it would hide a real hit.
  const isContextOnly =
    query.length > 0 &&
    !node.name.toLowerCase().includes(query) &&
    !node.title.toLowerCase().includes(query)

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
          onClick={() => setOpen(!expanded)}
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          aria-expanded={hasChildren ? expanded : undefined}
          className={cn(
            'focusable grid size-4 shrink-0 place-items-center rounded text-muted-foreground',
            !hasChildren && 'invisible',
          )}
        >
          <ChevronRight className={cn('size-3 transition-transform duration-150', expanded && 'rotate-90')} />
        </button>

        <Link
          href={entityHref(node.srn)}
          className="focusable flex min-w-0 flex-1 items-center gap-2 rounded py-1.5"
          title={node.title}
        >
          {/* The icon is the only place kind is encoded in this dense list, so
              it names itself on hover rather than relying on colour memory. */}
          <span title={style.label} className="flex shrink-0 items-center">
            <Icon className={cn('size-3.5', style.text, isContextOnly && 'opacity-40')} aria-hidden />
            <span className="sr-only">{style.label}</span>
          </span>
          <span
            className={cn(
              'truncate font-mono text-[12.5px] tracking-tight',
              isActive ? 'text-foreground' : 'text-foreground/75 group-hover:text-foreground',
              isContextOnly && 'text-foreground/40',
              node.status === 'deprecated' && 'line-through opacity-60',
            )}
          >
            {highlight(node.name, query)}
          </span>
          {node.hasError && <AlertTriangle className="size-3 shrink-0 text-destructive" aria-label="Has errors" />}
        </Link>
      </div>

      {expanded && hasChildren && (
        <div className="relative">
          {/* Guide rail: makes deep nesting readable without heavy indentation. */}
          <span
            className="absolute inset-y-0 w-px bg-border"
            style={{ left: `${depth * 12 + 15}px` }}
            aria-hidden
          />
          {node.children.map((child) => (
            <TreeItem
              key={child.srn}
              node={child}
              depth={depth + 1}
              activeSrn={activeSrn}
              query={query}
              expandAll={expandAll}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Mark the matched substring so a hit is obvious in a dense list. */
function highlight(name: string, query: string) {
  if (!query) return name
  const index = name.toLowerCase().indexOf(query)
  if (index === -1) return name
  return (
    <>
      {name.slice(0, index)}
      <mark className="rounded-sm bg-primary/25 text-foreground">{name.slice(index, index + query.length)}</mark>
      {name.slice(index + query.length)}
    </>
  )
}

/**
 * Keep a node when it matches, or when any descendant does. Retaining
 * non-matching ancestors is what lets a match stay findable: a bare list of hits
 * loses the one thing the tree is for, which is where a thing sits.
 */
function filterTree(nodes: TreeNode[], query: string, kinds: EntityKind[]): TreeNode[] {
  if (!query && kinds.length === 0) return nodes

  const matches = (node: TreeNode) => {
    const byKind = kinds.length === 0 || kinds.includes(node.kind)
    const byText =
      !query || node.name.toLowerCase().includes(query) || node.title.toLowerCase().includes(query)
    return byKind && byText
  }

  const walk = (node: TreeNode): TreeNode | null => {
    const children = node.children.map(walk).filter((child): child is TreeNode => child !== null)
    if (!matches(node) && children.length === 0) return null
    return { ...node, children }
  }

  return nodes.map(walk).filter((node): node is TreeNode => node !== null)
}

function countMatches(nodes: TreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countMatches(node.children), 0)
}
