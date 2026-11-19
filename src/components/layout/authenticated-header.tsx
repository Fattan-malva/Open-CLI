import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { ConfigDrawer } from '@/components/config-drawer'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Header } from '@/components/layout/header'

export function AuthenticatedHeader() {
  return (
    <Header fixed>
      <Search className='me-auto' />
      <ThemeSwitch />
      <ConfigDrawer />
      <ProfileDropdown />
    </Header>
  )
}