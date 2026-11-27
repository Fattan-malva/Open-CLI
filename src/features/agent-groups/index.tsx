import {
  memo,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Globe, MessageSquare, Plus, RefreshCw, Send, Square, SquareTerminal, Workflow, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { BrowserWorkspace } from '@/features/browser'
import { hideAllBrowserViews } from '@/lib/browser'
import { cn } from '@/lib/utils'
import { type Agent, useAgentGroupStore } from './store'
import { OrchestratorPanel } from './orchestrator-panel'

const PREVIEW_LINES = 40
const LAYOUT_KEY = 'opencli.agent-groups.layout.v1'

type Mode = 'agents' | 'orchestrator'

type StoredLayout = {
  sidebarWidth: number
  rightWidth: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function loadLayout(): StoredLayout {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return { sidebarWidth: 256, rightWidth: 460 }
    const parsed = JSON.parse(raw) as Partial<StoredLayout>
    return {
      sidebarWidth: clamp(Number(parsed.sidebarWidth) || 256, 200, 420),
      rightWidth: clamp(Number(parsed.rightWidth) || 460, 320, 920),
    }
  } catch {
    return { sidebarWidth: 256, rightWidth: 460 }
  }
}

function ResizeHandle({
  label,
  onResize,
}: {
  label: string
  onResize: (delta: number) => void
}) {
  const startX = useRef<number | null>(null)

  const stop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return
    startX.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      role='separator'
      aria-label={label}
      aria-orientation='vertical'
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        startX.current = event.clientX
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (startX.current === null) return
        const delta = event.clientX - startX.current
        if (!delta) return
        startX.current = event.clientX
        onResize(delta)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        onResize(event.key === 'ArrowLeft' ? -16 : 16)
      }}
      className='w-1 shrink-0 cursor-col-resize bg-border outline-none transition-colors hover:bg-ring focus-visible:bg-ring'
    />
  )
}

function tailLines(text: string): string {
  const lines = text.split('\n')
  return lines.slice(-PREVIEW_LINES).join('\n')
}

const AgentCard = memo(function AgentCard({
  agent,
  focused,
  onFocus,
  onMove,
  onKill,
}: {
  agent: Agent
  focused: boolean
  onFocus: () => void
  onMove: () => void
  onKill: () => void
}) {
  const outputRef = useRef<HTMLPreElement>(null)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const view = useAgentGroupStore((state) => state.views[agent.id] ?? 'terminal')
  const messages = useAgentGroupStore((state) => state.chats[agent.id])
  const setView = useAgentGroupStore((state) => state.setView)
  const sendChat = useAgentGroupStore((state) => state.sendChat)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const node = outputRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [agent.output])

  useEffect(() => {
    const node = transcriptRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages])

  const submitChat = () => {
    if (!draft.trim()) return
    sendChat(agent.id, draft)
    setDraft('')
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col rounded-md border bg-card',
        focused && 'ring-2 ring-ring'
      )}
      onClick={onFocus}
    >
      <div className='flex items-center gap-2 border-b px-3 py-2'>
        <span
          className={cn(
            'size-2 rounded-full',
            agent.status === 'running' ? 'bg-emerald-500' : 'bg-muted-foreground'
          )}
        />
        <span className='flex-1 truncate text-sm font-medium'>{agent.label}</span>
        <span className='text-xs text-muted-foreground'>
          {agent.status === 'running' ? 'aktif' : 'berhenti'}
        </span>
        <Button
          variant='ghost'
          size='icon'
          aria-label={view === 'chat' ? 'Tampilkan terminal' : 'Tampilkan chat'}
          title={view === 'chat' ? 'Terminal' : 'Chat'}
          className='size-7'
          onClick={(event) => { event.stopPropagation(); setView(agent.id, view === 'chat' ? 'terminal' : 'chat') }}
        >
          {view === 'chat' ? <SquareTerminal className='size-3.5' /> : <MessageSquare className='size-3.5' />}
        </Button>
        <Button variant='ghost' size='sm' onClick={(event) => { event.stopPropagation(); onMove() }}>
          Pindah
        </Button>
        {agent.status === 'running' && (
          <Button
            variant='ghost'
            size='icon'
            aria-label='Hentikan agent'
            className='size-7'
            onClick={(event) => { event.stopPropagation(); onKill() }}
          >
            <Square className='size-3.5' />
          </Button>
        )}
      </div>
      {view === 'chat' ? (
        <div className='flex h-56 flex-col'>
          <div ref={transcriptRef} className='flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3 text-xs leading-relaxed'>
            {!messages?.length && <p className='text-muted-foreground'>Belum ada percakapan.</p>}
            {messages?.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'whitespace-pre-wrap break-words rounded-md px-2.5 py-1.5',
                  message.role === 'user' ? 'ml-8 bg-primary text-primary-foreground' : 'mr-8 bg-muted font-mono'
                )}
              >
                {message.text}
              </div>
            ))}
          </div>
          <form
            className='flex gap-2 border-t p-2'
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => { event.preventDefault(); submitChat() }}
          >
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={agent.status === 'running' ? 'Kirim pesan ke agent…' : 'Agent berhenti'}
              disabled={agent.status !== 'running'}
              className='h-8 text-xs'
            />
            <Button type='submit' size='sm' disabled={agent.status !== 'running' || !draft.trim()}>
              Kirim
            </Button>
          </form>
        </div>
      ) : (
        <pre
          ref={outputRef}
          className='h-56 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed'
        >
          {tailLines(agent.output) || (agent.status === 'running' ? 'Menunggu output…' : 'Tidak ada output.')}
        </pre>
      )}
    </div>
  )
})

