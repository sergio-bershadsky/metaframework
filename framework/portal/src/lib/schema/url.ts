/**
 * Schema URLs — the identity of every `schema.json` in the catalog.
 *
 * The consolidating principle (framework/spec/srn.md): **the SRN is the
 * identity, the schema URL is its dereferenceable projection, the disk path is
 * its storage. All three are mechanically inter-convertible, and none of them is
 * a second addressing scheme.**
 *
 *     srn://acme/product/shop/datamodel/order-line              # identity
 *     solutions/acme/product/shop/datamodel/order-line/         # storage
 *     https://schemas.metaframework.dev/acme/product/shop/datamodel/order-line
 *                                                               # projection
 *
 * The path after the host is the SRN path verbatim, so the mapping is a rename,
 * not a lookup.
 *
 * **The host is a stable canonical constant, not an environment variable.**
 * {@link CANONICAL_SCHEMA_HOST} is defined here, once, and is the same string on
 * a developer's laptop and in production. Identity must not vary between
 * deployments: registries and caches key on `$id`, and two deployments that
 * disagree about a schema's identity is a real defect, not a configuration
 * choice. A schema copied out of the catalog keeps meaning what it meant.
 *
 * `SCHEMA_BASE_URL` is a different thing and is still honoured: it says *where
 * this portal serves schemas* — the `/schemas` route in
 * `src/app/schemas/[...path]/route.ts`, `http://localhost:3000/schemas/…` in
 * dev. That is a retrieval address, not an identity, and it MUST NOT appear in
 * `$id` or in any `$ref`. In JSON Schema terms this is ordinary: `$id` is an
 * identifier and retrieval is a resolver's problem. Use {@link schemaServingUrl}
 * when you want the address to fetch from.
 *
 * No `@version` ever appears in a schema URL. The URL addresses the *current*
 * schema of an entity; pins live in frontmatter `relations`, where git-backed
 * history can actually resolve them.
 */

import { formatSrn, parseSrn, SCHEME, type Srn } from '../srn/srn'

/**
 * The canonical host every `$id` and every cross-entity `$ref` is built on.
 *
 * Deliberately a constant and not configuration — see the module note above.
 * This is the only place the string appears in the portal; nothing else may
 * hand-type a host.
 */
export const CANONICAL_SCHEMA_HOST = 'https://schemas.metaframework.dev'

/** Used when SCHEMA_BASE_URL is unset — the portal's own dev origin. */
export const DEFAULT_SCHEMA_BASE_URL = 'http://localhost:3000'

/** Route prefix this portal *serves* schemas under. Leading slash, no trailing one. */
export const SCHEMA_ROUTE = '/schemas'

/**
 * Origin this portal serves schemas from, without a trailing slash. Retrieval
 * only: it never contributes to a schema's identity. Read on every call rather
 * than captured at module load, so a test or a script can set the variable and
 * see it take effect.
 */
export function schemaBaseUrl(): string {
  const configured = process.env.SCHEMA_BASE_URL?.trim()
  const base = configured && configured.length > 0 ? configured : DEFAULT_SCHEMA_BASE_URL
  return base.replace(/\/+$/, '')
}

/** The canonical prefix every schema URL starts with, including the host. */
export function schemaUrlPrefix(): string {
  return `${CANONICAL_SCHEMA_HOST}/`
}

/**
 * The URL identity of a datamodel entity — its `$id`. Accepts either an SRN
 * string or an already-parsed one; a version pin is dropped, because the URL
 * addresses the current schema. Throws `SrnError` on a malformed SRN — a caller
 * holding an entity from the catalog can never hit that.
 */
export function srnToSchemaUrl(srn: string | Srn): string {
  const parsed = typeof srn === 'string' ? parseSrn(srn) : srn
  return `${schemaUrlPrefix()}${srnPath(parsed)}`
}

/**
 * Where *this* portal serves that same schema from — the `/schemas` route under
 * the configured `SCHEMA_BASE_URL`. This is a retrieval address and appears in
 * no artifact: a resolver that prefers fetching over trusting its cache maps
 * {@link CANONICAL_SCHEMA_HOST} onto this, in resolver config, outside the
 * files.
 */
export function schemaServingUrl(srn: string | Srn): string {
  const parsed = typeof srn === 'string' ? parseSrn(srn) : srn
  return `${schemaBaseUrl()}${SCHEMA_ROUTE}/${srnPath(parsed)}`
}

/**
 * Inverse of {@link srnToSchemaUrl}: the unversioned SRN a schema URL names, or
 * null when the URL is not a canonical one — a foreign host, a serving address,
 * or a path that is not a legal entity address.
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
 * The catalog path a canonical schema URL addresses (`acme/datamodel/money`),
 * before any SRN grammar check. Null when the URL does not sit under the
 * canonical host — which is the check that separates "wrong address" from "not
 * addressed to us at all". A serving address
 * (`http://localhost:3000/schemas/…`) is *not* one of ours by this test, and
 * that is the point: it is where a document can be fetched, never what it is.
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

/** True when `url` is a canonical schema URL. */
export function isSchemaUrl(url: string): boolean {
  return schemaUrlToPath(url) !== null
}

/**
 * True when `url` is an address this portal *serves* a schema at, rather than a
 * schema's identity. Used only to tell an author "that is a retrieval address"
 * instead of the blanket "not a schema URL".
 */
export function isSchemaServingUrl(url: string): boolean {
  if (typeof url !== 'string') return false
  return url.startsWith(`${schemaBaseUrl()}${SCHEMA_ROUTE}/`)
}

/** The bare path of an SRN — what appears after `srn://` and after the host. */
function srnPath(srn: Srn): string {
  return [srn.solution, ...srn.path.flatMap((segment) => [segment.kind, segment.name])].join('/')
}
