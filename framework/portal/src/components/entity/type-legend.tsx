import { Shapes } from 'lucide-react'
import Link from 'next/link'
import { KindBadge } from '@/components/kind-badge'
import { SectionHeading } from '@/components/entity/section-heading'
import { type Catalog, type Entity, type EntityKind, entityHref } from '@/lib/catalog'
import { KIND_ORDER } from '@/lib/catalog/tree'
import { COMPONENT_TYPES, COMPONENT_TYPE_STYLES } from '@/lib/ui/component-type'
import { KIND_STYLES } from '@/lib/ui/kind'
import { cn } from '@/lib/utils'

/**
 * How to read this catalog — the orientation document on the console's front
 * page.
 *
 * A reader meeting this portal for the first time is shown three vocabularies
 * at once and told none of them: an address scheme in every URL and page
 * header, a coloured glyph per sidebar row, and a second quieter chip beside it
 * on component pages. Nothing anywhere says that the first is the identity of a
 * thing, the second answers *what sort of entity is this*, and the third
 * answers *what sort of component is this*. The two typing questions are
 * genuinely different: `kind` is the ontology, twelve values, declared by every
 * document and constrained to equal the bucket its directory sits in;
 * `component-type` is a second axis carried by exactly one of those twelve, ten
 * values, required on every component. Learning them by inference from hue
 * takes a long time and gets the relationship wrong.
 *
 * ## It restates nothing
 *
 * Every glyph, hue, label, gloss and worked example on this panel is read out
 * of something the rest of the console already draws from — `KIND_STYLES`
 * (lib/ui/kind.ts, consumed by the sidebar, the badges, the entity links and
 * both graphs), `COMPONENT_TYPE_STYLES` (lib/ui/component-type.ts, consumed by
 * the block `KindBadge` nests in a component's badge, and by `EntityGlyph`),
 * and for the examples the loaded catalog itself.
 * Nothing is copied here, including the counts in the subtitle, which are the
 * array lengths. That is the whole design constraint and not a nicety: a legend
 * that can disagree with the thing it explains is worse than no legend, because
 * it is believed. Add a kind or a component-type and this panel grows a correct
 * row; the only way to get a wrong one is to write a wrong map, which is where
 * a wrong chip would come from too.
 *
 * The examples carry the same rule one step further. They are not written down
 * — they are the first entity of each kind in the loaded catalog, in SRN order,
 * so they are real, they link somewhere, and they cannot describe a catalog the
 * reader is not looking at. A kind or a type with no instance shows no example
 * rather than an invented one, which is also how the reader learns the catalog
 * does not use it.
 *
 * ## Three times bigger, measured
 *
 * The request was the console's own icons at 3×. The reference is the sidebar
 * row (`catalog-tree.tsx`, `size-3.5` = 14px) — the place a reader meets these
 * glyphs most, and the surface the request named — so 3× is 42px
 * (`size-10.5`), one size for both halves. Stroke width is left at Lucide's
 * default, exactly as that call site leaves it: the stroke is a fraction of the
 * viewBox, so scaling the box scales the stroke and the glyph is *the same
 * icon*, not a lookalike drawn thinner. (The badges draw theirs at 12px, so
 * against those this panel is 3.5×; no single size is 3× both, and the sidebar
 * is the one the request named.)
 *
 * ## Why the front page, one column, and open
 *
 * The vocabulary is the framework's, not any one solution's: the same twelve
 * kinds, ten component-types and one address grammar are drawn for every
 * catalog this portal can load. Repeated on each solution page it would state a
 * global fact once per solution and imply it were local; stated once on the
 * page that lists the solutions, it reads as what it is — the key to the
 * console, given before the reader enters one.
 *
 * One column, because this is a document rather than a swatch board. Two and
 * three-column grids fit more glyphs on a screen and make each row a label with
 * a caption; a single column gives every entry the width to say where the thing
 * may live, what it carries, and what a real one looks like — which is the
 * difference between a key and an explanation.
 *
 * Open, not folded, and that is a reversal. A fold is right for a reference
 * consulted by someone who knows what they are looking for, and wrong for the
 * first paragraph of a vocabulary: the reader this exists for does not know to
 * click a control named after a thing they have not learned yet. The solution
 * cards above it already draw kind glyphs, so it explains what is on screen
 * beside it.
 */

/**
 * 42px: three times the 14px the sidebar row draws. One constant, so the two
 * halves of this panel cannot drift into different "3×"es.
 */
const GLYPH = 'size-10.5'

/** The label, typeset the way the badge or chip typesets it, so the word matches too. */
const KIND_LABEL = 'font-mono text-[12.5px] font-semibold uppercase tracking-wider'
const CTYPE_LABEL = 'font-mono text-[12.5px] font-medium'

