import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import { participantDiagnostics } from './participants-checks'

/**
 * One hermetic temp catalog, and every protocol in it is a case.
 *
 * A temp tree rather than a hand-built {@link Catalog} because four of the five
 * classes ask about a *second* entity — the kind a `ref` lands on, the edges
 * pointing back at the protocol — and a fixture that hand-writes the resolved
 * graph would be asserting against the loader's answer rather than obtaining it.
 * The precedent is `lib/structure/structure.test.ts`, which builds its graph
 * rules' input the same way.
 *
 * Every case carries its counterpart: `order-placement` is the well-formed
 * protocol the RED fixtures are deviations from, and each `describe` asserts both
 * ends — the violation fires, and the near-miss beside it does not.
 */

const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map((diagnostic) => diagnostic.code)

const forProtocol = (name: string) => found.filter((diagnostic) => diagnostic.srn.endsWith(`/protocol/${name}`))

let catalogDir: string
let catalog: Catalog
let found: Array<Diagnostic & { srn: string }>

async function entity(relDir: string, frontmatter: Record<string, unknown>) {
  const target = path.join(catalogDir, relDir)
  await mkdir(target, { recursive: true })
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) =>
      typeof value === 'object' && value !== null
        ? `${key}:\n${JSON.stringify(value, null, 2)
            .split('\n')
            .map((line) => `  ${line}`)
            .join('\n')}`
        : `${key}: ${JSON.stringify(value)}`,
    )
    .join('\n')
  await writeFile(path.join(target, 'index.md'), `---\n${yaml}\n---\n\nProse.\n`)
}

const base = (name: string, kind: string, extra: Record<string, unknown> = {}) => ({
  name,
  kind,
  version: 1,
  title: name,
  summary: `The ${name} ${kind}.`,
  status: 'approved',
  ...({
    solution: { vision: 'Sell things reliably.' },
    product: { lifecycle: 'active' },
    component: { 'component-type': 'service', lifecycle: 'released' },
    datamodel: { usage: 'both' },
    actor: { 'actor-type': 'human', goals: ['Buy things.'] },
    protocol: { style: 'request-response' },
  }[kind] ?? {}),
  ...extra,
})

