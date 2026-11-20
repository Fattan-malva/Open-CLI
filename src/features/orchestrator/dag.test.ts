import { describe, expect, it } from 'vitest'
import { TaskDraft } from './types'
import {
  criticalPath,
  detectScopeConflicts,
  isReady,
  rankByPriority,
  topologicalOrder,
  validateDag,
} from './dag'

function draft(id: string, dependencies: string[] = []) {
  return TaskDraft.parse({
    id,
    title: `Task ${id}`,
    objective: `Objective ${id}`,
    acceptance: ['done'],
    dependencies,
    scope: {
      allowedPaths: [`src/${id}`],
      forbiddenPaths: [],
      interfaces: [],
    },
    complexity: 'low',
    risk: 'low',
  })
}

describe('dag', () => {
  it('orders a valid graph and computes a critical path', () => {
    const tasks = [draft('b', ['a']), draft('a'), draft('c', ['b'])]
    const validation = validateDag(tasks)
    expect(validation.ok).toBe(true)
    expect(validation.order).toEqual(['a', 'b', 'c'])
    expect(validation.criticalPath).toEqual(['a', 'b', 'c'])
  })

  it('rejects cycles, missing dependencies, and empty acceptance', () => {
    const tasks = [
      draft('a', ['b']),
      draft('b', ['a']),
      TaskDraft.parse({
        ...draft('c'),
        acceptance: [],
        dependencies: ['missing'],
      }),
    ]
    const validation = validateDag(tasks)
    const codes = validation.issues.map((issue) => issue.code)
    expect(codes).toContain('cycle')
    expect(codes).toContain('unknown_dependency')
    expect(codes).toContain('empty_acceptance')
    expect(topologicalOrder(tasks)).toBeNull()
  })

  it('detects concurrent scope overlap but allows ordered overlap', () => {
    const left = TaskDraft.parse({
      ...draft('left'),
      scope: { allowedPaths: ['src/shared'], interfaces: [] },
    })
    const right = TaskDraft.parse({
      ...draft('right'),
      scope: { allowedPaths: ['src/shared'], interfaces: [] },
    })
    expect(detectScopeConflicts([left, right])).toHaveLength(1)
    const ordered = TaskDraft.parse({ ...right, dependencies: ['left'] })
    expect(detectScopeConflicts([left, ordered])).toHaveLength(0)
  })

  it('ranks by path priority and reports readiness only with completed dependencies', () => {
    const a = draft('a')
    const b = draft('b', ['a'])
    expect(rankByPriority([b, a], ['a', 'b']).map((task) => task.id)).toEqual(['a', 'b'])
    expect(isReady([a, b], b)).toBe(false)
    const completedA = { ...a, status: 'completed' as const }
    expect(isReady([completedA, b], b)).toBe(true)
  })

  it('finds a critical path through the highest-weight branch', () => {
    const low = draft('low')
    const high = TaskDraft.parse({ ...draft('high'), risk: 'high' })
    const end = draft('end', ['low', 'high'])
    expect(criticalPath([low, high, end])).toEqual(['high', 'end'])
  })
})
