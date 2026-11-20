import { describe, expect, it } from 'vitest'
import { allTasksTerminal, buildReport, validateEvidence } from './validation'
import { OrchestratorEvent, Run, Task, Workspace } from './types'

const timestamp = '2026-01-01T00:00:00.000Z'

function task(id: string, status: string, outputRefs: string[] = []) {
  return Task.parse({
    id,
    runId: 'run-1',
    title: id,
    objective: `Objective ${id}`,
    acceptance: ['tests pass'],
    dependencies: [],
    scope: { allowedPaths: [], forbiddenPaths: [], interfaces: [] },
    status,
    outputRefs,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

function run() {
  return Run.parse({
    id: 'run-1',
    request: 'Ship the feature',
    projectRoot: 'C:/repo',
    state: 'completed',
    settings: {},
    plan: {
      rationale: '',
      risks: ['Unstable upstream API'],
      tasks: [
        {
          id: 'planned',
          title: 'Planned',
          objective: 'Planned work',
          acceptance: ['done'],
          dependencies: [],
          scope: { allowedPaths: ['src/planned'], forbiddenPaths: [], interfaces: [] },
        },
      ],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

describe('validation', () => {
  it('requires evidence summary, acceptance confirmation, and successful commands', () => {
    const target = task('a', 'completed')
    const result = validateEvidence(target, {
      summary: '',
      changedFiles: [],
      artifacts: [],
      commands: [
        { command: 'pnpm test', exitCode: 1 },
        { command: 'pnpm build', exitCode: null },
      ],
      concerns: [],
      acceptanceMet: [],
    })
    expect(result.ok).toBe(false)
    expect(result.reasons).toHaveLength(3)
  })

  it('accepts complete evidence', () => {
    const result = validateEvidence(task('a', 'completed'), {
      summary: 'Implemented and tested',
      changedFiles: ['src/a.ts'],
      artifacts: [],
      commands: [{ command: 'pnpm test', exitCode: 0 }],
      concerns: [],
      acceptanceMet: ['tests pass'],
    })
    expect(result).toEqual({ ok: true, reasons: [] })
  })

  it('builds a final report with integration and conflict sections', () => {
    const report = buildReport(
      run(),
      [
        task('a', 'completed', ['integrated']),
        task('b', 'completed'),
        task('c', 'conflict'),
      ],
      [
        Workspace.parse({
          id: 'ws-a',
          runId: 'run-1',
          root: 'C:/repo',
          path: 'C:/repo/.worktrees/a',
          branch: '',
          baseCommit: '',
          isolationMode: 'worktree',
          dirtyAtCreate: true,
          createdAt: timestamp,
        }),
      ],
      []
    )
    expect(report.integrated.tasks).toEqual(['a'])
    expect(report.completedNotIntegrated.tasks).toEqual(['b'])
    expect(report.blockedOrFailed.tasks).toEqual(['c'])
    expect(report.risks).toContain('Unstable upstream API')
    expect(report.risks).toContain('Workspace ws-a was dirty at creation')
    expect(report.risks).toContain('No validation results were recorded')
  })

  it('detects terminal task states', () => {
    expect(allTasksTerminal([task('a', 'completed'), task('b', 'failed')])).toBe(true)
    expect(allTasksTerminal([task('a', 'completed'), task('b', 'running')])).toBe(false)
    expect(allTasksTerminal([])).toBe(false)
  })

  it('counts validation events in the report', () => {
    const report = buildReport(run(), [task('a', 'completed')], [], [
      OrchestratorEvent.parse({
        id: 'event-1',
        sequence: 1,
        runId: 'run-1',
        taskId: 'a',
        type: 'validation.result',
        timestamp,
        payload: {},
      }),
    ])
    expect(report.risks).not.toContain('No validation results were recorded')
  })
})
