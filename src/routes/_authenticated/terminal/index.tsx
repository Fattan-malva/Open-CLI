import { createFileRoute } from '@tanstack/react-router'
import { TerminalRoutePlaceholder } from '@/features/terminal/route-placeholder'

export const Route = createFileRoute('/_authenticated/terminal/')({
  component: TerminalRoutePlaceholder,
})
