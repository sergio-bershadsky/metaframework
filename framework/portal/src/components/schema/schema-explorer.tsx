'use client'

import { Check, ChevronRight, Copy, Repeat, TriangleAlert } from 'lucide-react'
import { createContext, useContext, useState } from 'react'
import { ConstBadge, TypeBadge, literal, typeTokens } from '@/components/schema/type-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  DiscriminatedUnion,
  EffectiveProperty,
  LineageNode,
  RefResolution,
  SchemaBundle,
  SchemaMeta,
  SchemaNode,
  UnionVariant,
} from '@/lib/schema/registry'
import { kindStyle } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

/**
 * The datamodel schema explorer.
 *
 * Everything it renders is precomputed by lib/schema/registry into a plain
 * {@link SchemaBundle}: ref resolutions, union tags, ancestor documents and the
 * flattened field list. That split is deliberate — resolution belongs to ajv
 * and the SRN parser on the server, never to a component, and importing the
 * registry here would drag ajv into the browser bundle.
 *
 * The three views answer three different questions: *what fields does an
 * instance have* (effective), *where do they come from* (inheritance), and
 * *what exactly did the author write* (raw).
 */

export type SchemaExplorerTab = 'fields' | 'lineage' | 'raw'

export interface SchemaExplorerProps {
  bundle: SchemaBundle
  /** Receives the unversioned SRN of a datamodel when one of its chips is clicked. */
  onNavigate?: (srn: string) => void
  defaultTab?: SchemaExplorerTab
  className?: string
}

const DATAMODEL = kindStyle('datamodel')

interface ExplorerContextValue {
  bundle: SchemaBundle
  onNavigate?: (srn: string) => void
}

const ExplorerContext = createContext<ExplorerContextValue | null>(null)

function useExplorer(): ExplorerContextValue {
  const value = useContext(ExplorerContext)
  if (!value) throw new Error('SchemaExplorer subcomponents must render inside SchemaExplorer')
  return value
}

export function SchemaExplorer({ bundle, onNavigate, defaultTab = 'fields', className }: SchemaExplorerProps) {
  const errors = bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const warnings = bundle.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')

  return (
    <ExplorerContext.Provider value={{ bundle, onNavigate }}>
      <section className={cn('panel overflow-hidden', className)} aria-label={`Schema of ${bundle.title}`}>
        <Tabs defaultValue={defaultTab} className="gap-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2">
            <TabsList variant="line" className="h-7">
              <TabsTrigger value="fields" className="px-2 text-[12px]">
                Effective fields
              </TabsTrigger>
              <TabsTrigger value="lineage" className="px-2 text-[12px]">
                Inheritance
              </TabsTrigger>
              <TabsTrigger value="raw" className="px-2 text-[12px]">
                Raw
              </TabsTrigger>
            </TabsList>

            <div className="ml-auto flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span>draft 2020-12</span>
              {bundle.version !== null && <Flag>v{bundle.version}</Flag>}
              {bundle.usage && <Flag>{bundle.usage}</Flag>}
              {bundle.abstract && <Flag title="Never instantiated on its own">abstract</Flag>}
              {bundle.effective.closed && <Flag title="additionalProperties: false">closed</Flag>}
            </div>
          </div>

          {(errors.length > 0 || warnings.length > 0) && <DiagnosticsStrip errors={errors} warnings={warnings} />}

          <TabsContent value="fields">
            <FieldsTab />
          </TabsContent>
          <TabsContent value="lineage">
            <LineageTab />
          </TabsContent>
          <TabsContent value="raw">
            <RawTab />
          </TabsContent>
        </Tabs>
      </section>
    </ExplorerContext.Provider>
  )
}

