import { useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/platform'

type WindowControlProps = {
  label: string
  onClick: () => void
  destructive?: boolean
  children: React.ReactNode
}

function WindowControl({
  label,
  onClick,
  destructive,
  children,
}: WindowControlProps) {
  return (
    <div className='group relative'>
      <button
        type='button'
        aria-label={label}
        onClick={onClick}
        className={cn(
          'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
          destructive
            ? 'hover:bg-destructive hover:text-destructive-foreground'
            : 'hover:bg-accent hover:text-foreground'
        )}
      >
        {children}
      </button>
      <span
        role='tooltip'
        className='pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-[10px] text-neutral-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100'
      >
        <span className='absolute -top-1 left-1/2 size-1.5 -translate-x-1/2 rotate-45 border-l border-t border-neutral-700 bg-neutral-900' />
        {label}
      </span>
    </div>
  )
}

let maximizedState = false

export function WindowControls({ className }: { className?: string }) {
  const [maximized, setMaximized] = useState(false)
  const appWindow = useMemo(() => (isDesktop ? getCurrentWindow() : null), [])

  useEffect(() => {
    if (!appWindow) return

    let active = true
    let unlisten: (() => void) | undefined

    const sync = async () => {
      const value = await appWindow.isMaximized()
      maximizedState = value
      if (active) setMaximized(value)
    }

    void sync().catch(() => undefined)
    void appWindow
      .onResized(() => {
        void sync().catch(() => undefined)
      })
      .then((fn) => {
        unlisten = fn
        if (!active) fn()
      })
      .catch(() => undefined)

    return () => {
      active = false
      unlisten?.()
    }
  }, [appWindow])

  if (!appWindow) return null

  const toggleMaximize = () => {
    void appWindow
      .toggleMaximize()
      .then(async () => {
        const value = await appWindow.isMaximized()
        maximizedState = value
        setMaximized(value)
      })
      .catch(() => undefined)
  }

  return (
    <div
      className={cn(
        'flex h-8 items-center pe-1',
        className ?? 'absolute end-0 top-0 z-20'
      )}
    >
      <WindowControl
        label='Minimalkan'
        onClick={() => void appWindow.minimize().catch(() => undefined)}
      >
        <Minus className='size-3.5' />
      </WindowControl>
      <WindowControl
        label={maximized ? 'Pulihkan' : 'Maksimal'}
        onClick={toggleMaximize}
      >
        {maximized ? (
          <Minimize2 className='size-3.5' />
        ) : (
          <Maximize2 className='size-3.5' />
        )}
      </WindowControl>
      <WindowControl
        label='Tutup'
        destructive
        onClick={() => void appWindow.close().catch(() => undefined)}
      >
        <X className='size-3.5' />
      </WindowControl>
    </div>
  )
}

export function startWindowDrag() {
  if (!isDesktop || maximizedState) return
  void getCurrentWindow()
    .startDragging()
    .catch(() => undefined)
}
