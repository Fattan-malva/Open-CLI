import { useEffect, useState } from 'react'
import { Check, Copy, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { type AgentCliItem } from '../data/agents'
import { AgentIcon } from './agent-icon'
import { ShortcutKeys } from './shortcut-keys'

type AgentCardProps = {
  agent: AgentCliItem
  active?: boolean
  onToggle?: () => void
  onRemove?: (id: string) => void
}

export function AgentCard({
  agent,
  active = false,
  onToggle,
  onRemove,
}: AgentCardProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(agent.command)
      setCopied(true)
      toast.success('Command disalin')
    } catch {
      toast.error('Gagal menyalin command')
    }
  }

  return (
    <Card
      className={cn(
        'group gap-0 overflow-hidden border-border/80 p-4 py-4',
        'transition duration-200 hover:border-foreground/20',
        active && 'border-primary/50 bg-primary/5'
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <AgentIcon agent={agent} />
        <div className='flex flex-wrap items-center justify-end gap-1.5'>
          {agent.custom && <Badge variant='outline'>Kustom</Badge>}
          <Badge variant={active ? 'default' : 'secondary'}>
            {active ? 'Aktif' : 'Nonaktif'}
          </Badge>
          <Switch
            checked={active}
            onCheckedChange={() => onToggle?.()}
            aria-label={`Aktifkan ${agent.name}`}
          />
          {onRemove && (
            <button
              type='button'
              aria-label={`Hapus ${agent.name}`}
              onClick={() => onRemove(agent.id)}
              className='flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100'
            >
              <Trash2 className='size-4' />
            </button>
          )}
        </div>
      </div>

      <div className='mt-4 min-w-0'>
        <h3 className='min-w-0 truncate text-base font-semibold leading-tight tracking-tight'>
          {agent.name}
        </h3>
        <p className='mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground'>
          {agent.description}
        </p>
      </div>

      <div className='mt-4 flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-2'>
        <code className='min-w-0 flex-1 truncate font-mono text-xs text-foreground'>
          {agent.command}
        </code>
        <button
          type='button'
          aria-label={`Salin command ${agent.name}`}
          onClick={() => void copyCommand()}
          className='flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground'
        >
          {copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
        </button>
      </div>

      <div className='mt-3 flex items-center justify-between gap-2'>
        <span className='text-[10px] font-medium uppercase tracking-widest text-muted-foreground'>
          Shortcut
        </span>
        <ShortcutKeys keys={agent.shortcut} />
      </div>
    </Card>
  )
}
