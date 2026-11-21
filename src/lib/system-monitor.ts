import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './platform'

type ProcessMemory = {
  pid: number
  name: string
  label: string
  memoryBytes: number
  memoryMb: number
}

export type SystemMemorySnapshot = {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  opencliBytes: number
  totalGb: number
  usedGb: number
  availableGb: number
  opencliGb: number
  usedPercent: number
  opencliPercent: number
  processes: ProcessMemory[]
  sampledAt: number
}

export const EMPTY_MEMORY_SNAPSHOT: SystemMemorySnapshot = {
  totalBytes: 0,
  usedBytes: 0,
  availableBytes: 0,
  opencliBytes: 0,
  totalGb: 0,
  usedGb: 0,
  availableGb: 0,
  opencliGb: 0,
  usedPercent: 0,
  opencliPercent: 0,
  processes: [],
  sampledAt: 0,
}

export function getSystemMemorySnapshot(): Promise<SystemMemorySnapshot> {
  if (!isDesktop) return Promise.resolve(EMPTY_MEMORY_SNAPSHOT)
  return invoke<SystemMemorySnapshot>('system_memory_snapshot')
}
