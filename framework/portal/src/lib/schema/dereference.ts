import path from 'node:path'
import $RefParser from '@apidevtools/json-schema-ref-parser'
import type { Entity } from '../catalog/types'

/**
 * Resolve a datamodel's schema into a single self-contained document.
 *
 * This is a direct dividend of making `$ref` standards-generic: because refs are
 * ordinary relative file paths, a stock resolver walks them off disk with no
 * custom loader. `bundle` (rather than `dereference`) keeps shared and recursive
 * shapes as internal `#/` pointers, so a self-referential model cannot expand
 * forever.
 */
export interface BundledSchema {
  schema: unknown
  /** Catalog-relative paths of every external file pulled in, for provenance. */
  sources: string[]
  error: string | null
}

export async function bundleSchema(entity: Entity, catalogDir: string): Promise<BundledSchema> {
  const file = path.join(entity.dir, 'schema.json')
  try {
    const parser = new $RefParser()
    const schema = await parser.bundle(file)
    const sources = parser.$refs
      .paths('file')
      .filter((source) => source !== file)
      .map((source) => path.relative(catalogDir, source))
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
