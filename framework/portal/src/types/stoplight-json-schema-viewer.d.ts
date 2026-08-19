/**
 * `@stoplight/json-schema-viewer` ships type declarations but its package.json
 * `exports` map does not expose them, so TypeScript resolves the module to
 * `any` under node16/bundler resolution. This declares the slice we use.
 *
 * Remove once upstream publishes a `types` condition in its exports map.
 */
declare module '@stoplight/json-schema-viewer' {
  import type { JSONSchema7 } from 'json-schema'
  import type { ComponentType, ReactNode } from 'react'

  export interface JsonSchemaViewerProps {
    schema: JSONSchema7
    /** How many levels are expanded on first render. */
    defaultExpandedDepth?: number
    emptyText?: string
    className?: string
    /** Hide the top-level type/description banner. */
    skipTopLevelDescription?: boolean
    onGoToRef?: (ref: string) => void
    renderRootTreeLines?: boolean
  }

  export const JsonSchemaViewer: ComponentType<JsonSchemaViewerProps>
  export const Validations: ComponentType<{ validations: Record<string, unknown> }>
  export function useChoices(schemaNode: unknown): unknown
  export const Choice: ComponentType<{ children?: ReactNode }>
}
