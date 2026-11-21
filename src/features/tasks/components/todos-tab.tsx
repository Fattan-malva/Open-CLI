import { useMemo, useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { CalendarClock, CheckSquare2, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { TaskRecord, TodoRecord } from '../data/records'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TodosTabProps = {
  todos: TodoRecord[]
  tasks: TaskRecord[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  onCreate: () => void
  onEdit: (todo: TodoRecord) => void
  onDelete: (todo: TodoRecord) => void
  onToggleDone: (todo: TodoRecord, done: boolean) => void
  selectedDateKey: string | null
  onClearDateFilter: () => void
}

function formatDue(dueDate: string | null) {
  if (!dueDate) return 'Tanpa tenggat'
  const d = parseISO(dueDate)
  if (!isValid(d)) return 'Tanggal tidak valid'
  return format(d, 'dd MMM yyyy')
}

export function TodosTab({
  todos,
  tasks,
  loading,
  error,
  onRefresh,
  onCreate,
  onEdit,
  onDelete,
  onToggleDone,
  selectedDateKey,
  onClearDateFilter,
}: TodosTabProps) {
  const [search, setSearch] = useState('')
  const [taskFilter, setTaskFilter] = useState<string>('all')

  const taskTitleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of tasks) map.set(t.id, t.title)
    return map
  }, [tasks])

  const filtered = useMemo(() => {
    return todos.filter((td) => {
      if (selectedDateKey && td.dueDate !== selectedDateKey) return false
      if (taskFilter !== 'all') {
        if (taskFilter === 'none' && td.taskId) return false
        if (taskFilter !== 'none' && td.taskId !== taskFilter) return false
      }
      if (search.trim()) {
        const q = search.toLowerCase()
        const linked = td.taskId ? taskTitleById.get(td.taskId) ?? '' : ''
        const hay = `${td.title} ${td.marker} ${linked}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [todos, selectedDateKey, taskFilter, search, taskTitleById])

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='relative'>
            <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
            <Input
              placeholder='Cari todo...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='h-9 w-65 pl-8'
            />
          </div>
          <Select value={taskFilter} onValueChange={setTaskFilter}>
            <SelectTrigger className='h-9 w-55'>
              <SelectValue placeholder='Tugas' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Semua tugas</SelectItem>
              <SelectItem value='none'>Tanpa tugas</SelectItem>
              {tasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedDateKey && (
            <Button variant='outline' size='sm' className='h-9' onClick={onClearDateFilter}>
              Tanggal: {selectedDateKey} ×
            </Button>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <Button variant='outline' size='sm' className='h-9' onClick={onRefresh} disabled={loading}>
            <RefreshCw className='size-4' />
            Muat ulang
          </Button>
          <Button size='sm' className='h-9' onClick={onCreate}>
            <Plus className='size-4' />
            Todo baru
          </Button>
        </div>
      </div>

      {error && (
        <div className='text-destructive rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm'>
          {error}
        </div>
      )}

      {loading ? (
        <div className='grid gap-3 xl:grid-cols-2'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-36 w-full rounded-lg' />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className='rounded-lg border border-dashed py-16 text-center'>
          <CheckSquare2 className='text-muted-foreground mx-auto size-8' />
          <div className='mt-3 font-medium'>Belum ada todo</div>
          <div className='text-muted-foreground mt-1 text-sm'>
            Buat todo pertama atau ubah filter pencarian.
          </div>
          <Button size='sm' className='mt-4' onClick={onCreate}>
            <Plus className='size-4' />
            Todo baru
          </Button>
        </div>
      ) : (
        <div className='grid gap-3 xl:grid-cols-2'>
          {filtered.map((td) => {
            const linkedTitle = td.taskId ? taskTitleById.get(td.taskId) || td.taskId : null
            return (
              <Card key={td.id} className='gap-3 py-4'>
                <CardHeader className='flex flex-row items-start justify-between gap-3 space-y-0 px-4'>
                  <div className='flex min-w-0 gap-3'>
                    <Checkbox
                      checked={td.done}
                      onCheckedChange={(v) => onToggleDone(td, Boolean(v))}
                      aria-label='Tandai selesai'
                      className='mt-1'
                    />
                    <div className='bg-muted flex size-9 shrink-0 items-center justify-center rounded-md text-sm'>
                      {td.marker || <CheckSquare2 className='text-muted-foreground size-4' />}
                    </div>
                    <div className='min-w-0'>
                      <CardTitle
                        className={`truncate text-base ${td.done ? 'text-muted-foreground line-through' : ''}`}
                      >
                        {td.title}
                      </CardTitle>
                      <CardDescription className='mt-1 text-xs'>
                        {td.done ? 'Selesai' : 'Belum selesai'}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='space-y-3 px-4'>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    {linkedTitle ? <Badge variant='secondary'>{linkedTitle}</Badge> : null}
                    <span className='text-muted-foreground flex items-center gap-1 text-xs'>
                      <CalendarClock className='size-3.5' />
                      {formatDue(td.dueDate)}
                    </span>
                  </div>
                  <div className='flex gap-2'>
                    <Button variant='outline' size='sm' className='h-8' onClick={() => onEdit(td)}>
                      <Pencil className='size-3.5' />
                      Ubah
                    </Button>
                    <Button
                      variant='ghost'
                      size='sm'
                      className='text-destructive h-8'
                      onClick={() => onDelete(td)}
                    >
                      <Trash2 className='size-3.5' />
                      Hapus
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
