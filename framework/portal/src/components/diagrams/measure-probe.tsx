'use client'

import { useNodesInitialized, useReactFlow } from '@xyflow/react'
import { useEffect, useRef } from 'react'

/**
 * The second half of a two-pass layout: report what the browser actually drew.
 *
 * ELK has to be given node sizes before anything exists in the DOM, so the
 * first pass runs on estimates — and estimates of wrapped text are wrong often
 * enough that a state box came out shorter than its own content and sliced the
 * last line off. React Flow v12 measures every node it renders, so the honest
 * fix is to stop guessing on the second pass: lay out with estimates, let the
 * browser render and measure, then re-run ELK with the true sizes.
 *
 * Rendered as a child of `<ReactFlow>` because `useNodesInitialized` reads the
 * flow store, which only exists below that component.
 *
 * Two things are reported, and both must come from the DOM:
 *   - `nodes` — React Flow's own measurement (`offsetWidth/offsetHeight`, so it
 *     is in flow units and unaffected by the viewport transform);
 *   - `headers` — the rendered height of a compound node's header, marked up
 *     with `data-diagram-header="<node id>"`. A compound state's children start
 *     below its header, and a fixed inset for that is what pushes a nested
 *     state onto its parent's border.
 */

export interface MeasuredGeometry {
  nodes: Map<string, { width: number; height: number }>
  headers: Map<string, number>
}

export interface MeasureProbeProps {
  /**
   * Called once the flow reports every node measured. The caller is responsible
   * for ignoring a report it has already acted on — this component deliberately
   * has no memory, so a density or direction change re-reports.
   */
  onMeasure: (geometry: MeasuredGeometry) => void
}

export function MeasureProbe({ onMeasure }: MeasureProbeProps) {
  const initialized = useNodesInitialized()
  const { getNodes } = useReactFlow()
  const anchor = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!initialized) return

    const nodes = new Map<string, { width: number; height: number }>()
    for (const node of getNodes()) {
      const { width, height } = node.measured ?? {}
      if (width && height) nodes.set(node.id, { width, height })
    }

    // Scoped to this canvas: two diagrams on one page would otherwise read each
    // other's headers, and node ids are only unique within a flow.
    const headers = new Map<string, number>()
    const canvas = anchor.current?.closest('.react-flow')
    for (const element of canvas?.querySelectorAll<HTMLElement>('[data-diagram-header]') ?? []) {
      const id = element.dataset.diagramHeader
      if (id) headers.set(id, element.offsetHeight)
    }

    onMeasure({ nodes, headers })
  }, [initialized, getNodes, onMeasure])

  return <span ref={anchor} className="hidden" aria-hidden />
}
