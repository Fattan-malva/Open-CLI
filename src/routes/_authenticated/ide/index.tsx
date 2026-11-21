import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/ide/')({
  component: function IdeRoute() {
    return null
  },
})
