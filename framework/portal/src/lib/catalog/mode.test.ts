import { describe, expect, it } from 'vitest'
import { LIVE_RELOAD_ENV_VAR, MODE_ENV_VAR, liveReloadEnabled, servingMode, servingWorkingTree } from './mode'

/**
 * The whole point of this predicate is that it does *not* agree with NODE_ENV,
 * so the cases that matter are the ones where the two disagree: a production
 * build serving a working tree (the CLI), and a development process pointed at
 * a frozen catalog.
 */
describe('servingMode', () => {
  it('infers a working tree when NODE_ENV is not production', () => {
    expect(servingMode({ NODE_ENV: 'development' })).toBe('working-tree')
    expect(servingMode({ NODE_ENV: 'test' })).toBe('working-tree')
    expect(servingMode({})).toBe('working-tree')
  })

  it('infers a deployment from NODE_ENV=production when nothing says otherwise', () => {
    expect(servingMode({ NODE_ENV: 'production' })).toBe('deployment')
  })

  it('lets an explicit mode override the inference in both directions', () => {
    // The CLI: a production bundle over a directory the user is editing.
    expect(servingMode({ NODE_ENV: 'production', [MODE_ENV_VAR]: 'working-tree' })).toBe('working-tree')
    expect(servingMode({ NODE_ENV: 'development', [MODE_ENV_VAR]: 'deployment' })).toBe('deployment')
  })

  it('ignores a value that names no mode rather than failing to serve', () => {
    expect(servingMode({ NODE_ENV: 'production', [MODE_ENV_VAR]: 'workingtree' })).toBe('deployment')
    expect(servingMode({ NODE_ENV: 'development', [MODE_ENV_VAR]: '' })).toBe('working-tree')
  })
})

describe('servingWorkingTree', () => {
  it('is the working-tree branch of servingMode', () => {
    expect(servingWorkingTree({ NODE_ENV: 'production' })).toBe(false)
    expect(servingWorkingTree({ NODE_ENV: 'production', [MODE_ENV_VAR]: 'working-tree' })).toBe(true)
  })
})

/**
 * `--no-watch` must switch off the push and nothing else. The test that matters
 * is the one asserting the mode is untouched by it: if the flag ever started
 * meaning `deployment`, edits would stop appearing on reload as well, and the
 * flag would be doing something its name does not say.
 */
describe('liveReloadEnabled', () => {
  const cli = { NODE_ENV: 'production', [MODE_ENV_VAR]: 'working-tree' } as const

  it('is on by default wherever a working tree is served', () => {
    expect(liveReloadEnabled(cli)).toBe(true)
    expect(liveReloadEnabled({ NODE_ENV: 'development' })).toBe(true)
  })

  it('is off when the CLI says so, without changing the mode', () => {
    for (const value of ['0', 'off', 'false', 'no', 'OFF']) {
      expect(liveReloadEnabled({ ...cli, [LIVE_RELOAD_ENV_VAR]: value })).toBe(false)
    }
    expect(servingWorkingTree({ ...cli, [LIVE_RELOAD_ENV_VAR]: '0' })).toBe(true)
  })

  it('ignores a value that means nothing, rather than silently going quiet', () => {
    expect(liveReloadEnabled({ ...cli, [LIVE_RELOAD_ENV_VAR]: 'maybe' })).toBe(true)
    expect(liveReloadEnabled({ ...cli, [LIVE_RELOAD_ENV_VAR]: '' })).toBe(true)
  })

  it('is off in a deployment, which has nothing to announce', () => {
    expect(liveReloadEnabled({ NODE_ENV: 'production' })).toBe(false)
  })
})
