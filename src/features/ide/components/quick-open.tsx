import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { searchIdeFiles, type IdeFileMatch } from '@/lib/fs'
import { MaterialIcon } from '../lib/material-icons'
import { useIdeStore } from '../store'

type QuickOpenProps = {
  open: boolean
  onClose: () => void
  onOpenFile: (path: string) => void
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

export function QuickOpen({ open, onClose, onOpenFile }: QuickOpenProps) {
  const root = useIdeStore((state) => state.root)
  const files = useIdeStore((state) => state.files)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<IdeFileMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-ide-quick-open]')) onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !root || !query.trim()) {
      const frame = requestAnimationFrame(() => {
        setMatches([])
        setLoading(false)
      })
      return () => cancelAnimationFrame(frame)
    }

    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchIdeFiles(root, query, 150).then((items) => {
        if (!active) return
        setMatches(items)
        setSelected(0)
        setLoading(false)
      })
    }, 160)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [open, root, query])

  const items = useMemo(() => {
    if (query.trim()) return matches
    return files
      .slice()
      .reverse()
      .map((file) => ({ name: file.name, path: file.path }))
  }, [query, matches, files])

  const choose = (path: string) => {
    onOpenFile(path)
    onClose()
  }

  if (!open) return null

  return (
    <div
      data-ide-quick-open
      className='fixed inset-0 z-[80] flex items-start justify-center bg-black/40 pt-[12vh]'
    >
      <div className='w-full max-w-xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl'>
        <div className='flex h-11 items-center gap-2 border-b px-3'>
          <Search className='size-4 text-muted-foreground' />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelected((value) =>
                  items.length === 0 ? 0 : (value + 1) % items.length
                )
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelected((value) =>
                  items.length === 0
                    ? 0
                    : (value - 1 + items.length) % items.length
                )
              }
              if (event.key === 'Enter' && items[selected]) {
                event.preventDefault()
                choose(items[selected].path)
              }
            }}
            placeholder='Cari file berdasarkan nama atau path'
            aria-label='Cari file'
            className='h-full min-w-0 flex-1 bg-transparent text-sm outline-none'
          />
          <span className='text-[10px] text-muted-foreground'>
            {loading ? 'Mencari...' : `${items.length} file`}
          </span>
        </div>
        <div className='max-h-[50vh] overflow-auto py-1'>
          {items.length === 0 ? (
            <div className='px-3 py-3 text-xs text-muted-foreground'>
              {query.trim() ? 'Tidak ada file.' : 'Belum ada file dibuka.'}
            </div>
          ) : (
            items.map((item, index) => (
              <button
                key={item.path}
                type='button'
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(item.path)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
                  index === selected ? 'bg-accent' : 'hover:bg-accent/60'
                }`}
              >
                <MaterialIcon name={item.name} />
                <span className='min-w-0 flex-1 truncate'>
                  {item.name}
                </span>
                <span className='min-w-0 max-w-[55%] truncate text-[10px] text-muted-foreground'>
                  {relativePath(root, item.path)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
