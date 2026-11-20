import { describe, expect, it } from 'vitest'
import { shouldSuspendSession } from './governor'

const base = {
  id: 'pty-1',
  activeId: 'pty-2',
  hasTab: true,
  hasActiveTask: false,
  hasBridgeGrant: false,
  busy: false,
}

describe('shouldSuspendSession', () => {
  it('suspends an idle background session', () => {
    expect(shouldSuspendSession(base)).toBe(true)
  })

  it('keeps the active tab, active task, bridge grant, and busy session', () => {
    expect(shouldSuspendSession({ ...base, activeId: base.id })).toBe(false)
    expect(shouldSuspendSession({ ...base, hasActiveTask: true })).toBe(false)
    expect(shouldSuspendSession({ ...base, hasBridgeGrant: true })).toBe(false)
    expect(shouldSuspendSession({ ...base, busy: true })).toBe(false)
  })
})
