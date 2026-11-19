import { createFileRoute } from '@tanstack/react-router'
import { SettingsPrivacy } from '@/features/settings/privacy'

export const Route = createFileRoute('/_authenticated/settings/privacy')({
  component: SettingsPrivacy,
})
