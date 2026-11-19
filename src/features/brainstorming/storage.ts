export type CustomBrainstormApp = {
  key: string
  label: string
  url: string
  iconUrl?: string
}

export type BrainstormSelection = {
  left: string
  right: string
}

const CUSTOM_APPS_KEY = 'opencli.brainstorming.custom.v1'
const SPLIT_KEY = 'opencli.brainstorming.split.v1'
const SELECTION_KEY = 'opencli.brainstorming.selection.v1'

export const BRAINSTORM_APPS_CHANGED_EVENT = 'opencli:brainstorming-apps-changed'

export const DEFAULT_BRAINSTORM_SELECTION: BrainstormSelection = {
  left: 'excalidraw',
  right: 'chatgpt',
}

export function normalizeBrainstormUrl(value: string): string | null {
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

function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(0.75, Math.max(0.25, value))
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

export function readCustomBrainstormApps(): CustomBrainstormApp[] {
  try {
    const raw = localStorage.getItem(CUSTOM_APPS_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const result: CustomBrainstormApp[] = []
    const seen = new Set<string>()
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue
      const app = value as Record<string, unknown>
      const key = typeof app.key === 'string' ? app.key : null
      const label = typeof app.label === 'string' ? app.label.trim() : ''
      const url = normalizeBrainstormUrl(typeof app.url === 'string' ? app.url : '')
      if (!key || !label || !url || seen.has(key)) continue
      result.push({
        key,
        label,
        url,
        ...(isIconUrl(app.iconUrl) ? { iconUrl: app.iconUrl } : {}),
      })
      seen.add(key)
    }
    return result
  } catch {
    return []
  }
}

export function writeCustomBrainstormApps(apps: CustomBrainstormApp[]) {
  try {
    localStorage.setItem(CUSTOM_APPS_KEY, JSON.stringify(apps))
  } catch {
    return
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BRAINSTORM_APPS_CHANGED_EVENT))
  }
}

export function addCustomBrainstormApp(input: {
  label: string
  url: string
  iconUrl?: string
}): CustomBrainstormApp {
  const apps = readCustomBrainstormApps()
  const base = `custom-${slugify(input.label)}`
  let key = `${base}-${Date.now().toString(36)}`
  while (apps.some((app) => app.key === key)) {
    key = `${base}-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`
  }

  const app: CustomBrainstormApp = {
    key,
    label: input.label.trim(),
    url: normalizeBrainstormUrl(input.url) ?? input.url,
    ...(isIconUrl(input.iconUrl) ? { iconUrl: input.iconUrl } : {}),
  }

  writeCustomBrainstormApps([...apps, app])
  return app
}

export function readBrainstormSplitRatio() {
  try {
    const raw = localStorage.getItem(SPLIT_KEY)
    if (!raw) return 0.5
    return clampRatio(Number(raw))
  } catch {
    return 0.5
  }
}

export function writeBrainstormSplitRatio(value: number) {
  try {
    localStorage.setItem(SPLIT_KEY, String(clampRatio(value)))
  } catch {
    return
  }
}

export function readBrainstormSelection(): BrainstormSelection {
  try {
    const raw = localStorage.getItem(SELECTION_KEY)
    if (!raw) return { ...DEFAULT_BRAINSTORM_SELECTION }

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_BRAINSTORM_SELECTION }
    }

    const value = parsed as Record<string, unknown>
    return {
      left:
        typeof value.left === 'string' && value.left
          ? value.left
          : DEFAULT_BRAINSTORM_SELECTION.left,
      right:
        typeof value.right === 'string' && value.right
          ? value.right
          : DEFAULT_BRAINSTORM_SELECTION.right,
    }
  } catch {
    return { ...DEFAULT_BRAINSTORM_SELECTION }
  }
}

export function writeBrainstormSelection(selection: BrainstormSelection) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(selection))
  } catch {
    return
  }
}
