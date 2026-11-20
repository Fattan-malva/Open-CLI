import { createFileRoute } from '@tanstack/react-router'
import { OrchestratorLanding } from '@/features/orchestrator/components/landing'

export const Route = createFileRoute('/_authenticated/agent-chat/')({
  component: OrchestratorLanding,
})
