import { CustomSocialIcon } from '@/features/social/custom-icon'
import { cn } from '@/lib/utils'
import type { BrainstormApp } from './data'

type BrainstormAppIconProps = {
  app: BrainstormApp | null
  className?: string
}

export function BrainstormAppIcon({ app, className }: BrainstormAppIconProps) {
  const Icon = app?.icon

  if (Icon) {
    return <Icon className={cn('size-4 shrink-0', className)} />
  }

  return (
    <CustomSocialIcon
      label={app?.label ?? 'A'}
      iconUrl={app?.iconUrl}
      className={className}
    />
  )
}
