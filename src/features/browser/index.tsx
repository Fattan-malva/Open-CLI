import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { listen } from '@tauri-apps/api/event'
import { Lock, Plus, RotateCw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { BrowserOrchestratorControls } from '@/features/orchestrator/components/browser-controls'
import {
  BROWSER_DATA_CLEARED_EVENT,
  closeBrowserTab,
  createBrowserTab,
  navigateBrowserTab,
  normalizeBrowserUrl,
  resolveBrowserTarget,
  syncBrowserTabs,
  type BrowserBounds,
} from '@/lib/browser'
import { isDesktop } from '@/lib/platform'
import { cn } from '@/lib/utils'
import {
  isWebviewOverlayOpen,
  WEBVIEW_OVERLAY_EVENT,
} from '@/lib/webview-overlay'

type BrowserTab = {
  id: string
  label: string
  url: string
  title: string
}

type BrowserTitlePayload = {
  label: string
  title: string
}

function hostFromUrl(value: string) {
  if (!value) return 'Tab baru'
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return 'Tab baru'
  }
}

function createTabId() {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `browser-tab-${Date.now().toString(36)}-${suffix}`
}

type BrowserWorkspaceProps = {
  visible: boolean
  embedded?: boolean
}

export function BrowserWorkspace({
  visible,
  embedded = false,
}: BrowserWorkspaceProps) {
  const { state: sidebarState } = useSidebar()
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const tabStripRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const justDraggedRef = useRef(false)
  const dragEndTimerRef = useRef<number | null>(null)
  const [draft, setDraft] = useState('')
  const [draftForId, setDraftForId] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingTitles = useRef(new Map<string, string>())
  const latestRef = useRef({
    visible,
    activeLabel: null as string | null,
    activeUrl: null as string | null,
    labels: [] as string[],
  })

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeId) ?? null,
    [tabs, activeId]
  )
  const activeLabel = activeTab?.url ? activeTab.label : null
  const input = draftForId === activeId ? draft : (activeTab?.url ?? '')

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

  const sync = useCallback(async () => {
    if (!isDesktop) return

    const latest = latestRef.current
    if (
      !latest.visible ||
      !latest.activeLabel ||
      isWebviewOverlayOpen()
    ) {
      await syncBrowserTabs(latest.labels, null, getBounds())
      return
    }

    await syncBrowserTabs(latest.labels, latest.activeLabel, getBounds())
  }, [getBounds])

  const addTab = useCallback(
    async (value?: string) => {
      try {
        const id = createTabId()

        if (value) {
          const url = resolveBrowserTarget(value)
          await createBrowserTab(id, url, getBounds())
          const title = pendingTitles.current.get(id) ?? hostFromUrl(url)
          pendingTitles.current.delete(id)
          setTabs((previous) => [
            ...previous,
            { id, label: id, url, title },
          ])
        } else {
          setTabs((previous) => [
            ...previous,
            { id, label: id, url: '', title: 'Tab baru' },
          ])
        }

        setActiveId(id)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Gagal membuat tab.')
      }
    },
    [getBounds]
  )

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!input.trim()) return

      try {
        const url = resolveBrowserTarget(input)
        const title = hostFromUrl(url)

        if (!activeTab) {
          await addTab(url)
        } else if (!activeTab.url) {
          await createBrowserTab(activeTab.label, url, getBounds())
          const webTitle =
            pendingTitles.current.get(activeTab.label) ?? title
          pendingTitles.current.delete(activeTab.label)
          setTabs((previous) =>
            previous.map((tab) =>
              tab.id === activeTab.id ? { ...tab, url, title: webTitle } : tab
            )
          )
        } else {
          await navigateBrowserTab(activeTab.label, url)
          setTabs((previous) =>
            previous.map((tab) =>
              tab.id === activeTab.id ? { ...tab, url, title } : tab
            )
          )
        }

        setDraft('')
        setDraftForId(null)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Gagal membuka alamat.')
      }
    },
    [input, activeTab, addTab, getBounds]
  )

  const reload = useCallback(async () => {
    if (!activeTab?.url) return
    try {
      await navigateBrowserTab(activeTab.label, activeTab.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal memuat ulang.')
    }
  }, [activeTab])

  const closeTab = useCallback(
    async (id: string) => {
      const index = tabs.findIndex((tab) => tab.id === id)
      if (index === -1) return

      const next = tabs.filter((tab) => tab.id !== id)
      const fallback = next[Math.min(index, next.length - 1)]

      try {
        if (tabs[index].url) await closeBrowserTab(tabs[index].label)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Gagal menutup tab.')
        return
      }

      pendingTitles.current.delete(tabs[index].label)
      setTabs(next)
      if (activeId === id) setActiveId(fallback?.id ?? null)
    },
    [tabs, activeId]
  )

  const finishDrag = useCallback(() => {
    const moved = Boolean(dragRef.current?.moved)
    dragRef.current = null
    setDraggingId(null)
    setDropTargetId(null)
    if (!moved) return

    justDraggedRef.current = true
    if (dragEndTimerRef.current !== null) {
      window.clearTimeout(dragEndTimerRef.current)
    }
    dragEndTimerRef.current = window.setTimeout(() => {
      justDraggedRef.current = false
      dragEndTimerRef.current = null
    }, 50)
  }, [])

  const reorderTabs = useCallback((fromId: string, toId: string) => {
    setTabs((previous) => {
      const from = previous.findIndex((tab) => tab.id === fromId)
      const to = previous.findIndex((tab) => tab.id === toId)
      if (from < 0 || to < 0 || from === to) return previous
      const next = [...previous]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const handleTabPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('button')) return
      dragRef.current = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        dragRef.current = null
      }
    },
    []
  )

  const handleTabPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const candidate = dragRef.current
      if (!candidate || candidate.pointerId !== event.pointerId) return
      if (!candidate.moved) {
        const distance = Math.hypot(
          event.clientX - candidate.startX,
          event.clientY - candidate.startY
        )
        if (distance < 5) return
        candidate.moved = true
        setDraggingId(candidate.id)
      }

      const strip = tabStripRef.current
      if (strip) {
        const rect = strip.getBoundingClientRect()
        const edge = 48
        if (event.clientX < rect.left + edge) strip.scrollLeft -= 12
        else if (event.clientX > rect.right - edge) strip.scrollLeft += 12
      }

      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-browser-tab-id]')
      const targetId = target?.dataset.browserTabId ?? null
      if (targetId && targetId !== candidate.id) {
        setDropTargetId(targetId)
        reorderTabs(candidate.id, targetId)
      } else {
        setDropTargetId(null)
      }
    },
    [reorderTabs]
  )

  const handleTabPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const candidate = dragRef.current
      if (!candidate || candidate.pointerId !== event.pointerId) return
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      finishDrag()
    },
    [finishDrag]
  )

  useEffect(() => {
    return () => {
      dragRef.current = null
      if (dragEndTimerRef.current !== null) {
        window.clearTimeout(dragEndTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return

    let unlisten: (() => void) | undefined
    void listen<BrowserTitlePayload>('browser-tab-title', ({ payload }) => {
      const title = payload.title.trim() || 'Tab baru'
      pendingTitles.current.set(payload.label, title)
      setTabs((previous) => {
        let changed = false
        const next = previous.map((tab) => {
          if (tab.label === payload.label && tab.title !== title) {
            changed = true
            return { ...tab, title }
          }
          return tab
        })
        return changed ? next : previous
      })
    })
      .then((fn) => {
        unlisten = fn
      })
      .catch(() => undefined)

    return () => unlisten?.()
  }, [])

  useEffect(() => {
    const reset = () => {
      pendingTitles.current.clear()
      setTabs([])
      setActiveId(null)
    }
    window.addEventListener(BROWSER_DATA_CLEARED_EVENT, reset)
    return () => window.removeEventListener(BROWSER_DATA_CLEARED_EVENT, reset)
  }, [])

  useEffect(() => {
    latestRef.current = {
      visible,
      activeLabel,
      activeUrl: activeTab?.url ?? null,
      labels: tabs.filter((tab) => tab.url).map((tab) => tab.label),
    }
    void sync()
  }, [visible, activeLabel, activeTab, tabs, sidebarState, sync])

  useEffect(() => {
    const resync = () => void sync()
    window.addEventListener(WEBVIEW_OVERLAY_EVENT, resync)
    return () => window.removeEventListener(WEBVIEW_OVERLAY_EVENT, resync)
  }, [sync])

  useEffect(() => {
    const element = viewportRef.current
    if (!element || !isDesktop) return

    const observer = new ResizeObserver(() => void sync())
    const onResize = () => void sync()
    observer.observe(element)
    window.addEventListener('resize', onResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [sync])

  useEffect(() => {
    if (!visible || embedded) return

    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      if (modifier && key === 'l') {
        event.preventDefault()
        event.stopImmediatePropagation()
        inputRef.current?.focus()
        inputRef.current?.select()
        return
      }

      if (modifier && !event.shiftKey && key === 't') {
        event.preventDefault()
        event.stopImmediatePropagation()
        void addTab()
        return
      }

      if (modifier && !event.shiftKey && key === 'w' && activeId) {
        event.preventDefault()
        event.stopImmediatePropagation()
        void closeTab(activeId)
        return
      }

      if (modifier && event.key === 'Tab' && tabs.length > 1) {
        event.preventDefault()
        event.stopImmediatePropagation()
        const index = tabs.findIndex((tab) => tab.id === activeId)
        const delta = event.shiftKey ? -1 : 1
        const nextIndex = (index + delta + tabs.length) % tabs.length
        setActiveId(tabs[nextIndex].id)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [visible, embedded, addTab, closeTab, activeId, tabs])

  const isUrl = normalizeBrowserUrl(input) !== null
  const showNewTab = !activeTab?.url

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col bg-background',
        embedded ? 'z-0' : 'z-40',
        !visible && 'hidden'
      )}
    >
      {!embedded && <AuthenticatedHeader />}

      <Main fixed fluid className='min-h-0 flex-1 overflow-hidden p-0'>
        <div className='flex h-full min-h-0 flex-col'>
          <div
            ref={tabStripRef}
            className='flex h-10 shrink-0 items-end gap-1 overflow-x-auto bg-muted/40 px-2 pt-1 no-scrollbar'
          >
            {tabs.map((tab) => (
              <div
                key={tab.id}
                role='tab'
                aria-selected={tab.id === activeId}
                tabIndex={0}
                data-browser-tab-id={tab.id}
                onPointerDown={(event) => handleTabPointerDown(event, tab.id)}
                onPointerMove={handleTabPointerMove}
                onPointerUp={handleTabPointerUp}
                onPointerCancel={finishDrag}
                onClick={() => {
                  if (!justDraggedRef.current) setActiveId(tab.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setActiveId(tab.id)
                  }
                }}
                className={cn(
                  'group flex h-8 max-w-[42vw] min-w-0 shrink-0 cursor-grab touch-none select-none items-center gap-2 rounded-md px-2.5 text-xs transition-colors active:cursor-grabbing',
                  tab.id === activeId
                    ? 'bg-background text-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                  draggingId === tab.id && 'opacity-50',
                  dropTargetId === tab.id && 'ring-1 ring-primary'
                )}
              >
                <span className='min-w-0 flex-1 truncate'>{tab.title}</span>
                <button
                  type='button'
                  aria-label='Tutup tab'
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    void closeTab(tab.id)
                  }}
                  className='flex size-5 shrink-0 items-center justify-center rounded-sm opacity-60 transition-opacity hover:bg-accent hover:opacity-100'
                >
                  <X className='size-3' />
                </button>
              </div>
            ))}

            <button
              type='button'
              aria-label='Tab baru'
              onClick={() => void addTab()}
              className='mb-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
            >
              <Plus className='size-4' />
            </button>
          </div>

          <div className='flex h-12 shrink-0 items-center gap-2 bg-background px-2 sm:px-3'>
            <form
              className='flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-transparent bg-muted px-3 transition-colors focus-within:border-ring focus-within:bg-background focus-within:ring-2 focus-within:ring-ring/40'
              onSubmit={(event) => void submit(event)}
            >
              {isUrl ? (
                <Lock className='size-4 shrink-0 text-muted-foreground' />
              ) : (
                <Search className='size-4 shrink-0 text-muted-foreground' />
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setDraftForId(activeId)
                }}
                onFocus={(event) => event.currentTarget.select()}
                placeholder='Cari atau ketik URL'
                aria-label='Cari atau ketik URL'
                aria-keyshortcuts='Control+L'
                className='min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground'
              />
              {input && (
                <button
                  type='button'
                  aria-label='Hapus alamat'
                  onClick={() => {
                    setDraft('')
                    setDraftForId(activeId)
                  }}
                  className='flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                >
                  <X className='size-3' />
                </button>
              )}
            </form>

            <Button
              type='button'
              variant='ghost'
              size='icon'
              aria-label='Muat ulang'
              disabled={!activeTab?.url}
              onClick={() => void reload()}
              className='size-8 shrink-0'
            >
              <RotateCw className='size-4' />
            </Button>

            <BrowserOrchestratorControls
              tabLabel={activeTab?.label ?? null}
              disabled={!activeTab?.url}
            />
          </div>

          <div ref={viewportRef} className='relative min-h-0 flex-1 bg-background'>
            {showNewTab && (
              <div className='flex h-full flex-col items-center justify-center gap-6 bg-background px-4 text-center text-foreground'>
                <div className='space-y-1'>
                  <div className='text-4xl font-semibold tracking-tight sm:text-5xl'>
                    Open CLI
                  </div>
                  <p className='text-sm text-muted-foreground'>
                    Cari di web atau ketik alamat untuk membuka halaman.
                  </p>
                </div>

                <form
                  className='flex w-full max-w-2xl items-center gap-2 rounded-full border bg-background px-4 py-2.5 shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40'
                  onSubmit={(event) => void submit(event)}
                >
                  <Search className='size-4 shrink-0 text-muted-foreground' />
                  <input
                    value={input}
                    onChange={(event) => {
                      setDraft(event.target.value)
                      setDraftForId(activeId)
                    }}
                    onFocus={(event) => event.currentTarget.select()}
                    placeholder='Cari atau ketik URL'
                    aria-label='Cari atau ketik URL pada tab baru'
                    className='min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground'
                  />
                  <Button type='submit' size='sm' disabled={!input.trim()}>
                    Buka
                  </Button>
                </form>

                <div className='flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground'>
                  <span>Tekan</span>
                  <kbd className='rounded border bg-muted px-1.5 py-0.5 font-mono'>Ctrl</kbd>
                  <span>+</span>
                  <kbd className='rounded border bg-muted px-1.5 py-0.5 font-mono'>L</kbd>
                  <span>untuk fokus alamat</span>
                </div>

                {!isDesktop && (
                  <p className='text-xs text-muted-foreground'>
                    Browser penuh hanya tersedia di aplikasi desktop.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Main>
    </div>
  )
}
