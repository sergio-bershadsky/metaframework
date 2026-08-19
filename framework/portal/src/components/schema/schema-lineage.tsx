import { ChevronRight, Layers, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { entityHref } from '@/lib/catalog'
import type { LineageField, LineageMember, LineageView } from '@/lib/schema/lineage'

/**
 * Where every field came from — the one thing a flattened schema cannot say.
 *
 * The viewer above resolves `allOf` into a single shape, which is correct and
 * is what an instance has to satisfy. It is also why it cannot answer "where
 * did `created-at` come from?": once the branches are inlined, the ancestor
 * that contributed a name is gone from the document. In a catalog whose whole
 * datamodel story is composition, that is the reviewer's first question.
 *
 * So this is a *companion*, not a second viewer, and the restraint is the
 * design: no types, no constraints, no descriptions, no expansion — all of that
 * is already on screen a few pixels above. Two facts only, the chain and the
 * attribution, in as little vertical space as they can honestly occupy.
 *
 * Server-rendered and free of client JavaScript: it is derived text and links,
 * and the one disclosure it needs (a long descendant list) is a native
 * `<details>`.
 */
export function SchemaLineage({ view }: { view: LineageView }) {
  if (!view.inherits && view.descendants.length === 0) return null

  const markers = {
    required: view.members.some((member) => member.fields.some((field) => field.required)),
    narrowed: view.members.some((member) => member.fields.some((field) => field.narrowed)),
    deprecated: view.members.some((member) => member.fields.some((field) => field.deprecated)),
    contradiction: view.members.some((member) => member.fields.some((field) => field.contradiction)),
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Lineage</h3>
        <p className="text-[11.5px] text-muted-foreground">
          {view.inherits
            ? 'allOf intersects — a base is never overridden, only narrowed'
            : 'this model is a base; nothing above it'}
        </p>
      </div>

      <div className="panel mt-2.5 px-3.5 py-3">
        {view.inherits && <Chain levels={view.levels} />}

        {view.inherits && (
          <dl className="mt-3 space-y-1.5 border-t border-border pt-3">
            {view.members.map((member) => (
              <div key={member.id} className="gap-x-3 gap-y-0.5 sm:grid sm:grid-cols-[minmax(0,8.5rem)_1fr]">
                <dt className="pt-1 font-mono text-[11px] text-muted-foreground sm:truncate sm:text-right">
                  {member.name}
                </dt>
                <dd className="min-w-0">
                  <Contribution member={member} />
                </dd>
              </div>
            ))}
          </dl>
        )}

        {view.descendants.length > 0 && (
          <div className={view.inherits ? 'mt-3 border-t border-border pt-3' : undefined}>
            <Descendants view={view} />
          </div>
        )}

        {view.inherits && <Legend markers={markers} />}
      </div>
    </div>
  )
}

/**
 * The composition, base-first. A column per inheritance level, so two bases
 * composed onto one model — `base-record` and `auditable` under `access-grant`
 * — stack in one column instead of pretending to be a sequence.
 */
function Chain({ levels }: { levels: LineageMember[][] }) {
  return (
    <ol aria-label="Composition chain" className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {levels.map((level, index) => (
        <li key={level.map((member) => member.id).join('|')} className="flex items-center gap-1">
          <span className="flex flex-col items-start gap-1">
            {level.map((member) => (
              <ChainChip key={member.id} member={member} />
            ))}
          </span>
          {index < levels.length - 1 && (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </li>
      ))}
    </ol>
  )
}

const CHIP = 'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[11.5px] leading-[1.5]'

function ChainChip({ member }: { member: LineageMember }) {
  if (member.status !== 'ok') {
    return (
      <span
        className={`${CHIP} border-destructive/40 bg-destructive/[0.07] text-destructive`}
        title={member.error?.message ?? 'part of an inheritance cycle'}
      >
        <TriangleAlert className="size-3 shrink-0" aria-hidden />
        {member.name}
        <span className="sr-only">
          — {member.status === 'cyclic' ? 'inheritance cycle' : 'unresolved base'}
        </span>
      </span>
    )
  }

  const body = (
    <>
      {member.name}
      {member.abstract && (
        <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground">abstract</span>
      )}
    </>
  )

  // The model itself is not a link — the reader is already on its page — and it
  // is the one chip that carries the foreground weight, so the chain reads
  // towards where you are standing.
  if (member.own || !member.srn) {
    return (
      <span
        className={`${CHIP} border-border-strong bg-surface-raised text-foreground`}
        title={member.title}
        aria-current="page"
      >
        {body}
      </span>
    )
  }

  return (
    <Link
      href={entityHref(member.srn)}
      title={member.title}
      className={`${CHIP} focusable border-kind-datamodel/30 bg-kind-datamodel/10 text-kind-datamodel
                  transition hover:border-kind-datamodel/60`}
    >
      {body}
    </Link>
  )
}

/** The names one schema puts into the conjunction. */
function Contribution({ member }: { member: LineageMember }) {
  if (member.status === 'unresolved') {
    return <p className="pt-1 text-[11.5px] text-destructive">{member.error?.message}</p>
  }
  if (member.status === 'cyclic') {
    return (
      <p className="pt-1 text-[11.5px] text-destructive">
        On an inheritance cycle — the conjunction cannot be flattened, so its fields are not counted.
      </p>
    )
  }
  if (member.fields.length === 0) {
    return <p className="pt-1 text-[11.5px] text-muted-foreground">contributes no fields</p>
  }

  return (
    <ul className="flex flex-wrap gap-1">
      {member.fields.map((field) => (
        <li key={field.name}>
          <FieldChip field={field} />
        </li>
      ))}
    </ul>
  )
}

function FieldChip({ field }: { field: LineageField }) {
  const notes = [
    field.required ? 'required here' : null,
    field.narrowed ? `also constrained by ${field.alsoFrom.join(', ')}` : null,
    field.deprecated ? 'deprecated' : null,
    field.contradiction ? 'constrained to disjoint types — no instance can satisfy it' : null,
  ].filter((note): note is string => note !== null)

  const tone = field.contradiction
    ? 'border-destructive/40 bg-destructive/[0.07] text-destructive'
    : 'border-border bg-surface-raised text-foreground/85'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11.5px] leading-[1.6] ${tone}`}
      title={notes.length > 0 ? `${field.name} — ${notes.join('; ')}` : field.name}
    >
      {field.contradiction ? (
        <TriangleAlert className="size-2.5 shrink-0" aria-hidden />
      ) : (
        field.narrowed && <Layers className="size-2.5 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className={field.deprecated ? 'line-through' : undefined}>{field.name}</span>
      {field.required && <span aria-hidden>*</span>}
      {notes.length > 0 && <span className="sr-only">— {notes.join('; ')}</span>}
    </span>
  )
}

/**
 * The other direction. On an abstract base this is the whole point of the
 * section: nothing composes *into* `base-record`, but sixteen models compose it
 * in, and that is what makes changing it expensive.
 */
function Descendants({ view }: { view: LineageView }) {
  const shown = view.descendants.slice(0, VISIBLE_DESCENDANTS)
  const rest = view.descendants.slice(VISIBLE_DESCENDANTS)

  return (
    <div className="sm:grid sm:grid-cols-[minmax(0,8.5rem)_1fr] sm:gap-x-3">
      <p className="pt-1 font-mono text-[11px] text-muted-foreground sm:text-right">extended by</p>
      <div className="min-w-0">
        <ul className="flex flex-wrap gap-1">
          {shown.map((relative) => (
            <li key={relative.srn}>
              <RelativeChip srn={relative.srn} name={relative.name} title={relative.title} />
            </li>
          ))}
        </ul>
        {rest.length > 0 && (
          <details className="mt-1">
            <summary className="focusable inline-block cursor-pointer rounded text-[11px] text-muted-foreground hover:text-foreground">
              and {rest.length} more
            </summary>
            <ul className="mt-1 flex flex-wrap gap-1">
              {rest.map((relative) => (
                <li key={relative.srn}>
                  <RelativeChip srn={relative.srn} name={relative.name} title={relative.title} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}

const VISIBLE_DESCENDANTS = 8

function RelativeChip({ srn, name, title }: { srn: string; name: string; title: string }) {
  return (
    <Link
      href={entityHref(srn)}
      title={title}
      className="focusable inline-flex items-center rounded border border-border bg-surface-raised px-1.5 py-px
                 font-mono text-[11.5px] leading-[1.6] text-foreground/85 transition
                 hover:border-border-strong hover:text-foreground"
    >
      {name}
    </Link>
  )
}

/** Only the markers this model actually uses, so the key is never longer than the data. */
function Legend({ markers }: { markers: Record<'required' | 'narrowed' | 'deprecated' | 'contradiction', boolean> }) {
  const items = [
    markers.required ? <span key="required">* this schema&rsquo;s own required</span> : null,
    markers.narrowed ? (
      <span key="narrowed" className="inline-flex items-center gap-1">
        <Layers className="size-2.5" aria-hidden />
        also constrained by another schema here
      </span>
    ) : null,
    markers.deprecated ? (
      <span key="deprecated">
        <span className="line-through">struck through</span> deprecated
      </span>
    ) : null,
    markers.contradiction ? (
      <span key="contradiction" className="inline-flex items-center gap-1 text-destructive">
        <TriangleAlert className="size-2.5" aria-hidden />
        disjoint types — unsatisfiable
      </span>
    ) : null,
  ].filter((item) => item !== null)

  if (items.length === 0) return null

  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">{items}</p>
  )
}
