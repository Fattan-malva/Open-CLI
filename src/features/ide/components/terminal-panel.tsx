import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Pencil, Plus, TerminalSquare, X } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ptyKill } from '@/lib/pty'
import { cn } from '@/lib/utils'
import { TerminalPane } from '@/features/terminal/components/terminal-pane'
import { useIdeTerminalStore } from '../ide-terminal-store'

type TerminalPanelProps = {
  visible: boolean
  railWidth: number
  cwd?: string
  onRailResizeStart: (event: ReactPointerEvent) => void
}

export function TerminalPanel({
  visible,
  railWidth,
  cwd,
  onRailResizeStart,
}: TerminalPanelProps) {
  const tabs = useIdeTerminalStore((state) => state.tabs)
  const activeId = useIdeTerminalStore((state) => state.activeId)
  const add = useIdeTerminalStore((state) => state.add)
  const close = useIdeTerminalStore((state) => state.close)
  const rename = useIdeTerminalStore((state) => state.rename)
  const setActive = useIdeTerminalStore((state) => state.setActive)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [contextMenu, setContextMenu] = useState<{
    id: string
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    if (visible && tabs.length === 0) {
      const id = add(undefined, { cwd })
      setActive(id)
    }
  }, [visible, tabs.length, add, setActive, cwd])

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? tabs[0] ?? null

  const closeTab = (id: string) => {
    close(id)
    void ptyKill(id).catch(() => undefined)
  }

  const startRename = (id: string, title: string) => {
    setEditingId(id)
    setDraft(title)
  }

  const commitRename = () => {
    if (editingId && draft.trim()) rename(editingId, draft)
    setEditingId(null)
    setDraft('')
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as HTMLElement).closest('[data-terminal-context-menu]')) {
        return
      }
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
    }
  }, [contextMenu])

  return (
    <div className='relative flex h-full min-h-0 min-w-0 border-t bg-[#080808]'>
      <div className='min-h-0 min-w-0 flex-1 p-1'>
        {activeTab ? (
          <TerminalPane
            tab={activeTab}
            active
            visible={visible}
            onActivate={setActive}
            onRequestClose={closeTab}
            onRename={rename}
          />
        ) : (
          <button
            type='button'
            onClick={() => {
              const id = add()
              setActive(id)
            }}
            className='flex h-full w-full items-center justify-center text-[11px] text-neutral-600 hover:text-neutral-300'
          >
            Klik untuk terminal baru
          </button>
        )}
      </div>

      <div
        role='separator'
        aria-orientation='vertical'
        aria-label='Ubah lebar daftar terminal'
        onPointerDown={onRailResizeStart}
        className='w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-sky-500/50'
      />

      <div
        style={{ width: railWidth }}
        className='flex shrink-0 flex-col border-l border-neutral-800 bg-neutral-950'
      >
        <div className='flex h-8 shrink-0 items-center justify-center border-b border-neutral-800'>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type='button'
                aria-label='Terminal baru'
                onClick={() => {
                  const id = add(undefined, { cwd })
                  setActive(id)
                }}
                className='flex size-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100'
              >
                <Plus className='size-3.5' />
              </button>
            </TooltipTrigger>
            <TooltipContent side='left' sideOffset={6}>
              Terminal baru
            </TooltipContent>
          </Tooltip>
        </div>

        <div className='min-h-0 flex-1 overflow-auto py-1'>
          {tabs.map((tab) => (
            <Tooltip key={tab.id} open={editingId === tab.id ? false : undefined}>
              <TooltipTrigger asChild>
                <div
                  role='tab'
                  aria-selected={tab.id === activeTab?.id}
                  tabIndex={0}
                  onClick={() => setActive(tab.id)}
                  onDoubleClick={() => startRename(tab.id, tab.title)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setContextMenu({
                      id: tab.id,
                      x: event.clientX,
                      y: event.clientY,
                    })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActive(tab.id)
                    }
                    if (event.key === 'F2') {
                      event.preventDefault()
                      startRename(tab.id, tab.title)
                    }
                  }}
                  className={cn(
                    'mx-1 flex h-9 items-center gap-2 rounded px-2 outline-none transition-colors',
                    tab.id === activeTab?.id
                      ? 'bg-neutral-800 text-neutral-100'
                      : 'text-neutral-500 hover:bg-neutral-900 hover:text-neutral-200'
                  )}
                >
                  <TerminalSquare className='size-4 shrink-0' />
                  <span className='min-w-0 truncate text-[11px]'>{tab.title}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent side='left' sideOffset={6} className='max-w-52'>
                <span className='block truncate'>{tab.title}</span>
                <span className='block text-[10px] opacity-70'>
                  Klik kanan untuk opsi
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {editingId ? (
        <div
          className='absolute top-1 z-50'
          style={{ right: railWidth + 8 }}
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') commitRename()
              if (event.key === 'Escape') {
                setEditingId(null)
                setDraft('')
              }
            }}
            className='w-48 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-100 shadow-lg outline-none'
          />
        </div>
      ) : null}

      {contextMenu
        ? (() => {
            const tab = tabs.find((item) => item.id === contextMenu.id)
            if (!tab) return null
            return (
              <div
                data-terminal-context-menu
                role='menu'
                className='fixed z-[120] w-44 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg'
                style={{
                  left: Math.max(
                    8,
                    Math.min(contextMenu.x, window.innerWidth - 184)
                  ),
                  top: Math.max(
                    8,
                    Math.min(contextMenu.y, window.innerHeight - 96)
                  ),
                }}
              >
                <button
                  type='button'
                  role='menuitem'
                  onClick={() => {
                    startRename(tab.id, tab.title)
                    setContextMenu(null)
                  }}
                  className='flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted'
                >
                  <Pencil className='size-3.5' />
                  Ubah Nama
                </button>
                <button
                  type='button'
                  role='menuitem'
                  onClick={() => {
                    closeTab(tab.id)
                    setContextMenu(null)
                  }}
                  className='flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10'
                >
                  <X className='size-3.5' />
                  Kill Terminal
                </button>
              </div>
            )
          })()
        : null}
    </div>
  )
}