export function AgentGroupWorkspace() {
  const groups = useAgentGroupStore((state) => state.groups)
  const agents = useAgentGroupStore((state) => state.agents)
  const prompts = useAgentGroupStore((state) => state.prompts)
  const detected = useAgentGroupStore((state) => state.detected)
  const capacity = useAgentGroupStore((state) => state.capacity)
  const selectedGroupId = useAgentGroupStore((state) => state.selectedGroupId)
  const focusedAgentId = useAgentGroupStore((state) => state.focusedAgentId)
  const loadEnvironment = useAgentGroupStore((state) => state.loadEnvironment)
  const createGroup = useAgentGroupStore((state) => state.createGroup)
  const deleteGroup = useAgentGroupStore((state) => state.deleteGroup)
  const selectGroup = useAgentGroupStore((state) => state.selectGroup)
  const focusAgent = useAgentGroupStore((state) => state.focusAgent)
  const spawnAgent = useAgentGroupStore((state) => state.spawnAgent)
  const attachAgent = useAgentGroupStore((state) => state.attachAgent)
  const killAgent = useAgentGroupStore((state) => state.killAgent)
  const sendToGroup = useAgentGroupStore((state) => state.sendToGroup)

  const [newGroupName, setNewGroupName] = useState('')
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<Mode>('agents')
  const [browserOpen, setBrowserOpen] = useState(false)
  const [layout] = useState(loadLayout)
  const [sidebarWidth, setSidebarWidth] = useState(layout.sidebarWidth)
  const [rightWidth, setRightWidth] = useState(layout.rightWidth)

  useEffect(() => {
    void loadEnvironment()
  }, [loadEnvironment])

  useEffect(() => {
    try {
      localStorage.setItem(
        LAYOUT_KEY,
        JSON.stringify({ sidebarWidth, rightWidth })
      )
    } catch {
      return
    }
  }, [sidebarWidth, rightWidth])

  useEffect(() => {
    if (!browserOpen) void hideAllBrowserViews().catch(() => undefined)
  }, [browserOpen])

  const allAgents = Object.values(agents)
  const running = allAgents.filter((agent) => agent.status === 'running')
  const max = capacity?.maxAgents ?? 1
  const atLimit = running.length >= max
  const group = groups.find((item) => item.id === selectedGroupId) ?? null
  const members = group ? allAgents.filter((agent) => agent.groupId === group.id) : []
  const ungrouped = allAgents.filter((agent) => agent.groupId === null)
  const groupPrompts = group ? prompts.filter((prompt) => prompt.groupId === group.id).slice(-5) : []
  const runningMembers = members.filter((agent) => agent.status === 'running').length

  const send = () => {
    if (!group) return
    sendToGroup(group.id, draft)
    setDraft('')
  }

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <header className='flex flex-wrap items-center gap-3 border-b px-4 py-3'>
        <h1 className='text-lg font-semibold'>Grup Agent</h1>
        <span className='rounded-md border px-2 py-1 text-xs text-muted-foreground'>
          {running.length} / {max} agent aktif
          {capacity ? ` · ${capacity.cpus} core · ${Math.round(capacity.memoryMb / 1024)} GB` : ''}
        </span>
        <div className='ml-auto flex items-center gap-1 rounded-md border p-0.5'>
          <Button
            variant={mode === 'agents' ? 'secondary' : 'ghost'}
            size='sm'
            className='h-7 px-2 text-xs'
            onClick={() => setMode('agents')}
          >
            Agent
          </Button>
          <Button
            variant={mode === 'orchestrator' ? 'secondary' : 'ghost'}
            size='sm'
            className='h-7 gap-1 px-2 text-xs'
            onClick={() => setMode('orchestrator')}
          >
            <Workflow className='size-3.5' />
            Orchestrator
          </Button>
        </div>
        <Button
          variant={browserOpen ? 'secondary' : 'outline'}
          size='sm'
          className='h-8 gap-1 px-2 text-xs'
          onClick={() => setBrowserOpen((open) => !open)}
        >
          <Globe className='size-3.5' />
          Browser
        </Button>
        <Button variant='outline' size='sm' className='gap-2' onClick={() => void loadEnvironment()}>
          <RefreshCw className='size-4' />
          Deteksi ulang
        </Button>
      </header>

      <div className='flex min-h-0 flex-1'>
        <aside
          style={{ width: sidebarWidth }}
          className='flex min-w-0 shrink-0 flex-col gap-3 overflow-y-auto p-3'
        >
          <div className='flex gap-2'>
            <Input
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  createGroup(newGroupName)
                  setNewGroupName('')
                }
              }}
              placeholder='Nama grup baru'
              className='h-8'
            />
            <Button
              size='icon'
              className='size-8 shrink-0'
              aria-label='Buat grup'
              onClick={() => {
                createGroup(newGroupName)
                setNewGroupName('')
              }}
            >
              <Plus className='size-4' />
            </Button>
          </div>

          <ul className='flex flex-col gap-1'>
            {groups.map((item) => {
              const count = allAgents.filter((agent) => agent.groupId === item.id).length
              return (
                <li key={item.id}>
                  <button
                    type='button'
                    onClick={() => selectGroup(item.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                      item.id === selectedGroupId && 'bg-accent font-medium'
                    )}
                  >
                    <span className='truncate'>{item.name}</span>
                    <span className='text-xs text-muted-foreground'>{count}</span>
                  </button>
                </li>
              )
            })}
            {groups.length === 0 && (
              <li className='text-xs text-muted-foreground'>Belum ada grup.</li>
            )}
          </ul>

          {ungrouped.length > 0 && (
            <div className='flex flex-col gap-2 border-t pt-3'>
              <p className='text-xs font-medium text-muted-foreground'>Belum tergabung</p>
              {ungrouped.map((agent) => (
                <div key={agent.id} className='flex flex-col gap-1 rounded-md border p-2'>
                  <span className='truncate text-sm'>
                    {agent.label} · {agent.status === 'running' ? 'aktif' : 'berhenti'}
                  </span>
                  <select
                    className='h-7 rounded-md border bg-background px-2 text-xs'
                    value=''
                    onChange={(event) => {
                      if (event.target.value) attachAgent(agent.id, event.target.value)
                    }}
                  >
                    <option value=''>Gabung ke grup…</option>
                    {groups.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </aside>

        <ResizeHandle
          label='Ubah lebar daftar grup'
          onResize={(delta) =>
            setSidebarWidth((width) => clamp(width + delta, 200, 420))
          }
        />

        <main className='flex min-w-0 flex-1 flex-col'>
          {mode === 'orchestrator' ? (
            <OrchestratorPanel />
          ) : !group ? (
            <div className='flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground'>
              Pilih grup di kiri atau buat grup baru.
            </div>
          ) : (
            <>
              <div className='flex flex-wrap items-center gap-2 border-b px-4 py-3'>
                <h2 className='text-base font-semibold'>{group.name}</h2>
                <span className='text-xs text-muted-foreground'>
                  {runningMembers} aktif dari {members.length} agent
                </span>
                <div className='ml-auto flex flex-wrap items-center gap-2'>
                  {detected.length === 0 && (
                    <span className='text-xs text-muted-foreground'>
                      Tidak ada agent CLI di PATH. Install lalu klik Deteksi ulang.
                    </span>
                  )}
                  {detected.map((item) => (
                    <Button
                      key={item.id}
                      variant='outline'
                      size='sm'
                      disabled={atLimit}
                      onClick={() => void spawnAgent(item.id, group.id)}
                    >
                      + {item.label}
                    </Button>
                  ))}
                  <Button variant='ghost' size='sm' onClick={() => deleteGroup(group.id)}>
                    Hapus grup
                  </Button>
                </div>
              </div>

              {running.length > 0 && (
                <div className='flex items-center gap-2 border-b px-4 py-2 text-sm'>
                  <span className='text-muted-foreground'>Agent aktif</span>
                  <select
                    className='h-8 min-w-0 flex-1 rounded-md border bg-background px-2'
                    value={focusedAgentId ?? ''}
                    onChange={(event) => focusAgent(event.target.value || null)}
                  >
                    <option value=''>Pilih agent…</option>
                    {running.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.label} · {groups.find((item) => item.id === agent.groupId)?.name ?? 'tanpa grup'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className='grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-4 xl:grid-cols-2'>
                {members.length === 0 && (
                  <p className='text-sm text-muted-foreground'>
                    Belum ada agent di grup ini. Tambah dengan tombol di atas, atau gabungkan agent dari daftar kiri.
                  </p>
                )}
                {members.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    focused={agent.id === focusedAgentId}
                    onFocus={() => focusAgent(agent.id)}
                    onMove={() => attachAgent(agent.id, null)}
                    onKill={() => killAgent(agent.id)}
                  />
                ))}
              </div>

              <div className='flex flex-col gap-2 border-t p-3'>
                {groupPrompts.length > 0 && (
                  <ul className='max-h-20 overflow-y-auto text-xs text-muted-foreground'>
                    {groupPrompts.map((prompt) => (
                      <li key={prompt.id} className='truncate'>
                        → {prompt.text} <span>({prompt.sent} agent)</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className='flex items-end gap-2'>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        send()
                      }
                    }}
                    rows={2}
                    placeholder={`Kirim ke ${runningMembers} agent aktif di grup ini (Enter kirim, Shift+Enter baris baru)`}
                    className='min-h-12 flex-1 resize-none rounded-md border bg-background p-2 text-sm'
                  />
                  <Button className='gap-2' onClick={send} disabled={!draft.trim() || runningMembers === 0}>
                    <Send className='size-4' />
                    Kirim
                  </Button>
                </div>
              </div>
            </>
          )}
        </main>

        {browserOpen && (
          <>
            <ResizeHandle
              label='Ubah lebar panel kanan'
              onResize={(delta) =>
                setRightWidth((width) => clamp(width - delta, 320, 920))
              }
            />
            <section
              style={{ width: rightWidth }}
              className='flex min-w-0 shrink-0 flex-col border-l bg-background'
            >
              <div className='flex h-9 shrink-0 items-center justify-between border-b px-3'>
                <span className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                  Browser
                </span>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-6'
                  aria-label='Tutup panel'
                  onClick={() => setBrowserOpen(false)}
                >
                  <X className='size-3.5' />
                </Button>
              </div>
              <div className='relative min-h-0 flex-1 overflow-hidden'>
                <BrowserWorkspace visible embedded />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
