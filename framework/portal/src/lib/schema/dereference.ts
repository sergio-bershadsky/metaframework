import { readFile } from 'node:fs/promises'
import path from 'node:path'
import $RefParser from '@apidevtools/json-schema-ref-parser'
import type { Entity } from '../catalog/types'
import { SCHEMA_ARTIFACT } from './registry'
import { isSchemaUrl, schemaUrlToPath, schemaUrlToSrn } from './url'

/**
 * Resolve a datamodel's schema into a single self-contained document.
 *
 * Every cross-entity `$ref` is a canonical HTTP URL, which the parser would
 * happily go and *fetch*. It must not. Rendering an entity page would then
 * depend on network access at SSR and build time — for documents this process
 * already holds on disk.
 *
 * So the URLs are resolved the only correct way for a process that already
 * holds the catalog: a resolver ordered ahead of the built-in HTTP one
 * recognises a canonical schema URL, maps it back through SRN ≡ path ≡ URL
 * path, and reads the file off disk. This is exactly the "map the canonical
 * host onto a local source" step any offline resolver performs — identity is in
 * the artifact, retrieval is the resolver's problem — and the document an
 * outside consumer gets is byte-identical.
 *
 * Ordering alone does not achieve that. A plugin that wins `canRead` does not
 * *consume* the reference: when its `read` rejects, the parser moves to the next
 * plugin (`json-schema-ref-parser/dist/lib/util/plugins.js` — "if the promise
 * rejects … then the next plugin is called"), so every `$ref` this resolver
 * could not satisfy — a typo, an entity not written yet — fell through to `http`
 * and turned an entity page render into an outbound request. Measured: the page
 * reported `Error downloading … getaddrinfo ENOTFOUND schemas.metaframework.dev`.
 * It fails fast today only because nothing answers on that host; the day one
 * does, a dangling `$ref` would quietly pull bytes off the network at build and
 * SSR time and render them as if they were the catalog's. A missing document is
 * a diagnostic the author must see, never a fetch.
 *
 * So `http` is narrowed rather than switched off: it refuses the canonical host
 * and keeps everything else. Switching it off outright would also have removed
 * the ability to `$ref` a genuinely external document — a public OpenAPI or
 * GeoJSON schema, an internal registry — which no ruling here asked for. This
 * repository's own 125 canonical `$ref`s make that removal invisible in these
 * tests and in no way safe for somebody else's catalog, which is the whole
 * population this file's neighbours exist to serve.
 *
 * `bundle` (rather than `dereference`) keeps shared and recursive shapes as
 * internal `#/` pointers, so a self-referential model cannot expand forever.
 * `metaframework/…/datamodel/schema-document` is exactly that shape — its
 * `$defs/subschema` refers to itself — so dereferencing is not an option here,
 * it is a stack overflow.
 *
 * Bundling alone does not finish the job, though: see {@link flatten}. The
 * document this function returns is **one** schema resource, with every `$ref`
 * a local `#/` pointer into it — the property the viewer, and any reader
 * pasting the output into a validator, actually depends on.
 */
export interface BundledSchema {
  schema: unknown
  /** Catalog-relative paths of every external file pulled in, for provenance. */
  sources: string[]
  error: string | null
}

/**
 * The catalog-relative directory a canonical schema URL addresses. Containment is
 * structural rather than checked: `schemaUrlToSrn` only answers for strings that
 * parse as a legal SRN, and an SRN path cannot contain `..`, a separator, or an
 * absolute prefix — so the segments it yields can only ever descend.
 */
function relDirForSchemaUrl(url: string): string[] | null {
  if (schemaUrlToSrn(url) === null) return null
  return schemaUrlToPath(url)?.split('/') ?? null
}

