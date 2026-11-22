import { create } from 'zustand'
import { toast } from 'sonner'
import { onPtyData, onPtyExit, ptyKill, ptyWrite } from '@/lib/pty'
import { loadAgentCliStore } from '@/lib/agent-cli-store'
import { isDesktop } from '@/lib/platform'
import {
  type AgentCapacity,
  type DetectedAgent,
  detectAgents,
  getAgentCapacity,
  spawnAgentSession,
} from './api'

const GROUPS_KEY = 'opencli:agent-groups'
const OUTPUT_LIMIT = 16_000
const PROMPT_LIMIT = 100

// Removes colour and cursor codes so the output reads as plain text.
// Control characters are the whole point of this pattern.
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g

export type Group = { id: string; name: string; createdAt: number }
type AgentStatus = 'running' | 'exited'
export type Agent = {
  id: string
  kind: string
  label: string
  groupId: string | null
  status: AgentStatus
  output: string
  startedAt: number
}
type Prompt = { id: string; groupId: string; text: string; at: number; sent: number }

type AgentState = {
  groups: Group[]
  agents: Record<string, Agent>
  prompts: Prompt[]
  detected: DetectedAgent[]
  capacity: AgentCapacity | null
  selectedGroupId: string | null
  focusedAgentId: string | null
  loadEnvironment: () => Promise<void>
  createGroup: (name: string) => void
  deleteGroup: (id: string) => void
  selectGroup: (id: string | null) => void
  focusAgent: (id: string | null) => void
  spawnAgent: (kind: string, groupId: string | null) => Promise<string | null>
  attachAgent: (agentId: string, groupId: string | null) => void
  killAgent: (agentId: string) => void
  sendToGroup: (groupId: string, text: string) => void
}

function loadGroups(): Group[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveGroups(groups: Group[]) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(groups))
  } catch {
    // Storage can be full or disabled; groups still work for this session.
  }
}

// Listeners per agent, kept outside React so output keeps flowing while another menu is open.
const unlisteners = new Map<string, () => void>()
const decoders = new Map<string, TextDecoder>()

// Output arrives in many small chunks. They are merged and applied once per frame.
const pendingOutput = new Map<string, string>()
let flushFrame: number | null = null

export function cleanOutputChunk(chunk: string): string {
  return chunk.replace(ANSI_PATTERN, '').replace(/\r(?!\n)/g, '')
}

function compactError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, ' ')
    .trim()
  return message.length > 180 ? `${message.slice(0, 177)}...` : message
}

function flushOutput(set: (fn: (state: AgentState) => Partial<AgentState>) => void) {
  flushFrame = null
  const updates = new Map(pendingOutput)
  pendingOutput.clear()
  set((state) => {
    const agents = { ...state.agents }
    for (const [id, chunk] of updates) {
      const agent = agents[id]
      if (!agent) continue
      const text = agent.output + cleanOutputChunk(chunk)
      agents[id] = { ...agent, output: text.length > OUTPUT_LIMIT ? text.slice(-OUTPUT_LIMIT) : text }
    }
    return { agents }
  })
}

