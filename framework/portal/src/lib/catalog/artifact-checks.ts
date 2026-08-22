import path from 'node:path'
import { parseJourney } from '../journey/journey'
import { arazzoGroundingDiagnostics } from '../protocol/arazzo-grounding'
import { parseStates } from '../protocol/states'
import { transportDiagnostics } from '../protocol/transport-checks'
import { parseWorkflow } from '../protocol/workflow'
import type { Catalog, Diagnostic, Entity } from './types'

/**
 * Artifact validation, folded into the catalog the same way the datamodel
 * schema registry is (lib/catalog/index.ts, `withSchemaRegistry`).
 *
 * `loadCatalog` validates frontmatter, placement and relations; it parses an
 * artifact into `artifact.data` and stops there. Everything a `journey.yaml`, a
 * `workflows/*.yaml` or a `states.json` can get wrong is found by the mini-spec
 * parsers in lib/journey and lib/protocol — and until this module existed those
 * parsers were called only by rendering components. Breaking a `journey.yaml`
 * with an unknown key put `E_JRN_SCHEMA` on the entity page and left
 * /diagnostics reporting a clean catalog, which is the same shape of hole the
 * schema registry had before it was wired in. /diagnostics is the portal's only
 * integrity gate; a validator that reports only to the page nobody is on is not
 * a gate.
 *
 * The dispatch below is deliberately the same table as
 * `components/entity/entity-artifacts.tsx` — kind *and* filename, because a
 * `schema.json` on a protocol is just a JSON file. Both call sites must derive
 * the same findings from the same file: a diagnostic that appears on one and not
 * the other is worse than one that appears on neither.
 *
 * `parseStates` and `arazzoGroundingDiagnostics` already speak
 * {@link Diagnostic}; the workflow and journey parsers speak their own issue
 * shape whose `path` is *positional* inside the document (`steps[3].actor`). A
 * Diagnostic's `path` is the catalog-relative file, so the positional part moves
 * into the message, where it is what a reader needs in order to find the line.
 *
 * `arazzo.yaml` is the one entry in this table that is not a mini-spec parser,
 * and the difference is worth keeping straight. Nothing validates an Arazzo
 * Description — the framework has no Arazzo grammar to assert — so the branch
 * below asks the single question `kinds/protocol.md` does state about the file:
 * do its source descriptions and step references land inside artifacts this
 * entity carries. Reading is still not validating; grounding is a rule about
 * references between files rather than about Arazzo's own shape.
 *
 * What this deliberately does NOT do: pass `workflowMessages` to `parseStates`.
 * That would enable `W_PROTO_STATES_EVENT_UNKNOWN`, which the entity page does
 * not compute — and a /diagnostics that is stricter than the page it links to is
 * the same disagreement in the other direction. Turning that check on belongs
 * with a change to both call sites.
 */
export function artifactDiagnostics(catalog: Catalog): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const entity of catalog.entities.values()) {
    for (const artifact of entity.artifacts) {
      // An artifact that would not parse already carries the loader's own
      // complaint; handing `null` to a mini-spec parser only restates it.
      if (artifact.error) continue
      diagnostics.push(...check(entity, artifact))
    }
  }
  return diagnostics
}

const STATES_FILE = 'states.json'
const JOURNEY_FILE = 'journey.yaml'
const ARAZZO_FILE = 'arazzo.yaml'
const TRANSPORT_FILE = 'transport.yaml'
const WORKFLOWS_DIR = 'workflows/'

