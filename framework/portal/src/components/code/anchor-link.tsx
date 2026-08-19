'use client'

import { createContext, useContext } from 'react'

/**
 * The channel between an artifact's visual and its source.
 *
 * A diagram on an entity page is a projection of one file. Selecting a step in
 * the picture and finding the six lines that authored it — or the reverse —
 * is the single most useful thing the pair can do, and until the two were in
 * one block there was nowhere to put it.
 *
 * It is a context rather than a prop because of where the pieces are built: the
 * visual is a server component, assembled beside the parsed artifact, while the
 * editor and the selection state are client-side. A server component can be
 * *passed* to a client component but cannot be handed callbacks afterwards, so
 * the block provides and the diagram consumes.
 *
 * Anchor ids stay in each diagram's own vocabulary — a workflow step's
 * positional path, a state node's dot path. Only the block, which knows which
 * artifact it is showing, translates them into file positions.
 */
export interface AnchorLink {
  /** Anchors the source side is pointing at, deepest first. */
  active: readonly string[]
  /** Pointer or focus moved onto an element; null when it left. */
  onActivate: (anchor: string | null) => void
  /** An element was clicked. Selection survives the pointer leaving. */
  onSelect: (anchor: string | null) => void
}

const AnchorLinkContext = createContext<AnchorLink | null>(null)

export function AnchorLinkProvider({ value, children }: { value: AnchorLink; children: React.ReactNode }) {
  return <AnchorLinkContext.Provider value={value}>{children}</AnchorLinkContext.Provider>
}

/** Null outside a block — every diagram still works standalone. */
export function useAnchorLink(): AnchorLink | null {
  return useContext(AnchorLinkContext)
}
