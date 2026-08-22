'use client'

import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleDashed,
  Copy,
  Crosshair,
  Group,
  ListFilter,
  Search,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
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
import { EntityGlyph } from '@/components/entity-glyph'
import { type EntityKind, STATUSES, type Status } from '@/lib/catalog/frontmatter'
import { entityHref } from '@/lib/catalog/href'
import {
  applyLens,
  countMatches,
  filterSignature,
  filterTree,
  type GroupLens,
  isFiltering,
  KIND_ORDER,
  lensNodeId,
  lensNodeKey,
  type LensNode,
  matchesFilters,
  type TreeFilters,
  type TreeLens,
  type TreeNode,
} from '@/lib/catalog/tree'
import { kindStyle, STATUS_STYLES } from '@/lib/ui/kind'
import { settingsSnapshot, solutionOfPath, useRailSettings, writeSettings } from '@/lib/ui/rail-settings'
import { cn } from '@/lib/utils'

const LENS_LABELS: Record<TreeLens, string> = {
  hierarchy: 'Hierarchy',
  kind: 'Kind',
  status: 'Status',
  owner: 'Owner',
}

const LENS_BLURBS: Record<TreeLens, string> = {
  hierarchy: 'Containment — the shape an SRN encodes.',
  kind: "Buckets each branch's children by kind.",
  status: "Buckets each branch's children by lifecycle state.",
  owner: "Buckets each branch's children by owning team.",
}

/**
 * Status is a LINE TREATMENT on the label — never a hue, never an opacity.
 *
 * The four form one ordered family running from most provisional to retired:
 * dotted is the loosest mark a line can make, dashed firms it up, approved
 * needs no mark at all, and a struck-through name is one to stop using. Hue is
 * spent entirely on kind, and opacity already means "kept for context while
 * filtering" — putting deprecated on the opacity channel as well made a retired
 * entity indistinguishable from an ancestor that merely failed the filter.
 */
const STATUS_TREATMENT: Record<Status, string> = {
  draft: 'underline decoration-dotted underline-offset-[3px]',
  review: 'underline decoration-dashed underline-offset-[3px]',
  approved: '',
  deprecated: 'line-through',
}

/**
 * The catalog tree.
 *
 * Kind hue is carried by the node's icon only — colouring labels too would turn
 * a dense sidebar into confetti and destroy scannability, while the icon alone
 * still makes kind identifiable at a glance.
 *
 * Three channels, three meanings, no overlap. HUE is kind, carried by the row's
 * icon. The label's LINE TREATMENT is status. OPACITY is filter context and
 * nothing else: filtering keeps the ancestors of every match so a hit is never
 * shown without its context, and dims them so the eye lands on what actually
 * matched.
 *
 * A grouping lens buckets each branch's own children by kind, status or owner,
 * all the way down. Containment survives, so all three channels keep meaning
 * exactly what they meant under the hierarchy — the buckets are extra levels,
 * not a different view.
 */
