import { lazy, Suspense, useEffect, useLayoutEffect } from 'react'
import { Outlet, useLocation } from '@tanstack/react-router'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SkipToMain } from '@/components/skip-to-main'
import { BrainstormingWorkspace } from '@/features/brainstorming'
import { BrowserWorkspace } from '@/features/browser'
import { SocialWorkspace } from '@/features/social'
import { TerminalWorkspace } from '@/features/terminal'
import { detachOrchestratorListeners } from '@/features/orchestrator/store'
import { hideAllBrowserViews } from '@/lib/browser'
import { watchWebviewOverlays } from '@/lib/webview-overlay'

const IdeWorkspace = lazy(() =>
  import('@/features/ide').then((module) => ({ default: module.IdeWorkspace }))
)

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  const pathname = useLocation({ select: (location) => location.pathname })
  const socialSite = pathname.startsWith('/social/')
    ? (pathname.split('/')[2] ?? null)
    : null

  // Runs before the panes' effects, so a native webview never stays on top of another menu.
  // The pane that becomes active shows its own webview again right after this.
  useLayoutEffect(() => {
    void hideAllBrowserViews().catch(() => undefined)
  }, [pathname])

  useEffect(() => watchWebviewOverlays(), [])

  useEffect(() => () => detachOrchestratorListeners(), [])

  return (
    <SearchProvider>
      <LayoutProvider>
        <SidebarProvider defaultOpen={defaultOpen}>
          <SkipToMain />
          <AppSidebar />
          <SidebarInset
            className={cn(
              '@container/content',
              'has-data-[layout=fixed]:h-svh',
              'peer-data-[variant=inset]:has-data-[layout=fixed]:h-[calc(100svh-(var(--spacing)*4))]',
              pathname === '/ide' &&
                'peer-data-[variant=inset]:has-data-[layout=fixed]:!h-svh md:!m-0 md:!rounded-none md:!shadow-none'
            )}
          >
            {children ?? <Outlet />}
            <BrowserWorkspace visible={pathname === '/browser'} />
            <BrainstormingWorkspace visible={pathname === '/brainstorming'} />
            <SocialWorkspace site={socialSite} />
            <TerminalWorkspace visible={pathname === '/terminal'} />
            {pathname === '/ide' && (
              <Suspense fallback={null}>
                <IdeWorkspace visible />
              </Suspense>
            )}
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </SearchProvider>
  )
}