function Flag({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className="rounded border border-border bg-surface-raised px-1.5 py-px text-foreground/70">
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                 */
/* -------------------------------------------------------------------------- */

function DiagnosticsStrip({
  errors,
  warnings,
}: {
  errors: SchemaBundle['diagnostics']
  warnings: SchemaBundle['diagnostics']
}) {
  return (
    <ul className="divide-y divide-border border-b border-border bg-background/40">
      {[...errors, ...warnings].map((diagnostic, index) => (
        <li
          key={`${diagnostic.code}-${index}`}
          className="flex items-start gap-2 px-3 py-1.5 text-[12px] leading-5"
        >
          <TriangleAlert
            className={cn('mt-0.5 size-3.5 shrink-0', diagnostic.severity === 'error' ? 'text-destructive' : 'text-warning')}
            aria-hidden
          />
          <span className="sr-only">{diagnostic.severity === 'error' ? 'Error' : 'Warning'}:</span>
          <code
            className={cn(
              'shrink-0 font-mono text-[11px]',
              diagnostic.severity === 'error' ? 'text-destructive' : 'text-warning',
            )}
          >
            {diagnostic.code}
          </code>
          <span className="text-muted-foreground">{diagnostic.message}</span>
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

function FieldsTab() {
  const { bundle } = useExplorer()
  const rootUnion = bundle.unions[bundle.id] ?? null
  const [variant, setVariant] = useState(0)

  const root = rootShape(bundle)
  const rows = bundle.effective.properties.map((property) => fromEffective(bundle, property))
  const arrayRows = itemRows(bundle, root)
  const selected = rootUnion?.variants[variant]
  const variantRows = selected ? variantChildRows(bundle, selected, [bundle.id]) : []
  const total = rows.length + arrayRows.length + variantRows.length

  const inherited = rows.filter((row) => !row.own).length

  return (
    <div>
      {rootUnion && (
        <div className="border-b border-border px-3 py-2.5">
          <UnionSwitcher union={rootUnion} index={variant} onSelect={setVariant} />
        </div>
      )}

      {total === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
          This schema declares no properties — it constrains its instances in another way. Read the raw document.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <caption className="sr-only">
                Effective fields of {bundle.title}, flattened from its root allOf conjunction. Each row names the
                schema that contributes it.
              </caption>
              <thead>
                <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="py-1.5 pl-3 pr-2 font-medium">
                    Field
                  </th>
                  <th scope="col" className="px-2 py-1.5 font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-2 py-1.5 font-medium">
                    Req
                  </th>
                  <th scope="col" className="px-2 py-1.5 font-medium">
                    Constraints
                  </th>
                  <th scope="col" className="px-2 py-1.5 font-medium">
                    Description
                  </th>
                  <th scope="col" className="py-1.5 pl-2 pr-3 font-medium">
                    From
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...rows, ...arrayRows, ...variantRows].map((row) => (
                  <PropertyRows key={`${row.contributions[0]?.docId}${row.contributions[0]?.pointer}`} row={row} depth={0} path={[bundle.id]} />
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
            {total} field{total === 1 ? '' : 's'}
            {inherited > 0 && ` · ${inherited} inherited`}
            {bundle.effective.required.length > 0 && ` · required: ${bundle.effective.required.join(', ')}`}
          </p>
        </>
      )}
    </div>
  )
}

const COLUMNS = 6

function PropertyRows({ row, depth, path }: { row: Row; depth: number; path: string[] }) {
  const { bundle } = useExplorer()
  const [open, setOpen] = useState(false)

  const primary = row.contributions[0]
  const shape = resolveShape(bundle, primary, path)
  const union = bundle.unions[shape.key] ?? null
  const children = shape.cyclic || shape.error ? [] : childRows(bundle, shape)
  const expandable = children.length > 0 || union !== null
  const nextPath = [...path, shape.key]

  return (
    <>
      <tr className={cn('border-b border-border/60 align-top', open && 'bg-surface-raised/35')}>
        <td className="py-1.5 pl-3 pr-2">
          <div className="flex items-start gap-1" style={{ paddingLeft: `${depth * 14}px` }}>
            {expandable ? (
              <button
                type="button"
                onClick={() => setOpen((previous) => !previous)}
                aria-expanded={open}
                aria-label={`${open ? 'Collapse' : 'Expand'} ${row.name}`}
                className="focusable -ml-0.5 mt-px rounded p-0.5 text-muted-foreground transition hover:text-foreground"
              >
                <ChevronRight
                  className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-90')}
                  aria-hidden
                />
              </button>
            ) : (
              <span className="inline-block w-[18px]" aria-hidden />
            )}
            <span
              className={cn(
                'font-mono text-[12.5px] leading-5',
                row.synthetic ? 'text-muted-foreground italic' : 'text-foreground',
                row.deprecated && 'line-through decoration-warning/70',
              )}
            >
              {row.name}
            </span>
            {row.deprecated && (
              <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-warning">deprecated</span>
            )}
          </div>
        </td>

        <td className="px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1">
            <TypeBadge type={typeTokens(shape.node)} format={typeof shape.node.format === 'string' ? shape.node.format : null} />
            {shape.ref && !shape.error && <RefChip resolution={shape.ref} />}
            {shape.cyclic && (
              <span
                className="inline-flex items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1.5 py-px font-mono text-[11px] text-warning"
                title="Following this reference would re-enter a schema already on this path"
              >
                <Repeat className="size-3" aria-hidden />
                cyclic reference
              </span>
            )}
            {shape.error && <ErrorChip code={shape.error.code} message={shape.error.message} />}
          </div>
        </td>

        <td className="px-2 py-1.5">
          {row.required ? (
            <span className="font-mono text-[11px] text-primary" title="Required by the flattened conjunction">
              yes
            </span>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground/60">no</span>
          )}
        </td>

        <td className="px-2 py-1.5">
          <Constraints row={row} shape={shape} />
        </td>

        <td className="max-w-[34ch] px-2 py-1.5 text-[12px] leading-5 text-muted-foreground">
          {row.description ?? (typeof shape.node.description === 'string' ? shape.node.description : null)}
        </td>

        <td className="py-1.5 pl-2 pr-3">
          <OriginChip row={row} />
        </td>
      </tr>

      {open && union && <UnionRow union={union} depth={depth + 1} path={nextPath} />}
      {open &&
        !union &&
        children.map((child) => (
          <PropertyRows
            key={`${child.contributions[0]?.docId}${child.contributions[0]?.pointer}`}
            row={child}
            depth={depth + 1}
            path={nextPath}
          />
        ))}
    </>
  )
}

/** A nested `oneOf`: the switcher first, then the selected variant's fields. */
function UnionRow({ union, depth, path }: { union: DiscriminatedUnion; depth: number; path: string[] }) {
  const { bundle } = useExplorer()
  const [index, setIndex] = useState(0)
  const selected = union.variants[index]
  const rows = selected ? variantChildRows(bundle, selected, path) : []

  return (
    <>
      <tr className="border-b border-border/60 bg-surface-raised/35">
        <td colSpan={COLUMNS} className="py-2 pl-3 pr-3">
          <div style={{ paddingLeft: `${depth * 14}px` }}>
            <UnionSwitcher union={union} index={index} onSelect={setIndex} />
          </div>
        </td>
      </tr>
      {rows.map((row) => (
        <PropertyRows
          key={`${row.contributions[0]?.docId}${row.contributions[0]?.pointer}`}
          row={row}
          depth={depth}
          path={selected?.key ? [...path, selected.key] : path}
        />
      ))}
    </>
  )
}

function UnionSwitcher({
  union,
  index,
  onSelect,
}: {
  union: DiscriminatedUnion
  index: number
  onSelect: (index: number) => void
}) {
  const { onNavigate } = useExplorer()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
        {union.derivable ? (
          <>
            oneOf · tag <span className="text-foreground/80">{union.tag}</span>
          </>
        ) : (
          'oneOf · untagged'
        )}
      </span>

      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Union variant">
        {union.variants.map((variant, position) => {
          const active = position === index
          return (
            <button
              key={`${variant.key ?? variant.ref ?? position}`}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(position)}
              className={cn(
                'focusable inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] transition',
                active
                  ? 'border-primary/45 bg-primary/12 text-primary'
                  : 'border-border bg-surface-raised text-muted-foreground hover:text-foreground',
              )}
            >
              {variant.tag !== null && variant.tag !== undefined ? literal(variant.tag) : variant.title}
              {variant.error && <TriangleAlert className="size-3 text-destructive" aria-hidden />}
            </button>
          )
        })}
      </div>

      {union.variants[index]?.srn && onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate(union.variants[index].srn as string)}
          className={cn('focusable rounded font-mono text-[11px] underline-offset-2 hover:underline', DATAMODEL.text)}
        >
          open {union.variants[index].title}
        </button>
      )}

      {!union.derivable && (
        <span className="font-mono text-[11px] text-warning" title="W_DM_UNION_TAG">
          no shared const tag — branches shown as authored
        </span>
      )}
    </div>
  )
}

/**
 * Constraints are read after the `$ref` hop — `{ "$ref": "#/$defs/positive-int" }`
 * carries no bound of its own, the shape it points at does — plus any keyword
 * the author wrote alongside the `$ref`, which 2020-12 also applies.
 */
function constraintSources(row: Row, shape: Shape): SchemaNode[] {
  const sources: SchemaNode[] = []
  const primary = row.contributions[0]
  if (primary) {
    sources.push(shape.node)
    if (primary.node !== shape.node) sources.push(primary.node)
  }
  for (const contribution of row.contributions.slice(1)) sources.push(contribution.node)
  return sources
}

function Constraints({ row, shape }: { row: Row; shape: Shape }) {
  const chips: React.ReactNode[] = []

  constraintSources(row, shape).forEach((node, index) => {
    if (node.const !== undefined) chips.push(<ConstBadge key={`c${index}`} value={node.const} />)
    if (Array.isArray(node.enum)) {
      const shown = node.enum.slice(0, 5)
      shown.forEach((member, position) => chips.push(<ConstBadge key={`e${index}-${position}`} value={member} />))
      if (node.enum.length > shown.length) {
        chips.push(
          <span key={`e${index}-more`} className="font-mono text-[11px] text-muted-foreground">
            +{node.enum.length - shown.length}
          </span>,
        )
      }
    }
    for (const keyword of CONSTRAINT_KEYWORDS) {
      const value = node[keyword]
      if (value === undefined) continue
      chips.push(
        <span
          key={`${keyword}-${index}`}
          className="rounded border border-border bg-background/60 px-1.5 py-px font-mono text-[11px] text-muted-foreground"
        >
          {keyword} {literal(value)}
        </span>,
      )
    }
  })

  if (row.restricted) {
    chips.push(
      <span
        key="restricted"
        title="Constrained by more than one schema in the conjunction — allOf intersects, it never overrides"
        className="rounded border border-border-strong px-1.5 py-px font-mono text-[11px] text-foreground/70"
      >
        restricted
      </span>,
    )
  }
  if (row.contradiction) {
    chips.push(<ErrorChip key="contradiction" code="W_DM_CONTRADICTION" message="disjoint types — no instance can validate" />)
  }

  if (chips.length === 0) return <span className="text-muted-foreground/50">—</span>
  return <span className="flex flex-wrap items-center gap-1">{chips}</span>
}

function OriginChip({ row }: { row: Row }) {
  const { bundle, onNavigate } = useExplorer()
  const primary = row.contributions[0]
  if (!primary) return <span className="text-muted-foreground/50">—</span>

  if (primary.own) {
    return <span className="font-mono text-[11px] text-muted-foreground">own</span>
  }

  const label = bundle.meta[primary.docId]?.srn ?? primary.docId
  const short = label.split('/').pop() ?? label
  const className = cn(
    'inline-flex items-center rounded border px-1.5 py-px font-mono text-[11px]',
    DATAMODEL.bg,
    DATAMODEL.border,
    DATAMODEL.text,
  )

  if (!onNavigate || !primary.originSrn) {
    return (
      <span className={className} title={label}>
        {short}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onNavigate(primary.originSrn as string)}
      title={label}
      className={cn(className, 'focusable transition hover:brightness-125')}
    >
      {short}
    </button>
  )
}

function RefChip({ resolution }: { resolution: RefResolution }) {
  const { onNavigate } = useExplorer()

  if (resolution.kind === 'local') {
    return (
      <span
        className="rounded border border-border bg-background/60 px-1.5 py-px font-mono text-[11px] text-muted-foreground"
        title={`Entity-private shape at ${resolution.pointer}`}
      >
        {resolution.ref}
      </span>
    )
  }

  // The entity name, not the human title: this column is identifiers.
  const name = resolution.targetSrn?.split('/').pop() ?? resolution.ref
  const label = `${name}${resolution.version === null ? '' : `@${resolution.version}`}`
  const hint = resolution.targetSrn ? `${resolution.ref} → ${resolution.targetSrn}` : resolution.ref
  const className = cn(
    'inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11px]',
    DATAMODEL.bg,
    DATAMODEL.border,
    DATAMODEL.text,
  )

  if (!onNavigate || !resolution.targetSrn) {
    return (
      <span className={className} title={hint}>
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onNavigate(resolution.targetSrn as string)}
      title={hint}
      className={cn(className, 'focusable transition hover:brightness-125')}
    >
      {label}
      {resolution.abstract && <span className="opacity-70">abstract</span>}
    </button>
  )
}

function ErrorChip({ code, message }: { code: string; message: string }) {
  return (
    <span
      title={message}
      className="inline-flex items-center gap-1 rounded border border-destructive/45 bg-destructive/10 px-1.5 py-px font-mono text-[11px] text-destructive"
    >
      <TriangleAlert className="size-3" aria-hidden />
      {code}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Inheritance                                                                 */
/* -------------------------------------------------------------------------- */

function LineageTab() {
  const { bundle, onNavigate } = useExplorer()

  return (
    <div className="space-y-5 px-3 py-3">
      <div>
        <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          Extends (root allOf, nearest first)
        </h3>
        <ol className="space-y-0.5">
          {bundle.effective.lineage.map((node, index) => (
            <LineageRow key={`${node.id}-${index}`} node={node} onNavigate={onNavigate} />
          ))}
        </ol>
        {bundle.effective.lineage.length === 1 && (
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            No bases — this model stands on its own.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Extended by</h3>
        {bundle.descendants.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Nothing derives from this model.</p>
        ) : (
          <ul className="space-y-0.5">
            {bundle.descendants.map((descendant) => (
              <li key={descendant.id}>
                <DescendantRow meta={descendant} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function LineageRow({ node, onNavigate }: { node: LineageNode; onNavigate?: (srn: string) => void }) {
  const interactive = Boolean(onNavigate && node.srn && node.depth > 0)
  const body = (
    <span className="flex flex-wrap items-baseline gap-2">
      <span className={cn('font-mono text-[12.5px]', node.depth === 0 ? 'text-foreground' : DATAMODEL.text)}>
        {node.srn ? node.srn.replace('srn://', '') : node.title}
        {node.version !== null && <span className="text-muted-foreground">@{node.version}</span>}
      </span>
      {node.depth === 0 && <Tag>this model</Tag>}
      {node.abstract && <Tag title="Never instantiated on its own">abstract</Tag>}
      {node.status === 'cyclic' && (
        <Tag className="border-warning/40 text-warning" title="E_DM_INHERIT_CYCLE">
          cyclic reference
        </Tag>
      )}
      {node.status === 'repeated' && <Tag title="Already merged through another branch">already merged</Tag>}
      {node.status === 'unresolved' && node.error && <ErrorChip code={node.error.code} message={node.error.message} />}
      {node.status === 'ok' && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {node.contributes} field{node.contributes === 1 ? '' : 's'}
        </span>
      )}
    </span>
  )

  return (
    <li
      style={{ marginLeft: `${node.depth * 16}px` }}
      className={cn('py-1', node.depth > 0 && 'border-l border-border pl-3')}
    >
      {interactive ? (
        <button
          type="button"
          onClick={() => onNavigate?.(node.srn as string)}
          className="focusable w-full rounded text-left transition hover:brightness-125"
        >
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  )
}

function DescendantRow({ meta, onNavigate }: { meta: SchemaMeta; onNavigate?: (srn: string) => void }) {
  const body = (
    <span className="flex flex-wrap items-baseline gap-2">
      <span className={cn('font-mono text-[12.5px]', DATAMODEL.text)}>
        {meta.srn.replace('srn://', '')}
        {meta.version !== null && <span className="text-muted-foreground">@{meta.version}</span>}
      </span>
      {meta.abstract && <Tag>abstract</Tag>}
      {meta.usage && <Tag>{meta.usage}</Tag>}
    </span>
  )
  if (!onNavigate) return body
  return (
    <button
      type="button"
      onClick={() => onNavigate(meta.srn)}
      className="focusable w-full rounded py-1 text-left transition hover:brightness-125"
    >
      {body}
    </button>
  )
}

function Tag({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'rounded border border-border bg-surface-raised px-1.5 py-px font-mono text-[10px] uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/* Raw                                                                         */
/* -------------------------------------------------------------------------- */

function RawTab() {
  const { bundle } = useExplorer()
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(bundle.raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied schema.json' : 'Copy schema.json'}
        className="focusable absolute right-2 top-2 rounded border border-border bg-surface-raised p-1 text-muted-foreground transition hover:text-foreground"
      >
        {copied ? <Check className="size-3.5 text-kind-environment" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
      <pre className="max-h-[36rem] overflow-auto bg-background/40 p-3 text-[12.5px] leading-6">
        <code className="font-mono text-foreground/80">{bundle.raw.trimEnd()}</code>
      </pre>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Row model                                                                   */
/* -------------------------------------------------------------------------- */

interface Contribution {
  docId: string
  pointer: string
  node: SchemaNode
  originSrn: string | null
  own: boolean
}

interface Row {
  name: string
  /** Nearest first; more than one means the conjunction constrains the name twice. */
  contributions: Contribution[]
  required: boolean
  restricted: boolean
  contradiction: boolean
  deprecated: boolean
  description: string | null
  own: boolean
  /** `items` and tuple positions describe a value, not a named property. */
  synthetic?: boolean
}

interface Shape {
  /** The node whose keywords describe the value, after following one `$ref`. */
  node: SchemaNode
  docId: string
  pointer: string
  /** Key into `bundle.documents` / `bundle.unions`. */
  key: string
  ref: RefResolution | null
  error: { code: string; message: string } | null
  cyclic: boolean
}

const CONSTRAINT_KEYWORDS = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
] as const

/**
 * Both duplicated from lib/schema/registry, which cannot be imported here
 * without pulling ajv into the browser bundle. They must stay in step with it.
 */
function nodeKeyOf(docId: string, pointer: string): string {
  return pointer ? `${docId}#${pointer}` : docId
}

function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

function isNode(value: unknown): value is SchemaNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rootShape(bundle: SchemaBundle): Shape {
  return {
    node: bundle.documents[bundle.id] ?? {},
    docId: bundle.id,
    pointer: '',
    key: bundle.id,
    ref: null,
    error: null,
    cyclic: false,
  }
}

function fromEffective(bundle: SchemaBundle, property: EffectiveProperty): Row {
  return {
    name: property.name,
    contributions: property.contributions.map((contribution) => ({
      docId: contribution.origin,
      pointer: contribution.pointer,
      node: contribution.schema,
      originSrn: bundle.meta[contribution.origin]?.srn ?? contribution.originSrn,
      own: contribution.own,
    })),
    required: property.required,
    restricted: property.restricted,
    contradiction: property.contradiction,
    deprecated: property.deprecated,
    description: property.description,
    own: property.own,
  }
}

function inlineRow(
  bundle: SchemaBundle,
  shape: Shape,
  name: string,
  node: SchemaNode,
  pointer: string,
  required: boolean,
  synthetic = false,
): Row {
  return {
    name,
    contributions: [
      {
        docId: shape.docId,
        pointer,
        node,
        originSrn: bundle.meta[shape.docId]?.srn ?? null,
        own: shape.docId === bundle.id,
      },
    ],
    required,
    restricted: false,
    contradiction: false,
    deprecated: node.deprecated === true,
    description: typeof node.description === 'string' ? node.description : null,
    own: shape.docId === bundle.id,
    synthetic,
  }
}

function resolveShape(bundle: SchemaBundle, contribution: Contribution | undefined, path: string[]): Shape {
  const node = contribution?.node ?? {}
  const docId = contribution?.docId ?? bundle.id
  const pointer = contribution?.pointer ?? ''
  const own: Shape = { node, docId, pointer, key: nodeKeyOf(docId, pointer), ref: null, error: null, cyclic: false }

  const ref = typeof node.$ref === 'string' ? node.$ref : null
  if (!ref) return own

  const resolution = bundle.refs[docId]?.[ref] ?? null
  if (!resolution || resolution.error || !resolution.targetKey) {
    // An unresolvable reference must be loud: a silently empty row reads as
    // "this model has no fields", which is a different and wrong statement.
    return {
      ...own,
      ref: resolution,
      error: resolution?.error ?? { code: 'E_SRN_DANGLING', message: `"${ref}" could not be resolved` },
    }
  }

  const target = bundle.documents[resolution.targetKey]
  if (!target) {
    return {
      ...own,
      ref: resolution,
      error: { code: 'E_SRN_DANGLING', message: `"${ref}" resolves outside the loaded schema closure` },
    }
  }

  return {
    node: target,
    docId: resolution.targetId ?? docId,
    pointer: resolution.pointer,
    key: resolution.targetKey,
    ref: resolution,
    error: null,
    cyclic: path.includes(resolution.targetKey),
  }
}

function itemRows(bundle: SchemaBundle, shape: Shape): Row[] {
  const rows: Row[] = []
  const node = shape.node
  if (isNode(node.items)) {
    rows.push(inlineRow(bundle, shape, 'items', node.items, `${shape.pointer}/items`, false, true))
  }
  ;(node.prefixItems ?? []).forEach((item, position) => {
    if (isNode(item)) {
      rows.push(inlineRow(bundle, shape, `[${position}]`, item, `${shape.pointer}/prefixItems/${position}`, false, true))
    }
  })
  return rows
}

function childRows(bundle: SchemaBundle, shape: Shape): Row[] {
  // A whole registered document expands to its EFFECTIVE fields: a nested model
  // that itself extends a base carries the base's properties too.
  if (shape.pointer === '' && bundle.flat[shape.docId]) {
    return [...bundle.flat[shape.docId].map((property) => fromEffective(bundle, property)), ...itemRows(bundle, shape)]
  }

  const node = shape.node
  const required = new Set(node.required ?? [])
  const rows: Row[] = []
  for (const [name, subschema] of Object.entries(node.properties ?? {})) {
    if (!isNode(subschema)) continue
    rows.push(
      inlineRow(
        bundle,
        shape,
        name,
        subschema,
        `${shape.pointer}/properties/${escapeToken(name)}`,
        required.has(name),
      ),
    )
  }
  return [...rows, ...itemRows(bundle, shape)]
}

function variantChildRows(bundle: SchemaBundle, variant: UnionVariant, path: string[]): Row[] {
  if (!variant.key) return []
  const node = bundle.documents[variant.key]
  if (!node) return []
  const shape: Shape = {
    node,
    docId: variant.docId,
    pointer: variant.pointer,
    key: variant.key,
    ref: null,
    error: variant.error,
    cyclic: path.includes(variant.key),
  }
  if (shape.cyclic) return []
  return childRows(bundle, shape)
}
