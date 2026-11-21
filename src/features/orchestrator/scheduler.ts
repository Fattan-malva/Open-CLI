import { isReady, rankByPriority } from './dag'
import type {
  AgentSessionValue,
  RunSettingsValue,
  TaskValue,
  WorkspaceValue,
} from './types'

export type DispatchDecision = {
  task: TaskValue
  session: AgentSessionValue
  workspace: WorkspaceValue
}

export type SchedulerInput = {
  tasks: TaskValue[]
  agents: AgentSessionValue[]
  workspaces: WorkspaceValue[]
  settings: RunSettingsValue
  criticalPath: string[]
  activeBySession: Map<string, string>
}

const ACTIVE_STATUSES = new Set<TaskValue['status']>([
  'assigned',
  'running',
  'waiting',
  'needs_input',
  'validating',
])

function activeTaskCount(tasks: TaskValue[]): number {
  return tasks.filter((task) => ACTIVE_STATUSES.has(task.status)).length
}

function agentCanTake(
  agent: AgentSessionValue,
  task: TaskValue,
  activeBySession: Map<string, string>
): boolean {
  if (agent.status !== 'idle') return false
  if (activeBySession.has(agent.id)) return false
  const required = task.requiredCapabilities ?? []
  return required.every(
    (capability) =>
      agent.capabilities.includes(capability) || agent.capabilities.includes('*')
  )
}

export function selectDispatchable(input: SchedulerInput): DispatchDecision[] {
  const capacity = Math.max(
    0,
    input.settings.maxConcurrentAgents - activeTaskCount(input.tasks)
  )
  if (capacity === 0) return []

  const tasks = rankByPriority(input.tasks, input.criticalPath)
  const busy = new Map(input.activeBySession)
  const usedWorkspaces = new Set<string>()
  const decisions: DispatchDecision[] = []

  for (const task of tasks) {
    if (decisions.length >= capacity) break
    if (!['queued', 'ready', 'blocked'].includes(task.status)) continue
    if (task.attempt >= input.settings.maxRetries) continue
    if (!isReady(input.tasks, task)) continue

    const workspace = input.workspaces.find(
      (item) => item.id === task.workspaceId
    )
    if (!workspace) continue
    if (usedWorkspaces.has(workspace.id)) continue

    const candidates = input.agents
      .filter((agent) => agentCanTake(agent, task, busy))
      .sort((a, b) => a.id.localeCompare(b.id))
    const session = candidates[0]
    if (!session) continue

    busy.set(session.id, task.id)
    usedWorkspaces.add(workspace.id)
    decisions.push({ task, session, workspace })
  }

  return decisions
}

export function shouldUnblock(tasks: TaskValue[], completedId: string): TaskValue[] {
  return tasks.filter(
    (task) =>
      ['blocked', 'queued'].includes(task.status) &&
      task.dependencies.includes(completedId) &&
      isReady(tasks, task)
  )
}

export function retryBackoffMs(attempt: number): number {
  return Math.min(30000, 500 * 2 ** Math.max(0, attempt))
}
