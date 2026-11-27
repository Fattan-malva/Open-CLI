import { describe, expect, it } from 'vitest'
import { toCrewSource } from './source'
import { OrchestratorSnapshot } from '../types'

describe('toCrewSource', () => {
  it('uses the event summary when present and the event type otherwise', () => {
    const snapshot = OrchestratorSnapshot.parse({
      runs: [],
      tasks: [],
      agents: [{ id: 'a1', adapterId: 'x', agentId: 'claude', label: 'Claude', terminalId: 't', lastSeen: '2026-01-01T00:00:00Z' }],
      events: [
        { id: 'e1', sequence: 1, runId: 'r', taskId: 't1', type: 'task.started', timestamp: '2026-01-01T00:00:00Z', payload: {} },
        { id: 'e2', sequence: 2, runId: 'r', taskId: 't1', type: 'task.progress', timestamp: '2026-01-01T00:00:01Z', payload: { summary: 'compiling' } },
      ],
    })
    const source = toCrewSource(snapshot)
    expect(source.events.map((event) => event.preview)).toEqual(['task.started', 'compiling'])
    expect(source.agents[0]).toEqual({ id: 'a1', label: 'Claude', agentId: 'claude' })
  })
})
