'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { RelationGraph, type RelationGraphProps } from '@/components/diagrams/relation-graph'
import { SequenceDiagram, type SequenceDiagramProps } from '@/components/diagrams/sequence-diagram'
import { entityHref } from '@/lib/catalog/href'

/**
 * Diagrams that navigate.
 *
 * The diagram components take an `onNavigate` callback but are otherwise pure,
 * which keeps them testable and reusable. A server component cannot hand a
 * function across the boundary, so these thin client wrappers supply the router
 * — every clickable thing in a diagram (a participant lifeline, a payload chip,
 * a graph node) lands on that entity's page.
 */
function useEntityNavigation() {
  const router = useRouter()
  return useCallback((srn: string) => router.push(entityHref(srn)), [router])
}

export function NavigableSequenceDiagram(props: Omit<SequenceDiagramProps, 'onNavigate'>) {
  const navigate = useEntityNavigation()
  return <SequenceDiagram {...props} onNavigate={navigate} />
}

export function NavigableRelationGraph(props: Omit<RelationGraphProps, 'onNavigate'>) {
  const navigate = useEntityNavigation()
  return <RelationGraph {...props} onNavigate={navigate} />
}
