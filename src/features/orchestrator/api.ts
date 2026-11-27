import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isDesktop } from '@/lib/platform'
import {
  OrchestratorEvent,
  OrchestratorSnapshot,
  Run,
  Task,
  Workspace,
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

export type DagInput = {
  id: string
  dependencies: string[]
  acceptance: string[]
  scope: { allowedPaths: string[]; forbiddenPaths: string[]; interfaces: string[] }
  risk: 'low' | 'medium' | 'high'
  status?: string
}

export type DagValidationResult = {
  ok: boolean
  issues: { code: string; message: string; taskIds: string[] }[]
  order: string[]
  criticalPath: string[]
}

export type SchedulerRequest = {
  tasks: {
    dag: DagInput
    attempt: number
    workspaceId: string | null
    requiredCapabilities: string[]
  }[]
  agents: { id: string; capabilities: string[]; status: string }[]
  workspaces: { id: string }[]
  settings: { maxConcurrentAgents: number; maxRetries: number }
  criticalPath: string[]
  activeBySession: Record<string, string>
}

export type DispatchDecisionResult = {
  taskId: string
  sessionId: string
  workspaceId: string
}

export type ReportRequest = {
  runId: string
  state: string
  planRisks: string[]
  tasks: {
    id: string
    status: string | null
    outputRefs: string[]
    blocker: string | null
    evidence: unknown
  }[]
  workspaces: { id: string; dirtyAtCreate: boolean }[]
  validationEventCount: number
}

export type FinalReportResult = {
  runId: string
  state: string
  integrated: { status: string; tasks: string[]; note: string }
  completedNotIntegrated: { status: string; tasks: string[]; note: string }
  blockedOrFailed: { status: string; tasks: string[]; note: string }
  tests: { passed: number; failed: number; notRun: number }
  filesChanged: string[]
  conflicts: string[]
  risks: string[]
}

export type EvidenceValidationResult = { ok: boolean; reasons: string[] }

export type PlanPromptRequest = {
  request: string
  projectRoot: string
  existingPlan: string | null
  context: unknown
}

export type TaskPromptRequest = {
  request: string
  task: {
    id: string
    title: string
    objective: string
    description: string
    acceptance: string[]
    allowedPaths: string[]
    forbiddenPaths: string[]
    interfaces: string[]
    dependencies: string[]
  }
  context: unknown
  artifactPath: string
  workspacePath: string
}

export type ParsedPlanResult = {
  plan: {
    rationale: string
    risks: string[]
    tasks: (DagInput & {
      id: string
      title: string
      objective: string
      description: string
      complexity: 'low' | 'medium' | 'high'
      risk: 'low' | 'medium' | 'high'
      requiredCapabilities: string[]
    })[]
  }
  validation: DagValidationResult
}

/** Prompt construction, plan parsing and output redaction also run natively. */
export function buildPlanPromptNative(input: PlanPromptRequest): Promise<string> {
  return invoke<string>('orchestrator_build_plan_prompt', { input })
}

export function buildTaskPromptNative(input: TaskPromptRequest): Promise<string> {
  return invoke<string>('orchestrator_build_task_prompt', { input })
}

export function parsePlanNative(raw: string): Promise<ParsedPlanResult> {
  return invoke<ParsedPlanResult>('orchestrator_parse_plan', { raw })
}

export function clampNative(text: string, max: number): Promise<string> {
  return invoke<string>('orchestrator_clamp', { text, max })
}

/** Pure DAG, scheduling, validation and report logic runs natively in Rust. */
export function validateDagNative(tasks: DagInput[]): Promise<DagValidationResult> {
  return invoke<DagValidationResult>('orchestrator_validate_dag', { tasks })
}

export function shouldUnblockNative(tasks: DagInput[], completedId: string): Promise<string[]> {
  return invoke<string[]>('orchestrator_should_unblock', { tasks, completedId })
}

export function selectDispatchableNative(input: SchedulerRequest): Promise<DispatchDecisionResult[]> {
  return invoke<DispatchDecisionResult[]>('orchestrator_select_dispatchable', { input })
}

export function validateEvidenceNative(
  acceptance: string[],
  evidence: unknown
): Promise<EvidenceValidationResult> {
  return invoke<EvidenceValidationResult>('orchestrator_validate_evidence', { acceptance, evidence })
}

export function buildReportNative(input: ReportRequest): Promise<FinalReportResult> {
  return invoke<FinalReportResult>('orchestrator_build_report', { input })
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

export type CrewGroup = 'needsYou' | 'working' | 'idle' | 'failed'

export type CrewRowResult = {
  partyKey: string
  role: 'manager' | 'worker'
  label: string
  status: string
  group: CrewGroup
  taskTitle: string | null
  latest: { preview: string; at: string; sequence: number } | null
}

export type CrewSnapshotResult = {
  status: 'ok'
  sections: { managedBy: CrewRowResult[]; managing: CrewRowResult[]; talkingWith: CrewRowResult[] }
  summary: { agents: number; needsYou: number }
}

export type CrewSourceRequest = {
  runs: { id: string; coordinatorId: string | null }[]
  tasks: { id: string; runId: string; title: string; status: string | null; ownerSessionId: string | null }[]
  events: { taskId: string | null; sequence: number; timestamp: string; preview: string }[]
  agents: { id: string; label: string; agentId: string }[]
}

/** The crew read model is built natively from the run, task, event and agent records. */
export function crewSnapshotNative(source: CrewSourceRequest, party: string): Promise<CrewSnapshotResult> {
  return invoke<CrewSnapshotResult>('orchestrator_crew_snapshot', { source, party })
}

/** Run lifecycle: the engine lives in Rust and emits events to the UI as it runs. */
export function createRunNative(
  request: string,
  projectRoot: string,
  context: unknown,
  attachments: unknown
): Promise<RunValue> {
  return invoke<RunValue>('orchestrator_create_run', { request, projectRoot, context, attachments })
}

export function planRunNative(runId: string, sessionId: string): Promise<RunValue> {
  return invoke<RunValue>('orchestrator_plan_run', { runId, sessionId })
}

export function prepareWorkspacesNative(runId: string): Promise<TaskValue[]> {
  return invoke<TaskValue[]>('orchestrator_prepare_workspaces', { runId })
}

export function executeRunNative(runId: string): Promise<unknown> {
  return invoke<unknown>('orchestrator_execute_run', { runId })
}

export function integrateTaskNative(taskId: string): Promise<void> {
  return invoke<void>('orchestrator_integrate_task', { taskId })
}
