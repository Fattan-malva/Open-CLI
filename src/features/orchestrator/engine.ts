import * as api from './api'
import { buildTaskPrompt, clamp } from './context'
import { generatePlan } from './planner'
import { isTerminalTaskState } from './state-machines'
import {
  Evidence,
  Task,
  type AgentSessionValue,
  type EvidenceValue,
  type RunValue,
  type SnapshotValue,
  type TaskValue,
  type WorkspaceValue,
} from './types'

export type EngineContext = {
  snapshot: () => Promise<SnapshotValue>
  putRun: typeof api.putRun
  putTask: typeof api.putTask
  emitEvent: typeof api.emitEvent
  nextSequence: typeof api.nextEventSequence
  runDir: typeof api.runArtifactDir
  writeArtifact: typeof api.writeArtifact
  readArtifact: typeof api.readArtifact
  waitForArtifact: typeof api.waitForArtifact
  createWorkspace: typeof api.createWorkspace
  workspaceStatus: typeof api.workspaceStatus
  workspaceDiff: typeof api.workspaceDiff
  sendPrompt: typeof api.sendPrompt
  dispatch: typeof api.dispatchTask
  runCommand: typeof api.runCommand
  integrate: typeof api.integrateWorkspace
  validateDag: (tasks: api.DagInput[]) => Promise<api.DagValidationResult>
  selectDispatchable: (input: api.SchedulerRequest) => Promise<api.DispatchDecisionResult[]>
  shouldUnblock: (tasks: api.DagInput[], completedId: string) => Promise<string[]>
  validateEvidence: (
    acceptance: string[],
    evidence: EvidenceValue | null
  ) => Promise<api.EvidenceValidationResult>
  buildReport: (input: api.ReportRequest) => Promise<api.FinalReportResult>
}

export const defaultEngineContext: EngineContext = {
  snapshot: api.orchestratorSnapshot,
  putRun: api.putRun,
  putTask: api.putTask,
  emitEvent: api.emitEvent,
  nextSequence: api.nextEventSequence,
  runDir: api.runArtifactDir,
  writeArtifact: api.writeArtifact,
  readArtifact: api.readArtifact,
  waitForArtifact: api.waitForArtifact,
  createWorkspace: api.createWorkspace,
  workspaceStatus: api.workspaceStatus,
  workspaceDiff: api.workspaceDiff,
  sendPrompt: api.sendPrompt,
  dispatch: api.dispatchTask,
  runCommand: api.runCommand,
  integrate: api.integrateWorkspace,
  validateDag: api.validateDagNative,
  selectDispatchable: api.selectDispatchableNative,
  shouldUnblock: api.shouldUnblockNative,
  validateEvidence: api.validateEvidenceNative,
  buildReport: api.buildReportNative,
}

function toDagInput(task: TaskValue | api.DagInput): api.DagInput {
  return {
    id: task.id,
    dependencies: task.dependencies,
    acceptance: task.acceptance ?? [],
    scope: task.scope,
    risk: task.risk ?? 'medium',
    status: 'status' in task ? task.status : undefined,
  }
}

