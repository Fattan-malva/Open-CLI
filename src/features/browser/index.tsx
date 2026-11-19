import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Lock, Plus, RotateCw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import {
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

type BrowserTab = {
  id: string
  label: string
  url: string
  title: string
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return 'Tab baru'
  }
}

type BrowserWorkspaceProps = {
  visible: boolean
}

export function BrowserWorkspace({ visible }: BrowserWorkspaceProps) {
  const { state: sidebarState } = useSidebar()
  const [tabs, setTabs] = useState<BrowserTab[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [draftForId, setDraftForId] = useState<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)
  const initialized = useRef(false)
  const latestRef = useRef({
    visible,
    activeLabel: null as string | null,
    labels: [] as string[],
  })

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeId) ?? null,
    [tabs, activeId]
  )
  const activeLabel = activeTab?.label ?? null
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
    if (!latest.visible || !latest.activeLabel) {
      await syncBrowserTabs(latest.labels, null, getBounds())
      return
    }

    await syncBrowserTabs(latest.labels, latest.activeLabel, getBounds())
  }, [getBounds])

  const addTab = useCallback(
    async (value?: string) => {
      try {
        const url = resolveBrowserTarget(value || 'https://www.google.com')
        const id = `browser-tab-${nextId.current++}`
        await createBrowserTab(id, url, getBounds())
        setTabs((previous) => [
          ...previous,
          { id, label: id, url, title: hostFromUrl(url) },
        ])
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
        if (!activeLabel) {
          await addTab(url)
          setDraft('')
          setDraftForId(null)
          return
        }

        await navigateBrowserTab(activeLabel, url)
        setTabs((previous) =>
          previous.map((tab) =>
            tab.label === activeLabel
              ? { ...tab, url, title: hostFromUrl(url) }
              : tab
          )
        )
        setDraft('')
        setDraftForId(null)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Gagal membuka alamat.')
      }
    },
    [input, activeLabel, addTab]
  )

  const reload = useCallback(async () => {
    if (!activeTab) return
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
        await closeBrowserTab(tabs[index].label)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Gagal menutup tab.')
        return
      }

      setTabs(next)
      if (activeId === id) setActiveId(fallback?.id ?? null)
    },
    [tabs, activeId]
  )

  useEffect(() => {
    latestRef.current = {
      visible,
      activeLabel,
      labels: tabs.map((tab) => tab.label),
    }
    void sync()
  }, [visible, activeLabel, tabs, sidebarState, sync])

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
    if (!visible || !isDesktop || initialized.current) return
    initialized.current = true
    void addTab()
  }, [visible, addTab])

  useEffect(() => {
    if (!visible) return

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
  }, [visible, addTab, closeTab, activeId, tabs])

  const isUrl = normalizeBrowserUrl(input) !== null

  return (
    <div
      className={cn(
        'absolute inset-0 z-40 flex flex-col bg-background',
        !visible && 'hidden'
      )}
    >
      <AuthenticatedHeader />

      <Main fixed fluid className='min-h-0 flex-1 overflow-hidden p-0'>
        <div className='flex h-full min-h-0 flex-col'>
          <div className='flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b bg-muted/40 px-2 pt-1 no-scrollbar'>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                role='tab'
                aria-selected={tab.id === activeId}
                tabIndex={0}
                onClick={() => setActiveId(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setActiveId(tab.id)
                  }
                }}
                className={cn(
                  'group flex h-8 max-w-[42vw] min-w-0 shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-2.5 text-xs transition-colors sm:max-w-52',
                  tab.id === activeId
                    ? 'border-border bg-background text-foreground'
                    : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                <span className='min-w-0 flex-1 truncate'>{tab.title}</span>
                <button
                  type='button'
                  aria-label='Tutup tab'
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

          <div className='flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3'>
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
              onClick={() => void reload()}
              className='size-8 shrink-0'
            >
              <RotateCw className='size-4' />
            </Button>
          </div>

          <div ref={viewportRef} className='min-h-0 flex-1 bg-white'>
            {!isDesktop && (
              <div className='flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground'>
                Browser penuh hanya tersedia di aplikasi desktop.
              </div>
            )}
          </div>
        </div>
      </Main>
    </div>
  )
}
