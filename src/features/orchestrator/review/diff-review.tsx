import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import * as api from '../api'
import type { AgentSessionValue, TaskValue } from '../types'
import {
  formatReviewNotes,
  noteTargetFor,
  parseUnifiedDiff,
  type DiffLine,
  type ReviewNote,
} from './diff'

type Props = {
  task: TaskValue
  agents: AgentSessionValue[]
  onClose: () => void
}

const LINE_CLASS: Record<DiffLine['kind'], string> = {
  add: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  del: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  context: '',
  hunk: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  meta: 'text-muted-foreground',
}

function pickDefaultAgent(agents: AgentSessionValue[]): string {
  return (agents.find((agent) => agent.status === 'idle') ?? agents[0])?.id ?? ''
}

export function DiffReview({ task, agents, onClose }: Props) {
  const [diffText, setDiffText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<ReviewNote[]>([])
  const [activeLine, setActiveLine] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [agentId, setAgentId] = useState(() => pickDefaultAgent(agents))
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!task.workspaceId) return
    api
      .workspaceDiff(task.workspaceId)
      .then((text) => {
        if (!cancelled) setDiffText(text)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [task.workspaceId])

  const shownError = task.workspaceId ? error : 'Task ini belum punya workspace.'

  const files = useMemo(() => (diffText ? parseUnifiedDiff(diffText) : []), [diffText])

  const addNote = () => {
    const text = noteText.trim()
    const line = files.flatMap((file) => file.lines).find((item) => item.key === activeLine)
    const target = line ? noteTargetFor(line) : null
    if (!text || !target) return
    setNotes((current) => [...current, { ...target, id: `${target.file}:${target.side}:${target.line}:${current.length}`, text }])
    setNoteText('')
    setActiveLine(null)
  }

  const send = async () => {
    if (!agentId || notes.length === 0 || sending) return
    setSending(true)
    try {
      await api.sendPrompt(agentId, formatReviewNotes(notes, task.title))
      toast.success('Catatan dikirim ke agent.')
      setNotes([])
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Gagal mengirim catatan.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className='flex min-h-0 flex-1 flex-col gap-3 p-4'>
      <div className='flex items-center gap-2'>
        <Button variant='ghost' size='icon' className='size-7' aria-label='Kembali' onClick={onClose}>
          <ArrowLeft className='size-4' />
        </Button>
        <h2 className='min-w-0 flex-1 truncate text-base font-semibold'>Tinjau: {task.title}</h2>
        <Button variant='ghost' size='icon' className='size-7' aria-label='Tutup tinjauan' onClick={onClose}>
          <X className='size-4' />
        </Button>
      </div>

      {shownError && <p className='rounded-md border border-destructive/40 p-2 text-xs text-destructive'>{shownError}</p>}
      {diffText === null && !shownError && <p className='text-xs text-muted-foreground'>Memuat diff…</p>}
      {diffText !== null && files.length === 0 && (
        <p className='text-xs text-muted-foreground'>Tidak ada perubahan pada workspace ini.</p>
      )}

      <div className='grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]'>
        <div className='min-h-0 overflow-auto rounded-md border font-mono text-xs'>
          {files.map((file) => (
            <div key={file.path}>
              <div className='sticky top-0 border-b bg-muted px-3 py-1 font-semibold'>{file.path}</div>
              {file.lines.map((line) => {
                const target = noteTargetFor(line)
                const noteable = target !== null
                return (
                  <div key={line.key}>
                    <button
                      type='button'
                      disabled={!noteable}
                      onClick={() => setActiveLine(line.key)}
                      className={`flex w-full gap-2 px-3 py-0.5 text-left ${LINE_CLASS[line.kind]} ${noteable ? 'hover:bg-accent' : ''}`}
                    >
                      <span className='w-10 shrink-0 text-right text-muted-foreground'>
                        {line.newLine ?? line.oldLine ?? ''}
                      </span>
                      <span className='whitespace-pre'>{line.text || ' '}</span>
                    </button>
                    {activeLine === line.key && (
                      <div className='flex gap-2 bg-background p-2'>
                        <textarea
                          autoFocus
                          rows={2}
                          value={noteText}
                          placeholder='Tulis catatan untuk baris ini'
                          onChange={(event) => setNoteText(event.target.value)}
                          className='min-h-12 flex-1 resize-none rounded-md border bg-background p-2 font-sans text-sm'
                        />
                        <div className='flex flex-col gap-1'>
                          <Button size='sm' disabled={!noteText.trim()} onClick={addNote}>
                            Simpan
                          </Button>
                          <Button size='sm' variant='ghost' onClick={() => setActiveLine(null)}>
                            Batal
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <aside className='flex min-h-0 flex-col gap-2 rounded-md border p-3 text-xs'>
          <h3 className='font-semibold'>Catatan ({notes.length})</h3>
          <div className='min-h-0 flex-1 space-y-2 overflow-y-auto'>
            {notes.length === 0 && <p className='text-muted-foreground'>Klik baris diff untuk menambah catatan.</p>}
            {notes.map((note) => (
              <div key={note.id} className='rounded-md bg-muted/50 p-2'>
                <div className='flex items-center gap-2 text-muted-foreground'>
                  <span className='min-w-0 flex-1 truncate'>
                    {note.file}:{note.line}
                  </span>
                  <button
                    type='button'
                    aria-label='Hapus catatan'
                    className='text-destructive'
                    onClick={() => setNotes((current) => current.filter((item) => item.id !== note.id))}
                  >
                    <X className='size-3' />
                  </button>
                </div>
                <p className='mt-1 whitespace-pre-wrap'>{note.text}</p>
              </div>
            ))}
          </div>
          <label className='flex flex-col gap-1'>
            <span className='text-muted-foreground'>Kirim ke agent</span>
            <select
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              className='rounded-md border bg-background p-1'
            >
              {agents.length === 0 && <option value=''>Tidak ada agent</option>}
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label} ({agent.status})
                </option>
              ))}
            </select>
          </label>
          <Button disabled={!agentId || notes.length === 0 || sending} onClick={() => void send()}>
            <Send className='size-3.5' /> Kirim {notes.length} catatan
          </Button>
        </aside>
      </div>
    </section>
  )
}
