import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  BROWSER_DATA_CLEARED_EVENT,
  createBrowserTab,
  navigateBrowserTab,
  repaintBrowserTab,
  syncBrowserTabs,
  type BrowserBounds,
} from '@/lib/browser'
import { isDesktop } from '@/lib/platform'
import {
  isWebviewOverlayOpen,
  WEBVIEW_OVERLAY_EVENT,
} from '@/lib/webview-overlay'
import type { BrainstormApp } from './data'

type UseBrainstormPaneArgs = {
  label: string
  app: BrainstormApp | null
  visible: boolean
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export function useBrainstormPane({
  label,
  app,
  visible,
}: UseBrainstormPaneArgs) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const created = useRef(false)
  const pending = useRef(false)
  const currentUrl = useRef<string | null>(null)
  const lastBounds = useRef<BrowserBounds | null>(null)
  const lastSyncKey = useRef<string | null>(null)
  const frame = useRef<number | null>(null)
  const settleTimer = useRef<number | null>(null)
  const [version, setVersion] = useState(0)
  const url = app?.url ?? ''
  const enabled = visible && isDesktop && Boolean(label && url)

  const getBounds = useCallback((): BrowserBounds => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (rect && rect.width > 1 && rect.height > 1) {
      const bounds = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
      lastBounds.current = bounds
      return bounds
    }

    return lastBounds.current ?? { x: 0, y: 0, width: 1, height: 1 }
  }, [])

  const openTab = useCallback(async () => {
    const capture = async (action: () => Promise<void>) => {
      try {
        await action()
        return null
      } catch (error) {
        return error
      }
    }

    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      lastError = await capture(() =>
        createBrowserTab(label, url, getBounds())
      )
      if (!lastError) return

      lastError = await capture(() => navigateBrowserTab(label, url))
      if (!lastError) return

      if (attempt === 0) await sleep(350)
    }

    throw lastError ?? new Error('Gagal membuka halaman.')
  }, [label, url, getBounds])

  const syncNow = useCallback(() => {
    if (!isDesktop || !created.current) return
    const active = enabled && !isWebviewOverlayOpen() ? label : null
    const bounds = getBounds()
    const key = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}:${active ?? ''}`
    if (lastSyncKey.current === key) return
    lastSyncKey.current = key
    void syncBrowserTabs([label], active, bounds).catch(() => undefined)
  }, [enabled, label, getBounds])

  const scheduleSync = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      syncNow()
    })

    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null
      syncNow()
      if (enabled && !isWebviewOverlayOpen()) {
        void repaintBrowserTab(label, getBounds()).catch(() => undefined)
      }
    }, 120)
  }, [enabled, label, getBounds, syncNow])

  useEffect(() => {
    window.addEventListener(WEBVIEW_OVERLAY_EVENT, syncNow)
    return () => window.removeEventListener(WEBVIEW_OVERLAY_EVENT, syncNow)
  }, [syncNow])

  useEffect(() => {
    syncNow()
  }, [syncNow, version])

  useEffect(() => {
    if (!enabled || pending.current) return

    let cancelled = false
    pending.current = true

    const run = async () => {
      if (!created.current) {
        await openTab()
        if (cancelled) return
        created.current = true
        currentUrl.current = url
        setVersion((value) => value + 1)
        return
      }

      if (currentUrl.current !== url) {
        await navigateBrowserTab(label, url)
        if (cancelled) return
        currentUrl.current = url
        setVersion((value) => value + 1)
      }
    }

    void run()
      .catch((error) => {
        if (cancelled) return
        toast.error(
          error instanceof Error ? error.message : 'Gagal membuka halaman.'
        )
      })
      .finally(() => {
        pending.current = false
        if (cancelled) setVersion((value) => value + 1)
      })

    return () => {
      cancelled = true
    }
  }, [enabled, label, url, openTab, version])

  useEffect(() => {
    const reset = () => {
      created.current = false
      currentUrl.current = null
      lastSyncKey.current = null
      setVersion((value) => value + 1)
    }
    window.addEventListener(BROWSER_DATA_CLEARED_EVENT, reset)
    return () => window.removeEventListener(BROWSER_DATA_CLEARED_EVENT, reset)
  }, [])

  useEffect(() => {
    const element = viewportRef.current
    if (!element || !isDesktop) return

    const observer = new ResizeObserver(scheduleSync)
    observer.observe(element)
    window.addEventListener('resize', scheduleSync)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', scheduleSync)
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    }
  }, [scheduleSync])

  const navigate = useCallback(
    async (target: string) => {
      if (!isDesktop || !created.current) return
      try {
        await navigateBrowserTab(label, target)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Gagal membuka halaman.'
        )
      }
    },
    [label]
  )

  const reload = useCallback(() => navigate(url), [navigate, url])

  return { viewportRef, reload, navigate }
}
