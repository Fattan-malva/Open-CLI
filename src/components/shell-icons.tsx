type ShellIconProps = {
  className?: string
}

export function PowerShellIcon({ className }: ShellIconProps) {
  return (
    <svg viewBox='0 0 24 24' fill='currentColor' aria-hidden='true' className={className}>
      <path d='M23.181 2.974c.568 0 .923.463.792 1.035l-3.659 15.982c-.13.572-.697 1.035-1.265 1.035H.819c-.568 0-.923-.463-.792-1.035L3.686 4.009c.13-.572.697-1.035 1.265-1.035zm-8.375 9.346c.251-.394.227-.905-.09-1.243L9.122 5.125c-.38-.404-1.037-.407-1.466-.003-.429.402-.468 1.056-.088 1.46l4.662 4.96v.11l-7.42 5.374c-.45.327-.533.977-.187 1.453s.991.597 1.44.27l8.229-5.91c.28-.196.438-.365.514-.52zm-2.796 4.399a.93.93 0 0 0-.934.923c0 .51.418.923.934.923h4.433a.93.93 0 0 0 .934-.923a.93.93 0 0 0-.934-.923z' />
    </svg>
  )
}

export function CmdIcon({ className }: ShellIconProps) {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' className={className}>
      <rect x='1.5' y='3' width='21' height='18' rx='2.5' fill='#0b0b0b' />
      <path
        d='M6 9.25 9 12l-3 2.75M12 15h6'
        fill='none'
        stroke='#ffffff'
        strokeWidth='1.6'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}
