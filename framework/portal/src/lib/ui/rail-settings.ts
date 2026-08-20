'use client'

import { useSyncExternalStore } from 'react'
import { ENTITY_KINDS, type EntityKind, STATUSES, type Status } from '@/lib/catalog/frontmatter'
import { isTreeLens, type TreeLens } from '@/lib/catalog/tree'

/**
 * Lens, focus and filters are navigation preferences, not page state: they must
 * survive a reload and a full navigation.
 *
 * They are modelled as what they actually are — an external store read through
 * `useSyncExternalStore` — rather than as component state rehydrated from an
 * effect. That is not ceremony: the effect version renders once with the
 * defaults and then sets state, which is a cascading render React now flags, and
 * it silently disagrees with a second tab. Here the server snapshot is the
 * defaults (so hydration matches), the client snapshot is whatever localStorage
 * holds, and a `storage` event from another tab is just another change to
 * publish.
 *
 * This lives outside `catalog-tree.tsx` because the rail is no longer the only
 * reader: the masthead's Map link has to know which solution the reader is
 * scoped to, and a second copy of the parse-and-validate rules would be a second
 * place for a stale preference to leak through.
 */
export interface RailSettings {
  kinds: EntityKind[]
  statuses: Status[]
  /** SRN of the focused solution, or '' for the whole catalog. */
  focus: string
  lens: TreeLens
}

const STORAGE_KEY = 'metaframework.tree'

export const DEFAULT_SETTINGS: RailSettings = { kinds: [], statuses: [], focus: '', lens: 'hierarchy' }

const listeners = new Set<() => void>()
/** The last raw string parsed, so a snapshot keeps its identity between writes. */
let cachedRaw: string | null | undefined
let cached: RailSettings = DEFAULT_SETTINGS

/**
 * Every value is re-validated on read: a preference written by an older build
 * must not resurrect a kind, a status or a lens this build no longer has.
 */
function parseSettings(raw: string | null): RailSettings {
  if (!raw) return DEFAULT_SETTINGS
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      kinds: Array.isArray(parsed.kinds)
        ? parsed.kinds.filter((k): k is EntityKind => ENTITY_KINDS.includes(k as EntityKind))
        : [],
      statuses: Array.isArray(parsed.statuses)
        ? parsed.statuses.filter((s): s is Status => STATUSES.includes(s as Status))
        : [],
      focus: typeof parsed.focus === 'string' ? parsed.focus : '',
      lens: isTreeLens(parsed.lens) ? parsed.lens : 'hierarchy',
    }
  } catch {
    /* a corrupt preference must never break navigation */
    return DEFAULT_SETTINGS
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    /* storage can be denied outright; the rail still has to work */
    return null
  }
}

function publish() {
  cachedRaw = undefined
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent) {
  if (event.key === null || event.key === STORAGE_KEY) publish()
}

function subscribeSettings(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

export function settingsSnapshot(): RailSettings {
  const raw = readRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = parseSettings(raw)
  }
  return cached
}

function serverSettingsSnapshot(): RailSettings {
  return DEFAULT_SETTINGS
}

export function writeSettings(next: RailSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* the choice still applies to this session even if it cannot be stored */
  }
  cached = next
  cachedRaw = readRaw()
  for (const listener of listeners) listener()
}

export function useRailSettings(): RailSettings {
  return useSyncExternalStore(subscribeSettings, settingsSnapshot, serverSettingsSnapshot)
}

/**
 * The solution an entity route belongs to, as an SRN, or null off `/catalog`.
 *
 * A solution is the first SRN segment and nothing else — the catalog's sealed
 * universe — so this is a slice, not a catalog lookup, and it works in a client
 * component that has never seen the entity graph.
 */
export function solutionOfPath(pathname: string): string | null {
  if (!pathname.startsWith('/catalog/')) return null
  const rest = pathname.slice('/catalog/'.length)
  const first = rest.split('/')[0]
  if (!first) return null
  return `srn://${decodeURIComponent(first)}`
}
