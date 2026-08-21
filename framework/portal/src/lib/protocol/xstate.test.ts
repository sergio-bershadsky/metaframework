import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Ajv2020 } from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { createMachine } from 'xstate'
import { CANONICAL_SCHEMA_HOST } from '../schema/url'
import { parseStates, type MachineConfig } from './states'
import { toXStateJson } from './xstate'

/**
 * The two CI conformance proofs for `states.json`.
 *
 * protocol.md claims the file is "a strict, setup-free subset of XState v5
 * `createMachine` config — the file MUST load unchanged". Both halves of that
 * sentence are checked here against the *shipped* catalog rather than a fixture,
 * because a claim about the format is only worth what the real files honour:
 *
 * 1. **Proof of contract** — every `solutions/**\/states.json` is handed to the
 *    real `createMachine()`. "Directly loadable" stops being an assertion in a
 *    document and becomes an enforced fact; the day someone authors a construct
 *    our zod schema happens to admit but XState rejects, this goes red.
 * 2. **Stately conformance** — every file, normalized, validates against
 *    Stately's own published XState JSON Schema (vendored; see `vendor/`). That
 *    is the *downstream* direction: not "XState accepts our config" but "the
 *    industry's description of an XState config accepts ours".
 *
 * Neither proof is allowed to reach the network, and neither may loosen to make
 * a file pass — a failure here is a defect in the file or in the subset, and the
 * normalizer stays a mechanical shorthand expansion.
 */

const CATALOG = path.resolve(process.cwd(), '../../solutions')

const FILES = readdirSync(CATALOG, { recursive: true })
  .map(String)
  .filter((file) => path.basename(file) === 'states.json')
  .sort()

/** The dialect discriminator `states.json` carries, per ADR 0015. */
const STATE_MACHINE_DOCUMENT =
  `${CANONICAL_SCHEMA_HOST}/metaframework/product/specification/datamodel/state-machine-document`

/**
 * The file as a consumer sees it: parsed, with the framework-owned `$schema`
 * removed. ADR 0015 has the loader strip exactly that one key from
 * `Artifact.data` — it is metadata *about* the file, not part of the machine —
 * so both proofs run over the same residue the portal runs over. A `$schema`
 * naming anything else is left in place on purpose: a foreign dialect must fail
 * these proofs rather than be quietly discarded.
 */
function authored(file: string): MachineConfig {
  const config = JSON.parse(readFileSync(path.join(CATALOG, file), 'utf8')) as Record<string, unknown>
  if (config.$schema === STATE_MACHINE_DOCUMENT) delete config.$schema

  // The cast below is only sound while the file is the pinned subset, so the
  // subset validator gets the first word on every file the proofs then use.
  const errors = parseStates(config, { path: file }).diagnostics.filter((d) => d.severity === 'error')
  expect(errors.map((d) => `${d.code} ${d.path} — ${d.message}`)).toEqual([])

  return config as unknown as MachineConfig
}

describe('the catalog is discoverable at all', () => {
  // Without this, a walk that silently matched nothing would leave both proofs
  // below passing vacuously — the classic way a conformance suite goes quiet.
  it('finds states.json files under solutions/', () => {
    expect(FILES.length).toBeGreaterThan(0)
  })
})

describe('proof of contract — createMachine() accepts the file verbatim', () => {
  it.each(FILES)('%s', (file) => {
    const config = authored(file)

    // Construction is the assertion: XState throws on a config it cannot build,
    // and its own message says why far better than a `not.toThrow()` wrapper.
    const machine = createMachine(config)

    // …and that the machine it built is this one, not an empty shell accepted
    // because every key was ignored.
    expect(machine.id).toBe(config.id)
    expect(Object.keys(machine.states)).toEqual(Object.keys(config.states))
  })
})

describe('Stately conformance — the normalized file validates against the published XState schema', () => {
  const schema = JSON.parse(
    readFileSync(path.join(import.meta.dirname, 'vendor', 'xstate.schema.json'), 'utf8'),
  ) as Record<string, unknown>
  // `strict: false` matches the schema registry: this is a third-party document
  // and ajv's strict-mode opinions about it are not ours to enforce.
  const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema)

  it.each(FILES)('%s', (file) => {
    validate(toXStateJson(authored(file)))
    expect((validate.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message}`)).toEqual([])
  })
})

describe('toXStateJson — the shorthand expansions, one by one', () => {
  const machine = (states: Record<string, unknown>): MachineConfig =>
    ({ id: 'm', initial: 'a', states }) as unknown as MachineConfig

  it('expands a bare string target into a one-transition array', () => {
    const json = toXStateJson(machine({ a: { on: { GO: 'b' } }, b: {} }))
    expect(json.states?.a.on?.GO).toEqual([{ target: ['b'] }])
  })

  it('expands a single transition object into an array, and its target into one too', () => {
    const json = toXStateJson(machine({ a: { on: { GO: { target: 'b' } } }, b: {} }))
    expect(json.states?.a.on?.GO).toEqual([{ target: ['b'] }])
  })

  it('keeps a transition list a list, in authored order', () => {
    const on = { GO: [{ target: 'b', guard: 'first' }, { target: 'c' }] }
    const json = toXStateJson(machine({ a: { on }, b: {}, c: {} }))
    expect(json.states?.a.on?.GO).toEqual([{ target: ['b'], guard: { type: 'first' } }, { target: ['c'] }])
  })

  it('carries an internal transition through with no target key at all', () => {
    const json = toXStateJson(machine({ a: { on: { PING: { actions: 'log' } } } }))
    expect(json.states?.a.on?.PING).toEqual([{ actions: [{ type: 'log' }] }])
  })

  it('wraps prose guards and action names as { type }, string or list alike', () => {
    const json = toXStateJson(machine({ a: { entry: 'one', exit: ['two', 'three'] } }))
    expect(json.states?.a.entry).toEqual([{ type: 'one' }])
    expect(json.states?.a.exit).toEqual([{ type: 'two' }, { type: 'three' }])
  })

  it('leaves annotations and structure untouched', () => {
    const json = toXStateJson(
      machine({
        a: { initial: 'a1', states: { a1: { description: 'inner' } }, tags: ['t'] },
        b: { type: 'final' },
      }),
    )
    expect(json.states?.a.initial).toBe('a1')
    expect(json.states?.a.states?.a1.description).toBe('inner')
    expect(json.states?.a.tags).toEqual(['t'])
    expect(json.states?.b.type).toBe('final')
  })

  it('never emits a key XState did not define — the dialect discriminator included', () => {
    const config = { $schema: STATE_MACHINE_DOCUMENT, id: 'm', initial: 'a', states: { a: {} } }
    expect(toXStateJson(config as unknown as MachineConfig)).toEqual({ id: 'm', initial: 'a', states: { a: {} } })
  })
})
