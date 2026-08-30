/**
 * Route helpers. Deliberately free of node:fs imports so client components can
 * use them — the rest of the catalog module is server-only.
 */

import { SCHEMA_ROUTE } from '../schema/url'
import { artifactFile } from '../srn/artifacts'
import type { Srn } from '../srn/srn'

/**
 * Convert an SRN to the portal route that renders it.
 *
 * The `@version` pin is dropped, because the route is the entity's identity and
 * carries no version: `/catalog/…/shard-bundle@1` is a 404 where
 * `/catalog/…/shard-bundle` is the page. Most callers pass an entity's own
 * `srn`, which never carries a pin — but the diagrams pass *references*, and a
 * reference is where a pin is written. `workflows/*.yaml` says a `payload`
 * SHOULD pin `@version`, so a correctly-authored workflow was the reliable way
 * to produce a dead payload chip.
 *
 * Stripped by pattern rather than by {@link parseSrn}: this runs during render
 * at nineteen call sites, none of which handle a throw, so a malformed SRN must
 * still yield a (dead) link rather than take out the page. The pattern is the
 * one `splitVersion` enforces — `@` plus a positive integer, at the very end,
 * after any `.artifact` suffix.
 */
export function entityHref(srn: string): string {
  return `/catalog/${srn.replace('srn://', '').replace(/@[1-9][0-9]*$/, '')}`
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
