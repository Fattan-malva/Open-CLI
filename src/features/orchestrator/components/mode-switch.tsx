import { Bot, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOrchestratorStore } from '../store'

export function OrchestratorModeSwitch() {
  const mode = useOrchestratorStore((state) => state.mode)
  const agentCount = useOrchestratorStore((state) => state.snapshot.agents.length)
  const setMode = useOrchestratorStore((state) => state.setMode)

  return (
    <div className='flex shrink-0 items-center rounded-md border bg-muted/60 p-0.5'>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        aria-pressed={mode === 'terminal'}
        onClick={() => setMode('terminal')}
        className={cn(
          'h-6 gap-1 px-2 text-[11px]',
          mode === 'terminal' && 'bg-background text-foreground shadow-sm'
        )}
      >
        <Terminal className='size-3' />
        Terminal
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        aria-pressed={mode === 'orchestrator'}
        onClick={() => {
          if (agentCount === 0) toast.error('No active native Agent CLI session is available')
          setMode('orchestrator')
        }}
        className={cn(
          'h-6 gap-1 px-2 text-[11px]',
          mode === 'orchestrator' && 'bg-background text-foreground shadow-sm'
        )}
      >
        <Bot className='size-3' />
        Orchestrator
      </Button>
    </div>
  )
}
