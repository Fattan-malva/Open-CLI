import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/platform'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { startWindowDrag, WindowControls } from './window-controls'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  fixed?: boolean
  ref?: React.Ref<HTMLElement>
}

export function Header({ className, fixed, children, ...props }: HeaderProps) {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }

    document.addEventListener('scroll', onScroll, { passive: true })
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'relative z-50 h-16',
        fixed && 'header-fixed peer/header sticky top-0 w-[inherit]',
        offset > 10 && fixed ? 'shadow' : 'shadow-none',
        className
      )}
      {...props}
    >
      {isDesktop && (
        <div
          className='absolute inset-0 z-0 cursor-default'
          onMouseDown={(event) => {
            if (event.button !== 0) return
            event.preventDefault()
            startWindowDrag()
          }}
        />
      )}
      <div
        className={cn(
          'relative z-10 flex h-full items-center gap-3 p-4 sm:gap-4',
          isDesktop && 'pe-28',
          offset > 10 &&
            fixed &&
            'after:absolute after:inset-0 after:-z-10 after:bg-background/20 after:backdrop-blur-lg'
        )}
      >
        <SidebarTrigger variant='outline' className='max-md:scale-125' />
        <Separator orientation='vertical' className='h-6' />
        {children}
      </div>
      <WindowControls />
    </header>
  )
}
