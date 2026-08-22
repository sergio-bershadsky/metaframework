import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadCatalog } from '../catalog/load'
import type { Catalog, Diagnostic } from '../catalog/types'
import {
  type CatalogDirectory,
  componentTypeDiagnostics,
  dependencyCycleDiagnostics,
  listCatalogDirectories,
  primaryActorDiagnostics,
  protocolPlacementDiagnostics,
  solutionRootDiagnostics,
  structureDiagnostics,
  symlinkDiagnostics,
} from './structure'

/**
 * Two suites, split by input exactly as the module is.
 *
 * The disk rules are driven with literal {@link CatalogDirectory} lists, because
 * that is their whole input and a temp tree would only add latency — except for
 * one test that builds a real symlink, since "does readdir report this as a
 * directory?" is precisely the question the loader got wrong and a hand-written
 * fixture cannot answer it.
 *
 * The graph rules get a hermetic temp catalog, because every one of them asks
 * about a second entity: the kind an edge resolves to, the kind of a child, the
 * pair chain of a participant.
 */

const codes = (diagnostics: Diagnostic[]) => diagnostics.map((diagnostic) => diagnostic.code)
const withCode = (diagnostics: Diagnostic[], code: string) => diagnostics.filter((d) => d.code === code)

/* ------------------------------------------------------------- S1 and CV5 */

const dir = (relPath: string, overrides: Partial<CatalogDirectory> = {}): CatalogDirectory => ({
  path: relPath,
  symlink: false,
  hasIndex: true,
  ...overrides,
})

describe('E_SOL_NO_ROOT — S1, a solution directory that never says what it is', () => {
  it('fires on a solution directory with no index.md', () => {
    const found = solutionRootDiagnostics([dir('acme'), dir('legacy-import', { hasIndex: false })])
    expect(codes(found)).toEqual(['E_SOL_NO_ROOT'])
    expect(found[0].path).toBe('legacy-import')
    expect(found[0].severity).toBe('error')
    // No entity exists to link to — that is the finding, not an omission.
    expect(found[0].srn).toBeUndefined()
  })

  it('fires on an empty solution directory, which today produces nothing at all', () => {
    // The E_STRUCT_MISSING_INDEX this used to be mistaken for is emitted per
    // orphaned *child*; a solution root with no children has none.
    expect(codes(solutionRootDiagnostics([dir('hollow', { hasIndex: false })]))).toEqual(['E_SOL_NO_ROOT'])
  })

  it('does not fire on a solution that has one, nor on anything deeper', () => {
    expect(
      solutionRootDiagnostics([
        dir('acme'),
        dir('acme/product'),
        dir('acme/product/shop'),
        // A bucket directory holds no index.md and is not a solution root.
        dir('acme/product/shop/component', { hasIndex: false }),
      ]),
    ).toEqual([])
  })
})

describe('E_COMP_SYMLINK — CV5, reuse by linking rather than by reference', () => {
  it('fires on a symlinked component directory', () => {
    const found = symlinkDiagnostics([
      dir('acme/product/shop/component/checkout'),
      dir('acme/product/shop/component/ledger', { symlink: true, hasIndex: false }),
    ])
    expect(codes(found)).toEqual(['E_COMP_SYMLINK'])
    expect(found[0].path).toBe('acme/product/shop/component/ledger')
    expect(found[0].message).toContain('depends-on')
  })

  it('fires on a nested component directory too — depth is not the rule, the bucket is', () => {
    expect(
      codes(
        symlinkDiagnostics([
          dir('acme/product/shop/component/checkout/component/payment', { symlink: true, hasIndex: false }),
        ]),
      ),
    ).toEqual(['E_COMP_SYMLINK'])
  })

  it('does not fire on a real component directory', () => {
    expect(symlinkDiagnostics([dir('acme/product/shop/component/checkout')])).toEqual([])
  })

  it('does not fire on a symlink outside a component bucket', () => {
    // CV5 is the component's rule. A linked asset directory beside an entity is
    // a different question and this class is not it.
    expect(
      symlinkDiagnostics([
        dir('acme/product/shop/datamodel/money/examples', { symlink: true, hasIndex: false }),
        dir('acme/product/shop', { symlink: true }),
      ]),
    ).toEqual([])
  })
})