const LEAD = 'mt-1 text-[13px] leading-relaxed text-foreground/80'
const DETAIL = 'mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground'
const INTRO = 'mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted-foreground'

/** One column, always: each row is a paragraph, not a swatch. */
const LIST = 'mt-4 flex flex-col gap-5'
const ROW = 'flex items-start gap-4'

/**
 * The first entity of each kind, and of each component-type, in SRN order.
 *
 * Deterministic by sort rather than by map insertion, so the example a reader
 * is shown does not depend on the order the loader happened to walk the disk.
 */
function examples(catalog: Catalog) {
  const byKind = new Map<string, string>()
  const byType = new Map<string, string>()
  const sorted = [...catalog.entities.values()].sort((a, b) => a.srn.localeCompare(b.srn))
  for (const entity of sorted) {
    if (!byKind.has(entity.kind)) byKind.set(entity.kind, entity.srn)
    const type = entity.frontmatter['component-type']
    if (entity.kind === 'component' && typeof type === 'string' && !byType.has(type)) {
      byType.set(type, entity.srn)
    }
  }
  return { byKind, byType }
}

/** A real SRN from this catalog, rendered as a link and marked as an example. */
function Example({ srn }: { srn: string | undefined }) {
  if (!srn) return null
  return (
    <p className="mt-2 text-[12px]">
      <span className="text-muted-foreground/70">e.g. </span>
      <Link
        href={entityHref(srn)}
        className="focusable rounded font-mono text-[11.5px] text-muted-foreground/90 underline decoration-border underline-offset-2 transition hover:text-primary hover:decoration-primary"
      >
        {srn}
      </Link>
    </p>
  )
}

/**
 * The address grammar, taught from a real address rather than a specimen.
 *
 * The segments are split out of an actual catalog SRN: a solution name, then
 * kind/name pairs repeating as deeply as the thing nests. Colouring each kind
 * segment with that kind's own hue is the join a reader needs — it says the
 * word in the URL and the glyph in the sidebar are the same field, which is the
 * single most useful thing to know about this portal.
 */
