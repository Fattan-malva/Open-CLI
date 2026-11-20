import type { RiskValue, TaskDraftValue, TaskScopeValue, TaskValue } from './types'

export type DagTask = (TaskDraftValue & { id: string }) | TaskValue

export type DagIssue = {
  code:
    | 'duplicate_id'
    | 'unknown_dependency'
    | 'cycle'
    | 'empty_tasks'
    | 'empty_acceptance'
    | 'scope_overlap'
    | 'forbidden_overlap'
  message: string
  taskIds: string[]
}

export type DagValidation = {
  ok: boolean
  issues: DagIssue[]
  order: string[]
  criticalPath: string[]
}

function normalized(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

function pathTouches(path: string, candidate: string): boolean {
  const a = normalized(path)
  const b = normalized(candidate)
  if (a === b) return true
  if (a === '' || b === '') return false
  return a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
}

export function scopeOverlaps(a: TaskScopeValue, b: TaskScopeValue): boolean {
  for (const left of a.allowedPaths) {
    for (const right of b.allowedPaths) {
      if (pathTouches(left, right)) return true
    }
    for (const right of b.forbiddenPaths) {
      if (pathTouches(left, right)) return true
    }
  }
  for (const right of b.allowedPaths) {
    for (const left of a.forbiddenPaths) {
      if (pathTouches(left, right)) return true
    }
  }
  return false
}

export function detectScopeConflicts(tasks: DagTask[]): DagIssue[] {
  const issues: DagIssue[] = []
  for (let i = 0; i < tasks.length; i += 1) {
    for (let j = i + 1; j < tasks.length; j += 1) {
      const left = tasks[i]
      const right = tasks[j]
      if (!left || !right) continue
      const leftInterfaces = new Set(left.scope.interfaces ?? [])
      const rightInterfaces = new Set(right.scope.interfaces ?? [])
      const contractsShared = [...leftInterfaces].some((item) => rightInterfaces.has(item))
      const order = left.dependencies.includes(right.id) || right.dependencies.includes(left.id)
      if (contractsShared || order) continue
      if (scopeOverlaps(left.scope, right.scope)) {
        issues.push({
          code: 'scope_overlap',
          message: `Scopes of ${left.id} and ${right.id} overlap without a contract or dependency`,
          taskIds: [left.id, right.id],
        })
      }
    }
  }
  return issues
}

export function topologicalOrder(tasks: DagTask[]): string[] | null {
  const ids = new Set(tasks.map((task) => task.id))
  const indegree = new Map<string, number>()
  const children = new Map<string, string[]>()
  for (const task of tasks) {
    indegree.set(task.id, 0)
    children.set(task.id, [])
  }
  for (const task of tasks) {
    const deps = task.dependencies.filter((dep) => ids.has(dep))
    indegree.set(task.id, deps.length)
    for (const dep of deps) {
      const list = children.get(dep) ?? []
      list.push(task.id)
      children.set(dep, list)
    }
  }
  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id)
    .sort()
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined) break
    order.push(id)
    for (const child of children.get(id) ?? []) {
      const degree = (indegree.get(child) ?? 0) - 1
      indegree.set(child, degree)
      if (degree === 0) queue.push(child)
    }
    queue.sort()
  }
  return order.length === tasks.length ? order : null
}

function weight(task: DagTask): number {
  const risk: Record<RiskValue, number> = { low: 1, medium: 2, high: 3 }
  return risk[task.risk ?? 'medium']
}

export function criticalPath(tasks: DagTask[]): string[] {
  const order = topologicalOrder(tasks) ?? []
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const best = new Map<string, number>()
  const next = new Map<string, string | null>()
  for (const id of order) {
    const task = byId.get(id)
    if (!task) continue
    let bestDep: string | null = null
    let bestValue = 0
    for (const dep of task.dependencies) {
      const value = best.get(dep) ?? 0
      if (value > bestValue || (value === bestValue && (bestDep === null || dep < bestDep))) {
        bestValue = value
        bestDep = dep
      }
    }
    best.set(id, bestValue + weight(task))
    next.set(id, bestDep)
  }
  let current: string | null = null
  let max = 0
  for (const [id, value] of best) {
    if (value > max) {
      max = value
      current = id
    }
  }
  const path: string[] = []
  while (current) {
    path.unshift(current)
    current = next.get(current) ?? null
  }
  return path
}

export function validateDag(tasks: DagTask[]): DagValidation {
  const issues: DagIssue[] = []
  if (tasks.length === 0) {
    issues.push({ code: 'empty_tasks', message: 'Plan contains no tasks', taskIds: [] })
  }
  const seen = new Set<string>()
  for (const task of tasks) {
    if (seen.has(task.id)) {
      issues.push({
        code: 'duplicate_id',
        message: `Duplicate task id ${task.id}`,
        taskIds: [task.id],
      })
    }
    seen.add(task.id)
    if ((task.acceptance ?? []).length === 0) {
      issues.push({
        code: 'empty_acceptance',
        message: `Task ${task.id} has no acceptance criteria`,
        taskIds: [task.id],
      })
    }
  }
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (!seen.has(dep)) {
        issues.push({
          code: 'unknown_dependency',
          message: `Task ${task.id} depends on unknown task ${dep}`,
          taskIds: [task.id, dep],
        })
      }
      if (dep === task.id) {
        issues.push({
          code: 'cycle',
          message: `Task ${task.id} depends on itself`,
          taskIds: [task.id],
        })
      }
    }
  }
  const order = topologicalOrder(tasks)
  if (order === null) {
    issues.push({
      code: 'cycle',
      message: 'Task graph contains a dependency cycle',
      taskIds: tasks.map((task) => task.id),
    })
  }
  issues.push(...detectScopeConflicts(tasks))
  return {
    ok: issues.length === 0,
    issues,
    order: order ?? [],
    criticalPath: criticalPath(tasks),
  }
}

export function dependentsOf(tasks: DagTask[], id: string): string[] {
  return tasks
    .filter((task) => task.dependencies.includes(id))
    .map((task) => task.id)
}

export function isReady(tasks: DagTask[], task: DagTask): boolean {
  const byId = new Map(tasks.map((item) => [item.id, item]))
  return task.dependencies.every((dep) => {
    const parent = byId.get(dep)
    if (!parent) return false
    return 'status' in parent && parent.status === 'completed'
  })
}

export function rankByPriority<T extends DagTask>(tasks: T[], path: string[]): T[] {
  const pathRank = new Map(path.map((id, index) => [id, path.length - index]))
  return [...tasks].sort((a, b) => {
    const aRank = pathRank.get(a.id) ?? 0
    const bRank = pathRank.get(b.id) ?? 0
    if (aRank !== bRank) return bRank - aRank
    const aRisk = a.risk === 'high' ? 2 : a.risk === 'medium' ? 1 : 0
    const bRisk = b.risk === 'high' ? 2 : b.risk === 'medium' ? 1 : 0
    if (aRisk !== bRisk) return bRisk - aRisk
    return a.id.localeCompare(b.id)
  })
}
