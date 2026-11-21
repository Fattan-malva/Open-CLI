import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  EMPTY_MEMORY_SNAPSHOT,
  getSystemMemorySnapshot,
  type SystemMemorySnapshot,
} from '@/lib/system-monitor'

type MemoryPoint = {
  time: string
  usedPercent: number
  opencliPercent: number
  usedGb: number
  opencliGb: number
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function toPoint(snapshot: SystemMemorySnapshot): MemoryPoint {
  return {
    time: formatTime(snapshot.sampledAt || Date.now()),
    usedPercent: Number(snapshot.usedPercent.toFixed(1)),
    opencliPercent: Number(snapshot.opencliPercent.toFixed(1)),
    usedGb: Number(snapshot.usedGb.toFixed(2)),
    opencliGb: Number(snapshot.opencliGb.toFixed(2)),
  }
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className='rounded-md border bg-muted/20 p-3'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className='mt-1 text-lg font-semibold tabular-nums'>{value}</div>
      {hint ? <div className='text-[11px] text-muted-foreground'>{hint}</div> : null}
    </div>
  )
}

function processRoute(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('webview') || lower.includes('msedge') || lower.includes('chromium')) {
    return { to: '/browser' as const, menu: 'Browser' }
  }
  if (
    lower.includes('powershell') ||
    lower.includes('pwsh') ||
    lower.includes('cmd') ||
    lower.includes('conhost') ||
    lower.includes('bash') ||
    lower.includes('zsh')
  ) {
    return { to: '/ide' as const, menu: 'IDE' }
  }
  if (lower.includes('agent') || lower.includes('node') || lower.includes('bun')) {
    return { to: '/agent-cli' as const, menu: 'Agent CLI' }
  }
  return { to: '/' as const, menu: 'Dashboard' }
}


export function MemoryPanel() {
  const [snapshot, setSnapshot] = useState<SystemMemorySnapshot>(EMPTY_MEMORY_SNAPSHOT)
  const [history, setHistory] = useState<MemoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const next = await getSystemMemorySnapshot()
        if (!active) return
        setSnapshot(next)
        setHistory((prev) => [...prev, toPoint(next)].slice(-30))
        setError(null)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Gagal memuat data memori')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const topProcesses = useMemo(() => snapshot.processes.slice(0, 10), [snapshot.processes])
  const maxMb = Math.max(...topProcesses.map((p) => p.memoryMb), 1)

  return (
    <div className='grid gap-4 xl:grid-cols-7'>
      <Card className='xl:col-span-4'>
        <CardHeader>
          <CardTitle>Memori Sistem</CardTitle>
          <CardDescription>
            RAM Windows dan total proses OpenCLI secara realtime, diperbarui tiap 2 detik.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {loading ? (
            <div className='space-y-3'>
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className='h-20 w-full' />)}
              </div>
              <Skeleton className='h-[260px] w-full' />
            </div>
          ) : (
            <>
              {error ? <div className='text-sm text-destructive'>{error}</div> : null}
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                <Stat label='Total RAM' value={`${snapshot.totalGb.toFixed(2)} GB`} hint='Seluruh RAM laptop' />
                <Stat label='RAM Terpakai' value={`${snapshot.usedGb.toFixed(2)} GB`} hint={`${snapshot.usedPercent.toFixed(1)}% terpakai`} />
                <Stat label='RAM Tersedia' value={`${snapshot.availableGb.toFixed(2)} GB`} hint='Sisa RAM Windows' />
                <Stat label='Total OpenCLI' value={`${snapshot.opencliGb.toFixed(2)} GB`} hint={`${snapshot.opencliPercent.toFixed(1)}% dari total`} />
              </div>
              <div className='h-[260px] w-full text-primary'>
                <ResponsiveContainer width='100%' height='100%'>
                  <AreaChart data={history} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
                    <XAxis dataKey='time' tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={42} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                      labelStyle={{ color: 'var(--popover-foreground)' }}
                    />
                    <Area type='monotone' dataKey='usedPercent' name='Sistem terpakai %' stroke='currentColor' fill='currentColor' fillOpacity={0.16} strokeWidth={2} />
                    <Area type='monotone' dataKey='opencliPercent' name='OpenCLI %' stroke='var(--muted-foreground)' fill='var(--muted-foreground)' fillOpacity={0.12} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className='xl:col-span-3'>
        <CardHeader>
          <CardTitle>Proses OpenCLI</CardTitle>
          <CardDescription>10 proses terbesar di pohon OpenCLI berdasarkan RAM. Klik untuk membuka menu terkait.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='space-y-3'>
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className='h-10 w-full' />)}
            </div>
          ) : topProcesses.length === 0 ? (
            <div className='text-sm text-muted-foreground'>Belum ada data proses.</div>
          ) : (
            <div className='space-y-3'>
              {topProcesses.map((proc) => {
                const route = processRoute(proc.name || proc.label)
                return (
                  <Link
                    key={proc.pid}
                    to={route.to}
                    title={`Buka menu ${route.menu}`}
                    className='block space-y-1 rounded-md p-1.5 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                  >
                    <div className='flex items-center justify-between gap-3 text-xs'>
                      <div className='flex min-w-0 items-center gap-1.5'>
                        <span className='min-w-0 truncate font-medium text-foreground'>
                          {proc.name || proc.label}
                        </span>
                        <ArrowUpRight className='size-3 shrink-0 text-muted-foreground' />
                        <span className='shrink-0 text-muted-foreground'>PID {proc.pid}</span>
                      </div>
                      <span className='shrink-0 tabular-nums text-muted-foreground'>
                        {proc.memoryMb.toFixed(1)} MB
                      </span>
                    </div>
                    <div className='h-2 rounded-full bg-muted'>
                      <div
                        className={cn('h-2 rounded-full bg-primary')}
                        style={{ width: `${Math.max(4, (proc.memoryMb / maxMb) * 100)}%` }}
                      />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