export function CatalogTree({ roots }: { roots: TreeNode[] }) {
  const pathname = usePathname()
  // The text filter is genuinely page state: unlike a lens or a focus, a search
  // term you typed a day ago is noise when you come back.
  const [query, setQuery] = useState('')
  const { kinds, statuses, focus, lens } = useRailSettings()
  const setKinds = (next: EntityKind[]) => writeSettings({ ...settingsSnapshot(), kinds: next })
  const setStatuses = (next: Status[]) => writeSettings({ ...settingsSnapshot(), statuses: next })
  const setFocus = (next: string) => writeSettings({ ...settingsSnapshot(), focus: next })
  const setLens = (next: TreeLens) => writeSettings({ ...settingsSnapshot(), lens: next })

  const activeSrn = useMemo(() => {
    if (!pathname.startsWith('/catalog/')) return null
    return `srn://${decodeURIComponent(pathname.slice('/catalog/'.length))}`
  }, [pathname])

  const solutions = roots.map((root) => ({ srn: root.srn, name: root.name }))

  /*
   * Focus follows the entity across a solution boundary.
   *
   * A solution is a sealed universe, so a focus on one of them says nothing
   * about any other — and while the rail kept showing the focused solution's
   * tree, opening an entity in a different solution left the reader looking at
   * a tree that could not contain the page they were on. The "you are here"
   * highlight simply vanished, which is the one thing a rail exists to prevent.
   *
   * Of the two honest repairs — drop the focus, or move it — moving it is the
   * one that keeps the affordance doing its job: the reader still gets one
   * solution's contents at full width, and the chip still names the scope they
   * are actually in. Dropping it would answer "where am I" by showing the whole
   * catalog, which is the view the focus was chosen to escape.
   *
   * Written from an effect and not during render because it is a write to a
   * persisted preference: the rail is reporting where the reader navigated, and
   * navigation is the event. `focus &&` keeps "All solutions" meaning all
   * solutions — an unfocused rail is not asking to be focused by a link click.
   */
  useEffect(() => {
    const solution = solutionOfPath(pathname)
    if (!solution) return
    const current = settingsSnapshot()
    if (!current.focus || current.focus === solution) return
    // Only follow into a solution the rail can actually show; a stale URL must
    // not park the focus on an SRN with no tree behind it.
    if (!roots.some((root) => root.srn === solution)) return
    writeSettings({ ...current, focus: solution })
  }, [pathname, roots])

  // Focusing a solution promotes its children to roots: the solution itself is
  // the context you just chose, so repeating it on every row wastes the width.
  // It is also the scope every lens projects — with more than one solution in
  // the catalog, a flat lens over all of them would mix two universes.
  const focused = useMemo(() => {
    if (!focus) return roots
    const solution = roots.find((root) => root.srn === focus)
    return solution ? solution.children : roots
  }, [roots, focus])

  const filters = useMemo<TreeFilters>(
    () => ({ query: query.trim().toLowerCase(), kinds, statuses }),
    [query, kinds, statuses],
  )

  const filtering = isFiltering(filters)

  /*
   * Fold state while filtering.
   *
   * Activating or CHANGING a filter auto-expands every retained branch so the
   * matches are visible — a hit hidden inside a collapsed branch would make the
   * filter look broken. But that expansion is the filter's DEFAULT, not the law:
   * while the filter stays unchanged the reader can still collapse a branch, and
   * it stays collapsed until they reopen it or the filter changes. The model is
   * an override map keyed by path-qualified node id, tied to the filter's
   * signature — a new signature (typing, toggling a kind or status) drops the
   * overrides, which is exactly the auto-reveal.
   *
   * Overrides are deliberately NOT persisted to `metaframework.tree`: they are a
   * transient reading posture inside one filter session, and resurrecting them
   * tomorrow — against a tree that may have changed — would make branches
   * mysteriously refuse to open. Clearing the filter simply stops consulting the
   * map, so the reader's normal expansion state (per-row `open`) returns intact.
   *
   * The signature check runs during render — React's sanctioned way to reset
   * state when a prop-derived value changes, without an effect's extra paint of
   * the stale expansion.
   */
  const signature = filterSignature(filters)
  const [overrides, setOverrides] = useState({ signature, map: {} as Record<string, boolean> })
  if (overrides.signature !== signature) setOverrides({ signature, map: {} })
  const overrideMap = overrides.signature === signature ? overrides.map : {}
  const setOverride = useCallback((id: string, expanded: boolean) => {
    setOverrides((prev) => ({ signature: prev.signature, map: { ...prev.map, [id]: expanded } }))
  }, [])

  // Filter first, then group: `filterTree` keeps the ancestors of every hit, and
  // those ancestors are ordinary members of their own level's buckets.
  const view = useMemo(
    () => applyLens(filterTree(focused, filters), lens),
    [focused, filters, lens],
  )
  // Real matches only — the ancestors kept for context are not hits, and saying
  // otherwise once made the rail claim more than it had found.
  const matches = useMemo(() => countMatches(focused, filters), [focused, filters])

  const empty = view.length === 0

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

        {/* Two deliberate rows rather than a wrap: what the rail SHOWS (which
            scope, in which shape) above what it HIDES (kind, status). Left to
            flex-wrap, the fourth control lands alone on a line by accident. */}
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <LensPicker lens={lens} onChange={setLens} />
            <SolutionFocus solutions={solutions} focus={focus} onChange={setFocus} />
          </div>
          <div className="flex items-center gap-1.5">
            <KindFilter kinds={kinds} onChange={setKinds} />
            <StatusFilter statuses={statuses} onChange={setStatuses} />
          </div>
        </div>

        {filtering && (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground" role="status">
            {matches === 0 ? 'no matches' : `${matches} match${matches === 1 ? '' : 'es'}`}
          </p>
        )}
      </div>

      <nav aria-label="Catalog" className="min-h-0 flex-1 overflow-y-auto py-2 text-[13px]">
        {view.map((item) => (
          <TreeItem
            key={itemKey(item)}
            item={item}
            id={lensNodeId(null, item)}
            depth={0}
            entityDepth={0}
            activeSrn={activeSrn}
            filters={filters}
            filtering={filtering}
            overrides={overrideMap}
            onOverride={setOverride}
          />
        ))}

        {empty && (
          <p className="px-4 py-6 text-xs leading-relaxed text-muted-foreground">
            {filtering ? (
              <>
                Nothing matches. Try a different term
                {(kinds.length > 0 || statuses.length > 0) && ', or relax the kind and status filters'}.
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

/**
 * The lens picker.
 *
 * Hierarchy is the catalog's own shape; the other three re-cut the same scope
 * to answer questions containment hides, because the answer to "what is still
 * in review" is scattered across every product.
 */
function LensPicker({ lens, onChange }: { lens: TreeLens; onChange: (lens: TreeLens) => void }) {
  return (
    <DropdownMenu>
      {/* No aria-label: the visible "Group: Kind" is already the name, and an
          aria-label that merely paraphrases it breaks Label in Name (2.5.3). */}
      <DropdownMenuTrigger
        className={cn(
          'focusable inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] transition',
          lens !== 'hierarchy'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <Group className="size-3.5 shrink-0" aria-hidden />
        {/* "Group:" is not filler — without it this pill and the kind FILTER
            below it both read "Kind" while doing entirely different things. */}
        <span className="text-muted-foreground/70">Group:</span>
        {LENS_LABELS[lens]}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">Group by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={lens} onValueChange={(value) => onChange(value as TreeLens)}>
          {(Object.keys(LENS_LABELS) as TreeLens[]).map((value) => (
            <DropdownMenuRadioItem key={value} value={value} className="items-start text-[12.5px]">
              <span className="flex flex-col gap-0.5">
                {LENS_LABELS[value]}
                <span className="text-[11px] leading-snug text-muted-foreground">{LENS_BLURBS[value]}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
        {/* KIND_ORDER, not ENTITY_KINDS: this menu and the Kind lens's buckets
            sit in the same viewport, and they were iterating two different
            orderings of the same twelve words — the lens in reading order, the
            menu in adoption order, so capability/journey/metric appeared beside
            the actors in one and trailing the ADRs in the other. See the note on
            ENTITY_KINDS for which list is which and why only one of them is ever
            shown to a reader. */}
        {KIND_ORDER.map((kind) => {
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

/**
 * The status filter doubles as the legend for the line treatments: each option
 * is typeset the way rows carrying that status are, so the encoding is learned
 * in the one place you are already thinking about status.
 */
function StatusFilter({
  statuses,
  onChange,
}: {
  statuses: Status[]
  onChange: (statuses: Status[]) => void
}) {
  const toggle = (status: Status) =>
    onChange(statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'focusable inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] transition',
          statuses.length > 0
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <CircleDashed className="size-3.5" aria-hidden />
        {statuses.length > 0 ? `${statuses.length} status${statuses.length === 1 ? '' : 'es'}` : 'Status'}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider">Show only</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {STATUSES.map((status) => (
          <DropdownMenuCheckboxItem
            key={status}
            checked={statuses.includes(status)}
            onCheckedChange={() => toggle(status)}
            onSelect={(event) => event.preventDefault()}
            className="text-[12.5px]"
          >
            <span className={cn('font-mono text-[12px]', STATUS_TREATMENT[status])}>
              {STATUS_STYLES[status]?.label ?? status}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        {statuses.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={() => onChange([])}
              className="focusable w-full rounded px-2 py-1.5 text-left text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Clear status filter
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
            <span className="font-mono text-foreground/80">{current.name}</span>; the solution row is hidden,
            and every lens is scoped to it.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Sibling-unique — that is all a React key on one level has to be. */
function itemKey(item: LensNode): string {
  return lensNodeKey(item)
}

function groupLabel(lens: GroupLens, key: string): string {
  if (lens === 'kind') return kindStyle(key as EntityKind).label
  if (lens === 'status') return STATUS_STYLES[key]?.label ?? key
  return key === '' ? 'No owner' : key
}

/**
 * One level of the rail — an entity, or a bucket a lens inserted above one.
 *
 * Both live in a single recursive component because a bucket IS a level of this
 * tree: it indents, it expands, it hangs off the same guide rail. Two
 * components for the two shapes is exactly how the old flat lens grew into a
 * second list with its own rules; the union keeps one set of rules and lets the
 * row markup be the only thing that differs.
 */
function TreeItem({
  item,
  id,
  depth,
  entityDepth,
  activeSrn,
  filters,
  filtering,
  overrides,
  onOverride,
}: {
  item: LensNode
  /** Path-qualified id — what the filter-time override map is keyed by. */
  id: string
  /** Indent level, buckets included — what the padding and guide rail read. */
  depth: number
  /** Entity ancestors only, so a lens cannot change what opens by default. */
  entityDepth: number
  activeSrn: string | null
  filters: TreeFilters
  filtering: boolean
  /** Filter-scoped collapse/expand overrides; empty whenever the filter changes. */
  overrides: Record<string, boolean>
  onOverride: (id: string, expanded: boolean) => void
}) {
  const onActivePath =
    item.type === 'entity' &&
    (activeSrn === item.node.srn || (activeSrn?.startsWith(`${item.node.srn}/`) ?? false))
  // A bucket starts open: it was inserted above rows that were visible a moment
  // ago, and arriving collapsed would read as "the lens hid my catalog".
  // Entities keep the two-levels-deep default, counted in ENTITY levels — count
  // buckets too and choosing a lens would halve how deep the rail opens.
  const [open, setOpen] = useState(item.type === 'group' || entityDepth < 2 || onActivePath)
  const panelId = useId()
  const isActive = item.type === 'entity' && activeSrn === item.node.srn
  const hasChildren = item.children.length > 0
  // While filtering, every retained branch defaults to open so the matches are
  // visible — but the reader's explicit toggles for THIS filter win over that
  // default. Groups and entities alike: a bucket is a level of the tree and
  // folds by the same rules. Off filter, the row's own `open` state applies,
  // untouched by anything that happened during the filter session.
  const expanded = filtering ? (overrides[id] ?? true) : open
  const toggle = () => {
    if (filtering) onOverride(id, !expanded)
    else setOpen(!expanded)
  }

  const subtree = (
    <>
      {/* Guide rail: makes deep nesting readable without heavy indentation. */}
      <span className="absolute inset-y-0 w-px bg-border" style={{ left: `${depth * 12 + 15}px` }} aria-hidden />
      {item.children.map((child) => (
        <TreeItem
          key={itemKey(child)}
          item={child}
          id={lensNodeId(id, child)}
          depth={depth + 1}
          entityDepth={item.type === 'group' ? entityDepth : entityDepth + 1}
          activeSrn={activeSrn}
          filters={filters}
          filtering={filtering}
          overrides={overrides}
          onOverride={onOverride}
        />
      ))}
    </>
  )

  if (item.type === 'group') {
    return (
      <div>
        {/* Virtual: a button, never a link, and no kind icon — there is no page
            behind "Data model", and anything that looks clickable here would
            promise one. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="focusable flex w-full items-center gap-1 pr-2 text-left hover:bg-surface-raised/70"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <span className="grid size-4 shrink-0 place-items-center text-muted-foreground">
            <ChevronRight
              className={cn(
                'size-3 transition-transform duration-150 motion-reduce:transition-none',
                expanded && 'rotate-90',
              )}
              aria-hidden
            />
          </span>
          <span className="truncate py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {groupLabel(item.lens, item.key)}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground/60">
            {item.count}
          </span>
        </button>

        {/* Rendered while collapsed too: `aria-controls` has to name an element
            that exists. Entity subtrees below stay conditional. */}
        <div id={panelId} hidden={!expanded} className="relative">
          {subtree}
        </div>
      </div>
    )
  }

  const { node } = item
  // While filtering, an ancestor kept only for context is dimmed so the eye
  // lands on the rows that actually matched. This is opacity's ONLY meaning in
  // the rail — status has its own channel, the label's line treatment.
  const isContextOnly = filtering && !matchesFilters(node, filters)

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
          onClick={toggle}
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          aria-expanded={hasChildren ? expanded : undefined}
          className={cn(
            'focusable grid size-4 shrink-0 place-items-center rounded text-muted-foreground',
            !hasChildren && 'invisible',
          )}
        >
          <ChevronRight
            className={cn(
              'size-3 transition-transform duration-150 motion-reduce:transition-none',
              expanded && 'rotate-90',
            )}
          />
        </button>

        <Link
          href={entityHref(node.srn)}
          className="focusable glyph-host flex min-w-0 flex-1 items-center gap-2 rounded py-1.5"
          title={node.title}
        >
          <NodeIcon node={node} dim={isContextOnly} />
          <NodeLabel node={node} query={filters.query} active={isActive} dim={isContextOnly} />
          {node.hasError && <AlertTriangle className="size-3 shrink-0 text-destructive" aria-label="Has errors" />}
        </Link>

        <CopySrnButton srn={node.srn} />
      </div>

      {expanded && hasChildren && <div className="relative">{subtree}</div>}
    </div>
  )
}

/* ------------------------------------------------------------ shared parts */

/* The icon is the only place kind is encoded in this dense list, so it names
   itself on hover rather than relying on colour memory. */
function NodeIcon({ node, dim }: { node: TreeNode; dim: boolean }) {
  const style = kindStyle(node.kind)
  // Named in the tooltip and the accessible name, not left to the animation:
  // the cross-fade is an affordance for a reader who is already looking, and
  // neither a screen reader nor a paused pointer should have to watch a 2s
  // cycle to learn a word.
  const label = node.componentType ? `${style.label} · ${node.componentType}` : style.label
  return (
    // `relative` for the same reason as on the label: the sr-only kind name is
    // absolute, and it must be contained here rather than escaping to the row.
    <span title={label} className="relative flex shrink-0 items-center">
      <EntityGlyph kind={node.kind} componentType={node.componentType} className="size-3.5" dim={dim} />
      <span className="sr-only">{label}</span>
    </span>
  )
}

function NodeLabel({
  node,
  query,
  active,
  dim,
}: {
  node: TreeNode
  query: string
  active: boolean
  dim: boolean
}) {
  return (
    <span
      className={cn(
        // `relative` is not decoration: the sr-only status span below is
        // absolutely positioned, and without a positioned ancestor HERE its
        // containing block is the row — so it lands where the un-truncated
        // text would have ended, up to ~26px past the rail's edge, and
        // absolutely-positioned descendants count toward scrollWidth. The rail
        // then pans horizontally on a trackpad. Positioning the clipped label
        // itself keeps the span inside the clip, where it takes up nothing.
        'relative truncate font-mono text-[12.5px] tracking-tight',
        active ? 'text-foreground' : 'text-foreground/75 group-hover:text-foreground',
        dim && 'text-foreground/40',
        // Last, so tailwind-merge cannot drop the treatment behind an earlier
        // arbitrary utility — the line treatment is the whole status signal.
        STATUS_TREATMENT[node.status],
      )}
    >
      {highlight(node.name, query)}
      {node.status !== 'approved' && <span className="sr-only"> ({node.status})</span>}
    </span>
  )
}

/**
 * Copy an entity's SRN straight from the tree.
 *
 * The SRN is what you paste into frontmatter, a workflow payload or a schema
 * ref, so the tree — where you are already hunting for the entity — is the
 * cheapest place to take it from. The row is truncated to fit the rail, so the
 * button's tooltip carries the full address.
 */
function CopySrnButton({ srn }: { srn: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(event: React.MouseEvent) {
    // The row is a link; copying must not navigate.
    event.preventDefault()
    event.stopPropagation()
    await navigator.clipboard.writeText(srn)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : srn}
      aria-label={copied ? `Copied ${srn}` : `Copy ${srn}`}
      className="focusable shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition
                 group-hover:opacity-100 focus-visible:opacity-100 hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3 text-kind-environment" aria-hidden />
      ) : (
        <Copy className="size-3" aria-hidden />
      )}
    </button>
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
