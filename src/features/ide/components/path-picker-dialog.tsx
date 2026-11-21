import { useEffect, useMemo, useState } from 'react'
import { ArrowUp, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { listDrives, listIdeDir, type IdeDirEntry } from '@/lib/fs'
import { MaterialIcon } from '../lib/material-icons'

type PathPickerDialogProps = {
  open: boolean
  mode: 'file' | 'folder'
  initialPath?: string | null
  onClose: () => void
  onSelect: (path: string) => void
}

function parentPath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  if (/^[A-Za-z]:\/$/.test(normalized)) return ''
  const index = normalized.lastIndexOf('/')
  if (index <= 0) return ''
  const parent = normalized.slice(0, index)
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent
}

export function PathPickerDialog({
  open,
  mode,
  initialPath,
  onClose,
  onSelect,
}: PathPickerDialogProps) {
  const [current, setCurrent] = useState(initialPath ?? '')
  const [entries, setEntries] = useState<IdeDirEntry[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return

    let active = true
    void (async () => {
      await Promise.resolve()
      if (!active) return
      setLoading(true)
      const target = current.trim()
      if (!target) {
        const drives = await listDrives()
        if (active) {
          setEntries(drives.map((drive) => ({ ...drive, kind: 'folder', size: 0 })))
          setLoading(false)
        }
        return
      }
      const items = await listIdeDir(target)
      if (active) {
        setEntries(items)
        setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [open, current])

  const visibleEntries = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter((entry) => entry.name.toLowerCase().includes(needle))
  }, [entries, query])

  const handleEntry = (entry: IdeDirEntry) => {
    if (entry.kind === 'folder') {
      setCurrent(entry.path)
      return
    }
    if (mode === 'file') onSelect(entry.path)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className='flex h-[70vh] max-w-3xl flex-col'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'file' ? 'Buka file' : 'Buka folder'}
          </DialogTitle>
          <DialogDescription>
            Pilih path di komputer lokal. Folder berat seperti node_modules tidak
            ditampilkan saat pencarian.
          </DialogDescription>
        </DialogHeader>

        <div className='flex min-h-0 flex-1 flex-col gap-2'>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='icon'
              aria-label='Naik satu folder'
              onClick={() => setCurrent(parentPath(current))}
            >
              <ArrowUp className='size-4' />
            </Button>
            <Input
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              placeholder='Path folder'
              aria-label='Path folder'
            />
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Filter nama'
            aria-label='Filter nama'
          />
          <div className='min-h-0 flex-1 overflow-auto rounded-md border'>
            {loading ? (
              <div className='p-3 text-xs text-muted-foreground'>Memuat...</div>
            ) : visibleEntries.length === 0 ? (
              <div className='p-3 text-xs text-muted-foreground'>
                Tidak ada entri.
              </div>
            ) : (
              visibleEntries.map((entry) => (
                <button
                  key={entry.path}
                  type='button'
                  onClick={() => handleEntry(entry)}
                  onDoubleClick={() => {
                    if (entry.kind === 'folder' && mode === 'folder') {
                      onSelect(entry.path)
                    }
                  }}
                  className='flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent'
                >
                  <MaterialIcon
                    name={entry.name}
                    isFolder={entry.kind === 'folder'}
                  />
                  <span className='min-w-0 flex-1 truncate'>{entry.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type='button' variant='ghost' onClick={onClose}>
            Batal
          </Button>
          {mode === 'folder' && current.trim() && (
            <Button type='button' onClick={() => onSelect(current)}>
              <FolderOpen className='size-4' />
              Pilih folder ini
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
