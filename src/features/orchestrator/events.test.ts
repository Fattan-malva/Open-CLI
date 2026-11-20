import { describe, expect, it } from 'vitest'
import { applyEvent, eventKey, EventHub, upsertApproval } from './events'
import { Approval, OrchestratorEvent, OrchestratorSnapshot, Run, Task } from './types'

const timestamp = '2026-01-01T00:00:00.000Z'

function snapshot() {
  return OrchestratorSnapshot.parse({
    runs: [
      Run.parse({
        id: 'run-1',
        runId: 'run-1',
        request: 'Build feature',
        projectRoot: 'C:/repo',
        state: 'planning',
        settings: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ],
    tasks: [
      Task.parse({
        id: 'task-1',
        runId: 'run-1',
        title: 'Implement',
        objective: 'Implement the feature',
        acceptance: ['tests pass'],
        dependencies: [],
        scope: { allowedPaths: ['src'], forbiddenPaths: [], interfaces: [] },
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ],
  })
}

function event(type: string, payload: Record<string, unknown>, sequence = 1) {
  return OrchestratorEvent.parse({
    id: `run-1:${sequence}:${type}`,
    sequence,
    runId: 'run-1',
    taskId: 'task-1',
    type,
    timestamp,
    payload,
  })
}

describe('orchestrator events', () => {
  it('deduplicates by event id', () => {
    const hub = new EventHub()
    const value = event('task.started', {})
    expect(hub.isNew(value)).toBe(true)
    expect(hub.isNew(value)).toBe(false)
    expect(eventKey(value)).toBe('run-1:1:task.started')
    hub.reset()
    expect(hub.isNew(value)).toBe(true)
  })

  it('projects run and task state from event payloads', () => {
    const hub = new EventHub()
    const initial = snapshot()
    const next = applyEvent(
      initial,
      event('task.progress', { status: 'running', runState: 'executing' }),
      hub
    )
    expect(next.tasks[0]?.status).toBe('running')
    expect(next.runs[0]?.state).toBe('executing')
    expect(next.events).toHaveLength(1)
    expect(initial.tasks[0]?.status).toBe('queued')
  })

  it('ignores replayed events', () => {
    const hub = new EventHub()
    const value = event('task.completed', { status: 'completed' })
    const first = applyEvent(snapshot(), value, hub)
    const second = applyEvent(first, value, hub)
    expect(second).toBe(first)
  })

  it('upserts approvals by id', () => {
    const approval = Approval.parse({
      id: 'approval-1',
      runId: 'run-1',
      taskId: null,
      scope: 'write',
      request: 'Integrate task-1',
      createdAt: timestamp,
    })
    const updated = { ...approval, status: 'approved' as const, decidedAt: timestamp }
    expect(upsertApproval([], approval)).toEqual([approval])
    expect(upsertApproval([approval], updated)).toEqual([updated])
  })
})
