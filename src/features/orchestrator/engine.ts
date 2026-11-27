import * as api from './api'
import type { SnapshotValue } from './types'

/**
 * UI-side context: reads the snapshot and persists small state changes. The run
 * lifecycle (create, plan, dispatch, validate, integrate) runs natively in Rust.
 */
export type EngineContext = {
  snapshot: () => Promise<SnapshotValue>
  putRun: typeof api.putRun
  putTask: typeof api.putTask
  emitEvent: typeof api.emitEvent
  nextSequence: typeof api.nextEventSequence
}

export const defaultEngineContext: EngineContext = {
  snapshot: api.orchestratorSnapshot,
  putRun: api.putRun,
  putTask: api.putTask,
  emitEvent: api.emitEvent,
  nextSequence: api.nextEventSequence,
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function now(): string {
  return new Date().toISOString()
}

export async function emit(
  ctx: EngineContext,
  runId: string,
  taskId: string | null,
  type: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const sequence = await ctx.nextSequence(runId)
  await ctx.emitEvent({
    id: `${runId}:${sequence}:${type}`,
    sequence,
    runId,
    taskId,
    type,
    timestamp: now(),
    payload,
  })
}
