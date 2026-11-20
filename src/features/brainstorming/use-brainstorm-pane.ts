import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  BROWSER_DATA_CLEARED_EVENT,
  createBrowserTab,
  navigateBrowserTab,
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
  const [version, setVersion] = useState(0)
  const url = app?.url ?? ''
  const enabled = visible && isDesktop && Boolean(label && url)

  const getBounds = useCallback((): BrowserBounds => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (rect && rect.width > 1 && rect.height > 1) {
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }

    return {
      x: 0,
      y: 152,
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight - 152),
    }
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

  const sync = useCallback(() => {
    if (!isDesktop || !created.current || !url) return
    const active = enabled && !isWebviewOverlayOpen() ? label : null
    if (active) {
      void createBrowserTab(label, url, getBounds())
        .then(() => syncBrowserTabs([label], active, getBounds()))
        .catch(() => undefined)
      return
    }
    void syncBrowserTabs([label], null, getBounds()).catch(() => undefined)
  }, [enabled, label, url, getBounds])

  useEffect(() => {
    window.addEventListener(WEBVIEW_OVERLAY_EVENT, sync)
    return () => window.removeEventListener(WEBVIEW_OVERLAY_EVENT, sync)
  }, [sync])

  useEffect(() => {
    sync()
  }, [sync, version])

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
      setVersion((value) => value + 1)
    }
    window.addEventListener(BROWSER_DATA_CLEARED_EVENT, reset)
    return () => window.removeEventListener(BROWSER_DATA_CLEARED_EVENT, reset)
  }, [])

  useEffect(() => {
    const element = viewportRef.current
    if (!element || !isDesktop) return

    const observer = new ResizeObserver(sync)
    observer.observe(element)
    window.addEventListener('resize', sync)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [sync])

  const reload = useCallback(async () => {
    if (!isDesktop || !created.current || !url) return
    try {
      await navigateBrowserTab(label, url)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Gagal memuat ulang halaman.'
      )
    }
  }, [label, url])

  return { viewportRef, reload }
}
