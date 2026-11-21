export type SuspendCandidate = {
  id: string
  activeId: string | null
  hasTab: boolean
  hasActiveTask: boolean
  hasBridgeGrant: boolean
  busy: boolean
}

export function shouldSuspendSession(candidate: SuspendCandidate): boolean {
  return (
    candidate.hasTab &&
    candidate.id !== candidate.activeId &&
    !candidate.hasActiveTask &&
    !candidate.hasBridgeGrant &&
    !candidate.busy
  )
}

/**
 * How long a background shell may stay silent before it is suspended.
 * Lower free memory means a shorter wait, so weak machines reclaim sooner.
 */
export function idleSuspendAfterMs(availableMemoryPercent: number): number {
  if (availableMemoryPercent < 20) return 30_000
  if (availableMemoryPercent < 40) return 90_000
  return 3 * 60_000
}
