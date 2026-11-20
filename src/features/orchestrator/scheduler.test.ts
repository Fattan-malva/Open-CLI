import { describe, expect, it } from 'vitest'
import { selectDispatchable, retryBackoffMs, shouldUnblock } from './scheduler'
import { AgentSession, RunSettings, Task, Workspace, type TaskValue } from './types'

const timestamp = '2026-01-01T00:00:00.000Z'

function task(id: string, status: TaskValue['status'], dependencies: string[] = []) {
  return Task.parse({
    id,
    runId: 'run-1',
    title: id,
    objective: `Objective ${id}`,
    acceptance: ['done'],
    dependencies,
    scope: { allowedPaths: [], forbiddenPaths: [], interfaces: [] },
    status,
    workspaceId: `ws-${id}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

function agent(id: string, capabilities: string[] = ['*']) {
  return AgentSession.parse({
    id,
    adapterId: 'codex',
    agentId: 'codex',
    label: id,
    terminalId: `pty-${id}`,
    capabilities,
    status: 'idle',
    lastSeen: timestamp,
  })
}

function workspace(id: string) {
  return Workspace.parse({
    id,
    runId: 'run-1',
    root: 'C:/repo',
    path: `C:/repo/.worktrees/${id}`,
    branch: '',
    baseCommit: '',
    isolationMode: 'worktree',
    createdAt: timestamp,
  })
}

function settings(overrides: Record<string, unknown> = {}) {
  return RunSettings.parse({ maxConcurrentAgents: 2, maxRetries: 1, ...overrides })
}

describe('scheduler', () => {
  it('does not dispatch a task before its dependencies complete', () => {
    const tasks = [task('a', 'queued'), task('b', 'queued', ['a'])]
    const decisions = selectDispatchable({
      tasks,
      agents: [agent('agent-a')],
      workspaces: [workspace('ws-a'), workspace('ws-b')],
      settings: settings(),
      criticalPath: ['a', 'b'],
      activeBySession: new Map(),
    })
    expect(decisions.map((decision) => decision.task.id)).toEqual(['a'])

    const unblocked = shouldUnblock([{ ...tasks[0]!, status: 'completed' }, tasks[1]!], 'a')
    expect(unblocked.map((item) => item.id)).toEqual(['b'])
  })

  it('respects the global concurrency limit', () => {
    const decisions = selectDispatchable({
      tasks: [task('a', 'queued'), task('b', 'queued')],
      agents: [agent('agent-a'), agent('agent-b')],
      workspaces: [workspace('ws-a'), workspace('ws-b')],
      settings: settings({ maxConcurrentAgents: 1 }),
      criticalPath: [],
      activeBySession: new Map(),
    })
    expect(decisions).toHaveLength(1)
  })

  it('does not assign a task to an agent without required capabilities', () => {
    const targeted = Task.parse({
      ...task('a', 'queued'),
      requiredCapabilities: ['browser'],
    })
    const decisions = selectDispatchable({
      tasks: [targeted],
      agents: [agent('agent-a', ['terminal'])],
      workspaces: [workspace('ws-a')],
      settings: settings(),
      criticalPath: [],
      activeBySession: new Map(),
    })
    expect(decisions).toHaveLength(0)
  })

  it('uses exponential backoff for retries', () => {
    expect(retryBackoffMs(0)).toBe(500)
    expect(retryBackoffMs(2)).toBe(2000)
    expect(retryBackoffMs(99)).toBe(30000)
  })
})
