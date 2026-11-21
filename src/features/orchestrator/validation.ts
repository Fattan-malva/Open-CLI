import { isTerminalTaskState } from './state-machines'
import type {
  EvidenceValue,
  OrchestratorEventValue,
  RunValue,
  TaskValue,
  WorkspaceValue,
} from './types'

export type ValidationResult = {
  ok: boolean
  reasons: string[]
}

export function validateEvidence(task: TaskValue, evidence: EvidenceValue | null): ValidationResult {
  const reasons: string[] = []
  if (!evidence) {
    reasons.push('No completion evidence was written')
    return { ok: false, reasons }
  }
  if (!evidence.summary.trim()) reasons.push('Evidence has no summary')
  const met = new Set(evidence.acceptanceMet ?? [])
  for (const criterion of task.acceptance ?? []) {
    if (!met.has(criterion)) reasons.push(`Acceptance criterion not confirmed: ${criterion}`)
  }
  const failed = (evidence.commands ?? []).filter((command) => command.exitCode !== 0 && command.exitCode !== null)
  for (const command of failed) reasons.push(`Command failed (${command.exitCode}): ${command.command}`)
  return { ok: reasons.length === 0, reasons }
}

type ReportSection = {
  status: 'completed' | 'partial' | 'failed' | 'unvalidated'
  tasks: string[]
  note: string
}

export type FinalReport = {
  runId: string
  state: string
  integrated: ReportSection
  completedNotIntegrated: ReportSection
  blockedOrFailed: ReportSection
  tests: { passed: number; failed: number; notRun: number }
  filesChanged: string[]
  conflicts: string[]
  risks: string[]
}

export function buildReport(
  run: RunValue,
  tasks: TaskValue[],
  workspaces: WorkspaceValue[],
  events: OrchestratorEventValue[]
): FinalReport {
  const integrated = tasks.filter((task) => task.status === 'completed' && task.outputRefs.includes('integrated'))
  const completed = tasks.filter(
    (task) => task.status === 'completed' && !task.outputRefs.includes('integrated')
  )
  const blocked = tasks.filter((task) =>
    ['failed', 'conflict', 'needs_input', 'cancelled'].includes(task.status)
  )
  const commands = tasks.flatMap((task) => task.evidence?.commands ?? [])
  const files = new Set(tasks.flatMap((task) => task.evidence?.changedFiles ?? []))
  const conflicts = tasks
    .filter((task) => task.status === 'conflict')
    .map((task) => `${task.id}: ${task.blocker ?? 'merge conflict'}`)
  const validationEvents = events.filter((event) => event.type === 'validation.result')
  const risks = [
    ...(run.plan?.risks ?? []),
    ...workspaces
      .filter((workspace) => workspace.dirtyAtCreate)
      .map((workspace) => `Workspace ${workspace.id} was dirty at creation`),
    ...(validationEvents.length === 0 ? ['No validation results were recorded'] : []),
  ]
  return {
    runId: run.id,
    state: run.state,
    integrated: {
      status: integrated.length === tasks.length && tasks.length > 0 ? 'completed' : 'partial',
      tasks: integrated.map((task) => task.id),
      note: 'Validated and integrated through the controlled queue',
    },
    completedNotIntegrated: {
      status: completed.length > 0 ? 'partial' : 'completed',
      tasks: completed.map((task) => task.id),
      note: 'Evidence collected but changes were not merged',
    },
    blockedOrFailed: {
      status: blocked.length > 0 ? 'failed' : 'completed',
      tasks: blocked.map((task) => task.id),
      note: 'Requires user attention or a dedicated resolution task',
    },
    tests: {
      passed: commands.filter((command) => command.exitCode === 0).length,
      failed: commands.filter((command) => command.exitCode !== null && command.exitCode !== 0).length,
      notRun: commands.filter((command) => command.exitCode === null).length,
    },
    filesChanged: [...files].sort(),
    conflicts,
    risks,
  }
}

export function allTasksTerminal(tasks: TaskValue[]): boolean {
  return tasks.length > 0 && tasks.every((task) => isTerminalTaskState(task.status))
}
