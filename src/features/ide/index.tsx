import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Files, Globe, PanelLeft, Search, TerminalSquare } from 'lucide-react'
import { toast } from 'sonner'
import { BrowserWorkspace } from '@/features/browser'
import { useSidebar } from '@/components/ui/sidebar'
import { loadAgentCliStore } from '@/lib/agent-cli-store'
import { readIdeTextFile, writeIdeTextFile } from '@/lib/fs'
import { useWorkspaceShortcuts } from '@/lib/workspace-shortcuts'
import { cn } from '@/lib/utils'
import { EditorArea } from './components/editor-area'
import { Explorer } from './components/explorer'
import { IdeAppHeaderHover } from './components/ide-app-header-hover'
import { IdeHeader } from './components/ide-header'
import { PathPickerDialog } from './components/path-picker-dialog'
import { QuickOpen } from './components/quick-open'
import { SearchPanel } from './components/search-panel'
import { StatusBar } from './components/status-bar'
import { TerminalPanel } from './components/terminal-panel'
import { useIdeTerminalStore } from './ide-terminal-store'
import { formatCode, isFormatSupported, parserForPath } from './lib/prettier'
import { useIdeStore } from './store'

type DragKind = 'explorer' | 'terminal' | 'browser'

type DragState = {
  kind: DragKind
  start: number
  startSize: number
  size: number
}