function check(entity: Entity, artifact: Entity['artifacts'][number]): Diagnostic[] {
  const file = path.join(entity.relDir, artifact.file)

  if (entity.kind === 'journey' && artifact.file === JOURNEY_FILE) {
    const { issues } = parseJourney(artifact.data, {
      entityName: entity.frontmatter.name,
      journeySrn: entity.srn,
      protagonist: typeof entity.frontmatter.actor === 'string' ? entity.frontmatter.actor : undefined,
    })
    return issues.map((issue) => positional(issue, file, entity.srn))
  }

  if (entity.kind === 'protocol' && artifact.file.startsWith(WORKFLOWS_DIR)) {
    const { issues } = parseWorkflow(artifact.data, {
      fileStem: artifact.file.slice(WORKFLOWS_DIR.length).replace(/\.ya?ml$/, ''),
      aliases: declaredAliases(entity),
      protocolSrn: entity.srn,
    })
    return issues.map((issue) => positional(issue, file, entity.srn))
  }

  if (entity.kind === 'protocol' && artifact.file === STATES_FILE) {
    // Already Diagnostics, and already carrying `path`/`srn` — the parser was
    // written against this type. Nothing to translate.
    return parseStates(artifact.data, {
      entityName: entity.frontmatter.name,
      path: file,
      srn: entity.srn,
    }).diagnostics
  }

  if (entity.kind === 'protocol' && artifact.file === ARAZZO_FILE) {
    // The one rule this framework states about an Arazzo Description, and the
    // only thing that reads one for anything but a picture. It is handed the
    // whole artifact list because the rule is about *references between
    // artifacts*: the sibling filenames answer clause 1, and the sibling
    // documents — already parsed, so nothing here opens a file — answer clause
    // 2. Already Diagnostics, like `parseStates`; the in-document position is in
    // the message, because a Diagnostic's `path` is the file.
    return arazzoGroundingDiagnostics(artifact.data, {
      siblings: entity.artifacts,
      path: file,
      srn: entity.srn,
    })
  }

  if (entity.kind === 'protocol' && artifact.file === TRANSPORT_FILE) {
    // The transport reader, in whichever of the two dialects the file declares
    // (ADR 0017). The dialect is handed over **verbatim** rather than sniffed
    // from the document: `dialects.ts` is what rules that a file declaring both
    // `$schema` and `asyncapi:` is the mini-spec, and a second opinion formed
    // here would be exactly the disagreement between call sites this module
    // exists to end.
    //
    // Four of its rules need the entity rather than the file — the AsyncAPI
    // profile pins `info.title` to the entity's own title and its `operations`
    // ids to the participant refs — so the frontmatter travels with the
    // document. Every one of those options is *optional* in the reader and an
    // absent one is unchecked rather than assumed, which is what keeps this the
    // only place that decides what the entity contributes.
    //
    // Already Diagnostics, like `parseStates` and `arazzoGroundingDiagnostics`;
    // nothing to translate.
    const frontmatter = entity.frontmatter as { title?: unknown; participants?: unknown }
    return transportDiagnostics(artifact.data, {
      ...(artifact.dialect ? { dialect: artifact.dialect } : {}),
      path: file,
      srn: entity.srn,
      ...(typeof frontmatter.title === 'string' ? { title: frontmatter.title } : {}),
      ...(Array.isArray(frontmatter.participants) ? { participants: frontmatter.participants } : {}),
    })
  }

  // A datamodel's `schema.json` is deliberately absent from this table: it needs
  // ajv and the whole catalog at once, and `withSchemaRegistry` already folds
  // E_DM_* in. Every other file is source, and source is not validated.
  return []
}

/** A mini-spec issue as a Diagnostic, its in-document position kept in the message. */
function positional(
  issue: { code: string; severity: 'error' | 'warning'; message: string; path: string },
  file: string,
  srn: string,
): Diagnostic {
  return {
    code: issue.code,
    severity: issue.severity,
    message: issue.path ? `${issue.path}: ${issue.message}` : issue.message,
    path: file,
    srn,
  }
}

/** The aliases a protocol declares, which is the set a workflow may address. */
function declaredAliases(entity: Entity): string[] {
  const declared = (entity.frontmatter as { participants?: Array<{ alias?: unknown }> }).participants
  return (declared ?? []).map((participant) => participant.alias).filter((alias): alias is string => typeof alias === 'string')
}
