import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Terminal, type ITheme } from '@xterm/xterm'
import { Copy, Crosshair, LoaderCircle, Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/platform'
import {
  onPtyData,
  onPtyExit,
  onPtySuspended,
  ptyEnsure,
  ptyResize,
  ptySetActive,
  ptyWrite,
} from '@/lib/pty'
import type { TerminalTab } from '../store'
import '@xterm/xterm/css/xterm.css'

const theme: ITheme = {
  background: '#080808',
  foreground: '#ededed',
  cursor: '#ffffff',
  cursorAccent: '#080808',
  selectionBackground: '#ffffff35',
  black: '#0a0a0a',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#9aa5b1',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#eeeeee',
  brightBlack: '#666666',
  brightRed: '#ff6b6b',
  brightGreen: '#a5d6a7',
  brightYellow: '#ffe082',
  brightBlue: '#b0bec5',
  brightMagenta: '#d8a9e8',
  brightCyan: '#89dceb',
  brightWhite: '#ffffff',
}

type TerminalPaneProps = {
  tab: TerminalTab
  active: boolean
  visible: boolean
  suppressResize?: boolean
  onActivate: (id: string) => void
  onRequestClose: (id: string) => void
  onRename: (id: string, title: string) => void
}

export const TerminalPane = memo(function TerminalPane({
  tab,
  active,
  visible,
  suppressResize = false,
  onActivate,
  onRequestClose,
  onRename,
}: TerminalPaneProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const visibleRef = useRef(visible)
  const suppressResizeRef = useRef(suppressResize)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputBufferRef = useRef('')
  const inputTimerRef = useRef<number | null>(null)
  const exitedRef = useRef(false)
  const [exited, setExited] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tab.title)
  const [menuOpen, setMenuOpen] = useState(false)

  const ensureSession = useCallback(async () => {
    if (!isDesktop) return
    try {
      await ptyEnsure(
        tab.id,
        termRef.current?.cols ?? 80,
        termRef.current?.rows ?? 24,
        tab.shell,
        tab.cwd,
        tab.command || undefined
      )
    } catch {
      if (visibleRef.current) {
        termRef.current?.writeln('Gagal memulai shell. Periksa pengaturan shell.')
      }
    }
  }, [tab.id, tab.shell, tab.cwd, tab.command])

  useEffect(() => {
    visibleRef.current = visible
    if (!visible || suppressResizeRef.current) return
    const frame = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        return
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [visible])

  useEffect(() => {
    suppressResizeRef.current = suppressResize
    if (suppressResize) return
    const frame = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        return
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [suppressResize])

  useEffect(() => {
    if (!isDesktop || !sessionReady) return
    if (active && visible) void ensureSession().catch(() => undefined)
    void ptySetActive(tab.id, active && visible).catch(() => undefined)
  }, [active, visible, sessionReady, tab.id, ensureSession])

  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [menuOpen])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const term = new Terminal({
      allowTransparency: false,
      cursorBlink: false,
      cursorStyle: 'bar',
      fontFamily: 'Cascadia Mono, Consolas, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.3,
      scrollback: 1000,
      theme,
      convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(mount)
    term.element?.querySelector('.xterm-viewport')?.classList.add('no-scrollbar')
    termRef.current = term
    fitRef.current = fit

    let webglAddon: WebglAddon | null = null
    try {
      webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon?.dispose()
        webglAddon = null
      })
      term.loadAddon(webglAddon)
    } catch {
      webglAddon = null
    }

    let disposed = false
    let resizeFrame: number | null = null
    const cleanups: (() => void | Promise<void>)[] = []

    const resize = () => {
      if (
        disposed ||
        suppressResizeRef.current ||
        mount.clientWidth === 0 ||
        mount.clientHeight === 0 ||
        resizeFrame !== null
      ) {
        return
      }
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null
        if (disposed || suppressResizeRef.current) return
        try {
          fit.fit()
        } catch {
          return
        }
      })
    }

    const observer = new ResizeObserver(() => resize())
    observer.observe(mount)

    const flushInput = () => {
      if (inputTimerRef.current !== null) {
        window.clearTimeout(inputTimerRef.current)
        inputTimerRef.current = null
      }
      const data = inputBufferRef.current
      inputBufferRef.current = ''
      if (data && !disposed) void ptyWrite(tab.id, data).catch(() => undefined)
    }

    const queueInput = (data: string) => {
      if (!data || disposed) return
      inputBufferRef.current += data
      const isImmediate =
        data.includes('\r') ||
        data.includes('\n') ||
        data.includes('\u0003') ||
        data.includes('\u0004') ||
        data.includes('\u001b')
      if (isImmediate || inputBufferRef.current.length >= 256) {
        flushInput()
        return
      }
      if (inputTimerRef.current === null) {
        inputTimerRef.current = window.setTimeout(flushInput, 12)
      }
    }

    const setup = async () => {
      setSessionReady(false)
      if (!isDesktop) {
        term.writeln('\x1b[38;2;160;160;160mTerminal real hanya tersedia di aplikasi desktop.')
        term.writeln('Jalankan: pnpm desktop:dev\x1b[0m')
        term.write('\r\n$ ')
        setSessionReady(true)
        return
      }

      const [offData, offExit, offSuspended] = await Promise.all([
        onPtyData(tab.id, (data) => {
          if (disposed) return
          if (exitedRef.current) {
            exitedRef.current = false
            setExited(false)
          }
          term.write(data)
        }),
        onPtyExit(tab.id, () => {
          exitedRef.current = true
          if (!disposed) setExited(true)
        }),
        onPtySuspended(tab.id, () => {
          inputBufferRef.current = ''
        }),
      ])
      if (disposed) {
        offData()
        offExit()
        offSuspended()
        return
      }
      cleanups.push(offData, offExit, offSuspended)

      const offInput = term.onData(queueInput)
      const offBinary = term.onBinary((data) => queueInput(data))
      const offResize = term.onResize(({ cols, rows }) => {
        void ptyResize(tab.id, cols, rows).catch(() => undefined)
      })
      cleanups.push(
        () => offInput.dispose(),
        () => offBinary.dispose(),
        () => offResize.dispose()
      )

      await ensureSession()
      if (!disposed) setSessionReady(true)

      try {
        resize()
      } catch {
        if (!disposed) term.writeln('Gagal memulai shell. Periksa pengaturan shell.')
      }
    }

    void setup()

    return () => {
      disposed = true
      observer.disconnect()
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
      if (inputTimerRef.current !== null) window.clearTimeout(inputTimerRef.current)
      inputTimerRef.current = null
      inputBufferRef.current = ''
      cleanups.forEach((cleanup) => void cleanup())
      webglAddon?.dispose()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [tab.id, tab.shell, tab.cwd, tab.command, ensureSession])

  useEffect(() => {
    if (active && visibleRef.current) termRef.current?.focus()
  }, [active, visible])

  useEffect(() => {
    if (termRef.current) termRef.current.options.cursorBlink = active && visible
  }, [active, visible])

  const startRename = () => {
    setDraft(tab.title)
    setMenuOpen(false)
    setEditing(true)
  }

  const commitRename = () => {
    const value = draft.trim()
    if (value && value !== tab.title) onRename(tab.id, value)
    else setDraft(tab.title)
    setEditing(false)
  }

  const cancelRename = () => {
    setDraft(tab.title)
    setEditing(false)
  }

  const copyTitle = () => {
    setMenuOpen(false)
    const clipboard = navigator.clipboard
    if (clipboard) void clipboard.writeText(tab.title).catch(() => undefined)
  }

  const menuItemClass =
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white'

  return (
    <div
      className={cn(
        'relative flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border bg-[#080808]',
        active ? 'border-neutral-600' : 'border-neutral-800/80'
      )}
      onMouseDown={() => onActivate(tab.id)}
    >
      <div className='flex h-7 shrink-0 select-none items-center gap-1 border-b border-neutral-800/80 bg-neutral-950 px-2'>
        <span className='size-1.5 shrink-0 rounded-full bg-emerald-500/80' />
        <div className='relative min-w-0'>
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitRename()
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  cancelRename()
                }
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.stopPropagation()}
              aria-label='Nama terminal'
              maxLength={40}
              className='w-32 rounded border border-neutral-600 bg-neutral-900 px-1 text-[11px] font-medium text-neutral-100 outline-none'
            />
          ) : (
            <span
              title='Klik dua kali untuk ganti nama, klik kanan untuk opsi'
              onDoubleClick={(event) => {
                event.stopPropagation()
                startRename()
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setMenuOpen(true)
              }}
              className='block max-w-[140px] cursor-text truncate text-[11px] font-medium text-neutral-300'
            >
              {tab.title}
            </span>
          )}
          {menuOpen && (
            <div
              ref={menuRef}
              role='menu'
              className='absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-neutral-700 bg-neutral-900/95 p-1 text-neutral-200 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur'
            >
              <span className='absolute -top-1 left-4 size-2 rotate-45 border-l border-t border-neutral-700 bg-neutral-900' />
              <button
                type='button'
                role='menuitem'
                onClick={startRename}
                className={menuItemClass}
              >
                <Pencil className='size-3.5' />
                Ubah nama
              </button>
              <button
                type='button'
                role='menuitem'
                onClick={copyTitle}
                className={menuItemClass}
              >
                <Copy className='size-3.5' />
                Salin nama
              </button>
              <button
                type='button'
                role='menuitem'
                onClick={() => {
                  onActivate(tab.id)
                  setMenuOpen(false)
                }}
                className={menuItemClass}
              >
                <Crosshair className='size-3.5' />
                Fokus panel
              </button>
              <div className='my-1 h-px bg-neutral-800' />
              <button
                type='button'
                role='menuitem'
                onClick={() => {
                  setMenuOpen(false)
                  onRequestClose(tab.id)
                }}
                className={cn(
                  menuItemClass,
                  'text-red-300 hover:bg-red-500/10 hover:text-red-200'
                )}
              >
                <X className='size-3.5' />
                Tutup terminal
              </button>
            </div>
          )}
        </div>
        <span className='truncate text-[10px] text-neutral-600'>
          {tab.shell === 'powershell.exe'
            ? 'powershell'
            : tab.shell === 'cmd.exe'
              ? 'cmd'
              : tab.shell}
        </span>
        {exited && (
          <span className='rounded bg-neutral-800 px-1 py-0.5 text-[9px] text-neutral-400'>
            exited
          </span>
        )}
        <button
          type='button'
          aria-label={`Tutup ${tab.title}`}
          onClick={(event) => {
            event.stopPropagation()
            onRequestClose(tab.id)
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
          className='ms-auto rounded p-0.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-100'
        >
          <X className='size-3' />
        </button>
      </div>
      <div
        ref={mountRef}
        className='min-h-0 flex-1 overflow-hidden px-1 py-0.5'
        onClick={() => termRef.current?.focus()}
      />
      {isDesktop && !sessionReady && (
        <div className='absolute inset-x-0 bottom-0 top-7 z-10 flex items-center justify-center gap-2 bg-[#080808]/95 text-[11px] text-neutral-500'>
          <LoaderCircle className='size-3.5 animate-spin' />
          Menyiapkan {tab.title}...
        </div>
      )}
    </div>
  )
})
