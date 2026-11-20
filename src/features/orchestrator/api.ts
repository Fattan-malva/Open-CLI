import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isDesktop } from '@/lib/platform'
import {
  Approval,
  OrchestratorEvent,
  OrchestratorSnapshot,
  Run,
  Task,
  Workspace,
  type ApprovalValue,
  type OrchestratorEventValue,
  type RunValue,
  type SnapshotValue,
  type TaskValue,
  type WorkspaceValue,
} from './types'

export type WorkspaceStatus = {
  dirty: boolean
  changedFiles: string[]
  branch: string
}

export type CommandResult = {
  exitCode: number | null
  output: string
}

export type BridgeGrant = {
  token: string
  port: number
  tabLabel: string
  agentId: string
  expiresAt: number
}

type Handler<T> = (value: T) => void

let eventListeners: Promise<void> | null = null
const eventHandlers = new Set<Handler<OrchestratorEventValue>>()

async function ensureEventListeners(): Promise<void> {
  if (!isDesktop) return
  if (eventListeners) return eventListeners
  eventListeners = listen<Record<string, unknown>>('orchestrator:event', ({ payload }) => {
    const parsed = OrchestratorEvent.safeParse(payload)
    if (!parsed.success) return
    eventHandlers.forEach((handler) => handler(parsed.data))
  }).then(() => undefined)
  return eventListeners
}

export async function onOrchestratorEvent(
  handler: Handler<OrchestratorEventValue>
): Promise<() => void> {
  await ensureEventListeners()
  eventHandlers.add(handler)
  return () => {
    eventHandlers.delete(handler)
  }
}

const EMPTY_SNAPSHOT: SnapshotValue = {
  runs: [],
  tasks: [],
  agents: [],
  workspaces: [],
  assignments: [],
  events: [],
  approvals: [],
  messages: [],
}

async function call<T>(
  command: string,
  args: Record<string, unknown>,
  parser?: { parse: (value: unknown) => T },
  fallback?: T
): Promise<T> {
  if (!isDesktop) {
    if (fallback !== undefined) return fallback
    throw new Error(`Orchestrator ${command} requires the desktop runtime`)
  }
  const raw = await invoke<unknown>(command, args)
  return parser ? parser.parse(raw) : (raw as T)
}

export function orchestratorSnapshot(): Promise<SnapshotValue> {
  return call('orchestrator_snapshot', {}, OrchestratorSnapshot, EMPTY_SNAPSHOT)
}

export function registerAgent(agent: import('./types').AgentSessionValue): Promise<void> {
  return call('orchestrator_register_agent', { agent }, undefined, undefined)
}

export function unregisterAgent(id: string): Promise<void> {
  return call('orchestrator_unregister_agent', { id }, undefined, undefined)
}

export function putRun(run: RunValue): Promise<RunValue> {
  return call('orchestrator_upsert_run', { run }, Run)
}

export function putTask(task: TaskValue): Promise<TaskValue> {
  return call('orchestrator_upsert_task', { task }, Task)
}

export function putApproval(approval: ApprovalValue): Promise<ApprovalValue> {
  return call('orchestrator_upsert_approval', { approval }, Approval)
}

export function emitEvent(event: OrchestratorEventValue): Promise<OrchestratorEventValue> {
  return call('orchestrator_emit_event', { event }, OrchestratorEvent)
}

export function nextEventSequence(runId: string): Promise<number> {
  return call('orchestrator_next_event_id', { runId }, undefined, 0)
}

export function runArtifactDir(runId: string): Promise<string> {
  return call('orchestrator_run_dir', { runId }, undefined, '')
}

export function writeArtifact(path: string, contents: string): Promise<void> {
  return call('orchestrator_artifact_write', { path, contents }, undefined, undefined)
}

export function readArtifact(path: string): Promise<string> {
  return call('orchestrator_artifact_read', { path }, undefined, '')
}

export function waitForArtifact(path: string, timeoutMs: number): Promise<boolean> {
  return call('orchestrator_artifact_wait', { path, timeoutMs }, undefined, false)
}

export function createWorkspace(
  runId: string,
  taskId: string,
  root: string,
  isolationMode: 'worktree' | 'shared' | 'none'
): Promise<WorkspaceValue> {
  return call(
    'orchestrator_workspace_create',
    { runId, taskId, root, isolationMode },
    Workspace
  )
}

export function workspaceStatus(workspaceId: string): Promise<WorkspaceStatus> {
  return call('orchestrator_workspace_status', { workspaceId }, undefined, {
    dirty: false,
    changedFiles: [],
    branch: '',
  })
}

export function workspaceDiff(workspaceId: string): Promise<string> {
  return call('orchestrator_workspace_diff', { workspaceId }, undefined, '')
}

export function sendPrompt(sessionId: string, prompt: string): Promise<void> {
  return call('orchestrator_send_prompt', { sessionId, prompt }, undefined, undefined)
}

export function dispatchTask(
  taskId: string,
  sessionId: string,
  workspaceId: string,
  prompt: string
): Promise<void> {
  return call(
    'orchestrator_dispatch',
    { taskId, sessionId, workspaceId, prompt },
    undefined,
    undefined
  )
}

export function runCommand(workspaceId: string, command: string): Promise<CommandResult> {
  return call('orchestrator_run_command', { workspaceId, command }, undefined, {
    exitCode: null,
    output: '',
  })
}

export function integrateWorkspace(
  workspaceId: string,
  target: 'worktree' | 'branch'
): Promise<{ ok: boolean; conflict: boolean; output: string }> {
  return call(
    'orchestrator_integrate',
    { workspaceId, target },
    undefined,
    { ok: false, conflict: false, output: '' }
  )
}

export function recoverOrchestrator(): Promise<SnapshotValue> {
  return call('orchestrator_recover', {}, OrchestratorSnapshot, EMPTY_SNAPSHOT)
}

export function browserBridgeStart(tabLabel: string, agentId: string): Promise<BridgeGrant> {
  return call('orchestrator_browser_bridge_start', { tabLabel, agentId })
}

export function browserBridgeStop(token: string): Promise<void> {
  return call('orchestrator_browser_bridge_stop', { token }, undefined, undefined)
}

export function browserBridgeCall(
  tabLabel: string,
  token: string,
  op: string,
  args: Record<string, unknown>
): Promise<string> {
  return call(
    'orchestrator_browser_call',
    { tabLabel, token, op, argsJson: JSON.stringify(args) },
    undefined,
    ''
  )
}

export function browserInspect(tabLabel: string, token: string, enabled: boolean): Promise<void> {
  return call(
    'orchestrator_browser_inspect',
    { tabLabel, token, enabled },
    undefined,
    undefined
  )
}

export function browserPageSnapshot(tabLabel: string): Promise<{ url: string; title: string }> {
  return call('orchestrator_browser_snapshot', { tabLabel }, undefined, {
    url: '',
    title: '',
  })
}

export async function onBrowserElement(
  handler: Handler<Record<string, unknown>>
): Promise<() => void> {
  if (!isDesktop) return () => undefined
  const unlisten = await listen<Record<string, unknown>>('orchestrator:browser-element', ({ payload }) =>
    handler(payload)
  )
  return unlisten
}
