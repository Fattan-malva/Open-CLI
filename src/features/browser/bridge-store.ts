import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { isDesktop } from '@/lib/platform'

export type BridgeGrant = {
  token: string
  port: number
  tabLabel: string
  agentId: string
  expiresAt: number
}

type BridgeState = {
  grants: BridgeGrant[]
  error: string | null
  shareBrowser: (tabLabel: string, agentId: string) => Promise<void>
  revokeBrowser: (token: string) => Promise<void>
  forgetGrant: (token: string) => void
  forgetTabGrants: (tabLabel: string) => void
  pruneGrants: () => void
  clearError: () => void
}

function requireDesktop(): void {
  if (!isDesktop) throw new Error('Browser sharing requires the desktop runtime')
}

export const useBridgeStore = create<BridgeState>()((set) => ({
  grants: [],
  error: null,

  shareBrowser: async (tabLabel, agentId) => {
    try {
      requireDesktop()
      const grant = await invoke<BridgeGrant>('browser_bridge_start', { tabLabel, agentId })
      set((state) => ({
        grants: [...state.grants.filter((item) => item.tabLabel !== tabLabel), grant],
        error: null,
      }))
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  revokeBrowser: async (token) => {
    requireDesktop()
    await invoke<void>('browser_bridge_stop', { token })
    set((state) => ({ grants: state.grants.filter((item) => item.token !== token) }))
  },

  forgetGrant: (token) => {
    set((state) => ({ grants: state.grants.filter((item) => item.token !== token) }))
  },

  forgetTabGrants: (tabLabel) => {
    set((state) => ({ grants: state.grants.filter((item) => item.tabLabel !== tabLabel) }))
  },

  pruneGrants: () => {
    const now = Date.now()
    set((state) => {
      const grants = state.grants.filter((item) => item.expiresAt > now)
      return grants.length === state.grants.length ? state : { grants }
    })
  },

  clearError: () => set({ error: null }),
}))
