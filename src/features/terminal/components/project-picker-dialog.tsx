import { useEffect, useState } from 'react'
import { ArrowLeft, Check, ChevronRight, Folder, HardDrive, LoaderCircle, Search } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listDrives, listFolders, type FsEntry } from '@/lib/fs'
import { cn } from '@/lib/utils'

type ProjectPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string | null
  onSelect: (path: string | null) => void
}

export function ProjectPickerDialog({
  open,
  onOpenChange,
  value,
  onSelect,
}: ProjectPickerDialogProps) {
  const [drives, setDrives] = useState<FsEntry[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [folders, setFolders] = useState<FsEntry[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentPath = history[history.length - 1] ?? null

  useEffect(() => {
    if (!open) return

    let alive = true

    void Promise.resolve().then(() => {
      if (!alive) return
      setLoading(true)
      setError(null)
      setQuery('')

      void listDrives().then((items) => {
        if (!alive) return
        setDrives(items)
        setHistory(value ? [value] : [])
        setLoading(false)
      })
    })

    return () => {
      alive = false
    }
  }, [open, value])

  useEffect(() => {
    if (!open || !currentPath) {
      queueMicrotask(() => setFolders([]))
      return
    }

    let alive = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      void listFolders(currentPath, query).then((items) => {
        if (!alive) return
        setFolders(items)
        setError(items.length === 0 && query.trim() ? 'Folder tidak ditemukan.' : null)
        setLoading(false)
      })
    }, query ? 160 : 0)

    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [currentPath, open, query])

  const finish = (path: string | null) => {
    onSelect(path)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl gap-0 overflow-hidden p-0'>
        <DialogHeader className='border-b px-5 py-4'>
          <DialogTitle>Pilih folder project</DialogTitle>
          <DialogDescription>
            Pilih partisi lalu telusuri folder. Terminal baru akan berjalan di folder
            yang dipilih.
          </DialogDescription>
        </DialogHeader>

        <div className='flex items-center gap-2 border-b px-5 py-3'>
          {currentPath ? (
            <Button
              variant='ghost'
              size='icon'
              className='size-7 shrink-0'
              onClick={() => setHistory((items) => items.slice(0, -1))}
              aria-label='Kembali'
            >
              <ArrowLeft className='size-4' />
            </Button>
          ) : null}

          <div className='flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs text-muted-foreground'>
            <button
              type='button'
              className='shrink-0 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground'
              onClick={() => setHistory([])}
            >
              Partisi
            </button>
            {history.map((part, index) => (
              <span key={`${part}-${index}`} className='flex min-w-0 items-center gap-1'>
                <ChevronRight className='size-3 shrink-0' />
                <button
                  type='button'
                  className='truncate rounded px-1 py-0.5 hover:bg-accent hover:text-foreground'
                  onClick={() => setHistory((items) => items.slice(0, index + 1))}
                >
                  {part.split(/[\\/]/).filter(Boolean).pop() ?? part}
                </button>
              </span>
            ))}
          </div>
        </div>

        {currentPath ? (
          <div className='px-5 pt-3'>
            <div className='relative'>
              <Search className='absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Cari folder...'
                className='h-9 pl-8 text-xs'
              />
            </div>
          </div>
        ) : null}

        <div className='no-scrollbar max-h-[46vh] min-h-56 overflow-y-auto px-3 py-3'>
          {loading ? (
            <div className='flex h-48 items-center justify-center gap-2 text-xs text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' />
              Memuat...
            </div>
          ) : !currentPath ? (
            <div className='space-y-1'>
              {drives.length === 0 ? (
                <p className='p-6 text-center text-xs text-muted-foreground'>
                  Tidak ada partisi yang dapat dibaca.
                </p>
              ) : (
                drives.map((drive) => (
                  <button
                    key={drive.path}
                    type='button'
                    onClick={() => setHistory([drive.path])}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left text-sm transition hover:border-border hover:bg-muted',
                      value === drive.path && 'border-primary/40 bg-primary/5'
                    )}
                  >
                    <span className='flex size-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground'>
                      <HardDrive className='size-4' />
                    </span>
                    <span className='flex-1 font-medium'>{drive.name}</span>
                    <ChevronRight className='size-4 text-muted-foreground' />
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className='space-y-1'>
              {folders.map((folder) => (
                <div
                  key={folder.path}
                  className='group flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 hover:border-border hover:bg-muted'
                >
                  <button
                    type='button'
                    className='flex min-w-0 flex-1 items-center gap-3 px-1 py-1.5 text-left'
                    onClick={() => setHistory((items) => [...items, folder.path])}
                  >
                    <span className='flex size-8 items-center justify-center rounded-md bg-secondary text-secondary-foreground'>
                      <Folder className='size-4' />
                    </span>
                    <span className='truncate text-sm font-medium'>{folder.name}</span>
                  </button>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 gap-1 px-2 text-[11px] opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100'
                    onClick={() => finish(folder.path)}
                  >
                    <Check className='size-3.5' />
                    Pilih
                  </Button>
                </div>
              ))}
              {error ? (
                <p className='p-6 text-center text-xs text-muted-foreground'>{error}</p>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter className='border-t px-5 py-3'>
          <DialogClose asChild>
            <Button variant='ghost' size='sm' onClick={() => finish(null)}>
              Lewati, pakai root
            </Button>
          </DialogClose>
          {currentPath ? (
            <Button size='sm' onClick={() => finish(currentPath)}>
              <Check className='size-3.5' />
              Pilih folder ini
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
