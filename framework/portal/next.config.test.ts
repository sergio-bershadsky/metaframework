import { describe, expect, it } from 'vitest'
import nextConfig from './next.config'

/**
 * The policy is the offline guarantee, and a guarantee nobody checks is a
 * comment. These assertions are deliberately about *shape* rather than the
 * exact string: every one of them fails on a widening that would let the
 * portal reach an origin it does not own, and none of them fails when a
 * directive is reordered or a same-origin source is added.
 *
 * `NODE_ENV` is `test` here, so what is read is the production policy — which
 * is the point: `'unsafe-eval'` is a development affordance and a build that
 * shipped it would be a regression this file catches.
 */

async function policy(): Promise<Map<string, string[]>> {
  const routes = await nextConfig.headers!()
  const rule = routes.find((entry) => entry.source === '/:path*')
  expect(rule, 'the policy must be attached to every path').toBeDefined()

  const header = rule!.headers.find((h) => h.key === 'Content-Security-Policy')
  expect(header, 'the rule must carry a CSP').toBeDefined()

  return new Map(
    header!.value.split(';').map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/)
      return [name, sources]
    }),
  )
}

/** A source that addresses a host — the one thing no directive here may do. */
function namesAHost(source: string): boolean {
  return source.includes('//') || /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(source)
}

describe('content security policy', () => {
  it('fences every fetch to this origin', async () => {
    const csp = await policy()
    expect(csp.get('default-src')).toEqual(["'self'"])
  })

  it('names no host anywhere', async () => {
    const csp = await policy()
    const hosts = [...csp].flatMap(([name, sources]) =>
      sources.filter(namesAHost).map((source) => `${name} ${source}`),
    )
    expect(hosts).toEqual([])
  })

  it('keeps the two documented relaxations documented', async () => {
    const csp = await policy()
    // Inline, because the App Router streams its payload as inline scripts and
    // both mermaid and React write styles the browser sees as inline. Neither
    // reaches an origin. Anything *else* in these lists is a decision that has
    // to be made deliberately, which is what this assertion forces.
    expect(csp.get('script-src')).toEqual(["'self'", "'unsafe-inline'"])
    expect(csp.get('style-src')).toEqual(["'self'", "'unsafe-inline'"])
  })

  it('keeps the editor workers same-origin', async () => {
    const csp = await policy()
    // The bundler emits both Monaco workers as chunks under `/_next/static`.
    // `blob:` here would mean something started constructing workers from
    // generated source, which is worth noticing rather than accommodating.
    expect(csp.get('worker-src')).toEqual(["'self'"])
  })

  it('allows exactly the one scheme the portal actually loads', async () => {
    const csp = await policy()
    expect(csp.get('img-src')).toEqual(["'self'", 'data:'])
    expect(csp.get('font-src')).toEqual(["'self'"])
    expect(csp.get('connect-src')).toEqual(["'self'"])
  })

  it('closes the injection surfaces that have no legitimate use here', async () => {
    const csp = await policy()
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'self'"])
    expect(csp.get('form-action')).toEqual(["'self'"])
    expect(csp.get('frame-ancestors')).toEqual(["'none'"])
  })

  it('never upgrades a request the CLI serves over plain HTTP', async () => {
    const csp = await policy()
    // On any host that is not `localhost` the directive rewrites every
    // same-origin asset to `https://` and breaks the page.
    expect(csp.has('upgrade-insecure-requests')).toBe(false)
  })

  it('leaves eval to the development server', async () => {
    const csp = await policy()
    expect(csp.get('script-src')).not.toContain("'unsafe-eval'")
  })
})