describe('listCatalogDirectories — what the loader cannot see', () => {
  let root: string

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'metaframework-structure-fs-'))
    await mkdir(path.join(root, 'acme/product/billing/component/ledger'), { recursive: true })
    await mkdir(path.join(root, 'acme/product/shop/component'), { recursive: true })
    await mkdir(path.join(root, 'legacy-import'), { recursive: true })
    await mkdir(path.join(root, '_scratch'), { recursive: true })
    await writeFile(path.join(root, 'acme/index.md'), '---\nname: acme\n---\n')
    await writeFile(path.join(root, 'acme/product/billing/component/ledger/index.md'), '---\nname: ledger\n---\n')
    await symlink(
      path.join(root, 'acme/product/billing/component/ledger'),
      path.join(root, 'acme/product/shop/component/ledger'),
      'dir',
    )
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('records a symlinked directory that readdir refuses to call a directory', async () => {
    const directories = await listCatalogDirectories(root)
    const linked = directories.find((entry) => entry.path === 'acme/product/shop/component/ledger')
    expect(linked).toEqual({ path: 'acme/product/shop/component/ledger', symlink: true, hasIndex: false })
    expect(codes(symlinkDiagnostics(directories))).toEqual(['E_COMP_SYMLINK'])
  })

  it('never follows the link — the subtree behind it is not listed twice', async () => {
    const directories = await listCatalogDirectories(root)
    expect(directories.filter((entry) => entry.path.endsWith('/ledger'))).toHaveLength(2)
    expect(directories.some((entry) => entry.path.startsWith('acme/product/shop/component/ledger/'))).toBe(false)
  })

  it('applies the loader’s own skip, so an underscore directory is not a solution', async () => {
    const directories = await listCatalogDirectories(root)
    expect(directories.some((entry) => entry.path === '_scratch')).toBe(false)
    expect(codes(solutionRootDiagnostics(directories))).toEqual(['E_SOL_NO_ROOT'])
    expect(solutionRootDiagnostics(directories)[0].path).toBe('legacy-import')
  })

  it('marks the entity directories it did find', async () => {
    const directories = await listCatalogDirectories(root)
    expect(directories.find((entry) => entry.path === 'acme')?.hasIndex).toBe(true)
    expect(directories.find((entry) => entry.path === 'acme/product')?.hasIndex).toBe(false)
  })
})

/* -------------------------------------------------------------- the graph */

let catalogDir: string
let catalog: Catalog

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
    actor: { 'actor-type': 'human', goals: ['Buy.'] },
    environment: { 'environment-type': 'production' },
    protocol: { style: 'point-to-point' },
  }[kind] ?? {}),
  ...extra,
})

/** A component that runs somewhere, so T2 never adds noise to another rule. */
const deployed = (name: string, extra: Record<string, unknown> = {}) =>
  base(name, 'component', { relations: { uses: ['/environment/production'] }, ...extra })