const protocol = (name: string, participants: unknown, extra: Record<string, unknown> = {}) =>
  base(name, 'protocol', participants === undefined ? extra : { participants, ...extra })

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-participants-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/actor/customer', base('customer', 'actor'))
  await entity('acme/datamodel/order', base('order', 'datamodel'))
  await entity('acme/product/shop', base('shop', 'product'))

  // --- the components, and which protocols each points back at ---------------
  const points = (name: string, relations: Record<string, string[]>) =>
    entity(`acme/product/shop/component/${name}`, base(name, 'component', { relations }))

  await points('checkout', {
    exposes: [
      '/product/shop/protocol/order-placement',
      '/product/shop/protocol/aliases-collide',
      '/product/shop/protocol/wrong-kind',
      '/product/shop/protocol/one-sided',
      '/product/shop/protocol/no-list',
      '/product/shop/protocol/not-a-list',
      // So `solo` is a case about cardinality and nothing else.
      '/product/shop/protocol/solo',
    ],
  })
  await points('inventory', {
    uses: [
      '/product/shop/protocol/order-placement',
      '/product/shop/protocol/unlisted-consumer',
      // The other half of the "absent list vs. present-but-empty list" boundary.
      '/product/shop/protocol/empty-list',
    ],
  })
  // Named as a participant everywhere and pointing back at nothing — the
  // component side of the swap that has not happened yet.
  await points('pricing', {})

  // --- GREEN: the protocol every RED case below is a deviation from ---------
  await entity(
    'acme/product/shop/protocol/order-placement',
    protocol('order-placement', [
      { alias: 'customer', ref: '/actor/customer', role: 'initiator' },
      { alias: 'checkout', ref: '/product/shop/component/checkout', role: 'responder' },
      { alias: 'inventory', ref: '/product/shop/component/inventory' },
    ]),
  )

  // --- E_PROTO_PARTICIPANTS -------------------------------------------------
  await entity('acme/product/shop/protocol/no-list', protocol('no-list', undefined))
  await entity(
    'acme/product/shop/protocol/solo',
    protocol('solo', [{ alias: 'checkout', ref: '/product/shop/component/checkout' }]),
  )
  await entity('acme/product/shop/protocol/empty-list', protocol('empty-list', []))
  // Not a list at all: the kind schema's finding, and this module says nothing.
  await entity('acme/product/shop/protocol/not-a-list', protocol('not-a-list', 'checkout and inventory'))

  // --- E_PROTO_ALIAS_DUP ----------------------------------------------------
  await entity(
    'acme/product/shop/protocol/aliases-collide',
    protocol('aliases-collide', [
      { alias: 'checkout', ref: '/product/shop/component/checkout' },
      { alias: 'checkout', ref: '/actor/customer' },
    ]),
  )

  // --- E_PROTO_PARTICIPANT_KIND, and the E_SRN_* classes on the way ---------
  await entity(
    'acme/product/shop/protocol/wrong-kind',
    protocol('wrong-kind', [
      { alias: 'checkout', ref: '/product/shop/component/checkout' },
      // A datamodel cannot participate.
      { alias: 'order', ref: '/datamodel/order' },
      // A legal artifact SRN is still not an entity.
      { alias: 'wire', ref: '/product/shop/protocol/order-placement.transport' },
      // An actor owns no roles at all, so V5 fails before the surface class.
      { alias: 'profile', ref: '/actor/customer.profile' },
      // Resolves, and to nothing.
      { alias: 'ghost', ref: '/product/shop/component/nobody' },
    ]),
  )

  // --- W_PROTO_PARTICIPANT_UNLINKED ----------------------------------------
  // `pricing` points back at nothing; `customer` is an actor and is exempt.
  await entity(
    'acme/product/shop/protocol/one-sided',
    protocol('one-sided', [
      { alias: 'checkout', ref: '/product/shop/component/checkout' },
      { alias: 'pricing', ref: '/product/shop/component/pricing' },
      { alias: 'customer', ref: '/actor/customer' },
    ]),
  )

  // --- W_PROTO_PARTICIPANT_MISSING -----------------------------------------
  // `inventory` uses this protocol and is not in the list.
  await entity(
    'acme/product/shop/protocol/unlisted-consumer',
    protocol('unlisted-consumer', [
      { alias: 'customer', ref: '/actor/customer' },
      { alias: 'pricing', ref: '/product/shop/component/pricing' },
    ]),
  )

  catalog = await loadCatalog({ catalogDir })
  found = participantDiagnostics(catalog).map((diagnostic) => ({ ...diagnostic, srn: diagnostic.srn ?? '' }))
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

describe('the well-formed protocol', () => {
  it('reports nothing at all', () => {
    expect(forProtocol('order-placement')).toEqual([])
  })

  it('puts every finding on the protocol that declared the list', () => {
    // The shape check carries its own floor. `found` is non-empty only because
    // sibling tests below pin exact lengths for four codes; delete those and
    // this block would iterate nothing and still pass.
    expect(found.length).toBeGreaterThan(0)
    for (const diagnostic of found) {
      expect(diagnostic.path).toMatch(/^acme\/product\/shop\/protocol\/[a-z-]+\/index\.md$/)
      expect(diagnostic.srn).toMatch(/^srn:\/\/acme\/product\/shop\/protocol\/[a-z-]+$/)
    }
  })
})

