import { type ComponentType, type SVGProps } from 'react'
import {
  IconDiscord,
  IconGithub,
  IconGmail,
  IconMicrosoft,
  IconTelegram,
  IconWhatsapp,
  IconZoom,
} from '@/assets/brand-icons'
import { readCustomSocialSites } from './storage'

export type SocialSite = {
  label: string
  url: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  iconUrl?: string
}

export const socialSites: Record<string, SocialSite> = {
  whatsapp: {
    label: 'WhatsApp',
    url: 'https://web.whatsapp.com/',
    icon: IconWhatsapp,
  },
  discord: {
    label: 'Discord',
    url: 'https://discord.com/app',
    icon: IconDiscord,
  },
  github: {
    label: 'GitHub',
    url: 'https://github.com/',
    icon: IconGithub,
  },
  zoom: {
    label: 'Zoom',
    url: 'https://zoom.us/',
    icon: IconZoom,
  },
  telegram: {
    label: 'Telegram',
    url: 'https://web.telegram.org/',
    icon: IconTelegram,
  },
  gmail: {
    label: 'Gmail',
    url: 'https://mail.google.com/',
    icon: IconGmail,
  },
  microsoft: {
    label: 'Microsoft.com',
    url: 'https://www.microsoft.com/',
    icon: IconMicrosoft,
  },
}

export function getAllSocialSiteKeys(): string[] {
  return [
    ...Object.keys(socialSites),
    ...readCustomSocialSites().map((site) => site.key),
  ]
}

export function getSocialSite(site: string | null): SocialSite | null {
  if (!site) return null

  const custom = readCustomSocialSites().find((item) => item.key === site)
  if (custom) {
    return {
      label: custom.label,
      url: custom.url,
      ...(custom.iconUrl ? { iconUrl: custom.iconUrl } : {}),
    }
  }

  return socialSites[site] ?? null
}
