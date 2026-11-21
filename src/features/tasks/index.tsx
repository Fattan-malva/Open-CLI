import { useCallback, useEffect, useMemo, useState } from 'react'
import { format, isValid } from 'date-fns'
import { toast } from 'sonner'
import {
  createUserTask,
  createUserTodo,
  deleteUserTask,
  deleteUserTodo,
  listUserTasks,
  listUserTodos,
  updateUserTask,
  updateUserTodo,
} from './data/api'
import type { TaskPayload, TaskRecord, TodoPayload, TodoRecord } from './data/records'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Separator } from '@/components/ui/separator'
import { TaskSidebarNav, type TaskSection } from './components/task-sidebar-nav'
import { TaskFormDialog } from './components/task-form-dialog'
import { TodoFormDialog } from './components/todo-form-dialog'
import { TasksTab } from './components/tasks-tab'
import { TodosTab } from './components/todos-tab'
import { CalendarTab } from './components/calendar-tab'
import { RemindersTab } from './components/reminders-tab'
import { ConfirmDialog } from '@/components/confirm-dialog'

type TaskDialogState = {
  open: boolean
  mode: 'create' | 'edit'
  current: TaskRecord | null
}

type TodoDialogState = {
  open: boolean
  mode: 'create' | 'edit'
  current: TodoRecord | null
}

