export type CustomSocialSite = {
  key: string
  label: string
  url: string
  iconUrl?: string
}

const STORAGE_KEY = 'opencli.social.custom.v1'
export const SOCIAL_SITES_CHANGED_EVENT = 'opencli:social-sites-changed'

export function normalizeSocialUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname) return null
    return url.toString()
  } catch {
    return null
  }
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app'
  )
}

function isIconUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (value.startsWith('data:image/') ||
      value.startsWith('http://') ||
      value.startsWith('https://'))
  )
}

export function readCustomSocialSites(): CustomSocialSite[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const result: CustomSocialSite[] = []
    const seen = new Set<string>()
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue
      const site = value as Record<string, unknown>
      const key = typeof site.key === 'string' ? site.key : null
      const label = typeof site.label === 'string' ? site.label.trim() : ''
      const url = normalizeSocialUrl(
        typeof site.url === 'string' ? site.url : ''
      )
      if (!key || !label || !url || seen.has(key)) continue
      result.push({
        key,
        label,
        url,
        ...(isIconUrl(site.iconUrl) ? { iconUrl: site.iconUrl } : {}),
      })
      seen.add(key)
    }
    return result
  } catch {
    return []
  }
}

export function writeCustomSocialSites(sites: CustomSocialSite[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sites))
  } catch {
    return
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SOCIAL_SITES_CHANGED_EVENT))
  }
}

export function removeCustomSocialSite(key: string) {
  const sites = readCustomSocialSites()
  const next = sites.filter((site) => site.key !== key)
  if (next.length === sites.length) return
  writeCustomSocialSites(next)
}

export function addCustomSocialSite(input: {
  label: string
  url: string
  iconUrl?: string
}): CustomSocialSite {
  const sites = readCustomSocialSites()
  const base = `custom-${slugify(input.label)}`
  let key = `${base}-${Date.now().toString(36)}`
  while (sites.some((site) => site.key === key)) {
    key = `${base}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`
  }

  const site: CustomSocialSite = {
    key,
    label: input.label.trim(),
    url: normalizeSocialUrl(input.url) ?? input.url,
    ...(isIconUrl(input.iconUrl) ? { iconUrl: input.iconUrl } : {}),
  }

  writeCustomSocialSites([...sites, site])
  return site
}