export async function bundleSchema(entity: Entity, catalogDir: string): Promise<BundledSchema> {
  const file = path.join(entity.dir, SCHEMA_ARTIFACT)

  /**
   * A resolver in json-schema-ref-parser's plugin shape. `order: 1` runs it
   * first and `canRead` claims only canonical schema URLs; a relative `$ref`
   * still reaches the built-in `file` resolver, and a `$ref` on another host
   * still reaches `http`. What no longer happens is the fall-through: a
   * canonical URL this resolver could not satisfy is refused by both and fails
   * loudly, which is the correct answer for a document the catalog was supposed
   * to hold.
   */
  const catalogResolver = {
    order: 1,
    canRead: (candidate: { url: string }) => isSchemaUrl(candidate.url),
    read: async (candidate: { url: string }): Promise<string> => {
      const relDir = relDirForSchemaUrl(candidate.url)
      if (!relDir) throw new Error(`${candidate.url} is not a schema URL of this catalog`)
      // The join stays inline: Turbopack's tracer reads it as a scoped path and
      // keeps the build from pulling the entire repository into the output.
      return readFile(path.join(catalogDir, ...relDir, SCHEMA_ARTIFACT), 'utf8')
    },
  }

  try {
    const parser = new $RefParser()
    const schema = flatten(
      await parser.bundle(file, {
        resolve: {
          catalog: catalogResolver,
          // Not `http: false`. This closes the fall-through and nothing else:
          // the canonical host is the catalog resolver's alone, and a `$ref` it
          // could not satisfy must fail rather than become a download.
          http: { canRead: (candidate: { url: string }) => !isSchemaUrl(candidate.url) },
        },
      }),
    )

    // Provenance: every document that was pulled in, named the way the catalog
    // names things. Paths arrive as URLs (resolved by the catalog resolver) or
    // as absolute file paths (the root document); both map to a relative path.
    const sources = parser.$refs
      .paths()
      .map((source) => {
        const asUrl = schemaUrlToPath(source)
        if (asUrl) return `${asUrl}/${SCHEMA_ARTIFACT}`
        return path.isAbsolute(source) ? path.relative(catalogDir, source) : source
      })
      .filter((source) => source !== path.relative(catalogDir, file) && !source.startsWith('..'))
      .filter((source, index, all) => all.indexOf(source) === index)
      .sort()

    return { schema, sources, error: null }
  } catch (error) {
    return {
      schema: null,
      sources: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/* --------------------------------------------------------------- flatten */

/**
 * Collapse a bundle's *embedded resources* back into one document.
 *
 * This is not cosmetic. `bundle` inlines each external document **with its own
 * `$id` intact**, and an `$id` below the root re-bases every reference beneath
 * it onto a second identity — which is how one document quietly becomes two.
 * The catalog forbids that in a source file for exactly this reason
 * (`E_DM_ID_FORBIDDEN`, framework/spec/kinds/datamodel.md); the bundler was
 * doing to its own output what the spec forbids its input to do. Two things
 * follow, and both were visible on the page:
 *
 *  1. A pointer that has to cross a re-based boundary cannot be written as `#/…`
 *     any more, so the bundler writes it in full —
 *     `https://schemas.metaframework.dev/…/order#/properties/total`. That is a
 *     *correct* reference and stock validators follow it; it is also an
 *     `external` reference by every viewer's reckoning, and the viewer's tree
 *     builder refuses those outright ("Cannot dereference external references").
 *
 *  2. A pointer that was already local — `#/$defs/line-tax`, private to the
 *     inlined `order-line` — keeps its spelling but no longer means the same
 *     thing to a reader who ignores the nested `$id`: it is read against the
 *     root, where `$defs/line-tax` does not exist. Worse than failing, it can
 *     *hit*: `#/$defs/positive-int` exists in both documents, so that one row
 *     resolved against the wrong document and nobody could have noticed.
 *
 * So every `$ref` is rewritten as a pointer into the one document — a local ref
 * against the resource that contains it, an embedded resource's `$id` against
 * the place it was inlined — and the nested `$id`/`$schema` keywords that made
 * those resources separate are dropped. `x-srn` stays: it is what still says
 * which entity an inlined shape came from once the identity keyword is gone.
 *
 * A `$ref` naming something not in this document is left exactly as written.
 * The resolver above means that cannot normally happen — a foreign `$ref` fails
 * the bundle loudly — and if it ever does, showing the reader the address that
 * was not resolvable beats inventing a pointer for it.
 */
function flatten(bundled: unknown): unknown {
  const resources = new Map<string, string>()
  collectResources(bundled, '', resources)
  rebase(bundled, '', '', resources, new WeakSet())
  return bundled
}

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Keywords whose values are *instance data*, not subschemas. `{"$ref": "…"}`
 * sitting under `const` or `examples` is a value that merely looks like a
 * reference, and `metaframework/…/datamodel/schema-document` — the schema whose
 * subject is schemas — is full of members named `$ref` and `$id`. Nothing below
 * these keywords is walked, so no example is ever rewritten.
 */
const INSTANCE_KEYWORDS = new Set(['const', 'default', 'enum', 'examples'])

/** One JSON Pointer token, escaped per RFC 6901. */
function token(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** Where each `$id` in the document sits, as a JSON Pointer. Root maps to `''`. */
function collectResources(node: unknown, pointer: string, into: Map<string, string>): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectResources(item, `${pointer}/${index}`, into))
    return
  }
  if (!isObject(node)) return
  // First occurrence wins, and the root is reached first — so a document that
  // somehow contains a copy of itself still resolves to the real root.
  if (typeof node.$id === 'string' && !into.has(node.$id)) into.set(node.$id, pointer)
  for (const [key, value] of Object.entries(node)) {
    if (INSTANCE_KEYWORDS.has(key)) continue
    collectResources(value, `${pointer}/${token(key)}`, into)
  }
}

/**
 * Rewrite every `$ref` as a pointer into the root document, and strip the
 * nested `$id`/`$schema` that made subtrees into resources of their own.
 *
 * `resource` is the pointer of the nearest enclosing `$id` — the base a bare
 * `#/…` in this subtree is written against. `seen` guards the one case that
 * would otherwise corrupt a ref: a node reachable twice, whose `$ref` would be
 * rebased twice and come out double-prefixed.
 */
function rebase(
  node: unknown,
  pointer: string,
  resource: string,
  resources: Map<string, string>,
  seen: WeakSet<object>,
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => rebase(item, `${pointer}/${index}`, resource, resources, seen))
    return
  }
  if (!isObject(node) || seen.has(node)) return
  seen.add(node)

  // Read before the keyword is deleted below: this node's own `$id` is the base
  // for everything under it.
  const here = typeof node.$id === 'string' ? pointer : resource

  if (typeof node.$ref === 'string') {
    const hash = node.$ref.indexOf('#')
    const source = hash === -1 ? node.$ref : node.$ref.slice(0, hash)
    const fragment = hash === -1 ? '' : node.$ref.slice(hash + 1)
    const base = source === '' ? here : resources.get(source)
    if (base !== undefined) node.$ref = `#${base}${fragment}`
  }

  // Only below the root: the document keeps its own identity and its dialect.
  if (pointer !== '') {
    delete node.$id
    // A nested `$schema` is only legal on a resource root, which this has just
    // stopped being. The registry pins every document to one dialect, so
    // nothing is lost by dropping it.
    delete node.$schema
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' || INSTANCE_KEYWORDS.has(key)) continue
    rebase(value, `${pointer}/${token(key)}`, here, resources, seen)
  }
}
