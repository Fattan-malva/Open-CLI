import type { AgentStateValue, RunStateValue, TaskStateValue } from './types'

const RUN_TRANSITIONS: Record<RunStateValue, readonly RunStateValue[]> = {
  draft: ['planning', 'cancelled'],
  planning: ['plan_ready', 'needs_approval', 'failed', 'cancelled'],
  plan_ready: ['executing', 'needs_approval', 'cancelled', 'planning'],
  needs_approval: ['planning', 'plan_ready', 'executing', 'cancelled', 'failed'],
  executing: ['waiting', 'validating', 'needs_approval', 'failed', 'cancelled'],
  waiting: ['executing', 'validating', 'failed', 'cancelled'],
  validating: ['integrating', 'executing', 'partial', 'failed', 'cancelled'],
  integrating: ['completed', 'partial', 'failed', 'cancelled', 'needs_approval'],
  completed: [],
  partial: [],
  failed: ['planning'],
  cancelled: [],
}

const TASK_TRANSITIONS: Record<TaskStateValue, readonly TaskStateValue[]> = {
  queued: ['blocked', 'ready', 'cancelled'],
  blocked: ['ready', 'queued', 'cancelled'],
  ready: ['assigned', 'blocked', 'cancelled'],
  assigned: ['running', 'ready', 'cancelled', 'failed'],
  running: ['waiting', 'needs_input', 'validating', 'completed', 'failed', 'cancelled'],
  waiting: ['running', 'needs_input', 'failed', 'cancelled'],
  needs_input: ['running', 'waiting', 'failed', 'cancelled'],
  validating: ['completed', 'conflict', 'running', 'failed', 'cancelled'],
  completed: [],
  failed: ['ready', 'cancelled'],
  cancelled: [],
  conflict: ['validating', 'failed', 'cancelled'],
}

const AGENT_TRANSITIONS: Record<AgentStateValue, readonly AgentStateValue[]> = {
  idle: ['busy', 'unavailable', 'stopped', 'failed'],
  busy: ['idle', 'waiting', 'needs_input', 'unavailable', 'failed', 'stopped'],
  waiting: ['busy', 'idle', 'needs_input', 'unavailable', 'failed', 'stopped'],
  needs_input: ['busy', 'idle', 'waiting', 'unavailable', 'failed', 'stopped'],
  unavailable: ['idle', 'busy', 'failed', 'stopped'],
  failed: ['idle', 'unavailable', 'stopped'],
  stopped: ['idle'],
}

function canMove<T extends string>(
  table: Record<T, readonly T[]>,
  from: T,
  to: T
): boolean {
  return from === to || table[from]?.includes(to) === true
}

export function canTransitionRun(from: RunStateValue, to: RunStateValue): boolean {
  return canMove(RUN_TRANSITIONS, from, to)
}

export function canTransitionTask(from: TaskStateValue, to: TaskStateValue): boolean {
  return canMove(TASK_TRANSITIONS, from, to)
}

export function canTransitionAgent(from: AgentStateValue, to: AgentStateValue): boolean {
  return canMove(AGENT_TRANSITIONS, from, to)
}

export function assertTransition(label: string, allowed: boolean): void {
  if (!allowed) throw new Error(`Invalid ${label} transition`)
}

export const TERMINAL_TASK_STATES: readonly TaskStateValue[] = [
  'completed',
  'failed',
  'cancelled',
]

export const TERMINAL_RUN_STATES: readonly RunStateValue[] = [
  'completed',
  'partial',
  'failed',
  'cancelled',
]

export function isTerminalTaskState(state: TaskStateValue): boolean {
  return TERMINAL_TASK_STATES.includes(state)
}

export function isTerminalRunState(state: RunStateValue): boolean {
  return TERMINAL_RUN_STATES.includes(state)
}
