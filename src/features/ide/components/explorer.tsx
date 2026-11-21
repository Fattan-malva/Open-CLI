import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, FolderOpen, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listIdeDir, type IdeDirEntry } from '@/lib/fs'
import { MaterialIcon } from '../lib/material-icons'
import { useIdeStore } from '../store'

type ExplorerProps = {
  onOpenFile: (path: string) => void
  onOpenFolder: () => void
}

function TreeNode({
  entry,
  depth,
  entriesByFolder,
  loadingFolders,
  onToggle,
  onOpenFile,
}: {
  entry: IdeDirEntry
  depth: number
  entriesByFolder: Record<string, IdeDirEntry[]>
  loadingFolders: string[]
  onToggle: () => void
  onOpenFile: (path: string) => void
}) {
  const expandedFolders = useIdeStore((state) => state.expandedFolders)
  const activePath = useIdeStore((state) => state.activePath)
  const isFolder = entry.kind === 'folder'
  const children = entriesByFolder[entry.path]
  const loading = loadingFolders.includes(entry.path)
  const expanded = expandedFolders.includes(entry.path)
  const selected = activePath === entry.path

  return (
    <div>
      <button
        type='button'
        onClick={() => (isFolder ? onToggle() : onOpenFile(entry.path))}
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
      {isFolder && expanded && (
        <div>
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
                depth={depth + 1}
                entriesByFolder={entriesByFolder}
                loadingFolders={loadingFolders}
                onToggle={() => useIdeStore.getState().toggleFolder(child.path)}
                onOpenFile={onOpenFile}
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

  const loadFolder = useCallback(async (path: string) => {
    await Promise.resolve()
    setLoadingFolders((current) =>
      current.includes(path) ? current : [...current, path]
    )
    const entries = await listIdeDir(path)
    setEntriesByFolder((current) => ({ ...current, [path]: entries }))
    setLoadingFolders((current) => current.filter((item) => item !== path))
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

  const rootEntries = root ? (entriesByFolder[root] ?? []) : []
  const rootName = useMemo(() => {
    if (!root) return 'Belum ada folder'
    return root.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? root
  }, [root])

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
          aria-label='Muat ulang folder'
          disabled={!root}
          onClick={() => setRefreshToken((value) => value + 1)}
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
      <div className='min-h-0 flex-1 overflow-auto py-1'>
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
        ) : rootEntries.length === 0 ? (
          <div className='px-3 py-4 text-[11px] text-muted-foreground'>
            Memuat atau folder kosong.
          </div>
        ) : (
          rootEntries.map((entry) => (
            <TreeNode
              key={entry.path}
              entry={entry}
              depth={0}
              entriesByFolder={entriesByFolder}
              loadingFolders={loadingFolders}
              onToggle={() => toggleFolder(entry.path)}
              onOpenFile={onOpenFile}
            />
          ))
        )}
      </div>
    </div>
  )
}
