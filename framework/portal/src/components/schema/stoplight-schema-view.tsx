'use client'

import type { JSONSchema7 } from 'json-schema'
import dynamic from 'next/dynamic'
import { Component, type ReactNode, useState } from 'react'
// Mosaic's stylesheet is imported in app/globals.css, deliberately ahead of the
// design tokens — see the note there. Importing it here would reverse the
// cascade and let it override the portal's typography.
import './stoplight-theme.css'

/**
 * Stoplight's viewer reads `document` at module scope, so it cannot be rendered
 * on the server at all — importing it eagerly takes the whole page down with
 * "document is not defined". It is therefore loaded client-side only; the
 * server-rendered raw `schema.json` in the artifacts section remains the
 * no-JavaScript and machine-readable path to the same content.
 */
const JsonSchemaViewer = dynamic(
  () => import('@stoplight/json-schema-viewer').then((module) => module.JsonSchemaViewer),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2" aria-busy="true" aria-label="Loading schema">
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="h-4 animate-pulse rounded bg-surface-raised"
            style={{ width: `${88 - row * 13}%` }}
          />
        ))}
      </div>
    ),
  },
)

/**
 * JSON Schema rendered with Stoplight's viewer.
 *
 * Stoplight is used instead of a hand-rolled table because it already solves the
 * hard parts properly: nested expansion, combiner (allOf/oneOf/anyOf) tabs,
 * constraint rendering, and required/optional affordances.
 *
 * It follows exactly one kind of reference. `json-schema-tree` refuses a `$ref`
 * with a source ("Cannot dereference external references") and resolves a
 * fragment-only one against the *root* document, ignoring any `$id` in between.
 * So the input contract is stricter than "bundled": the document must be **one
 * resource whose every `$ref` is a local pointer into it**, which is what
 * `lib/schema/dereference.ts` guarantees. A schema that merely satisfies the
 * bundler renders its cross-document fields as raw `$ref` strings instead — the
 * viewer contradicting the page it sits on.
 *
 * Its Mosaic design tokens are overridden in stoplight-theme.css so the viewer
 * inherits the console palette rather than shipping a second theme.
 */
export function StoplightSchemaView({
  schema,
  className,
  defaultExpandedDepth = 2,
}: {
  schema: unknown
  className?: string
  defaultExpandedDepth?: number
}) {
  const [failure, setFailure] = useState<string | null>(null)

  if (!schema || typeof schema !== 'object') {
    return <p className="text-[13px] text-muted-foreground">No schema to display.</p>
  }

  if (failure) {
    return (
      <p className="text-[13px] text-destructive">
        Schema viewer failed to render ({failure}). The raw schema is still available below.
      </p>
    )
  }

  return (
    <div className={`sl-metaframework-schema ${className ?? ''}`} data-testid="stoplight-schema">
      <ViewerErrorBoundary onError={setFailure}>
        <JsonSchemaViewer
          schema={schema as JSONSchema7}
          defaultExpandedDepth={defaultExpandedDepth}
          emptyText="This schema declares no properties."
        />
      </ViewerErrorBoundary>
    </div>
  )
}

/**
 * The viewer pulls in a large dependency tree whose React peer range stops at
 * 18, so a render fault must degrade to the raw-schema fallback rather than
 * take the whole entity page down with it.
 */
class ViewerErrorBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { crashed: boolean }
> {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message)
  }

  render() {
    return this.state.crashed ? null : this.props.children
  }
}
