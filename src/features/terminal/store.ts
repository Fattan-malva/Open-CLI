import { create } from 'zustand'
import { ptyKill } from '@/lib/pty'

export type TerminalTab = {
  id: string
  title: string
  shell: string
  cwd?: string
  command?: string
  agentId?: string
}

type TerminalState = {
  tabs: TerminalTab[]
  activeId: string | null
  nextIndex: number
  add: (
    shell?: string,
    options?: { title?: string; cwd?: string; command?: string; agentId?: string }
  ) => string
  close: (id: string) => void
  rename: (id: string, title: string) => void
  setActive: (id: string) => void
  clear: () => void
}

let counter = 0

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeId: null,
  nextIndex: 1,
  add: (shell = 'powershell.exe', options = {}) => {
    const id = `pty-${Date.now()}-${counter++}`
    const tab: TerminalTab = {
      id,
      title: options.title?.trim() || `Terminal ${get().nextIndex}`,
      shell,
      cwd: options.cwd,
      command: options.command,
      agentId: options.agentId,
    }
    set((state) => ({
      tabs: [...state.tabs, tab],
      nextIndex: state.nextIndex + 1,
    }))
    return id
  },
  close: (id) => {
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.id === id)
      if (index === -1) return state
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      let activeId = state.activeId
      if (activeId === id) {
        activeId = tabs[Math.min(index, tabs.length - 1)]?.id ?? null
      }
      return {
        tabs,
        activeId,
        nextIndex: tabs.length === 0 ? 1 : state.nextIndex,
      }
    })
  },
  rename: (id, title) => {
    const value = title.trim()
    if (!value) return
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, title: value } : tab
      ),
    }))
  },
  setActive: (id) => set({ activeId: id }),
  clear: () => {
    get().tabs.forEach((tab) => void ptyKill(tab.id))
    set({ tabs: [], activeId: null, nextIndex: 1 })
  },
}))
