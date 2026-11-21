import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from '@/lib/platform'
import type {
  TaskPayload,
  TaskRecord,
  TodoPayload,
  TodoRecord,
  TodoUpdatePayload,
} from './records'

export function listUserTasks(): Promise<TaskRecord[]> {
  if (!isDesktop) return Promise.resolve([])
  return invoke<TaskRecord[]>('user_task_list')
}

export function createUserTask(payload: TaskPayload): Promise<TaskRecord> {
  if (!isDesktop) return Promise.reject(new Error('Butuh aplikasi desktop.'))
  return invoke<TaskRecord>('user_task_create', { payload })
}

export function updateUserTask(
  id: string,
  payload: TaskPayload
): Promise<TaskRecord> {
  if (!isDesktop) return Promise.reject(new Error('Butuh aplikasi desktop.'))
  return invoke<TaskRecord>('user_task_update', { id, payload })
}

export function deleteUserTask(id: string): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  return invoke<void>('user_task_delete', { id })
}

export function listUserTodos(): Promise<TodoRecord[]> {
  if (!isDesktop) return Promise.resolve([])
  return invoke<TodoRecord[]>('user_todo_list')
}

export function createUserTodo(payload: TodoPayload): Promise<TodoRecord> {
  if (!isDesktop) return Promise.reject(new Error('Butuh aplikasi desktop.'))
  return invoke<TodoRecord>('user_todo_create', { payload })
}

export function updateUserTodo(
  id: string,
  payload: TodoUpdatePayload
): Promise<TodoRecord> {
  if (!isDesktop) return Promise.reject(new Error('Butuh aplikasi desktop.'))
  return invoke<TodoRecord>('user_todo_update', { id, payload })
}

export function deleteUserTodo(id: string): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  return invoke<void>('user_todo_delete', { id })
}