function toSchedulerTask(task: TaskValue): api.SchedulerRequest['tasks'][number] {
  return {
    dag: toDagInput(task),
    attempt: task.attempt,
    workspaceId: task.workspaceId,
    requiredCapabilities: task.requiredCapabilities ?? [],
  }
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

async function setState(ctx: EngineContext, run: RunValue, state: RunValue['state']): Promise<RunValue> {
  const next: RunValue = { ...run, state, updatedAt: now() }
  await ctx.putRun(next)
  await emit(ctx, run.id, null, `run.${state}`, {})
  return next
}

export async function createRun(
  ctx: EngineContext,
  request: string,
  projectRoot: string,
  context: RunValue['context'],
  attachments: RunValue['attachments']
): Promise<RunValue> {
  const timestamp = now()
  const run: RunValue = {
    id: newId('run'),
    request,
    projectRoot,
    state: 'draft',
    coordinatorId: null,
    plan: null,
    settings: {
      maxConcurrentAgents: 2,
      maxRetries: 1,
      isolationMode: 'worktree',
      autoApproveScoped: true,
    },
    context,
    attachments,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await ctx.putRun(run)
  await emit(ctx, run.id, null, 'run.created', {})
  return run
}

export async function planRun(
  ctx: EngineContext,
  run: RunValue,
  sessionId: string
): Promise<RunValue> {
  const planning = await setState(ctx, { ...run, coordinatorId: sessionId }, 'planning')
  const dir = await ctx.runDir(planning.id)
  const { plan } = await generatePlan(planning, planning.context, sessionId, dir, {
    sendPrompt: ctx.sendPrompt,
    writeArtifact: ctx.writeArtifact,
    waitForArtifact: ctx.waitForArtifact,
    readArtifact: ctx.readArtifact,
  })
  const validation = await ctx.validateDag(plan.tasks.map(toDagInput))
  if (!validation.ok) throw new Error(`Invalid plan: ${validation.issues.map((issue) => issue.message).join('; ')}`)
  const timestamp = now()
  const tasks: TaskValue[] = plan.tasks.map((draft, index) =>
    Task.parse({
      ...draft,
      runId: planning.id,
      status: 'queued',
      ownerSessionId: null,
      attempt: 0,
      workspaceId: null,
      inputRefs: [],
      outputRefs: [],
      evidence: null,
      blocker: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      order: index,
    })
  )
  for (const task of tasks) await ctx.putTask(task)
  const planned: RunValue = {
    ...planning,
    plan,
    state: 'plan_ready',
    coordinatorId: sessionId,
    updatedAt: now(),
  }
  await ctx.putRun(planned)
  await emit(ctx, planned.id, null, 'run.plan_ready', { taskCount: tasks.length })
  return planned
}

export async function prepareWorkspaces(
  ctx: EngineContext,
  run: RunValue,
  tasks: TaskValue[]
): Promise<TaskValue[]> {
  const updated: TaskValue[] = []
  for (const task of tasks) {
    const workspace = await ctx.createWorkspace(
      run.id,
      task.id,
      run.projectRoot,
      run.settings.isolationMode
    )
    const next: TaskValue = {
      ...task,
      workspaceId: workspace.id,
      status: 'ready',
      updatedAt: now(),
    }
    await ctx.putTask(next)
    updated.push(next)
  }
  return updated
}

export async function executeRun(ctx: EngineContext, runId: string): Promise<SnapshotValue> {
  let snapshot = await ctx.snapshot()
  let run = snapshot.runs.find((item) => item.id === runId)
  if (!run) throw new Error(`Run ${runId} not found`)
  if (run.state === 'executing') return snapshot
  run = await setState(ctx, run, 'executing')

  const tasks = snapshot.tasks.filter((task) => task.runId === runId)
  const dir = await ctx.runDir(runId)
  let pending = tasks
  const active = new Map<string, { taskId: string; path: string }>()

  while (pending.some((task) => !isTerminalTaskState(task.status))) {
    snapshot = await ctx.snapshot()
    const currentRun = snapshot.runs.find((item) => item.id === runId)
    if (currentRun?.state === 'cancelled') {
      for (const value of active.values()) {
        const task = await loadTask(ctx, value.taskId)
        await ctx.putTask({
          ...task,
          status: 'cancelled',
          blocker: 'Run cancelled by user',
          updatedAt: now(),
        })
        await emit(ctx, runId, task.id, 'task.cancelled', {})
      }
      break
    }
    const current = snapshot.tasks.filter((task) => task.runId === runId)
    const activeBySession = new Map<string, string>()
    for (const [sessionId, value] of active) activeBySession.set(sessionId, value.taskId)
    const criticalPath = (await ctx.validateDag(current.map(toDagInput))).criticalPath
    const decisionRows = await ctx.selectDispatchable({
      tasks: current.map(toSchedulerTask),
      agents: snapshot.agents.map((agent) => ({
        id: agent.id,
        capabilities: agent.capabilities,
        status: agent.status,
      })),
      workspaces: snapshot.workspaces.map((workspace) => ({ id: workspace.id })),
      settings: {
        maxConcurrentAgents: run.settings.maxConcurrentAgents,
        maxRetries: run.settings.maxRetries,
      },
      criticalPath,
      activeBySession: Object.fromEntries(activeBySession),
    })
    const decisions = decisionRows.map((row) => ({
      task: current.find((task) => task.id === row.taskId) as TaskValue,
      session: snapshot.agents.find((agent) => agent.id === row.sessionId) as AgentSessionValue,
      workspace: snapshot.workspaces.find((workspace) => workspace.id === row.workspaceId) as WorkspaceValue,
    }))
    for (const decision of decisions) {
      const attempt = decision.task.attempt + 1
      const assigned: TaskValue = {
        ...decision.task,
        status: 'running',
        ownerSessionId: decision.session.id,
        workspaceId: decision.workspace.id,
        attempt,
        updatedAt: now(),
      }
      await ctx.putTask(assigned)
      const attemptDir = `${dir}/${assigned.id}/attempt-${attempt}`
      const prompt = buildTaskPrompt(run, assigned, run.context, attemptDir, decision.workspace.path)
      await ctx.writeArtifact(`${attemptDir}/task.prompt.txt`, prompt)
      await ctx.dispatch(assigned.id, decision.session.id, decision.workspace.id, prompt)
      active.set(decision.session.id, {
        taskId: assigned.id,
        path: `${attemptDir}/evidence.json`,
      })
      await emit(ctx, runId, assigned.id, 'task.started', {
        agentId: decision.session.id,
        workspaceId: decision.workspace.id,
        attempt,
      })
    }

    if (active.size === 0) {
      let changed = false
      for (const task of current) {
        if (isTerminalTaskState(task.status)) continue
        const parents = task.dependencies.map((dep) => current.find((item) => item.id === dep))
        const unresolved = parents.some((parent) => !parent || !isTerminalTaskState(parent.status))
        if (unresolved) continue
        const failedParent = parents.find((parent) => parent && parent.status !== 'completed')
        if (failedParent) {
          await ctx.putTask({
            ...task,
            status: 'failed',
            blocker: `Dependency ${failedParent.id} did not complete`,
            updatedAt: now(),
          })
          await emit(ctx, runId, task.id, 'task.failed', { dependency: failedParent.id })
          changed = true
        }
      }
      if (!changed) break
      continue
    }

    for (const [sessionId, value] of [...active]) {
      const ready = await ctx.waitForArtifact(value.path, 120000)
      if (!ready) {
        const failed: TaskValue = {
          ...(await loadTask(ctx, value.taskId)),
          status: 'failed',
          blocker: 'Evidence timeout',
          updatedAt: now(),
        }
        await ctx.putTask(failed)
        await emit(ctx, runId, failed.id, 'task.failed', { blocker: failed.blocker })
        active.delete(sessionId)
        continue
      }
      const raw = await ctx.readArtifact(value.path)
      let evidence: EvidenceValue
      try {
        evidence = Evidence.parse(JSON.parse(raw))
      } catch (error) {
        const failed: TaskValue = {
          ...(await loadTask(ctx, value.taskId)),
          status: 'failed',
          blocker: `Invalid evidence: ${error instanceof Error ? error.message : String(error)}`,
          updatedAt: now(),
        }
        await ctx.putTask(failed)
        await emit(ctx, runId, failed.id, 'task.failed', { blocker: failed.blocker })
        active.delete(sessionId)
        continue
      }
      const task = await loadTask(ctx, value.taskId)
      const validation = await ctx.validateEvidence(task.acceptance, evidence)
      const completed: TaskValue = {
        ...task,
        evidence,
        status: validation.ok ? 'validating' : 'failed',
        blocker: validation.ok ? null : validation.reasons.join('; '),
        outputRefs: [...task.outputRefs, value.path],
        updatedAt: now(),
      }
      await ctx.putTask(completed)
      await emit(ctx, runId, completed.id, validation.ok ? 'task.validating' : 'task.failed', {
        reasons: validation.reasons,
      })
      if (validation.ok) {
        const status = await ctx.workspaceStatus(completed.workspaceId ?? '')
        const diff = await ctx.workspaceDiff(completed.workspaceId ?? '')
        await emit(ctx, runId, completed.id, 'validation.result', {
          ok: true,
          dirty: status.dirty,
          changedFiles: status.changedFiles,
          diffLength: diff.length,
        })
        await ctx.putTask({
          ...completed,
          status: 'completed',
          evidence: { ...evidence, changedFiles: status.changedFiles },
          updatedAt: now(),
        })
        await emit(ctx, runId, completed.id, 'task.completed', {})
        for (const candidateId of await ctx.shouldUnblock(current.map(toDagInput), completed.id)) {
          const unblocked: TaskValue = {
            ...(await loadTask(ctx, candidateId)),
            status: 'ready',
            blocker: null,
            updatedAt: now(),
          }
          await ctx.putTask(unblocked)
          await emit(ctx, runId, candidateId, 'dependency.satisfied', { dependency: completed.id })
        }
      }
      active.delete(sessionId)
    }
    pending = (await ctx.snapshot()).tasks.filter((task) => task.runId === runId)
  }

  const finalSnapshot = await ctx.snapshot()
  const finalTasks = finalSnapshot.tasks.filter((task) => task.runId === runId)
  const finalRun = finalSnapshot.runs.find((item) => item.id === runId) ?? run
  const report = await ctx.buildReport({
    runId: finalRun.id,
    state: finalRun.state,
    planRisks: finalRun.plan?.risks ?? [],
    tasks: finalTasks.map((task) => ({
      id: task.id,
      status: task.status,
      outputRefs: task.outputRefs,
      blocker: task.blocker,
      evidence: task.evidence,
    })),
    workspaces: finalSnapshot.workspaces.map((workspace) => ({
      id: workspace.id,
      dirtyAtCreate: workspace.dirtyAtCreate,
    })),
    validationEventCount: finalSnapshot.events.filter((event) => event.type === 'validation.result').length,
  })
  const anyFailed = finalTasks.some((task) => ['failed', 'conflict', 'cancelled'].includes(task.status))
  const state = finalRun.state === 'cancelled'
    ? 'cancelled'
    : anyFailed && finalTasks.some((task) => task.status === 'completed')
      ? 'partial'
      : anyFailed
        ? 'failed'
        : 'completed'
  if (finalRun.state !== 'cancelled') await setState(ctx, finalRun, state)
  const finalReport = { ...report, state }
  await ctx.writeArtifact(`${dir}/report.json`, JSON.stringify(finalReport, null, 2))
  if (finalRun.state !== 'cancelled') await emit(ctx, runId, null, `run.${state}`, { report: finalReport })
  return ctx.snapshot()
}

async function loadTask(ctx: EngineContext, id: string): Promise<TaskValue> {
  const snapshot = await ctx.snapshot()
  const task = snapshot.tasks.find((item) => item.id === id)
  if (!task) throw new Error(`Task ${id} not found`)
  return task
}

export async function integrateTask(ctx: EngineContext, taskId: string): Promise<void> {
  const snapshot = await ctx.snapshot()
  const task = snapshot.tasks.find((item) => item.id === taskId)
  if (!task) throw new Error(`Task ${taskId} not found`)
  if (task.status !== 'completed') throw new Error('Only completed tasks can be integrated')
  const result = await ctx.integrate(task.workspaceId ?? '', 'worktree')
  if (result.conflict) {
    await ctx.putTask({ ...task, status: 'conflict', blocker: clamp(result.output, 2000), updatedAt: now() })
    await emit(ctx, task.runId, task.id, 'workspace.conflict', { output: result.output })
    return
  }
  if (!result.ok) {
    await ctx.putTask({ ...task, status: 'failed', blocker: clamp(result.output, 2000), updatedAt: now() })
    await emit(ctx, task.runId, task.id, 'validation.result', { ok: false, output: result.output })
    return
  }
  await ctx.putTask({
    ...task,
    status: 'completed',
    outputRefs: [...task.outputRefs, 'integrated'],
    updatedAt: now(),
  })
  await emit(ctx, task.runId, task.id, 'validation.result', { ok: true, integrated: true })
}

