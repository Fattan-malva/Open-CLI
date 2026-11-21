import { useMemo } from 'react'
import { differenceInMinutes, format, isValid, parseISO } from 'date-fns'
import type { TaskRecord, TodoRecord } from '../data/records'
import { Badge } from '@/components/ui/badge'

type RemindersTabProps = {
  tasks: TaskRecord[]
  todos: TodoRecord[]
}

type ReminderItem = {
  id: string
  kind: 'Tugas' | 'Todo'
  title: string
  marker: string
  dueDate: string
  dueAt: Date
  done: boolean
}

function formatDue(d: Date) {
  if (!isValid(d)) return '-'
  return format(d, 'dd MMM yyyy HH:mm')
}

export function RemindersTab({ tasks, todos }: RemindersTabProps) {
  const items = useMemo(() => {
    const now = new Date()
    const list: ReminderItem[] = []

    for (const t of tasks) {
      if (!t.dueDate) continue
      const dueAt = parseISO(t.dueDate)
      if (!isValid(dueAt)) continue
      list.push({
        id: `task-${t.id}`,
        kind: 'Tugas',
        title: t.title,
        marker: t.marker,
        dueDate: t.dueDate,
        dueAt,
        done: t.status === 'done' || t.status === 'canceled',
      })
    }

    for (const td of todos) {
      if (!td.dueDate) continue
      const dueAt = parseISO(td.dueDate)
      if (!isValid(dueAt)) continue
      list.push({
        id: `todo-${td.id}`,
        kind: 'Todo',
        title: td.title,
        marker: td.marker,
        dueDate: td.dueDate,
        dueAt,
        done: td.done,
      })
    }

    list.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    return { now, list }
  }, [tasks, todos])

  return (
    <div className='space-y-3'>
      <div className='text-muted-foreground text-sm'>
        Pengingat berdasarkan tanggal jatuh tempo. Dalam 24 jam akan ditampilkan dalam jam/menit.
      </div>
      {items.list.length === 0 ? (
        <div className='text-muted-foreground rounded-md border p-6 text-center text-sm'>
          Tidak ada pengingat.
        </div>
      ) : (
    <div className='space-y-2'>
      {items.list.map((it) => {
        const diffMin = differenceInMinutes(it.dueAt, items.now)
        const isOverdue = diffMin < 0 && !it.done
        const isSoon = diffMin >= 0 && diffMin <= 24 * 60
        const displayText = (() => {
          if (it.done) return 'Selesai'
          if (isOverdue) {
            const lateMin = Math.abs(diffMin)
            const days = Math.floor(lateMin / (60 * 24))
            const hours = Math.floor((lateMin % (60 * 24)) / 60)
            const mins = lateMin % 60
            if (days > 0) return `Terlambat ${days} hari ${hours} jam`
            if (hours > 0) return `Terlambat ${hours} jam ${mins} menit`
            return `Terlambat ${mins} menit`
          }
          if (isSoon) {
            const hours = Math.floor(diffMin / 60)
            const mins = diffMin % 60
            return `${hours} jam ${mins} menit lagi`
          }
          const days = Math.floor(diffMin / (60 * 24))
          return `${days} hari lagi`
        })()

        return (
          <div key={it.id} className='flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2'>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <span className='text-base'>{it.marker || (it.kind === 'Todo' ? '✅' : '📌')}</span>
                <span className={it.done ? 'text-muted-foreground line-through' : 'font-medium'}>{it.title}</span>
                <Badge variant='outline'>{it.kind}</Badge>
                {it.done && <Badge variant='secondary'>Selesai</Badge>}
                {!it.done && isOverdue && <Badge variant='destructive'>Terlambat</Badge>}
                {!it.done && isSoon && !isOverdue && <Badge variant='secondary'>Segera</Badge>}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>Jatuh tempo: {formatDue(it.dueAt)}</div>
            </div>
            <div className='text-sm font-medium'>{displayText}</div>
          </div>
        )
      })}
    </div>
      )}
    </div>
  )
}
