import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  Bookmark,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { BrowserSnapshot } from '@/components/browser-snapshot'
import { BridgeControls } from '@/features/browser/bridge-controls'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useSidebar } from '@/components/ui/sidebar'
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
import { useOrchestratorStore } from '@/features/orchestrator/store'
import { isDesktop } from '@/lib/platform'
import { cn } from '@/lib/utils'
import {
  isWebviewOverlayOpen,
  notifyWebviewOverlay,
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

type BrowserBookmark = {
  id: string
  title: string
  url: string
  createdAt: number
}

const BOOKMARKS_KEY = 'opencli.browser.bookmarks.v1'

function createBookmarkId() {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `bookmark-${Date.now().toString(36)}-${suffix}`
}

function sameBookmarkUrl(left: string, right: string) {
  return (normalizeBrowserUrl(left) ?? left) === (normalizeBrowserUrl(right) ?? right)
}

function loadBookmarks(): BrowserBookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === 'object' && !Array.isArray(item)
      )
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : createBookmarkId(),
        title:
          typeof item.title === 'string' && item.title.trim()
            ? item.title
            : hostFromUrl(typeof item.url === 'string' ? item.url : ''),
        url: typeof item.url === 'string' ? item.url : '',
        createdAt:
          typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      }))
      .filter((item) => normalizeBrowserUrl(item.url) !== null)
  } catch {
    return []
  }
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
  const [dragTransforms, setDragTransforms] = useState<Record<string, number>>({})
  const tabStripRef = useRef<HTMLDivElement>(null)
  const baseRectsRef = useRef(new Map<string, { left: number; width: number }>())
  const targetIndexRef = useRef<number | null>(null)
  const dragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    offsetX: number
    fromIndex: number
    width: number
    baseScrollLeft: number
    moved: boolean
  } | null>(null)
  const justDraggedRef = useRef(false)
  const dragEndTimerRef = useRef<number | null>(null)
  const [draft, setDraft] = useState('')
  const [draftForId, setDraftForId] = useState<string | null>(null)
  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>(() => loadBookmarks())
  const [bookmarkManagerOpen, setBookmarkManagerOpen] = useState(false)
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null)
  const [bookmarkDraftTitle, setBookmarkDraftTitle] = useState('')
  const [bookmarkDraftUrl, setBookmarkDraftUrl] = useState('')
  const [bookmarkDraggingId, setBookmarkDraggingId] = useState<string | null>(null)
  const [bookmarkTransforms, setBookmarkTransforms] = useState<Record<string, number>>({})
  const bookmarkStripRef = useRef<HTMLDivElement>(null)
  const bookmarkBaseRectsRef = useRef(new Map<string, { left: number; width: number }>())
  const bookmarkTargetIndexRef = useRef<number | null>(null)
  const bookmarkDragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    offsetX: number
    fromIndex: number
    width: number
    baseScrollLeft: number
    moved: boolean
  } | null>(null)
  const bookmarkJustDraggedRef = useRef(false)
  const bookmarkDragEndTimerRef = useRef<number | null>(null)
  const [bookmarkContextMenu, setBookmarkContextMenu] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingTitles = useRef(new Map<string, string>())
  const lastSyncKey = useRef<string | null>(null)
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
  const activeBookmark = useMemo(
    () =>
      activeTab?.url
        ? bookmarks.find((item) => sameBookmarkUrl(item.url, activeTab.url)) ?? null
        : null,
    [bookmarks, activeTab]
  )

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
    const bounds = getBounds()
    const active =
      latest.visible && latest.activeLabel && !isWebviewOverlayOpen()
        ? latest.activeLabel
        : null
    const key = `${latest.labels.join(',')}|${active ?? ''}|${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`
    if (lastSyncKey.current === key) return
    lastSyncKey.current = key
    await syncBrowserTabs(latest.labels, active, bounds)
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

  const saveBookmarks = useCallback((next: BrowserBookmark[]) => {
    setBookmarks(next)
    try {
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next))
    } catch {
      toast.error('Gagal menyimpan bookmark.')
    }
  }, [])

  const finishBookmarkDrag = useCallback(() => {
    const moved = Boolean(bookmarkDragRef.current?.moved)
    bookmarkDragRef.current = null
    bookmarkTargetIndexRef.current = null
    bookmarkBaseRectsRef.current.clear()
    setBookmarkDraggingId(null)
    setBookmarkTransforms({})
    if (!moved) return

    bookmarkJustDraggedRef.current = true
    if (bookmarkDragEndTimerRef.current !== null) {
      window.clearTimeout(bookmarkDragEndTimerRef.current)
    }
    bookmarkDragEndTimerRef.current = window.setTimeout(() => {
      bookmarkJustDraggedRef.current = false
      bookmarkDragEndTimerRef.current = null
    }, 50)
  }, [])

  const moveBookmarkToIndex = useCallback(
    (fromId: string, targetIndex: number) => {
      const from = bookmarks.findIndex((item) => item.id === fromId)
      if (from < 0) return
      const next = [...bookmarks]
      const [moved] = next.splice(from, 1)
      const index = Math.max(0, Math.min(targetIndex, next.length))
      next.splice(index, 0, moved)
      saveBookmarks(next)
    },
    [bookmarks, saveBookmarks]
  )

  const handleBookmarkPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
      if (event.button !== 0) return
      const rect = event.currentTarget.getBoundingClientRect()
      const baseRects = new Map<string, { left: number; width: number }>()
      for (const node of Array.from(
        bookmarkStripRef.current?.querySelectorAll<HTMLElement>('[data-browser-bookmark-id]') ?? []
      )) {
        const nodeId = node.dataset.browserBookmarkId
        if (!nodeId) continue
        const nodeRect = node.getBoundingClientRect()
        baseRects.set(nodeId, { left: nodeRect.left, width: nodeRect.width })
      }
      bookmarkBaseRectsRef.current = baseRects
      bookmarkDragRef.current = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        fromIndex: bookmarks.findIndex((item) => item.id === id),
        width: rect.width,
        baseScrollLeft: bookmarkStripRef.current?.scrollLeft ?? 0,
        moved: false,
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        bookmarkDragRef.current = null
      }
    },
    [bookmarks]
  )

  const handleBookmarkPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const candidate = bookmarkDragRef.current
      if (!candidate || candidate.pointerId !== event.pointerId) return
      if (!candidate.moved) {
        const distance = Math.hypot(
          event.clientX - candidate.startX,
          event.clientY - candidate.startY
        )
        if (distance < 5) return
        candidate.moved = true
        setBookmarkDraggingId(candidate.id)
      }

      const strip = bookmarkStripRef.current
      if (strip) {
        const rect = strip.getBoundingClientRect()
        const edge = 32
        if (event.clientX < rect.left + edge) strip.scrollLeft -= 10
        else if (event.clientX > rect.right - edge) strip.scrollLeft += 10
      }

      const scrollDelta = (strip?.scrollLeft ?? 0) - candidate.baseScrollLeft
      const baseRects = bookmarkBaseRectsRef.current
      const others = bookmarks
        .map((item, index) => ({ item, index, rect: baseRects.get(item.id) }))
        .filter((entry) => entry.item.id !== candidate.id)
      let targetIndex = others.length
      for (let index = 0; index < others.length; index += 1) {
        const entry = others[index]
        if (!entry.rect) continue
        const left = entry.rect.left - scrollDelta
        if (event.clientX < left + entry.rect.width / 2) {
          targetIndex = index
          break
        }
      }
      bookmarkTargetIndexRef.current = targetIndex

      const shift = candidate.width + 4
      const draggedBaseLeft = (baseRects.get(candidate.id)?.left ?? 0) - scrollDelta
      const nextTransforms: Record<string, number> = {}
      bookmarks.forEach((item, index) => {
        if (item.id === candidate.id) {
          nextTransforms[item.id] = event.clientX - candidate.offsetX - draggedBaseLeft
        } else if (
          candidate.fromIndex < targetIndex &&
          index > candidate.fromIndex &&
          index <= targetIndex
        ) {
          nextTransforms[item.id] = -shift
        } else if (
          candidate.fromIndex > targetIndex &&
          index >= targetIndex &&
          index < candidate.fromIndex
        ) {
          nextTransforms[item.id] = shift
        } else {
          nextTransforms[item.id] = 0
        }
      })
      setBookmarkTransforms(nextTransforms)
    },
    [bookmarks]
  )

  const handleBookmarkPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const candidate = bookmarkDragRef.current
      if (!candidate || candidate.pointerId !== event.pointerId) return
      const targetIndex = bookmarkTargetIndexRef.current
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      finishBookmarkDrag()
      if (candidate.moved && targetIndex !== null) {
        moveBookmarkToIndex(candidate.id, targetIndex)
      }
    },
    [finishBookmarkDrag, moveBookmarkToIndex]
  )

  const toggleBookmark = useCallback(() => {
    if (!activeTab?.url) return
    const url = normalizeBrowserUrl(activeTab.url) ?? activeTab.url
    const existing = bookmarks.find((item) => sameBookmarkUrl(item.url, url))
    if (existing) {
      saveBookmarks(bookmarks.filter((item) => item.id !== existing.id))
      toast.success('Bookmark dihapus')
      return
    }
    saveBookmarks([
      ...bookmarks,
      {
        id: createBookmarkId(),
        title: activeTab.title || hostFromUrl(url),
        url,
        createdAt: Date.now(),
      },
    ])
    toast.success('Bookmark ditambahkan')
  }, [activeTab, bookmarks, saveBookmarks])

  const openBookmark = useCallback(
    async (bookmark: BrowserBookmark) => {
      const url = normalizeBrowserUrl(bookmark.url)
      if (!url) {
        toast.error('Alamat bookmark tidak valid.')
        return
      }
      setBookmarkManagerOpen(false)
      try {
        if (!activeTab) {
          await addTab(url)
          return
        }
        if (!activeTab.url) {
          await createBrowserTab(activeTab.label, url, getBounds())
          const webTitle =
            pendingTitles.current.get(activeTab.label) ?? hostFromUrl(url)
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
              tab.id === activeTab.id
                ? { ...tab, url, title: bookmark.title || hostFromUrl(url) }
                : tab
            )
          )
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Gagal membuka bookmark.')
      }
    },
    [activeTab, addTab, getBounds]
  )

  const startEditBookmark = useCallback((bookmark: BrowserBookmark) => {
    setEditingBookmarkId(bookmark.id)
    setBookmarkDraftTitle(bookmark.title)
    setBookmarkDraftUrl(bookmark.url)
  }, [])

  const saveBookmarkEdit = useCallback(() => {
    if (!editingBookmarkId) return
    const url = normalizeBrowserUrl(bookmarkDraftUrl)
    if (!url) {
      toast.error('Alamat bookmark tidak valid.')
      return
    }
    saveBookmarks(
      bookmarks.map((item) =>
        item.id === editingBookmarkId
          ? {
              ...item,
              title: bookmarkDraftTitle.trim() || hostFromUrl(url),
              url,
            }
          : item
      )
    )
    setEditingBookmarkId(null)
    toast.success('Bookmark diperbarui')
  }, [bookmarkDraftTitle, bookmarkDraftUrl, bookmarks, editingBookmarkId, saveBookmarks])

  const removeBookmark = useCallback(
    (id: string) => {
      saveBookmarks(bookmarks.filter((item) => item.id !== id))
      if (editingBookmarkId === id) setEditingBookmarkId(null)
    },
    [bookmarks, editingBookmarkId, saveBookmarks]
  )

  const openBookmarkContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLElement>, id: string) => {
      event.preventDefault()
      event.stopPropagation()
      setBookmarkManagerOpen(false)
      setBookmarkContextMenu({ id, x: event.clientX, y: event.clientY })
    },
    []
  )

  const openBookmarkFromContext = useCallback(() => {
    const id = bookmarkContextMenu?.id
    if (!id) return
    const bookmark = bookmarks.find((item) => item.id === id)
    setBookmarkContextMenu(null)
    if (bookmark) void openBookmark(bookmark)
  }, [bookmarkContextMenu, bookmarks, openBookmark])

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
      useOrchestratorStore.getState().forgetTabGrants(tabs[index].label)
      setTabs(next)
      if (activeId === id) setActiveId(fallback?.id ?? null)
    },
    [tabs, activeId]
  )

  const finishDrag = useCallback(() => {
    const moved = Boolean(dragRef.current?.moved)
    dragRef.current = null
    targetIndexRef.current = null
    baseRectsRef.current.clear()
    setDraggingId(null)
    setDragTransforms({})
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

  const moveTabToIndex = useCallback((fromId: string, targetIndex: number) => {
    setTabs((previous) => {
      const from = previous.findIndex((tab) => tab.id === fromId)
      if (from < 0) return previous
      const next = [...previous]
      const [moved] = next.splice(from, 1)
      const index = Math.max(0, Math.min(targetIndex, next.length))
      next.splice(index, 0, moved)
      return next
    })
  }, [])

  const handleTabPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest('button')) return
      const rect = event.currentTarget.getBoundingClientRect()
      const baseRects = new Map<string, { left: number; width: number }>()
      for (const node of Array.from(
        tabStripRef.current?.querySelectorAll<HTMLElement>('[data-browser-tab-id]') ?? []
      )) {
        const nodeId = node.dataset.browserTabId
        if (!nodeId) continue
        const nodeRect = node.getBoundingClientRect()
        baseRects.set(nodeId, { left: nodeRect.left, width: nodeRect.width })
      }
      baseRectsRef.current = baseRects
      dragRef.current = {
        id,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        fromIndex: tabs.findIndex((tab) => tab.id === id),
        width: rect.width,
        baseScrollLeft: tabStripRef.current?.scrollLeft ?? 0,
        moved: false,
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        dragRef.current = null
      }
    },
    [tabs]
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

      const scrollDelta = (strip?.scrollLeft ?? 0) - candidate.baseScrollLeft
      const baseRects = baseRectsRef.current
      const others = tabs
        .map((tab, index) => ({ tab, index, rect: baseRects.get(tab.id) }))
        .filter((item) => item.tab.id !== candidate.id)
      let targetIndex = others.length
      for (let index = 0; index < others.length; index += 1) {
        const item = others[index]
        if (!item.rect) continue
        const left = item.rect.left - scrollDelta
        if (event.clientX < left + item.rect.width / 2) {
          targetIndex = index
          break
        }
      }
      targetIndexRef.current = targetIndex

      const shift = candidate.width + 4
      const draggedBaseLeft = (baseRects.get(candidate.id)?.left ?? 0) - scrollDelta
      const nextTransforms: Record<string, number> = {}
      tabs.forEach((tab, index) => {
        if (tab.id === candidate.id) {
          nextTransforms[tab.id] = event.clientX - candidate.offsetX - draggedBaseLeft
        } else if (
          candidate.fromIndex < targetIndex &&
          index > candidate.fromIndex &&
          index <= targetIndex
        ) {
          nextTransforms[tab.id] = -shift
        } else if (
          candidate.fromIndex > targetIndex &&
          index >= targetIndex &&
          index < candidate.fromIndex
        ) {
          nextTransforms[tab.id] = shift
        } else {
          nextTransforms[tab.id] = 0
        }
      })
      setDragTransforms(nextTransforms)
    },
    [tabs]
  )

  const handleTabPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const candidate = dragRef.current
      if (!candidate || candidate.pointerId !== event.pointerId) return
      const targetIndex = targetIndexRef.current
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      finishDrag()
      if (candidate.moved && targetIndex !== null) {
        moveTabToIndex(candidate.id, targetIndex)
      }
    },
    [finishDrag, moveTabToIndex]
  )

  useEffect(() => {
    return () => {
      dragRef.current = null
      targetIndexRef.current = null
      baseRectsRef.current.clear()
      bookmarkDragRef.current = null
      bookmarkTargetIndexRef.current = null
      bookmarkBaseRectsRef.current.clear()
      if (dragEndTimerRef.current !== null) {
        window.clearTimeout(dragEndTimerRef.current)
      }
      if (bookmarkDragEndTimerRef.current !== null) {
        window.clearTimeout(bookmarkDragEndTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!bookmarkContextMenu) return
    notifyWebviewOverlay(true)

    const close = () => setBookmarkContextMenu(null)
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('[data-bookmark-context-menu]')) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      notifyWebviewOverlay(false)
    }
  }, [bookmarkContextMenu])

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
      lastSyncKey.current = null
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

      if (modifier && !event.shiftKey && key === 'd') {
        event.preventDefault()
        event.stopImmediatePropagation()
        toggleBookmark()
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
  }, [visible, embedded, addTab, closeTab, activeId, tabs, toggleBookmark])

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
                style={{
                  transform: dragTransforms[tab.id]
                    ? `translate3d(${dragTransforms[tab.id]}px, 0, 0)`
                    : undefined,
                  transition: draggingId
                    ? tab.id === draggingId
                      ? 'none'
                      : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)'
                    : undefined,
                  zIndex: draggingId === tab.id ? 10 : undefined,
                }}
                className={cn(
                  'group flex h-8 max-w-[42vw] min-w-0 shrink-0 cursor-grab touch-none select-none items-center gap-2 rounded-md px-2.5 text-xs transition-colors active:cursor-grabbing',
                  tab.id === activeId
                    ? 'bg-background text-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                  draggingId === tab.id && 'cursor-grabbing'
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
              {!embedded && (
                <button
                  type='button'
                  aria-label={activeBookmark ? 'Hapus bookmark' : 'Tambahkan bookmark'}
                  aria-keyshortcuts='Control+D'
                  title={activeBookmark ? 'Hapus bookmark (Ctrl+D)' : 'Tambahkan bookmark (Ctrl+D)'}
                  disabled={!activeTab?.url}
                  onClick={toggleBookmark}
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
                    activeBookmark && 'text-yellow-500 hover:text-yellow-600'
                  )}
                >
                  <Star className={cn('size-4', activeBookmark && 'fill-yellow-400')} />
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

            <BridgeControls tabLabel={activeLabel} />
          </div>

          {!embedded && (
            <div className='flex h-8 shrink-0 items-center gap-2 border-b bg-background px-2 sm:px-3'>
              <Bookmark className='size-3.5 shrink-0 text-muted-foreground' />
              <div
                ref={bookmarkStripRef}
                className='flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar'
              >
                {bookmarks.length === 0 ? (
                  <button
                    type='button'
                    onClick={() => setBookmarkManagerOpen(true)}
                    className='truncate text-[11px] text-muted-foreground transition-colors hover:text-foreground'
                  >
                    Belum ada bookmark. Klik bintang di alamat untuk menyimpan halaman.
                  </button>
                ) : (
                  bookmarks.map((bookmark) => (
                    <button
                      key={bookmark.id}
                      type='button'
                      data-browser-bookmark-id={bookmark.id}
                      title={`${bookmark.title} — ${bookmark.url}`}
                      onPointerDown={(event) =>
                        handleBookmarkPointerDown(event, bookmark.id)
                      }
                      onPointerMove={handleBookmarkPointerMove}
                      onPointerUp={handleBookmarkPointerUp}
                      onPointerCancel={finishBookmarkDrag}
                      onContextMenu={(event) =>
                        openBookmarkContextMenu(event, bookmark.id)
                      }
                      onClick={() => {
                        if (!bookmarkJustDraggedRef.current) void openBookmark(bookmark)
                      }}
                      style={{
                        transform: bookmarkTransforms[bookmark.id]
                          ? `translate3d(${bookmarkTransforms[bookmark.id]}px, 0, 0)`
                          : undefined,
                        transition: bookmarkDraggingId
                          ? bookmark.id === bookmarkDraggingId
                            ? 'none'
                            : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)'
                          : undefined,
                        zIndex: bookmarkDraggingId === bookmark.id ? 10 : undefined,
                      }}
                      className={cn(
                        'relative flex h-6 max-w-[180px] shrink-0 cursor-grab touch-none select-none items-center gap-1.5 rounded px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing',
                        bookmarkDraggingId === bookmark.id && 'cursor-grabbing'
                      )}
                    >
                      <span className='flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-muted text-[9px] font-semibold uppercase text-foreground'>
                        {bookmark.title.charAt(0).toUpperCase()}
                      </span>
                      <span className='truncate'>{bookmark.title}</span>
                    </button>
                  ))
                )}
              </div>

              <Popover
                open={bookmarkManagerOpen}
                onOpenChange={setBookmarkManagerOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    aria-label='Kelola bookmark'
                    title='Kelola bookmark'
                    className='size-6 shrink-0'
                  >
                    <MoreHorizontal className='size-3.5' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align='end' className='w-80 p-2'>
                  <div className='flex items-center justify-between px-2 pb-2 pt-1'>
                    <p className='text-xs font-semibold'>Bookmark</p>
                    <span className='text-[10px] text-muted-foreground'>
                      {bookmarks.length} tersimpan
                    </span>
                  </div>

                  {bookmarks.length === 0 ? (
                    <p className='px-2 py-4 text-center text-xs text-muted-foreground'>
                      Belum ada bookmark.
                    </p>
                  ) : (
                    <div className='max-h-60 space-y-1 overflow-y-auto no-scrollbar'>
                      {bookmarks.map((bookmark) => (
                        <div
                          key={bookmark.id}
                          onContextMenu={(event) =>
                            openBookmarkContextMenu(event, bookmark.id)
                          }
                          className='flex items-center gap-1 rounded-md px-1 py-1 hover:bg-muted'
                        >
                          <button
                            type='button'
                            onClick={() => void openBookmark(bookmark)}
                            className='min-w-0 flex-1 text-left'
                          >
                            <p className='truncate text-xs'>{bookmark.title}</p>
                            <p className='truncate text-[10px] text-muted-foreground'>
                              {bookmark.url}
                            </p>
                          </button>
                          <button
                            type='button'
                            aria-label='Ubah bookmark'
                            onClick={() => startEditBookmark(bookmark)}
                            className='flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                          >
                            <Pencil className='size-3' />
                          </button>
                          <button
                            type='button'
                            aria-label='Hapus bookmark'
                            onClick={() => removeBookmark(bookmark.id)}
                            className='flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'
                          >
                            <Trash2 className='size-3' />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {editingBookmarkId && (
                    <div className='mt-2 space-y-2 border-t pt-2'>
                      <Input
                        value={bookmarkDraftTitle}
                        onChange={(event) => setBookmarkDraftTitle(event.target.value)}
                        placeholder='Nama bookmark'
                        aria-label='Nama bookmark'
                        className='h-8 text-xs'
                      />
                      <Input
                        value={bookmarkDraftUrl}
                        onChange={(event) => setBookmarkDraftUrl(event.target.value)}
                        placeholder='https://...'
                        aria-label='Alamat bookmark'
                        className='h-8 text-xs'
                      />
                      <div className='flex justify-end gap-2'>
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          onClick={() => setEditingBookmarkId(null)}
                        >
                          Batal
                        </Button>
                        <Button type='button' size='sm' onClick={saveBookmarkEdit}>
                          Simpan
                        </Button>
                      </div>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div ref={viewportRef} className='relative min-h-0 flex-1 bg-background'>
            {activeLabel && <BrowserSnapshot key={activeLabel} label={activeLabel} />}
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

      {bookmarkContextMenu &&
        (() => {
          const bookmark = bookmarks.find(
            (item) => item.id === bookmarkContextMenu.id
          )
          if (!bookmark) return null
          return (
            <div
              data-bookmark-context-menu
              role='menu'
              className='fixed z-[120] w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg'
              style={{
                left: Math.max(8, Math.min(bookmarkContextMenu.x, window.innerWidth - 176)),
                top: Math.max(8, Math.min(bookmarkContextMenu.y, window.innerHeight - 112)),
              }}
            >
              <button
                type='button'
                onClick={openBookmarkFromContext}
                className='flex w-full items-center rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted'
              >
                Buka
              </button>
              <button
                type='button'
                onClick={() => {
                  startEditBookmark(bookmark)
                  setBookmarkManagerOpen(true)
                  setBookmarkContextMenu(null)
                }}
                className='flex w-full items-center rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted'
              >
                Edit
              </button>
              <button
                type='button'
                onClick={() => {
                  removeBookmark(bookmark.id)
                  setBookmarkContextMenu(null)
                }}
                className='flex w-full items-center rounded px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10'
              >
                Hapus
              </button>
            </div>
          )
        })()}
    </div>
  )
}
