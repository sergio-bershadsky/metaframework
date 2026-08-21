import { describe, expect, it } from 'vitest'
import { ARTIFACT_ROLES, artifactFile, assertArtifactRole, srnToArtifactPath } from './artifacts'
import { SrnError, parseSrn } from './srn'

/**
 * Cases are taken from framework/spec/structure.md, "The artifact role table",
 * whose ILLEGAL block and derivation examples each have a case here. The
 * parser lexes the suffix (srn.test.ts); this suite owns V5 — the closed
 * per-kind vocabulary — and the role → file map, both functions of the table
 * alone.
 */

/** Assert on the error class rather than the message, which is prose. */
function codeOf(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof SrnError) return error.code
    throw error
  }
  throw new Error('expected an SrnError; nothing was thrown')
}

/** V5 the way the loader will meet it: a parsed SRN's kind and suffix. */
function vocabulary(ref: string): () => void {
  const srn = parseSrn(ref)
  if (srn.artifact === null) throw new Error(`no artifact suffix in ${ref}`)
  return () => assertArtifactRole(srn.kind, srn.artifact as string, ref)
}

describe('the role table', () => {
  it('is the nine rows of structure.md, in its order', () => {
    expect(ARTIFACT_ROLES.map((row) => `${row.kind} ${row.role} ${row.file} ${row.depth}`)).toEqual([
      'datamodel schema schema.json 1',
      'datamodel examples.<name> examples/<name>.json 2',
      'protocol transport transport.yaml 1',
      'protocol states states.json 1',
      'protocol openapi openapi.yaml 1',
      'protocol workflows.<name> workflows/<name>.yaml 2',
      'journey journey journey.yaml 1',
      'environment topology topology.yaml 1',
      'environment config config.yaml 1',
    ])
  })

  it('names roles only on the four kinds that own artifacts', () => {
    expect([...new Set(ARTIFACT_ROLES.map((row) => row.kind))]).toEqual([
      'datamodel',
      'protocol',
      'journey',
      'environment',
    ])
  })
})

describe('artifactFile — the role → file direction', () => {
  const legal: Array<[string, string]> = [
    ['srn://acme/datamodel/money.schema', 'schema.json'],
    ['srn://acme/datamodel/money.examples.minimal', 'examples/minimal.json'],
    ['srn://acme/protocol/settlement.transport', 'transport.yaml'],
    ['srn://acme/protocol/settlement.states', 'states.json'],
    ['srn://acme/protocol/settlement.openapi', 'openapi.yaml'],
    ['srn://acme/protocol/settlement.workflows.settle-order', 'workflows/settle-order.yaml'],
    ['srn://acme/journey/place-an-order.journey', 'journey.yaml'],
    ['srn://acme/environment/production.topology', 'topology.yaml'],
    ['srn://acme/environment/production.config', 'config.yaml'],
  ]

  it.each(legal)('%s → %s', (ref, file) => {
    const srn = parseSrn(ref)
    expect(artifactFile(srn.kind, srn.artifact as string)).toBe(file)
  })

  it('is a spec constant — a legal role maps with no catalog read, existing or not', () => {
    // settlement has no openapi.yaml anywhere; the map neither knows nor cares.
    // A legal role with an absent file is E_SRN_DANGLING, the loader's call.
    expect(artifactFile('protocol', 'openapi')).toBe('openapi.yaml')
  })
})

