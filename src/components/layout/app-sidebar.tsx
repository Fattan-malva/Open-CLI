import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { CustomSocialIcon } from '@/features/social/custom-icon'
import { getAllSocialSiteKeys } from '@/features/social/data'
import {
  readCustomSocialSites,
  SOCIAL_SITES_CHANGED_EVENT,
} from '@/features/social/storage'
import {
  readSocialExpanded,
  readSocialOrder,
  sortSocialItems,
  writeSocialExpanded,
  writeSocialOrder,
} from '@/features/social/order'
// import { AppTitle } from './app-title'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import { TeamSwitcher } from './team-switcher'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const [socialOrder, setSocialOrder] = useState(readSocialOrder)
  const [socialExpanded, setSocialExpanded] = useState(readSocialExpanded)
  const [customSites, setCustomSites] = useState(readCustomSocialSites)

  useEffect(() => {
    const refresh = () => {
      const sites = readCustomSocialSites()
      setCustomSites(sites)
      setSocialOrder((previous) => {
        const validKeys = new Set(getAllSocialSiteKeys())
        const kept = previous.filter((key) => validKeys.has(key))
        const missing = [...validKeys].filter((key) => !kept.includes(key))
        return [...kept, ...missing]
      })
    }

    refresh()
    window.addEventListener(SOCIAL_SITES_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(SOCIAL_SITES_CHANGED_EVENT, refresh)
  }, [])

  useEffect(() => {
    writeSocialOrder(socialOrder)
  }, [socialOrder])

  useEffect(() => {
    writeSocialExpanded(socialExpanded)
  }, [socialExpanded])

  const navGroups = useMemo(
    () =>
      sidebarData.navGroups.map((group) => {
        if (group.title !== 'Social') return group

        const customItems = customSites.map((site) => ({
          title: site.label,
          url: `/social/${site.key}`,
          canDelete: true,
          icon: () => (
            <CustomSocialIcon label={site.label} iconUrl={site.iconUrl} />
          ),
        }))

        return {
          ...group,
          items: sortSocialItems(
            [...group.items, ...customItems],
            socialOrder
          ),
        }
      }),
    [customSites, socialOrder]
  )

  const handleSocialReorder = useCallback(
    (fromKey: string, toKey: string) => {
      setSocialOrder((previous) => {
        const fromIndex = previous.indexOf(fromKey)
        const toIndex = previous.indexOf(toKey)
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
          return previous
        }

        const next = [...previous]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        return next
      })
    },
    []
  )

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <TeamSwitcher teams={sidebarData.teams} />

        {/* Replace <TeamSwitch /> with the following <AppTitle />
         /* if you want to use the normal app title instead of TeamSwitch dropdown */}
        {/* <AppTitle /> */}
      </SidebarHeader>
      <SidebarContent className='sidebar-scroll'>
        {navGroups.map((props) => (
          <NavGroup
            key={props.title}
            {...props}
            reorderable={props.title === 'Social'}
            onReorder={
              props.title === 'Social' ? handleSocialReorder : undefined
            }
            collapsible={props.title === 'Social'}
            expanded={props.title === 'Social' ? socialExpanded : true}
            onExpandedChange={
              props.title === 'Social' ? setSocialExpanded : undefined
            }
            showAddSocial={props.title === 'Social'}
          />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
