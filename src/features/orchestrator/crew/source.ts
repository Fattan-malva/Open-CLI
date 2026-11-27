import type { CrewSourceRequest } from '../api'
import type { OrchestratorEventValue, SnapshotValue } from '../types'

/** Maps the orchestrator snapshot onto the crew source the native read model expects. */
export function toCrewSource(snapshot: SnapshotValue): CrewSourceRequest {
  return {
    runs: snapshot.runs.map((run) => ({ id: run.id, coordinatorId: run.coordinatorId })),
    tasks: snapshot.tasks.map((task) => ({
      id: task.id,
      runId: task.runId,
      title: task.title,
      status: task.status,
      ownerSessionId: task.ownerSessionId,
    })),
    events: snapshot.events.map((event: OrchestratorEventValue) => ({
      taskId: event.taskId,
      sequence: event.sequence,
      timestamp: event.timestamp,
      preview: typeof event.payload.summary === 'string' ? event.payload.summary : event.type,
    })),
    agents: snapshot.agents.map((agent) => ({ id: agent.id, label: agent.label, agentId: agent.agentId })),
  }
}

