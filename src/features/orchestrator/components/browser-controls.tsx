import { useMemo, useState } from 'react'
import { MousePointerClick, Share2, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  browserInspect,
  browserPageSnapshot,
} from '../api'
import { useOrchestratorStore } from '../store'

type BrowserOrchestratorControlsProps = {
  tabLabel: string | null
  disabled?: boolean
}

export function BrowserOrchestratorControls({
  tabLabel,
  disabled = false,
}: BrowserOrchestratorControlsProps) {
  const [agentId, setAgentId] = useState('')
  const agents = useOrchestratorStore((state) => state.snapshot.agents)
  const grants = useOrchestratorStore((state) => state.grants)
  const inspecting = useOrchestratorStore((state) => state.inspecting)
  const inspectTabLabel = useOrchestratorStore((state) => state.inspectTabLabel)
  const shareBrowser = useOrchestratorStore((state) => state.shareBrowser)
  const revokeBrowser = useOrchestratorStore((state) => state.revokeBrowser)
  const setBrowserContext = useOrchestratorStore((state) => state.setBrowserContext)
  const setInspecting = useOrchestratorStore((state) => state.setInspecting)

  const available = useMemo(
    () => agents.filter((agent) => agent.status !== 'unavailable' && agent.status !== 'failed'),
    [agents]
  )
  const selected = agentId || available[0]?.id || ''
  const grant = grants.find((item) => item.tabLabel === tabLabel)

  async function capturePage() {
    if (!tabLabel) return
    try {
      const page = await browserPageSnapshot(tabLabel)
      const current = useOrchestratorStore.getState().context
      setBrowserContext({
        page: { ...page, capturedAt: new Date().toISOString() },
        element: current.element,
      })
    } catch {
      return
    }
  }

  async function share() {
    if (!tabLabel || !selected) return
    await shareBrowser(tabLabel, selected)
    await capturePage()
  }

  async function toggleInspect() {
    if (!tabLabel || !grant) return
    const next = !inspecting || inspectTabLabel !== tabLabel
    await browserInspect(tabLabel, grant.token, next)
    setInspecting(tabLabel, next)
    if (next) await capturePage()
  }

  return (
    <div className='flex shrink-0 items-center gap-1 border-l pl-2'>
      <select
        aria-label='Agent untuk browser'
        value={selected}
        onChange={(event) => setAgentId(event.target.value)}
        disabled={disabled || available.length === 0}
        className='h-8 max-w-32 rounded-md border bg-background px-2 text-[11px] text-muted-foreground outline-none disabled:opacity-50'
      >
        {available.length === 0 ? (
          <option value=''>No agent</option>
        ) : (
          available.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.label}
            </option>
          ))
        )}
      </select>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label={grant ? 'Browser sudah dibagikan' : 'Bagikan browser ke agent'}
        disabled={disabled || !selected || Boolean(grant)}
        onClick={() => void share()}
        className='size-8'
      >
        <Share2 className='size-4' />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label={inspecting && inspectTabLabel === tabLabel ? 'Hentikan inspect element' : 'Inspect element untuk agent'}
        disabled={disabled || !grant}
        aria-pressed={inspecting && inspectTabLabel === tabLabel}
        onClick={() => void toggleInspect()}
        className='size-8'
      >
        <MousePointerClick className='size-4' />
      </Button>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        aria-label='Cabut akses browser'
        disabled={!grant}
        onClick={() => grant && void revokeBrowser(grant.token)}
        className='size-8'
      >
        <Unplug className='size-4' />
      </Button>
    </div>
  )
}
