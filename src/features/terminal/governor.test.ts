import { describe, expect, it } from 'vitest'
import { idleSuspendAfterMs, shouldSuspendSession } from './governor'

const base = {
  id: 'pty-1',
  activeId: 'pty-2',
  hasTab: true,
  hasActiveTask: false,
  hasBridgeGrant: false,
  busy: false,
}

describe('shouldSuspendSession', () => {
  it('suspends an idle background tab', () => {
    expect(shouldSuspendSession(base)).toBe(true)
  })

  it('keeps the active, busy, task-owning or bridge-granted sessions', () => {
    expect(shouldSuspendSession({ ...base, activeId: 'pty-1' })).toBe(false)
    expect(shouldSuspendSession({ ...base, busy: true })).toBe(false)
    expect(shouldSuspendSession({ ...base, hasActiveTask: true })).toBe(false)
    expect(shouldSuspendSession({ ...base, hasBridgeGrant: true })).toBe(false)
  })
})

describe('idleSuspendAfterMs', () => {
  it('reclaims sooner as free memory drops', () => {
    expect(idleSuspendAfterMs(10)).toBeLessThan(idleSuspendAfterMs(30))
    expect(idleSuspendAfterMs(30)).toBeLessThan(idleSuspendAfterMs(80))
  })
})