beforeAll(async () => {
  catalogDir = await mkdtemp(path.join(tmpdir(), 'metaframework-structure-'))

  await entity('acme', base('acme', 'solution'))
  await entity('acme/actor/customer', base('customer', 'actor'))
  await entity('acme/actor/support-agent', base('support-agent', 'actor'))
  await entity('acme/environment/production', base('production', 'environment'))
  await entity('acme/datamodel/money', base('money', 'datamodel'))

  // --- products, and the actors they claim ---------------------------------
  await entity('acme/product/shop', base('shop', 'product', { 'primary-actors': ['/actor/customer'] }))
  await entity('acme/product/billing', base('billing', 'product'))
  // PD3 twice over, plus the two E_SRN_* classes PD4 answers for.
  await entity(
    'acme/product/growth',
    base('growth', 'product', {
      'primary-actors': [
        '/product/shop/component/checkout', // a component
        '/product/shop/protocol/order-placement.transport', // a legal role, still not an entity
        '/actor/customer.profile', // an actor owns no roles at all → E_SRN_ARTIFACT
        '/actor/nobody', // → E_SRN_DANGLING
      ],
    }),
  )

  // --- component types -----------------------------------------------------
  await entity('acme/product/shop/component/checkout', deployed('checkout'))
  await entity('acme/product/shop/component/checkout/component/payment', deployed('payment'))
  await entity('acme/product/shop/component/inventory', deployed('inventory'))
  // T1: a library with a runtime it cannot have.
  await entity(
    'acme/product/shop/component/money-kit',
    base('money-kit', 'component', {
      'component-type': 'library',
      relations: { uses: ['/environment/production', '/datamodel/money'] },
    }),
  )
  // ...and the same library shape without the environment edge.
  await entity(
    'acme/product/shop/component/quiet-kit',
    base('quiet-kit', 'component', { 'component-type': 'library', relations: { uses: ['/datamodel/money'] } }),
  )
  // T2: a service that names no environment.
  await entity('acme/product/shop/component/homeless', base('homeless', 'component'))
  // ...and the two stages at which naming none is the accurate record.
  await entity('acme/product/shop/component/blueprint', base('blueprint', 'component', { lifecycle: 'planned' }))
  await entity('acme/product/shop/component/relic', base('relic', 'component', { lifecycle: 'retired' }))
  // T3: an external that describes somebody else's insides.
  await entity('acme/product/shop/component/psp', base('psp', 'component', { 'component-type': 'external' }))
  await entity('acme/product/shop/component/psp/component/psp-core', deployed('psp-core'))
  await entity('acme/product/shop/component/psp/datamodel/psp-charge', base('psp-charge', 'datamodel'))
  // ...and a well-behaved external, which owns only the boundary.
  await entity('acme/product/shop/component/courier', base('courier', 'component', { 'component-type': 'external' }))
  await entity('acme/product/shop/component/courier/datamodel/consignment', base('consignment', 'datamodel'))

  // --- CV7 -----------------------------------------------------------------
  await entity(
    'acme/product/shop/component/alpha',
    deployed('alpha', { relations: { uses: ['/environment/production'], 'depends-on': ['../beta'] } }),
  )
  await entity(
    'acme/product/shop/component/beta',
    deployed('beta', { relations: { uses: ['/environment/production'], 'depends-on': ['../gamma'] } }),
  )
  await entity(
    'acme/product/shop/component/gamma',
    deployed('gamma', { relations: { uses: ['/environment/production'], 'depends-on': ['../alpha'] } }),
  )
  await entity(
    'acme/product/shop/component/narcissus',
    deployed('narcissus', {
      relations: { uses: ['/environment/production'], 'depends-on': ['/product/shop/component/narcissus'] },
    }),
  )
  // An acyclic chain across two products, which is the reuse edge working.
  await entity(
    'acme/product/billing/component/ledger',
    deployed('ledger', {
      relations: { uses: ['/environment/production'], 'depends-on': ['/product/shop/component/inventory'] },
    }),
  )
  // A loop made of `uses` and nothing else. CV7 is the `depends-on` graph, and
  // a rule that read every resolved edge instead would call this a cycle — so
  // this pair is what tells the two apart. `exposes` cannot make the same shape
  // at all: EDGE_TARGET_KINDS lets it point only at a protocol or a datamodel.
  await entity(
    'acme/product/shop/component/loop-left',
    deployed('loop-left', { relations: { uses: ['/environment/production', '../loop-right'] } }),
  )
  await entity(
    'acme/product/shop/component/loop-right',
    deployed('loop-right', { relations: { uses: ['/environment/production', '../loop-left'] } }),
  )
  // ...and a loop that is half a dependency. One `depends-on` edge does not
  // close a `depends-on` cycle, however the other half of the ring is drawn.
  await entity(
    'acme/product/shop/component/hinge-a',
    deployed('hinge-a', { relations: { uses: ['/environment/production'], 'depends-on': ['../hinge-b'] } }),
  )
  await entity(
    'acme/product/shop/component/hinge-b',
    deployed('hinge-b', { relations: { uses: ['/environment/production', '../hinge-a'] } }),
  )

  // --- protocol placement --------------------------------------------------
  // At the NCA: both participants are under shop.
  await entity(
    'acme/product/shop/protocol/order-placement',
    base('order-placement', 'protocol', {
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'inventory', ref: '/product/shop/component/inventory' },
      ],
    }),
  )
  // Below it: the participants span two products, so the pair prefix is empty
  // and the protocol belongs at the solution root.
  await entity(
    'acme/product/shop/protocol/settlement',
    base('settlement', 'protocol', {
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'ledger', ref: '/product/billing/component/ledger' },
      ],
    }),
  )
  // Above it: the one component participant is the NCA, and this sits two pairs
  // up from it.
  await entity(
    'acme/product/shop/protocol/refund-request',
    base('refund-request', 'protocol', {
      participants: [
        { alias: 'agent', ref: '/actor/support-agent' },
        { alias: 'payment', ref: '/product/shop/component/psp/component/psp-core' },
      ],
    }),
  )
  // Neither above nor below: the NCA is inside shop and this sits in billing,
  // so the two chains diverge at the first pair.
  await entity(
    'acme/product/billing/protocol/stray',
    base('stray', 'protocol', {
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'payment', ref: '/product/shop/component/checkout/component/payment' },
      ],
    }),
  )
  // Actors only: placement is unconstrained, because counting solution-level
  // participants would collapse every protocol to the root.
  await entity(
    'acme/product/shop/protocol/support-chat',
    base('support-chat', 'protocol', {
      participants: [
        { alias: 'customer', ref: '/actor/customer' },
        { alias: 'agent', ref: '/actor/support-agent' },
      ],
    }),
  )
  // One participant that resolves to nothing. Dropping it would leave checkout
  // alone and make this "above the NCA" — a second finding invented out of the
  // first one's absence.
  await entity(
    'acme/product/shop/protocol/half-known',
    base('half-known', 'protocol', {
      participants: [
        { alias: 'checkout', ref: '/product/shop/component/checkout' },
        { alias: 'ghost', ref: '/product/billing/component/ghost' },
      ],
    }),
  )

  catalog = await loadCatalog({ catalogDir })
})

