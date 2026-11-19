import { cn } from '@/lib/utils'

type CustomSocialIconProps = {
  label: string
  iconUrl?: string
  className?: string
}

export function CustomSocialIcon({
  label,
  iconUrl,
  className,
}: CustomSocialIconProps) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=''
        aria-hidden='true'
        className={cn('size-4 shrink-0 rounded-[4px] object-cover', className)}
      />
    )
  }

  const initial = label.trim().charAt(0).toUpperCase() || '?'
  return (
    <span
      aria-hidden='true'
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-sidebar-accent text-[9px] font-semibold leading-none text-sidebar-foreground',
        className
      )}
    >
      {initial}
    </span>
  )
}
