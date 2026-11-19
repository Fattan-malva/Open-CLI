import { type SVGProps } from 'react'
import { cn } from '@/lib/utils'

export function IconMicrosoft({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      role='img'
      viewBox='0 0 24 24'
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      className={cn('shrink-0', className)}
      {...props}
    >
      <title>Microsoft</title>
      <path fill='#F25022' d='M3 3h8v8H3z' />
      <path fill='#7FBA00' d='M13 3h8v8h-8z' />
      <path fill='#00A4EF' d='M3 13h8v8H3z' />
      <path fill='#FFB900' d='M13 13h8v8h-8z' />
    </svg>
  )
}