function AddressGuide({ srn }: { srn: string }) {
  const [solution, ...rest] = srn.replace(/^srn:\/\//, '').split('/')
  const pairs: { kind: string; name: string }[] = []
  for (let index = 0; index + 1 < rest.length; index += 2) {
    pairs.push({ kind: rest[index], name: rest[index + 1] })
  }

  return (
    <div className="mt-3.5">
      <p className="panel overflow-x-auto px-4 py-3 font-mono text-[13px] whitespace-nowrap">
        <span className="text-muted-foreground/60">srn://</span>
        <span className={KIND_STYLES.solution.text}>{solution}</span>
        {pairs.map(({ kind, name }) => {
          const style = KIND_STYLES[kind as EntityKind] as (typeof KIND_STYLES)[EntityKind] | undefined
          return (
            <span key={`${kind}/${name}`}>
              <span className="text-muted-foreground/40">/</span>
              <span className={style ? style.text : 'text-muted-foreground'}>{kind}</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="text-foreground/85">{name}</span>
            </span>
          )
        })}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
        <li>
          <span className={cn('font-mono', KIND_STYLES.solution.text)}>{solution}</span> — the solution.
          Every reference stays inside one; nothing here can point into another.
        </li>
        <li>
          <span className="font-mono text-foreground/85">kind/name</span> — repeated once per level of
          nesting. The coloured word is the same <code className="font-mono">kind</code> field the badge
          and the sidebar glyph are drawing.
        </li>
        <li>
          The address <em>is</em> the path on disk under{' '}
          <code className="font-mono text-foreground/80">solutions/</code>, and the path in this
          portal&rsquo;s URL. One identity, three places — so a directory listing, a link and a page
          header can never disagree.
        </li>
        <li>
          Two suffixes can ride on top of it —{' '}
          <code className="font-mono text-foreground/80">.schema</code> names a sibling file of the
          entity, <code className="font-mono text-foreground/80">@4</code> pins a version. They combine,
          in that order, and the next section is about what they mean together.
        </li>
      </ul>
    </div>
  )
}

/**
 * Versions, taught from a real entity in this catalog rather than from `X@N`.
 *
 * The rule a reader most often gets wrong is not "entities have versions" — it
 * is *where the number lives*. There is exactly one clock per entity, in its
 * `index.md` frontmatter, and it covers the whole directory: prose, frontmatter
 * and every sibling artifact. So `@N` on an artifact address is a coordinate of
 * the **entity**, never of the file, and pinning the entity pins every file
 * under it. Spelling that out with four addresses over one real entity does the
 * work that a paragraph about it does not.
 *
 * The fifth row is the ordering trap and is the reason this is a table rather
 * than prose: `money@4.schema` reads perfectly naturally and is a syntax error.
 * Showing the wrong form beside the right ones is the only way a reader learns
 * it before the parser tells them.
 */
function VersionGuide({ srn, version }: { srn: string; version: number }) {
  const short = srn.replace(/^srn:\/\//, '')
  // A pin one behind the current version, when there is one — a real coordinate
  // that resolves, rather than an invented `@4` on a v1 entity.
  const pin = version > 1 ? version - 1 : version
  const rows: { address: string; means: string; bad?: boolean }[] = [
    { address: short, means: 'The entity. No pin means “whatever it is now”.' },
    { address: `${short}@${pin}`, means: `The same entity as it stood at version ${pin}.` },
    { address: `${short}.schema`, means: 'Its schema.json — a sibling file, addressed through the entity.' },
    {
      address: `${short}.schema@${pin}`,
      means: `That file as it was inside snapshot ${pin}.`,
    },
    {
      address: `${short}@${pin}.schema`,
      means: 'Syntax error — the file suffix comes first, then the version.',
      bad: true,
    },
  ]

  return (
    <div className="mt-3.5">
      <ul className="panel flex flex-col divide-y divide-border/70">
        {rows.map(({ address, means, bad }) => (
          <li key={address} className="flex flex-col gap-1 px-4 py-2.5 lg:flex-row lg:items-baseline lg:gap-4">
            <code
              className={cn(
                'shrink-0 font-mono text-[12px] lg:w-[27rem]',
                bad ? 'text-destructive/85 line-through decoration-destructive/40' : 'text-foreground/85',
              )}
            >
              <span className="text-muted-foreground/50">srn://</span>
              {address}
            </code>
            <span className="text-[12.5px] leading-relaxed text-muted-foreground">{means}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
        <li>
          <strong className="text-foreground/85">One integer per entity</strong>, in its{' '}
          <code className="font-mono">index.md</code>. It starts at 1 and moves by exactly 1 — no
          semver, no gaps, no strings.
        </li>
        <li>
          <strong className="text-foreground/85">Any content change bumps it, in the same commit</strong>{' '}
          — the prose, a frontmatter field, or any sibling artifact. Changing only{' '}
          <code className="font-mono">status</code> does not: that is workflow state, not content.
        </li>
        <li>
          <strong className="text-foreground/85">The frontmatter is the only clock.</strong> An artifact
          never carries a <code className="font-mono">version:</code> of its own, and a schema&rsquo;s{' '}
          <code className="font-mono">$id</code> and <code className="font-mono">x-srn</code> never carry{' '}
          <code className="font-mono">@N</code> — they address the current schema. One number to bump,
          nothing that can drift out of step with it.
        </li>
        <li>
          <strong className="text-foreground/85">A version resolves through git</strong>, not through a
          second index of its own: <code className="font-mono">@N</code> maps to the commit that last
          carried it, and the file is read out of that commit. Which is why the portal can show you any
          past version of a page — that is what the <code className="font-mono">v</code> control in an
          entity&rsquo;s header does.
        </li>
      </ul>
      <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-muted-foreground/80">
        Three checks hold it together:{' '}
        <code className="font-mono text-foreground/75">E_VER_UNBUMPED</code> when content moved and the
        number stood still, <code className="font-mono text-foreground/75">W_REF_STALE_PIN</code> when a
        pin points at a version that is no longer current, and{' '}
        <code className="font-mono text-foreground/75">E_SRN_VERSION</code> when it points past the end
        of the history altogether.
      </p>
    </div>
  )
}

/**
 * The datamodel the version section is taught from: the first in SRN order that
 * has actually been revised, else the first of any version.
 */
function pickVersionExample(catalog: Catalog): Entity | undefined {
  const datamodels = [...catalog.entities.values()]
    .filter((entity) => entity.kind === 'datamodel')
    .sort((a, b) => a.srn.localeCompare(b.srn))
  return datamodels.find((entity) => entity.frontmatter.version > 1) ?? datamodels[0]
}

export function TypeLegend({ catalog, className }: { catalog: Catalog; className?: string }) {
  const { byKind, byType } = examples(catalog)
  // The address is taught from a component when the catalog has one: it is the
  // only kind that nests, so it is the only example that shows the kind/name
  // pair repeating. Any entity will do when it does not.
  const addressExample = byKind.get('component') ?? byKind.get('product') ?? byKind.get('solution')
  // A datamodel for the version section, because it is the kind whose sibling
  // file (`schema.json`) every reader already knows about — so the `.schema@N`
  // row teaches the pin rather than the role table.
  //
  // Preferring one past version 1 is the whole point of the example: on a v1
  // entity the pinned row and the unpinned row name the same snapshot, and the
  // distinction the section exists to draw is invisible. Falls back to any
  // datamodel in a catalog whose entities have not been revised yet.
  const versionEntity = pickVersionExample(catalog)

  return (
    <section aria-labelledby="type-legend" className={cn('panel px-5 pt-4 pb-6', className)}>
      <div className="flex items-center gap-2.5">
        <Shapes className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <SectionHeading id="type-legend" level={2} className="text-[11px]">
          How to read this catalog
        </SectionHeading>
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground/75">
          addresses, versions, the {KIND_ORDER.length} kinds and the {COMPONENT_TYPES.length} component-types
        </span>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <SectionHeading level={3} className="text-[11px]">
          Addresses
        </SectionHeading>
        <p className={INTRO}>
          Everything in this catalog is a directory with an <code className="font-mono">index.md</code>,
          and every one of them has a single canonical address — its SRN.
        </p>
        {addressExample && <AddressGuide srn={addressExample} />}

        {versionEntity && (
          <>
            <div className="rule-fade my-6" />
            <SectionHeading level={3} className="text-[11px]">
              Versions
            </SectionHeading>
            <p className={INTRO}>
              Every entity carries a version, and an address can name one. Together they are how this
              catalog talks about the past without keeping a copy of it.
            </p>
            <VersionGuide srn={versionEntity.srn} version={versionEntity.frontmatter.version} />
          </>
        )}

        <div className="rule-fade my-6" />

        <SectionHeading level={3} className="text-[11px]">
          Kind
        </SectionHeading>
        <p className={INTRO}>
          What sort of entity something is. Every document declares exactly one, and it must equal the
          bucket its directory sits in — so the badge in a page header, the glyph in the sidebar and the
          word in the address are all reading one field. There are {KIND_ORDER.length}, and the list is
          closed.
        </p>
        <ul className={LIST}>
          {KIND_ORDER.map((kind) => {
            const style = KIND_STYLES[kind]
            const Icon = style.icon
            return (
              <li key={kind} className={ROW}>
                <Icon className={cn(GLYPH, 'shrink-0', style.text)} aria-hidden />
                <div className="min-w-0 pt-0.5">
                  <p className={cn(KIND_LABEL, style.text)}>{style.label}</p>
                  <p className={LEAD}>{style.blurb}</p>
                  <p className={DETAIL}>{style.detail}</p>
                  <Example srn={byKind.get(kind)} />
                </div>
              </li>
            )
          })}
        </ul>

        <div className="rule-fade my-6" />

        <SectionHeading level={3} className="text-[11px]">
          Component type
        </SectionHeading>
        {/* The badge is the real one, not a drawing of it: the relationship
            between the two registers is "this kind, and only this kind, takes
            a second axis", and showing the kind it applies to says that in
            fewer words than a sentence can. Set inline in the prose rather
            than as a flex row of spans — a flex paragraph makes each span an
            unbreakable item, so the clause after the badge could only ever
            start on a new line and the sentence read as two. `KindBadge` is
            `inline-flex`, which flows in text as one long word. */}
        <p className={INTRO}>
          What sort of component it is — a second axis, carried only by{' '}
          <KindBadge kind="component" className="mx-0.5 align-middle" /> entities. Every component
          declares one, and the {COMPONENT_TYPES.length} are closed: the portal shapes graph nodes by the
          value and the spec&rsquo;s own rules check it, so an eleventh would be an error rather than
          documentation.
        </p>
        <ul className={LIST}>
          {COMPONENT_TYPES.map((type) => {
            const style = COMPONENT_TYPE_STYLES[type]
            const Icon = style.icon
            const hue = `var(${style.colorVar})`
            return (
              <li key={type} className={ROW}>
                <Icon className={cn(GLYPH, 'shrink-0')} style={{ color: hue }} aria-hidden />
                <div className="min-w-0 pt-0.5">
                  <p className={CTYPE_LABEL} style={{ color: hue }}>
                    {type}
                  </p>
                  <p className={LEAD}>{style.blurb}</p>
                  <p className={DETAIL}>{style.detail}</p>
                  <Example srn={byType.get(type)} />
                </div>
              </li>
            )
          })}
        </ul>

        <p className="mt-6 max-w-3xl border-t border-border pt-3.5 text-[11.5px] leading-relaxed text-muted-foreground/80">
          Hue answers one question in this console — which value — and never how important. The whole
          component-type register is drawn darker than every kind hue by construction, so a chip is never
          misread as a badge; and the word carries the meaning either way, which is why every glyph here
          has one beside it.
        </p>
      </div>
    </section>
  )
}
