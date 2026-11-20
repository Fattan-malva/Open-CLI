import { useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  GitBranch,
  Globe,
  Play,
  ShieldCheck,
  Terminal,
  Workflow,
} from 'lucide-react'
import { toast } from 'sonner'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useOrchestratorStore } from '../store'

const AGENT_STATUS_LABEL: Record<string, string> = {
  idle: 'Siap',
  busy: 'Mengerjakan task',
  waiting: 'Menunggu',
  needs_input: 'Butuh input',
  unavailable: 'Tidak tersedia',
  failed: 'Gagal',
  stopped: 'Berhenti',
}

const RUN_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  planning: 'Menyusun rencana',
  plan_ready: 'Rencana siap',
  executing: 'Menjalankan',
  waiting: 'Menunggu',
  validating: 'Validasi',
  integrating: 'Integrasi',
  completed: 'Selesai',
  partial: 'Sebagian selesai',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
  needs_approval: 'Butuh persetujuan',
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (['completed', 'idle', 'plan_ready'].includes(status)) return 'default'
  if (['failed', 'conflict', 'cancelled', 'unavailable'].includes(status)) return 'destructive'
  if (['running', 'busy', 'executing', 'validating', 'planning'].includes(status)) return 'secondary'
  return 'outline'
}

export function OrchestratorLanding() {
  const navigate = useNavigate()
  const snapshot = useOrchestratorStore((state) => state.snapshot)
  const context = useOrchestratorStore((state) => state.context)
  const busy = useOrchestratorStore((state) => state.busy)
  const hydrate = useOrchestratorStore((state) => state.hydrate)
  const refreshAgents = useOrchestratorStore((state) => state.refreshAgents)

  useEffect(() => {
    void hydrate().then(() => refreshAgents())
  }, [hydrate, refreshAgents])
  const idleAgents = useMemo(
    () => snapshot.agents.filter((agent) => agent.status === 'idle').length,
    [snapshot.agents]
  )
  const activeTasks = useMemo(
    () =>
      snapshot.tasks.filter((task) =>
        ['assigned', 'running', 'waiting', 'needs_input', 'validating'].includes(task.status)
      ).length,
    [snapshot.tasks]
  )
  const recentRuns = useMemo(() => [...snapshot.runs].reverse().slice(0, 4), [snapshot.runs])

  function openOrchestrator() {
    if (snapshot.agents.length === 0) {
      toast.error('Jalankan Agent CLI dari Terminal terlebih dahulu')
      void navigate({ to: '/terminal' })
      return
    }
    useOrchestratorStore.getState().setMode('orchestrator')
    void navigate({ to: '/terminal' })
  }

  return (
    <>
      <AuthenticatedHeader />

      <Main fixed fluid className='no-scrollbar gap-6 overflow-y-auto pb-12'>
        <section className='mx-auto flex w-full max-w-5xl flex-col gap-5 pt-6 lg:flex-row lg:items-end lg:justify-between'>
          <div className='max-w-2xl'>
            <Badge variant='outline' className='mb-3 gap-1'>
              <Workflow className='size-3' />
              Native CLI orchestration
            </Badge>
            <h1 className='text-4xl font-semibold tracking-tight sm:text-5xl'>
              Satu permintaan.
              <br />
              Banyak agent, satu rencana.
            </h1>
            <p className='mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground'>
              Orchestrator memecah pekerjaan menjadi DAG, menjalankan task paralel
              di worktree terisolasi, memvalidasi bukti, lalu mengintegrasikan hasil.
              Semua agent tetap berjalan sebagai CLI native di terminal Anda.
            </p>
            <div className='mt-6 flex flex-wrap gap-2'>
              <Button onClick={openOrchestrator} className='gap-2'>
                <Play className='size-4' />
                Buka Orchestrator
              </Button>
              <Button
                variant='outline'
                onClick={() => void navigate({ to: '/terminal' })}
                className='gap-2'
              >
                <Terminal className='size-4' />
                Buka Terminal
              </Button>
            </div>
          </div>

          <div className='grid w-full grid-cols-3 gap-2 lg:w-80'>
            <Card className='gap-1 p-3 text-center shadow-sm'>
              <span className='text-2xl font-semibold'>{snapshot.agents.length}</span>
              <span className='text-[11px] text-muted-foreground'>Agent aktif</span>
            </Card>
            <Card className='gap-1 p-3 text-center shadow-sm'>
              <span className='text-2xl font-semibold'>{idleAgents}</span>
              <span className='text-[11px] text-muted-foreground'>Siap</span>
            </Card>
            <Card className='gap-1 p-3 text-center shadow-sm'>
              <span className='text-2xl font-semibold'>{activeTasks}</span>
              <span className='text-[11px] text-muted-foreground'>Task aktif</span>
            </Card>
          </div>
        </section>

        <section className='mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 lg:grid-cols-[1.25fr_0.75fr]'>
          <Card className='gap-3 p-5 shadow-sm'>
            <div className='flex items-center justify-between gap-2'>
              <h2 className='flex items-center gap-2 text-sm font-semibold'>
                <Bot className='size-4' />
                Agents
              </h2>
              <Badge variant='outline'>{snapshot.agents.length} terdaftar</Badge>
            </div>
            <p className='text-[11px] leading-relaxed text-muted-foreground'>
              Status agent mengikuti task orchestrator, bukan proses terminal. CLI
              yang sedang standby di terminal tetap dihitung <b>Siap</b> sampai
              orchestrator memberinya task.
            </p>
            {snapshot.agents.length === 0 ? (
              <div className='rounded-lg border border-dashed p-4 text-center'>
                <p className='text-xs font-medium'>Belum ada agent aktif</p>
                <p className='mt-1 text-[11px] text-muted-foreground'>
                  Buka Terminal, pilih Agent CLI, lalu jalankan sesi agent.
                </p>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => void navigate({ to: '/terminal' })}
                  className='mt-3 gap-1'
                >
                  Buka Terminal
                  <ArrowRight className='size-3' />
                </Button>
              </div>
            ) : (
              <div className='grid gap-2 sm:grid-cols-2'>
                {snapshot.agents.map((agent) => (
                  <div key={agent.id} className='rounded-lg border bg-muted/30 p-3'>
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        <p className='truncate text-xs font-medium'>{agent.label}</p>
                        <p className='mt-0.5 truncate font-mono text-[10px] text-muted-foreground'>
                          {agent.adapterId} · {agent.terminalId}
                        </p>
                      </div>
                      <Badge variant={statusVariant(agent.status)}>
                        {AGENT_STATUS_LABEL[agent.status] ?? agent.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className='space-y-4'>
            <Card className='gap-2 p-5 shadow-sm'>
              <h2 className='flex items-center gap-2 text-sm font-semibold'>
                <Workflow className='size-4' />
                Cara kerja
              </h2>
              <ol className='space-y-2 text-[11px] leading-relaxed text-muted-foreground'>
                <li><b className='text-foreground'>1.</b> Deskripsikan pekerjaan di chat.</li>
                <li><b className='text-foreground'>2.</b> Coordinator menulis plan.json.</li>
                <li><b className='text-foreground'>3.</b> Task paralel dijalankan di worktree.</li>
                <li><b className='text-foreground'>4.</b> Bukti divalidasi, lalu diintegrasikan.</li>
              </ol>
            </Card>

            <Card className='gap-2 p-5 shadow-sm'>
              <h2 className='flex items-center gap-2 text-sm font-semibold'>
                <ShieldCheck className='size-4' />
                Kontrol aman
              </h2>
              <ul className='space-y-1.5 text-[11px] text-muted-foreground'>
                <li className='flex gap-2'><GitBranch className='mt-0.5 size-3 shrink-0' /> Worktree terisolasi per task.</li>
                <li className='flex gap-2'><CheckCircle2 className='mt-0.5 size-3 shrink-0' /> Validasi berbasis bukti dan exit code.</li>
                <li className='flex gap-2'><ShieldCheck className='mt-0.5 size-3 shrink-0' /> Approval dan integrasi terkontrol.</li>
              </ul>
            </Card>
          </div>
        </section>

        <section className='mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2'>
          <Card className='gap-3 p-5 shadow-sm'>
            <div className='flex items-center justify-between gap-2'>
              <h2 className='flex items-center gap-2 text-sm font-semibold'>
                <Globe className='size-4' />
                Browser context
              </h2>
              <Badge variant={context.page || context.element ? 'default' : 'outline'}>
                {context.page || context.element ? 'Terhubung' : 'Belum ada'}
              </Badge>
            </div>
            {context.page ? (
              <div className='rounded-lg border bg-muted/30 p-3'>
                <p className='truncate text-xs font-medium'>{context.page.title || 'Tanpa judul'}</p>
                <p className='mt-1 truncate font-mono text-[10px] text-muted-foreground'>
                  {context.page.url}
                </p>
                {context.element && (
                  <p className='mt-2 truncate font-mono text-[10px]'>
                    &lt;{context.element.tag}&gt; {context.element.selector}
                  </p>
                )}
              </div>
            ) : (
              <p className='text-[11px] leading-relaxed text-muted-foreground'>
                Buka browser, pilih tab, lalu gunakan <b>Share with Agent</b> dan{' '}
                <b>Inspect Element</b> untuk mengirim konteks halaman ke chat.
              </p>
            )}
          </Card>

          <Card className='gap-3 p-5 shadow-sm'>
            <div className='flex items-center justify-between gap-2'>
              <h2 className='text-sm font-semibold'>Run terakhir</h2>
              <Badge variant='outline'>{recentRuns.length}</Badge>
            </div>
            {recentRuns.length === 0 ? (
              <p className='text-[11px] text-muted-foreground'>
                Belum ada run. Mulai dari Orchestrator untuk membuat rencana pertama.
              </p>
            ) : (
              <div className='space-y-2'>
                {recentRuns.map((run) => (
                  <div key={run.id} className='flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2'>
                    <div className='min-w-0'>
                      <p className='truncate text-xs font-medium'>{run.request}</p>
                      <p className='mt-0.5 truncate font-mono text-[10px] text-muted-foreground'>
                        {run.id}
                      </p>
                    </div>
                    <Badge variant={statusVariant(run.state)}>
                      {RUN_STATUS_LABEL[run.state] ?? run.state}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            <Button
              size='sm'
              variant='outline'
              onClick={openOrchestrator}
              disabled={busy}
              className='mt-auto gap-1 self-start'
            >
              Lanjut ke Orchestrator
              <ArrowRight className='size-3' />
            </Button>
          </Card>
        </section>
      </Main>
    </>
  )
}
