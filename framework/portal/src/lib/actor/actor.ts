import { parseJourney } from '../journey/journey'
import type { Catalog, Diagnostic, Entity } from '../catalog/types'
import { formatSrn, parseSrn, resolveRef } from '../srn/srn'

/**
 * ACT5 and ACT6 — framework/spec/kinds/actor.md, "Actors in protocols,
 * workflows and journeys" — as an executable copy.
 *
 * The actor kind defines no sibling artifacts, so there was nothing for a
 * mini-spec parser to read and both of its codes sat in the debt register with
 * one sentence each: "nothing checks an actor for inbound participation" and
 * "nothing checks the direction actors are wired in". Neither is a question
 * about an actor's own document — they are both about the *edges around it* —
 * which is why they live here, against the resolved catalog, rather than in the
 * loader's per-entity pass.
 *
 * The two rules are the same rule read from its two ends. Participation is
 * authored **once, on the protocol side**; ACT5 catches an author saying it from
 * the actor side as well, and ACT6 catches nobody saying it at all.
 */

/* ---------------------------------------------------------- participation */

/**
 * Every actor SRN the catalog names in a participation surface.
 *
 * Three surfaces, and the third is the one ACT6 was amended for.
 *
 * - **A protocol's `participants` list** is the surface participation is
 *   authored on, and the only one actor.md v4 named.
 * - **A workflow step** was named in the same sentence and adds nothing
 *   mechanically: a step addresses a participant by **alias**, and an alias that
 *   is not declared in `participants` is `E_PROTO_WF_ALIAS`. Every actor a
 *   workflow can reach is therefore already a participant. It is not scanned,
 *   and saying so is cheaper than a redundant pass that can only ever agree.
 * - **A journey's `actor`, on the entity and on every step**, is the third, and
 *   as of actor.md **v5** it is ACT6's letter rather than a widening of it. v4
 *   enumerated the surfaces that existed when it was written; `journey.yaml`
 *   names actors by **SRN directly** (kinds/journey.md, "Step nodes"), and
 *   journey.md derives a "Journeys" panel on the actor page from exactly those
 *   references. An actor who is the protagonist of two journeys is not "an actor
 *   nobody talks to, usually a leftover from a swap" — which is the fact this
 *   rule is written to find. Reading ACT6 without journeys turns every actor who
 *   stars in a journey and participates in no protocol red, which is correct
 *   authoring called a defect, and a check that does that teaches authors to
 *   ignore it. The spec was moved to what this code does; the code did not move.
 *
 * What is deliberately **not** participation: an actor's own outbound `uses`
 * edge, and a product's `primary-actors` list. Both say "this actor touches this
 * surface" — a description of reach, not a modelled conversation — and counting
 * the first would make ACT6 unfireable on any actor that names a component,
 * which is nearly all of them.
 */
export function participatingActors(catalog: Catalog): Set<string> {
  const participants = new Set<string>()
  const add = (base: string, reference: unknown) => {
    if (typeof reference !== 'string') return
    const srn = resolvedEntityRef(base, reference)
    if (srn) participants.add(srn)
  }

  for (const entity of catalog.entities.values()) {
    if (entity.kind === 'protocol') {
      for (const participant of declaredParticipants(entity)) add(entity.srn, participant.ref)
      continue
    }

    if (entity.kind !== 'journey') continue
    add(entity.srn, (entity.frontmatter as { actor?: unknown }).actor)

    const artifact = entity.artifacts.find((candidate) => candidate.file === JOURNEY_ARTIFACT)
    if (!artifact || artifact.error) continue
    // `parseJourney` rather than a hand-read of `steps[].actor`: it is the
    // mini-spec reader, and two readers of one file eventually disagree about
    // what a step is. Its issues are dropped on the floor — `artifact-checks.ts`
    // owns them, and reporting E_JRN_SCHEMA from the actor lane would put the
    // same finding on /diagnostics twice.
    const { journey } = parseJourney(artifact.data, { journeySrn: entity.srn })
    for (const step of journey?.steps ?? []) {
      if (step.actorSrn) participants.add(step.actorSrn)
    }
  }

  return participants
}

