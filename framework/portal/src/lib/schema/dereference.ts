import { readFile } from 'node:fs/promises'
import path from 'node:path'
import $RefParser from '@apidevtools/json-schema-ref-parser'
import type { Entity } from '../catalog/types'
import { SCHEMA_ARTIFACT } from './registry'
import { isSchemaUrl, schemaUrlToPath, schemaUrlToSrn } from './url'

/**
 * Resolve a datamodel's schema into a single self-contained document.
 *
 * Every cross-entity `$ref` is now an absolute HTTP URL, which the parser would
 * happily go and *fetch*. It must not. Rendering an entity page would then
 * depend on the portal being able to reach itself over the network — a
 * self-request during SSR, one that deadlocks on a single-threaded dev server
 * and fails outright at build time when nothing is listening.
 *
 * So the URLs are resolved the only correct way for a process that already
 * holds the catalog: a resolver ordered ahead of the built-in HTTP one
 * recognises a schema URL, maps it back through SRN ≡ path ≡ URL path, and
 * reads the file off disk. The document a consumer *outside* this process gets
 * by dereferencing those URLs is byte-identical — same bytes, same route, one
 * fewer round trip.
 *
 * `bundle` (rather than `dereference`) keeps shared and recursive shapes as
 * internal `#/` pointers, so a self-referential model cannot expand forever.
 */
export interface BundledSchema {
  schema: unknown
  /** Catalog-relative paths of every external file pulled in, for provenance. */
  sources: string[]
  error: string | null
}

/**
 * The catalog-relative directory a schema URL addresses. Containment is
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
   * A resolver in json-schema-ref-parser's plugin shape. `order: 1` puts it
   * ahead of the bundled `http` resolver, and `canRead` claims only URLs this
   * portal serves — anything else still falls through to the defaults, so a
   * genuinely foreign `$ref` fails loudly instead of being silently mis-read.
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
    const schema = await parser.bundle(file, { resolve: { catalog: catalogResolver } })

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
