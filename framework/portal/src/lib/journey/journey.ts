import { z } from 'zod'
import { SCHEME, SrnError, formatSrn, parseSrn, resolveRef } from '../srn/srn'
import { assertArtifactRole } from '../srn/artifacts'

/**
 * The journey.yaml mini-spec — framework/spec/kinds/journey.md, "The
 * journey.yaml mini-spec" — as an executable copy.
 *
 * `parseWorkflow` is the precedent and the shape is deliberately the same: a
 * pure function from raw YAML data to a typed model, collecting spec error
 * classes instead of throwing, because loading is fail-soft everywhere in this
 * portal — a journey with one bad step must still draw, with the diagnostic
 * visible, rather than collapsing the page.
 *
 * ```yaml
 * name: place-an-order
 * steps:
 *   - actor: /actor/customer
 *     touches: /product/shop/component/catalogue
 *     note: Browses, filters, lands on a product page.
 *   - actor: /actor/customer
 *     touches: /product/billing/component/ledger
 *     protocol: /protocol/settlement
 * ```
 *
 * What this module checks, and what it deliberately leaves alone. The spec
 * splits its rules at exactly one line — JRN1–JRN9 are checkable from the
 * entity alone, JRN10–JRN15 need the resolved catalog — and this module owns
 * the first group plus the two members of the second that turn out to need only
 * the *grammar*:
 *
 * - **JRN5–JRN8** (schema, `name`, the 2–12 step count, branch-shaped keys) are
 *   the file's own contract.
 * - **JRN13** (`W_JRN_ACTOR_ABSENT`) needs the protagonist, which the caller
 *   passes; comparing two resolved SRNs needs no catalog.
 * - **JRN14** (`W_JRN_UNDOCUMENTED_INTEGRATION`) needs each `touches` target's
 *   *owning product*, and the SRN grammar already carries it: the owning
 *   product is the `product/{name}` pair at the head of the pair chain
 *   ([srn.md](../srn.md)). That is why the check the kind exists for is
 *   computed here rather than after the graph is built — and why the drawing
 *   can band the walk by product.
 * - **JRN10–JRN12 and JRN15** are left to the loader: whether a reference
 *   resolves to an entity, and of which kind, is a question about the catalog.
 */

/* ------------------------------------------------------------------ model */

/**
 * How many steps a journey may carry — 2 to 12 inclusive, both bounds errors
 * (kinds/journey.md, "The step cap"). One step is a touch, not a path; past
 * twelve the ladder stops fitting one screen and stops being comparable with
 * the journey beside it.
 */
export const MIN_JOURNEY_STEPS = 2
export const MAX_JOURNEY_STEPS = 12

/** Step keys that mean somebody tried to branch. Their own error class. */
const BRANCH_KEYS = ['alt', 'opt', 'loop', 'when', 'otherwise', 'branches', 'parallel'] as const

/** The documented negative: the actor carries the hop, nothing automates it. */
export const PROTOCOL_NONE = 'none'

export interface JourneyStep {
  /** Positional key, `steps[3]`, 0-based — the file's own convention. */
  path: string
  /** 1-based position, as the drawing and the ladder number it. */
  ordinal: number
  /** The actor reference exactly as authored. */
  actor: string
  /** Absolute unversioned SRN, when `journeySrn` was given and resolution won. */
  actorSrn?: string
  /** `customer` — the tail of the reference, for a label with no room. */
  actorLabel: string
  /** The touched entity's reference exactly as authored. */
  touches: string
  touchesSrn?: string
  touchesLabel: string
  /** The protocol reference, absent when the step names none. */
  protocol?: string
  protocolSrn?: string
  protocolLabel?: string
  /** The step wrote `protocol: none` — a claim, not an omission. */
  protocolNone: boolean
  note?: string
  /** `product/shop`, from the touched SRN's pair chain. Null when unknowable. */
  owningProduct: string | null
  /** This step's owning product differs from the previous step's. */
  crossing: boolean
  /** This step's actor differs from the previous step's. */
  handoff: boolean
}

