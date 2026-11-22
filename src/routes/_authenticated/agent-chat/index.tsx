import { createFileRoute } from '@tanstack/react-router'
import { AgentGroupWorkspace } from '@/features/agent-groups'

export const Route = createFileRoute('/_authenticated/agent-chat/')({
  component: AgentGroupWorkspace,
})
