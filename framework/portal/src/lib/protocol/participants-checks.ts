import { assertArtifactRole } from '../srn/artifacts'
import { SrnError, formatSrn, parseSrn, resolveRef } from '../srn/srn'
import type { EdgeType, EntityKind } from '../catalog/frontmatter'
import type { Catalog, Diagnostic, Entity } from '../catalog/types'

/**
 * The `participants` list of a protocol, judged — `framework/spec/kinds/protocol.md`,
 * "Frontmatter additions" and "Participants vs. `exposes`/`uses`".
 *
 * Five classes, one module, because they are one surface: the list must be there
 * and have two parties in it (`E_PROTO_PARTICIPANTS`), its aliases must be
 * distinct (`E_PROTO_ALIAS_DUP`), every `ref` must name an entity of a kind that
 * can hold a conversation (`E_PROTO_PARTICIPANT_KIND`), and the list must agree
 * with the `exposes`/`uses` edges pointing the other way
 * (`W_PROTO_PARTICIPANT_UNLINKED`, `W_PROTO_PARTICIPANT_MISSING`). Every one of
 * them is answerable from the resolved catalog and nothing else — no artifact
 * parser, no directory listing, no schema registry — so this is a pure function
 * of {@link Catalog} and composes exactly where the other kind disciplines do.
 *
 * ## Why the list was read three times and judged none
 *
 * `lib/structure` resolves it to compute a protocol's nearest common ancestor,
 * `lib/actor` reads it to answer "does any conversation name this actor", and
 * `lib/journey/artifacts` reads it to decide whether a step's protocol documents
 * that hop. All three skip a participant they cannot use and say so in a comment
 * — correctly, because none of them owns the surface. This module owns it, which
 * is why it is the one place that reports a reference the others walk past.
 *
 * ## `E_PROTO_PARTICIPANTS` needed the schema relaxed before it could be raised
 *
 * The rule "at least two entries" was always enforced — by
 * `KIND_FRONTMATTER.protocol`'s `.min(2)` — and everything a kind schema rejects
 * is reported as `E_FM_SCHEMA`, so the class the spec names for it could never
 * appear. That is the manoeuvre `metric` established and `lib/adr/adr.ts`
 * repeated: relax the schema, then raise the class from the kind check. The
 * schema now declares `participants` optional and un-`min`'d and this module owns
 * both halves of the rule, so the defect is reported **once**, under the class
 * the spec gives it.
 *
 * The half-step is deliberate and is `deciders`': the *shape* stays in the
 * schema. A `participants` that is a string, an entry that is not a mapping, an
 * `alias` that is not kebab-case — all still `E_FM_SCHEMA`, because this class
 * means "there is no conversation here", not "that field is mistyped". Hence the
 * silence on a non-array below: reporting a shape error under a cardinality class
 * would put the code and the message in disagreement.
 *
 * ## `E_SRN_*` on the way is emitted, not swallowed
 *
 * A participant `ref` is a reference surface, and this framework treats one the
 * same way everywhere (`primaryActorDiagnostics`, `lib/environment`): a reference
 * that resolves to nothing is `E_SRN_DANGLING` and a reference that will not
 * parse carries its own `E_SRN_*` class. Neither is a kind mismatch and neither
 * may be reported as one — but both are certainly findings, and until this module
 * existed a `ref` naming a component that does not exist was silent in every one
 * of the three readers above. The artifact fence is written in the order srn.md
 * states it: V5 is static and precedes the surface class, so an illegal suffix
 * (`.spec`, or any suffix on an actor, which owns no roles) fails first as
 * `E_SRN_ARTIFACT`, and only a *legal* one — `….transport` on a protocol —
 * reaches `E_PROTO_PARTICIPANT_KIND` with the suffix named as the problem.
 *
 * ## Three silences, each of which a looser reading would turn into invention
 *
 * 1. **Anything the kind schema already rejects**, as above.
 * 2. **The two joins, when `participants` is absent or is not a list.** With no
 *    list there is nothing for a back-edge to be missing *from*, and reporting
 *    one `W_PROTO_PARTICIPANT_MISSING` per edge would bury the error that
 *    actually needs fixing under a pile of warnings restating it. A list that
 *    merely reads short is a list, and is joined: `E_PROTO_PARTICIPANTS` and a
 *    missing counterpart are two different defects of one document.
 * 3. **Actors, in both directions.** protocol.md exempts them in as many words:
 *    an actor is a persona or an external system rather than a catalogued
 *    implementation, and requiring one to declare `uses` for every protocol it
 *    touches is bookkeeping with no reader. So an actor participant never wants a
 *    back-edge, and — because `W_ACTOR_PARTICIPATION_EDGE` is the class for an
 *    actor that authored one anyway — nothing here reports it either.
 *
 * Both joins read `catalog.inbound`, which is the same index the portal's
 * participant graph is drawn from and holds only edges that resolved and were
 * legal for their type. An `exposes` that dangles is therefore not a back-edge
 * here — it is `E_SRN_DANGLING` on the component that authored it, which is where
 * the defect is.
 */

