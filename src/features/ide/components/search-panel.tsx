import { useEffect, useMemo, useRef, useState } from 'react'
import { CaseSensitive, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchIdeText, type IdeTextMatch } from '@/lib/fs'
import { MaterialIcon } from '../lib/material-icons'
import { useIdeStore } from '../store'

type SearchPanelProps = {
  focusSignal: number
  onOpenResult: (path: string, line: number, column: number) => void
}

type ResultGroup = {
  path: string
  label: string
  matches: IdeTextMatch[]
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

export function SearchPanel({ focusSignal, onOpenResult }: SearchPanelProps) {
  const root = useIdeStore((state) => state.root)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<IdeTextMatch[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (focusSignal > 0) inputRef.current?.focus()
  }, [focusSignal])

  useEffect(() => {
    if (!root || !query.trim()) {
      const frame = requestAnimationFrame(() => {
        setResults([])
        setLoading(false)
      })
      return () => cancelAnimationFrame(frame)
    }

    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchIdeText(root, query, caseSensitive, 200).then((items) => {
        if (!active) return
        setResults(items)
        setLoading(false)
      })
    }, 220)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [root, query, caseSensitive])

  const groups = useMemo(() => {
    const map = new Map<string, ResultGroup>()
    for (const match of results) {
      const group = map.get(match.path) ?? {
        path: match.path,
        label: relativePath(root, match.path),
        matches: [],
      }
      group.matches.push(match)
      map.set(match.path, group)
    }
    return [...map.values()]
  }, [results, root])

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='space-y-2 border-b p-2'>
        <div className='relative'>
          <Search className='absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder='Cari teks di workspace'
            aria-label='Cari teks di workspace'
            className='h-8 pl-7 pr-7 text-xs'
          />
          {query && (
            <button
              type='button'
              aria-label='Hapus pencarian'
              onClick={() => setQuery('')}
              className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
            >
              <X className='size-3.5' />
            </button>
          )}
        </div>
        <div className='flex items-center justify-between text-[10px] text-muted-foreground'>
          <Button
            type='button'
            variant={caseSensitive ? 'secondary' : 'ghost'}
            size='sm'
            className='h-6 px-2 text-[10px]'
            onClick={() => setCaseSensitive((value) => !value)}
          >
            <CaseSensitive className='size-3' />
            Aa
          </Button>
          <span>
            {loading ? 'Mencari...' : `${results.length} hasil`}
          </span>
        </div>
      </div>

      <div className='min-h-0 flex-1 overflow-auto'>
        {!root ? (
          <div className='p-3 text-[11px] text-muted-foreground'>
            Buka folder terlebih dahulu.
          </div>
        ) : groups.length === 0 ? (
          <div className='p-3 text-[11px] text-muted-foreground'>
            {query.trim() ? 'Tidak ada hasil.' : 'Ketik untuk mencari teks.'}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.path} className='border-b last:border-b-0'>
              <div className='flex items-center gap-1.5 bg-muted/40 px-2 py-1 text-[11px]'>
                <MaterialIcon
                  name={group.label.split(/[/\\]/).pop() ?? group.label}
                />
                <span className='min-w-0 flex-1 truncate'>{group.label}</span>
                <span className='text-[10px] text-muted-foreground'>
                  {group.matches.length}
                </span>
              </div>
              {group.matches.map((match) => (
                <button
                  key={`${match.path}:${match.line}:${match.column}`}
                  type='button'
                  onClick={() =>
                    onOpenResult(match.path, match.line, match.column)
                  }
                  className='flex w-full gap-2 px-2 py-1 text-left text-[11px] hover:bg-accent/60'
                >
                  <span className='shrink-0 text-muted-foreground'>
                    {match.line}
                  </span>
                  <span className='min-w-0 flex-1 truncate'>
                    {match.preview.trim() || ' '}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
