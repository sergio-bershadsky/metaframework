/**
 * Route helpers. Deliberately free of node:fs imports so client components can
 * use them — the rest of the catalog module is server-only.
 */

import { SCHEMA_ROUTE } from '../schema/url'
import { artifactFile } from '../srn/artifacts'
import type { Srn } from '../srn/srn'

/** Convert an SRN to the portal route that renders it. */
export function entityHref(srn: string): string {
  return `/catalog/${srn.replace('srn://', '')}`
}

/**
 * The route serving an addressed artifact's bytes. `.schema` is the one role
 * with a URL projection (srn.md, "`.schema` and the projection"): its href is
 * the `/schemas` route directly, so each schema document is served at exactly
 * one URL — the `/artifacts` handler would only answer with a redirect there.
 * Every other role maps onto `/artifacts/…`, whose path is the SRN path
 * verbatim, dotted suffix included (`src/app/artifacts/[...path]/route.ts`);
 * the role table is consulted by the route, at the trust boundary.
 *
 * Throws `E_SRN_ARTIFACT` (via {@link artifactFile}) when the suffix fails the
 * role table, so a caller never mints a URL for an unservable address.
 */
export function artifactHref(srn: Srn): string {
  const entityPath = [srn.solution, ...srn.path.flatMap((segment) => [segment.kind, segment.name])].join('/')
  artifactFile(srn.kind, srn.artifact ?? '', `srn://${entityPath}`)
  if (srn.artifact === 'schema') return `${SCHEMA_ROUTE}/${entityPath}`
  return `/artifacts/${entityPath}.${srn.artifact}`
}

/** Inverse of {@link entityHref}: route segments back to an SRN. */
export function srnFromSegments(segments: string[]): string {
  return `srn://${segments.map(decodeURIComponent).join('/')}`
}
