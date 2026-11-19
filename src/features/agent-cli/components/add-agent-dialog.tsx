import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Keyboard, UploadCloud } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeAgentSvg } from '@/lib/agent-cli'
import { cn } from '@/lib/utils'
import { type AgentCliItem } from '../data/agents'
import { AgentIcon } from './agent-icon'
import { ShortcutKeys } from './shortcut-keys'

type AddAgentDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (agent: AgentCliItem) => void
  usedLetters: string[]
}

type CaptureStep = 'idle' | 'key'

const DEFAULT_SHORTCUT_BASE = ['Alt']

export function AddAgentDialog({
  open,
  onOpenChange,
  onAdd,
  usedLetters,
}: AddAgentDialogProps) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [svgContent, setSvgContent] = useState('')
  const [svgFileName, setSvgFileName] = useState('')
  const [dragging, setDragging] = useState(false)
  const [shortcut, setShortcut] = useState<string[]>([])
  const [pendingBase, setPendingBase] = useState<string[]>(DEFAULT_SHORTCUT_BASE)
  const [captureStep, setCaptureStep] = useState<CaptureStep>('key')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shortcutRef = useRef<HTMLDivElement>(null)

  const clearError = (field: string) => {
    setErrors((previous) => {
      if (!previous[field]) return previous
      const next = { ...previous }
      delete next[field]
      return next
    })
  }

  const reset = () => {
    setName('')
    setCommand('')
    setSvgContent('')
    setSvgFileName('')
    setDragging(false)
    setShortcut([])
    setPendingBase(DEFAULT_SHORTCUT_BASE)
    setCaptureStep('key')
    setErrors({})
  }

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) reset()
  }

  const readSvgFile = async (file: File) => {
    const isSvg =
      file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')

    if (!isSvg) {
      setSvgContent('')
      setSvgFileName('')
      setErrors((previous) => ({ ...previous, svg: 'File harus berformat .svg.' }))
      return
    }

    if (file.size > 512_000) {
      setSvgContent('')
      setSvgFileName('')
      setErrors((previous) => ({
        ...previous,
        svg: 'Ukuran SVG maksimal 500 KB.',
      }))
      return
    }

    const content = await file.text()
    if (!normalizeAgentSvg(content)) {
      setSvgContent('')
      setSvgFileName('')
      setErrors((previous) => ({
        ...previous,
        svg: 'File SVG tidak valid.',
      }))
      return
    }

    setSvgContent(content)
    setSvgFileName(file.name)
    clearError('svg')
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) void readSvgFile(file)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) void readSvgFile(file)
    event.target.value = ''
  }

  const startCapture = () => {
    setShortcut([])
    setPendingBase(DEFAULT_SHORTCUT_BASE)
    setCaptureStep('key')
    clearError('shortcut')
    window.setTimeout(() => shortcutRef.current?.focus(), 0)
  }

  const captureShortcut = (event: KeyboardEvent<HTMLDivElement>) => {
    event.preventDefault()

    if (event.key === 'Escape') {
      setShortcut([])
      setPendingBase(DEFAULT_SHORTCUT_BASE)
      setCaptureStep('key')
      clearError('shortcut')
      shortcutRef.current?.blur()
      return
    }

    if (captureStep === 'idle') return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return

    if (!/^[a-z]$/i.test(event.key)) {
      setErrors((previous) => ({
        ...previous,
        shortcut: 'Gunakan huruf A-Z untuk shortcut agent.',
      }))
      return
    }

    const letter = event.key.toUpperCase()
    if (usedLetters.includes(letter)) {
      setErrors((previous) => ({
        ...previous,
        shortcut: `Alt + ${letter} sudah dipakai agent lain.`,
      }))
      return
    }

    setShortcut([...DEFAULT_SHORTCUT_BASE, letter])
    setCaptureStep('idle')
    clearError('shortcut')
    shortcutRef.current?.blur()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()

    const nextErrors: Record<string, string> = {}
    const cleanName = name.trim()
    const cleanCommand = command.trim()

    if (!cleanName) nextErrors.name = 'Nama CLI wajib diisi.'
    if (!cleanCommand) nextErrors.command = 'Command menjalankan wajib diisi.'
    if (shortcut.length !== DEFAULT_SHORTCUT_BASE.length + 1) {
      nextErrors.shortcut = 'Tekan 1 huruf untuk melengkapi shortcut.'
    } else {
      const letter = shortcut[shortcut.length - 1]?.toUpperCase()
      if (letter && usedLetters.includes(letter)) {
        nextErrors.shortcut = `Alt + ${letter} sudah dipakai agent lain.`
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    onAdd({
      id: `custom-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      name: cleanName,
      command: cleanCommand,
      description: 'Agent CLI kustom ditambahkan manual.',
      icon: svgContent ? normalizeAgentSvg(svgContent) ?? undefined : undefined,
      shortcut,
      custom: true,
    })
    handleOpenChange(false)
  }

  const previewIcon = svgContent ? normalizeAgentSvg(svgContent) ?? undefined : undefined
  const displayedShortcut = shortcut.length > 0 ? shortcut : pendingBase
  const showShortcutHint = captureStep === 'key'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Tambah Agent CLI</DialogTitle>
          <DialogDescription>
            Simpan agent CLI kustom dan drop SVG opsional. Shortcut Ctrl + T
            sudah terisi, tinggal tekan satu huruf.
          </DialogDescription>
        </DialogHeader>

        <form className='space-y-4' onSubmit={submit}>
          <div className='flex items-center gap-3 rounded-xl border bg-muted/40 p-3'>
            <AgentIcon agent={{ name, icon: previewIcon }} />
            <div className='min-w-0'>
              <p className='truncate text-sm font-medium'>
                {name.trim() || 'Nama agent'}
              </p>
              <p className='truncate font-mono text-xs text-muted-foreground'>
                {command.trim() || 'command'}
              </p>
            </div>
          </div>

          <div className='space-y-2'>
            <Label htmlFor='agent-name'>Nama CLI</Label>
            <Input
              id='agent-name'
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                clearError('name')
              }}
              placeholder='Contoh: Cursor CLI'
              aria-invalid={Boolean(errors.name)}
              autoFocus
            />
            {errors.name && (
              <p className='text-xs text-destructive'>{errors.name}</p>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='agent-command'>Command menjalankan</Label>
            <Input
              id='agent-command'
              value={command}
              onChange={(event) => {
                setCommand(event.target.value)
                clearError('command')
              }}
              placeholder='Contoh: cursor'
              className='font-mono'
              aria-invalid={Boolean(errors.command)}
            />
            {errors.command && (
              <p className='text-xs text-destructive'>{errors.command}</p>
            )}
          </div>

          <div className='space-y-2'>
            <Label>SVG opsional</Label>
            <button
              type='button'
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed p-4 text-center transition',
                dragging
                  ? 'border-primary bg-primary/5'
                  : 'border-foreground/20 bg-muted/30 hover:border-foreground/40 hover:bg-muted/60',
                errors.svg && 'border-destructive/60'
              )}
            >
              <UploadCloud className='size-5 text-muted-foreground' />
              <span className='max-w-full truncate text-sm font-medium'>
                {svgFileName || 'Drop icon SVG di sini'}
              </span>
              <span className='text-xs text-muted-foreground'>
                Atau klik untuk memilih file .svg
              </span>
            </button>
            <input
              ref={fileInputRef}
              type='file'
              accept='image/svg+xml,.svg'
              className='hidden'
              onChange={handleFileChange}
            />
            {errors.svg && (
              <p className='text-xs text-destructive'>{errors.svg}</p>
            )}
          </div>

          <div className='space-y-2'>
            <Label>Shortcut</Label>
            <div
              ref={shortcutRef}
              role='button'
              tabIndex={0}
              onClick={startCapture}
              onKeyDown={captureShortcut}
              onBlur={() => {
                if (captureStep === 'idle') return
                setCaptureStep('idle')
                setPendingBase(DEFAULT_SHORTCUT_BASE)
              }}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border bg-background px-3 outline-none transition',
                captureStep !== 'idle'
                  ? 'border-primary ring-2 ring-ring/30'
                  : 'border-input hover:border-foreground/30',
                errors.shortcut && 'border-destructive/60'
              )}
            >
              <Keyboard className='size-4 shrink-0 text-muted-foreground' />
              <ShortcutKeys keys={displayedShortcut} />
              {showShortcutHint && (
                <span className='ml-auto text-xs text-muted-foreground'>
                  Tekan 1 huruf
                </span>
              )}
            </div>
            <p className='text-xs text-muted-foreground'>
              Shortcut otomatis Alt + huruf. Klik kolom lalu tekan huruf agent,
              misalnya O. Esc untuk mengulang.
            </p>
            {errors.shortcut && (
              <p className='text-xs text-destructive'>{errors.shortcut}</p>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type='button' variant='outline'>
                Batal
              </Button>
            </DialogClose>
            <Button type='submit'>Tambahkan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
