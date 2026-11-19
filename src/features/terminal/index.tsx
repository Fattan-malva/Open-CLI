import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, FolderOpen, Plus, Terminal, Trash2, X } from 'lucide-react'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { CmdIcon, PowerShellIcon } from '@/components/shell-icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/platform'
import { ptyIsBusy, ptyKill } from '@/lib/pty'
import {
  loadAgentCliStore,
  saveAgentCliStore,
  type AgentCliStoreData,
} from '@/lib/agent-cli-store'
import { builtInAgents, type AgentCliItem } from '@/features/agent-cli/data/agents'
import { ShortcutKeys } from '@/features/agent-cli/components/shortcut-keys'
import { ProjectPickerDialog } from './components/project-picker-dialog'
import { TerminalPane } from './components/terminal-pane'
import { useTerminalStore } from './store'

const shells = [
  {
    value: 'powershell.exe',
    label: 'PowerShell',
    Icon: PowerShellIcon,
    iconClassName: 'size-4 text-[#5391FE]',
  },
  {
    value: 'cmd.exe',
    label: 'CMD',
    Icon: CmdIcon,
    iconClassName: 'size-4',
  },
]

function AgentOptionIcon({ agent }: { agent: AgentCliItem }) {
  if (!agent.icon) return <Bot className='size-4 shrink-0' />

  return (
    <span className='relative flex size-4 shrink-0 items-center justify-center'>
      <img
        src={agent.icon}
        alt=''
        className={cn('size-4 object-contain', agent.darkIcon && 'dark:hidden')}
      />
      {agent.darkIcon ? (
        <img
          src={agent.darkIcon}
          alt=''
          className='absolute inset-0 hidden size-4 object-contain dark:block'
        />
      ) : null}
    </span>
  )
}

const terminalShortcuts = [
  {
    keys: ['Ctrl', 'T'],
    label: 'Terminal baru',
    description: 'Membuka panel baru di grid.',
    icon: Plus,
  },
  {
    keys: ['Ctrl', 'W'],
    label: 'Tutup satu',
    description: 'Menutup satu terminal dari bawah.',
    icon: X,
  },
  {
    keys: ['Ctrl', 'Shift', 'W'],
    label: 'Tutup semua',
    description: 'Idle dulu, lalu konfirmasi jika ada proses.',
    icon: Trash2,
  },
]

const GAP = 2
const CLOSE_STEP_MS = 70

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function projectLabel(path: string | null) {
  if (!path) return 'Root (default)'
  const clean = path.replace(/[\\/]+$/, '')
  return clean.split(/[\\/]/).filter(Boolean).pop() ?? clean
}

type Layout = {
  cols: number
  rows: number
  lastCount: number
}

type WeightKind = 'cols' | 'last' | 'rows'

type Weights = {
  key: string
  cols: number[]
  last: number[]
  rows: number[]
}

type Drag = {
  kind: WeightKind
  index: number
  start: number
  startWeights: number[]
  size: number
}

function layoutFor(count: number, compact: boolean): Layout {
  if (compact) return { cols: 1, rows: count, lastCount: 1 }
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(count))))
  const rows = Math.ceil(count / cols)
  return { cols, rows, lastCount: count - cols * (rows - 1) }
}

function equalWeights(length: number) {
  return Array.from({ length }, () => 1)
}

function makeWeights(key: string, layout: Layout): Weights {
  return {
    key,
    cols: equalWeights(layout.cols),
    last: equalWeights(layout.lastCount),
    rows: equalWeights(layout.rows),
  }
}

function adjust(weights: number[], index: number, delta: number) {
  const next = [...weights]
  const other = index + 1
  const total = weights[index] + weights[other]
  const first = Math.max(0.45, weights[index] + delta)
  const second = Math.max(0.45, weights[other] - delta)
  const scale = total / (first + second)
  next[index] = first * scale
  next[other] = second * scale
  return next
}

function positions(weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let offset = 0
  return [0, ...weights.map((weight) => {
    offset += weight
    return (offset / total) * 100
  })]
}

