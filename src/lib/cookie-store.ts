import { getCookie, setCookie, removeCookie } from './cookies'

export interface CookieStoreOptions<T> {
  key: string
  defaultValue: T
  maxAge?: number
  serialize?: (value: T) => string
  deserialize?: (value: string) => T
}

export function createCookieStore<T>({
  key,
  defaultValue,
  maxAge = 60 * 60 * 24 * 365,
  serialize = JSON.stringify,
  deserialize = JSON.parse,
}: CookieStoreOptions<T>) {
  return {
    get: (): T => {
      if (typeof document === 'undefined') return defaultValue
      const raw = getCookie(key)
      if (!raw) return defaultValue
      try {
        return deserialize(raw)
      } catch {
        return defaultValue
      }
    },
    set: (value: T): void => {
      if (typeof document === 'undefined') return
      setCookie(key, serialize(value), maxAge)
    },
    remove: (): void => {
      if (typeof document === 'undefined') return
      removeCookie(key)
    },
    key,
  }
}

export const COOKIE_KEYS = {
  THEME: 'vite-ui-theme',
  LAYOUT_COLLAPSIBLE: 'layout_collapsible',
  LAYOUT_VARIANT: 'layout_variant',
  FONT: 'font',
  SIDEBAR_STATE: 'sidebar_state',
  AUTH_TOKEN: 'thisisjustarandomstring',
} as const