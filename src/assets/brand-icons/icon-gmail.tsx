import { type SVGProps } from 'react'
import { cn } from '@/lib/utils'

export function IconGmail({ className, ...props }: SVGProps<SVGSVGElement>) {
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
      <title>Gmail</title>
      <path fill='#EA4335' d='M3 6.5 12 13l9-6.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z' />
      <path fill='#4285F4' d='M3 6.5V19a2 2 0 0 0 2 2h2V10.3z' />
      <path fill='#34A853' d='M21 6.5V19a2 2 0 0 1-2 2h-2V10.3z' />
      <path fill='#FBBC04' d='M7 10.3V21h10V10.3L12 15.6z' />
    </svg>
  )
}
