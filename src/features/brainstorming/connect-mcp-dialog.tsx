import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BRAINSTORM_MCP_SERVERS, type BrainstormApp } from './data'

type ConnectMcpDialogProps = {
  app: BrainstormApp
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenConnectors: (url: string) => void
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success('Alamat MCP disalin.')
  } catch {
    toast.error('Gagal menyalin alamat MCP.')
  }
}

export function ConnectMcpDialog({
  app,
  open,
  onOpenChange,
  onOpenConnectors,
}: ConnectMcpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Connect MCP ke {app.label}</DialogTitle>
          <DialogDescription>
            Chat web tidak bisa diatur dari luar, jadi salin alamat MCP lalu
            tambahkan sebagai custom connector di pengaturan {app.label}.
          </DialogDescription>
        </DialogHeader>

        <ul className='flex flex-col gap-2'>
          {BRAINSTORM_MCP_SERVERS.map((server) => (
            <li
              key={server.key}
              className='flex items-center gap-2 rounded-md border p-2'
            >
              <div className='min-w-0 flex-1'>
                <p className='text-sm font-medium'>{server.label}</p>
                <p className='truncate font-mono text-xs text-muted-foreground'>
                  {server.url}
                </p>
              </div>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={`Salin alamat ${server.label}`}
                title='Salin alamat'
                onClick={() => void copyToClipboard(server.url)}
                className='size-8 shrink-0'
              >
                <Copy className='size-4' />
              </Button>
            </li>
          ))}
        </ul>

        {app.connectorsUrl ? (
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenConnectors(app.connectorsUrl!)}
            className='w-full'
          >
            <ExternalLink className='size-4' />
            Buka pengaturan konektor {app.label}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
