/**
 * Route helpers. Deliberately free of node:fs imports so client components can
 * use them — the rest of the catalog module is server-only.
 */

/** Convert an SRN to the portal route that renders it. */
export function entityHref(srn: string): string {
  return `/catalog/${srn.replace('srn://', '')}`
}

/** Inverse of {@link entityHref}: route segments back to an SRN. */
export function srnFromSegments(segments: string[]): string {
  return `srn://${segments.map(decodeURIComponent).join('/')}`
}
