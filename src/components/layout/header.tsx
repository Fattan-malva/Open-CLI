import { useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/platform'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
  ref?: React.Ref<HTMLElement>
}

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

export function Header({ className, fixed, children, ...props }: HeaderProps) {
  const [offset, setOffset] = useState(0)
  const [maximized, setMaximized] = useState(false)
  const appWindow = useMemo(() => (isDesktop ? getCurrentWindow() : null), [])

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }

    document.addEventListener('scroll', onScroll, { passive: true })
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!appWindow) return

    let active = true
    let unlisten: (() => void) | undefined

    const sync = async () => {
      const value = await appWindow.isMaximized()
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

  const startWindowDrag = () => {
    if (!appWindow) return
    void appWindow.startDragging().catch(() => undefined)
  }

  const toggleMaximize = () => {
    if (!appWindow) return
    void appWindow
      .toggleMaximize()
      .then(async () => setMaximized(await appWindow.isMaximized()))
      .catch(() => undefined)
  }

  return (
    <header
      className={cn(
        'relative z-50 h-16',
        fixed && 'header-fixed peer/header sticky top-0 w-[inherit]',
        offset > 10 && fixed ? 'shadow' : 'shadow-none',
        className
      )}
      {...props}
    >
      {appWindow && (
        <div
          className='absolute inset-0 z-0 cursor-default'
          onMouseDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            startWindowDrag()
          }}
        />
      )}
      <div
        className={cn(
          'relative z-10 flex h-full items-center gap-3 p-4 sm:gap-4',
          appWindow && 'pe-28',
          offset > 10 &&
            fixed &&
            'after:absolute after:inset-0 after:-z-10 after:bg-background/20 after:backdrop-blur-lg'
        )}
      >
        <SidebarTrigger variant='outline' className='max-md:scale-125' />
        <Separator orientation='vertical' className='h-6' />
        {children}
      </div>
      {appWindow && (
        <div className='absolute end-0 top-0 z-20 flex h-8 items-center pe-1'>
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
      )}
    </header>
  )
}
