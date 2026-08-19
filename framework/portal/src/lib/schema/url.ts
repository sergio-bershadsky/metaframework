/**
 * Schema URLs — the identity of every `schema.json` in the catalog.
 *
 * A datamodel's schema is addressed by an HTTP URL that the portal actually
 * serves (`src/app/schemas/[...path]/route.ts`):
 *
 *     srn://acme/product/shop/datamodel/order-line
 *       → http://localhost:3000/schemas/acme/product/shop/datamodel/order-line
 *
 * The path after `/schemas/` is the SRN path verbatim, so the mapping is a
 * rename, not a lookup — SRN ≡ path ≡ URL path. That is what makes a `$ref`
 * *dereferenceable*: a stock validator or generator that has never heard of this
 * framework can GET the URL and receive the schema, which the previous
 * relative-path form could not offer (decision-record 2026-08-19-c).
 *
 * The origin is never hand-typed. It comes from SCHEMA_BASE_URL, and every
 * module — the migration script, the registry, the bundler, the tests — asks
 * this file for it. Because the base is baked into the `$id` and `$ref` strings
 * on disk, it is a **deployment-wide constant**: changing it means rewriting
 * every schema artifact (see docs/decision-record.md), and the registry enforces
 * agreement so the env var and the files can never silently drift apart.
 *
 * No `@version` ever appears in a schema URL. The URL addresses the *current*
 * schema of an entity; pins live in frontmatter `relations`, where git-backed
 * history can actually resolve them.
 */

import { formatSrn, parseSrn, SCHEME, type Srn } from '../srn/srn'

/** Used when SCHEMA_BASE_URL is unset — the portal's own dev origin. */
export const DEFAULT_SCHEMA_BASE_URL = 'http://localhost:3000'

/** Route prefix the portal serves schemas under. Leading slash, no trailing one. */
export const SCHEMA_ROUTE = '/schemas'

/**
 * Origin (and optional path prefix) every schema URL is built on, without a
 * trailing slash. Read on every call rather than captured at module load, so a
 * test or a script can set the variable and see it take effect.
 */
export function schemaBaseUrl(): string {
  const configured = process.env.SCHEMA_BASE_URL?.trim()
  const base = configured && configured.length > 0 ? configured : DEFAULT_SCHEMA_BASE_URL
  return base.replace(/\/+$/, '')
}

/** The `/schemas/...` prefix every schema URL starts with, including the origin. */
export function schemaUrlPrefix(): string {
  return `${schemaBaseUrl()}${SCHEMA_ROUTE}/`
}

/**
 * The URL identity of a datamodel entity. Accepts either an SRN string or an
 * already-parsed one; a version pin is dropped, because the URL addresses the
 * current schema. Throws `SrnError` on a malformed SRN — a caller holding an
 * entity from the catalog can never hit that.
 */
export function srnToSchemaUrl(srn: string | Srn): string {
  const parsed = typeof srn === 'string' ? parseSrn(srn) : srn
  return `${schemaUrlPrefix()}${srnPath(parsed)}`
}

/**
 * Inverse of {@link srnToSchemaUrl}: the unversioned SRN a schema URL names, or
 * null when the URL is not one of ours — a foreign origin, a path outside
 * `/schemas/`, or a path that is not a legal entity address.
 *
 * Returning null rather than throwing is deliberate: an unrecognised `$ref` is a
 * diagnostic the author must see, not an exception that kills the page.
 */
export function schemaUrlToSrn(url: string): string | null {
  const path = schemaUrlToPath(url)
  if (path === null) return null
  // A pin must be *rejected*, not normalised away. parseSrn would happily accept
  // `…/money@1` and this function would then strip the `@1` and answer with the
  // current schema — silently serving something other than what was asked for,
  // which is precisely the failure the URL form exists to rule out.
  if (path.includes('@')) return null
  try {
    // parseSrn enforces the whole grammar — bucket alternation, reserved words,
    // placement — so a URL that survives this addresses a possible entity.
    return formatSrn({ ...parseSrn(`${SCHEME}${path}`), version: null })
  } catch {
    return null
  }
}

/**
 * The catalog path a schema URL addresses (`acme/datamodel/money`), before any
 * SRN grammar check. Null when the URL does not sit under this portal's
 * `/schemas/` prefix — which is the check that separates "wrong address" from
 * "not addressed to us at all".
 */
export function schemaUrlToPath(url: string): string | null {
  if (typeof url !== 'string') return null
  const prefix = schemaUrlPrefix()
  if (!url.startsWith(prefix)) return null
  const path = url.slice(prefix.length)
  // A query or fragment is not part of the address. Fragments are split off by
  // the caller before we get here; anything left over means a malformed ref.
  if (path.length === 0 || path.includes('?') || path.includes('#')) return null
  return path
}

/** True when `url` is a schema URL served by this portal. */
export function isSchemaUrl(url: string): boolean {
  return schemaUrlToPath(url) !== null
}

/** The bare path of an SRN — what appears after `srn://` and after `/schemas/`. */
function srnPath(srn: Srn): string {
  return [srn.solution, ...srn.path.flatMap((segment) => [segment.kind, segment.name])].join('/')
}
