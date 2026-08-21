import { z } from 'zod'
import { META_SCHEMA_SRN, metaSchemaUrl } from '../schema/url'
import { EVENT_NAME, KEBAB, machineSchema } from './states'

/**
 * The framework meta-schema for `states.json`, generated from the validator that
 * actually judges the file.
 *
 * ADR 0015 makes a `states.json` name its dialect by URL, and that URL has to
 * dereference to a schema which accepts the document — otherwise the header a
 * catalog was told to add turns every file red in the first editor that follows
 * it. Stately's published `xstate.json` was disqualified on exactly that (it
 * validates the *normalized* surface and its `additionalProperties: false`
 * forbids the `$schema` key that would point at it), so the framework publishes
 * its own.
 *
 * **Generated, not written.** `machineSchema` is the authority — it is what
 * `parseStates` runs and therefore what a catalog is actually held to. A
 * hand-written meta-schema beside it is a second statement of one contract, and
 * the two would drift the first time the subset moved. Everything below is the
 * zod emission plus an overlay of the rules JSON Schema can express and zod
 * cannot; the overlay reads {@link KEBAB} and {@link EVENT_NAME} out of the
 * validator rather than restating the patterns.
 *
 * What the schema still does not decide, and no schema could: that `initial`
 * names a key of its own `states`, that a transition target resolves, that a
 * state is reachable, that the machine `id` equals the protocol name. Those are
 * `parseStates`'s (`E_PROTO_STATES_TARGET`, `E_PROTO_STATES_ID`,
 * `W_PROTO_STATES_UNREACHABLE`) and are stated in
 * `framework/spec/kinds/protocol.md`.
 */

/** The meta-schema entity's name; its canonical URL is the discriminator value. */
export const STATE_MACHINE_DOCUMENT = 'state-machine-document'

/** `$id` — the URL a `states.json` carries in `$schema`. No `@version`, ever. */
export const STATE_MACHINE_DOCUMENT_URL = metaSchemaUrl(STATE_MACHINE_DOCUMENT)

/** `x-srn` — the same identity in the framework's own vocabulary. */
export const STATE_MACHINE_DOCUMENT_SRN = `${META_SCHEMA_SRN}/${STATE_MACHINE_DOCUMENT}`

const DESCRIPTION =
  'states.json — an XState v5 machine configuration describing the state of one conversation as the ' +
  'protocol sees it, never the internal state of any single participant. Pinned to a subset that ' +
  'createMachine() accepts verbatim, plus the dialect header of ADR 0015, which is not part of the ' +
  'configuration and is removed before the residue is handed to XState. Generated from the zod ' +
  'validator in framework/portal/src/lib/protocol/states.ts; the reference rules a schema cannot ' +
  'express — initial resolves, targets resolve, states are reachable, id equals the protocol name — ' +
  'are checked there and specified in framework/spec/kinds/protocol.md.'

/** The one recursive definition zod emits, renamed to what the spec calls it. */
const STATE_DEF = 'state'

type Node = Record<string, unknown>

function at(root: Node, path: readonly string[]): Node {
  let node: unknown = root
  for (const key of path) {
    if (node === null || typeof node !== 'object') {
      throw new Error(`generated schema has no node at ${path.join('.')}`)
    }
    node = (node as Node)[key]
  }
  if (node === null || typeof node !== 'object') {
    throw new Error(`generated schema has no node at ${path.join('.')}`)
  }
  return node as Node
}

/**
 * Build the published document.
 *
 * The rename is not cosmetic: zod names an anonymous recursive definition
 * `__schema0`, and this schema is read by people and served at a stable URL. It
 * is done by locating the single emitted `$defs` key rather than by matching
 * that literal, so a zod release that renames it fails the golden-file test with
 * a legible diff instead of silently leaving the old name in the `$ref`s.
 */
export function buildStateMachineDocumentSchema(): Record<string, unknown> {
  const emitted = z.toJSONSchema(machineSchema, { target: 'draft-2020-12' }) as Node

  const defs = emitted.$defs as Node | undefined
  const names = Object.keys(defs ?? {})
  if (names.length !== 1) {
    throw new Error(`expected one generated $def, got ${names.length ? names.join(', ') : 'none'}`)
  }

  const renamed = JSON.parse(
    JSON.stringify(emitted).split(`#/$defs/${names[0]}`).join(`#/$defs/${STATE_DEF}`),
  ) as Node
  renamed.$defs = { [STATE_DEF]: (renamed.$defs as Node)[names[0]] }

  // The overlay: what the subset requires and zod does not carry. Each target is
  // resolved rather than assumed, so a change in the emission shape is an error
  // here and not a rule quietly dropped from the published schema.
  const state = at(renamed, ['$defs', STATE_DEF])
  at(renamed, ['properties', 'states', 'propertyNames']).pattern = KEBAB.source
  at(state, ['properties', 'states', 'propertyNames']).pattern = KEBAB.source
  at(state, ['properties', 'on', 'propertyNames']).pattern = EVENT_NAME.source
  // A compound state must say where it begins. zod expresses this in `flatten`,
  // as `E_PROTO_STATES_SUBSET`; JSON Schema has a keyword for it.
  state.dependentRequired = { states: ['initial'] }

  const { $schema, ...body } = renamed
  return {
    $schema,
    $id: STATE_MACHINE_DOCUMENT_URL,
    'x-srn': STATE_MACHINE_DOCUMENT_SRN,
    title: 'State machine document',
    description: DESCRIPTION,
    ...body,
  }
}

/** The document as it is checked in — one trailing newline, two-space indent. */
export function serializeStateMachineDocumentSchema(): string {
  return `${JSON.stringify(buildStateMachineDocumentSchema(), null, 2)}\n`
}