describe('E_PROTO_PARTICIPANTS — the list is absent, or there is no conversation in it', () => {
  it('fires when the frontmatter carries no participants at all', () => {
    expect(codes(forProtocol('no-list'))).toEqual(['E_PROTO_PARTICIPANTS'])
    expect(forProtocol('no-list')[0].message).toContain('absent')
    expect(forProtocol('no-list')[0].severity).toBe('error')
  })

  it('fires on a single entry', () => {
    expect(codes(forProtocol('solo'))).toEqual(['E_PROTO_PARTICIPANTS'])
    expect(forProtocol('solo')[0].message).toContain('1 entry')
  })

  it('fires on an empty list', () => {
    expect(codes(forProtocol('empty-list'))).toContain('E_PROTO_PARTICIPANTS')
    expect(forProtocol('empty-list')[0].message).toContain('no entries')
  })

  it('is reported ONCE — the kind schema no longer raises E_FM_SCHEMA for the same defect', () => {
    // The `metric`/`adr` manoeuvre: `KIND_FRONTMATTER.protocol` used to carry
    // `.min(2)`, so this document failed as the generic class and the class the
    // spec names for it could never appear. Both halves are asserted, because
    // relaxing the schema without raising the class would silence the rule.
    const loader = catalog.diagnostics.filter(
      (diagnostic) => diagnostic.srn?.endsWith('/protocol/solo') || diagnostic.srn?.endsWith('/protocol/no-list'),
    )
    expect(codes(loader)).not.toContain('E_FM_SCHEMA')
  })

  it('leaves a mistyped participants to E_FM_SCHEMA and says nothing itself', () => {
    // "There is no conversation here" is a different claim from "that field is
    // mistyped", and a cardinality class must not be used for a shape error.
    expect(forProtocol('not-a-list')).toEqual([])
    const loader = catalog.diagnostics.filter((diagnostic) => diagnostic.srn?.endsWith('/protocol/not-a-list'))
    expect(codes(loader)).toContain('E_FM_SCHEMA')
  })

  it('suppresses both joins when there is no list to join against', () => {
    // `checkout` exposes `no-list`, so the MISSING join would fire on it. With no
    // list there is nothing for a back-edge to be missing from, and one warning
    // per edge would bury the error that actually needs fixing.
    expect(codes(forProtocol('no-list'))).not.toContain('W_PROTO_PARTICIPANT_MISSING')
    expect(codes(forProtocol('not-a-list'))).toEqual([])
  })

  it('still joins a list that is merely short — a present list is a list', () => {
    // The boundary the case above draws its other half of: `empty-list` and
    // `no-list` are both "fewer than two", and `inventory` uses each of them. The
    // one that authored a list gets told who is missing from it.
    const missing = forProtocol('empty-list').filter((d) => d.code === 'W_PROTO_PARTICIPANT_MISSING')
    expect(missing).toHaveLength(1)
    expect(missing[0].message).toContain('srn://acme/product/shop/component/inventory')
  })
})

describe('E_PROTO_ALIAS_DUP — one alias, two lifelines', () => {
  it('fires once, on the later entry, naming the one it collides with', () => {
    expect(codes(forProtocol('aliases-collide'))).toContain('E_PROTO_ALIAS_DUP')
    const dup = forProtocol('aliases-collide').filter((d) => d.code === 'E_PROTO_ALIAS_DUP')
    expect(dup).toHaveLength(1)
    expect(dup[0].message).toContain('participants[1]')
    expect(dup[0].message).toContain('participants[0]')
    expect(dup[0].message).toContain('"checkout"')
  })

  it('does not fire on distinct aliases', () => {
    expect(codes(forProtocol('order-placement'))).not.toContain('E_PROTO_ALIAS_DUP')
  })
})