const JOURNEY_ARTIFACT = 'journey.yaml'

/** The `participants` list as authored, whatever survived the frontmatter schema. */
function declaredParticipants(entity: Entity): Array<{ ref?: unknown }> {
  const declared = (entity.frontmatter as { participants?: unknown }).participants
  return Array.isArray(declared) ? (declared as Array<{ ref?: unknown }>) : []
}

/** One reference as its canonical unversioned SRN, or null when it is not usable. */
function resolvedEntityRef(base: string, reference: string): string | null {
  try {
    const parsed = parseSrn(resolveRef(base, reference))
    if (parsed.artifact !== null) return null
    return formatSrn({ ...parsed, version: null })
  } catch {
    return null
  }
}

/* ------------------------------------------------------------ diagnostics */

/**
 * Both actor rules, over the resolved catalog.
 *
 * Severity is the kind document's: both are warnings, and for the reason it
 * gives — "a newly described actor precedes its protocols". An actor with no
 * counterpart yet is a true statement about a system still being described; an
 * actor with no counterpart *ever* is the leftover this is looking for, and only
 * a reader can tell the two apart.
 */
export function actorDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const participants = participatingActors(catalog)

  for (const entity of catalog.entities.values()) {
    if (entity.kind !== 'actor') continue
    const docPath = `${entity.relDir}/index.md`

    // ACT5. The edge is legal at the loader's table — `uses` may target a
    // protocol from any kind — so this is the only thing standing between an
    // author and two participant lists that drift.
    for (const relation of entity.relations) {
      if (relation.edge !== 'uses' || !relation.target) continue
      if (catalog.entities.get(relation.target)?.kind !== 'protocol') continue
      diagnostics.push({
        code: 'W_ACTOR_PARTICIPATION_EDGE',
        severity: 'warning',
        message:
          `"uses" toward protocol ${relation.target} — participation is authored once, in that protocol's ` +
          '`participants` list; a copy here is a second list to keep in step',
        path: docPath,
        srn: entity.srn,
      })
    }

    // ACT6.
    if (participants.has(entity.srn)) continue
    // …except on a retired role, and the exemption is the rule's own sentence
    // read to the end. "An actor nobody talks to is *usually a leftover from a
    // swap*" is a guess about why the participant lists are silent, and
    // `status: deprecated` is the catalog answering it: the swap happened, it
    // was deliberate, and the successor carries the conversations. evolution.md
    // then requires the predecessor to stay on disk forever, so the finding is
    // one no author can ever clear — the only edits that would silence it are
    // deleting the entity, which the framework forbids, or inventing a protocol
    // for a role nobody plays.
    //
    // It cannot hide a half-finished swap either, which is what makes it safe
    // rather than merely quiet: if a protocol still names the old actor, the
    // actor is a participant and ACT6 was never going to fire. The exemption
    // only reaches the state evolution.md prescribes as *finished*, and the
    // pointer to where the conversations went is already on the page — derived
    // from the successor's `supersedes` edge.
    //
    // This is deliberately not the reading `requirement.ts` takes of
    // `W_REQ_UNIMPLEMENTED`, where a deprecated `must` with no implementers is
    // still worth a look. That one stays ambiguous — stale priority, or an
    // unfinished migration — because a requirement carries a second field
    // saying how much it matters. An actor carries no such field, so there is
    // no second reading left for a human to pick between.
    if (entity.frontmatter.status === 'deprecated') continue
    diagnostics.push({
      code: 'W_ACTOR_ORPHAN',
      severity: 'warning',
      message:
        'no protocol names this actor among its participants and no journey step gives it a move — ' +
        'an actor nobody talks to is usually a leftover from a swap',
      path: docPath,
      srn: entity.srn,
    })
  }

  return diagnostics
}
