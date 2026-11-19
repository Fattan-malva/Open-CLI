import { createContext, useContext, useEffect, useState, useMemo } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { createCookieStore, COOKIE_KEYS } from '@/lib/cookie-store'
import { isDesktop } from '@/lib/platform'

type Theme = 'dark' | 'light' | 'system'
type ResolvedTheme = Exclude<Theme, 'system'>

const DEFAULT_THEME: Theme = 'dark'
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

const themeStore = createCookieStore<Theme>({
  key: COOKIE_KEYS.THEME,
  defaultValue: DEFAULT_THEME,
  maxAge: THEME_COOKIE_MAX_AGE,
})

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
}

type ThemeProviderState = {
  defaultTheme: Theme
  resolvedTheme: ResolvedTheme
  theme: Theme
  setTheme: (theme: Theme) => void
  resetTheme: () => void
}

const initialState: ThemeProviderState = {
  defaultTheme: DEFAULT_THEME,
  resolvedTheme: 'dark',
  theme: DEFAULT_THEME,
  setTheme: () => null,
  resetTheme: () => null,
}

const ThemeContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
}: ThemeProviderProps) {
  const [theme, _setTheme] = useState<Theme>(() => themeStore.get())
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => (theme === 'system' ? (systemDark ? 'dark' : 'light') : theme),
    [systemDark, theme]
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setSystemDark(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    if (!isDesktop) return
    void getCurrentWindow()
      .setTheme(resolvedTheme)
      .catch(() => undefined)
  }, [resolvedTheme])

  const setTheme = (theme: Theme) => {
    themeStore.set(theme)
    _setTheme(theme)
  }

  const resetTheme = () => {
    themeStore.remove()
    _setTheme(defaultTheme)
  }

  const contextValue = {
    defaultTheme,
    resolvedTheme,
    resetTheme,
    theme,
    setTheme,
  }

  return (
    <ThemeContext value={contextValue}>{children}</ThemeContext>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)

  if (!context) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}