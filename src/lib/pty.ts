import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isDesktop } from './platform'

type PtyEvent = { id: string; data: string }

type Handler<T> = (value: T) => void

const dataHandlers = new Map<string, Set<Handler<Uint8Array>>>()
const exitHandlers = new Map<string, Set<Handler<void>>>()
const suspendHandlers = new Map<string, Set<Handler<void>>>()
const pendingData = new Map<string, Uint8Array[]>()
let listenersReady: Promise<void> | null = null
let dataFrame = 0

function decode(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function flushPendingData() {
  dataFrame = 0
  for (const [id, chunks] of pendingData) {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
    const merged = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    dataHandlers.get(id)?.forEach((handler) => handler(merged))
  }
  pendingData.clear()
}

async function ensureListeners() {
  if (!isDesktop) return
  if (listenersReady) return listenersReady

  listenersReady = Promise.all([
    listen<PtyEvent>('pty:data', ({ payload }) => {
      const chunks = pendingData.get(payload.id) ?? []
      chunks.push(decode(payload.data))
      pendingData.set(payload.id, chunks)
      if (dataFrame === 0 && typeof requestAnimationFrame === 'function') {
        dataFrame = requestAnimationFrame(flushPendingData)
      } else if (dataFrame === 0) {
        flushPendingData()
      }
    }),
    listen<PtyEvent>('pty:exit', ({ payload }) => {
      exitHandlers.get(payload.id)?.forEach((handler) => handler())
    }),
    listen<PtyEvent>('pty:suspended', ({ payload }) => {
      suspendHandlers.get(payload.id)?.forEach((handler) => handler())
    }),
  ]).then(() => undefined)

  return listenersReady
}

function register<T>(map: Map<string, Set<Handler<T>>>, id: string, handler: Handler<T>) {
  const set = map.get(id) ?? new Set<Handler<T>>()
  set.add(handler)
  map.set(id, set)
  return () => {
    set.delete(handler)
    if (set.size === 0) map.delete(id)
  }
}

export async function onPtyData(id: string, handler: Handler<Uint8Array>) {
  await ensureListeners()
  return register(dataHandlers, id, handler)
}

export async function onPtyExit(id: string, handler: Handler<void>) {
  await ensureListeners()
  return register(exitHandlers, id, handler)
}

export async function onPtySuspended(id: string, handler: Handler<void>) {
  await ensureListeners()
  return register(suspendHandlers, id, handler)
}

export function ptySpawn(
  id: string,
  cols: number,
  rows: number,
  shell: string,
  cwd?: string
) {
  if (!isDesktop) return Promise.resolve()
  return invoke<void>('pty_spawn', { id, cols, rows, shell, cwd })
}

export function ptyEnsure(
  id: string,
  cols: number,
  rows: number,
  shell: string,
  cwd?: string
) {
  if (!isDesktop) return Promise.resolve(false)
  return invoke<boolean>('pty_ensure', { id, cols, rows, shell, cwd })
}

export function ptyWrite(id: string, data: string) {
  if (!isDesktop) return Promise.resolve()
  return invoke<void>('pty_write', { id, data })
}

export function ptyResize(id: string, cols: number, rows: number) {
  if (!isDesktop) return Promise.resolve()
  return invoke<void>('pty_resize', { id, cols, rows })
}

export function ptyKill(id: string) {
  if (!isDesktop) return Promise.resolve()
  return invoke<void>('pty_kill', { id })
}

export function ptyIsBusy(id: string) {
  if (!isDesktop) return Promise.resolve(false)
  return invoke<boolean>('pty_is_busy', { id })
}

export function ptySetActive(id: string, active: boolean) {
  if (!isDesktop) return Promise.resolve()
  return invoke<void>('pty_set_active', { id, active })
}

export function ptyIdleSessions(idleAfterMs: number) {
  if (!isDesktop) return Promise.resolve([] as string[])
  return invoke<string[]>('pty_idle_sessions', { idleAfterMs })
}

export function ptySuspend(id: string) {
  if (!isDesktop) return Promise.resolve(false)
  return invoke<boolean>('pty_suspend', { id })
}

export function systemMemoryAvailablePercent() {
  if (!isDesktop) return Promise.resolve(100)
  return invoke<number>('system_memory_available_percent')
}
