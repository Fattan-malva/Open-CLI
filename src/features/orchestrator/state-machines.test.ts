import { describe, expect, it } from 'vitest'
import {
  assertTransition,
  canTransitionAgent,
  canTransitionRun,
  canTransitionTask,
  isTerminalTaskState,
} from './state-machines'

describe('state machines', () => {
  it('allows valid run transitions and rejects invalid ones', () => {
    expect(canTransitionRun('draft', 'planning')).toBe(true)
    expect(canTransitionRun('planning', 'plan_ready')).toBe(true)
    expect(canTransitionRun('completed', 'planning')).toBe(false)
    expect(() => assertTransition('run', false)).toThrow(/Invalid run transition/)
  })

  it('allows retries but keeps completed tasks terminal', () => {
    expect(canTransitionTask('running', 'completed')).toBe(true)
    expect(canTransitionTask('failed', 'ready')).toBe(true)
    expect(canTransitionTask('completed', 'ready')).toBe(false)
    expect(isTerminalTaskState('completed')).toBe(true)
    expect(isTerminalTaskState('running')).toBe(false)
  })

  it('allows recovery of busy agents but not stopped agents without explicit reset', () => {
    expect(canTransitionAgent('idle', 'busy')).toBe(true)
    expect(canTransitionAgent('busy', 'idle')).toBe(true)
    expect(canTransitionAgent('stopped', 'busy')).toBe(false)
    expect(canTransitionAgent('stopped', 'idle')).toBe(true)
  })
})
