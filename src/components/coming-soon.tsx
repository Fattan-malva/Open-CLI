import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Telescope } from 'lucide-react'

export function ComingSoon() {
  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>

      <Main className='flex flex-1 flex-col items-center justify-center gap-2 text-center'>
        <Telescope size={72} />
        <h1 className='text-4xl leading-tight font-bold'>Coming Soon!</h1>
        <p className='text-center text-muted-foreground'>
          This page has not been created yet. <br />
          Stay tuned though!
        </p>
      </Main>
    </>
  )
}
