import { getAllSocialSiteKeys } from './data'

const STORAGE_KEY = 'opencli.social.order.v1'
const EXPANDED_KEY = 'opencli.social.expanded.v1'
const DEFAULT_ORDER = [
  'whatsapp',
  'discord',
  'github',
  'zoom',
  'telegram',
  'gmail',
  'microsoft',
]

function defaultOrder(): string[] {
  return [
    ...DEFAULT_ORDER,
    ...getAllSocialSiteKeys().filter((key) => !DEFAULT_ORDER.includes(key)),
  ]
}

export function socialKeyFromUrl(url?: string) {
  if (!url?.startsWith('/social/')) return null
  return url.slice('/social/'.length)
}

export function readSocialOrder(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultOrder()

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return defaultOrder()

    const result: string[] = []
    const seen = new Set<string>()
    const validKeys = new Set(getAllSocialSiteKeys())
    for (const value of parsed) {
      if (typeof value === 'string' && validKeys.has(value) && !seen.has(value)) {
        result.push(value)
        seen.add(value)
      }
    }

    for (const key of getAllSocialSiteKeys()) {
      if (!seen.has(key)) result.push(key)
    }

    return result
  } catch {
    return defaultOrder()
  }
}

export function writeSocialOrder(order: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  } catch {
    return
  }
}

export function readSocialExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) !== 'false'
  } catch {
    return true
  }
}

export function writeSocialExpanded(expanded: boolean) {
  try {
    localStorage.setItem(EXPANDED_KEY, String(expanded))
  } catch {
    return
  }
}

export function sortSocialItems<T extends { url?: string }>(
  items: T[],
  order: string[] = readSocialOrder()
): T[] {
  const rank = new Map(order.map((key, index) => [key, index]))

  return [...items].sort((left, right) => {
    const leftRank = rank.get(socialKeyFromUrl(left.url) ?? '') ?? Number.MAX_SAFE_INTEGER
    const rightRank = rank.get(socialKeyFromUrl(right.url) ?? '') ?? Number.MAX_SAFE_INTEGER
    return leftRank - rightRank
  })
}
