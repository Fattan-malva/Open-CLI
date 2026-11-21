import { useEffect, useState } from 'react'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { listUserTasks } from '@/features/tasks/data/api'
import type { TaskRecord } from '@/features/tasks/data/records'
import { FeatureOverviewGrid } from './components/feature-overview-grid'
import { MemoryPanel } from './components/memory-panel'
import { TasksPanel } from './components/tasks-panel'

export function Dashboard() {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const next = await listUserTasks()
        if (active) setTasks(next)
      } catch {
        if (active) setTasks([])
      } finally {
        if (active) setTasksLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  return (
    <>
      <AuthenticatedHeader />
      <Main className='flex flex-1 flex-col gap-4 sm:gap-6'>
        <div className='space-y-1'>
          <h1 className='text-2xl font-bold tracking-tight'>Dashboard</h1>
          <p className='text-sm text-muted-foreground'>
            Ringkasan workspace OpenCLI, memori sistem realtime, dan data tugas lokal.
          </p>
        </div>
        <MemoryPanel />
        <TasksPanel />
        <FeatureOverviewGrid tasks={tasks} tasksLoading={tasksLoading} />
      </Main>
    </>
  )
}
