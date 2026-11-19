import { create } from 'zustand'
import { createCookieStore, COOKIE_KEYS } from '@/lib/cookie-store'

interface AuthUser {
  accountNo: string
  email: string
  role: string[]
  exp: number
}

interface AuthState {
  auth: {
    user: AuthUser | null
    setUser: (user: AuthUser | null) => void
    accessToken: string
    setAccessToken: (accessToken: string) => void
    resetAccessToken: () => void
    reset: () => void
  }
}

const tokenStore = createCookieStore<string>({
  key: COOKIE_KEYS.AUTH_TOKEN,
  defaultValue: '',
})

export const useAuthStore = create<AuthState>()((set) => ({
  auth: {
    user: null,
    setUser: (user) =>
      set((state) => ({ ...state, auth: { ...state.auth, user } })),
    accessToken: tokenStore.get(),
    setAccessToken: (accessToken) =>
      set((state) => {
        tokenStore.set(accessToken)
        return { ...state, auth: { ...state.auth, accessToken } }
      }),
    resetAccessToken: () =>
      set((state) => {
        tokenStore.remove()
        return { ...state, auth: { ...state.auth, accessToken: '' } }
      }),
    reset: () =>
      set((state) => {
        tokenStore.remove()
        return {
          ...state,
          auth: { ...state.auth, user: null, accessToken: '' },
        }
      }),
  },
}))