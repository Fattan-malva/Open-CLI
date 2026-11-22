import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import {
  ChevronRight,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  createIdeEntry,
  deleteIdeEntry,
  listIdeDir,
  renameIdeEntry,
  type IdeDirEntry,
} from '@/lib/fs'
import { MaterialIcon } from '../lib/material-icons'
import { useIdeStore } from '../store'

type ExplorerProps = {
  onOpenFile: (path: string) => void
  onOpenFolder: () => void
}

type Pending = {
  mode: 'file' | 'folder' | 'rename'
  parent: string
  path?: string
  value: string
  depth: number
}

type Menu = {
  x: number
  y: number
  entry: IdeDirEntry | null
  parent: string
  depth: number
  createParent: string
  createDepth: number
}

function errorMessage(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, ' ')
    .trim()
  return message.length > 160 ? `${message.slice(0, 157)}...` : message
}

function InlineNameInput({
  depth,
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder,
  selectBaseName,
}: {
  depth: number
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  placeholder: string
  selectBaseName?: boolean
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    onCommit()
  }

  return (
    <form
      className='flex h-6 items-center gap-1 pr-2'
      style={{ paddingLeft: 8 + depth * 14 }}
      onSubmit={submit}
    >
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          if (!selectBaseName) return
          const dot = event.currentTarget.value.lastIndexOf('.')
          event.currentTarget.setSelectionRange(
            0,
            dot > 0 ? dot : event.currentTarget.value.length
          )
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') onCancel()
        }}
        className='h-5 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-[11px] outline-none'
      />
    </form>
  )
}

