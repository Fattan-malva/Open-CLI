import { describe, expect, it } from 'vitest'
import { generatePlan, type PlannerIO } from './planner'
import { BrowserContext, Run } from './types'

const timestamp = '2026-01-01T00:00:00.000Z'

function run() {
  return Run.parse({
    id: 'run-1',
    request: 'Add a feature',
    projectRoot: 'C:/repo',
    state: 'planning',
    settings: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

function ioWithPlan(raw: string) {
  const written = new Map<string, string>()
  const prompts: string[] = []
  const io: PlannerIO = {
    sendPrompt: async (_sessionId, prompt) => {
      prompts.push(prompt)
    },
    writeArtifact: async (path, contents) => {
      written.set(path, contents)
    },
    waitForArtifact: async () => true,
    readArtifact: async () => raw,
  }
  return { io, written, prompts }
}

function plan(tasks: unknown[]) {
  return JSON.stringify({ rationale: 'Split work', risks: [], tasks })
}

const taskA = {
  id: 'a',
  title: 'A',
  objective: 'Implement A',
  acceptance: ['A is done'],
  dependencies: [],
  scope: { allowedPaths: ['src/a'], forbiddenPaths: [], interfaces: [] },
}

const taskB = {
  id: 'b',
  title: 'B',
  objective: 'Implement B',
  acceptance: ['B is done'],
  dependencies: ['a'],
  scope: { allowedPaths: ['src/b'], forbiddenPaths: [], interfaces: [] },
}

describe('planner', () => {
  it('writes a prompt, sends it to the session, and validates a plan artifact', async () => {
    const { io, written, prompts } = ioWithPlan(`noise\n${plan([taskB, taskA])}\nPLAN_WRITTEN`)
    const result = await generatePlan(
      run(),
      BrowserContext.parse({}),
      'pty-agent-1',
      'C:/data/orchestrator/runs/run-1',
      io
    )
    expect(written.has('C:/data/orchestrator/runs/run-1/plan.prompt.txt')).toBe(true)
    expect(prompts[0]).toContain('plan.json')
    expect(result.plan.tasks.map((item) => item.id)).toEqual(['b', 'a'])
    expect(result.validation.ok).toBe(true)
  })

  it('rejects a plan that fails DAG validation', async () => {
    const cyclic = [
      { ...taskA, dependencies: ['b'] },
      taskB,
    ]
    const { io } = ioWithPlan(plan(cyclic))
    await expect(
      generatePlan(run(), BrowserContext.parse({}), 'pty-agent-1', '/tmp/run-1', io)
    ).rejects.toThrow(/DAG validation/)
  })

  it('rejects malformed planner JSON', async () => {
    const { io } = ioWithPlan('not json')
    await expect(
      generatePlan(run(), BrowserContext.parse({}), 'pty-agent-1', '/tmp/run-1', io)
    ).rejects.toThrow()
  })
})
