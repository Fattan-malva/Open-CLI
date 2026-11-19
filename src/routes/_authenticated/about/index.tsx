import { createFileRoute } from '@tanstack/react-router'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

const APP_VERSION = '0.1.0'

export const Route = createFileRoute('/_authenticated/about/')({
  component: function AboutRoute() {
    return (
      <>
        <AuthenticatedHeader />

        <Main
          fixed
          fluid
          className='no-scrollbar gap-6 overflow-y-auto pb-12 text-center'
        >
          <div className='mx-auto flex w-full max-w-3xl flex-col items-center gap-3 pt-6'>
            <div className='text-5xl font-semibold tracking-tight sm:text-6xl'>
              Open CLI
            </div>
            <Badge variant='outline'>Versi {APP_VERSION}</Badge>
          </div>

          <Card className='mx-auto w-full max-w-2xl gap-3 p-6 text-center shadow-sm'>
            <p className='text-sm leading-relaxed text-muted-foreground'>
              Open CLI adalah workspace desktop untuk terminal, browser, dan
              agent AI dalam satu aplikasi. Semua alat bekerja secara lokal
              sehingga alur kerja tetap cepat, sederhana, dan mudah diakses.
            </p>
            <p className='text-sm leading-relaxed text-muted-foreground'>
              Aplikasi ini dibangun dengan Tauri, React, dan TypeScript sebagai
              fondasi untuk mengelola perintah, eksplorasi web, dan otomasi
              pengembangan sehari-hari.
            </p>
          </Card>

          <div className='mx-auto grid w-full max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3'>
            <Card className='gap-1 p-4 text-center shadow-sm'>
              <p className='text-sm font-semibold'>Desktop</p>
              <p className='text-xs leading-relaxed text-muted-foreground'>
                Berjalan sebagai aplikasi desktop native.
              </p>
            </Card>
            <Card className='gap-1 p-4 text-center shadow-sm'>
              <p className='text-sm font-semibold'>Lokal</p>
              <p className='text-xs leading-relaxed text-muted-foreground'>
                Pengaturan dan profil browser tersimpan di akun Windows ini.
              </p>
            </Card>
            <Card className='gap-1 p-4 text-center shadow-sm'>
              <p className='text-sm font-semibold'>Agent-ready</p>
              <p className='text-xs leading-relaxed text-muted-foreground'>
                Menyediakan ruang untuk agent CLI dan otomasi.
              </p>
            </Card>
          </div>

          <Card className='mx-auto w-full max-w-2xl gap-2 p-5 text-left shadow-sm'>
            <p className='text-sm font-semibold'>Privasi data</p>
            <p className='text-xs leading-relaxed text-muted-foreground'>
              Data agent, cache, dan profil browser WebView2 tersimpan lokal di
              `%USERPROFILE%\.config\opencli` untuk produksi, atau
              `opencli-dev` untuk development. Data tidak ikut repo dan tidak
              dibagikan otomatis ke laptop lain. Settings → Privacy menyediakan
              hapus data browser dan sesi browser privat.
            </p>
          </Card>

          <p className='mt-auto pt-6 text-center text-xs text-muted-foreground'>
            © {new Date().getFullYear()} Open CLI. Dibuat oleh Fattan-Malva ❤️
          </p>
        </Main>
      </>
    )
  },
})
