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

type BrowserView = BrowserBounds & { label: string; visible: boolean }

// Visibility is tracked per webview label, so several panes can show at once
// (for example the two Brainstorming panes) while each owner only changes its own tabs.
const browserViews = new Map<string, BrowserView>()

function applyBrowserViews(focus: string | null = null): Promise<void> {
  return enqueueBrowserCommand(() =>
    invoke('browser_tabs_apply', {
      views: Array.from(browserViews.values()),
      focus,
    })
  )
}

// Hidden pages that were busy earlier (playing media, in a call) may become idle later,
// so the native side re-checks them periodically. Each check is a single command.
const POWER_REVIEW_MS = 30_000
let powerReviewTimer: number | null = null

function ensurePowerReview() {
  if (powerReviewTimer !== null) return
  powerReviewTimer = window.setInterval(() => {
    if (browserViews.size > 0) void applyBrowserViews().catch(() => undefined)
  }, POWER_REVIEW_MS)
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

export function createBrowserTab(
  label: string,
  url: string,
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  browserViews.set(label, { label, visible: false, ...bounds })
  ensurePowerReview()
  return enqueueBrowserCommand(() =>
    invoke('browser_tab_create', { label, url, ...bounds })
  )
}

export function navigateBrowserTab(label: string, url: string): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  return enqueueBrowserCommand(async () => {
    await invoke('browser_tab_navigate', { label, url })
    await applyBrowserViews()
  })
}

/**
 * Shows `active` (if it is one of `labels`) and hides the other labels.
 * Labels not listed here are left untouched.
 */
export function syncBrowserTabs(
  labels: string[],
  active: string | null,
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  for (const label of labels) {
    const current = browserViews.get(label)
    if (!current) continue
    const rect = label === active ? bounds : current
    browserViews.set(label, {
      label,
      visible: label === active,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    })
  }
  return applyBrowserViews(active)
}

export function repaintBrowserTab(
  label: string,
  bounds: BrowserBounds
): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  const current = browserViews.get(label)
  if (current) browserViews.set(label, { ...current, ...bounds })
  return enqueueBrowserCommand(() =>
    invoke('browser_tab_repaint', { label, ...bounds })
  )
}

export function closeBrowserTab(label: string): Promise<void> {
  if (!isDesktop) return Promise.resolve()
  browserViews.delete(label)
  return enqueueBrowserCommand(() => invoke('browser_tab_close', { label }))
}

export function notifyBrowserDataCleared() {
  browserViews.clear()
  window.dispatchEvent(new Event(BROWSER_DATA_CLEARED_EVENT))
}
