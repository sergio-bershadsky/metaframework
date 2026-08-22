import { Bot, FileCode2, Terminal } from 'lucide-react'
import Link from 'next/link'
import { SectionHeading } from '@/components/entity/section-heading'
import { type Catalog, entityHref } from '@/lib/catalog'
import { schemaUrlPrefix, srnToSchemaUrl } from '@/lib/schema/url'
import { ARTIFACT_ROLES, type ArtifactRole } from '@/lib/srn/artifacts'
import { KIND_STYLES } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

/**
 * How to fill this catalog in, with Claude Code — the second orientation panel
 * on the front page.
 *
 * The legend above teaches the vocabulary; this teaches the act. They are
 * different questions and a reader has them in this order: *what am I looking
 * at*, then *how do I add to it*. Anyone who has just read what a `protocol` is
 * immediately wants to know what to type to get one, and the honest answer —
 * describe it in a sentence, the plugin routes it to a skill that owns the
 * placement rules — is not guessable from the catalog itself.
 *
 * ## Two blocks, because they fail differently
 *
 * **The base block** is about the plugin: install it, three commands, seven
 * skills that trigger on phrasing rather than on a command, and the check loop
 * that closes it. Getting this wrong means nothing happens.
 *
 * **The artifacts block** is about the files beside an `index.md`, and it is
 * separate because artifacts are where authoring actually gets hard: each role
 * has a fixed filename, a dialect of its own, and a different thing worth
 * asking for. Getting this wrong means something happens and it is wrong.
 *
 * ## What is derived and what is authored
 *
 * The artifact rows are `ARTIFACT_ROLES` (lib/srn/artifacts.ts) — the same
 * table the SRN parser resolves `.transport` and `.workflows.<name>` against,
 * and a spec constant asserted verbatim against `structure.md`. So a role added
 * to the spec grows a row here with its real kind, filename and address; it
 * cannot silently go undocumented. The per-role prose is authored and keyed by
 * role name, and a row whose prose is missing still renders its address rather
 * than disappearing — the gap is visible, which is the point.
 *
 * The examples go one further: each row links a **real artifact of that role in
 * the loaded catalog**, first in SRN order. They are not specimens. A role with
 * no instance anywhere shows no example, which is itself worth knowing.
 *
 * The one thing here that is neither derived nor checkable is the list of
 * plugin commands and skills, because the portal cannot see the plugin: it is
 * shipped as a standalone server and `marketplace/plugins/metaframework/` is
 * not in the tarball. That list is authored from that directory and will drift
 * if the plugin grows and nobody edits this file. It is named below so a reader
 * can check it in one `ls`.
 */

/** The plugin's three slash commands. Authored — see the note above. */
const COMMANDS: { command: string; args: string; does: string }[] = [
  {
    command: '/solution-new',
    args: '<name> <one line about it>',
    does: 'Starts a catalog from nothing: vision, scope, contacts, and the first products, actors and environments.',
  },
  {
    command: '/entity-new',
    args: '<kind> <name> <where it belongs>',
    does: 'Adds one entity and routes to the skill that owns that kind — placement, required fields and the artifacts it must carry.',
  },
  {
    command: '/catalog-check',
    args: '[entity SRN to focus on]',
    does: 'Runs the CLI, then reads the diagnostics back and proposes fixes rather than just printing them.',
  },
]

/** The skills, which need no command — they trigger on what you say. */
const SKILLS: { name: string; when: string }[] = [
  { name: 'solution-design', when: '“design a solution”, “model our system as a catalog”' },
  { name: 'add-entity', when: '“add a product”, “add a service to the catalog”' },
  { name: 'model-data', when: '“model this invoice”, “create a schema.json”' },
  { name: 'protocol-design', when: '“describe how these two talk”, “document this API”' },
  { name: 'evolve-entity', when: '“rename this component”, “deprecate this field”' },
  { name: 'validate-catalog', when: '“check the catalog”, “why is this failing?”' },
  { name: 'review-solution', when: '“review solutions/{solution}”' },
]

/**
 * Per-role authoring prose, keyed by the role name in `ARTIFACT_ROLES`.
 *
 * `ask` is written as something a person would actually say, not as a template
 * to fill in: the plugin's skills route on natural phrasing, and a reader shown
 * angle-bracket placeholders tends to type the placeholders.
 *
 * `head` is the first line or two a conforming file carries — in every case the
 * dialect discriminator, because that is the line an author is most likely to
 * omit and the one that decides how the file is read at all.
 */