export function IdeWorkspace({ visible }: { visible: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const revealNonce = useRef(0)
  const { toggleSidebar } = useSidebar()

  const root = useIdeStore((state) => state.root)
  const files = useIdeStore((state) => state.files)
  const activePath = useIdeStore((state) => state.activePath)
  const layout = useIdeStore((state) => state.layout)
  const settings = useIdeStore((state) => state.settings)
  const sidebarView = useIdeStore((state) => state.sidebarView)
  const setRoot = useIdeStore((state) => state.setRoot)
  const openFileInStore = useIdeStore((state) => state.openFile)
  const updateContent = useIdeStore((state) => state.updateContent)
  const markSaved = useIdeStore((state) => state.markSaved)
  const closeFile = useIdeStore((state) => state.closeFile)
  const setActive = useIdeStore((state) => state.setActive)
  const setLayout = useIdeStore((state) => state.setLayout)
  const setSidebarView = useIdeStore((state) => state.setSidebarView)

  const [pathPicker, setPathPicker] = useState<'file' | 'folder' | null>(null)
  const [quickOpen, setQuickOpen] = useState(false)
  const [searchFocus, setSearchFocus] = useState(0)
  const [reveal, setReveal] = useState<{
    path: string
    line: number
    column: number
    nonce: number
  } | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  useEffect(() => {
    let active = true
    void loadAgentCliStore().then((data) => {
      if (!active || !data.projectPath) return
      if (useIdeStore.getState().root === data.projectPath) return
      setRoot(data.projectPath)
    })
    return () => {
      active = false
    }
  }, [setRoot])

  const activeFile = files.find((file) => file.path === activePath) ?? null

  const openPath = useCallback(
    async (path: string) => {
      const data = await readIdeTextFile(path)
      if (!data) {
        toast.error('File tidak dapat dibaca. Pastikan aplikasi desktop aktif.')
        return
      }
      if (data.binary) toast.warning('File biner hanya dapat dilihat sebagai teks.')
      if (data.truncated) toast.warning('File terlalu besar; hanya sebagian yang dimuat.')
      openFileInStore({
        path,
        content: data.content,
        original: data.content,
        binary: data.binary,
        truncated: data.truncated,
      })
    },
    [openFileInStore]
  )

  const savePath = useCallback(
    async (path: string) => {
      const file = useIdeStore.getState().files.find((item) => item.path === path)
      if (!file || file.binary) return

      let content = file.content
      const parser = parserForPath(path)
      if (settings.formatOnSave && parser) {
        try {
          content = await formatCode(content, parser, settings)
        } catch (error) {
          toast.error(
            error instanceof Error
              ? `Format gagal: ${error.message}`
              : 'Format gagal.'
          )
        }
      }

      try {
        await writeIdeTextFile(path, content)
        updateContent(path, content)
        markSaved(path)
        toast.success('File tersimpan.')
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Gagal menyimpan file.'
        )
      }
    },
    [settings, updateContent, markSaved]
  )

  const formatPath = useCallback(
    async (path: string) => {
      const file = useIdeStore.getState().files.find((item) => item.path === path)
      if (!file) return
      const parser = parserForPath(path)
      if (!parser) {
        toast.info('Prettier tidak mendukung ekstensi ini.')
        return
      }

      try {
        const formatted = await formatCode(file.content, parser, settings)
        updateContent(path, formatted)
        toast.success('Diformat dengan Prettier.')
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Gagal memformat file.'
        )
      }
    },
    [settings, updateContent]
  )

  const openResult = useCallback(
    async (path: string, line: number, column: number) => {
      await openPath(path)
      revealNonce.current += 1
      setReveal({ path, line, column, nonce: revealNonce.current })
    },
    [openPath]
  )

  const toggleExplorer = useCallback(() => {
    const open = useIdeStore.getState().layout.explorerOpen
    if (!open) setSidebarView('explorer')
    setLayout({ explorerOpen: !open })
  }, [setLayout, setSidebarView])

  const toggleTerminal = useCallback(() => {
    const willOpen = !useIdeStore.getState().layout.terminalOpen
    setLayout({ terminalOpen: willOpen })
    if (willOpen && useIdeTerminalStore.getState().tabs.length === 0) {
      useIdeTerminalStore.getState().add()
    }
  }, [setLayout])

  const toggleBrowser = useCallback(() => {
    setLayout({ browserOpen: !useIdeStore.getState().layout.browserOpen })
  }, [setLayout])

  const newTerminal = useCallback(() => {
    useIdeTerminalStore.getState().add()
  }, [])

  const cycleFile = useCallback(
    (direction: number) => {
      if (files.length < 2) return
      const index = files.findIndex((file) => file.path === activePath)
      const next = (index + direction + files.length) % files.length
      setActive(files[next].path)
    },
    [files, activePath, setActive]
  )

  const bindings = useMemo(
    () => [
      { combination: 'Ctrl+P', handler: () => setQuickOpen(true), enabled: visible },
      {
        combination: 'Ctrl+Shift+F',
        handler: () => {
          setSidebarView('search')
          setLayout({ explorerOpen: true })
          setSearchFocus((value) => value + 1)
        },
        enabled: visible,
      },
      {
        combination: 'Ctrl+Shift+E',
        handler: () => {
          setSidebarView('explorer')
          setLayout({ explorerOpen: true })
        },
        enabled: visible,
      },
      { combination: 'Ctrl+B', handler: toggleExplorer, enabled: visible },
      { combination: 'Ctrl+`', handler: toggleTerminal, enabled: visible },
      { combination: 'Ctrl+Shift+`', handler: newTerminal, enabled: visible },
      { combination: 'Ctrl+Alt+B', handler: toggleBrowser, enabled: visible },
      {
        combination: 'Ctrl+S',
        handler: () => {
          if (activePath) void savePath(activePath)
        },
        enabled: visible,
      },
      {
        combination: 'Shift+Alt+F',
        handler: () => {
          if (activePath) void formatPath(activePath)
        },
        enabled: visible,
      },
      {
        combination: 'Ctrl+W',
        handler: () => {
          if (activePath) closeFile(activePath)
        },
        enabled: visible,
      },
      {
        combination: 'Ctrl+O',
        handler: () => setPathPicker('file'),
        enabled: visible,
      },
      {
        combination: 'Ctrl+Shift+O',
        handler: () => setPathPicker('folder'),
        enabled: visible,
      },
      { combination: 'Ctrl+K', handler: () => undefined, enabled: visible },
      {
        combination: 'Ctrl+Tab',
        handler: () => cycleFile(1),
        enabled: visible,
      },
      {
        combination: 'Ctrl+Shift+Tab',
        handler: () => cycleFile(-1),
        enabled: visible,
      },
    ],
    [
      visible,
      setSidebarView,
      setLayout,
      toggleExplorer,
      toggleTerminal,
      toggleBrowser,
      newTerminal,
      activePath,
      savePath,
      formatPath,
      closeFile,
      cycleFile,
    ]
  )

  useWorkspaceShortcuts(bindings)

  const startResize = useCallback(
    (kind: DragKind, event: ReactPointerEvent) => {
      event.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      const size =
        kind === 'terminal'
          ? rect?.height ?? window.innerHeight
          : rect?.width ?? window.innerWidth
      const start = kind === 'terminal' ? event.clientY : event.clientX
      const startSize =
        kind === 'explorer'
          ? layout.explorerWidth
          : kind === 'terminal'
            ? layout.terminalHeight
            : layout.browserWidth
      setDrag({ kind, start, startSize, size })
    },
    [layout]
  )

  useEffect(() => {
    if (!drag) return

    const previous = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    const onMove = (event: PointerEvent) => {
      const current = drag.kind === 'terminal' ? event.clientY : event.clientX
      const delta = current - drag.start
      if (drag.kind === 'explorer') {
        setLayout({
          explorerWidth: Math.min(460, Math.max(180, drag.startSize + delta)),
        })
      }
      if (drag.kind === 'terminal') {
        setLayout({
          terminalHeight: Math.min(
            Math.max(160, drag.size - 180),
            Math.max(120, drag.startSize - delta)
          ),
        })
      }
      if (drag.kind === 'browser') {
        setLayout({
          browserWidth: Math.min(
            Math.max(900, window.innerWidth - 420),
            Math.max(280, drag.startSize - delta)
          ),
        })
      }
    }
    const onUp = () => setDrag(null)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      document.body.style.userSelect = previous
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag, setLayout])

  const handlePathSelect = (path: string) => {
    const mode = pathPicker
    setPathPicker(null)
    if (!mode) return
    if (mode === 'file') void openPath(path)
    else {
      setRoot(path)
      toast.success('Folder workspace dibuka.')
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute inset-0 z-30 flex flex-col bg-background',
        !visible && 'hidden'
      )}
    >
      <IdeHeader
        onOpenFile={() => setPathPicker('file')}
        onOpenFolder={() => setPathPicker('folder')}
        onSave={() => activePath && void savePath(activePath)}
        onFormat={() => activePath && void formatPath(activePath)}
        onQuickOpen={() => setQuickOpen(true)}
        onSearch={() => {
          setSidebarView('search')
          setLayout({ explorerOpen: true })
          setSearchFocus((value) => value + 1)
        }}
        onToggleExplorer={toggleExplorer}
        onToggleTerminal={toggleTerminal}
        onToggleBrowser={toggleBrowser}
        onCloseEditor={() => activePath && closeFile(activePath)}
        onNewTerminal={newTerminal}
      />
      <IdeAppHeaderHover />

      <div className='flex min-h-0 flex-1'>
        <div className='flex w-11 shrink-0 flex-col items-center gap-1 border-r bg-muted/40 py-2'>
          <button
            type='button'
            title='Explorer (Ctrl+Shift+E)'
            onClick={() => {
              setSidebarView('explorer')
              setLayout({ explorerOpen: true })
            }}
            className={cn(
              'flex size-8 items-center justify-center rounded-md',
              layout.explorerOpen && sidebarView === 'explorer'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60'
            )}
          >
            <Files className='size-4' />
          </button>
          <button
            type='button'
            title='Cari (Ctrl+Shift+F)'
            onClick={() => {
              setSidebarView('search')
              setLayout({ explorerOpen: true })
              setSearchFocus((value) => value + 1)
            }}
            className={cn(
              'flex size-8 items-center justify-center rounded-md',
              layout.explorerOpen && sidebarView === 'search'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60'
            )}
          >
            <Search className='size-4' />
          </button>
          <button
            type='button'
            title='Terminal (Ctrl+`)'
            onClick={toggleTerminal}
            className={cn(
              'flex size-8 items-center justify-center rounded-md',
              layout.terminalOpen
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60'
            )}
          >
            <TerminalSquare className='size-4' />
          </button>
          <button
            type='button'
            title='Browser (Ctrl+Alt+B)'
            onClick={toggleBrowser}
            className={cn(
              'flex size-8 items-center justify-center rounded-md',
              layout.browserOpen
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/60'
            )}
          >
            <Globe className='size-4' />
          </button>
          <div className='mt-auto'>
            <button
              type='button'
              title='Toggle Sidebar Open CLI'
              onClick={toggleSidebar}
              className='flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60'
            >
              <PanelLeft className='size-4' />
            </button>
          </div>
        </div>

        {layout.explorerOpen && (
          <>
            <div
              style={{ width: layout.explorerWidth }}
              className='min-w-0 shrink-0 border-r'
            >
              {sidebarView === 'explorer' ? (
                <Explorer
                  onOpenFile={(path) => void openPath(path)}
                  onOpenFolder={() => setPathPicker('folder')}
                />
              ) : (
                <SearchPanel
                  focusSignal={searchFocus}
                  onOpenResult={(path, line, column) =>
                    void openResult(path, line, column)
                  }
                />
              )}
            </div>
            <div
              role='separator'
              aria-orientation='vertical'
              onPointerDown={(event) => startResize('explorer', event)}
              className='w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-sky-500/50'
            />
          </>
        )}

        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          <div className='min-h-0 flex-1'>
            <EditorArea
              root={root}
              files={files}
              activePath={activePath}
              settings={settings}
              reveal={reveal}
              onChange={updateContent}
              onSave={(path) => void savePath(path)}
              onFormat={(path) => void formatPath(path)}
              onClose={closeFile}
              onSelect={setActive}
            />
          </div>

          {layout.terminalOpen && (
            <>
              <div
                role='separator'
                aria-orientation='horizontal'
                onPointerDown={(event) => startResize('terminal', event)}
                className='h-1 shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-sky-500/50'
              />
              <div
                style={{ height: layout.terminalHeight }}
                className='min-h-0 shrink-0'
              >
                <TerminalPanel visible={visible && layout.terminalOpen} />
              </div>
            </>
          )}
        </div>

        <div
          className={cn(
            'relative min-h-0 shrink-0 border-l',
            !layout.browserOpen && 'hidden'
          )}
          style={{ width: layout.browserWidth }}
        >
          <BrowserWorkspace embedded visible={layout.browserOpen && visible} />
        </div>
        {layout.browserOpen && (
          <div
            role='separator'
            aria-orientation='vertical'
            onPointerDown={(event) => startResize('browser', event)}
            className='w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-sky-500/50'
          />
        )}
      </div>

      <StatusBar
        onToggleTerminal={toggleTerminal}
        onToggleBrowser={toggleBrowser}
      />

      <QuickOpen
        key={quickOpen ? 'open' : 'closed'}
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onOpenFile={(path) => void openPath(path)}
      />

      <PathPickerDialog
        key={`${pathPicker ?? 'none'}-${root ?? ''}`}
        open={pathPicker !== null}
        mode={pathPicker ?? 'folder'}
        initialPath={root}
        onClose={() => setPathPicker(null)}
        onSelect={handlePathSelect}
      />

      {activeFile && (
        <span className='sr-only'>
          {activeFile.name} {isFormatSupported(activeFile.path) ? 'Prettier' : ''}
        </span>
      )}
    </div>
  )
}
