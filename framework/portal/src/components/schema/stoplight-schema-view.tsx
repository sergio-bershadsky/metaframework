'use client'

import type { JSONSchema7 } from 'json-schema'
import dynamic from 'next/dynamic'
import { Component, type ReactNode, useState } from 'react'
// Mosaic's stylesheet is imported in app/globals.css, deliberately ahead of the
// design tokens — see the note there. Importing it here would reverse the
// cascade and let it override the portal's typography.
import './stoplight-theme.css'

/**
 * Contain one third-party warning, exactly, and only in development.
 *
 * The viewer's combiner picker leaks React's `isOpen` onto a DOM element, which
 * React reports as "React does not recognize the `isOpen` prop on a DOM
 * element" — and Next 16 promotes console errors into the dev overlay, so a
 * schema page opens with an error banner over content that rendered perfectly.
 *
 * It is not ours and there is no version to upgrade to. The chain, traced
 * rather than guessed: `@stoplight/mosaic` Menu calls
 * `runIfFn(renderTrigger, { isOpen: state.isOpen })` (core.esm.js:16884), and
 * `@stoplight/json-schema-viewer` passes a *function* trigger that spreads its
 * whole argument onto Mosaic's `Pressable` (index.mjs:854):
 *
 *     renderTrigger: props => React.createElement(Pressable, Object.assign({}, props), …)
 *
 * `Pressable` forwards what it does not recognise to its DOM node, so `isOpen`
 * lands on a `<div>`. Nothing this component passes is involved — the props
 * given to `JsonSchemaViewer` below are `schema`, `defaultExpandedDepth` and
 * `emptyText`. Both packages are at their newest published versions
 * (mosaic 1.53.5, json-schema-viewer 4.16.4, checked 2026-08-20).
 *
 * So this is **containment of somebody else's defect, not a fix**, and it is
 * written to be as narrow as a filter can be: development only, the exact
 * format string React uses, and only when the offending prop is `isOpen`. Any
 * other unknown-prop warning — including one this codebase causes — still
 * reaches the console. The alternative was patch-package plus a postinstall to
 * maintain a patched copy of a vendored bundle across upgrades, which is more
 * machinery than a development-only warning earns; React strips these warnings
 * from production builds entirely, so nothing here affects what ships.
 *
 * Delete this the moment the upstream trigger stops spreading its argument.
 */
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  const reported = console.error
  console.error = (...args: unknown[]) => {
    const [format, prop] = args
    if (
      typeof format === 'string' &&
      format.includes('does not recognize the `%s` prop on a DOM element') &&
      prop === 'isOpen'
    ) {
      return
    }
    reported(...args)
  }
}

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
