import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { BrainstormAppIcon } from './app-icon'
import {
  addCustomBrainstormApp,
  normalizeBrainstormUrl,
  type CustomBrainstormApp,
} from './storage'

type AddBrainstormAppPopoverProps = {
  onAdded: (app: CustomBrainstormApp) => void
}

export function AddBrainstormAppPopover({
  onAdded,
}: AddBrainstormAppPopoverProps) {
  const id = useId()
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
    const normalized = normalizeBrainstormUrl(url)

    if (!label) {
      setError('Nama app wajib diisi.')
      return
    }
    if (!normalized) {
      setError('URL app tidak valid.')
      return
    }

    const app = addCustomBrainstormApp({
      label,
      url: normalized,
      iconUrl,
    })
    toast.success(`${label} ditambahkan ke Brainstorming.`)
    onAdded(app)
    reset()
    setOpen(false)
  }

  const preview = {
    key: 'preview',
    label: name || 'A',
    url: url || 'https://example.com/',
    ...(iconUrl ? { iconUrl } : {}),
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError('')
      }}
    >
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label='Tambah app custom'
                className='size-8 shrink-0'
              >
                <Plus className='size-4' />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Tambah app custom</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent side='bottom' align='end' className='w-80'>
        <form onSubmit={handleSubmit} className='grid gap-3'>
          <div className='grid gap-1.5'>
            <h4 className='text-sm font-medium'>Tambah app custom</h4>
            <p className='text-xs text-muted-foreground'>
              App baru akan tersedia di panel Brainstorming.
            </p>
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor={`${id}-name`}>Nama app</Label>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='Contoh: Miro'
              autoComplete='off'
            />
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor={`${id}-url`}>URL app</Label>
            <Input
              id={`${id}-url`}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder='https://miro.com/'
              inputMode='url'
              autoComplete='off'
            />
          </div>

          <div className='grid gap-1.5'>
            <Label htmlFor={`${id}-icon`}>Icon (opsional)</Label>
            <div className='flex items-center gap-2'>
              <BrainstormAppIcon
                app={preview}
                className='size-8 rounded-md text-sm'
              />
              <input
                ref={fileRef}
                id={`${id}-icon`}
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
  )
}
