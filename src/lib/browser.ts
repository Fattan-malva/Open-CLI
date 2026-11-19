import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './platform'

export type BrowserBounds = {
  x: number
  y: number
  width: number
  height: number
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

export async function openEmbeddedBrowser(
  url: string,
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return
  await invoke('browser_open', { url, ...bounds })
}

export async function setEmbeddedBrowserBounds(
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return
  await invoke('browser_set_bounds', bounds)
}

export async function closeEmbeddedBrowser(): Promise<void> {
  if (!isDesktop) return
  await invoke('browser_close')
}

export async function createBrowserTab(
  label: string,
  url: string,
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return
  await invoke('browser_tab_create', { label, url, ...bounds })
}

export async function navigateBrowserTab(
  label: string,
  url: string
): Promise<void> {
  if (!isDesktop) return
  await invoke('browser_tab_navigate', { label, url })
}

export async function syncBrowserTabs(
  labels: string[],
  active: string | null,
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return
  await invoke('browser_tab_sync', { labels, active, ...bounds })
}

export async function closeBrowserTab(label: string): Promise<void> {
  if (!isDesktop) return
  await invoke('browser_tab_close', { label })
}