const AUTHORING: Record<string, { what: string; ask: string; head: string }> = {
  schema: {
    what: 'The data model itself — JSON Schema 2020-12, under a canonical `$id` and its own `x-srn`.',
    ask: '“model the cart as a datamodel under checkout — line items, totals, currency”',
    head: '"$schema": "https://json-schema.org/draft/2020-12/schema",\n"$id": "{schemaId}",\n"x-srn": "{schemaSrn}"',
  },
  'examples.<name>': {
    what: 'A named instance of the sibling schema — one file per example, validated against it.',
    ask: '“add a minimal example to the money datamodel”',
    head: '{ "amount": "49.90", "currency": "EUR" }',
  },
  transport: {
    what: 'The wire: what carries this exchange, and the delivery guarantees claimed for it. Two dialects — the framework mini-spec, or AsyncAPI where AsyncAPI can describe the wire.',
    ask: '“describe the transport for settlement — a kafka topic, at-least-once, JSON”',
    head: '$schema: …/datamodel/transport-document\nkind: http\nencoding: json',
  },
  states: {
    what: 'The state of one conversation as the protocol sees it — never one participant’s internals. A strict subset of XState v5 that `createMachine()` must accept unchanged.',
    ask: '“add the order lifecycle to this protocol — submitted, reserved, paid, cancelled”',
    head: '"$schema": "…/datamodel/state-machine-document",\n"id": "order-placement",\n"initial": "submitted"',
  },
  openapi: {
    what: 'A linked OpenAPI document, carried as an attachment. It announces itself with its own `openapi:` key and is never re-specified by this framework.',
    ask: '“attach the carrier booking OpenAPI spec to this protocol”',
    head: 'openapi: 3.1.0',
  },
  'workflows.<name>': {
    what: 'One named exchange, drawn as a sequence diagram: participants, calls and returns, guards, alt/opt/loop fragments. Multi-party by design.',
    ask: '“write the happy-path workflow for placing an order, and one for the cancel case”',
    head: '$schema: …/datamodel/workflow-document\nname: get-a-token',
  },
  arazzo: {
    what: 'The orchestration surface — one initiator’s path across the exchange, in Arazzo. Optional, and only sensible where a grounding document exists to resolve its operations against.',
    ask: '“add an Arazzo description for the initiator’s path through settlement”',
    // `1.1.0`, not `1.0.x`: the registered band is `1.1.x` (dialects.ts), so
    // `1.0.1` is the string this panel would be teaching authors to write a
    // `W_ARTIFACT_DIALECT` with. `head` is documented above as what a
    // *conforming* file carries.
    head: 'arazzo: 1.1.0',
  },
  journey: {
    what: 'One actor’s ordered path across the solution, step by step, each naming what it touches and which protocol carries it.',
    ask: '“write the first-purchase journey for the customer actor”',
    head: '$schema: …/datamodel/journey-document\nsteps:\n  - actor: /actor/chat-user',
  },
  topology: {
    what: 'Where things run in this environment — regions, hosts, placements, replica ranges. A reviewable claim, not a deployable.',
    ask: '“describe production’s topology — two regions, three replicas of the API”',
    head: '$schema: …/datamodel/topology-document\nregions:\n  - name: hel1',
  },
  config: {
    what: 'What the components in this environment are configured with. Keys and their sources live here; secret values never do.',
    ask: '“declare production’s config for the ledger — the database URL and the OTEL endpoint”',
    head: '$schema: …/datamodel/config-document',
  },
}

const CARD = 'rounded-lg border border-border bg-surface/40 px-4 py-3.5'
const MONO = 'font-mono text-[12px]'
const PROSE = 'text-[12.5px] leading-relaxed text-muted-foreground'

/**
 * Placeholders resolved against the catalog actually loaded, not against this
 * repository's demo solutions.
 *
 * The panel is rendered by whatever catalog `CATALOG_DIR` points at, so a
 * snippet naming `acme` is wrong for every reader but us, and wrong in the
 * specific way that gets copied into a file. `{schemaId}` is built by the same
 * `srnToSchemaUrl` the schema registry uses, over a real datamodel in the
 * loaded catalog, so the example is the reader's own entity.
 *
 * The *host* in it is not a placeholder and must not become one.
 * `CANONICAL_SCHEMA_HOST` is deliberately a constant rather than configuration
 * — identity may not vary between deployments, because registries and caches
 * key on `$id` — and `SCHEMA_BASE_URL` is a retrieval address that MUST NOT
 * appear there (lib/schema/url.ts). So every catalog's `$id` really does sit on
 * that host, and the fallback below is built from `schemaUrlPrefix()` rather
 * than hand-typed, since that module is the only place the string may live.
 *
 * The remaining fallbacks are angle-bracketed rather than plausible: an empty
 * catalog has no real name to borrow, and a made-up one would read as a fact.
 */
