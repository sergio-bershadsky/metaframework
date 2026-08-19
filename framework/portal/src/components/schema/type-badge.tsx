import type { SchemaNode } from '@/lib/schema/registry'
import { cn } from '@/lib/utils'

/**
 * JSON Schema types are structure, not ontology, so these badges stay
 * achromatic: hue in this portal always means "entity kind" and never
 * "primitive". What varies is weight — a declared `type` reads as foreground,
 * a derived one and the annotation-only `format` read as muted.
 */

const CHIP = 'inline-flex items-center rounded border px-1.5 py-px font-mono text-[11px] leading-[1.35]'

/** Types the 2020-12 `type` keyword may name. */
const JSON_TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

/**
 * Display types for a subschema. `type` is authoritative; without it the shape
 * still tells the reader something, so the keyword that carries the structure
 * names it — an inferred token, rendered as such.
 */
export function typeTokens(node: SchemaNode | null | undefined): string[] {
  if (!node) return []
  if (typeof node.type === 'string') return [node.type]
  if (Array.isArray(node.type)) return node.type.filter((token): token is string => typeof token === 'string')
  if (node.const !== undefined) return ['const']
  if (Array.isArray(node.enum)) return ['enum']
  if (Array.isArray(node.oneOf)) return ['oneOf']
  if (Array.isArray(node.anyOf)) return ['anyOf']
  if (node.properties || node.patternProperties || node.additionalProperties !== undefined) return ['object']
  if (node.items || node.prefixItems) return ['array']
  return []
}

export interface TypeBadgeProps {
  /** The `type` keyword, or the tokens {@link typeTokens} derived from a node. */
  type?: string | string[] | null
  /** Annotation-only in this framework: the validator never asserts it. */
  format?: string | null
  className?: string
}

export function TypeBadge({ type, format, className }: TypeBadgeProps) {
  const tokens = (Array.isArray(type) ? type : type ? [type] : []).filter(Boolean)
  if (tokens.length === 0 && !format) return null

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {tokens.map((token) => (
        <span
          key={token}
          className={cn(
            CHIP,
            JSON_TYPES.has(token)
              ? 'border-border-strong/70 bg-surface-raised text-foreground/80'
              : // Inferred from the shape rather than declared — say so quietly.
                'border-dashed border-border text-muted-foreground',
          )}
        >
          {token}
        </span>
      ))}
      {format && (
        <span className={cn(CHIP, 'border-transparent bg-muted/60 text-muted-foreground')} title="format is annotation-only">
          {format}
        </span>
      )}
    </span>
  )
}

/** A literal `const` / enum member, typeset as the value it is. */
export function ConstBadge({ value, className }: { value: unknown; className?: string }) {
  return (
    <span className={cn(CHIP, 'border-border bg-background/60 text-foreground/85', className)}>{literal(value)}</span>
  )
}

export function literal(value: unknown): string {
  if (typeof value === 'string') return value
  return JSON.stringify(value) ?? String(value)
}
