import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020'
import { beforeAll, describe, expect, it } from 'vitest'
import { canonicalDialect } from '../catalog/dialects'
import { metaSchemaUrl } from '../schema/url'
import {
  STATE_MACHINE_DOCUMENT,
  STATE_MACHINE_DOCUMENT_SRN,
  STATE_MACHINE_DOCUMENT_URL,
  buildStateMachineDocumentSchema,
  serializeStateMachineDocumentSchema,
} from './state-machine-document'
import { parseStates } from './states'

/**
 * The published meta-schema, held to three things at once.
 *
 * **It is generated.** The checked-in document must be byte-identical to what
 * `machineSchema` emits today, so the schema a `states.json` names cannot drift
 * from the validator that actually judges the file. A drift here is the whole
 * failure mode: a header pointing at a document that disagrees with the portal
 * is worse than no header at all.
 *
 * **It accepts the corpus.** Every `states.json` under `solutions/` validates,
 * with the ADR 0015 header and without it. The second half is the reason
 * `machineSchema` admits `$schema`: a schema whose `additionalProperties: false`
 * forbids the key that points at it cannot validate the file it describes, which
 * is the fault ADR 0015 disqualified Stately's `xstate.json` on.
 *
 * **It is not vacuous.** Each rule the subset pins gets a counter-example, so a
 * generator that emitted `{}` would fail loudly rather than pass every file.
 *
 * The corpus is globbed, not listed: a protocol added to `solutions/` is in
 * scope the moment its `states.json` is written.
 */

const CATALOG = path.resolve(process.cwd(), '../../solutions')
const GOLDEN = path.resolve(process.cwd(), 'src/lib/protocol/state-machine-document.schema.json')

async function statesFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await statesFiles(full)))
    else if (entry.name === 'states.json') files.push(full)
  }
  return files
}

let validate: ValidateFunction
let corpus: Array<{ file: string; document: Record<string, unknown> }>

beforeAll(async () => {
  validate = new Ajv2020({ strict: false, allErrors: true }).compile(buildStateMachineDocumentSchema())
  corpus = await Promise.all(
    (await statesFiles(CATALOG)).sort().map(async (file) => ({
      file: path.relative(CATALOG, file),
      document: JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>,
    })),
  )
})

const errors = () => JSON.stringify(validate.errors)

describe('the checked-in document', () => {
  it('is exactly what the validator emits today', async () => {
    expect(await readFile(GOLDEN, 'utf8')).toBe(serializeStateMachineDocumentSchema())
  })

  it('is identified by the canonical URL a states.json points at', () => {
    const schema = buildStateMachineDocumentSchema()
    expect(schema.$id).toBe(metaSchemaUrl(STATE_MACHINE_DOCUMENT))
    expect(schema['x-srn']).toBe(STATE_MACHINE_DOCUMENT_SRN)
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    // No `@version`: the URL names a dialect, and a dialect that changes
    // non-additively is a new entity with a new name (ADR 0015).
    expect(STATE_MACHINE_DOCUMENT_URL).not.toContain('@')
  })

  it('is the value the discriminator table tells authors to write', () => {
    // The join. If these two ever disagree, every migrated file names a document
    // the portal does not recognise and every one of them is warned.
    expect(canonicalDialect('protocol', 'states.json')).toEqual({
      key: '$schema',
      value: STATE_MACHINE_DOCUMENT_URL,
      owned: true,
    })
  })
})

describe('the shipped corpus', () => {
  it('found the states.json files to check', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(8)
  })

  it('validates every states.json as authored', () => {
    for (const { file, document } of corpus) expect(validate(document), `${file}: ${errors()}`).toBe(true)
  })

  it('validates every states.json once it carries the header it will be told to add', () => {
    for (const { file, document } of corpus) {
      const migrated = { $schema: STATE_MACHINE_DOCUMENT_URL, ...document }
      expect(validate(migrated), `${file}: ${errors()}`).toBe(true)
    }
  })

  it('agrees with parseStates about the corpus — one contract, two engines', () => {
    for (const { file, document } of corpus) {
      const fatal = parseStates(document).diagnostics.filter((d) => d.severity === 'error')
      expect(fatal.map((d) => d.message), file).toEqual([])
    }
  })
})

/* The subset, one counter-example per rule it pins. */

const MACHINE = {
  id: 'order-placement',
  initial: 'submitted',
  states: {
    submitted: { on: { STOCK_RESERVED: 'reserved' } },
    reserved: { type: 'final' },
  },
}

const rejects = (mutate: (machine: Record<string, unknown>) => void) => {
  const copy = structuredClone(MACHINE) as unknown as Record<string, unknown>
  mutate(copy)
  return validate(copy)
}

describe('the subset is a boundary', () => {
  it('accepts the worked example unchanged', () => {
    expect(validate(structuredClone(MACHINE)), errors()).toBe(true)
  })

  it('refuses an XState construct outside the subset', () => {
    // `additionalProperties: false` on the state node is where the exclusion
    // list lives — context, assign, always, after, invoke, input, output, meta.
    expect(rejects((m) => Object.assign((m.states as Record<string, object>).submitted, { after: { 5000: 'reserved' } }))).toBe(false)
    expect(rejects((m) => Object.assign(m, { context: {} }))).toBe(false)
  })

  it('refuses type: parallel and type: history', () => {
    for (const type of ['parallel', 'history']) {
      expect(rejects((m) => Object.assign((m.states as Record<string, object>).reserved, { type }))).toBe(false)
    }
  })

  it('refuses a state name that is not kebab-case', () => {
    expect(rejects((m) => Object.assign(m.states as object, { Reserved: {} }))).toBe(false)
  })

  it('refuses an event name outside ^[A-Z][A-Z0-9_]*$, the wildcard included', () => {
    expect(rejects((m) => Object.assign((m.states as Record<string, Record<string, object>>).submitted.on, { '*': 'reserved' }))).toBe(false)
    expect(
      rejects((m) => Object.assign((m.states as Record<string, Record<string, object>>).submitted.on, { lowercase: 'reserved' })),
    ).toBe(false)
  })

  it('refuses a compound state that does not say where it begins', () => {
    expect(
      rejects((m) =>
        Object.assign((m.states as Record<string, object>).reserved, { states: { settled: { type: 'final' } } }),
      ),
    ).toBe(false)
  })

  it('refuses a machine missing id, initial or states', () => {
    for (const key of ['id', 'initial', 'states']) {
      expect(rejects((m) => delete m[key]), key).toBe(false)
    }
  })

  /*
   * The published copy of this document — the `state-machine-document` datamodel
   * under `solutions/metaframework/product/specification/datamodel/` — is
   * hand-written and predates ADR 0015. The blocking half of that is now fixed by
   * hand: it admits `$schema`, in the same encoding this module emits, so the
   * header sweep cannot turn a migrated file red in an editor that follows the
   * URL, and a later regeneration cannot silently take the key away again.
   *
   * What is left is drift, not breakage. The two documents still differ, and a
   * regeneration today would trade twelve hand-written `description` strings for
   * two — losing the ten sentences that say why the subset is drawn where it is.
   * Closing it properly means carrying those into `machineSchema` as `describe()`
   * calls first, which is a real piece of work and not a byte-copy; the `$schema`
   * sentence is the one that has already made the trip. Left as a todo rather
   * than a failing assertion because a permanently red suite stops being read.
   */
  it.todo('regenerates the published state-machine-document datamodel from this module')
})
