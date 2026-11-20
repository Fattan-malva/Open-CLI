import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import {
  BROWSER_DATA_CLEARED_EVENT,
  createBrowserTab,
  navigateBrowserTab,
  syncBrowserTabs,
  type BrowserBounds,
} from '@/lib/browser'
import { isDesktop } from '@/lib/platform'
import { cn } from '@/lib/utils'
import {
  isWebviewOverlayOpen,
  WEBVIEW_OVERLAY_EVENT,
} from '@/lib/webview-overlay'
import { CustomSocialIcon } from './custom-icon'
import { getSocialSite } from './data'

type SocialWorkspaceProps = {
  site: string | null
}

export function SocialWorkspace({ site }: SocialWorkspaceProps) {
  const { state: sidebarState } = useSidebar()
  const config = useMemo(() => getSocialSite(site), [site])
  const viewportRef = useRef<HTMLDivElement>(null)
  const createdLabels = useRef(new Set<string>())
  const pendingLabels = useRef(new Set<string>())
  const [version, setVersion] = useState(0)
  const visible = Boolean(config)
  const label = config ? `browser-tab-social-${site}` : ''

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

  const sync = useCallback(() => {
    if (!isDesktop || !config || !label) return
    const active = isWebviewOverlayOpen() ? null : visible ? label : null
    const labels = createdLabels.current.has(label) ? [label] : []
    if (labels.length === 0) return
    if (active) {
      void createBrowserTab(label, config.url, getBounds())
        .then(() => syncBrowserTabs(labels, active, getBounds()))
        .catch(() => undefined)
      return
    }
    void syncBrowserTabs(labels, null, getBounds()).catch(() => undefined)
  }, [visible, label, config, getBounds])

  useEffect(() => {
    const resync = () => sync()
    window.addEventListener(WEBVIEW_OVERLAY_EVENT, resync)
    return () => window.removeEventListener(WEBVIEW_OVERLAY_EVENT, resync)
  }, [sync])

  useEffect(() => {
    if (
      !isDesktop ||
      !label ||
      !config ||
      createdLabels.current.has(label) ||
      pendingLabels.current.has(label)
    ) {
      return
    }

    let cancelled = false
    pendingLabels.current.add(label)

    const openTab = async () => {
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
          createBrowserTab(label, config.url, getBounds())
        )
        if (!lastError) return

        lastError = await capture(() => navigateBrowserTab(label, config.url))
        if (!lastError) return

        if (attempt === 0) {
          await new Promise((resolve) => window.setTimeout(resolve, 350))
        }
      }
      throw lastError ?? new Error('Gagal membuka halaman.')
    }

    void openTab()
      .then(() => {
        if (cancelled) return
        createdLabels.current.add(label)
        setVersion((value) => value + 1)
      })
      .catch((error) => {
        if (cancelled) return
        toast.error(
          error instanceof Error ? error.message : 'Gagal membuka halaman.'
        )
      })
      .finally(() => {
        pendingLabels.current.delete(label)
      })

    return () => {
      cancelled = true
    }
  }, [label, config, getBounds])

  useEffect(() => {
    sync()
  }, [sync, version, sidebarState])

  useEffect(() => {
    const reset = () => {
      createdLabels.current.clear()
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
    if (!isDesktop || !config || !label) return
    try {
      await navigateBrowserTab(label, config.url)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Gagal memuat ulang halaman.'
      )
    }
  }, [config, label])

  const Icon = config?.icon

  return (
    <div
      className={cn(
        'absolute inset-0 z-40 flex flex-col',
        visible ? 'bg-background' : 'pointer-events-none bg-transparent'
      )}
    >
      {visible ? <AuthenticatedHeader /> : null}
      <Main
        fixed
        fluid
        className={cn('min-h-0 flex-1 overflow-hidden p-0', !visible && 'pointer-events-none')}
      >
        <div className='flex h-full min-h-0 flex-col'>
          {visible ? (
            <div className='flex h-11 shrink-0 items-center gap-2 border-b bg-background px-3'>
              {Icon ? (
                <Icon className='size-4' />
              ) : config ? (
                <CustomSocialIcon
                  label={config.label}
                  iconUrl={config.iconUrl}
                  className='size-4'
                />
              ) : null}
              <span className='text-sm font-medium'>{config?.label ?? 'Social'}</span>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label='Muat ulang'
                disabled={!config || !isDesktop}
                onClick={() => void reload()}
                className='ml-auto size-8'
              >
                <RotateCw className='size-4' />
              </Button>
            </div>
          ) : null}

          <div
            ref={viewportRef}
            className={cn(
              'relative min-h-0 flex-1',
              visible ? 'bg-background' : 'bg-transparent'
            )}
          >
            {!isDesktop && visible ? (
              <div className='flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground'>
                Halaman social hanya tersedia pada aplikasi desktop.
              </div>
            ) : null}
          </div>
        </div>
      </Main>
    </div>
  )
}
