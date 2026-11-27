import { useEffect, useState } from 'react'
import { RefreshCw, Send, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useOrchestratorStore } from '@/features/orchestrator/store'
import { DiffReview } from '@/features/orchestrator/review/diff-review'
import { CrewPanel } from '@/features/orchestrator/crew/crew-panel'
import type { TaskValue } from '@/features/orchestrator/types'

export function OrchestratorPanel() {
  const snapshot = useOrchestratorStore((state) => state.snapshot)
  const messages = useOrchestratorStore((state) => state.messages)
  const grants = useOrchestratorStore((state) => state.grants)
  const busy = useOrchestratorStore((state) => state.busy)
  const error = useOrchestratorStore((state) => state.error)
  const hydrated = useOrchestratorStore((state) => state.hydrated)
  const hydrate = useOrchestratorStore((state) => state.hydrate)
  const sendChat = useOrchestratorStore((state) => state.sendChat)
  const revokeBrowser = useOrchestratorStore((state) => state.revokeBrowser)
  const refreshAgents = useOrchestratorStore((state) => state.refreshAgents)
  const clearError = useOrchestratorStore((state) => state.clearError)
  const pruneGrants = useOrchestratorStore((state) => state.pruneGrants)
  const [draft, setDraft] = useState('')
  const [reviewTask, setReviewTask] = useState<TaskValue | null>(null)

  useEffect(() => {
    if (!hydrated) void hydrate()
    pruneGrants()
  }, [hydrate, hydrated, pruneGrants])

  const send = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    void sendChat(text)
  }

  const recentRuns = snapshot.runs.slice(-4).reverse()
  const recentTasks = snapshot.tasks.slice(-6).reverse()

  if (reviewTask) {
    return (
      <DiffReview
        task={reviewTask}
        agents={snapshot.agents}
        onClose={() => setReviewTask(null)}
      />
    )
  }

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3 p-4'>
      <div className='flex items-center gap-2'>
        <h2 className='text-base font-semibold'>Orchestrator</h2>
        <span className='text-xs text-muted-foreground'>
          {snapshot.runs.length} run · {snapshot.tasks.length} task · {grants.length} bridge
        </span>
        <Button
          variant='ghost'
          size='icon'
          className='ml-auto size-7'
          aria-label='Muat ulang status orchestrator'
          onClick={() => void refreshAgents()}
        >
          <RefreshCw className='size-3.5' />
        </Button>
      </div>

      {error && (
        <div className='flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive'>
          <span className='min-w-0 flex-1'>{error}</span>
          <Button variant='ghost' size='sm' onClick={clearError}>
            Tutup
          </Button>
        </div>
      )}

      <div className='grid min-h-0 flex-1 gap-3 lg:grid-cols-2'>
        <div className='flex min-h-0 flex-col rounded-md border'>
          <div className='border-b px-3 py-2 text-xs font-medium'>Percakapan</div>
          <div className='min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-xs'>
            {messages.length === 0 && (
              <p className='text-muted-foreground'>Belum ada pesan orchestrator.</p>
            )}
            {messages.slice(-30).map((message) => (
              <div key={message.id} className='rounded-md bg-muted/50 p-2'>
                <span className='font-semibold'>
                  {message.role === 'user' ? 'Anda' : 'Orchestrator'}
                </span>
                <p className='mt-1 whitespace-pre-wrap break-words'>{message.text}</p>
              </div>
            ))}
          </div>
          <div className='flex items-end gap-2 border-t p-2'>
            <textarea
              value={draft}
              rows={2}
              placeholder='Kirim permintaan ke orchestrator'
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              className='min-h-12 flex-1 resize-none rounded-md border bg-background p-2 text-sm'
            />
            <Button size='icon' className='size-10' disabled={!draft.trim() || busy} onClick={send}>
              <Send className='size-4' />
            </Button>
          </div>
        </div>

        <div className='flex min-h-0 flex-col gap-3 overflow-y-auto'>
          <CrewPanel snapshot={snapshot} />

          <section className='rounded-md border'>
            <div className='border-b px-3 py-2 text-xs font-medium'>Run terbaru</div>
            <div className='space-y-1 p-2 text-xs'>
              {recentRuns.length === 0 && <p className='text-muted-foreground'>Belum ada run.</p>}
              {recentRuns.map((run) => (
                <div key={run.id} className='rounded-md bg-muted/50 p-2'>
                  <p className='line-clamp-2'>{run.request}</p>
                  <p className='mt-1 text-muted-foreground'>{run.state}</p>
                </div>
              ))}
            </div>
          </section>

          <section className='rounded-md border'>
            <div className='border-b px-3 py-2 text-xs font-medium'>Task terbaru</div>
            <div className='space-y-1 p-2 text-xs'>
              {recentTasks.length === 0 && <p className='text-muted-foreground'>Belum ada task.</p>}
              {recentTasks.map((task) => (
                <div key={task.id} className='flex items-center gap-2 rounded-md bg-muted/50 p-2'>
                  <span className='min-w-0 flex-1 truncate'>{task.title}</span>
                  <span className='text-muted-foreground'>{task.status}</span>
                  {task.workspaceId && (
                    <Button
                      variant='ghost'
                      size='sm'
                      className='h-6 px-2'
                      onClick={() => setReviewTask(task)}
                    >
                      Tinjau
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className='rounded-md border'>
            <div className='border-b px-3 py-2 text-xs font-medium'>Browser bridge</div>
            <div className='space-y-1 p-2 text-xs'>
              {grants.length === 0 && (
                <p className='text-muted-foreground'>Belum ada tab yang dibagikan.</p>
              )}
              {grants.map((grant) => (
                <div key={grant.token} className='flex items-center gap-2 rounded-md bg-muted/50 p-2'>
                  <span className='min-w-0 flex-1 truncate'>{grant.tabLabel}</span>
                  <span className='text-muted-foreground'>:{grant.port}</span>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-6 text-destructive'
                    aria-label={`Cabut akses ${grant.tabLabel}`}
                    onClick={() => {
                      void revokeBrowser(grant.token).then(() => toast.success('Akses dicabut.'))
                    }}
                  >
                    <Unplug className='size-3.5' />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