/** The kinds that can hold a conversation (kinds/protocol.md, participant `ref`). */
const PARTICIPANT_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['component', 'product', 'actor'])

/** The two edges a component or product points at a protocol with (frontmatter.md). */
const BACK_EDGES: ReadonlySet<EdgeType> = new Set<EdgeType>(['exposes', 'uses'])

/** The kinds that may author one. A `uses` from an actor is the actor kind's own class. */
const EDGE_SOURCE_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['component', 'product'])

/** One participant entry whose `ref` named an entity of a legal kind. */
interface ResolvedParticipant {
  index: number
  ref: string
  srn: string
  kind: EntityKind
}

/**
 * Every participants finding in the catalog, protocol by protocol.
 *
 * The single entry point: wire this into the kind disciplines and all five
 * classes arrive together.
 */
export function participantDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'protocol') continue
    diagnostics.push(...protocolParticipants(catalog, entity))
  }
  return diagnostics
}

function protocolParticipants(catalog: Catalog, protocol: Entity): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const at = (code: string, severity: 'error' | 'warning', message: string) =>
    diagnostics.push({ code, severity, message, path: `${protocol.relDir}/index.md`, srn: protocol.srn })

  const declared = (protocol.frontmatter as Record<string, unknown>).participants

  if (declared === undefined || declared === null) {
    at(
      'E_PROTO_PARTICIPANTS',
      'error',
      'participants is absent — a protocol is a conversation between named parties, and the list is what names them',
    )
    return diagnostics
  }
  // A `participants:` that is not a list is a shape error and stays E_FM_SCHEMA's.
  if (!Array.isArray(declared)) return diagnostics

  if (declared.length < 2) {
    at(
      'E_PROTO_PARTICIPANTS',
      'error',
      `participants lists ${declared.length === 0 ? 'no entries' : '1 entry'} — a protocol needs at least two, or there is no conversation to describe`,
    )
  }

  aliasDuplicates(declared, at)
  const resolved = resolveParticipants(catalog, protocol, declared, at)
  crossCheckEdges(catalog, protocol, resolved, at)

  return diagnostics
}

type Report = (code: string, severity: 'error' | 'warning', message: string) => void

/* ------------------------------------------------------------ alias uniqueness */

/**
 * `E_PROTO_ALIAS_DUP` — one alias, two lifelines.
 *
 * Compared as authored, never case-folded: `Checkout` is already `E_FM_SCHEMA`
 * (an alias is kebab-case), and protocol.md's own counter-example says the pair
 * collides "once lowercased" — i.e. after the author fixes the first defect, not
 * instead of it. Folding here would report the same document twice under two
 * codes for one mistake.
 *
 * One finding per repeat rather than per alias, and it names the entry it
 * collides with: the defect is the later entry, and the reader has to see both to
 * know which one to rename.
 */
function aliasDuplicates(declared: readonly unknown[], at: Report): void {
  const first = new Map<string, number>()
  declared.forEach((entry, index) => {
    const alias = field(entry, 'alias')
    // A missing or mistyped alias is E_FM_SCHEMA's; two of them are not a clash.
    if (typeof alias !== 'string') return
    const earlier = first.get(alias)
    if (earlier === undefined) {
      first.set(alias, index)
      return
    }
    at(
      'E_PROTO_ALIAS_DUP',
      'error',
      `participants[${index}] repeats the alias "${alias}" declared by participants[${earlier}] — a workflow step naming "${alias}" would address two lifelines`,
    )
  })
}

/* --------------------------------------------------------------- the ref surface */

/**
 * `E_PROTO_PARTICIPANT_KIND`, and the `E_SRN_*` classes a reference surface
 * raises on the way. Returns the entries that survived, which is what the two
 * joins below are entitled to reason about.
 */
