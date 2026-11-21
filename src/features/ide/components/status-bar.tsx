import {
  Check,
  Circle,
  Globe,
  Settings2,
  TerminalSquare,
  WrapText,
} from 'lucide-react'
import { isFormatSupported } from '../lib/prettier'
import { useIdeStore } from '../store'

type StatusBarProps = {
  onToggleTerminal: () => void
  onToggleBrowser: () => void
}

export function StatusBar({
  onToggleTerminal,
  onToggleBrowser,
}: StatusBarProps) {
  const files = useIdeStore((state) => state.files)
  const activePath = useIdeStore((state) => state.activePath)
  const root = useIdeStore((state) => state.root)
  const settings = useIdeStore((state) => state.settings)
  const setSettings = useIdeStore((state) => state.setSettings)
  const layout = useIdeStore((state) => state.layout)
  const activeFile = files.find((file) => file.path === activePath) ?? null
  const dirty = activeFile ? activeFile.content !== activeFile.original : false

  return (
    <div className='flex h-6 shrink-0 items-center gap-3 border-t bg-muted/60 px-2 text-[10px] text-muted-foreground'>
      <button
        type='button'
        onClick={onToggleTerminal}
        className={`flex items-center gap-1 rounded px-1 hover:bg-accent ${
          layout.terminalOpen ? 'text-foreground' : ''
        }`}
      >
        <TerminalSquare className='size-3' />
        Terminal
      </button>
      <button
        type='button'
        onClick={onToggleBrowser}
        className={`flex items-center gap-1 rounded px-1 hover:bg-accent ${
          layout.browserOpen ? 'text-foreground' : ''
        }`}
      >
        <Globe className='size-3' />
        Browser
      </button>
      <span className='min-w-0 flex-1 truncate'>
        {root ?? 'Belum ada folder workspace'}
      </span>
      {activeFile && (
        <>
          <span>{dirty ? 'Tersimpan?' : 'Tersimpan'}</span>
          <span>{activeFile.language}</span>
          <span>
            {isFormatSupported(activeFile.path) ? 'Prettier siap' : 'Prettier -'}
          </span>
        </>
      )}
      <button
        type='button'
        onClick={() => setSettings({ wordWrap: !settings.wordWrap })}
        title='Toggle word wrap'
        className={`rounded p-0.5 hover:bg-accent ${
          settings.wordWrap ? 'text-foreground' : ''
        }`}
      >
        <WrapText className='size-3' />
      </button>
      <button
        type='button'
        onClick={() => setSettings({ formatOnSave: !settings.formatOnSave })}
        title='Toggle format on save'
        className={`flex items-center gap-1 rounded px-1 hover:bg-accent ${
          settings.formatOnSave ? 'text-emerald-500' : ''
        }`}
      >
        {settings.formatOnSave ? (
          <Check className='size-3' />
        ) : (
          <Circle className='size-3' />
        )}
        Format
      </button>
      <Settings2 className='size-3' />
    </div>
  )
}
