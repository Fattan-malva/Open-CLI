import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { CustomSocialIcon } from './custom-icon'
import { addCustomSocialSite, normalizeSocialUrl } from './storage'

export function AddSocialPopover() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [iconUrl, setIconUrl] = useState<string | undefined>()
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setName('')
    setUrl('')
    setIconUrl(undefined)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('File harus berupa gambar.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Ukuran ikon maksimal 2 MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setIconUrl(typeof reader.result === 'string' ? reader.result : undefined)
      setError('')
    }
    reader.onerror = () => setError('Gagal membaca file ikon.')
    reader.readAsDataURL(file)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const label = name.trim()
    const normalized = normalizeSocialUrl(url)

    if (!label) {
      setError('Nama app wajib diisi.')
      return
    }
    if (!normalized) {
      setError('URL app tidak valid.')
      return
    }

    addCustomSocialSite({ label, url: normalized, iconUrl })
    toast.success(`${label} ditambahkan ke Social.`)
    reset()
    setOpen(false)
  }

  return (
    <SidebarMenuItem>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setError('')
        }}
      >
        <PopoverTrigger asChild>
          <SidebarMenuButton
            tooltip='Tambah social media'
            className='text-sidebar-foreground/70'
          >
            <Plus />
            <span>Tambah social media</span>
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent side='right' align='start' className='w-80'>
          <form onSubmit={handleSubmit} className='grid gap-3'>
            <div className='grid gap-1.5'>
              <h4 className='text-sm font-medium'>Tambah social media</h4>
              <p className='text-xs text-muted-foreground'>
                App baru akan muncul di grup Social.
              </p>
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='social-app-name'>Nama app</Label>
              <Input
                id='social-app-name'
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder='Contoh: Notion'
                autoComplete='off'
              />
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='social-app-url'>URL app</Label>
              <Input
                id='social-app-url'
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder='https://www.notion.so/'
                inputMode='url'
                autoComplete='off'
              />
            </div>

            <div className='grid gap-1.5'>
              <Label htmlFor='social-app-icon'>Icon (opsional)</Label>
              <div className='flex items-center gap-2'>
                <CustomSocialIcon
                  label={name || 'A'}
                  iconUrl={iconUrl}
                  className='size-8 rounded-md text-sm'
                />
                <input
                  ref={fileRef}
                  id='social-app-icon'
                  type='file'
                  accept='image/*'
                  onChange={handleFile}
                  className='hidden'
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  className='min-w-0 flex-1 justify-start'
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload />
                  <span className='truncate'>
                    {iconUrl ? 'Ganti icon' : 'Pilih icon'}
                  </span>
                </Button>
              </div>
              <p className='text-xs text-muted-foreground'>
                Tanpa icon, inisial nama app yang dipakai.
              </p>
            </div>

            {error ? (
              <p className='text-xs text-destructive' role='alert'>
                {error}
              </p>
            ) : null}

            <div className='flex justify-end gap-2'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={() => {
                  reset()
                  setOpen(false)
                }}
              >
                Batal
              </Button>
              <Button type='submit' size='sm'>
                Tambah
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  )
}
