import { EntityLink } from '@/components/entity-link'
import type { Catalog, Entity } from '@/lib/catalog'
import { kindFieldNames } from '@/lib/catalog/frontmatter'
import { mentionsInValue } from '@/lib/catalog/mentions'

/**
 * The kind-specific frontmatter, rendered with every SRN turned into a link.
 *
 * Fields are discovered from the kind's schema rather than listed here, and any
 * string that resolves to an entity becomes a badge — so a new SRN-valued field
 * added to a kind spec links itself with no change to this component. That is
 * the difference between "references are linked" as a property of the system
 * and as a list someone has to maintain.
 */
export function EntityDetails({
  entity,
  catalog,
  omit = [],
}: {
  entity: Entity
  catalog: Catalog
  /**
   * Fields the page has already drawn somewhere better — a metric's stat block,
   * a component's lifecycle chip. Omitted here rather than never promoted,
   * because "every kind field appears exactly once" is the property worth
   * keeping, and this list is the only place that can be checked.
   */
  omit?: readonly string[]
}) {
  const fields = kindFieldNames(entity.kind)
    .filter((field) => !omit.includes(field))
    .map((field) => [field, (entity.frontmatter as Record<string, unknown>)[field]] as const)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')

  if (fields.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Details</h2>

      <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-[max-content_1fr]">
        {fields.map(([field, value]) => (
          <div key={field} className="contents">
            <dt className="font-mono text-[12px] text-muted-foreground">{field}</dt>
            <dd className="min-w-0 text-[13.5px] leading-relaxed text-foreground/85">
              <FieldValue value={value} entity={entity} catalog={catalog} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function FieldValue({ value, entity, catalog }: { value: unknown; entity: Entity; catalog: Catalog }) {
  const mentions = mentionsInValue(catalog, entity.srn, value)

  const renderScalar = (scalar: unknown, key?: string) => {
    if (typeof scalar === 'string') {
      const mention = mentions[scalar]
      if (mention?.target) {
        return <EntityLink key={key} target={mention.target} version={mention.version} showTitle />
      }
      return <span key={key}>{scalar}</span>
    }
    if (typeof scalar === 'boolean') {
      return (
        <span key={key} className="font-mono text-[12.5px] text-primary">
          {String(scalar)}
        </span>
      )
    }
    if (typeof scalar === 'number') {
      return (
        <span key={key} className="font-mono text-[12.5px]">
          {scalar}
        </span>
      )
    }
    return null
  }

  if (Array.isArray(value)) {
    return (
      <ul className="flex flex-col gap-1.5">
        {value.map((item, index) => (
          <li key={index} className="flex flex-wrap items-baseline gap-x-2">
            {typeof item === 'object' && item !== null ? (
              Object.entries(item as Record<string, unknown>).map(([key, inner]) => (
                <span key={key} className="flex items-baseline gap-1">
                  <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
                  {renderScalar(inner, key) ?? <span>{String(inner)}</span>}
                </span>
              ))
            ) : (
              renderScalar(item, String(index))
            )}
          </li>
        ))}
      </ul>
    )
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <div className="flex flex-col gap-1.5">
        {Object.entries(value as Record<string, unknown>).map(([key, inner]) => (
          <div key={key} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
            {Array.isArray(inner) ? (
              <span className="flex flex-wrap gap-x-2">
                {inner.map((item, index) => renderScalar(item, String(index)) ?? null)}
              </span>
            ) : (
              (renderScalar(inner, key) ?? <span>{String(inner)}</span>)
            )}
          </div>
        ))}
      </div>
    )
  }

  return renderScalar(value) ?? <span>{String(value)}</span>
}
