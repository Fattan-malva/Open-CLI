import { create } from 'zustand'
import { loadAgentCliStore } from '@/lib/agent-cli-store'
import * as api from './api'
import { browserBridgeStart, browserBridgeStop } from './api'
import {
  createRun,
  defaultEngineContext,
  emit,
  executeRun,
  integrateTask,
  newId,
  planRun,
  prepareWorkspaces,
  type EngineContext,
} from './engine'
import { EventHub } from './events'
import { isTerminalTaskState } from './state-machines'
import {
  AgentSession,
  BrowserContext,
  type AttachmentValue,
  type BrowserContextValue,
  type BrowserElementContextValue,
  type OrchestratorEventValue,
  type RunValue,
  type SnapshotValue,
  type TaskValue,
} from './types'

export type OrchestratorMode = 'terminal' | 'orchestrator'

export type ChatMessage = {
  id: string
  role: 'user' | 'orchestrator'
  text: string
  timestamp: string
  attachments?: string[]
}

type OrchestratorState = {
  snapshot: SnapshotValue
  mode: OrchestratorMode
  messages: ChatMessage[]
  context: BrowserContextValue
  attachments: AttachmentValue[]
  activeRunId: string | null
  busy: boolean
  error: string | null
  grants: api.BridgeGrant[]
  inspecting: boolean
  inspectTabLabel: string | null
  eventHub: EventHub
  engine: EngineContext
  hydrated: boolean
  hydrate: () => Promise<void>
  setMode: (mode: OrchestratorMode) => void
  syncAgents: (
    tabs: Array<{ id: string; title: string; agentId?: string }>,
    catalog: Array<{ id: string; name: string }>
  ) => Promise<void>
  refreshAgents: () => Promise<void>
  sendChat: (text: string) => Promise<void>
  approveAndExecute: () => Promise<void>
  cancelRun: () => Promise<void>
  retryTask: (taskId: string) => Promise<void>
  integrate: (taskId: string) => Promise<void>
  setBrowserContext: (context: BrowserContextValue) => void
  clearBrowserContext: () => void
  setInspecting: (tabLabel: string | null, enabled: boolean) => void
  handleElement: (payload: Record<string, unknown>) => Promise<void>
  shareBrowser: (tabLabel: string, agentId: string) => Promise<void>
  revokeBrowser: (token: string) => Promise<void>
  clearError: () => void
}

const EMPTY: SnapshotValue = {
  runs: [],
  tasks: [],
  agents: [],
  workspaces: [],
  assignments: [],
  events: [],
  approvals: [],
  messages: [],
}

const EMPTY_CONTEXT: BrowserContextValue = { page: null, element: null }

const ACTIVE_TASK_STATUSES = new Set<TaskValue['status']>([
  'assigned',
  'running',
  'waiting',
  'needs_input',
  'validating',
])

function agentStatusFor(taskList: TaskValue[], agentId: string): 'busy' | 'idle' {
  return taskList.some(
    (task) => task.ownerSessionId === agentId && ACTIVE_TASK_STATUSES.has(task.status)
  )
    ? 'busy'
    : 'idle'
}

function timestamp(): string {
  return new Date().toISOString()
}

let unlistenEvents: (() => void) | null = null
let unlistenElements: (() => void) | null = null

