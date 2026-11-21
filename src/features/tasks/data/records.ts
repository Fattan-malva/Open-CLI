export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'canceled'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'

export type TaskRecord = {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  category: string
  dueDate: string | null
  marker: string
  createdAt: string
  updatedAt: string
}

export type TodoRecord = {
  id: string
  taskId: string | null
  title: string
  done: boolean
  dueDate: string | null
  marker: string
  createdAt: string
  updatedAt: string
}

export type TaskPayload = Pick<
  TaskRecord,
  'title' | 'description' | 'status' | 'priority' | 'category' | 'dueDate' | 'marker'
>

export type TodoPayload = Pick<
  TodoRecord,
  'taskId' | 'title' | 'dueDate' | 'marker'
>

export type TodoUpdatePayload = TodoPayload & Pick<TodoRecord, 'done'>
