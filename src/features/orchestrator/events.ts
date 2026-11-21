import type {
  ApprovalValue,
  OrchestratorEventValue,
  SnapshotValue,
  TaskValue,
} from './types'

export class EventHub {
  private readonly seen = new Set<string>()

  isNew(event: OrchestratorEventValue): boolean {
    if (this.seen.has(event.id)) return false
    this.seen.add(event.id)
    return true
  }

  reset(): void {
    this.seen.clear()
  }

  size(): number {
    return this.seen.size
  }
}

export function eventKey(event: OrchestratorEventValue): string {
  return `${event.runId}:${event.sequence}:${event.type}`
}

function patchTask(task: TaskValue, event: OrchestratorEventValue): TaskValue {
  const status = event.payload.status
  if (typeof status !== 'string') return task
  return {
    ...task,
    status: status as TaskValue['status'],
    updatedAt: event.timestamp,
    blocker:
      typeof event.payload.blocker === 'string' ? event.payload.blocker : task.blocker,
  }
}

export function applyEvent(
  snapshot: SnapshotValue,
  event: OrchestratorEventValue,
  hub: EventHub
): SnapshotValue {
  if (!hub.isNew(event)) return snapshot
  const events = [...snapshot.events, event].slice(-500)
  const tasks = event.taskId
    ? snapshot.tasks.map((task) => (task.id === event.taskId ? patchTask(task, event) : task))
    : snapshot.tasks
  const runs = snapshot.runs.map((run) => {
    if (run.id !== event.runId) return run
    const state = event.payload.runState
    return typeof state === 'string'
      ? { ...run, state: state as SnapshotValue['runs'][number]['state'], updatedAt: event.timestamp }
      : run
  })
  return { ...snapshot, events, tasks, runs }
}

export function upsertApproval(
  approvals: ApprovalValue[],
  approval: ApprovalValue
): ApprovalValue[] {
  const index = approvals.findIndex((item) => item.id === approval.id)
  if (index === -1) return [...approvals, approval]
  const next = [...approvals]
  next[index] = approval
  return next
}
