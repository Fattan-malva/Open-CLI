import { Fragment } from 'react'
import { cn } from '@/lib/utils'

type ShortcutKeysProps = {
  keys?: string[]
  className?: string
}

export function ShortcutKeys({ keys, className }: ShortcutKeysProps) {
  if (!keys?.length) return null

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {keys.map((key, index) => (
        <Fragment key={`${key}-${index}`}>
          {index > 0 && (
            <span className='text-[10px] text-muted-foreground'>+</span>
          )}
          <kbd className='rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-muted-foreground'>
            {key}
          </kbd>
        </Fragment>
      ))}
    </div>
  )
}
