import { createFileRoute } from '@tanstack/react-router'
import { SettingsUninstall } from '@/features/settings/uninstall'

export const Route = createFileRoute('/_authenticated/settings/uninstall')({
  component: SettingsUninstall,
})
