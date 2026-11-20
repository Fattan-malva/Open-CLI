import { validateDag, type DagValidation } from './dag'
import { buildPlanPrompt } from './context'
import { Plan, type PlanValue, type RunValue, type BrowserContextValue } from './types'

export type PlannerIO = {
  sendPrompt: (sessionId: string, prompt: string) => Promise<void>
  writeArtifact: (path: string, contents: string) => Promise<void>
  waitForArtifact: (path: string, timeoutMs: number) => Promise<boolean>
  readArtifact: (path: string) => Promise<string>
}

export type PlanResult = {
  plan: PlanValue
  validation: DagValidation
}

function extractJson(raw: string): string {
  const trimmed = raw.trim()
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) return trimmed
  return trimmed.slice(start, end + 1)
}

export async function generatePlan(
  run: RunValue,
  context: BrowserContextValue,
  sessionId: string,
  artifactDir: string,
  io: PlannerIO,
  timeoutMs = 180000
): Promise<PlanResult> {
  const planPath = `${artifactDir}/plan.json`
  await io.writeArtifact(`${artifactDir}/plan.prompt.txt`, buildPlanPrompt(run, context))
  await io.sendPrompt(
    sessionId,
    [
      'Create the orchestration plan for this request.',
      `Read the full instructions from ${artifactDir}/plan.prompt.txt.`,
      `Write ONLY the validated JSON plan to ${planPath}.`,
      'Then reply with a single short line: PLAN_WRITTEN',
    ].join('\n')
  )
  const ready = await io.waitForArtifact(planPath, timeoutMs)
  if (!ready) throw new Error('Planner agent did not write plan.json before the timeout')
  const raw = await io.readArtifact(planPath)
  const parsed = Plan.safeParse(JSON.parse(extractJson(raw)))
  if (!parsed.success) throw new Error(`Planner output failed schema validation: ${parsed.error.message}`)
  const plan = parsed.data
  const tasks = plan.tasks.map((task) => ({ ...task, dependencies: task.dependencies ?? [] }))
  const validation = validateDag(tasks)
  if (!validation.ok) {
    throw new Error(`Planner output failed DAG validation: ${validation.issues.map((issue) => issue.message).join('; ')}`)
  }
  return { plan: { ...plan, tasks }, validation }
}
