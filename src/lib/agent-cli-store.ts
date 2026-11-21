import { invoke } from '@tauri-apps/api/core'
import type { AgentCliItem } from '@/features/agent-cli/data/agents'
import { isDesktop } from './platform'

export type AgentCliStoreData = {
  customAgents: AgentCliItem[]
  activeIds: string[]
  projectPath: string | null
}

const EMPTY_STORE: AgentCliStoreData = {
  customAgents: [],
  activeIds: [],
  projectPath: null,
}

function parseCustomAgents(value: unknown): AgentCliItem[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null
    )
    .filter(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        typeof item.command === 'string'
    )
    .map((item) => ({
      id: item.id as string,
      name: item.name as string,
      command: item.command as string,
      description:
        typeof item.description === 'string'
          ? item.description
          : 'Agent CLI kustom ditambahkan manual.',
      icon: typeof item.icon === 'string' ? item.icon : undefined,
      darkIcon: typeof item.darkIcon === 'string' ? item.darkIcon : undefined,
      iconClassName:
        typeof item.iconClassName === 'string' ? item.iconClassName : undefined,
      shortcut: Array.isArray(item.shortcut)
        ? item.shortcut.filter((key): key is string => typeof key === 'string')
        : undefined,
      custom: true,
    }))
}

function parseStore(raw: string): AgentCliStoreData {
  const parsed: unknown = JSON.parse(raw)
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_STORE

  const value = parsed as Record<string, unknown>
  return {
    customAgents: parseCustomAgents(value.customAgents),
    activeIds: Array.isArray(value.activeIds)
      ? value.activeIds.filter((id): id is string => typeof id === 'string')
      : [],
    projectPath: typeof value.projectPath === 'string' ? value.projectPath : null,
  }
}

let cachedStore: AgentCliStoreData | null = null
let storePromise: Promise<AgentCliStoreData> | null = null

export async function loadAgentCliStore(): Promise<AgentCliStoreData> {
  if (!isDesktop) return EMPTY_STORE
  if (cachedStore) return cachedStore
  if (storePromise) return storePromise

  storePromise = invoke<string>('agent_cli_read')
    .then((raw) => {
      cachedStore = parseStore(raw)
      return cachedStore
    })
    .catch(() => {
      cachedStore = EMPTY_STORE
      return EMPTY_STORE
    })
    .finally(() => {
      storePromise = null
    })

  return storePromise
}

export async function saveAgentCliStore(data: AgentCliStoreData): Promise<void> {
  if (!isDesktop) return
  cachedStore = data
  storePromise = null
  try {
    await invoke('agent_cli_write', { contents: JSON.stringify(data) })
  } catch (error) {
    cachedStore = null
    throw error
  }
}
