import { invoke } from '@tauri-apps/api/core'

export type DetectedAgent = { id: string; label: string; path: string }
export type AgentCapacity = { cpus: number; memoryMb: number; maxAgents: number }

export function detectAgents(): Promise<DetectedAgent[]> {
  return invoke<DetectedAgent[]>('agent_detect')
}

export function getAgentCapacity(): Promise<AgentCapacity> {
  return invoke<AgentCapacity>('agent_capacity')
}

export function spawnAgentSession(
  id: string,
  agent: string,
  cwd: string | null
): Promise<void> {
  return invoke<void>('agent_spawn', { id, agent, cwd })
}
