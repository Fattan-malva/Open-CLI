import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { isDesktop } from './platform'

type PtyEvent = { id: string; data: string }

type Handler<T> = (value: T) => void

const dataHandlers = new Map<string, Set<Handler<Uint8Array>>>()
const exitHandlers = new Map<string, Set<Handler<void>>>()
const pendingData = new Map<string, Uint8Array[]>()
const pendingExits = new Set<string>()
const MAX_PENDING_BYTES = 256 * 1024
let listenersReady: Promise<void> | null = null
let dataFrame = 0

function decode(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function queuePendingData(id: string, chunk: Uint8Array) {
  const chunks = pendingData.get(id) ?? []
  chunks.push(chunk)
  let total = chunks.reduce((sum, item) => sum + item.length, 0)
  while (total > MAX_PENDING_BYTES && chunks.length > 1) {
    total -= chunks.shift()?.length ?? 0
  }
  pendingData.set(id, chunks)
}

function scheduleFlush() {
  if (dataFrame !== 0) return
  if (typeof requestAnimationFrame === 'function') {
    dataFrame = requestAnimationFrame(flushPendingData)
  } else {
    flushPendingData()
  }
}

function flushPendingData() {
  dataFrame = 0
  for (const [id, chunks] of pendingData) {
    if (!dataHandlers.has(id)) continue
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
    const merged = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    dataHandlers.get(id)?.forEach((handler) => handler(merged))
    pendingData.delete(id)
  }
}

async function ensureListeners() {
  if (!isDesktop) return
  if (listenersReady) return listenersReady

  listenersReady = Promise.all([
    listen<PtyEvent>('pty:data', ({ payload }) => {
      queuePendingData(payload.id, decode(payload.data))
      if (dataHandlers.has(payload.id)) scheduleFlush()
    }),
    listen<PtyEvent>('pty:exit', ({ payload }) => {
      const handlers = exitHandlers.get(payload.id)
      if (handlers) handlers.forEach((handler) => handler())
      else pendingExits.add(payload.id)
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
  const unregister = register(dataHandlers, id, handler)
  if (pendingData.has(id)) scheduleFlush()
  return unregister
}

export async function onPtyExit(id: string, handler: Handler<void>) {
  await ensureListeners()
  const unregister = register(exitHandlers, id, handler)
  if (pendingExits.delete(id)) handler()
  return unregister
}

export function ptyEnsure(
  id: string,
  cols: number,
  rows: number,
  shell: string,
  cwd?: string,
  initialCommand?: string
) {
  if (!isDesktop) return Promise.resolve(false)
  return invoke<boolean>('pty_ensure', {
    id,
    cols,
    rows,
    shell,
    cwd,
    ...(initialCommand ? { initialCommand } : {}),
  })
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

