import { z } from 'zod'

const RUN_STATES = [
  'draft',
  'planning',
  'plan_ready',
  'executing',
  'waiting',
  'validating',
  'integrating',
  'completed',
  'partial',
  'failed',
  'cancelled',
  'needs_approval',
] as const

const TASK_STATES = [
  'queued',
  'blocked',
  'ready',
  'assigned',
  'running',
  'waiting',
  'needs_input',
  'validating',
  'completed',
  'failed',
  'cancelled',
  'conflict',
] as const

const AGENT_STATES = [
  'idle',
  'busy',
  'waiting',
  'needs_input',
  'unavailable',
  'failed',
  'stopped',
] as const

const RunState = z.enum(RUN_STATES)
const TaskState = z.enum(TASK_STATES)
const AgentState = z.enum(AGENT_STATES)
const Risk = z.enum(['low', 'medium', 'high'])
const IsolationMode = z.enum(['worktree', 'shared', 'none'])

const TaskScope = z.object({
  allowedPaths: z.array(z.string()).default([]),
  forbiddenPaths: z.array(z.string()).default([]),
  interfaces: z.array(z.string()).default([]),
})

const EvidenceCommand = z.object({
  command: z.string(),
  exitCode: z.number().int().nullable(),
  output: z.string().max(20000).optional(),
})

export const Evidence = z.object({
  summary: z.string(),
  changedFiles: z.array(z.string()).default([]),
  artifacts: z.array(z.string()).default([]),
  commands: z.array(EvidenceCommand).default([]),
  concerns: z.array(z.string()).default([]),
  acceptanceMet: z.array(z.string()).default([]),
})

export const TaskDraft = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-_]*$/),
  title: z.string().min(1),
  objective: z.string().min(1),
  description: z.string().default(''),
  acceptance: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  scope: TaskScope,
  complexity: Risk.default('medium'),
  risk: Risk.default('medium'),
  requiredCapabilities: z.array(z.string()).default([]),
})

export const Plan = z.object({
  rationale: z.string().default(''),
  risks: z.array(z.string()).default([]),
  tasks: z.array(TaskDraft).min(1),
})

export const Task = TaskDraft.extend({
  runId: z.string(),
  status: TaskState.default('queued'),
  ownerSessionId: z.string().nullable().default(null),
  attempt: z.number().int().default(0),
  workspaceId: z.string().nullable().default(null),
  inputRefs: z.array(z.string()).default([]),
  outputRefs: z.array(z.string()).default([]),
  evidence: Evidence.nullable().default(null),
  blocker: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const AgentSession = z.object({
  id: z.string(),
  adapterId: z.string(),
  agentId: z.string(),
  label: z.string(),
  terminalId: z.string(),
  shell: z.string().optional(),
  cwd: z.string().optional(),
  command: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  status: AgentState.default('idle'),
  lastSeen: z.string(),
})

export const Workspace = z.object({
  id: z.string(),
  runId: z.string(),
  root: z.string(),
  path: z.string(),
  branch: z.string(),
  baseCommit: z.string(),
  isolationMode: IsolationMode,
  dirtyAtCreate: z.boolean().default(false),
  createdAt: z.string(),
})

const Assignment = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  state: z.string(),
  dispatchedAt: z.string(),
})

const Message = z.object({
  id: z.string(),
  runId: z.string(),
  taskId: z.string().nullable(),
  sender: z.string(),
  recipient: z.string().nullable(),
  type: z.string(),
  timestamp: z.string(),
  correlationId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).default({}),
  ack: z.boolean().default(false),
})

export const OrchestratorEvent = z.object({
  id: z.string(),
  sequence: z.number().int(),
  runId: z.string(),
  taskId: z.string().nullable(),
  type: z.string(),
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
})

export const Approval = z.object({
  id: z.string(),
  runId: z.string(),
  taskId: z.string().nullable(),
  scope: z.string(),
  request: z.string(),
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  decision: z.string().nullable().default(null),
  createdAt: z.string(),
  decidedAt: z.string().nullable().default(null),
})

const BrowserPageContext = z.object({
  url: z.string(),
  title: z.string(),
  capturedAt: z.string(),
  selectedText: z.string().max(20000).optional(),
})

const BrowserElementContext = z.object({
  tag: z.string(),
  visibleText: z.string().max(10000),
  attributes: z.record(z.string(), z.string()),
  classes: z.array(z.string()),
  selector: z.string(),
  hierarchy: z.array(z.string()),
  pageUrl: z.string(),
  pageTitle: z.string(),
  capturedAt: z.string(),
})

export const BrowserContext = z.object({
  page: BrowserPageContext.nullable().default(null),
  element: BrowserElementContext.nullable().default(null),
})

const Attachment = z.object({
  name: z.string(),
  path: z.string(),
  kind: z.enum(['file', 'image']),
  size: z.number().int().nonnegative().default(0),
})

export const RunSettings = z.object({
  maxConcurrentAgents: z.number().int().min(1).max(8).default(2),
  maxRetries: z.number().int().min(0).max(5).default(1),
  isolationMode: IsolationMode.default('worktree'),
  autoApproveScoped: z.boolean().default(true),
})

export const Run = z.object({
  id: z.string(),
  request: z.string(),
  projectRoot: z.string(),
  state: RunState,
  coordinatorId: z.string().nullable().default(null),
  plan: Plan.nullable().default(null),
  settings: RunSettings,
  context: BrowserContext.default({ page: null, element: null }),
  attachments: z.array(Attachment).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const OrchestratorSnapshot = z.object({
  runs: z.array(Run).default([]),
  tasks: z.array(Task).default([]),
  agents: z.array(AgentSession).default([]),
  workspaces: z.array(Workspace).default([]),
  assignments: z.array(Assignment).default([]),
  events: z.array(OrchestratorEvent).default([]),
  approvals: z.array(Approval).default([]),
  messages: z.array(Message).default([]),
})

export type RunStateValue = z.infer<typeof RunState>
export type TaskStateValue = z.infer<typeof TaskState>
export type AgentStateValue = z.infer<typeof AgentState>
export type RiskValue = z.infer<typeof Risk>
export type TaskScopeValue = z.infer<typeof TaskScope>
export type EvidenceValue = z.infer<typeof Evidence>
export type TaskDraftValue = z.infer<typeof TaskDraft>
export type PlanValue = z.infer<typeof Plan>
export type TaskValue = z.infer<typeof Task>
export type AgentSessionValue = z.infer<typeof AgentSession>
export type WorkspaceValue = z.infer<typeof Workspace>
export type OrchestratorEventValue = z.infer<typeof OrchestratorEvent>
export type ApprovalValue = z.infer<typeof Approval>
export type BrowserContextValue = z.infer<typeof BrowserContext>
export type BrowserElementContextValue = z.infer<typeof BrowserElementContext>
export type AttachmentValue = z.infer<typeof Attachment>
export type RunSettingsValue = z.infer<typeof RunSettings>
export type RunValue = z.infer<typeof Run>
export type SnapshotValue = z.infer<typeof OrchestratorSnapshot>
