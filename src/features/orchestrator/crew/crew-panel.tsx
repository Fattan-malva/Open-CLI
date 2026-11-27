import { useEffect, useMemo, useState } from 'react'
import { crewSnapshotNative, type CrewGroup, type CrewRowResult } from '../api'
import type { SnapshotValue } from '../types'
import { toCrewSource } from './source'

const GROUP_LABEL: Record<CrewGroup, string> = {
  needsYou: 'Perlu Anda',
  working: 'Bekerja',
  idle: 'Menunggu',
  failed: 'Gagal',
}
const GROUP_ORDER: CrewGroup[] = ['needsYou', 'working', 'idle', 'failed']

const SECTION_LABEL = {
  managedBy: 'Dikelola oleh',
  managing: 'Mengelola',
  talkingWith: 'Berbicara dengan',
} as const

function Row({ row }: { row: CrewRowResult }) {
  return (
    <div className='rounded-md bg-muted/50 p-2 text-xs'>
      <div className='flex items-center gap-2'>
        <span className='min-w-0 flex-1 truncate font-medium'>{row.label}</span>
        <span className='text-muted-foreground'>{row.status}</span>
      </div>
      {row.taskTitle && <p className='mt-0.5 truncate text-muted-foreground'>{row.taskTitle}</p>}
      {row.latest && <p className='mt-1 line-clamp-2 text-muted-foreground'>{row.latest.preview}</p>}
    </div>
  )
}

export function CrewPanel({ snapshot }: { snapshot: SnapshotValue }) {
  const source = useMemo(() => toCrewSource(snapshot), [snapshot])
  const coordinators = useMemo(
    () => [...new Set(snapshot.runs.map((run) => run.coordinatorId).filter((id): id is string => Boolean(id)))],
    [snapshot.runs]
  )
  const [party, setParty] = useState<string>('')
  const [result, setResult] = useState<Awaited<ReturnType<typeof crewSnapshotNative>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = party || coordinators[0] || snapshot.agents[0]?.id || ''

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    crewSnapshotNative(source, selected)
      .then((next) => {
        if (!cancelled) {
          setResult(next)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [source, selected])

  if (!selected) return <p className='text-xs text-muted-foreground'>Belum ada agent untuk crew.</p>

  return (
    <section className='rounded-md border'>
      <div className='flex items-center gap-2 border-b px-3 py-2 text-xs'>
        <span className='font-medium'>Crew</span>
        <span className='text-muted-foreground'>
          {result ? `${result.summary.agents} agent · ${result.summary.needsYou} perlu Anda` : ''}
        </span>
        <select
          aria-label='Pilih koordinator'
          value={selected}
          onChange={(event) => setParty(event.target.value)}
          className='ml-auto max-w-40 rounded-md border bg-background p-1'
        >
          {[...new Set([...coordinators, ...snapshot.agents.map((agent) => agent.id)])].map((id) => (
            <option key={id} value={id}>
              {snapshot.agents.find((agent) => agent.id === id)?.label ?? id}
            </option>
          ))}
        </select>
      </div>
      {error && <p className='p-2 text-xs text-destructive'>{error}</p>}
      {result && (
        <div className='space-y-3 p-2'>
          {(['managedBy', 'managing', 'talkingWith'] as const).map((section) => {
            const rows = result.sections[section]
            return (
              <div key={section} className='space-y-1'>
                <p className='px-1 text-xs font-semibold'>{SECTION_LABEL[section]}</p>
                {rows.length === 0 && <p className='px-1 text-xs text-muted-foreground'>Kosong.</p>}
                {GROUP_ORDER.map((group) => {
                  const grouped = rows.filter((row) => row.group === group)
                  if (grouped.length === 0) return null
                  return (
                    <div key={group} className='space-y-1'>
                      <p className='px-1 text-[11px] uppercase text-muted-foreground'>
                        {GROUP_LABEL[group]} · {grouped.length}
                      </p>
                      {grouped.map((row) => (
                        <Row key={`${section}:${row.partyKey}:${row.taskTitle ?? ''}`} row={row} />
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
