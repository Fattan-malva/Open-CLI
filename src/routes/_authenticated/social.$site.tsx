import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/social/$site')({
  component: function SocialRoute() {
    return null
  },
})
