import { createFileRoute } from '@tanstack/react-router'
import { AgentCli } from '@/features/agent-cli'

export const Route = createFileRoute('/_authenticated/agent-cli/')({
  component: AgentCli,
})
