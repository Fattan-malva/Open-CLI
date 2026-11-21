import { useMemo, useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { CalendarClock, ListTodo, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { TaskPriority, TaskRecord, TaskStatus } from '../data/records'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type TasksTabProps = {
  tasks: TaskRecord[]
  loading: boolean
  error: string | null
  onRefresh: () => void
  onCreate: () => void
  onEdit: (task: TaskRecord) => void
  onDelete: (task: TaskRecord) => void
  selectedDateKey: string | null
  onClearDateFilter: () => void
}

const statusLabel: Record<TaskStatus, string> = {
  todo: 'Perlu dikerjakan',
  in_progress: 'Sedang dikerjakan',
  done: 'Selesai',
  canceled: 'Dibatalkan',
}

const priorityLabel: Record<TaskPriority, string> = {
  low: 'Rendah',
  medium: 'Sedang',
  high: 'Tinggi',
  critical: 'Kritis',
}

function formatDue(dueDate: string | null) {
  if (!dueDate) return 'Tanpa tenggat'
  const d = parseISO(dueDate)
  if (!isValid(d)) return 'Tanggal tidak valid'
  return format(d, 'dd MMM yyyy')
}

export function TasksTab({
  tasks,
  loading,
  error,
  onRefresh,
  onCreate,
  onEdit,
  onDelete,
  selectedDateKey,
  onClearDateFilter,
}: TasksTabProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (selectedDateKey && t.dueDate !== selectedDateKey) return false
      if (statusFilter !== 'all' && t.status !== statusFilter) return false
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const hay = `${t.title} ${t.description} ${t.category} ${t.marker}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [tasks, selectedDateKey, statusFilter, priorityFilter, search])

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='relative'>
            <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2' />
            <Input
              placeholder='Cari judul, deskripsi, atau kategori...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='h-9 w-65 pl-8'
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='h-9 w-48'>
              <SelectValue placeholder='Status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Semua status</SelectItem>
              <SelectItem value='todo'>Perlu dikerjakan</SelectItem>
              <SelectItem value='in_progress'>Sedang dikerjakan</SelectItem>
              <SelectItem value='done'>Selesai</SelectItem>
              <SelectItem value='canceled'>Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className='h-9 w-40'>
              <SelectValue placeholder='Prioritas' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Semua prioritas</SelectItem>
              <SelectItem value='low'>Rendah</SelectItem>
              <SelectItem value='medium'>Sedang</SelectItem>
              <SelectItem value='high'>Tinggi</SelectItem>
              <SelectItem value='critical'>Kritis</SelectItem>
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
            Tugas baru
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
            <Skeleton key={i} className='h-44 w-full rounded-lg' />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className='rounded-lg border border-dashed py-16 text-center'>
          <ListTodo className='text-muted-foreground mx-auto size-8' />
          <div className='mt-3 font-medium'>Belum ada tugas</div>
          <div className='text-muted-foreground mt-1 text-sm'>
            Buat tugas pertama atau ubah filter pencarian.
          </div>
          <Button size='sm' className='mt-4' onClick={onCreate}>
            <Plus className='size-4' />
            Tugas baru
          </Button>
        </div>
      ) : (
        <div className='grid gap-3 xl:grid-cols-2'>
          {filtered.map((task) => (
            <Card key={task.id} className='gap-3 py-4'>
              <CardHeader className='flex flex-row items-start justify-between gap-3 space-y-0 px-4'>
                <div className='flex min-w-0 gap-3'>
                  <div className='bg-muted flex size-10 shrink-0 items-center justify-center rounded-md text-base'>
                    {task.marker || <ListTodo className='text-muted-foreground size-5' />}
                  </div>
                  <div className='min-w-0'>
                    <CardTitle className='truncate text-base'>{task.title}</CardTitle>
                    <CardDescription className='line-clamp-2 mt-1 text-xs'>
                      {task.description || 'Tidak ada deskripsi.'}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant='outline' className='shrink-0'>
                  {statusLabel[task.status]}
                </Badge>
              </CardHeader>
              <CardContent className='space-y-3 px-4'>
                <div className='flex flex-wrap items-center gap-1.5'>
                  <Badge variant='secondary'>{priorityLabel[task.priority]}</Badge>
                  {task.category ? <Badge variant='outline'>{task.category}</Badge> : null}
                  <span className='text-muted-foreground flex items-center gap-1 text-xs'>
                    <CalendarClock className='size-3.5' />
                    {formatDue(task.dueDate)}
                  </span>
                </div>
                <div className='flex gap-2'>
                  <Button variant='outline' size='sm' className='h-8' onClick={() => onEdit(task)}>
                    <Pencil className='size-3.5' />
                    Ubah
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='text-destructive h-8'
                    onClick={() => onDelete(task)}
                  >
                    <Trash2 className='size-3.5' />
                    Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