describe('assertArtifactRole — V5, the ILLEGAL block of structure.md', () => {
  it('rejects any suffix on a role-less kind', () => {
    expect(codeOf(vocabulary('srn://acme/actor/customer.transport'))).toBe('E_SRN_ARTIFACT')
    expect(vocabulary('srn://acme/actor/customer.transport')).toThrow(/actor has no roles/)
  })

  it('rejects any suffix on a solution root — solutions are absent from the table too', () => {
    expect(codeOf(vocabulary('srn://acme.anything'))).toBe('E_SRN_ARTIFACT')
    expect(vocabulary('srn://acme.anything')).toThrow(/solution has no roles/)
  })

  it('rejects an unknown role for the addressed kind, naming both', () => {
    expect(codeOf(vocabulary('srn://acme/protocol/settlement.spec'))).toBe('E_SRN_ARTIFACT')
    expect(vocabulary('srn://acme/protocol/settlement.spec')).toThrow(/"spec" is not a protocol role/)
    // A role another kind owns is still unknown here — the table is per-kind.
    expect(vocabulary('srn://acme/protocol/settlement.topology')).toThrow(/not a protocol role/)
  })

  it('rejects a family without a name — depth is part of the vocabulary', () => {
    expect(codeOf(vocabulary('srn://acme/datamodel/money.examples'))).toBe('E_SRN_ARTIFACT')
    expect(vocabulary('srn://acme/datamodel/money.examples')).toThrow(/examples\.\* is depth 2/)
    expect(vocabulary('srn://acme/protocol/settlement.workflows')).toThrow(/workflows\.\* is depth 2/)
  })

  it('rejects a fixed role with a tail', () => {
    expect(codeOf(vocabulary('srn://acme/environment/production.topology.eu'))).toBe('E_SRN_ARTIFACT')
    expect(vocabulary('srn://acme/environment/production.topology.eu')).toThrow(/topology is depth 1/)
    expect(vocabulary('srn://acme/datamodel/money.schema.extra')).toThrow(/schema is depth 1/)
  })

  it('rejects a family deeper than its two segments', () => {
    expect(codeOf(vocabulary('srn://acme/datamodel/money.examples.minimal.extra'))).toBe('E_SRN_ARTIFACT')
  })

  it('accepts every row of the table, both depths', () => {
    for (const [kind, artifact] of [
      ['datamodel', 'schema'],
      ['datamodel', 'examples.minimal'],
      ['protocol', 'transport'],
      ['protocol', 'states'],
      ['protocol', 'openapi'],
      ['protocol', 'workflows.settle-order'],
      ['journey', 'journey'],
      ['environment', 'topology'],
      ['environment', 'config'],
    ] as const) {
      expect(() => assertArtifactRole(kind, artifact)).not.toThrow()
    }
  })
})

describe('srnToArtifactPath — the derivation structure.md works through', () => {
  it('joins the entity directory with the role file', () => {
    expect(srnToArtifactPath(parseSrn('srn://acme/protocol/settlement.transport'))).toBe(
      'solutions/acme/protocol/settlement/transport.yaml',
    )
    expect(srnToArtifactPath(parseSrn('srn://acme/datamodel/money.examples.forty-nine-ninety'))).toBe(
      'solutions/acme/datamodel/money/examples/forty-nine-ninety.json',
    )
  })

  it('reaches through the full owner chain, like any entity path', () => {
    expect(
      srnToArtifactPath(
        parseSrn('srn://acme/product/shop/component/checkout/component/payment/datamodel/order.examples.minimal'),
      ),
    ).toBe('solutions/acme/product/shop/component/checkout/component/payment/datamodel/order/examples/minimal.json')
  })

  it('drops the version suffix — a pin belongs to the entity, never the file', () => {
    expect(srnToArtifactPath(parseSrn('srn://acme/protocol/settlement.transport@2'))).toBe(
      'solutions/acme/protocol/settlement/transport.yaml',
    )
  })

  it('refuses an SRN with no artifact suffix', () => {
    expect(codeOf(() => srnToArtifactPath(parseSrn('srn://acme/protocol/settlement')))).toBe('E_SRN_ARTIFACT')
  })

  it('refuses an illegal role, same class as the vocabulary check', () => {
    expect(codeOf(() => srnToArtifactPath(parseSrn('srn://acme/actor/customer.transport')))).toBe('E_SRN_ARTIFACT')
  })
})