function TreeNode({
  entry,
  parent,
  depth,
  entriesByFolder,
  loadingFolders,
  pending,
  onToggle,
  onOpenFile,
  onContextMenu,
  onPendingChange,
  onCommit,
  onCancel,
}: {
  entry: IdeDirEntry
  parent: string
  depth: number
  entriesByFolder: Record<string, IdeDirEntry[]>
  loadingFolders: string[]
  pending: Pending | null
  onToggle: () => void
  onOpenFile: (path: string) => void
  onContextMenu: (
    event: ReactMouseEvent,
    entry: IdeDirEntry,
    parent: string,
    depth: number
  ) => void
  onPendingChange: (pending: Pending | null) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const expandedFolders = useIdeStore((state) => state.expandedFolders)
  const activePath = useIdeStore((state) => state.activePath)
  const isFolder = entry.kind === 'folder'
  const children = entriesByFolder[entry.path]
  const loading = loadingFolders.includes(entry.path)
  const expanded = expandedFolders.includes(entry.path)
  const selected = activePath === entry.path
  const renaming =
    pending?.mode === 'rename' && pending.path === entry.path
  const creatingInside =
    isFolder &&
    pending?.parent === entry.path &&
    (pending.mode === 'file' || pending.mode === 'folder')

  return (
    <div>
      {renaming && pending ? (
        <InlineNameInput
          depth={depth}
          value={pending.value}
          placeholder={
            isFolder ? 'Nama folder baru' : 'Nama file (termasuk ekstensi)'
          }
          selectBaseName={!isFolder}
          onChange={(value) => onPendingChange({ ...pending, value })}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      ) : (
        <button
          type='button'
          onClick={() => (isFolder ? onToggle() : onOpenFile(entry.path))}
          onContextMenu={(event) => onContextMenu(event, entry, parent, depth)}
          style={{ paddingLeft: 8 + depth * 14 }}
          className={`flex h-6 w-full items-center gap-1 pr-2 text-left text-[11px] transition-colors ${
            selected
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
          }`}
        >
          {isFolder ? (
            <ChevronRight
              className={`size-3 shrink-0 transition-transform ${
                expanded ? 'rotate-90' : ''
              }`}
            />
          ) : (
            <span className='size-3 shrink-0' />
          )}
          <MaterialIcon
            name={entry.name}
            isFolder={isFolder}
            expanded={expanded}
            className='size-4'
          />
          <span className='min-w-0 flex-1 truncate'>{entry.name}</span>
        </button>
      )}
      {isFolder && expanded && (
        <div>
          {creatingInside && pending && (
            <InlineNameInput
              depth={depth + 1}
              value={pending.value}
                placeholder={
                  pending.mode === 'file'
                    ? 'Nama file (termasuk ekstensi)'
                    : 'Nama folder'
                }
              onChange={(value) => onPendingChange({ ...pending, value })}
              onCommit={onCommit}
              onCancel={onCancel}
            />
          )}
          {loading ? (
            <div
              style={{ paddingLeft: 22 + depth * 14 }}
              className='py-1 text-[10px] text-muted-foreground'
            >
              Memuat...
            </div>
          ) : children?.length ? (
            children.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                parent={entry.path}
                depth={depth + 1}
                entriesByFolder={entriesByFolder}
                loadingFolders={loadingFolders}
                pending={pending}
                onToggle={() => useIdeStore.getState().toggleFolder(child.path)}
                onOpenFile={onOpenFile}
                onContextMenu={onContextMenu}
                onPendingChange={onPendingChange}
                onCommit={onCommit}
                onCancel={onCancel}
              />
            ))
          ) : (
            <div
              style={{ paddingLeft: 22 + depth * 14 }}
              className='py-1 text-[10px] text-muted-foreground'
            >
              Folder kosong
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function Explorer({ onOpenFile, onOpenFolder }: ExplorerProps) {
  const root = useIdeStore((state) => state.root)
  const expandedFolders = useIdeStore((state) => state.expandedFolders)
  const toggleFolder = useIdeStore((state) => state.toggleFolder)
  const [entriesByFolder, setEntriesByFolder] = useState<
    Record<string, IdeDirEntry[]>
  >({})
  const [loadingFolders, setLoadingFolders] = useState<string[]>([])
  const [refreshToken, setRefreshToken] = useState(0)
  const [pending, setPending] = useState<Pending | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const loadFolder = useCallback(async (path: string) => {
    await Promise.resolve()
    setLoadingFolders((current) =>
      current.includes(path) ? current : [...current, path]
    )
    const entries = await listIdeDir(path)
    setEntriesByFolder((current) => ({ ...current, [path]: entries }))
    setLoadingFolders((current) => current.filter((item) => item !== path))
  }, [])

  const refresh = useCallback(() => {
    setEntriesByFolder({})
    setRefreshToken((value) => value + 1)
  }, [])

  const expandFolder = useCallback((path: string) => {
    const store = useIdeStore.getState()
    if (!store.expandedFolders.includes(path)) store.toggleFolder(path)
  }, [])

  useEffect(() => {
    if (!root) return
    const frame = requestAnimationFrame(() => void loadFolder(root))
    return () => cancelAnimationFrame(frame)
  }, [root, refreshToken, loadFolder])

  useEffect(() => {
    if (!root) return
    const frame = requestAnimationFrame(() => {
      for (const path of expandedFolders) {
        if (!entriesByFolder[path]) void loadFolder(path)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [expandedFolders, entriesByFolder, root, loadFolder])

  useEffect(() => {
    if (!menu) return
    const close = (event: Event) => {
      const target = event.target
      if (
        event.type === 'pointerdown' &&
        target instanceof Node &&
        menuRef.current?.contains(target)
      ) {
        return
      }
      setMenu(null)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('keydown', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('keydown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [menu])

  const startCreate = useCallback(
    (parent: string, mode: 'file' | 'folder', depth: number) => {
      if (!root) return
      setMenu(null)
      setPending({ mode, parent, value: '', depth })
      expandFolder(parent)
    },
    [expandFolder, root]
  )

  const startRename = useCallback((entry: IdeDirEntry, depth: number) => {
    setMenu(null)
    setPending({
      mode: 'rename',
      parent: entry.path,
      path: entry.path,
      value: entry.name,
      depth,
    })
  }, [])

  const commitPending = useCallback(async () => {
    if (!root || !pending) return
    const name = pending.value.trim()
    if (!name) {
      toast.error('Nama tidak boleh kosong.')
      return
    }
    try {
      if (pending.mode === 'rename' && pending.path) {
        const nextPath = await renameIdeEntry(root, pending.path, name)
        useIdeStore.getState().renamePath(pending.path, nextPath)
        toast.success('Berhasil mengganti nama.')
      } else {
        const kind: 'file' | 'folder' = pending.mode === 'file' ? 'file' : 'folder'
        const nextPath = await createIdeEntry(root, pending.parent, name, kind)
        if (kind === 'file') onOpenFile(nextPath)
        else expandFolder(nextPath)
        toast.success(kind === 'file' ? 'File dibuat.' : 'Folder dibuat.')
      }
      setPending(null)
      refresh()
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }, [expandFolder, onOpenFile, pending, refresh, root])

  const removeEntry = useCallback(
    async (entry: IdeDirEntry) => {
      if (!root) return
      const label = entry.kind === 'folder' ? 'folder' : 'file'
      if (!window.confirm(`Hapus ${label} "${entry.name}"?`)) return
      try {
        await deleteIdeEntry(root, entry.path)
        useIdeStore.getState().removePath(entry.path)
        toast.success(`${label[0].toUpperCase()}${label.slice(1)} dihapus.`)
        setPending(null)
        refresh()
      } catch (error) {
        toast.error(errorMessage(error))
      }
    },
    [refresh, root]
  )

  const openContextMenu = useCallback(
    (
      event: ReactMouseEvent,
      entry: IdeDirEntry | null,
      parent: string,
      depth: number
    ) => {
      event.preventDefault()
      event.stopPropagation()
      setPending(null)
      const folderTarget = entry?.kind === 'folder'
      setMenu({
        x: event.clientX,
        y: event.clientY,
        entry,
        parent,
        depth,
        createParent: folderTarget ? entry.path : parent,
        createDepth: folderTarget ? depth + 1 : depth,
      })
    },
    []
  )

  const rootEntries = root ? (entriesByFolder[root] ?? []) : []
  const rootName = useMemo(() => {
    if (!root) return 'Belum ada folder'
    return root.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? root
  }, [root])

  const menuParent = menu?.createParent ?? root
  const menuCreateDepth = menu?.createDepth ?? 0
  const menuEntry = menu?.entry ?? null

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='flex h-8 shrink-0 items-center gap-1 border-b px-2'>
        <span className='min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
          {rootName}
        </span>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-6'
          aria-label='File baru'
          title='File baru'
          disabled={!root}
          onClick={() => startCreate(root ?? '', 'file', 0)}
        >
          <FilePlus2 className='size-3.5' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-6'
          aria-label='Folder baru'
          title='Folder baru'
          disabled={!root}
          onClick={() => startCreate(root ?? '', 'folder', 0)}
        >
          <FolderPlus className='size-3.5' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-6'
          aria-label='Muat ulang folder'
          disabled={!root}
          onClick={refresh}
        >
          <RefreshCw className='size-3' />
        </Button>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-6'
          aria-label='Buka folder'
          onClick={onOpenFolder}
        >
          <FolderOpen className='size-3.5' />
        </Button>
      </div>
      <div
        className='min-h-0 flex-1 overflow-auto py-1'
        onContextMenu={(event) =>
          root && openContextMenu(event, null, root, 0)
        }
      >
        {!root ? (
          <div className='px-3 py-4 text-[11px] leading-relaxed text-muted-foreground'>
            Belum ada folder workspace.
            <button
              type='button'
              onClick={onOpenFolder}
              className='mt-2 block text-left text-sky-400 hover:underline'
            >
              Buka folder...
            </button>
          </div>
        ) : rootEntries.length === 0 && !pending ? (
          <div className='px-3 py-4 text-[11px] text-muted-foreground'>
            Memuat atau folder kosong.
          </div>
        ) : (
          <>
            {pending?.parent === root && pending.mode !== 'rename' && (
              <InlineNameInput
                depth={0}
                value={pending.value}
              placeholder={
                pending.mode === 'file'
                  ? 'Nama file (termasuk ekstensi)'
                  : 'Nama folder'
              }
                onChange={(value) => setPending({ ...pending, value })}
                onCommit={() => void commitPending()}
                onCancel={() => setPending(null)}
              />
            )}
            {rootEntries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                parent={root}
                depth={0}
                entriesByFolder={entriesByFolder}
                loadingFolders={loadingFolders}
                pending={pending}
                onToggle={() => toggleFolder(entry.path)}
                onOpenFile={onOpenFile}
                onContextMenu={openContextMenu}
                onPendingChange={setPending}
                onCommit={() => void commitPending()}
                onCancel={() => setPending(null)}
              />
            ))}
          </>
        )}
      </div>
      {menu && (
        <div
          ref={menuRef}
          role='menu'
          className='fixed z-[120] w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-lg'
          style={{
            left: Math.min(menu.x, Math.max(0, window.innerWidth - 168)),
            top: Math.min(menu.y, Math.max(0, window.innerHeight - 160)),
          }}
        >
          <button
            type='button'
            role='menuitem'
            className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent'
            onClick={() => {
              if (menuParent) startCreate(menuParent, 'file', menuCreateDepth)
            }}
          >
            <FilePlus2 className='size-3.5' />
            File baru
          </button>
          <button
            type='button'
            role='menuitem'
            className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent'
            onClick={() => {
              if (menuParent) startCreate(menuParent, 'folder', menuCreateDepth)
            }}
          >
            <FolderPlus className='size-3.5' />
            Folder baru
          </button>
          {menuEntry && (
            <>
              <div className='my-1 h-px bg-border' />
              <button
                type='button'
                role='menuitem'
                className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent'
                onClick={() => startRename(menuEntry, menu.depth)}
              >
                <Pencil className='size-3.5' />
                Ganti nama
              </button>
              <button
                type='button'
                role='menuitem'
                className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10'
                onClick={() => {
                  const entry = menuEntry
                  setMenu(null)
                  void removeEntry(entry)
                }}
              >
                <Trash2 className='size-3.5' />
                Hapus
              </button>
            </>
          )}
          <div className='my-1 h-px bg-border' />
          <button
            type='button'
            role='menuitem'
            className='flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent'
            onClick={() => {
              setMenu(null)
              refresh()
            }}
          >
            <RefreshCw className='size-3.5' />
            Muat ulang
          </button>
        </div>
      )}
    </div>
  )
}
