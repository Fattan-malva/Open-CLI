import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './platform'

export const BROWSER_DATA_CLEARED_EVENT = 'opencli:browser-data-cleared'

let browserCommandTail: Promise<unknown> = Promise.resolve()

function enqueueBrowserCommand<T>(run: () => Promise<T>): Promise<T> {
  const result = browserCommandTail.then(run, run)
  browserCommandTail = result.catch(() => undefined)
  return result
}

export type BrowserBounds = {
  x: number
  y: number
  width: number
  height: number
}

type BrowserVisibility = {
  active: boolean
  bounds: BrowserBounds
}

const FALLBACK_BOUNDS: BrowserBounds = { x: 0, y: 0, width: 1, height: 1 }
const browserVisibility = new Map<string, BrowserVisibility>()

function browserVisibilityPayload(fallback: BrowserBounds = FALLBACK_BOUNDS) {
  let active: string | null = null
  for (const [label, entry] of browserVisibility) {
    if (entry.active) {
      active = label
      break
    }
  }
  const bounds = active
    ? browserVisibility.get(active)?.bounds ?? fallback
    : fallback
  return { labels: Array.from(browserVisibility.keys()), active, ...bounds }
}

export function normalizeBrowserUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  if (parsed.username || parsed.password) return null

  return parsed.href
}

function looksLikeUrl(value: string): boolean {
  if (/^https?:\/\//i.test(value)) return true
  if (/\s/.test(value)) return false
  if (/^localhost(:\d+)?(\/|$)/i.test(value)) return true
  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/|$)/.test(value)) return true
  return /^[^\s./]+(\.[^\s./]+)+(:\d+)?(\/|$)/i.test(value)
}

export function resolveBrowserTarget(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Masukkan kata kunci atau alamat URL.')

  if (looksLikeUrl(trimmed)) {
    const url = normalizeBrowserUrl(trimmed)
    if (url) return url
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`
}

export function openEmbeddedBrowser(
  url: string,
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  return enqueueBrowserCommand(() => invoke('browser_open', { url, ...bounds }))
}

export function setEmbeddedBrowserBounds(bounds: BrowserBounds): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  return enqueueBrowserCommand(() => invoke('browser_set_bounds', bounds))
}

export function closeEmbeddedBrowser(): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  return enqueueBrowserCommand(() => invoke('browser_close'))
}

export function createBrowserTab(
  label: string,
  url: string,
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  const existing = browserVisibility.get(label)
  browserVisibility.set(label, { active: existing?.active ?? false, bounds })
  return enqueueBrowserCommand(async () => {
    await invoke('browser_tab_create', { label, url, ...bounds })
    await invoke('browser_tab_sync', browserVisibilityPayload(bounds))
  })
}

export function navigateBrowserTab(label: string, url: string): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  return enqueueBrowserCommand(async () => {
    await invoke('browser_tab_navigate', { label, url })
    await invoke('browser_tab_sync', browserVisibilityPayload())
  })
}

export function syncBrowserTabs(
  labels: string[],
  active: string | null,
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  for (const label of labels) {
    browserVisibility.set(label, { active: false, bounds })
  }
  if (active && browserVisibility.has(active)) {
    browserVisibility.get(active)!.active = true
    for (const [label, entry] of browserVisibility) {
      if (label !== active) entry.active = false
    }
  }
  return enqueueBrowserCommand(() =>
    invoke('browser_tab_sync', browserVisibilityPayload(bounds))
  )
}

export function closeBrowserTab(label: string): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  browserVisibility.delete(label)
  return enqueueBrowserCommand(async () => {
    await invoke('browser_tab_close', { label })
    await invoke('browser_tab_sync', browserVisibilityPayload())
  })
}

export function closeAllBrowserTabs(): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  browserVisibility.clear()
  return enqueueBrowserCommand(async () => {
    await invoke('browser_tabs_close_all')
    await invoke('browser_tab_sync', browserVisibilityPayload())
  })
}

export function notifyBrowserDataCleared() {
  window.dispatchEvent(new Event(BROWSER_DATA_CLEARED_EVENT))
}
