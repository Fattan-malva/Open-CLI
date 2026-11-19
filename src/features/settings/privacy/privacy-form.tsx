import { useEffect, useState } from 'react'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  clearBrowserData,
  getBrowserDataPath,
  getBrowserSessionOnly,
  setBrowserSessionOnly,
} from '@/lib/app'
import { isDesktop } from '@/lib/platform'

export function PrivacyForm() {
  const [path, setPath] = useState<string | null>(null)
  const [sessionOnly, setSessionOnly] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.all([getBrowserDataPath(), getBrowserSessionOnly()]).then(
      ([nextPath, nextSessionOnly]) => {
        if (!alive) return
        setPath(nextPath)
        setSessionOnly(nextSessionOnly)
      }
    )
    return () => {
      alive = false
    }
  }, [])

  const handleToggle = async (next: boolean) => {
    setToggling(true)
    try {
      await setBrowserSessionOnly(next)
      setSessionOnly(next)
      toast.success(
        next
          ? 'Sesi browser privat aktif. Data dibersihkan saat aplikasi dibuka dan ditutup.'
          : 'Sesi browser privat nonaktif.'
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan pengaturan privasi.'
      )
    } finally {
      setToggling(false)
    }
  }

  const handleClear = async () => {
    setBusy(true)
    try {
      await clearBrowserData()
      setConfirmOpen(false)
      toast.success('Cookie dan data browser berhasil dihapus.')
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Gagal menghapus data browser.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className='space-y-4'>
      <Alert>
        <ShieldCheck />
        <AlertTitle>Data browser bersifat lokal</AlertTitle>
        <AlertDescription>
          Cookie, local storage, dan sesi website tersimpan di profil WebView2
          akun Windows ini. Data tersebut tidak ikut ke repo, tidak dikirim ke
          server aplikasi, dan tidak otomatis dibagikan ke laptop lain.
        </AlertDescription>
      </Alert>

      <div className='rounded-md border bg-secondary/40 p-3 text-sm'>
        <p className='text-muted-foreground'>Lokasi profil browser</p>
        <p className='mt-1 break-all font-mono text-xs'>
          {path ?? 'Tidak tersedia pada mode browser'}
        </p>
      </div>

      <div className='flex items-center justify-between gap-4 rounded-md border p-3'>
        <div className='space-y-1'>
          <Label htmlFor='browser-session-only'>Sesi browser privat</Label>
          <p className='text-xs leading-relaxed text-muted-foreground'>
            Hapus cookie dan data website saat aplikasi dibuka dan ditutup.
            Cocok untuk PC bersama.
          </p>
        </div>
        <Switch
          id='browser-session-only'
          checked={sessionOnly}
          disabled={!isDesktop || toggling}
          onCheckedChange={(next) => void handleToggle(next)}
        />
      </div>

      <Button
        variant='destructive'
        className='gap-2'
        disabled={!isDesktop || busy}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 />
        Hapus data browser sekarang
      </Button>

      <p className='text-xs text-muted-foreground'>
        Menghapus data browser akan keluar dari semua website yang login di
        browser bawaan. File pengaturan agent tidak ikut terhapus.
      </p>

      {!isDesktop ? (
        <p className='text-xs text-muted-foreground'>
          Menu privasi hanya aktif pada aplikasi desktop.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title='Hapus data browser?'
        desc='Semua cookie, local storage, dan sesi website di browser bawaan akan dihapus. Anda perlu login ulang.'
        confirmText='Hapus data'
        cancelBtnText='Batal'
        destructive
        isLoading={busy}
        handleConfirm={() => void handleClear()}
      />
    </div>
  )
}