afterAll(async () => {
  await rm(catalogDir, { recursive: true, force: true })
})

describe('the fixture loads', () => {
  it('builds the graph the graph rules are read against', () => {
    expect(catalog.entities.size).toBeGreaterThan(20)
    // The loader finds NOTHING here, and that is the fixture's second point.
    // Two of the references below resolve to no entity at all — `/actor/nobody`
    // in a product's `primary-actors`, `ghost` in a protocol's `participants` —
    // and both surfaces are kind fields rather than relations, so
    // `collectRelations` never sees them and `E_SRN_DANGLING` never fires. Every
    // finding in this file comes from the module under test.
    expect(catalog.diagnostics).toEqual([])
  })
})

describe('E_COMP_LIBRARY_ENVIRONMENT — T1, a build-time artifact claiming a runtime', () => {
  it('fires on a library with a uses edge to an environment', () => {
    const found = withCode(componentTypeDiagnostics(catalog), 'E_COMP_LIBRARY_ENVIRONMENT')
    expect(found).toHaveLength(1)
    expect(found[0].srn).toBe('srn://acme/product/shop/component/money-kit')
    expect(found[0].severity).toBe('error')
    expect(found[0].message).toContain('srn://acme/environment/production')
  })

  it('does not fire on a library whose uses edges are consumed contracts', () => {
    // The same edge type over a different target kind — which is exactly why
    // this rule cannot be answered without the resolved catalog.
    const found = withCode(componentTypeDiagnostics(catalog), 'E_COMP_LIBRARY_ENVIRONMENT')
    expect(found.map((d) => d.srn)).not.toContain('srn://acme/product/shop/component/quiet-kit')
  })

  it('does not fire on a service that declares one, which is the point of the edge', () => {
    expect(
      withCode(componentTypeDiagnostics(catalog), 'E_COMP_LIBRARY_ENVIRONMENT').map((d) => d.srn),
    ).not.toContain('srn://acme/product/shop/component/checkout')
  })
})

describe('W_COMP_NO_ENVIRONMENT — T2, the SHOULD', () => {
  it('fires on a runtime-bearing component that names no environment', () => {
    const found = withCode(componentTypeDiagnostics(catalog), 'W_COMP_NO_ENVIRONMENT')
    expect(found.map((d) => d.srn)).toEqual(['srn://acme/product/shop/component/homeless'])
    expect(found[0].severity).toBe('warning')
  })

  it('does not fire on a component that declares one', () => {
    expect(withCode(componentTypeDiagnostics(catalog), 'W_COMP_NO_ENVIRONMENT').map((d) => d.srn)).not.toContain(
      'srn://acme/product/shop/component/checkout',
    )
  })

  it('does not fire on library, external or the other typeless types', () => {
    const flagged = withCode(componentTypeDiagnostics(catalog), 'W_COMP_NO_ENVIRONMENT').map((d) => d.srn)
    expect(flagged).not.toContain('srn://acme/product/shop/component/quiet-kit')
    expect(flagged).not.toContain('srn://acme/product/shop/component/courier')
  })

  it('does not fire at planned or retired, where running nowhere is the true record', () => {
    const flagged = withCode(componentTypeDiagnostics(catalog), 'W_COMP_NO_ENVIRONMENT').map((d) => d.srn)
    expect(flagged).not.toContain('srn://acme/product/shop/component/blueprint')
    expect(flagged).not.toContain('srn://acme/product/shop/component/relic')
  })
})

