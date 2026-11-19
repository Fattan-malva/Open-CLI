import { ContentSection } from '../components/content-section'
import { PrivacyForm } from './privacy-form'

export function SettingsPrivacy() {
  return (
    <ContentSection
      title='Privacy'
      desc='Kontrol data login dan sesi website pada browser bawaan.'
    >
      <PrivacyForm />
    </ContentSection>
  )
}
