import { useEffect, useRef, useState } from 'react'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'

export function IdeAppHeaderHover() {
  const [revealed, setRevealed] = useState(false)
  const timer = useRef<number | null>(null)

  const show = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    setRevealed(true)
  }

  const hide = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setRevealed(false), 120)
  }

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  return (
    <>
      <div
        onPointerEnter={show}
        onPointerLeave={hide}
        className='fixed inset-x-0 top-0 z-[80] h-2'
        aria-hidden='true'
      />
      <div
        onPointerEnter={show}
        onPointerLeave={hide}
        className={`absolute inset-x-0 top-0 z-[71] h-16 bg-background [&>header]:bg-background transition-transform duration-200 ease-out ${
          revealed
            ? 'pointer-events-auto translate-y-0 shadow-md'
            : 'pointer-events-none -translate-y-full'
        }`}
      >
        <AuthenticatedHeader />
      </div>
    </>
  )
}