interface GuideContext {
  solution: string
  schemaId: string
  schemaSrn: string
}

const fill = (text: string, ctx: GuideContext) =>
  text
    .replace('{solution}', ctx.solution)
    .replace('{schemaId}', ctx.schemaId)
    .replace('{schemaSrn}', ctx.schemaSrn)

/**
 * Does a file on disk fill this role? Derived from the row's own `file`, so the
 * table stays the single statement of what each role is called.
 *
 * The two `<name>` families become a prefix/suffix test with a non-empty middle
 * — `examples/` + `.json` — rather than a regex built by interpolation, which
 * would have to escape the dot and would silently match `examplesXjson`.
 */
function fills(row: ArtifactRole): (file: string) => boolean {
  const [head, tail] = row.file.split('<name>')
  if (tail === undefined) return (file) => file === row.file
  return (file) => file.startsWith(head) && file.endsWith(tail) && file.length > head.length + tail.length
}

/**
 * A real artifact of each role in this catalog: `{ role → { srn, file } }`.
 *
 * Matched on kind and filename rather than on `artifact.dialect.role`: a
 * dialect is only recorded for a file that declares one, so a legacy artifact —
 * precisely the kind a reader is most likely to be looking at — carries no role
 * and would be invisible here.
 */
function realExamples(catalog: Catalog) {
  const found = new Map<string, { srn: string; file: string }>()
  const tests = ARTIFACT_ROLES.map((row) => ({ row, test: fills(row) }))
  for (const entity of [...catalog.entities.values()].sort((a, b) => a.srn.localeCompare(b.srn))) {
    for (const { row, test } of tests) {
      if (row.kind !== entity.kind || found.has(row.role)) continue
      const hit = entity.artifacts.find((artifact) => test(artifact.file))
      if (hit) found.set(row.role, { srn: entity.srn, file: hit.file })
    }
  }
  return found
}