export interface Journey {
  /** `name` as authored — the file's claim about which entity it belongs to. */
  name: string
  /** The journey entity's SRN, when the caller supplied it. */
  srn?: string
  steps: JourneyStep[]
  /** Distinct actor references, in first-appearance order — the walk's cast. */
  actors: string[]
  /** Product boundaries crossed, and how many of those name no protocol. */
  crossings: { total: number; undocumented: number }
}

export type JourneyIssueSeverity = 'error' | 'warning'

export interface JourneyIssue {
  /** Spec error class, e.g. `E_JRN_STEP_COUNT`. */
  code: string
  severity: JourneyIssueSeverity
  message: string
  /** Positional step path, or a top-level field name. */
  path: string
}

/* ----------------------------------------------------------------- schema */

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

const ref = z.string().min(1).max(240)

const stepSchema = z
  .object({
    actor: ref,
    touches: ref,
    protocol: ref.optional(),
    note: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => !value.includes('\n'), 'note must be a single line')
      .optional(),
  })
  .catchall(z.unknown())

const fileSchema = z
  .object({
    name: z.string().regex(KEBAB, 'must be kebab-case').max(64),
    steps: z.array(z.unknown()),
  })
  .catchall(z.unknown())

/**
 * `$schema` is the dialect header of ADR 0015, admitted at the top level only.
 * The loader strips it before this parser runs, so nothing in the catalog
 * depends on the admission; it is here so a caller holding raw file bytes reads
 * the legacy dialect instead of raising `E_JRN_SCHEMA` on a header the spec told
 * the author to write. A step is not an artifact root and gains nothing.
 */
const KNOWN_FILE_KEYS = ['$schema', 'name', 'steps']
const KNOWN_STEP_KEYS = ['actor', 'touches', 'protocol', 'note']

function zodMessage(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ')
}

/** `srn://acme/actor/customer@2` → `customer@2`; `/actor/customer` → `customer`. */
function refTail(reference: string): string {
  const body = reference.startsWith(SCHEME) ? reference.slice(SCHEME.length) : reference
  const slash = body.lastIndexOf('/')
  return slash === -1 ? body : body.slice(slash + 1)
}

/**
 * The `product/{name}` pair at the head of an SRN's pair chain.
 *
 * Every legal `touches` target has exactly one owning product, because a
 * `component` bucket may not sit at solution level — so a component's chain
 * always begins with a product. A reference that does not (a malformed one, or
 * a target the loader will reject on kind) yields null, and a null never
 * *equals* another null here: two unknowable owners are not evidence of no
 * crossing.
 */
