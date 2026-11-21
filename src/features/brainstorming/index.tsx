import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Brain, GripVertical, Plug, RotateCw } from 'lucide-react'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isDesktop } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { AddBrainstormAppPopover } from './add-brainstorm-app-popover'
import { ConnectMcpDialog } from './connect-mcp-dialog'
import { BrainstormAppIcon } from './app-icon'
import {
  brainstormApps,
  getBrainstormApp,
  isCustomBrainstormApp,
  type BrainstormApp,
} from './data'
import {
  BRAINSTORM_APPS_CHANGED_EVENT,
  DEFAULT_BRAINSTORM_SELECTION,
  readBrainstormSelection,
  readBrainstormSplitRatio,
  readCustomBrainstormApps,
  writeBrainstormSelection,
  writeBrainstormSplitRatio,
  type BrainstormSelection,
  type CustomBrainstormApp,
} from './storage'
import { useBrainstormPane } from './use-brainstorm-pane'

type SplitDrag = {
  start: number
  startRatio: number
  size: number
}

type WorkspacePaneProps = {
  label: string
  app: BrainstormApp
  visible: boolean
  style: CSSProperties
  showToolbar?: boolean
  builtins?: BrainstormApp[]
  customs?: BrainstormApp[]
  selectedKey?: string
  onSelect?: (key: string) => void
  onAdded?: (app: CustomBrainstormApp) => void
}

function clampSplit(value: number) {
  return Math.min(0.75, Math.max(0.25, value))
}

export function BrainstormingWorkspace({
  visible = true,
}: {
  visible?: boolean
}) {
  const [customApps, setCustomApps] = useState(readCustomBrainstormApps)
  const [selection, setSelection] = useState<BrainstormSelection>(
    readBrainstormSelection
  )
  const [split, setSplit] = useState(readBrainstormSplitRatio)
  const [drag, setDrag] = useState<SplitDrag | null>(null)
  const [stacked, setStacked] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 900px)').matches
  )
  const splitRef = useRef<HTMLDivElement>(null)
  const axis = stacked ? 'y' : 'x'

  useEffect(() => {
    const refresh = () => setCustomApps(readCustomBrainstormApps())
    window.addEventListener(BRAINSTORM_APPS_CHANGED_EVENT, refresh)
    return () =>
      window.removeEventListener(BRAINSTORM_APPS_CHANGED_EVENT, refresh)
  }, [])

  useEffect(() => {
    if (!drag) writeBrainstormSplitRatio(split)
  }, [split, drag])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const update = () => setStacked(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!drag) return

    const previous = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    const onMove = (event: PointerEvent) => {
      const current = axis === 'x' ? event.clientX : event.clientY
      setSplit(clampSplit(drag.startRatio + (current - drag.start) / drag.size))
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
  }, [drag, axis])

  const apps = useMemo(
    () => [
      ...Object.values(brainstormApps),
      ...customApps.map((app) => ({ ...app })),
    ],
    [customApps]
  )
  const builtins = useMemo(
    () =>
      apps.filter(
        (app) => !isCustomBrainstormApp(app.key) && app.key !== 'excalidraw'
      ),
    [apps]
  )
  const customs = useMemo(
    () => apps.filter((app) => isCustomBrainstormApp(app.key)),
    [apps]
  )
  const rightKey = getBrainstormApp(selection.right)
    ? selection.right
    : DEFAULT_BRAINSTORM_SELECTION.right
  const leftApp = brainstormApps.excalidraw
  const rightApp = getBrainstormApp(rightKey) ?? brainstormApps.chatgpt

  useEffect(() => {
    writeBrainstormSelection({
      left: DEFAULT_BRAINSTORM_SELECTION.left,
      right: rightKey,
    })
  }, [rightKey])

  const selectRightApp = useCallback(
    (key: string) =>
      setSelection((previous) => ({ ...previous, right: key })),
    []
  )

  const addRightApp = useCallback(
    (app: CustomBrainstormApp) =>
      setSelection((previous) => ({ ...previous, right: app.key })),
    []
  )

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const container = splitRef.current
    if (!container) return
    event.preventDefault()

    const rect = container.getBoundingClientRect()
    const size = axis === 'x' ? rect.width : rect.height
    if (size <= 0) return

    setDrag({
      start: axis === 'x' ? event.clientX : event.clientY,
      startRatio: split,
      size,
    })
  }

  const paneStyle = (side: 'left' | 'right'): CSSProperties => ({
    flexBasis: `${(side === 'left' ? split : 1 - split) * 100}%`,
  })

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
        className={cn(
          'min-h-0 flex-1 overflow-hidden p-0',
          !visible && 'pointer-events-none'
        )}
      >
        <div className='flex h-full min-h-0 flex-col'>
          {visible ? (
            <div className='flex h-11 shrink-0 items-center gap-2 border-b bg-background px-3'>
              <Brain className='size-4' />
              <span className='text-sm font-medium'>Brainstorming</span>
              <span className='ml-auto text-xs text-muted-foreground'>
                Geser pembatas untuk mengatur ukuran panel
              </span>
            </div>
          ) : null}

          <div
            ref={splitRef}
            className={cn(
              'relative min-h-0 flex-1 p-2',
              stacked ? 'flex flex-col' : 'flex flex-row'
            )}
          >
            <WorkspacePane
              label='browser-tab-brainstorming-left'
              app={leftApp}
              visible={visible}
              style={paneStyle('left')}
            />

            {visible ? (
              <div
                role='separator'
                aria-orientation={stacked ? 'horizontal' : 'vertical'}
                aria-label='Ubah ukuran panel'
                onPointerDown={startDrag}
                className={cn(
                  'group relative z-20 flex shrink-0 touch-none items-center justify-center',
                  stacked
                    ? 'h-2 w-full cursor-row-resize'
                    : 'h-full w-2 cursor-col-resize'
                )}
              >
                <div
                  className={cn(
                    'bg-border transition-colors group-hover:bg-primary/50',
                    stacked ? 'h-px w-full' : 'h-full w-px'
                  )}
                />
                <span
                  className={cn(
                    'absolute flex items-center justify-center rounded-full border bg-background',
                    stacked ? 'h-4 w-8' : 'h-8 w-4'
                  )}
                >
                  <GripVertical
                    className={cn(
                      'size-3 text-muted-foreground',
                      stacked && 'rotate-90'
                    )}
                  />
                </span>
              </div>
            ) : null}

            <WorkspacePane
              label='browser-tab-brainstorming-right'
              app={rightApp}
              builtins={builtins}
              customs={customs}
              selectedKey={rightKey}
              onSelect={selectRightApp}
              onAdded={addRightApp}
              visible={visible}
              showToolbar
              style={paneStyle('right')}
            />
          </div>
        </div>
      </Main>
    </div>
  )
}