describe('E_PROTO_PARTICIPANT_KIND — participation is typed over kinds', () => {
  const wrongKind = () => forProtocol('wrong-kind')

  it('fires on a ref that resolves to a kind that cannot participate', () => {
    const kinds = wrongKind().filter((d) => d.code === 'E_PROTO_PARTICIPANT_KIND')
    expect(kinds.map((d) => d.message.match(/participants\[(\d)\]/)?.[1])).toEqual(['1', '2'])
    expect(kinds[0].message).toContain('resolves to a datamodel')
  })

  it('fires on a legal artifact SRN, with the suffix named as the problem', () => {
    const artifact = wrongKind().find((d) => d.message.includes('participants[2]'))
    expect(artifact?.code).toBe('E_PROTO_PARTICIPANT_KIND')
    expect(artifact?.message).toContain('.transport')
    expect(artifact?.message).toContain('an artifact has no kind')
  })

  it('leaves an illegal suffix to E_SRN_ARTIFACT — V5 is static and comes first', () => {
    const suffix = wrongKind().find((d) => d.message.includes('participants[3]'))
    expect(suffix?.code).toBe('E_SRN_ARTIFACT')
  })

  it('reports a reference that resolves to nothing as E_SRN_DANGLING, not as a kind mismatch', () => {
    const dangling = wrongKind().find((d) => d.message.includes('participants[4]'))
    expect(dangling?.code).toBe('E_SRN_DANGLING')
    expect(dangling?.message).toContain('srn://acme/product/shop/component/nobody')
  })

  it('admits a component, a product and an actor', () => {
    expect(codes(forProtocol('order-placement'))).not.toContain('E_PROTO_PARTICIPANT_KIND')
  })
})

describe('W_PROTO_PARTICIPANT_UNLINKED — a participant whose own document points at nothing', () => {
  it('fires on a component participant with neither exposes nor uses for the protocol', () => {
    const unlinked = forProtocol('one-sided').filter((d) => d.code === 'W_PROTO_PARTICIPANT_UNLINKED')
    expect(unlinked).toHaveLength(1)
    expect(unlinked[0].severity).toBe('warning')
    expect(unlinked[0].message).toContain('srn://acme/product/shop/component/pricing')
  })

  it('exempts actors — an actor is not a catalogued implementation and owes no back-edge', () => {
    const unlinked = forProtocol('one-sided').filter((d) => d.code === 'W_PROTO_PARTICIPANT_UNLINKED')
    expect(unlinked.some((d) => d.message.includes('/actor/customer'))).toBe(false)
  })

  it('does not fire when the component carries the edge', () => {
    expect(codes(forProtocol('order-placement'))).not.toContain('W_PROTO_PARTICIPANT_UNLINKED')
  })
})

describe('W_PROTO_PARTICIPANT_MISSING — an edge with nobody to label its lifeline', () => {
  it('fires on a component that uses the protocol and is not in the list', () => {
    const missing = forProtocol('unlisted-consumer').filter((d) => d.code === 'W_PROTO_PARTICIPANT_MISSING')
    expect(missing).toHaveLength(1)
    expect(missing[0].severity).toBe('warning')
    expect(missing[0].message).toContain('srn://acme/product/shop/component/inventory')
    expect(missing[0].message).toContain('uses')
  })

  it('does not fire when both ends of every edge are declared', () => {
    expect(codes(forProtocol('order-placement'))).not.toContain('W_PROTO_PARTICIPANT_MISSING')
  })
})

/* ------------------------------------------------------- the shipped catalog */

describe('the catalog under solutions/', () => {
  let shipped: Diagnostic[]

  beforeAll(async () => {
    const loaded = await loadCatalog({ catalogDir: path.resolve(process.cwd(), '../../solutions') })
    shipped = participantDiagnostics(loaded)
  })

  it('declares no participant this module calls an error', () => {
    // The same guard `fixture-check.test.ts` holds over the loader: the shipped
    // solutions are exemplars, so a new emitter that turns one of them red is
    // either a real defect in the catalog or a rule read too widely.
    expect(shipped.filter((d) => d.severity === 'error').map((d) => `${d.code} ${d.path} — ${d.message}`)).toEqual([])
  })

  it('finds the back-edge drift the two warnings were written for', () => {
    // Not a count: the catalog is authored content and the number moves. What
    // must hold is that the join is live on real input rather than only on the
    // temp fixture above.
    expect(shipped.filter((d) => d.code === 'W_PROTO_PARTICIPANT_UNLINKED').length).toBeGreaterThan(0)
    expect(shipped.filter((d) => d.code === 'W_PROTO_PARTICIPANT_MISSING').length).toBeGreaterThan(0)
    expect(shipped.every((d) => d.severity === 'warning')).toBe(true)
  })
})