export const useOrchestratorStore = create<OrchestratorState>((set, get) => ({
  snapshot: EMPTY,
  mode: 'terminal',
  messages: [],
  context: EMPTY_CONTEXT,
  attachments: [],
  activeRunId: null,
  busy: false,
  error: null,
  grants: [],
  inspecting: false,
  inspectTabLabel: null,
  eventHub: new EventHub(),
  engine: defaultEngineContext,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return
    try {
      const snapshot = await api.recoverOrchestrator()
      set({ snapshot, hydrated: true })
      unlistenEvents = await api.onOrchestratorEvent((event: OrchestratorEventValue) => {
        const state = get()
        const next = {
          ...state.snapshot,
          events: [...state.snapshot.events, event].slice(-500),
        }
        set({ snapshot: next })
        void state.engine
          .snapshot()
          .then((fresh) => {
            set({ snapshot: fresh })
            return get().refreshAgents()
          })
          .catch(() => undefined)
      })
      unlistenElements = await api.onBrowserElement((payload) => {
        void get().handleElement(payload)
      })
    } catch (error) {
      set({
        hydrated: true,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  setMode: (mode) => {
    if (mode === 'orchestrator' && get().snapshot.agents.length === 0) {
      set({ error: 'No active native Agent CLI session is available' })
      return
    }
    set({ mode, error: null })
  },

  syncAgents: async (tabs, catalog) => {
    try {
      const byId = new Map(catalog.map((item) => [item.id, item.name]))
      const seen = new Set<string>()
      for (const tab of tabs) {
        if (!tab.agentId) continue
        const id = tab.id
        seen.add(id)
        const parsed = AgentSession.parse({
          id,
          adapterId: tab.agentId,
          agentId: tab.agentId,
          label: tab.title || byId.get(tab.agentId) || tab.agentId,
          terminalId: tab.id,
          capabilities: ['*'],
          status: 'idle',
          lastSeen: timestamp(),
        })
        parsed.status = agentStatusFor(get().snapshot.tasks, id)
        const current = get().snapshot.agents.find((agent) => agent.id === id)
        if (!current || current.status !== parsed.status) await api.registerAgent(parsed)
      }
      for (const agent of get().snapshot.agents) {
        if (!seen.has(agent.id)) await api.unregisterAgent(agent.id)
      }
      set({ snapshot: await api.orchestratorSnapshot(), error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  refreshAgents: async () => {
    try {
      const current = get().snapshot
      for (const agent of current.agents) {
        const status = agentStatusFor(current.tasks, agent.id)
        if (agent.status !== status) {
          await api.registerAgent({ ...agent, status, lastSeen: timestamp() })
        }
      }
      set({ snapshot: await api.orchestratorSnapshot() })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  sendChat: async (text) => {
    const trimmed = text.trim()
    if (!trimmed || get().busy) return
    const userMessage: ChatMessage = {
      id: newId('msg'),
      role: 'user',
      text: trimmed,
      timestamp: timestamp(),
      attachments: get().attachments.map((item) => item.name),
    }
    set((state) => ({
      messages: [...state.messages, userMessage],
      busy: true,
      error: null,
    }))
    try {
      const state = get()
      const agentData = await loadAgentCliStore()
      const run = await createRun(
        state.engine,
        trimmed,
        agentData.projectPath ?? '',
        state.context,
        state.attachments
      )
      set({
        activeRunId: run.id,
        snapshot: await state.engine.snapshot(),
        attachments: [],
        context: EMPTY_CONTEXT,
      })
      await emit(state.engine, run.id, null, 'run.planning', {})
      set((current) => ({
        messages: [
          ...current.messages,
          {
            id: newId('msg'),
            role: 'orchestrator',
            text: `Run ${run.id} created. Open Orchestration to assign a coordinator agent, review the plan, then execute.`,
            timestamp: timestamp(),
          },
        ],
        busy: false,
      }))
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  approveAndExecute: async () => {
    const state = get()
    const run = state.snapshot.runs.find((item) => item.id === state.activeRunId)
    if (!run) {
      set({ error: 'No active run' })
      return
    }
    if (!run.plan) {
      set({ error: 'Plan is not ready' })
      return
    }
    const coordinator = state.snapshot.agents[0]
    if (!coordinator) {
      set({ error: 'No eligible agent is available' })
      return
    }
    set({ busy: true, error: null })
    try {
      let next = run
      if (run.state === 'draft' || run.state === 'planning') {
        next = await planRun(state.engine, run, coordinator.id)
      }
      const snapshotAfterPlan = await state.engine.snapshot()
      const tasks = snapshotAfterPlan.tasks.filter((task) => task.runId === next.id)
      if (tasks.length === 0) throw new Error('Planner produced no tasks')
      await prepareWorkspaces(state.engine, next, tasks)
      await executeRun(state.engine, next.id)
      const snapshot = await state.engine.snapshot()
      const finalRun = snapshot.runs.find((item) => item.id === next.id)
      set({
        snapshot,
        busy: false,
        messages: [
          ...get().messages,
          {
            id: newId('msg'),
            role: 'orchestrator',
            text: `Run ${next.id} finished with state ${finalRun?.state ?? 'unknown'}.`,
            timestamp: timestamp(),
          },
        ],
      })
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  cancelRun: async () => {
    const state = get()
    const run = state.snapshot.runs.find((item) => item.id === state.activeRunId)
    if (!run || run.state === 'cancelled') return
    await api.putRun({ ...run, state: 'cancelled', updatedAt: timestamp() })
    const tasks = state.snapshot.tasks.filter(
      (task) => task.runId === run.id && !isTerminalTaskState(task.status)
    )
    for (const task of tasks) {
      await api.putTask({
        ...task,
        status: 'cancelled',
        blocker: 'Run cancelled by user',
        updatedAt: timestamp(),
      })
      await emit(state.engine, run.id, task.id, 'task.cancelled', {})
    }
    await emit(state.engine, run.id, null, 'run.cancelled', {})
    set({ snapshot: await state.engine.snapshot() })
  },

  retryTask: async (taskId) => {
    const state = get()
    const task = state.snapshot.tasks.find((item) => item.id === taskId)
    if (!task) return
    await state.engine.putTask({
      ...task,
      status: 'ready',
      blocker: null,
      attempt: 0,
      updatedAt: timestamp(),
    })
    await emit(state.engine, task.runId, task.id, 'task.started', { retry: true })
    set({ snapshot: await state.engine.snapshot() })
  },

  integrate: async (taskId) => {
    set({ busy: true, error: null })
    try {
      await integrateTask(get().engine, taskId)
      set({ snapshot: await get().engine.snapshot(), busy: false })
    } catch (error) {
      set({ busy: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  setBrowserContext: (context) => set({ context }),

  clearBrowserContext: () => set({ context: EMPTY_CONTEXT, inspecting: false, inspectTabLabel: null }),

  setInspecting: (tabLabel, enabled) => set({ inspecting: enabled, inspectTabLabel: enabled ? tabLabel : null }),

  handleElement: async (payload) => {
    const parsed = BrowserContext.shape.element.safeParse(payload)
    if (!parsed.success || !parsed.data) return
    const element: BrowserElementContextValue = parsed.data
    set((state) => ({
      context: {
        ...state.context,
        element,
        page: state.context.page
          ? { ...state.context.page, url: element.pageUrl, title: element.pageTitle, capturedAt: element.capturedAt }
          : {
              url: element.pageUrl,
              title: element.pageTitle,
              selectedText: element.visibleText,
              capturedAt: element.capturedAt,
            },
      },
      inspecting: false,
      inspectTabLabel: null,
      messages: [
        ...state.messages,
        {
          id: newId('msg'),
          role: 'orchestrator',
          text: `Attached element <${element.tag}> from ${element.pageUrl} to this chat context.`,
          timestamp: timestamp(),
        },
      ],
    }))
  },

  shareBrowser: async (tabLabel, agentId) => {
    try {
      const grant = await browserBridgeStart(tabLabel, agentId)
      set((state) => ({
        grants: [...state.grants.filter((item) => item.tabLabel !== tabLabel), grant],
        error: null,
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  revokeBrowser: async (token) => {
    await browserBridgeStop(token)
    set((state) => ({ grants: state.grants.filter((item) => item.token !== token) }))
  },

  clearError: () => set({ error: null }),
}))

export function activeRun(state: OrchestratorState): RunValue | null {
  return state.snapshot.runs.find((run) => run.id === state.activeRunId) ?? null
}

export function runTasks(state: OrchestratorState, runId?: string): TaskValue[] {
  const id = runId ?? state.activeRunId
  return state.snapshot.tasks.filter((task) => task.runId === id)
}

export function detachOrchestratorListeners(): void {
  unlistenEvents?.()
  unlistenElements?.()
  unlistenEvents = null
  unlistenElements = null
}
