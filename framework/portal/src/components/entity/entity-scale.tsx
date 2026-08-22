import type { Catalog, Entity } from '@/lib/catalog'

/**
 * How big this container is, derived — the half of ADR 0018 that is not a
 * warning.
 *
 * [0018-measured-facts-are-derived-or-dated](srn://metaframework/adr/0018-measured-facts-are-derived-or-dated)
 * takes measured numbers out of catalog prose and splits them in two by whether
 * the portal can reach them. A repository fact — a line count, a commit count —
 * is outside the catalog directory by construction and the digit simply goes. A
 * **catalog fact** is already computed by anything that loads the graph, so
 * nothing needs to be *measured*; something needs to be **rendered**. This is
 * that surface.
 *
 * It renders beside the prose rather than inside it, and that placement is the
 * decision, not a layout preference. The obvious alternative — a
 * `{{facts.entities}}` an author types into a sentence — was rejected on two
 * grounds already settled here: ADR 0009 turned down a second reference syntax
 * for wiki links, and a paragraph whose numbers are template calls reads, to
 * `grep` and to every consumer that is not this portal, as a paragraph with no
 * numbers in it. So the sentence keeps the claim ("small enough to reload on
 * every request") and the strip beside it carries the number, correctly, on
 * every commit forever.
 *
 * **Three counts, chosen because nothing else on the page prints them.** The
 * Contents section answers "which ones" and `EntityRelations` lists the
 * incoming edges one by one. What no surface stated was the aggregate — the
 * three numbers an author actually reached for when they typed
 * "`solutions/acme` (99 entities)" into a paragraph. (A per-kind chip bar used
 * to sit above this strip and answer "what is in here"; it was removed, and
 * this strip is now the only thing between the lede and the prose.)
 *
 * Containers only. A leaf kind has no subtree, and "1 entity, 3 artifacts" on a
 * datamodel page restates its own Artifacts section in worse words.
 */
export function EntityScale({
  entity,
  catalog,
  entities,
  descendants,
  className,
}: {
  entity: Entity
  catalog: Catalog
  /**
   * Direct children, as the page already computed them. Named `entities`
   * rather than `children` because `children` is JSX's own prop, and a
   * component that takes a list under that name reads as one that wraps
   * content.
   */
  entities: Entity[]
  /**
   * Everything *strictly below* those children — `descendantsOf`'s contract, and
   * the reason both lists are taken rather than one. Adding the two is what the
   * per-kind chips above already do; counting only the deep list would report a
   * solution's sub-components and quietly omit its products.
   */
  descendants: Entity[]
  className?: string
}) {
  if (entities.length === 0) return null

  const subtree = [entity, ...entities, ...descendants]
  const artifacts = subtree.reduce((total, member) => total + member.artifacts.length, 0)

  // Incoming edges from *outside* the subtree. An edge between two components of
  // the same product is internal wiring and says nothing about how much of the
  // catalog depends on this container — counting it would make a large product
  // look well-referenced for having parts.
  const inside = new Set(subtree.map((member) => member.srn))
  let referencesIn = 0
  for (const member of subtree) {
    for (const relation of catalog.inbound.get(member.srn) ?? []) {
      if (!inside.has(relation.from)) referencesIn += 1
    }
  }

  return (
    <section className={className} aria-label="Scale">
      {/* A description list, not three sibling paragraphs. The label-to-value
          binding was positional only — "Entities", "111", "beneath this one"
          read as three unrelated runs of text, and which number belonged to
          which word was a fact about where they sat. `entity-details.tsx` and
          the home page's solution cards already use `<dl>` for exactly this
          shape. A `<div>` grouping a `<dt>` with its `<dd>`s is valid inside a
          `<dl>`, so the flex item keeps its own box and nothing moves: preflight
          zeroes the margins `<dd>` would otherwise bring. */}
      <dl className="panel divide-y divide-border sm:flex sm:divide-x sm:divide-y-0">
        <Stat label="Entities" value={entities.length + descendants.length} caption="beneath this one" />
        <Stat label="Artifacts" value={artifacts} caption="files beside those documents" />
        <Stat label="References in" value={referencesIn} caption="edges from outside" />
      </dl>
    </section>
  )
}

function Stat({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div className="min-w-0 flex-1 px-4 py-3">
      <dt className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-[17px] tabular-nums text-foreground">{value.toLocaleString('en-US')}</dd>
      <dd className="mt-0.5 text-[11.5px] text-muted-foreground">{caption}</dd>
    </div>
  )
}
