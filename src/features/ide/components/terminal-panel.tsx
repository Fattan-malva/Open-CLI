import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { ptyKill } from '@/lib/pty'
import { TerminalPane } from '@/features/terminal/components/terminal-pane'
import { useIdeTerminalStore } from '../ide-terminal-store'

type TerminalPanelProps = {
  visible: boolean
}

export function TerminalPanel({ visible }: TerminalPanelProps) {
  const tabs = useIdeTerminalStore((state) => state.tabs)
  const activeId = useIdeTerminalStore((state) => state.activeId)
  const add = useIdeTerminalStore((state) => state.add)
  const close = useIdeTerminalStore((state) => state.close)
  const rename = useIdeTerminalStore((state) => state.rename)
  const setActive = useIdeTerminalStore((state) => state.setActive)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (visible && tabs.length === 0) add()
  }, [visible, tabs.length, add])

  const activeTab = tabs.find((tab) => tab.id === activeId) ?? null

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

  return (
    <div className='flex h-full min-h-0 min-w-0 border-t bg-[#080808]'>
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
            onClick={() => add()}
            className='flex h-full w-full items-center justify-center text-[11px] text-neutral-600 hover:text-neutral-300'
          >
            Klik untuk terminal baru
          </button>
        )}
      </div>

      <div className='flex w-36 shrink-0 flex-col border-l border-neutral-800 bg-neutral-950'>
        <div className='flex h-8 shrink-0 items-center justify-end border-b border-neutral-800 px-2'>
          <button
            type='button'
            aria-label='Terminal baru'
            onClick={() => add()}
            className='flex size-5 items-center justify-center rounded text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100'
          >
            <Plus className='size-3.5' />
          </button>
        </div>
        <div className='min-h-0 flex-1 overflow-auto py-1'>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role='tab'
              aria-selected={tab.id === activeId}
              onClick={() => setActive(tab.id)}
              onDoubleClick={() => startRename(tab.id, tab.title)}
              className={`group mx-1 flex h-7 cursor-pointer items-center gap-1 rounded px-2 text-[11px] ${
                tab.id === activeId
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-500 hover:bg-neutral-900'
              }`}
            >
              {editingId === tab.id ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    if (event.key === 'Enter') commitRename()
                    if (event.key === 'Escape') {
                      setEditingId(null)
                      setDraft('')
                    }
                  }}
                  className='min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-900 px-1 text-[11px] outline-none'
                />
              ) : (
                <span className='min-w-0 flex-1 truncate'>{tab.title}</span>
              )}
              <button
                type='button'
                aria-label={`Tutup ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  closeTab(tab.id)
                }}
                className='rounded p-0.5 text-neutral-600 opacity-0 transition-opacity hover:bg-neutral-700 hover:text-neutral-100 group-hover:opacity-100'
              >
                <X className='size-3' />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
