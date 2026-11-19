import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/browser/')({
  component: function BrowserRoute() {
    return null
  },
})
