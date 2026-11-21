import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Bot, Brain, Code2, Globe, Info, LayoutDashboard, ListTodo, MessageSquare, Settings, Terminal, Workflow } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useIdeStore } from '@/features/ide/store'
import { useIdeTerminalStore } from '@/features/ide/ide-terminal-store'
import type { TaskRecord } from '@/features/tasks/data/records'

type FeatureItem = {
  title: string
  description: string
  to: string
  icon: React.ComponentType<{ className?: string }>
  status: string
  detail: string
  badgeVariant?: 'default' | 'secondary' | 'outline' | 'destructive'
}

type Props = {
  tasks: TaskRecord[]
  tasksLoading: boolean
}

export function FeatureOverviewGrid({ tasks, tasksLoading }: Props) {
  const openIdeFiles = useIdeStore((s) => s.files.length)
  const ideRoot = useIdeStore((s) => s.root)
  const terminalTabs = useIdeTerminalStore((s) => s.tabs.length)

  const taskSummary = tasksLoading
    ? 'Memuat data tugas'
    : `${tasks.length} tugas · ${tasks.filter((t) => t.status === 'in_progress').length} berjalan`

  const items: FeatureItem[] = [
    {
      title: 'Dashboard',
      description: 'Ringkasan workspace, memori sistem realtime, dan status fitur.',
      to: '/',
      icon: LayoutDashboard,
      status: 'Aktif',
      detail: 'Halaman saat ini',
      badgeVariant: 'secondary',
    },
    {
      title: 'Tugas',
      description: 'Tugas dan todo SQLite lokal dengan pengingat jatuh tempo.',
      to: '/tasks',
      icon: ListTodo,
      status: tasksLoading ? 'Memuat' : 'Tersedia',
      detail: taskSummary,
      badgeVariant: tasksLoading ? 'outline' : 'secondary',
    },
    {
      title: 'Terminal',
      description: 'Sesi terminal terintegrasi dan eksekusi perintah.',
      to: '/terminal',
      icon: Terminal,
      status: 'Tersedia',
      detail: `${terminalTabs} tab terminal IDE terlacak`,
      badgeVariant: 'outline',
    },
    {
      title: 'IDE',
      description: 'Workspace pengkodean dengan file explorer dan berbagai alat.',
      to: '/ide',
      icon: Code2,
      status: 'Tersedia',
      detail: ideRoot
        ? `${openIdeFiles} file terbuka`
        : 'Belum ada root workspace dipilih',
      badgeVariant: 'outline',
    },
    {
      title: 'Browser',
      description: 'Browser bawaan untuk dokumentasi, pratinjau, dan riset.',
      to: '/browser',
      icon: Globe,
      status: 'Tersedia',
      detail: 'Buka workspace browser',
      badgeVariant: 'outline',
    },
    {
      title: 'Brainstorming',
      description: 'Workspace untuk menangkap ide dan merencanakan.',
      to: '/brainstorming',
      icon: Brain,
      status: 'Tersedia',
      detail: 'Buka workspace brainstorming',
      badgeVariant: 'outline',
    },
    {
      title: 'Agent CLI',
      description: 'Jalankan dan kelola workflow command-line agen.',
      to: '/agent-cli',
      icon: Bot,
      status: 'Tersedia',
      detail: 'Buka Agent CLI',
      badgeVariant: 'outline',
    },
    {
      title: 'Agent Chat',
      description: 'Antarmuka agen percakapan dan orkestrasi.',
      to: '/agent-chat',
      icon: MessageSquare,
      status: 'Tersedia',
      detail: 'Buka orkestrasi',
      badgeVariant: 'outline',
    },
    {
      title: 'Agent Flow',
      description: 'Konfigurasi provider dan flow kustom.',
      to: '/agent-flow',
      icon: Workflow,
      status: 'Direncanakan',
      detail: 'Tujuan kapabilitas tersedia',
      badgeVariant: 'outline',
    },
    {
      title: 'Sosial',
      description: 'Integrasi sosial dan komunikasi yang terhubung.',
      to: '/social/whatsapp',
      icon: MessageSquare,
      status: 'Tersedia',
      detail: 'WhatsApp, Discord, GitHub, Zoom, Telegram, Gmail, Microsoft',
      badgeVariant: 'outline',
    },
    {
      title: 'Dukungan / Pengaturan',
      description: 'Bantuan, tentang aplikasi, dan konfigurasi workspace.',
      to: '/settings',
      icon: Settings,
      status: 'Tersedia',
      detail: 'Pengaturan, Bantuan, Tentang',
      badgeVariant: 'outline',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fitur Workspace</CardTitle>
        <CardDescription>
          Semua tujuan sidebar dengan status lokal nyata jika tersedia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          {items.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.title} className='flex flex-col rounded-md border bg-muted/10 p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <div className='rounded-md border bg-background p-2 text-muted-foreground'>
                      <Icon className='size-4' />
                    </div>
                    <div className='min-w-0'>
                      <div className='truncate text-sm font-medium'>{item.title}</div>
                      <div className='text-xs text-muted-foreground'>{item.status}</div>
                    </div>
                  </div>
                  <Badge variant={item.badgeVariant ?? 'outline'}>{item.status}</Badge>
                </div>
                <p className='mt-3 text-sm text-muted-foreground'>{item.description}</p>
                <div className='mt-3 text-xs text-muted-foreground'>{item.detail}</div>
                <div className='mt-4 flex items-center gap-2'>
                  <Button variant='outline' size='sm' asChild>
                    <Link to={item.to}>
                      Buka
                      <ArrowUpRight className='size-3.5' />
                    </Link>
                  </Button>
                  {item.title === 'Dukungan / Pengaturan' ? (
                    <Button variant='ghost' size='sm' asChild>
                      <Link to='/help-center'>
                        <Info className='size-3.5' />
                        Bantuan
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
