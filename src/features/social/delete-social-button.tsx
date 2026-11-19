import { useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SidebarMenuAction } from '@/components/ui/sidebar'
import { closeBrowserTab } from '@/lib/browser'
import { isDesktop } from '@/lib/platform'
import { removeCustomSocialSite } from './storage'

type DeleteSocialButtonProps = {
  siteKey: string
  label: string
}

export function DeleteSocialButton({ siteKey, label }: DeleteSocialButtonProps) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const pathname = useLocation({ select: (location) => location.pathname })

  const handleConfirm = () => {
    removeCustomSocialSite(siteKey)

    if (isDesktop) {
      void closeBrowserTab(`browser-tab-social-${siteKey}`).catch(() => undefined)
    }
    if (pathname === `/social/${siteKey}`) {
      void navigate({ to: '/' })
    }

    setOpen(false)
    toast.success(`${label} dihapus dari Social.`)
  }

  return (
    <>
      <SidebarMenuAction
        aria-label={`Hapus ${label}`}
        title='Hapus social media'
        showOnHover
        className='end-6 text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        <Trash2 />
      </SidebarMenuAction>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title='Hapus social media?'
        desc={
          <>
            <strong>{label}</strong> akan dihapus dari grup Social. Data login di
            website tidak ikut terhapus.
          </>
        }
        confirmText='Hapus'
        cancelBtnText='Batal'
        destructive
        handleConfirm={handleConfirm}
      />
    </>
  )
}
