import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import { actorDiagnostics, participatingActors } from './actor'

/**
 * One hermetic temp catalog, because both actor rules are about the edges around
 * an actor and neither is answerable from its own document. The fixture holds
 * one actor per outcome — a participant, a journey-only walker, an orphan, and
 * one wired backwards — so every assertion below is a single named entity rather
 * than a count.
 */

let catalogDir: string
let catalog: Catalog
let diagnostics: Diagnostic[]

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

async function artifact(relDir: string, name: string, raw: string) {
  await mkdir(path.join(catalogDir, relDir), { recursive: true })
  await writeFile(path.join(catalogDir, relDir, name), raw)
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
    actor: { 'actor-type': 'human', goals: ['Buy a thing.'] },
    protocol: { style: 'request-response' },
  }[kind] ?? {}),
  ...extra,
})

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-actor-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/product/shop', base('shop', 'product'))
  await entity('acme/product/shop/component/checkout', base('checkout', 'component'))
  await entity('acme/environment/production', base('production', 'environment', { 'environment-type': 'production' }))

  // Named in a protocol's participant list — the surface participation is
  // authored on.
  await entity('acme/actor/customer', base('customer', 'actor'))
  // Named in no protocol, but walks a journey. actor.md's sentence predates the
  // journey kind; the rule's subject ("an actor nobody talks to") does not.
  await entity('acme/actor/courier', base('courier', 'actor'))
  // Named nowhere at all, and pointing outward at a component — which is reach,
  // not participation, and must not rescue it.
  await entity('acme/actor/shop-admin', base('shop-admin', 'actor', { relations: { uses: ['/product/shop/component/checkout'] } }))
  // A retired role: named nowhere, superseded, and kept on disk because
  // evolution.md forbids deleting it. The finished half of a swap, which is
  // exactly the state ACT6 guesses at and this one states.
  await entity('acme/actor/floor-manager', base('floor-manager', 'actor', { status: 'deprecated' }))
  // Wired backwards: participation restated from the actor side.
  await entity(
    'acme/actor/support-agent',
    base('support-agent', 'actor', {
      relations: { uses: ['/protocol/order-placement', '/environment/production'] },
    }),
  )

  await entity(
    'acme/protocol/order-placement',
    base('order-placement', 'protocol', {
      participants: [
        { alias: 'customer', ref: '/actor/customer' },
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
      ],
    }),
  )

  await entity('acme/journey/track-a-parcel', base('track-a-parcel', 'journey', { actor: '/actor/courier' }))
  await artifact(
    'acme/journey/track-a-parcel',
    'journey.yaml',
    [
      'name: track-a-parcel',
      'steps:',
      '  - actor: /actor/courier',
      '    touches: /product/shop/component/checkout',
      '  - actor: /actor/courier',
      '    touches: /product/shop',
      '',
    ].join('\n'),
  )

  catalog = await loadCatalog({ catalogDir })
  diagnostics = actorDiagnostics(catalog)
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

const found = (code: string) => diagnostics.filter((diagnostic) => diagnostic.code === code)

describe('participatingActors — who the catalog actually talks to', () => {
  it('loads the fixture with no errors of its own', () => {
    expect(catalog.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([])
  })

  it('counts a protocol participant and a journey step actor, and nothing else', () => {
    expect([...participatingActors(catalog)].filter((srn) => srn.includes('/actor/')).sort()).toEqual([
      'srn://acme/actor/courier',
      'srn://acme/actor/customer',
    ])
  })
})

describe('actorDiagnostics — ACT6, the orphan', () => {
  it('fires W_ACTOR_ORPHAN on the actor nobody names', () => {
    expect(found('W_ACTOR_ORPHAN')).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        srn: 'srn://acme/actor/shop-admin',
        path: 'acme/actor/shop-admin/index.md',
      }),
    )
  })

  it('still fires on an actor that claims participation from its own side', () => {
    // support-agent authors `uses` toward the protocol, and that is exactly not
    // the channel: the protocol's participant list does not name it, so both
    // codes fire and both are fixed by the same edit — move the statement.
    expect(found('W_ACTOR_ORPHAN').map((diagnostic) => diagnostic.srn)).toEqual([
      'srn://acme/actor/shop-admin',
      'srn://acme/actor/support-agent',
    ])
  })

  it('does not fire on an actor a protocol lists as a participant', () => {
    expect(found('W_ACTOR_ORPHAN').map((diagnostic) => diagnostic.srn)).not.toContain('srn://acme/actor/customer')
  })

  it('does not fire on an actor that only walks a journey', () => {
    // The widening, asserted rather than described: courier appears in no
    // participant list and is still not a leftover.
    expect(found('W_ACTOR_ORPHAN').map((diagnostic) => diagnostic.srn)).not.toContain('srn://acme/actor/courier')
  })

  it('does not fire on a deprecated actor — a finished swap is not a leftover', () => {
    // floor-manager is named by nothing, exactly like shop-admin. The one thing
    // that differs is `status`, and it is the catalog answering the question the
    // rule's sentence only guesses at.
    expect(catalog.entities.get('srn://acme/actor/floor-manager')?.frontmatter.status).toBe('deprecated')
    expect(participatingActors(catalog).has('srn://acme/actor/floor-manager')).toBe(false)
    expect(found('W_ACTOR_ORPHAN').map((diagnostic) => diagnostic.srn)).not.toContain('srn://acme/actor/floor-manager')
  })

  it('does not let an actor’s own outbound "uses" edge count as participation', () => {
    // shop-admin names a component and is still an orphan. Counting reach would
    // make the rule unfireable on nearly every actor in a real catalog.
    const admin = catalog.entities.get('srn://acme/actor/shop-admin')
    expect(admin?.relations.map((relation) => relation.target)).toContain('srn://acme/product/shop/component/checkout')
    expect(found('W_ACTOR_ORPHAN').map((diagnostic) => diagnostic.srn)).toContain('srn://acme/actor/shop-admin')
  })
})

describe('actorDiagnostics — ACT5, the direction', () => {
  it('fires W_ACTOR_PARTICIPATION_EDGE on a "uses" edge toward a protocol', () => {
    expect(found('W_ACTOR_PARTICIPATION_EDGE')).toEqual([
      expect.objectContaining({
        severity: 'warning',
        srn: 'srn://acme/actor/support-agent',
        message: expect.stringContaining('srn://acme/protocol/order-placement'),
      }),
    ])
  })

  it('leaves the same actor’s environment edge alone — a credential is not participation', () => {
    // support-agent authors two `uses` edges and exactly one of them is wrong.
    expect(found('W_ACTOR_PARTICIPATION_EDGE')).toHaveLength(1)
  })

  it('does not fire on an actor with no relations at all', () => {
    expect(found('W_ACTOR_PARTICIPATION_EDGE').map((diagnostic) => diagnostic.srn)).not.toContain(
      'srn://acme/actor/customer',
    )
  })
})
