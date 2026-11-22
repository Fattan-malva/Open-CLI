import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from './platform'
import { isWebviewOverlayOpen, WEBVIEW_OVERLAY_EVENT } from './webview-overlay'

export const BROWSER_DATA_CLEARED_EVENT = 'opencli:browser-data-cleared'
export const BROWSER_SNAPSHOT_EVENT = 'opencli:browser-snapshot'

export type BrowserSnapshotPayload = { label: string; dataUrl: string | null }

const browserSnapshots = new Map<string, string>()

export function getBrowserSnapshot(label: string) {
  return browserSnapshots.get(label) ?? null
}

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

// Incremented whenever a route change hides every webview. A sync queued before
// that change must not bring an old webview back after the hide command runs.
let visibilityEpoch = 0

function applyBrowserViews(focus: string | null = null, epoch?: number): Promise<void> {
  return enqueueBrowserCommand(() => {
    if (epoch !== undefined && epoch !== visibilityEpoch) return Promise.resolve()
    return invoke('browser_tabs_apply', {
      views: Array.from(browserViews.values()),
      focus,
    })
  })
}

/** Hides every native webview. Owners show their own view again when they become active. */
export function hideAllBrowserViews(): Promise<void> {
  const epoch = ++visibilityEpoch
  if (!isDesktop || browserViews.size === 0) return Promise.resolve()
  for (const [label, view] of browserViews) {
    if (view.visible) browserViews.set(label, { ...view, visible: false })
  }
  return applyBrowserViews(null, epoch)
}

function publishSnapshot(label: string, dataUrl: string | null) {
  if (dataUrl) browserSnapshots.set(label, dataUrl)
  else browserSnapshots.delete(label)
  window.dispatchEvent(
    new CustomEvent<BrowserSnapshotPayload>(BROWSER_SNAPSHOT_EVENT, {
      detail: { label, dataUrl },
    })
  )
}

let overlaySession = 0

async function captureOverlaySnapshots(session: number) {
  const visible = Array.from(browserViews.values()).filter(
    (view) => view.visible && !browserSnapshots.has(view.label)
  )
  await Promise.all(
    visible.map(async (view) => {
      try {
        const dataUrl = await enqueueBrowserCommand(() =>
          invoke<string>('browser_tab_snapshot', { label: view.label })
        )
        if (session === overlaySession && isWebviewOverlayOpen()) {
          publishSnapshot(view.label, dataUrl)
        }
      } catch {
        if (session === overlaySession && isWebviewOverlayOpen()) {
          publishSnapshot(view.label, null)
        }
      }
    })
  )
}

let overlaySnapshotActive = false

function onWebviewOverlayChange() {
  const open = isWebviewOverlayOpen()
  if (open === overlaySnapshotActive) return
  overlaySnapshotActive = open
  overlaySession += 1

  if (!open) {
    for (const label of Array.from(browserSnapshots.keys())) {
      publishSnapshot(label, null)
    }
    return
  }

  const session = overlaySession
  void captureOverlaySnapshots(session).finally(() => {
    if (session === overlaySession && isWebviewOverlayOpen()) {
      void hideAllBrowserViews().catch(() => undefined)
    }
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener(WEBVIEW_OVERLAY_EVENT, onWebviewOverlayChange)
}

// Hidden pages that were busy earlier (playing media, in a call) may become idle later,
// so the native side re-checks them periodically. Each check is a single command.
const POWER_REVIEW_MS = 30_000
let powerReviewTimer: number | null = null

function ensurePowerReview() {
  if (powerReviewTimer !== null) return
  powerReviewTimer = window.setInterval(() => {
    if (browserViews.size === 0) {
      const timer = powerReviewTimer
      powerReviewTimer = null
      if (timer !== null) window.clearInterval(timer)
      return
    }
    void applyBrowserViews().catch(() => undefined)
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
  const epoch = visibilityEpoch
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
  return applyBrowserViews(active, epoch)
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
  publishSnapshot(label, null)
  return enqueueBrowserCommand(() => invoke('browser_tab_close', { label }))
}

export function notifyBrowserDataCleared() {
  browserViews.clear()
  if (powerReviewTimer !== null) {
    window.clearInterval(powerReviewTimer)
    powerReviewTimer = null
  }
  for (const label of Array.from(browserSnapshots.keys())) {
    publishSnapshot(label, null)
  }
  window.dispatchEvent(new Event(BROWSER_DATA_CLEARED_EVENT))
}
