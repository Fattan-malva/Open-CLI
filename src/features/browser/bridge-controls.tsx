import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Eye, EyeOff, Share2, Unplug } from 'lucide-react'
import { toast } from 'sonner'
import { useAgentGroupStore } from '@/features/agent-groups/store'
import { useBridgeStore } from './bridge-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function BridgeControls({ tabLabel }: { tabLabel: string | null }) {
  const agents = useAgentGroupStore((state) => state.agents)
  const grants = useBridgeStore((state) => state.grants)
  const shareBrowser = useBridgeStore((state) => state.shareBrowser)
  const revokeBrowser = useBridgeStore((state) => state.revokeBrowser)
  const pruneGrants = useBridgeStore((state) => state.pruneGrants)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [revealed, setRevealed] = useState(false)
  const copiedTokens = useRef<string[]>([])

  const runningAgents = useMemo(
    () => Object.values(agents).filter((agent) => agent.status === 'running'),
    [agents]
  )
  const effectiveAgent = runningAgents.some((agent) => agent.id === selectedAgent)
    ? selectedAgent
    : (runningAgents[0]?.id ?? '')
  const grant = useMemo(
    () => grants.find((item) => item.tabLabel === tabLabel) ?? null,
    [grants, tabLabel]
  )

  useEffect(() => {
    pruneGrants()
  }, [grants, pruneGrants])

  useEffect(() => {
    if (grants.length === 0) return
    const nextExpiry = Math.min(...grants.map((item) => item.expiresAt))
    const timer = window.setTimeout(
      pruneGrants,
      Math.max(0, nextExpiry - Date.now()) + 250
    )
    return () => window.clearTimeout(timer)
  }, [grants, pruneGrants])

  const clearCopiedToken = useCallback(async () => {
    const tokens = copiedTokens.current
    if (tokens.length === 0) return
    try {
      const current = await navigator.clipboard.readText()
      if (tokens.includes(current.trim())) await navigator.clipboard.writeText('')
    } catch {
      copiedTokens.current = []
      return
    }
    copiedTokens.current = []
  }, [])

  useEffect(() => () => void clearCopiedToken(), [clearCopiedToken])

  const copy = useCallback(async (text: string, token?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      if (token) copiedTokens.current.push(token)
      toast.success('Disalin ke clipboard')
    } catch {
      toast.error('Gagal menyalin ke clipboard')
    }
  }, [])

  const share = useCallback(async () => {
    if (!tabLabel) {
      toast.error('Buka tab dengan halaman terlebih dahulu.')
      return
    }
    if (!effectiveAgent) {
      toast.error('Jalankan agent terlebih dahulu.')
      return
    }
    await shareBrowser(tabLabel, effectiveAgent)
    setRevealed(false)
  }, [effectiveAgent, shareBrowser, tabLabel])

  const revoke = useCallback(async () => {
    if (!grant) return
    await clearCopiedToken()
    await revokeBrowser(grant.token)
    setRevealed(false)
  }, [clearCopiedToken, grant, revokeBrowser])

  const agentInstructions = grant
    ? [
        'OpenCLI browser bridge:',
        `GET http://127.0.0.1:${grant.port}/tools`,
        `POST http://127.0.0.1:${grant.port}/call`,
        `Header: X-OpenCLI-Token: ${grant.token}`,
        'Body: {"name":"browser.read","arguments":{"maxChars":20000}}',
        'Jangan tampilkan token di log atau jawaban.',
        `Berlaku sampai ${new Date(grant.expiresAt).toLocaleTimeString()}.`,
      ].join('\n')
    : ''

  return (
    <div className='flex shrink-0 items-center gap-1'>
      {!grant ? (
        <>
          <select
            aria-label='Pilih agent untuk browser bridge'
            value={effectiveAgent}
            onChange={(event) => setSelectedAgent(event.target.value)}
            disabled={!tabLabel || runningAgents.length === 0}
            className='h-8 max-w-36 rounded-md border bg-background px-2 text-xs text-muted-foreground disabled:opacity-40'
          >
            {runningAgents.length === 0 ? (
              <option value=''>Tidak ada agent</option>
            ) : (
              runningAgents.map((agent) => (
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
            aria-label='Bagikan tab ke agent'
            title='Bagikan tab ke agent'
            disabled={!tabLabel || !effectiveAgent}
            onClick={() => void share()}
            className='size-8 shrink-0'
          >
            <Share2 className='size-4' />
          </Button>
        </>
      ) : (
        <>
          <div
            className='flex h-8 min-w-0 items-center gap-1 rounded-md border bg-muted/40 px-2 text-[11px] text-muted-foreground'
            title={tabLabel ?? undefined}
          >
            <span className='font-mono'>
              {revealed ? grant.token : '•'.repeat(Math.min(16, grant.token.length))}
            </span>
            <span className='opacity-60'>:{grant.port}</span>
          </div>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label={revealed ? 'Sembunyikan token' : 'Tampilkan token'}
            title={revealed ? 'Sembunyikan token' : 'Tampilkan token'}
            onClick={() => setRevealed((value) => !value)}
            className='size-8 shrink-0'
          >
            {revealed ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Salin token'
            title='Salin token'
            onClick={() => void copy(grant.token, grant.token)}
            className='size-8 shrink-0'
          >
            <Copy className='size-4' />
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Salin petunjuk agent'
            title='Salin petunjuk agent'
            onClick={() => void copy(agentInstructions, grant.token)}
            className='size-8 shrink-0'
          >
            <span className='text-[10px] font-semibold'>AI</span>
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Cabut akses browser'
            title='Cabut akses browser'
            onClick={() => void revoke()}
            className={cn('size-8 shrink-0 text-destructive hover:text-destructive')}
          >
            <Unplug className='size-4' />
          </Button>
        </>
      )}
    </div>
  )
}
