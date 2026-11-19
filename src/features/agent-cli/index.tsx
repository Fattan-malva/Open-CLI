import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgentCard } from './components/agent-card'
import { AddAgentDialog } from './components/add-agent-dialog'
import { builtInAgents, type AgentCliItem } from './data/agents'

const STORAGE_KEY = 'open-cli:agent-cli-custom'

function loadCustomAgents(): AgentCliItem[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' && item !== null
      )
      .filter(
        (item) =>
          typeof item.id === 'string' &&
          typeof item.name === 'string' &&
          typeof item.command === 'string'
      )
      .map((item) => ({
        id: item.id as string,
        name: item.name as string,
        command: item.command as string,
        description:
          typeof item.description === 'string'
            ? item.description
            : 'Agent CLI kustom ditambahkan manual.',
        icon: typeof item.icon === 'string' ? item.icon : undefined,
        shortcut: Array.isArray(item.shortcut)
          ? item.shortcut.filter((key): key is string => typeof key === 'string')
          : undefined,
        custom: true,
      }))
  } catch {
    return []
  }
}

export function AgentCli() {
  const [open, setOpen] = useState(false)
  const [customAgents, setCustomAgents] = useState<AgentCliItem[]>(loadCustomAgents)
  const [activeIds, setActiveIds] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(customAgents))
    } catch {
      toast.error('Gagal menyimpan agent kustom di penyimpanan lokal.')
    }
  }, [customAgents])

  const agents = useMemo(
    () => [...builtInAgents, ...customAgents],
    [customAgents]
  )

  const addAgent = (agent: AgentCliItem) => {
    setCustomAgents((previous) => [...previous, agent])
    toast.success(`${agent.name} ditambahkan`)
  }

  const removeAgent = (id: string) => {
    const target = customAgents.find((agent) => agent.id === id)
    setCustomAgents((previous) => previous.filter((agent) => agent.id !== id))
    setActiveIds((previous) => {
      const next = new Set(previous)
      next.delete(id)
      return next
    })
    toast.success(`${target?.name ?? 'Agent'} dihapus`)
  }

  const toggleAgent = (id: string) => {
    setActiveIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <AuthenticatedHeader />

      <Main fixed fluid className='gap-5'>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
              Agent CLI
            </h1>
            <p className='text-sm text-muted-foreground'>
              Daftar agent CLI yang tersedia untuk workspace ini.
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline'>{agents.length} agent</Badge>
            <Button onClick={() => setOpen(true)}>
              <Plus className='size-4' />
              Tambah agent
            </Button>
          </div>
        </div>

        <div className='faded-bottom relative min-h-0 flex-1 after:z-10'>
          <div className='no-scrollbar h-full overflow-y-auto pb-12'>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'>
              <button
                type='button'
                onClick={() => setOpen(true)}
                className='flex min-h-64 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-foreground/20 bg-card/40 p-6 text-center transition duration-200 hover:border-foreground/40 hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
              >
                <span className='flex size-12 items-center justify-center rounded-full border bg-background text-muted-foreground'>
                  <Plus className='size-5' />
                </span>
                <span className='space-y-1'>
                  <span className='block text-sm font-semibold'>
                    Tambah Agent CLI kustom
                  </span>
                  <span className='block text-xs text-muted-foreground'>
                    Nama, command, SVG drop, dan shortcut
                  </span>
                </span>
              </button>

              {agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  active={activeIds.has(agent.id)}
                  onToggle={() => toggleAgent(agent.id)}
                  onRemove={agent.custom ? removeAgent : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      </Main>

      <AddAgentDialog open={open} onOpenChange={setOpen} onAdd={addAgent} />
    </>
  )
}