export function TerminalWorkspace({ visible = true }: { visible?: boolean }) {
  const tabs = useTerminalStore((state) => state.tabs)
  const activeId = useTerminalStore((state) => state.activeId)
  const add = useTerminalStore((state) => state.add)
  const close = useTerminalStore((state) => state.close)
  const rename = useTerminalStore((state) => state.rename)
  const setActive = useTerminalStore((state) => state.setActive)
  const [shell, setShell] = useState('powershell.exe')
  const [launcher, setLauncher] = useState('powershell.exe')
  const [agentStore, setAgentStore] = useState<AgentCliStoreData | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [animatedId, setAnimatedId] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [weights, setWeights] = useState<Weights>(() =>
    makeWeights('1:1:1', { cols: 1, rows: 1, lastCount: 1 })
  )
  const [drag, setDrag] = useState<Drag | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const animationTimer = useRef<number | null>(null)

  const layout = useMemo(
    () => layoutFor(Math.max(1, tabs.length), compact),
    [compact, tabs.length]
  )
  const weightKey = `${layout.cols}:${layout.rows}:${layout.lastCount}`
  const colWeights =
    weights.key === weightKey ? weights.cols : equalWeights(layout.cols)
  const lastWeights =
    weights.key === weightKey ? weights.last : equalWeights(layout.lastCount)
  const rowWeights =
    weights.key === weightKey ? weights.rows : equalWeights(layout.rows)

  const colPositions = useMemo(() => positions(colWeights), [colWeights])
  const lastPositions = useMemo(() => positions(lastWeights), [lastWeights])
  const rowPositions = useMemo(() => positions(rowWeights), [rowWeights])
  const fullRows = layout.lastCount < layout.cols ? layout.rows - 1 : layout.rows
  const activeAgents = useMemo(() => {
    if (!agentStore) return []
    const ids = new Set(agentStore.activeIds)
    return [...builtInAgents, ...agentStore.customAgents].filter((agent) =>
      ids.has(agent.id)
    )
  }, [agentStore])
  const selectedAgent = useMemo(() => {
    if (!launcher.startsWith('agent:')) return null
    return activeAgents.find((agent) => `agent:${agent.id}` === launcher) ?? null
  }, [activeAgents, launcher])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const update = () => setCompact(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => () => {
    if (animationTimer.current !== null) window.clearTimeout(animationTimer.current)
  }, [])

  useEffect(() => {
    if (!visible) return

    let alive = true
    void loadAgentCliStore().then((data) => {
      if (!alive) return
      setAgentStore(data)
    })

    return () => {
      alive = false
    }
  }, [visible])

  const newTab = useCallback((command?: string, title?: string) => {
    const id = add(shell, {
      title,
      cwd: agentStore?.projectPath ?? undefined,
      command,
    })
    setAnimatedId(id)
    if (animationTimer.current !== null) window.clearTimeout(animationTimer.current)
    animationTimer.current = window.setTimeout(() => {
      setAnimatedId((current) => (current === id ? null : current))
    }, 320)
  }, [add, agentStore?.projectPath, shell])

  const addLauncher = useCallback(() => {
    newTab(selectedAgent?.command, selectedAgent?.name)
  }, [newTab, selectedAgent])

  const selectProject = useCallback(
    (path: string | null) => {
      setAgentStore((current) => ({
        customAgents: current?.customAgents ?? [],
        activeIds: current?.activeIds ?? [],
        projectPath: path,
      }))

      void loadAgentCliStore()
        .then((fresh): AgentCliStoreData => ({ ...fresh, projectPath: path }))
        .then((next) => {
          setAgentStore(next)
          return saveAgentCliStore(next)
        })
        .catch(() => undefined)
    },
    []
  )

  const launchAgent = useCallback(
    (agent: AgentCliItem) => {
      newTab(agent.command, agent.name)
    },
    [newTab]
  )

  const handleLauncherChange = useCallback(
    (value: string) => {
      if (!value.startsWith('agent:')) setShell(value)
      setLauncher(value)
    },
    []
  )

  useEffect(() => {
    if (!isDesktop) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key.length !== 1 || !/^[a-z]$/i.test(event.key)) return
      if (document.querySelector('[role="dialog"]')) return

      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return
      }

      const letter = event.key.toUpperCase()
      const agent = activeAgents.find(
        (item) => {
          const keys = item.shortcut
          return keys?.[keys.length - 1]?.toUpperCase() === letter
        }
      )
      if (!agent) return

      event.preventDefault()
      event.stopPropagation()
      launchAgent(agent)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeAgents, launchAgent])

  const terminate = useCallback(
    async (ids: string[]) => {
      for (const id of ids) {
        if (!useTerminalStore.getState().tabs.some((tab) => tab.id === id)) continue
        void ptyKill(id).catch(() => undefined)
        close(id)
        await sleep(CLOSE_STEP_MS)
      }
    },
    [close]
  )

  const requestClose = useCallback(
    async (id: string) => {
      const busy = await ptyIsBusy(id).catch(() => isDesktop)
      if (busy) {
        setPendingIds((current) =>
          current.includes(id) ? current : [...current, id]
        )
        return
      }
      await terminate([id])
    },
    [terminate]
  )

  const closeOneByShortcut = useCallback(async () => {
    if (pendingIds.length > 0) return
    const currentTabs = useTerminalStore.getState().tabs
    if (currentTabs.length === 0) return

    const bottomFirst = [...currentTabs].reverse()
    const statuses = await Promise.all(
      bottomFirst.map(async (tab) => ({
        id: tab.id,
        busy: await ptyIsBusy(tab.id).catch(() => isDesktop),
      }))
    )
    const idle = statuses.find((status) => !status.busy)
    if (idle) {
      await terminate([idle.id])
      return
    }

    const busy = statuses[0]
    if (busy) setPendingIds([busy.id])
  }, [pendingIds, terminate])

  const closeAllByShortcut = useCallback(async () => {
    if (pendingIds.length > 0) return
    const currentTabs = useTerminalStore.getState().tabs
    if (currentTabs.length === 0) return

    const bottomFirst = [...currentTabs].reverse()
    const statuses = await Promise.all(
      bottomFirst.map(async (tab) => ({
        id: tab.id,
        busy: await ptyIsBusy(tab.id).catch(() => isDesktop),
      }))
    )
    const idle = statuses
      .filter((status) => !status.busy)
      .map((status) => status.id)
    const busy = statuses
      .filter((status) => status.busy)
      .map((status) => status.id)

    await terminate(idle)

    const stillBusy: string[] = []
    for (const id of busy) {
      const busyNow = await ptyIsBusy(id).catch(() => isDesktop)
      if (busyNow) stillBusy.push(id)
      else await terminate([id])
    }

    if (stillBusy.length > 0) {
      setPendingIds((current) => Array.from(new Set([...current, ...stillBusy])))
    }
  }, [pendingIds, terminate])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      if (
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 't'
      ) {
        event.preventDefault()
        event.stopPropagation()
        addLauncher()
        return
      }
      if (
        event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 'w'
      ) {
        event.preventDefault()
        event.stopPropagation()
        void closeOneByShortcut()
        return
      }
      if (
        event.ctrlKey &&
        event.shiftKey &&
        event.key.toLowerCase() === 'w'
      ) {
        event.preventDefault()
        event.stopPropagation()
        void closeAllByShortcut()
        return
      }
      if (event.ctrlKey && event.shiftKey && event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        const currentTabs = useTerminalStore.getState().tabs
        if (currentTabs.length < 2) return
        const index = currentTabs.findIndex((tab) => tab.id === activeId)
        setActive(currentTabs[(index + 1) % currentTabs.length].id)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [activeId, addLauncher, closeAllByShortcut, closeOneByShortcut, setActive])

  useEffect(() => {
    if (!drag) return
    const onMove = (event: PointerEvent) => {
      const current = gridRef.current
      if (!current) return
      const diff =
        drag.kind === 'cols' || drag.kind === 'last'
          ? event.clientX - drag.start
          : event.clientY - drag.start
      const total = drag.startWeights.reduce((sum, weight) => sum + weight, 0)
      const delta = (diff / drag.size) * total
      setWeights((prev) => {
        const base = prev.key === weightKey ? prev : makeWeights(weightKey, layout)
        const next = adjust(drag.startWeights, drag.index, delta)
        if (drag.kind === 'rows') return { ...base, rows: next }
        if (drag.kind === 'last') return { ...base, last: next }
        return { ...base, cols: next }
      })
    }
    const onUp = () => setDrag(null)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag, layout, weightKey])

  const startDrag = (
    kind: WeightKind,
    index: number,
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const grid = gridRef.current
    if (!grid) return
    event.preventDefault()
    const startWeights =
      kind === 'rows' ? rowWeights : kind === 'last' ? lastWeights : colWeights
    setWeights((prev) =>
      prev.key === weightKey ? prev : makeWeights(weightKey, layout)
    )
    setDrag({
      kind,
      index,
      start: kind === 'rows' ? event.clientY : event.clientX,
      startWeights,
      size: kind === 'rows' ? grid.clientHeight : grid.clientWidth,
    })
  }

  const rectFor = (index: number) => {
    const lastRow = layout.lastCount < layout.cols && index >= fullRows * layout.cols
    const rowIndex = lastRow
      ? layout.rows - 1
      : Math.floor(index / layout.cols)
    const colIndex = lastRow
      ? index - fullRows * layout.cols
      : index % layout.cols
    const horizontal = lastRow ? lastPositions : colPositions
    return {
      left: horizontal[colIndex],
      right: horizontal[colIndex + 1],
      top: rowPositions[rowIndex],
      bottom: rowPositions[rowIndex + 1],
    }
  }

  const pendingTabs = tabs.filter((tab) => pendingIds.includes(tab.id))
  const launcherValue =
    selectedAgent || !launcher.startsWith('agent:') ? launcher : shell
  const selectedShell = shells.find((item) => item.value === launcherValue) ?? shells[0]
  const showTerminal = visible

  return (
    <div
      className={cn(
        'absolute inset-0 z-30 flex flex-col bg-background',
        !showTerminal && 'hidden'
      )}
    >
      <AuthenticatedHeader />

      <Main fixed={showTerminal} fluid className='min-h-0 flex-1 overflow-hidden p-0'>
        <div className='flex h-full min-h-0 flex-col'>
          <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-2 py-1.5'>
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => setPickerOpen(true)}
                title={agentStore?.projectPath ?? undefined}
                className='h-7 max-w-56 gap-1.5 px-2 text-[11px]'
              >
                <FolderOpen className='size-3.5 shrink-0' />
                <span className='truncate'>
                  {projectLabel(agentStore?.projectPath ?? null)}
                </span>
              </Button>

              <Select value={launcherValue} onValueChange={handleLauncherChange}>
                <SelectTrigger
                  aria-label='Jenis terminal'
                  className='h-7 w-64 text-[11px]'
                >
                  <span className='flex min-w-0 items-center gap-2'>
                    {selectedAgent ? (
                      <>
                        <AgentOptionIcon agent={selectedAgent} />
                        <span className='truncate'>{selectedAgent.name}</span>
                        <ShortcutKeys
                          keys={selectedAgent.shortcut}
                          className='ml-auto shrink-0'
                        />
                      </>
                    ) : (
                      <>
                        <selectedShell.Icon
                          className={selectedShell.iconClassName}
                        />
                        <span className='truncate'>{selectedShell.label}</span>
                      </>
                    )}
                  </span>
                </SelectTrigger>
                <SelectContent className='max-h-72 [&_[data-radix-select-viewport]]:h-auto [&_[data-radix-select-viewport]]:max-h-64'>
                  <SelectGroup>
                    <SelectLabel>Shell</SelectLabel>
                    {shells.map(({ value, label, Icon, iconClassName }) => (
                      <SelectItem key={value} value={value}>
                        <span className='flex items-center gap-2'>
                          <Icon className={iconClassName} />
                          {label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>

                  <SelectSeparator />

                  <SelectGroup>
                    <SelectLabel>Agent aktif</SelectLabel>
                    {activeAgents.length === 0 ? (
                      <SelectItem value='agent-empty' disabled>
                        Tidak ada agent aktif
                      </SelectItem>
                    ) : (
                      activeAgents.map((agent) => (
                        <SelectItem key={agent.id} value={`agent:${agent.id}`}>
                          <span className='flex min-w-0 flex-1 items-center gap-2'>
                            <AgentOptionIcon agent={agent} />
                            <span className='truncate'>{agent.name}</span>
                            <ShortcutKeys
                              keys={agent.shortcut}
                              className='ml-auto shrink-0'
                            />
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <Button
              size='sm'
              onClick={addLauncher}
              className='h-7 gap-1 px-2 text-[11px]'
            >
              <Plus className='size-3.5' />
              Terminal baru
            </Button>
          </div>

          <div className='relative min-h-0 flex-1 px-1.5 pb-1.5'>
            {tabs.length === 0 ? (
              <div className='flex h-full items-center justify-center p-4'>
                <div className='w-full max-w-3xl rounded-xl border bg-card/60 p-6 shadow-sm'>
                  <div className='mx-auto flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground'>
                    <Terminal className='size-5' />
                  </div>
                  <div className='mt-4 text-center'>
                    <h2 className='text-base font-semibold'>Belum ada terminal</h2>
                    <p className='mx-auto mt-1 max-w-md text-xs text-muted-foreground'>
                      Buat terminal pertama untuk menjalankan perintah. Panel baru
                      otomatis masuk ke grid dan bisa diatur ukurannya.
                    </p>
                    {!isDesktop && (
                      <p className='mt-2 text-[11px] text-amber-500'>
                        Mode browser: terminal real hanya tersedia di aplikasi desktop.
                      </p>
                    )}
                    <Button onClick={addLauncher} className='mt-4 gap-1'>
                      <Plus className='size-4' />
                      Buat terminal pertama
                    </Button>
                  </div>
                  <div className='mt-6 grid gap-2 text-left sm:grid-cols-3'>
                    {terminalShortcuts.map((shortcut) => {
                      const Icon = shortcut.icon
                      return (
                        <div
                          key={shortcut.label}
                          className='rounded-lg border bg-secondary/60 p-3'
                        >
                          <div className='flex items-center gap-2'>
                            <span className='flex size-7 items-center justify-center rounded-md bg-background/70'>
                              <Icon className='size-3.5' />
                            </span>
                            <span className='text-[11px] font-medium'>
                              {shortcut.label}
                            </span>
                          </div>
                          <div className='mt-2 flex flex-wrap gap-1'>
                            {shortcut.keys.map((key) => (
                              <kbd
                                key={key}
                                className='rounded border bg-background/70 px-1.5 py-0.5 text-[10px] text-muted-foreground'
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                          <p className='mt-2 text-[10px] leading-relaxed text-muted-foreground'>
                            {shortcut.description}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div ref={gridRef} className='relative h-full w-full'>
                {tabs.map((tab, index) => {
                  const rect = rectFor(index)
                  return (
                    <div
                      key={tab.id}
                      className={cn(
                        'absolute min-h-0 min-w-0',
                        animatedId === tab.id && 'animate-terminal-split'
                      )}
                      style={{
                        left: `calc(${rect.left}% + ${GAP / 2}px)`,
                        top: `calc(${rect.top}% + ${GAP / 2}px)`,
                        width: `calc(${rect.right - rect.left}% - ${GAP}px)`,
                        height: `calc(${rect.bottom - rect.top}% - ${GAP}px)`,
                      }}
                    >
                      <TerminalPane
                        tab={tab}
                        active={activeId === tab.id}
                        visible={showTerminal}
                        onActivate={() => setActive(tab.id)}
                        onRequestClose={requestClose}
                        onRename={rename}
                      />
                    </div>
                  )
                })}

                {Array.from({ length: fullRows }, (_, rowIndex) =>
                  colPositions.slice(1, -1).map((position, index) => (
                    <div
                      key={`col-${rowIndex}-${index}`}
                      role='separator'
                      aria-orientation='vertical'
                      onPointerDown={(event) => startDrag('cols', index, event)}
                      className='absolute z-20 -translate-x-1/2 cursor-col-resize px-1'
                      style={{
                        left: `${position}%`,
                        top: `${rowPositions[rowIndex]}%`,
                        height: `${rowPositions[rowIndex + 1] - rowPositions[rowIndex]}%`,
                      }}
                    >
                      <div className='h-full w-px bg-transparent transition-colors hover:bg-neutral-600' />
                    </div>
                  ))
                )}

                {layout.lastCount < layout.cols &&
                  lastPositions.slice(1, -1).map((position, index) => (
                    <div
                      key={`last-${index}`}
                      role='separator'
                      aria-orientation='vertical'
                      onPointerDown={(event) => startDrag('last', index, event)}
                      className='absolute z-20 -translate-x-1/2 cursor-col-resize px-1'
                      style={{
                        left: `${position}%`,
                        top: `${rowPositions[layout.rows - 1]}%`,
                        height: `${rowPositions[layout.rows] - rowPositions[layout.rows - 1]}%`,
                      }}
                    >
                      <div className='h-full w-px bg-transparent transition-colors hover:bg-neutral-600' />
                    </div>
                  ))}

                {rowPositions.slice(1, -1).map((position, index) => (
                  <div
                    key={`row-${index}`}
                    role='separator'
                    aria-orientation='horizontal'
                    onPointerDown={(event) => startDrag('rows', index, event)}
                    className='absolute inset-x-0 z-20 -translate-y-1/2 cursor-row-resize py-1'
                    style={{ top: `${position}%` }}
                  >
                    <div className='h-px w-full bg-transparent transition-colors hover:bg-neutral-600' />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Main>

      <ProjectPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        value={agentStore?.projectPath ?? null}
        onSelect={selectProject}
      />

      <AlertDialog
        open={pendingTabs.length > 0}
        onOpenChange={(open) => {
          if (!open) setPendingIds([])
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hentikan proses terminal?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTabs.map((tab) => tab.title).join(', ')} masih memiliki proses
              berjalan. Proses beserta turunannya akan dihentikan paksa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const ids = pendingIds
                setPendingIds([])
                void terminate(ids)
              }}
            >
              Tutup &amp; hentikan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
