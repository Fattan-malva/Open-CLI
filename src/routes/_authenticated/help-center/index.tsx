import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useSidebar } from '@/components/ui/sidebar'
import { useSearch } from '@/context/search-provider'

type ShortcutScope = 'Umum' | 'Terminal' | 'Browser' | 'Sistem'

type ShortcutItem = {
  id: string
  scope: ShortcutScope
  title: string
  description: string
  keys: string[]
  action?: () => void
  actionLabel?: string
  blocked?: boolean
}

const scopes: ShortcutScope[] = ['Umum', 'Terminal', 'Browser', 'Sistem']

export const Route = createFileRoute('/_authenticated/help-center/')({
  component: function HelpPage() {
    const navigate = useNavigate()
    const { setOpen: setSearchOpen } = useSearch()
    const { toggleSidebar } = useSidebar()
    const [query, setQuery] = useState('')

    const shortcuts = useMemo<ShortcutItem[]>(
      () => [
        {
          id: 'search',
          scope: 'Umum',
          title: 'Buka pencarian',
          description: 'Membuka palette pencarian aplikasi.',
          keys: ['Ctrl / Cmd', 'K'],
          action: () => setSearchOpen(true),
          actionLabel: 'Buka',
        },
        {
          id: 'sidebar',
          scope: 'Umum',
          title: 'Toggle sidebar',
          description: 'Menutup atau membuka sidebar kiri.',
          keys: ['Ctrl / Cmd', 'B'],
          action: toggleSidebar,
          actionLabel: 'Toggle',
        },
        {
          id: 'terminal-new',
          scope: 'Terminal',
          title: 'Terminal baru',
          description: 'Membuka terminal baru di workspace.',
          keys: ['Ctrl', 'T'],
          action: () => void navigate({ to: '/terminal' }),
          actionLabel: 'Buka',
        },
        {
          id: 'terminal-browser',
          scope: 'Terminal',
          title: 'Buka / tutup browser',
          description:
            'Menampilkan atau menyembunyikan panel browser di samping terminal.',
          keys: ['Ctrl', 'Shift', 'B'],
          action: () => void navigate({ to: '/terminal' }),
          actionLabel: 'Buka',
        },
        {
          id: 'terminal-close',
          scope: 'Terminal',
          title: 'Tutup terminal aktif',
          description: 'Menutup satu terminal yang sedang dipilih.',
          keys: ['Ctrl', 'W'],
          action: () => void navigate({ to: '/terminal' }),
          actionLabel: 'Buka',
        },
        {
          id: 'terminal-close-all',
          scope: 'Terminal',
          title: 'Tutup semua terminal',
          description: 'Menutup seluruh terminal setelah konfirmasi.',
          keys: ['Ctrl', 'Shift', 'W'],
          action: () => void navigate({ to: '/terminal' }),
          actionLabel: 'Buka',
        },
        {
          id: 'terminal-cycle',
          scope: 'Terminal',
          title: 'Terminal berikutnya',
          description: 'Berpindah ke terminal berikutnya di grid.',
          keys: ['Ctrl', 'Shift', 'Tab'],
          action: () => void navigate({ to: '/terminal' }),
          actionLabel: 'Buka',
        },
        {
          id: 'terminal-escape',
          scope: 'Terminal',
          title: 'Tutup menu terminal',
          description: 'Menutup menu konteks atau panel masuk nama terminal.',
          keys: ['Esc'],
        },
        {
          id: 'terminal-enter',
          scope: 'Terminal',
          title: 'Simpan nama terminal',
          description: 'Mengonfirmasi nama terminal saat panel edit terbuka.',
          keys: ['Enter'],
        },
        {
          id: 'browser-address',
          scope: 'Browser',
          title: 'Fokus alamat browser',
          description: 'Memilih kolom alamat dan pencarian browser.',
          keys: ['Ctrl / Cmd', 'L'],
          action: () => void navigate({ to: '/browser' }),
          actionLabel: 'Buka',
        },
        {
          id: 'browser-new-tab',
          scope: 'Browser',
          title: 'Tab browser baru',
          description: 'Membuka tab webview Tauri baru.',
          keys: ['Ctrl', 'T'],
          action: () => void navigate({ to: '/browser' }),
          actionLabel: 'Buka',
        },
        {
          id: 'browser-close-tab',
          scope: 'Browser',
          title: 'Tutup tab browser',
          description: 'Menutup tab browser yang sedang aktif.',
          keys: ['Ctrl', 'W'],
          action: () => void navigate({ to: '/browser' }),
          actionLabel: 'Buka',
        },
        {
          id: 'browser-next-tab',
          scope: 'Browser',
          title: 'Tab berikutnya',
          description: 'Berpindah ke tab browser berikutnya.',
          keys: ['Ctrl', 'Tab'],
          action: () => void navigate({ to: '/browser' }),
          actionLabel: 'Buka',
        },
        {
          id: 'browser-previous-tab',
          scope: 'Browser',
          title: 'Tab sebelumnya',
          description: 'Berpindah ke tab browser sebelumnya.',
          keys: ['Ctrl', 'Shift', 'Tab'],
          action: () => void navigate({ to: '/browser' }),
          actionLabel: 'Buka',
        },
        {
          id: 'devtools-f12',
          scope: 'Sistem',
          title: 'Developer tools',
          description: 'Shortcut developer tools diblokir di aplikasi.',
          keys: ['F12'],
          blocked: true,
          action: () => toast.info('Shortcut developer tools diblokir.'),
          actionLabel: 'Coba',
        },
        {
          id: 'devtools-inspect',
          scope: 'Sistem',
          title: 'Inspect element',
          description: 'Shortcut inspect diblokir di aplikasi.',
          keys: ['Ctrl', 'Shift', 'I'],
          blocked: true,
          action: () => toast.info('Shortcut developer tools diblokir.'),
          actionLabel: 'Coba',
        },
        {
          id: 'devtools-console',
          scope: 'Sistem',
          title: 'Buka console',
          description: 'Shortcut console diblokir di aplikasi.',
          keys: ['Ctrl', 'Shift', 'J'],
          blocked: true,
          action: () => toast.info('Shortcut developer tools diblokir.'),
          actionLabel: 'Coba',
        },
        {
          id: 'devtools-source',
          scope: 'Sistem',
          title: 'Lihat source',
          description: 'Shortcut source viewer diblokir di aplikasi.',
          keys: ['Ctrl', 'U'],
          blocked: true,
          action: () => toast.info('Shortcut developer tools diblokir.'),
          actionLabel: 'Coba',
        },
      ],
      [navigate, setSearchOpen, toggleSidebar]
    )

    const filtered = useMemo(() => {
      const needle = query.trim().toLowerCase()
      if (!needle) return shortcuts

      return shortcuts.filter((shortcut) =>
        [
          shortcut.scope,
          shortcut.title,
          shortcut.description,
          ...shortcut.keys,
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      )
    }, [shortcuts, query])

    const grouped = scopes
      .map((scope) => ({
        scope,
        items: filtered.filter((shortcut) => shortcut.scope === scope),
      }))
      .filter((group) => group.items.length > 0)

    return (
      <>
        <AuthenticatedHeader />

        <Main fixed fluid className='min-h-0 flex-1 overflow-hidden'>
          <div className='flex h-full flex-col'>
            <div className='flex-none space-y-0.5'>
              <h1 className='text-2xl font-bold tracking-tight md:text-3xl'>
                Help
              </h1>
              <p className='text-muted-foreground'>
                Panduan shortcut untuk terminal, browser, pencarian, sidebar, dan sistem.
              </p>
            </div>

            <Separator className='my-4 flex-none lg:my-6' />

            <div className='faded-bottom no-scrollbar min-h-0 flex-1 overflow-y-auto pb-12'>
              <div className='space-y-6 pe-4'>
                <div className='sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-2 backdrop-blur'>
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder='Cari shortcut...'
                    aria-label='Cari shortcut'
                  />
                  <p className='mt-2 text-xs text-muted-foreground'>
                    Klik Jalankan, Buka, Toggle, atau Coba untuk mencoba shortcut yang tersedia.
                  </p>
                </div>

                {grouped.length === 0 ? (
                  <div className='rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground'>
                    Tidak ada shortcut yang cocok.
                  </div>
                ) : (
                  grouped.map((group) => (
                    <Card key={group.scope}>
                      <CardHeader>
                        <CardTitle>{group.scope}</CardTitle>
                        <CardDescription>
                          {group.items.length} shortcut tersedia di grup ini.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className='space-y-2'>
                        {group.items.map((shortcut) => (
                          <div
                            key={shortcut.id}
                            className='flex flex-col gap-3 rounded-lg border bg-secondary/40 p-3 sm:flex-row sm:items-center sm:justify-between'
                          >
                            <div className='min-w-0'>
                              <div className='flex flex-wrap items-center gap-2'>
                                <span className='text-sm font-medium'>
                                  {shortcut.title}
                                </span>
                                {shortcut.blocked && (
                                  <span className='rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive'>
                                    Diblokir
                                  </span>
                                )}
                              </div>
                              <p className='mt-1 text-xs text-muted-foreground'>
                                {shortcut.description}
                              </p>
                              <div className='mt-2 flex flex-wrap gap-1'>
                                {shortcut.keys.map((key) => (
                                  <kbd
                                    key={key}
                                    className='rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground'
                                  >
                                    {key}
                                  </kbd>
                                ))}
                              </div>
                            </div>
                            {shortcut.action && (
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                onClick={shortcut.action}
                                className='shrink-0'
                              >
                                {shortcut.actionLabel ?? 'Jalankan'}
                              </Button>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </div>
        </Main>
      </>
    )
  },
})
