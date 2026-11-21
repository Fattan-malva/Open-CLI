import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { FileCode2, FolderTree, Save, Search, X, type LucideIcon } from 'lucide-react'
import { ShortcutKeys } from '@/features/agent-cli/components/shortcut-keys'
import { languageExtensionForPath } from '../lib/language'
import type { IdeFile, IdeSettings } from '../types'

type EditorAreaProps = {
  root: string | null
  files: IdeFile[]
  activePath: string | null
  settings: IdeSettings
  reveal: {
    path: string
    line: number
    column: number
    nonce: number
  } | null
  onChange: (path: string, content: string) => void
  onSave: (path: string) => void
  onFormat: (path: string) => void
  onClose: (path: string) => void
  onSelect: (path: string) => void
}

function relativePath(root: string | null, path: string) {
  if (!root) return path
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedPath = path.replace(/\\/g, '/')
  if (normalizedPath.startsWith(normalizedRoot)) {
    return normalizedPath.slice(normalizedRoot.length).replace(/^\//, '')
  }
  return path
}

const editorShortcuts: {
  keys: string[]
  label: string
  description: string
  icon: LucideIcon
}[] = [
  {
    keys: ['Ctrl', 'P'],
    label: 'Buka file cepat',
    description: 'Cari dan buka file di folder workspace.',
    icon: Search,
  },
  {
    keys: ['Ctrl', 'Shift', 'E'],
    label: 'Fokus Explorer',
    description: 'Tampilkan pohon file workspace.',
    icon: FolderTree,
  },
  {
    keys: ['Ctrl', 'Shift', 'F'],
    label: 'Cari di file',
    description: 'Cari teks di seluruh workspace.',
    icon: Search,
  },
  {
    keys: ['Ctrl', 'S'],
    label: 'Simpan file',
    description: 'Simpan perubahan pada file aktif.',
    icon: Save,
  },
]

export function EditorArea({
  root,
  files,
  activePath,
  settings,
  reveal,
  onChange,
  onSave,
  onFormat,
  onClose,
  onSelect,
}: EditorAreaProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const statesRef = useRef(new Map<string, EditorState>())
  const applyingRef = useRef(false)
  const callbacks = useRef({ onChange, onSave, onFormat })
  const activeFile = files.find((file) => file.path === activePath) ?? null

  useEffect(() => {
    callbacks.current = { onChange, onSave, onFormat }
  }, [onChange, onSave, onFormat])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount || !activeFile) return

    const dark = document.documentElement.classList.contains('dark')
    const state =
      statesRef.current.get(activeFile.path) ??
      EditorState.create({
        doc: activeFile.content,
        extensions: [
          basicSetup,
          EditorState.tabSize.of(settings.tabSize),
          settings.wordWrap ? EditorView.lineWrapping : [],
          ...languageExtensionForPath(activeFile.path),
          dark ? oneDark : [],
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                callbacks.current.onSave(activeFile.path)
                return true
              },
            },
            {
              key: 'Shift-Alt-f',
              run: () => {
                callbacks.current.onFormat(activeFile.path)
                return true
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            statesRef.current.set(activeFile.path, update.state)
            if (applyingRef.current) return
            callbacks.current.onChange(
              activeFile.path,
              update.state.doc.toString()
            )
          }),
        ],
      })

    const view = new EditorView({ state, parent: mount })
    viewRef.current = view

    return () => {
      statesRef.current.set(activeFile.path, view.state)
      view.destroy()
      viewRef.current = null
    }
  }, [activeFile?.path, activeFile?.language, settings.tabSize, settings.wordWrap])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !activeFile) return
    const current = view.state.doc.toString()
    if (current === activeFile.content) return

    applyingRef.current = true
    view.dispatch({
      changes: { from: 0, to: current.length, insert: activeFile.content },
    })
    applyingRef.current = false
  }, [activeFile?.content, activeFile?.path])

  useEffect(() => {
    const view = viewRef.current
    if (!view || !reveal || reveal.path !== activeFile?.path) return

    const lineNumber = Math.max(1, Math.min(reveal.line, view.state.doc.lines))
    const line = view.state.doc.line(lineNumber)
    const position = Math.min(
      line.to,
      line.from + Math.max(0, reveal.column - 1)
    )
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'center' }),
    })
    view.focus()
  }, [reveal, activeFile?.path])

  return (
    <div className='flex h-full min-h-0 min-w-0 flex-col bg-background'>
      <div className='flex h-9 shrink-0 items-end overflow-x-auto border-b bg-muted/30 no-scrollbar'>
        {files.map((file) => {
          const dirty = file.content !== file.original
          const active = file.path === activePath
          return (
            <div
              key={file.path}
              role='tab'
              aria-selected={active}
              onClick={() => onSelect(file.path)}
              className={`group flex h-8 max-w-[220px] shrink-0 cursor-pointer items-center gap-2 border-r px-3 text-[11px] ${
                active
                  ? 'border-t border-t-sky-500 bg-background text-foreground'
                  : 'border-transparent text-muted-foreground hover:bg-accent/50'
              }`}
            >
              <span className='min-w-0 flex-1 truncate'>{file.name}</span>
              {dirty ? (
                <span className='size-1.5 shrink-0 rounded-full bg-amber-400' />
              ) : null}
              <button
                type='button'
                aria-label={`Tutup ${file.name}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(file.path)
                }}
                className='rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100'
              >
                <X className='size-3' />
              </button>
            </div>
          )
        })}
      </div>

      {activeFile ? (
        <>
          <div className='flex h-7 shrink-0 items-center gap-1 border-b px-3 text-[10px] text-muted-foreground'>
            <span className='truncate'>
              {root ? root.replace(/\\/g, '/') : 'Tanpa folder'}
            </span>
            <span>/</span>
            <span className='min-w-0 flex-1 truncate text-foreground/80'>
              {relativePath(root, activeFile.path)}
            </span>
            <span className='shrink-0 rounded bg-muted px-1.5 py-0.5'>
              {activeFile.language}
            </span>
          </div>
          <div ref={mountRef} className='ide-codemirror min-h-0 flex-1 overflow-hidden' />
        </>
      ) : (
        <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-auto px-6 py-8'>
          <div className='max-w-xl text-center'>
            <div className='mx-auto flex size-11 items-center justify-center rounded-lg border bg-muted/40'>
              <FileCode2 className='size-5 text-muted-foreground' />
            </div>
            <h2 className='mt-3 text-sm font-semibold'>Belum ada file dibuka</h2>
            <p className='mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground'>
              Pilih file dari Explorer atau tekan shortcut berikut untuk mulai bekerja
              di folder workspace.
            </p>
            <div className='mt-3 flex justify-center'>
              <ShortcutKeys keys={['Ctrl', 'P']} />
            </div>
          </div>
          <div className='grid w-full max-w-2xl gap-2 text-left sm:grid-cols-2'>
            {editorShortcuts.map((shortcut) => {
              const Icon = shortcut.icon
              return (
                <div
                  key={shortcut.label}
                  className='rounded-lg border bg-secondary/50 p-3'
                >
                  <div className='flex items-center gap-2'>
                    <span className='flex size-7 items-center justify-center rounded-md bg-background/70'>
                      <Icon className='size-3.5 text-muted-foreground' />
                    </span>
                    <span className='text-[11px] font-medium'>{shortcut.label}</span>
                  </div>
                  <div className='mt-2'>
                    <ShortcutKeys keys={shortcut.keys} />
                  </div>
                  <p className='mt-2 text-[10px] leading-relaxed text-muted-foreground'>
                    {shortcut.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
