import { useEffect, useState } from 'react'
import {
  BROWSER_SNAPSHOT_EVENT,
  getBrowserSnapshot,
  type BrowserSnapshotPayload,
} from '@/lib/browser'

export function BrowserSnapshot({ label }: { label: string }) {
  const [dataUrl, setDataUrl] = useState(() => getBrowserSnapshot(label))

  useEffect(() => {
    const update = (event: Event) => {
      const payload = (event as CustomEvent<BrowserSnapshotPayload>).detail
      if (payload.label === label) setDataUrl(payload.dataUrl)
    }
    window.addEventListener(BROWSER_SNAPSHOT_EVENT, update)
    return () => window.removeEventListener(BROWSER_SNAPSHOT_EVENT, update)
  }, [label])

  if (!dataUrl) return null

  return (
    <img
      src={dataUrl}
      alt=''
      aria-hidden='true'
      draggable={false}
      className='pointer-events-none absolute inset-0 z-0 size-full select-none object-fill'
    />
  )
}
