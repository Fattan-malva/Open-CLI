import { useMemo } from 'react'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  isValid,
} from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { TaskRecord, TodoRecord } from '../data/records'
import { Button } from '@/components/ui/button'

type CalendarTabProps = {
  tasks: TaskRecord[]
  todos: TodoRecord[]
  selectedDate: Date | null
  onPickDate: (date: Date | null) => void
  onClearDate: () => void
}

function toDateKey(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export function CalendarTab({
  tasks,
  todos,
  selectedDate,
  onPickDate,
  onClearDate,
}: CalendarTabProps) {
  const monthBase = selectedDate ?? new Date()
  const monthStart = startOfMonth(monthBase)
  const monthEnd = endOfMonth(monthBase)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TaskRecord[]>()
    for (const t of tasks) {
      if (!t.dueDate) continue
      const key = t.dueDate
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    return map
  }, [tasks])

  const todosByDate = useMemo(() => {
    const map = new Map<string, TodoRecord[]>()
    for (const td of todos) {
      if (!td.dueDate) continue
      const key = td.dueDate
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(td)
    }
    return map
  }, [todos])

  const selectedKey = selectedDate && isValid(selectedDate) ? toDateKey(selectedDate) : null
  const selectedTasks = selectedKey ? tasksByDate.get(selectedKey) ?? [] : []
  const selectedTodos = selectedKey ? todosByDate.get(selectedKey) ?? [] : []

  const goPrev = () => {
    const base = selectedDate ?? new Date()
    onPickDate(addMonths(base, -1))
  }
  const goNext = () => {
    const base = selectedDate ?? new Date()
    onPickDate(addMonths(base, 1))
  }

  return (
    <div className='grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]'>
      <div className='rounded-md border p-3'>
        <div className='mb-3 flex items-center justify-between gap-2'>
          <div className='font-medium'>
            {format(monthBase, 'MMMM yyyy', { locale: localeId })}
          </div>
          <div className='flex items-center gap-1'>
      <Button variant='outline' size='icon' className='size-8' onClick={goPrev} aria-label='Bulan sebelumnya'>
        <ChevronLeft className='size-4' />
      </Button>
      <Button variant='outline' size='icon' className='size-8' onClick={goNext} aria-label='Bulan berikutnya'>
        <ChevronRight className='size-4' />
      </Button>
          </div>
        </div>
        <div className='grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground'>
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => (
            <div key={d} className='py-1'>
              {d}
            </div>
          ))}
        </div>
        <div className='mt-1 grid grid-cols-7 gap-1'>
          {days.map((day) => {
            const key = toDateKey(day)
            const inMonth = isSameMonth(day, monthBase)
            const isSelected = selectedDate ? isSameDay(day, selectedDate) : false
            const dayTasks = tasksByDate.get(key) ?? []
            const dayTodos = todosByDate.get(key) ?? []
            const markers = [
              ...dayTasks.map((t) => t.marker).filter(Boolean),
              ...dayTodos.map((td) => td.marker).filter(Boolean),
            ].slice(0, 3)
            return (
              <button
                key={key}
                type='button'
                onClick={() => onPickDate(day)}
                className={[
                  'min-h-16 rounded-md border p-1 text-left text-xs transition-colors',
                  inMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground',
                  isSelected ? 'border-primary ring-1 ring-primary' : 'border-border',
                ].join(' ')}
              >
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>{format(day, 'd')}</span>
                  {(dayTasks.length > 0 || dayTodos.length > 0) && (
                    <span className='text-[10px] text-muted-foreground'>
                      {dayTasks.length + dayTodos.length}
                    </span>
                  )}
                </div>
                <div className='mt-1 flex flex-wrap gap-0.5'>
                  {markers.map((m, idx) => (
                    <span key={`${key}-m-${idx}`} className='text-sm leading-none'>
                      {m}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className='rounded-md border p-3'>
        <div className='mb-2 flex items-center justify-between gap-2'>
          <div className='font-medium'>
            {selectedKey ? `Detail ${selectedKey}` : 'Pilih tanggal'}
          </div>
          {selectedKey && (
            <Button variant='ghost' size='sm' onClick={onClearDate}>
              Bersihkan
            </Button>
          )}
        </div>
        {!selectedKey ? (
          <div className='text-muted-foreground text-sm'>Klik tanggal pada kalender untuk melihat tugas/todo.</div>
        ) : (
          <div className='space-y-3'>
            <div>
              <div className='mb-1 text-sm font-medium'>Tugas ({selectedTasks.length})</div>
              {selectedTasks.length === 0 ? (
                <div className='text-muted-foreground text-sm'>Tidak ada tugas.</div>
              ) : (
                <div className='space-y-2'>
                  {selectedTasks.map((t) => (
                    <div key={t.id} className='rounded-md border px-2 py-1.5 text-sm'>
                      <div className='flex items-center gap-2'>
                        <span>{t.marker || '📌'}</span>
                        <span className='font-medium'>{t.title}</span>
                      </div>
                      {t.category ? (
                        <div className='text-muted-foreground mt-1 text-xs'>Kategori: {t.category}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className='mb-1 text-sm font-medium'>Todo ({selectedTodos.length})</div>
              {selectedTodos.length === 0 ? (
                <div className='text-muted-foreground text-sm'>Tidak ada todo.</div>
              ) : (
                <div className='space-y-2'>
                  {selectedTodos.map((td) => (
                    <div key={td.id} className='rounded-md border px-2 py-1.5 text-sm'>
                      <div className='flex items-center gap-2'>
                        <span>{td.marker || '✅'}</span>
                        <span className={td.done ? 'text-muted-foreground line-through' : ''}>{td.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