function resolveParticipants(
  catalog: Catalog,
  protocol: Entity,
  declared: readonly unknown[],
  at: Report,
): ResolvedParticipant[] {
  const resolved: ResolvedParticipant[] = []

  declared.forEach((entry, index) => {
    const ref = field(entry, 'ref')
    // An absent or mistyped `ref` is the kind schema's finding, not a kind mismatch.
    if (typeof ref !== 'string') return

    try {
      const parsed = parseSrn(resolveRef(protocol.srn, ref))

      if (parsed.artifact !== null) {
        // Vocabulary first: an illegal role throws E_SRN_ARTIFACT from here.
        assertArtifactRole(parsed.kind, parsed.artifact, ref)
        at(
          'E_PROTO_PARTICIPANT_KIND',
          'error',
          `participants[${index}] "${ref}" addresses the ".${parsed.artifact}" artifact of ${formatSrn({ ...parsed, artifact: null, version: null })} — participation is typed over kinds, and an artifact has no kind`,
        )
        return
      }

      const srn = formatSrn({ ...parsed, version: null })
      const target = catalog.entities.get(srn)
      if (!target) {
        at('E_SRN_DANGLING', 'error', `participants[${index}] "${ref}" resolves to ${srn}, which does not exist`)
        return
      }
      if (!PARTICIPANT_KINDS.has(target.kind)) {
        at(
          'E_PROTO_PARTICIPANT_KIND',
          'error',
          `participants[${index}] "${ref}" resolves to a ${target.kind} (${srn}) — only a component, a product or an actor participates in a protocol`,
        )
        return
      }
      resolved.push({ index, ref, srn, kind: target.kind })
    } catch (cause) {
      at(
        cause instanceof SrnError ? cause.code : 'E_SRN_SYNTAX',
        'error',
        `participants[${index}] ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }
  })

  return resolved
}

/* ------------------------------------------------------------------- the joins */

/**
 * `W_PROTO_PARTICIPANT_UNLINKED` and `W_PROTO_PARTICIPANT_MISSING` — the same
 * join, read from each end.
 *
 * Warnings, both, and protocol.md says why: during a swap one side legitimately
 * moves a commit before the other, exactly as `W_STRUCT_PROTOCOL_NCA` allows for
 * the directory. Both land on the protocol's `index.md`, because both are fixed
 * by editing this list — or by editing the other document, which the message
 * names either way.
 *
 * Membership is identity, never containment. protocol.md states the rules over
 * "a participant" and "a component or product that `exposes`/`uses` this
 * protocol", and a containment reading would silence exactly the case the rule is
 * for: a product listed as the participant while the component that actually
 * holds the edge goes unnamed.
 */
function crossCheckEdges(
  catalog: Catalog,
  protocol: Entity,
  resolved: readonly ResolvedParticipant[],
  at: Report,
): void {
  /** Component/product SRN → the edges it points at this protocol with. */
  const back = new Map<string, Set<EdgeType>>()
  for (const { edge, from } of catalog.inbound.get(protocol.srn) ?? []) {
    if (!BACK_EDGES.has(edge)) continue
    const source = catalog.entities.get(from)
    if (!source || !EDGE_SOURCE_KINDS.has(source.kind)) continue
    const edges = back.get(from) ?? new Set<EdgeType>()
    edges.add(edge)
    back.set(from, edges)
  }

  for (const participant of resolved) {
    if (participant.kind === 'actor') continue
    if (back.has(participant.srn)) continue
    at(
      'W_PROTO_PARTICIPANT_UNLINKED',
      'warning',
      `participants[${participant.index}] "${participant.ref}" (${participant.srn}) carries neither exposes nor uses for this protocol — the component side owns the edge, so this lifeline joins the participant graph as an undirected, dimmed node`,
    )
  }

  const listed = new Set(resolved.map((participant) => participant.srn))
  for (const [srn, edges] of [...back.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (listed.has(srn)) continue
    at(
      'W_PROTO_PARTICIPANT_MISSING',
      'warning',
      `${srn} ${[...edges].sort().join(' and ')} this protocol and is not among its participants — give it an alias here, or drop the edge there`,
    )
  }
}

/* ---------------------------------------------------------------------- shared */

/** One field of a participant entry. Entries are `unknown`: the schema owns their shape. */
function field(entry: unknown, name: string): unknown {
  return typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    ? (entry as Record<string, unknown>)[name]
    : undefined
}