export function AuthoringGuide({ catalog, className }: { catalog: Catalog; className?: string }) {
  const examples = realExamples(catalog)
  const firstSchema = examples.get('schema')
  const ctx: GuideContext = {
    solution: catalog.solutions[0]?.replace(/^srn:\/\//, '') ?? '<solution>',
    schemaId: firstSchema
      ? srnToSchemaUrl(firstSchema.srn)
      : `${schemaUrlPrefix()}<solution>/datamodel/<name>`,
    schemaSrn: firstSchema?.srn ?? 'srn://<solution>/datamodel/<name>',
  }

  return (
    <section aria-labelledby="authoring-guide" className={cn('panel px-5 pt-4 pb-6', className)}>
      <div className="flex items-center gap-2.5">
        <Bot className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <SectionHeading id="authoring-guide" level={2} className="text-[11px]">
          Filling it in with Claude Code
        </SectionHeading>
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground/75">
          the plugin, and what to ask for each of the {ARTIFACT_ROLES.length} artifact roles
        </span>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        {/* ------------------------------------------------------------ base */}
        <SectionHeading level={3} className="text-[11px]">
          The basics
        </SectionHeading>
        <p className={cn(PROSE, 'mt-1.5 max-w-3xl')}>
          Every entity is a directory with an <code className="font-mono">index.md</code>. You do not
          create those by hand — you describe what you want, and a skill that owns the rules for that
          kind places it, fills the frontmatter and writes the artifacts beside it.
        </p>

        <div className="mt-3.5 grid gap-3 lg:grid-cols-2">
          <div className={CARD}>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Terminal className="size-3 shrink-0" aria-hidden />
              Install once
            </p>
            <pre className={cn(MONO, 'mt-2.5 overflow-x-auto text-foreground/85')}>
              <code>{'/plugin marketplace add sergio-bershadsky/metaframework\n/plugin install metaframework@metaframework'}</code>
            </pre>
            <p className={cn(PROSE, 'mt-3')}>
              The CLI is separate and optional — it is what the check command shells out to:
            </p>
            <pre className={cn(MONO, 'mt-2 overflow-x-auto text-foreground/85')}>
              <code>{'npm install -g @bershadsky/metaframework\nmetaframework check'}</code>
            </pre>
          </div>

          <div className={CARD}>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Bot className="size-3 shrink-0" aria-hidden />
              The loop
            </p>
            <ol className={cn(PROSE, 'mt-2.5 flex list-decimal flex-col gap-1.5 pl-4')}>
              <li>
                Say what you want in a sentence — <em>“add a payments service under shop”</em>.
              </li>
              <li>The skill places it, writes the frontmatter and the artifacts, and tells you what it chose.</li>
              <li>
                Run <code className="font-mono text-foreground/80">/catalog-check</code>. It reads the
                diagnostics back and proposes fixes.
              </li>
              <li>
                <strong className="text-foreground/85">Zero errors is the pass condition.</strong>{' '}
                Warnings are true statements — fix them or say why they stand.
              </li>
            </ol>
          </div>
        </div>

        <p className={cn(PROSE, 'mt-4 max-w-3xl')}>
          Three commands, when you want to be explicit:
        </p>
        <ul className="mt-2.5 flex flex-col gap-2.5">
          {COMMANDS.map(({ command, args, does }) => (
            <li key={command} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="shrink-0">
                <code className="font-mono text-[12px] font-medium text-primary">{command}</code>{' '}
                <span className="font-mono text-[11.5px] text-muted-foreground/70">{args}</span>
              </span>
              <span className={cn(PROSE, 'min-w-0')}>{does}</span>
            </li>
          ))}
        </ul>

        <p className={cn(PROSE, 'mt-4 max-w-3xl')}>
          You rarely need them. {SKILLS.length} skills trigger on what you say, with no command at all:
        </p>
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {SKILLS.map(({ name, when }) => (
            <li key={name} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
              <code className="w-40 shrink-0 font-mono text-[11.5px] text-foreground/85">{name}</code>
              <span className={cn(PROSE, 'min-w-0')}>{fill(when, ctx)}</span>
            </li>
          ))}
        </ul>

        <div className="rule-fade my-6" />

        {/* ------------------------------------------------------- artifacts */}
        <SectionHeading level={3} className="text-[11px]">
          Filling in the artifacts
        </SectionHeading>
        <p className={cn(PROSE, 'mt-1.5 max-w-3xl')}>
          An <code className="font-mono">index.md</code> carries the prose and the relations. Everything
          machine-readable lives in a sibling file with a <strong className="text-foreground/85">fixed
          name</strong>, decided by the entity&rsquo;s kind — you never choose it, and neither does
          Claude. Each is addressable from anywhere in the catalog by a dot suffix on the
          entity&rsquo;s SRN, so <code className="font-mono">…/settlement.transport</code> names a file
          without anyone writing a path.
        </p>

        <ul className="mt-4 flex flex-col gap-5">
          {ARTIFACT_ROLES.map((row) => {
            const prose = AUTHORING[row.role]
            const style = KIND_STYLES[row.kind as keyof typeof KIND_STYLES]
            const Icon = style?.icon
            const real = examples.get(row.role)
            return (
              <li key={`${row.kind}/${row.role}`} className="flex items-start gap-3.5">
                {Icon && <Icon className={cn('mt-0.5 size-5 shrink-0', style.text)} aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <code className="font-mono text-[12.5px] font-medium text-foreground/90">
                      {row.file}
                    </code>
                    <span className={cn('font-mono text-[11px]', style?.text)}>on a {row.kind}</span>
                    <span className="font-mono text-[11px] text-muted-foreground/70">
                      addressed <span className="text-muted-foreground">.{row.role}</span>
                    </span>
                  </p>
                  {prose ? (
                    <>
                      <p className={cn(PROSE, 'mt-1.5 max-w-3xl')}>{prose.what}</p>
                      <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-foreground/80">
                        <span className="text-muted-foreground/70">Ask&nbsp;</span>
                        {prose.ask}
                      </p>
                      <pre className="mt-2 overflow-x-auto rounded border border-border/70 bg-surface/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                        <code>{fill(prose.head, ctx)}</code>
                      </pre>
                    </>
                  ) : (
                    // A role the spec grew and this file has not been taught. Say
                    // so rather than dropping the row: an undocumented artifact
                    // role is exactly what a reader needs to be told about.
                    <p className={cn(PROSE, 'mt-1.5')}>
                      No authoring note yet — this role was added to the spec after this guide was
                      written.
                    </p>
                  )}
                  {real && (
                    <p className="mt-2 text-[12px]">
                      <span className="text-muted-foreground/70">in this catalog: </span>
                      <Link
                        href={entityHref(real.srn)}
                        className="focusable rounded font-mono text-[11.5px] text-muted-foreground/90 underline decoration-border underline-offset-2 transition hover:text-primary hover:decoration-primary"
                      >
                        {real.srn}
                        <span className="text-muted-foreground/60">/{real.file}</span>
                      </Link>
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>

        <p className="mt-6 max-w-3xl border-t border-border pt-3.5 text-[11.5px] leading-relaxed text-muted-foreground/80">
          <FileCode2 className="mr-1.5 inline size-3 align-[-1px]" aria-hidden />
          Every one of these files declares which dialect it is written in, on its first line. A file
          that declares none is still read — as the legacy dialect, with a warning — so an older
          catalog keeps working while a new one says what it is.
        </p>
      </div>
    </section>
  )
}