export function Tasks() {
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [todos, setTodos] = useState<TodoRecord[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [loadingTodos, setLoadingTodos] = useState(false)
  const [errorTasks, setErrorTasks] = useState<string | null>(null)
  const [errorTodos, setErrorTodos] = useState<string | null>(null)

  const [activeSection, setActiveSection] = useState<TaskSection>('tugas')
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const [taskDialog, setTaskDialog] = useState<TaskDialogState>({
    open: false,
    mode: 'create',
    current: null,
  })
  const [todoDialog, setTodoDialog] = useState<TodoDialogState>({
    open: false,
    mode: 'create',
    current: null,
  })
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<TaskRecord | null>(null)
  const [deleteTodoTarget, setDeleteTodoTarget] = useState<TodoRecord | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshTasks = useCallback(async () => {
    setLoadingTasks(true)
    setErrorTasks(null)
    try {
      const data = await listUserTasks()
      setTasks(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal memuat tugas.'
      setErrorTasks(msg)
    } finally {
      setLoadingTasks(false)
    }
  }, [])

  const refreshTodos = useCallback(async () => {
    setLoadingTodos(true)
    setErrorTodos(null)
    try {
      const data = await listUserTodos()
      setTodos(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal memuat todo.'
      setErrorTodos(msg)
    } finally {
      setLoadingTodos(false)
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      await refreshTasks()
      await refreshTodos()
    }
    void load()
  }, [refreshTasks, refreshTodos])

  const selectedDateKey = useMemo(() => {
    if (!selectedDate) return null
    if (!isValid(selectedDate)) return null
    return format(selectedDate, 'yyyy-MM-dd')
  }, [selectedDate])

  const onCreateTask = () => {
    setTaskDialog({ open: true, mode: 'create', current: null })
  }

  const onEditTask = (task: TaskRecord) => {
    setTaskDialog({ open: true, mode: 'edit', current: task })
  }

  const onSubmitTask = async (payload: TaskPayload) => {
    setBusy(true)
    try {
      if (taskDialog.mode === 'edit' && taskDialog.current) {
        await updateUserTask(taskDialog.current.id, payload)
        toast.success('Tugas berhasil diperbarui.')
      } else {
        await createUserTask(payload)
        toast.success('Tugas berhasil dibuat.')
      }
      setTaskDialog({ open: false, mode: 'create', current: null })
      await refreshTasks()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal menyimpan tugas.'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const onConfirmDeleteTask = async () => {
    if (!deleteTaskTarget) return
    setBusy(true)
    try {
      await deleteUserTask(deleteTaskTarget.id)
      toast.success('Tugas dihapus.')
      setDeleteTaskTarget(null)
      await refreshTasks()
      await refreshTodos()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal menghapus tugas.'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const onCreateTodo = () => {
    setTodoDialog({ open: true, mode: 'create', current: null })
  }

  const onEditTodo = (todo: TodoRecord) => {
    setTodoDialog({ open: true, mode: 'edit', current: todo })
  }

  const onSubmitTodo = async (payload: TodoPayload, done?: boolean) => {
    setBusy(true)
    try {
      if (todoDialog.mode === 'edit' && todoDialog.current) {
        await updateUserTodo(todoDialog.current.id, {
          ...payload,
          done: done ?? todoDialog.current.done,
        })
        toast.success('Todo berhasil diperbarui.')
      } else {
        await createUserTodo(payload)
        toast.success('Todo berhasil dibuat.')
      }
      setTodoDialog({ open: false, mode: 'create', current: null })
      await refreshTodos()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal menyimpan todo.'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const onToggleTodoDone = async (todo: TodoRecord, done: boolean) => {
    setBusy(true)
    try {
      await updateUserTodo(todo.id, {
        taskId: todo.taskId,
        title: todo.title,
        dueDate: todo.dueDate,
        marker: todo.marker,
        done,
      })
      toast.success(done ? 'Todo ditandai selesai.' : 'Todo ditandai belum selesai.')
      await refreshTodos()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal mengubah status todo.'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const onConfirmDeleteTodo = async () => {
    if (!deleteTodoTarget) return
    setBusy(true)
    try {
      await deleteUserTodo(deleteTodoTarget.id)
      toast.success('Todo dihapus.')
      setDeleteTodoTarget(null)
      await refreshTodos()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Gagal menghapus todo.'
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  const onPickDate = (date: Date | null) => {
    setSelectedDate(date)
  }

  const clearSelectedDate = () => {
    setSelectedDate(null)
  }

  return (
    <>
      <AuthenticatedHeader />
      <Main fixed fluid className='flex flex-1 flex-col'>
        <div className='space-y-0.5'>
          <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>Tugas</h1>
          <p className='text-muted-foreground'>
            Kelola tugas, todo, kalender, dan pengingat di satu tempat.
          </p>
        </div>
        <Separator className='my-4 lg:my-6' />
        <div className='flex flex-1 flex-col space-y-2 overflow-hidden lg:flex-row lg:space-y-0 lg:space-x-12'>
          <aside className='top-0 lg:sticky lg:w-1/5'>
            <TaskSidebarNav value={activeSection} onChange={setActiveSection} />
          </aside>
          <div className='min-w-0 flex-1 overflow-y-auto pb-6'>
            {activeSection === 'tugas' ? (
              <TasksTab
                tasks={tasks}
                loading={loadingTasks}
                error={errorTasks}
                onRefresh={refreshTasks}
                onCreate={onCreateTask}
                onEdit={onEditTask}
                onDelete={(t) => setDeleteTaskTarget(t)}
                selectedDateKey={selectedDateKey}
                onClearDateFilter={clearSelectedDate}
              />
            ) : null}
            {activeSection === 'todo' ? (
              <TodosTab
                todos={todos}
                tasks={tasks}
                loading={loadingTodos}
                error={errorTodos}
                onRefresh={refreshTodos}
                onCreate={onCreateTodo}
                onEdit={onEditTodo}
                onDelete={(t) => setDeleteTodoTarget(t)}
                onToggleDone={onToggleTodoDone}
                selectedDateKey={selectedDateKey}
                onClearDateFilter={clearSelectedDate}
              />
            ) : null}
            {activeSection === 'kalender' ? (
              <CalendarTab
                tasks={tasks}
                todos={todos}
                selectedDate={selectedDate}
                onPickDate={onPickDate}
                onClearDate={clearSelectedDate}
              />
            ) : null}
            {activeSection === 'pengingat' ? (
              <RemindersTab tasks={tasks} todos={todos} />
            ) : null}
          </div>
        </div>
      </Main>

      <TaskFormDialog
        open={taskDialog.open}
        mode={taskDialog.mode}
        current={taskDialog.current}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setTaskDialog((s) => ({ ...s, open: false }))
        }}
        onSubmit={onSubmitTask}
      />

      <TodoFormDialog
        open={todoDialog.open}
        mode={todoDialog.mode}
        current={todoDialog.current}
        tasks={tasks}
        busy={busy}
        onOpenChange={(open) => {
          if (!open) setTodoDialog((s) => ({ ...s, open: false }))
        }}
        onSubmit={onSubmitTodo}
      />

      <ConfirmDialog
        open={!!deleteTaskTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTaskTarget(null)
        }}
        title='Hapus tugas ini?'
        desc={
          deleteTaskTarget
            ? `Tugas "${deleteTaskTarget.title}" akan dihapus. Tindakan ini tidak bisa dibatalkan.`
            : 'Tugas akan dihapus.'
        }
        destructive
        confirmText='Hapus'
        isLoading={busy}
        handleConfirm={onConfirmDeleteTask}
      />

      <ConfirmDialog
        open={!!deleteTodoTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTodoTarget(null)
        }}
        title='Hapus todo ini?'
        desc={
          deleteTodoTarget
            ? `Todo "${deleteTodoTarget.title}" akan dihapus. Tindakan ini tidak bisa dibatalkan.`
            : 'Todo akan dihapus.'
        }
        destructive
        confirmText='Hapus'
        isLoading={busy}
        handleConfirm={onConfirmDeleteTodo}
      />
    </>
  )
}