describe('E_COMP_EXTERNAL_CHILD — T3, describing somebody else’s insides', () => {
  it('fires on an external component with a child component', () => {
    const found = withCode(componentTypeDiagnostics(catalog), 'E_COMP_EXTERNAL_CHILD')
    expect(found).toHaveLength(1)
    expect(found[0].srn).toBe('srn://acme/product/shop/component/psp')
    expect(found[0].message).toContain('srn://acme/product/shop/component/psp/component/psp-core')
  })

  it('does not fire on an external that owns only the contracts at the seam', () => {
    // T3 names child *components*. A datamodel or protocol under an external is
    // how the boundary gets documented, which the kind document requires.
    expect(withCode(componentTypeDiagnostics(catalog), 'E_COMP_EXTERNAL_CHILD').map((d) => d.srn)).not.toContain(
      'srn://acme/product/shop/component/courier',
    )
  })

  it('does not fire on an ordinary component with children', () => {
    expect(withCode(componentTypeDiagnostics(catalog), 'E_COMP_EXTERNAL_CHILD').map((d) => d.srn)).not.toContain(
      'srn://acme/product/shop/component/checkout',
    )
  })
})

describe('W_COMP_DEP_CYCLE — CV7', () => {
  it('fires once per cycle, naming a path a reader can cut', () => {
    const found = dependencyCycleDiagnostics(catalog)
    expect(codes(found)).toEqual(['W_COMP_DEP_CYCLE', 'W_COMP_DEP_CYCLE'])
    expect(found[0].severity).toBe('warning')
    expect(found[0].message).toBe(
      '"depends-on" cycle: srn://acme/product/shop/component/alpha → srn://acme/product/shop/component/beta → ' +
        'srn://acme/product/shop/component/gamma → srn://acme/product/shop/component/alpha',
    )
  })

  it('fires on a component that depends on itself', () => {
    const found = dependencyCycleDiagnostics(catalog)
    expect(found.map((d) => d.srn)).toContain('srn://acme/product/shop/component/narcissus')
  })

  it('files the finding once, on the first member, rather than on each of three', () => {
    const found = dependencyCycleDiagnostics(catalog).filter((d) =>
      d.message.includes('srn://acme/product/shop/component/beta'),
    )
    expect(found).toHaveLength(1)
    expect(found[0].srn).toBe('srn://acme/product/shop/component/alpha')
  })

  it('does not fire on an acyclic dependency, including one across products', () => {
    expect(dependencyCycleDiagnostics(catalog).map((d) => d.srn)).not.toContain(
      'srn://acme/product/billing/component/ledger',
    )
  })

  it('ignores a ring made of `uses`, because CV7 is the `depends-on` graph', () => {
    // Without a cycle in another edge type on disk, the filter that picks
    // `depends-on` out of the relations could be widened to accept every
    // resolved edge and the whole suite would stay green — the exclusion in
    // CV7's docstring ("the component-to-component `depends-on` edges only")
    // would be documented and unenforced. These two pairs are what enforce it.
    const named = dependencyCycleDiagnostics(catalog).flatMap((d) => [d.srn, d.message])
    for (const component of ['loop-left', 'loop-right', 'hinge-a', 'hinge-b']) {
      expect(named.join('\n'), component).not.toContain(`srn://acme/product/shop/component/${component}`)
    }
  })
})

