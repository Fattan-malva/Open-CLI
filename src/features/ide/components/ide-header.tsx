import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useSidebar } from '@/components/ui/sidebar'

type MenuKey = 'file' | 'edit' | 'view' | 'terminal' | 'help' | null

type IdeHeaderProps = {
  onOpenFile: () => void
  onOpenFolder: () => void
  onSave: () => void
  onFormat: () => void
  onQuickOpen: () => void
  onSearch: () => void
  onToggleExplorer: () => void
  onToggleTerminal: () => void
  onToggleBrowser: () => void
  onCloseEditor: () => void
  onNewTerminal: () => void
}

type MenuItemProps = {
  label: string
  shortcut?: string
  onClick?: () => void
}

function MenuItem({ label, shortcut, onClick }: MenuItemProps) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='flex w-full items-center justify-between gap-6 rounded px-2 py-1.5 text-left text-[11px] text-neutral-200 transition-colors hover:bg-neutral-800'
    >
      <span>{label}</span>
      {shortcut && (
        <span className='shrink-0 text-[10px] text-neutral-500'>{shortcut}</span>
      )}
    </button>
  )
}

export function IdeHeader({
  onOpenFile,
  onOpenFolder,
  onSave,
  onFormat,
  onQuickOpen,
  onSearch,
  onToggleExplorer,
  onToggleTerminal,
  onToggleBrowser,
  onCloseEditor,
  onNewTerminal,
}: IdeHeaderProps) {
  const { toggleSidebar } = useSidebar()
  const [menu, setMenu] = useState<MenuKey>(null)

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-ide-menu]')) setMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [menu])

  const run = (action?: () => void) => {
    setMenu(null)
    action?.()
  }

  const menus: Record<Exclude<MenuKey, null>, MenuItemProps[]> = {
    file: [
      { label: 'Buka File...', shortcut: 'Ctrl+O', onClick: () => run(onOpenFile) },
      {
        label: 'Buka Folder...',
        shortcut: 'Ctrl+Shift+O',
        onClick: () => run(onOpenFolder),
      },
      { label: 'Simpan', shortcut: 'Ctrl+S', onClick: () => run(onSave) },
      {
        label: 'Format Dokumen',
        shortcut: 'Shift+Alt+F',
        onClick: () => run(onFormat),
      },
      {
        label: 'Tutup Editor',
        shortcut: 'Ctrl+W',
        onClick: () => run(onCloseEditor),
      },
    ],
    edit: [
      { label: 'Cari di File', shortcut: 'Ctrl+F' },
      {
        label: 'Cari di Workspace',
        shortcut: 'Ctrl+Shift+F',
        onClick: () => run(onSearch),
      },
      {
        label: 'Buka File Cepat',
        shortcut: 'Ctrl+P',
        onClick: () => run(onQuickOpen),
      },
    ],
    view: [
      {
        label: 'Toggle Explorer',
        shortcut: 'Ctrl+B',
        onClick: () => run(onToggleExplorer),
      },
      {
        label: 'Tampilkan/Sembunyikan Terminal',
        shortcut: 'Ctrl+`',
        onClick: () => run(onToggleTerminal),
      },
      {
        label: 'Toggle Browser',
        shortcut: 'Ctrl+Alt+B',
        onClick: () => run(onToggleBrowser),
      },
      {
        label: 'Toggle Sidebar Open CLI',
        onClick: () => run(toggleSidebar),
      },
    ],
    terminal: [
      {
        label: 'Terminal Baru',
        shortcut: 'Ctrl+Shift+`',
        onClick: () => run(onNewTerminal),
      },
      {
        label: 'Tampilkan/Sembunyikan Terminal',
        shortcut: 'Ctrl+`',
        onClick: () => run(onToggleTerminal),
      },
    ],
    help: [
      {
        label: 'Shortcut IDE',
        onClick: () =>
          run(() =>
            toast.info(
              'Ctrl+P file, Ctrl+Shift+F cari teks, Ctrl+S simpan, Shift+Alt+F format, Ctrl+` terminal.'
            )
          ),
      },
    ],
  }

  return (
    <header
      data-ide-menu
      className='relative z-[61] h-10 w-full shrink-0 bg-background'
    >
      <div className='flex h-full items-center gap-1 px-2'>
        <span className='me-2 select-none text-[11px] font-semibold tracking-wide'>
          Open CLI IDE
        </span>
        {(['file', 'edit', 'view', 'terminal', 'help'] as const).map((key) => (
          <div key={key} className='relative'>
            <button
              type='button'
              onClick={() => setMenu((current) => (current === key ? null : key))}
              className={`rounded px-2 py-1 text-[11px] capitalize transition-colors hover:bg-accent ${
                menu === key ? 'bg-accent text-foreground' : 'text-muted-foreground'
              }`}
            >
              {key}
            </button>
            {menu === key && (
              <div className='absolute left-0 top-full z-50 mt-1 w-60 rounded-md border border-neutral-700 bg-neutral-900 p-1 shadow-xl'>
                {menus[key].map((item) => (
                  <MenuItem key={item.label} {...item} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </header>
  )
}
