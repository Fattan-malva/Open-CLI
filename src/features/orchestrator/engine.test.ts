import { describe, expect, it } from 'vitest'
import { defaultEngineContext, planRun, type EngineContext } from './engine'
import { Run, type RunValue, type TaskValue } from './types'

const timestamp = '2026-01-01T00:00:00.000Z'

function draftRun(): RunValue {
  return Run.parse({
    id: 'run-test',
    request: 'Buat landing page',
    projectRoot: 'C:/repo',
    state: 'draft',
    settings: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

function planJson() {
  return JSON.stringify({
    rationale: 'Satu task cukup untuk pengujian',
    risks: ['Risiko kecil'],
    tasks: [
      {
        id: 'landing',
        title: 'Buat landing',
        objective: 'Menyusun halaman baru',
        acceptance: ['Halaman tampil'],
        dependencies: [],
        scope: { allowedPaths: ['src'], forbiddenPaths: [], interfaces: [] },
      },
    ],
  })
}

function contextWithPlan() {
  const runs = new Map<string, RunValue>()
  const tasks = new Map<string, TaskValue>()
  const artifacts = new Map<string, string>()
  const events: string[] = []
  const ctx: EngineContext = {
    ...defaultEngineContext,
    snapshot: async () => ({
      runs: [...runs.values()],
      tasks: [...tasks.values()],
      agents: [],
      workspaces: [],
      assignments: [],
      events: [],
      approvals: [],
      messages: [],
    }),
    putRun: async (run) => {
      runs.set(run.id, run)
      return run
    },
    putTask: async (task) => {
      tasks.set(task.id, task)
      return task
    },
    emitEvent: async (event) => {
      events.push(event.type)
      return event
    },
    nextSequence: async () => events.length + 1,
    runDir: async () => '/tmp/orchestrator/run-test',
    writeArtifact: async (path, contents) => {
      artifacts.set(path, contents)
    },
    sendPrompt: async () => {
      artifacts.set('/tmp/orchestrator/run-test/plan.json', planJson())
    },
    waitForArtifact: async () => true,
    readArtifact: async (path) => artifacts.get(path) ?? '',
    // Native logic is covered by `cargo test`; this browser test stubs the DAG check (no Tauri runtime here).
    buildPlanPrompt: async () => 'plan prompt',
    buildTaskPrompt: async () => 'task prompt',
    clamp: async (text) => text,
    parsePlan: async (raw) => {
      const parsed = JSON.parse(raw) as { rationale: string; risks: string[]; tasks: Record<string, unknown>[] }
      return {
        plan: {
          rationale: parsed.rationale,
          risks: parsed.risks,
          tasks: parsed.tasks.map((task) => ({
            description: '',
            complexity: 'medium',
            risk: 'medium',
            requiredCapabilities: [],
            dependencies: [],
            ...task,
          })) as never,
        },
        validation: { ok: true, issues: [], order: [], criticalPath: [] },
      }
    },
    validateDag: async (tasks) => ({
      ok: true,
      issues: [],
      order: tasks.map((task) => task.id),
      criticalPath: [],
    }),
  }
  return { ctx, runs, tasks, events }
}

describe('planRun', () => {
  it('moves a draft run to plan_ready with coordinator and queued tasks', async () => {
    const { ctx, runs, tasks, events } = contextWithPlan()

    const planned = await planRun(ctx, draftRun(), 'pty-opencode-1')

    expect(planned.state).toBe('plan_ready')
    expect(planned.coordinatorId).toBe('pty-opencode-1')
    expect(planned.plan?.tasks).toHaveLength(1)
    expect(runs.get('run-test')?.state).toBe('plan_ready')
    expect([...tasks.values()].map((task) => task.status)).toEqual(['queued'])
    expect(events).toContain('run.planning')
    expect(events).toContain('run.plan_ready')
  })
})
