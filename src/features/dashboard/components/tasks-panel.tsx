import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarClock, CheckCircle2, CircleAlert, Clock3, ListTodo } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { listUserTasks, listUserTodos } from '@/features/tasks/data/api'
import type { TaskRecord, TodoRecord } from '@/features/tasks/data/records'

const priorityLabel = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  critical: 'Kritis',
} as const

function formatCountdown(dueDate: string | null) {
  if (!dueDate) return 'Tanpa tenggat'
  const due = new Date(dueDate).getTime()
  if (Number.isNaN(due)) return 'Tanggal tidak valid'
  const diff = due - Date.now()
  const abs = Math.abs(diff)
  const days = Math.floor(abs / 86400000)
  const hours = Math.floor((abs % 86400000) / 3600000)
  const minutes = Math.floor((abs % 3600000) / 60000)
  const parts: string[] = []
  if (days > 0) parts.push(`${days} hari`)
  if (hours > 0) parts.push(`${hours} jam`)
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} menit`)
  const text = parts.join(' ')
  return diff < 0 ? `${text} terlambat` : `${text} lagi`
}

function priorityVariant(priority: TaskRecord['priority']) {
  if (priority === 'critical' || priority === 'high') return 'destructive' as const
  if (priority === 'medium') return 'secondary' as const
  return 'outline' as const
}

function CountCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className='rounded-md border bg-muted/20 p-3'>
      <div className='flex items-center justify-between text-xs text-muted-foreground'>
        <span>{label}</span>
        <Icon className='size-3.5' />
      </div>
      <div className='mt-1 text-xl font-semibold tabular-nums'>{value}</div>
    </div>
  )
}

export function TasksPanel() {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [todos, setTodos] = useState<TodoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const [nextTasks, nextTodos] = await Promise.all([listUserTasks(), listUserTodos()])
        if (!active) return
        setTasks(nextTasks)
        setTodos(nextTodos)
        setError(null)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Gagal memuat tugas')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 15000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const counts = useMemo(() => {
    const byStatus = { todo: 0, in_progress: 0, done: 0, canceled: 0 }
    const byPriority = { low: 0, medium: 0, high: 0, critical: 0 }
    for (const task of tasks) {
      byStatus[task.status] += 1
      byPriority[task.priority] += 1
    }
    return { byStatus, byPriority }
  }, [tasks])

  const upcoming = useMemo(() => {
    const items = [
      ...tasks.filter((t) => t.dueDate && t.status !== 'done' && t.status !== 'canceled').map((t) => ({
        id: `task-${t.id}`,
        title: t.title,
        dueDate: t.dueDate,
        kind: 'Tugas' as const,
        priority: t.priority,
      })),
      ...todos.filter((t) => t.dueDate && !t.done).map((t) => ({
        id: `todo-${t.id}`,
        title: t.title,
        dueDate: t.dueDate,
        kind: 'Todo' as const,
        priority: null,
      })),
    ]
    return items
      .sort((a, b) => new Date(a.dueDate as string).getTime() - new Date(b.dueDate as string).getTime())
      .slice(0, 6)
  }, [tasks, todos])

  return (
    <Card>
      <CardHeader className='flex flex-row items-start justify-between gap-4'>
        <div className='space-y-1'>
          <CardTitle>Tugas</CardTitle>
          <CardDescription>
            Jumlah terkini dan pengingat dari data SQLite lokal.
          </CardDescription>
        </div>
        <Badge variant='outline' asChild>
          <Link to='/tasks'>Buka Tugas</Link>
        </Badge>
      </CardHeader>
      <CardContent className='space-y-4'>
        {loading ? (
          <div className='space-y-3'>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className='h-20 w-full' />)}
            </div>
            <Skeleton className='h-24 w-full' />
          </div>
        ) : error ? (
          <div className='text-sm text-destructive'>{error}</div>
        ) : (
          <>
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <CountCard label='Perlu dikerjakan' value={counts.byStatus.todo} icon={ListTodo} />
              <CountCard label='Berjalan' value={counts.byStatus.in_progress} icon={Clock3} />
              <CountCard label='Selesai' value={counts.byStatus.done} icon={CheckCircle2} />
              <CountCard label='Dibatalkan' value={counts.byStatus.canceled} icon={CircleAlert} />
            </div>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline'>Rendah {counts.byPriority.low}</Badge>
              <Badge variant='secondary'>Sedang {counts.byPriority.medium}</Badge>
              <Badge variant='destructive'>Tinggi {counts.byPriority.high}</Badge>
              <Badge variant='destructive'>Kritis {counts.byPriority.critical}</Badge>
              <Badge variant='outline'>{todos.length} todo</Badge>
            </div>
            <div className='space-y-2'>
              <div className='text-xs font-medium text-muted-foreground'>Pengingat mendatang</div>
              {upcoming.length === 0 ? (
                <div className='rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
                  Belum ada tenggat tugas atau todo.
                </div>
              ) : (
                <div className='space-y-2'>
                  {upcoming.map((item) => (
                    <div key={item.id} className='flex items-center justify-between gap-3 rounded-md border p-3'>
                      <div className='min-w-0'>
                        <div className='flex items-center gap-2'>
                          <span className='truncate text-sm font-medium'>{item.title}</span>
                          <Badge variant='outline' className='shrink-0'>{item.kind}</Badge>
                          {item.priority ? (
                            <Badge variant={priorityVariant(item.priority)} className='shrink-0'>
                              {priorityLabel[item.priority]}
                            </Badge>
                          ) : null}
                        </div>
                        <div className='mt-1 flex items-center gap-1 text-xs text-muted-foreground'>
                          <CalendarClock className='size-3.5' />
                          <span>{formatCountdown(item.dueDate)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
