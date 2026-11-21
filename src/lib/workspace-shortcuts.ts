import { useEffect } from 'react'

export type ShortcutBinding = {
  combination: string
  handler: (event: KeyboardEvent) => void
  enabled?: boolean
}

function normalizeCombination(combination: string) {
  return combination
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

function eventKey(event: KeyboardEvent) {
  if (event.key === ' ') return 'space'
  return event.key.toLowerCase()
}

function matches(event: KeyboardEvent, parts: string[]) {
  const key = parts[parts.length - 1]
  const ctrl = parts.includes('ctrl') || parts.includes('mod')
  const shift = parts.includes('shift')
  const alt = parts.includes('alt')
  const meta = parts.includes('meta')

  if (!key) return false
  if (ctrl !== event.ctrlKey) return false
  if (shift !== event.shiftKey) return false
  if (alt !== event.altKey) return false
  if (meta !== event.metaKey) return false
  return eventKey(event) === key
}

export function useWorkspaceShortcuts(bindings: ShortcutBinding[]) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return

      for (const binding of bindings) {
        if (binding.enabled === false) continue
        if (!matches(event, normalizeCombination(binding.combination))) continue

        event.preventDefault()
        event.stopImmediatePropagation()
        binding.handler(event)
        return
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [bindings])
}
