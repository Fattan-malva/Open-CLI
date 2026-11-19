import { useEffect, useState } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getAppDataPath, uninstallApp } from '@/lib/app'
import { isDesktop } from '@/lib/platform'

export function UninstallForm() {
  const [path, setPath] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void getAppDataPath().then((next) => {
      if (alive) setPath(next)
    })
    return () => {
      alive = false
    }
  }, [])

  const ready = value === 'UNINSTALL'

  const handleUninstall = async () => {
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      await uninstallApp()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Uninstall gagal. Coba lagi.'
      )
      setBusy(false)
    }
  }

  return (
    <div className='space-y-4'>
      <Alert variant='destructive'>
        <AlertTriangle />
        <AlertTitle>Hapus aplikasi dan semua data</AlertTitle>
        <AlertDescription>
          Seluruh konfigurasi agent, folder project tersimpan, cache, dan data
          WebView akan dihapus permanen. Proses ini tidak bisa dibatalkan.
        </AlertDescription>
      </Alert>

      <div className='rounded-md border bg-secondary/40 p-3 text-sm'>
        <p className='text-muted-foreground'>Lokasi data aplikasi</p>
        <p className='mt-1 break-all font-mono text-xs'>
          {path ?? 'Tidak tersedia pada mode browser'}
        </p>
      </div>

      <div className='space-y-2'>
        <label htmlFor='uninstall-confirmation' className='text-sm font-medium'>
          Ketik <span className='font-mono font-semibold'>UNINSTALL</span> untuk
          mengonfirmasi
        </label>
        <Input
          id='uninstall-confirmation'
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder='UNINSTALL'
          autoCapitalize='characters'
          autoComplete='off'
          spellCheck={false}
          disabled={busy}
        />
        <p className='text-xs text-muted-foreground'>
          Konfirmasi harus huruf kapital semua.
        </p>
      </div>

      {error ? (
        <Alert variant='destructive'>
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        variant='destructive'
        onClick={handleUninstall}
        disabled={!ready || busy || !isDesktop}
        className='gap-2'
      >
        <Trash2 />
        {busy ? 'Menyiapkan uninstall...' : 'Uninstall Open CLI'}
      </Button>

      {!isDesktop ? (
        <p className='text-xs text-muted-foreground'>
          Menu uninstall hanya aktif pada aplikasi desktop terpasang.
        </p>
      ) : null}
    </div>
  )
}