describe('E_PROD_ACTOR_TARGET — PD3 and PD7', () => {
  it('fires on a primary-actors entry that resolves to another kind', () => {
    const found = withCode(primaryActorDiagnostics(catalog), 'E_PROD_ACTOR_TARGET')
    expect(found).toHaveLength(2)
    expect(found[0].message).toContain('resolves to a component')
    expect(found[0].srn).toBe('srn://acme/product/growth')
    expect(found[0].severity).toBe('error')
  })

  it('fires on a legal artifact role, naming the suffix as the problem', () => {
    const found = withCode(primaryActorDiagnostics(catalog), 'E_PROD_ACTOR_TARGET')
    expect(found[1].message).toContain('.transport')
  })

  it('leaves illegal vocabulary to E_SRN_ARTIFACT — V5 is static and precedes the surface', () => {
    const found = primaryActorDiagnostics(catalog).filter((d) => d.message.includes('customer.profile'))
    expect(codes(found)).toEqual(['E_SRN_ARTIFACT'])
  })

  it('reports a reference that resolves to nothing as dangling, not as a kind mismatch', () => {
    const found = primaryActorDiagnostics(catalog).filter((d) => d.message.includes('/actor/nobody'))
    expect(codes(found)).toEqual(['E_SRN_DANGLING'])
  })

  it('does not fire on a product whose primary actors are actors', () => {
    expect(primaryActorDiagnostics(catalog).map((d) => d.srn)).not.toContain('srn://acme/product/shop')
  })

  it('does not fire on a product that declares none — the field is optional', () => {
    expect(primaryActorDiagnostics(catalog).map((d) => d.srn)).not.toContain('srn://acme/product/billing')
  })
})

describe('W_STRUCT_PROTOCOL_NCA — the nearest common ancestor of the participants', () => {
  it('fires on a protocol below the NCA of its participants', () => {
    const found = protocolPlacementDiagnostics(catalog).filter((d) => d.srn?.endsWith('/settlement'))
    expect(codes(found)).toEqual(['W_STRUCT_PROTOCOL_NCA'])
    expect(found[0].severity).toBe('warning')
    expect(found[0].message).toContain('below')
    expect(found[0].message).toContain('belongs at srn://acme/protocol/settlement')
  })

  it('fires on a protocol above it, and says which way it is wrong', () => {
    const found = protocolPlacementDiagnostics(catalog).filter((d) => d.srn?.endsWith('/refund-request'))
    expect(codes(found)).toEqual(['W_STRUCT_PROTOCOL_NCA'])
    expect(found[0].message).toContain('above')
    expect(found[0].message).toContain(
      'belongs at srn://acme/product/shop/component/psp/component/psp-core/protocol/refund-request',
    )
  })

  it('fires on a protocol off the line entirely, without claiming a direction', () => {
    const found = protocolPlacementDiagnostics(catalog).filter((d) => d.srn?.endsWith('/stray'))
    expect(codes(found)).toEqual(['W_STRUCT_PROTOCOL_NCA'])
    expect(found[0].message).toContain('off the line of')
    expect(found[0].message).toContain(
      'belongs at srn://acme/product/shop/component/checkout/protocol/stray',
    )
  })

  it('does not fire on a protocol at the NCA', () => {
    expect(protocolPlacementDiagnostics(catalog).map((d) => d.srn)).not.toContain(
      'srn://acme/product/shop/protocol/order-placement',
    )
  })

  it('does not fire when every participant is an actor — actors do not place anything', () => {
    expect(protocolPlacementDiagnostics(catalog).map((d) => d.srn)).not.toContain(
      'srn://acme/product/shop/protocol/support-chat',
    )
  })

  it('does not invent a placement finding out of a dangling participant', () => {
    // With `ghost` silently dropped the remaining participant would make this
    // "above the NCA" — a finding whose only cause is the other finding.
    expect(protocolPlacementDiagnostics(catalog).map((d) => d.srn)).not.toContain(
      'srn://acme/product/shop/protocol/half-known',
    )
  })
})

describe('structureDiagnostics — the one call an integrator makes', () => {
  it('returns every class, from the catalog and the listing together', () => {
    const found = structureDiagnostics(catalog, [
      dir('acme'),
      dir('legacy-import', { hasIndex: false }),
      dir('acme/product/shop/component/ledger', { symlink: true, hasIndex: false }),
    ])
    expect([...new Set(codes(found))].sort()).toEqual([
      'E_COMP_EXTERNAL_CHILD',
      'E_COMP_LIBRARY_ENVIRONMENT',
      'E_COMP_SYMLINK',
      'E_PROD_ACTOR_TARGET',
      'E_SOL_NO_ROOT',
      'E_SRN_ARTIFACT',
      'E_SRN_DANGLING',
      'W_COMP_DEP_CYCLE',
      'W_COMP_NO_ENVIRONMENT',
      'W_STRUCT_PROTOCOL_NCA',
    ])
  })

  it('runs the graph rules with no listing at all', () => {
    const found = structureDiagnostics(catalog, [])
    expect(codes(found)).not.toContain('E_SOL_NO_ROOT')
    expect(codes(found)).toContain('W_COMP_DEP_CYCLE')
  })
})