export const useAgentGroupStore = create<AgentState>((set, get) => {
  const queueOutput = (id: string, chunk: string) => {
    pendingOutput.set(id, (pendingOutput.get(id) ?? '') + chunk)
    if (flushFrame === null) {
      flushFrame = requestAnimationFrame(() => flushOutput(set))
    }
  }

  const stopListening = (id: string) => {
    unlisteners.get(id)?.()
    unlisteners.delete(id)
    decoders.delete(id)
  }

  const markExited = (id: string) => {
    stopListening(id)
    set((state) => {
      const agent = state.agents[id]
      if (!agent || agent.status === 'exited') return state
      return { agents: { ...state.agents, [id]: { ...agent, status: 'exited' } } }
    })
  }

  const runningCount = () =>
    Object.values(get().agents).filter((agent) => agent.status === 'running').length

  return {
    groups: loadGroups(),
    agents: {},
    prompts: [],
    detected: [],
    capacity: null,
    selectedGroupId: null,
    focusedAgentId: null,

    loadEnvironment: async () => {
      if (!isDesktop) return
      try {
        const [detected, capacity] = await Promise.all([detectAgents(), getAgentCapacity()])
        set({ detected, capacity })
      } catch (error) {
        toast.error(`Gagal membaca agent: ${String(error)}`)
      }
    },

    createGroup: (name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      const group: Group = { id: crypto.randomUUID(), name: trimmed, createdAt: Date.now() }
      const groups = [...get().groups, group]
      saveGroups(groups)
      set({ groups, selectedGroupId: group.id })
    },

    deleteGroup: (id) => {
      const groups = get().groups.filter((group) => group.id !== id)
      saveGroups(groups)
      set((state) => {
        const agents = { ...state.agents }
        for (const agent of Object.values(agents)) {
          if (agent.groupId === id) agents[agent.id] = { ...agent, groupId: null }
        }
        return {
          groups,
          agents,
          prompts: state.prompts.filter((prompt) => prompt.groupId !== id),
          selectedGroupId: state.selectedGroupId === id ? null : state.selectedGroupId,
        }
      })
    },

    selectGroup: (id) => set({ selectedGroupId: id }),
    focusAgent: (id) => set({ focusedAgentId: id }),

    spawnAgent: async (kind, groupId) => {
      if (!isDesktop) {
        toast.error('Agent hanya bisa dijalankan di aplikasi desktop.')
        return null
      }
      if (!get().capacity) await get().loadEnvironment()
      const capacity = get().capacity
      const max = capacity?.maxAgents ?? 1
      if (runningCount() >= max) {
        toast.error(`Batas ${max} agent aktif sudah tercapai untuk mesin ini.`)
        return null
      }
      const detected = get().detected.find((item) => item.id === kind)
      if (!detected) {
        toast.error(`${kind} tidak ditemukan di PATH.`)
        return null
      }

      const id = `agent-${crypto.randomUUID()}`
      const decoder = new TextDecoder()
      decoders.set(id, decoder)
      const offData = await onPtyData(id, (bytes) => {
        queueOutput(id, decoder.decode(bytes, { stream: true }))
      })
      const offExit = await onPtyExit(id, () => markExited(id))
      unlisteners.set(id, () => {
        offData()
        offExit()
      })

      set((state) => ({
        agents: {
          ...state.agents,
          [id]: {
            id,
            kind,
            label: detected.label,
            groupId,
            status: 'running',
            output: '',
            startedAt: Date.now(),
          },
        },
        focusedAgentId: id,
      }))

      try {
        const { projectPath } = await loadAgentCliStore()
        await spawnAgentSession(id, detected.id, projectPath)
        return id
      } catch (error) {
        stopListening(id)
        set((state) => {
          const agents = { ...state.agents }
          delete agents[id]
          return { agents }
        })
        toast.error(`Gagal menjalankan ${detected.label}: ${compactError(error)}`)
        return null
      }
    },

    attachAgent: (agentId, groupId) => {
      set((state) => {
        const agent = state.agents[agentId]
        if (!agent) return state
        return { agents: { ...state.agents, [agentId]: { ...agent, groupId } } }
      })
    },

    killAgent: (agentId) => {
      void ptyKill(agentId).catch(() => undefined)
      markExited(agentId)
    },

    sendToGroup: (groupId, text) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const targets = Object.values(get().agents).filter(
        (agent) => agent.groupId === groupId && agent.status === 'running'
      )
      if (targets.length === 0) {
        toast.error('Belum ada agent aktif di grup ini.')
        return
      }
      for (const agent of targets) {
        void ptyWrite(agent.id, `${trimmed}\r`).catch(() => undefined)
      }
      const prompt: Prompt = {
        id: crypto.randomUUID(),
        groupId,
        text: trimmed,
        at: Date.now(),
        sent: targets.length,
      }
      set((state) => ({ prompts: [...state.prompts, prompt].slice(-PROMPT_LIMIT) }))
    },
  }
})
