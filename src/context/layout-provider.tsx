import { createContext, useContext, useState } from 'react'
import { createCookieStore, COOKIE_KEYS } from '@/lib/cookie-store'

export type Collapsible = 'offcanvas' | 'icon' | 'none'
type Variant = 'inset' | 'sidebar' | 'floating'

const LAYOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const DEFAULT_VARIANT: Variant = 'inset'
const DEFAULT_COLLAPSIBLE: Collapsible = 'icon'

const collapsibleStore = createCookieStore<Collapsible>({
  key: COOKIE_KEYS.LAYOUT_COLLAPSIBLE,
  defaultValue: DEFAULT_COLLAPSIBLE,
  maxAge: LAYOUT_COOKIE_MAX_AGE,
})

const variantStore = createCookieStore<Variant>({
  key: COOKIE_KEYS.LAYOUT_VARIANT,
  defaultValue: DEFAULT_VARIANT,
  maxAge: LAYOUT_COOKIE_MAX_AGE,
})

type LayoutContextType = {
  resetLayout: () => void

  defaultCollapsible: Collapsible
  collapsible: Collapsible
  setCollapsible: (collapsible: Collapsible) => void

  defaultVariant: Variant
  variant: Variant
  setVariant: (variant: Variant) => void
}

const LayoutContext = createContext<LayoutContextType | null>(null)

type LayoutProviderProps = {
  children: React.ReactNode
}

export function LayoutProvider({ children }: LayoutProviderProps) {
  const [collapsible, _setCollapsible] = useState<Collapsible>(() =>
    collapsibleStore.get()
  )
  const [variant, _setVariant] = useState<Variant>(() => variantStore.get())

  const setCollapsible = (newCollapsible: Collapsible) => {
    _setCollapsible(newCollapsible)
    collapsibleStore.set(newCollapsible)
  }

  const setVariant = (newVariant: Variant) => {
    _setVariant(newVariant)
    variantStore.set(newVariant)
  }

  const resetLayout = () => {
    setCollapsible(DEFAULT_COLLAPSIBLE)
    setVariant(DEFAULT_VARIANT)
  }

  const contextValue: LayoutContextType = {
    resetLayout,
    defaultCollapsible: DEFAULT_COLLAPSIBLE,
    collapsible,
    setCollapsible,
    defaultVariant: DEFAULT_VARIANT,
    variant,
    setVariant,
  }

  return <LayoutContext value={contextValue}>{children}</LayoutContext>
}

export function useLayout() {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider')
  }
  return context
}