function WorkspacePane({
  label,
  app,
  builtins,
  customs,
  selectedKey,
  onSelect,
  onAdded,
  visible,
  showToolbar = false,
  style,
}: WorkspacePaneProps) {
  const { viewportRef, reload, navigate } = useBrainstormPane({ label, app, visible })
  const [mcpOpen, setMcpOpen] = useState(false)

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border',
        visible ? 'border-border bg-background' : 'border-transparent bg-transparent'
      )}
      style={style}
    >
      {visible && showToolbar && builtins && customs && selectedKey && onSelect && onAdded ? (
        <div className='flex h-11 shrink-0 items-center gap-2 border-b px-2'>
          <BrainstormAppIcon app={app} className='size-4' />
          <Select value={selectedKey} onValueChange={onSelect}>
            <SelectTrigger
              size='sm'
              aria-label='Pilih aplikasi'
              className='h-8 w-[190px] max-w-[55%]'
            >
              <SelectValue placeholder='Pilih aplikasi' />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Aplikasi</SelectLabel>
                {builtins.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              {customs.length > 0 ? (
                <SelectGroup>
                  <SelectLabel>Custom</SelectLabel>
                  {customs.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ) : null}
            </SelectContent>
          </Select>
          <AddBrainstormAppPopover onAdded={onAdded} />
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => setMcpOpen(true)}
            className='h-8 shrink-0'
          >
            <Plug className='size-4' />
            Connect MCP
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Muat ulang'
            title='Muat ulang'
            onClick={() => void reload()}
            className='ml-auto size-8 shrink-0'
          >
            <RotateCw className='size-4' />
          </Button>
        </div>
      ) : visible ? (
        <div className='flex h-9 shrink-0 items-center justify-end border-b px-2'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Muat ulang'
            title='Muat ulang'
            onClick={() => void reload()}
            className='size-8 shrink-0'
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
            Halaman brainstorming hanya tersedia pada aplikasi desktop.
          </div>
        ) : null}
      </div>

      {visible && showToolbar ? (
        <ConnectMcpDialog
          app={app}
          open={mcpOpen}
          onOpenChange={setMcpOpen}
          onOpenConnectors={(url) => {
            setMcpOpen(false)
            void navigate(url)
          }}
        />
      ) : null}
    </div>
  )
}
