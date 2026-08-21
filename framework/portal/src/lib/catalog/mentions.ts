import type { LinkTarget } from '@/components/entity-link'
import { SCHEME, formatSrn, parseSrn, resolveRef } from '../srn/srn'
import { artifactFile } from '../srn/artifacts'
import { artifactHref } from './href'
import type { Catalog } from './types'

/**
 * Turning SRN mentions into navigable links.
 *
 * Prose and kind-specific frontmatter carry references that the relation graph
 * never sees — a datamodel named in a paragraph, a protocol participant, an
 * actor listed on a product. Resolving them here means a reference reads the
 * same and navigates the same wherever it appears, and an unresolvable one is
 * surfaced instead of quietly rendering as text.
 */

/**
 * Matches an SRN anywhere in free text — with an optional artifact suffix
 * (prose is the one legal authoring surface for one, srn.md "Where an artifact
 * SRN may stand") and an optional version pin, in that written order.
 */
export const SRN_PATTERN = /srn:\/\/[a-z0-9-]+(?:\/[a-z0-9-]+)*(?:\.[a-z0-9-]+)*(?:@\d+)?/g

export interface ResolvedMention {
  target: LinkTarget | null
  version: number | null
  /**
   * Where the mention navigates when it is not the entity page: the `/schemas`
   * URL for `.schema`, the `/artifacts` route for every other role. Absent on
   * entity mentions, whose href is the target's own page.
   */
  href?: string
}

/** Resolve one reference (absolute or relative) against a base entity. */
export function resolveMention(catalog: Catalog, baseSrn: string, ref: string): ResolvedMention {
  try {
    const absolute = ref.startsWith(SCHEME) ? ref : resolveRef(baseSrn, ref)
    const parsed = parseSrn(absolute)
    const entity = catalog.entities.get(formatSrn({ ...parsed, artifact: null, version: null }))
    if (!entity) return { target: null, version: parsed.version }
    if (parsed.artifact !== null) {
      // An artifact address must actually resolve to be a link: V5 (the role
      // table) and V7 (the file exists) both hold, or the mention renders as
      // the broken reference it is — exactly like a dangling entity SRN.
      const file = artifactFile(parsed.kind, parsed.artifact, absolute)
      if (!entity.artifacts.some((artifact) => artifact.file === file)) {
        return { target: null, version: parsed.version }
      }
      return {
        target: {
          srn: entity.srn,
          name: `${entity.frontmatter.name}.${parsed.artifact}`,
          title: entity.frontmatter.title,
          kind: entity.kind,
        },
        version: parsed.version,
        // A pin keeps the entity page as its href. The bytes route serves the
        // current snapshot and refuses a pinned URL outright, so linking
        // `…transport@2` there would answer the pin with today's bytes; the
        // entity page is where a version can actually be chosen.
        ...(parsed.version === null ? { href: artifactHref(parsed) } : {}),
      }
    }
    return {
      target: {
        srn: entity.srn,
        name: entity.frontmatter.name,
        title: entity.frontmatter.title,
        kind: entity.kind,
      },
      version: parsed.version,
    }
  } catch {
    return { target: null, version: null }
  }
}

/**
 * Every SRN mentioned in a block of text, resolved.
 *
 * Returned as a plain record so it can cross the server/client boundary — the
 * markdown renderer is a client component and cannot hold the catalog itself.
 */
export function mentionsIn(catalog: Catalog, baseSrn: string, text: string): Record<string, ResolvedMention> {
  const found: Record<string, ResolvedMention> = {}
  for (const match of text.matchAll(SRN_PATTERN)) {
    const ref = match[0]
    if (!(ref in found)) found[ref] = resolveMention(catalog, baseSrn, ref)
  }
  return found
}

/**
 * Any string in a frontmatter value that resolves to an entity, keyed by the
 * string as authored. Used to link kind-specific fields (a protocol's
 * participants, a product's primary actors) without hard-coding field names —
 * new SRN-valued fields link themselves.
 */
export function mentionsInValue(catalog: Catalog, baseSrn: string, value: unknown): Record<string, ResolvedMention> {
  const found: Record<string, ResolvedMention> = {}

  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      if (node in found) return
      const resolved = resolveMention(catalog, baseSrn, node)
      // Only keep strings that actually name an entity; prose fields such as a
      // requirement's acceptance criteria must not become accidental links.
      //
      // Artifact addresses are deliberately dropped rather than linked. Every
      // frontmatter reference surface is fenced against them (srn.md, "Where an
      // artifact SRN may stand"), and rendering one as a working link would
      // teach the surface's own rule wrong — prose is the legal home, and prose
      // goes through `mentionsIn` above.
      if (resolved.target && resolved.href === undefined) found[node] = resolved
      return
    }
    if (Array.isArray(node)) return node.forEach(walk)
    if (node && typeof node === 'object') return Object.values(node).forEach(walk)
  }

  walk(value)
  return found
}
