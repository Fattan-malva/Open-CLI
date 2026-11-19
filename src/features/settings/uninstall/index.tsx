import { ContentSection } from '../components/content-section'
import { UninstallForm } from './uninstall-form'

export function SettingsUninstall() {
  return (
    <ContentSection
      title='Uninstall'
      desc='Hapus Open CLI beserta seluruh data aplikasi dari perangkat ini.'
    >
      <UninstallForm />
    </ContentSection>
  )
}