export function owningProductOf(srn: string): string | null {
  try {
    const head = parseSrn(srn).path[0]
    return head?.kind === 'product' ? `product/${head.name}` : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ parse */

export interface ParseJourneyOptions {
  /** The entity's directory name; `name` must equal it (JRN6). */
  entityName?: string
  /** The journey entity's SRN — enables reference resolution. */
  journeySrn?: string
  /** The frontmatter protagonist, for JRN13. Resolved like any step actor. */
  protagonist?: string
}

export interface ParseJourneyResult {
  /** Null only when the file shape is unusable; otherwise best-effort. */
  journey: Journey | null
  issues: JourneyIssue[]
}

export function parseJourney(data: unknown, options: ParseJourneyOptions = {}): ParseJourneyResult {
  const issues: JourneyIssue[] = []
  const error = (code: string, path: string, message: string) =>
    issues.push({ code, severity: 'error', message, path })
  const warn = (code: string, path: string, message: string) =>
    issues.push({ code, severity: 'warning', message, path })

  const file = fileSchema.safeParse(data)
  if (!file.success) {
    error('E_JRN_SCHEMA', '', zodMessage(file.error))
    return { journey: null, issues }
  }

  for (const key of unknownKeys(file.data, KNOWN_FILE_KEYS)) {
    error('E_JRN_SCHEMA', key, `unknown top-level key "${key}" (prefix it x- to keep it)`)
  }

  if (options.entityName !== undefined && file.data.name !== options.entityName) {
    error(
      'E_JRN_NAME',
      'name',
      `name "${file.data.name}" must equal the entity's directory name "${options.entityName}"`,
    )
  }

  // Both bounds are errors by decision, not oversight: a cap that only warns is
  // a cap every catalog eventually ignores, and diagram tractability is an
  // acceptance criterion of this kind. Surplus steps are still parsed and drawn
  // — hiding them would hide the reason for the complaint.
  if (file.data.steps.length < MIN_JOURNEY_STEPS || file.data.steps.length > MAX_JOURNEY_STEPS) {
    error(
      'E_JRN_STEP_COUNT',
      'steps',
      `a journey has between ${MIN_JOURNEY_STEPS} and ${MAX_JOURNEY_STEPS} steps; this one has ${file.data.steps.length}. ` +
        'A path that needs more is more than one journey.',
    )
  }

  /**
   * An SRN reference as its canonical unversioned SRN, or undefined.
   *
   * `fence` is JRN16's class for this surface. A step field means an entity and
   * an artifact has no kind, so a suffix is always refused — but under which
   * code depends on the suffix: illegal vocabulary for the addressed kind fails
   * first as `E_SRN_ARTIFACT` (an actor owns no roles at all), while a legal
   * role on the wrong kind survives the role table and is caught here.
   */
  const resolve = (reference: string, path: string, fence: string): string | undefined => {
    if (!options.journeySrn) return undefined
    try {
      const srn = parseSrn(resolveRef(options.journeySrn, reference))
      if (srn.artifact !== null) {
        assertArtifactRole(srn.kind, srn.artifact, reference)
        error(fence, path, `"${reference}" addresses the "${srn.artifact}" artifact of an entity, and a step names entities`)
        return undefined
      }
      return formatSrn({ ...srn, version: null })
    } catch (cause) {
      error(
        cause instanceof SrnError ? cause.code : 'E_SRN_SYNTAX',
        path,
        `"${reference}" is not a usable reference — ${cause instanceof Error ? cause.message : String(cause)}`,
      )
      return undefined
    }
  }

  const steps: JourneyStep[] = []
  file.data.steps.forEach((node, index) => {
    const path = `steps[${index}]`
    const parsed = stepSchema.safeParse(node)
    if (!parsed.success) {
      error('E_JRN_SCHEMA', path, zodMessage(parsed.error))
      return
    }

    const extra = unknownKeys(parsed.data, KNOWN_STEP_KEYS)
    const branchy = extra.filter((key) => (BRANCH_KEYS as readonly string[]).includes(key))
    // A branch-shaped key gets its own class because the code is the lesson.
    for (const key of branchy) {
      error('E_JRN_BRANCH', `${path}.${key}`, `"${key}" branches — and a journey that branches is two journeys`)
    }
    for (const key of extra.filter((key) => !branchy.includes(key))) {
      error('E_JRN_SCHEMA', `${path}.${key}`, `unknown step key "${key}" (prefix it x- to keep it)`)
    }

    const raw = parsed.data
    const previous = steps[steps.length - 1]
    const touchesSrn = resolve(raw.touches, `${path}.touches`, 'E_JRN_TOUCHES_KIND')
    const owningProduct = touchesSrn ? owningProductOf(touchesSrn) : null
    const protocolNone = raw.protocol === PROTOCOL_NONE

    steps.push({
      path,
      ordinal: steps.length + 1,
      actor: raw.actor,
      actorSrn: resolve(raw.actor, `${path}.actor`, 'E_JRN_ACTOR_KIND'),
      actorLabel: refTail(raw.actor),
      touches: raw.touches,
      touchesSrn,
      touchesLabel: refTail(raw.touches),
      ...(raw.protocol && !protocolNone
        ? {
            protocol: raw.protocol,
            protocolSrn: resolve(raw.protocol, `${path}.protocol`, 'E_JRN_PROTOCOL_KIND'),
            protocolLabel: refTail(raw.protocol),
          }
        : {}),
      protocolNone,
      ...(raw.note ? { note: raw.note } : {}),
      owningProduct,
      // Two unknown owners are not evidence of a shared one, and step 0 has no
      // predecessor and is never a crossing.
      crossing: Boolean(previous && owningProduct && previous.owningProduct && owningProduct !== previous.owningProduct),
      handoff: Boolean(previous && raw.actor !== previous.actor),
    })
  })

  // JRN14 — the check the kind exists for. A hop that leaves one product and
  // arrives in another, with nothing in the catalog saying how.
  let undocumented = 0
  for (const step of steps) {
    if (!step.crossing) continue
    if (step.protocol || step.protocolNone) continue
    undocumented++
    warn(
      'W_JRN_UNDOCUMENTED_INTEGRATION',
      step.path,
      `crosses from ${steps[step.ordinal - 2].owningProduct} into ${step.owningProduct} and names no protocol — ` +
        'write the protocol, or say "protocol: none" if the actor carries the hop',
    )
  }

  // JRN13 — the protagonist takes none of the steps, so the entity claims to be
  // one actor's path while describing someone else's.
  if (options.protagonist !== undefined && steps.length > 0) {
    const protagonist = options.journeySrn
      ? (() => {
          try {
            return formatSrn({ ...parseSrn(resolveRef(options.journeySrn, options.protagonist)), version: null })
          } catch {
            return null
          }
        })()
      : null
    const walked = protagonist
      ? steps.some((step) => step.actorSrn === protagonist)
      : steps.some((step) => step.actor === options.protagonist)
    if (!walked) {
      warn(
        'W_JRN_ACTOR_ABSENT',
        'steps',
        `the protagonist "${options.protagonist}" takes none of the steps`,
      )
    }
  }

  const actors = [...new Set(steps.map((step) => step.actor))]
  const crossings = { total: steps.filter((step) => step.crossing).length, undocumented }

  return { journey: { name: file.data.name, srn: options.journeySrn, steps, actors, crossings }, issues }
}

function unknownKeys(value: Record<string, unknown>, known: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !known.includes(key) && !key.startsWith('x-'))
}

/* ---------------------------------------------------------------- summary */

export interface JourneySummary {
  headline: string
  /** One sentence per step, in order — the drawing said in words. */
  steps: string[]
}

/**
 * The journey as prose, for the figure's caption.
 *
 * The drawing is `aria-hidden` (it duplicates the ladder beneath it, which
 * carries the real links), so this is what a screen reader actually hears.
 */
export function journeySummary(journey: Journey): JourneySummary {
  const cast = journey.actors.map(refTail)
  const crossed =
    journey.crossings.total === 0
      ? 'It stays inside one product.'
      : `It crosses ${journey.crossings.total} product boundar${journey.crossings.total === 1 ? 'y' : 'ies'}` +
        (journey.crossings.undocumented > 0 ? `, ${journey.crossings.undocumented} of them undocumented.` : '.')

  const headline =
    journey.steps.length === 0
      ? 'This journey has no steps.'
      : `${journey.steps.length} step${journey.steps.length === 1 ? '' : 's'}, walked by ${listed(cast)}. ${crossed}`

  return {
    headline,
    steps: journey.steps.map((step) => {
      const via = step.protocolLabel
        ? ` via ${step.protocolLabel}`
        : step.protocolNone
          ? ' carried by the actor'
          : ''
      const note = step.note ? ` — ${step.note}` : ''
      return `${step.ordinal}. ${step.actorLabel} at ${step.touchesLabel}${via}${note}`
    }),
  }
}

function listed(values: string[]): string {
  if (values.length === 0) return 'nobody'
  if (values.length === 1) return values[0]
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}
