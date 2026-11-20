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
