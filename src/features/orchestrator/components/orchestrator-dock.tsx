import { useMemo, useState, type FormEvent } from 'react'
import { AlertCircle, Bot, Check, RotateCcw, Send, Share2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { useOrchestratorStore } from '../store'

function stateVariant(state: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (['completed', 'ready', 'plan_ready', 'idle'].includes(state)) return 'default'
  if (['failed', 'conflict', 'cancelled', 'unavailable'].includes(state)) return 'destructive'
  if (['running', 'busy', 'validating', 'executing'].includes(state)) return 'secondary'
  return 'outline'
}

const AGENT_STATUS_LABEL: Record<string, string> = {
  idle: 'siap',
  busy: 'sedang task',
  waiting: 'menunggu',
  needs_input: 'butuh input',
  unavailable: 'tidak tersedia',
  failed: 'gagal',
  stopped: 'berhenti',
}

const AGENT_STATUS_HELP: Record<string, string> = {
  idle: 'Agent siap menerima task orchestrator.',
  busy: 'Agent sedang mengerjakan task orchestrator.',
  waiting: 'Agent menunggu proses lain atau dependency.',
  needs_input: 'Agent membutuhkan input atau persetujuan.',
  unavailable: 'Agent tidak tersedia.',
  failed: 'Agent gagal pada task terakhir.',
  stopped: 'Agent dihentikan.',
}

export function OrchestratorDock() {
  const [text, setText] = useState('')
  const snapshot = useOrchestratorStore((state) => state.snapshot)
  const messages = useOrchestratorStore((state) => state.messages)
  const context = useOrchestratorStore((state) => state.context)
  const grants = useOrchestratorStore((state) => state.grants)
  const busy = useOrchestratorStore((state) => state.busy)
  const error = useOrchestratorStore((state) => state.error)
  const activeRunId = useOrchestratorStore((state) => state.activeRunId)
  const run = useMemo(
    () => snapshot.runs.find((item) => item.id === activeRunId) ?? null,
    [snapshot.runs, activeRunId]
  )
  const tasks = useMemo(
    () => snapshot.tasks.filter((task) => task.runId === activeRunId),
    [snapshot.tasks, activeRunId]
  )
  const sendChat = useOrchestratorStore((state) => state.sendChat)
  const generatePlan = useOrchestratorStore((state) => state.generatePlan)
  const setCoordinator = useOrchestratorStore((state) => state.setCoordinator)
  const approveAndExecute = useOrchestratorStore((state) => state.approveAndExecute)
  const cancelRun = useOrchestratorStore((state) => state.cancelRun)
  const retryTask = useOrchestratorStore((state) => state.retryTask)
  const integrate = useOrchestratorStore((state) => state.integrate)
  const revokeBrowser = useOrchestratorStore((state) => state.revokeBrowser)
  const clearBrowserContext = useOrchestratorStore((state) => state.clearBrowserContext)
  const clearError = useOrchestratorStore((state) => state.clearError)

  function submit(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setText('')
    void sendChat(value)
  }

  return (
    <section className='flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl backdrop-blur'>
      <header className='flex h-11 shrink-0 items-center justify-between border-b px-3'>
        <div className='flex items-center gap-2'>
          <Bot className='size-4 text-primary' />
          <span className='text-sm font-semibold'>Orchestrator</span>
          {run && <Badge variant={stateVariant(run.state)}>{run.state}</Badge>}
        </div>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label='Tutup panel'
          onClick={() => useOrchestratorStore.getState().setMode('terminal')}
          className='size-7'
        >
          <X className='size-4' />
        </Button>
      </header>

      {error && (
        <div className='flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive'>
          <AlertCircle className='mt-0.5 size-3.5 shrink-0' />
          <span className='min-w-0 flex-1'>{error}</span>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Tutup error'
            onClick={clearError}
            className='size-5'
          >
            <X className='size-3' />
          </Button>
        </div>
      )}

      <ScrollArea className='min-h-0 flex-1'>
        <div className='space-y-4 p-3'>
          <div className='space-y-2'>
            {messages.length === 0 && (
              <p className='rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground'>
                Deskripsikan pekerjaan. Orchestrator akan membuat run, menyusun DAG,
                lalu menunggu persetujuan sebelum menjalankan task.
              </p>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === 'user'
                    ? 'ml-6 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground'
                    : 'mr-6 rounded-lg border bg-muted/50 px-3 py-2 text-xs'
                }
              >
                <span className='whitespace-pre-wrap break-words'>{message.text}</span>
                {message.attachments && message.attachments.length > 0 && (
                  <span className='mt-1 block text-[10px] opacity-70'>
                    {message.attachments.join(', ')}
                  </span>
                )}
              </div>
            ))}
          </div>

          {run && (
            <div className='rounded-lg border bg-card p-3'>
              <div className='flex items-center justify-between gap-2'>
                <span className='truncate text-xs font-medium'>{run.id}</span>
                <div className='flex shrink-0 gap-1'>
                  {!run.plan && (
                    <Button
                      type='button'
                      size='sm'
                      disabled={busy || snapshot.agents.length === 0}
                      onClick={() => void generatePlan(run.id)}
                      className='h-6 px-2 text-[10px]'
                    >
                      Buat rencana
                    </Button>
                  )}
                  <Button
                    type='button'
                    size='sm'
                    disabled={busy || !run.plan}
                    onClick={() => void approveAndExecute()}
                    className='h-6 px-2 text-[10px]'
                  >
                    <Check className='size-3' />
                    Approve &amp; run
                  </Button>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    disabled={busy}
                    onClick={() => void cancelRun()}
                    className='h-6 px-2 text-[10px]'
                  >
                    Cancel
                  </Button>
                </div>
              </div>
              <label className='mt-2 block'>
                <span className='text-[10px] font-semibold text-muted-foreground'>
                  Coordinator
                </span>
                <select
                  aria-label='Coordinator agent'
                  value={run.coordinatorId ?? ''}
                  disabled={busy}
                  onChange={(event) => void setCoordinator(event.target.value)}
                  className='mt-1 h-7 w-full rounded-md border border-input bg-background px-2 text-[10px]'
                >
                  <option value=''>Pilih coordinator…</option>
                  {snapshot.agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.label} · {AGENT_STATUS_LABEL[agent.status] ?? agent.status}
                    </option>
                  ))}
                </select>
              </label>
              <p className='mt-2 text-[11px] text-muted-foreground'>
                {run.request}
              </p>
              {run.plan && (
                <div className='mt-2 rounded border bg-muted/30 p-2 text-[10px]'>
                  <p className='font-semibold'>Rencana siap</p>
                  {run.plan.rationale && (
                    <p className='mt-1 text-muted-foreground'>{run.plan.rationale}</p>
                  )}
                  {run.plan.risks.length > 0 && (
                    <p className='mt-1 text-muted-foreground'>
                      Risiko: {run.plan.risks.join(', ')}
                    </p>
                  )}
                </div>
              )}
              <div className='mt-2 flex flex-wrap gap-1'>
                <Badge variant='outline'>{tasks.length} tasks</Badge>
                <Badge variant='outline'>
                  {tasks.filter((task) => task.status === 'completed').length} completed
                </Badge>
                <Badge variant='outline'>
                  {snapshot.approvals.filter((item) => item.status === 'pending').length} approvals
                </Badge>
              </div>
            </div>
          )}

          {tasks.length > 0 && (
            <div className='space-y-1.5'>
              <h3 className='text-[11px] font-semibold text-muted-foreground'>Tasks</h3>
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className='rounded-lg border bg-card p-2.5 text-xs'
                >
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>{task.title}</p>
                      <p className='mt-0.5 truncate font-mono text-[10px] text-muted-foreground'>
                        {task.id}
                      </p>
                    </div>
                    <Badge variant={stateVariant(task.status)}>{task.status}</Badge>
                  </div>
                  {task.blocker && (
                    <p className='mt-1.5 text-[10px] text-destructive'>{task.blocker}</p>
                  )}
                  <div className='mt-2 flex gap-1'>
                    {['failed', 'conflict', 'cancelled', 'needs_input'].includes(task.status) && (
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() => void retryTask(task.id)}
                        className='h-6 px-2 text-[10px]'
                      >
                        <RotateCcw className='size-3' />
                        Retry
                      </Button>
                    )}
                    {task.status === 'completed' && (
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() => void integrate(task.id)}
                        className='h-6 px-2 text-[10px]'
                      >
                        Integrate
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {snapshot.agents.length > 0 && (
            <div className='space-y-1.5'>
              <h3 className='text-[11px] font-semibold text-muted-foreground'>Agents</h3>
              <div className='flex flex-wrap gap-1'>
                {snapshot.agents.map((agent) => (
                  <Badge
                    key={agent.id}
                    variant={stateVariant(agent.status)}
                    title={AGENT_STATUS_HELP[agent.status] ?? agent.status}
                  >
                    {agent.label} · {AGENT_STATUS_LABEL[agent.status] ?? agent.status}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {(context.page || context.element) && (
            <div className='rounded-lg border bg-card p-3 text-xs'>
              <div className='flex items-center justify-between'>
                <h3 className='flex items-center gap-1 font-semibold'>
                  <Share2 className='size-3' />
                  Browser context
                </h3>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label='Hapus konteks browser'
                  onClick={clearBrowserContext}
                  className='size-5'
                >
                  <X className='size-3' />
                </Button>
              </div>
              {context.page && (
                <p className='mt-1.5 truncate text-[10px] text-muted-foreground'>
                  {context.page.url || '(no URL)'}
                </p>
              )}
              {context.element && (
                <p className='mt-1 truncate font-mono text-[10px]'>
                  &lt;{context.element.tag}&gt; {context.element.selector}
                </p>
              )}
            </div>
          )}

          {grants.length > 0 && (
            <div className='space-y-1.5'>
              <h3 className='text-[11px] font-semibold text-muted-foreground'>Browser grants</h3>
              {grants.map((grant) => (
                <div
                  key={grant.token}
                  className='flex items-center justify-between gap-2 rounded border bg-muted/40 px-2 py-1.5 text-[10px]'
                >
                  <span className='min-w-0 truncate font-mono'>
                    {grant.tabLabel} · {grant.agentId} · :{grant.port}
                  </span>
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    aria-label='Cabut akses browser'
                    onClick={() => void revokeBrowser(grant.token)}
                    className='size-5 shrink-0'
                  >
                    <X className='size-3' />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <form onSubmit={submit} className='shrink-0 border-t p-3'>
        <div className='flex items-end gap-2'>
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit(event)
              }
            }}
            placeholder='Jelaskan pekerjaan untuk orchestrator…'
            rows={2}
            className='min-h-16 resize-none text-xs'
          />
          <Button type='submit' size='icon' disabled={busy || !text.trim()} className='size-9'>
            <Send className='size-4' />
          </Button>
        </div>
        <p className='mt-1.5 text-[10px] text-muted-foreground'>
          Enter untuk kirim · Shift+Enter untuk baris baru
        </p>
      </form>
    </section>
  )
}
