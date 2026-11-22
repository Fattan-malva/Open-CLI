import { create } from 'zustand'
import { languageForPath } from './lib/language'
import type {
  IdeFile,
  IdeLayout,
  IdeSettings,
  IdeSidebarView,
} from './types'

const ROOT_KEY = 'opencli.ide.root.v1'
const LAYOUT_KEY = 'opencli.ide.layout.v1'
const SETTINGS_KEY = 'opencli.ide.settings.v1'

const DEFAULT_LAYOUT: IdeLayout = {
  explorerWidth: 260,
  terminalHeight: 220,
  terminalRailWidth: 168,
  browserWidth: 420,
  explorerOpen: true,
  terminalOpen: true,
  browserOpen: false,
}

const DEFAULT_SETTINGS: IdeSettings = {
  formatOnSave: true,
  wordWrap: false,
  tabSize: 2,
  tabWidth: 2,
  printWidth: 80,
  semi: true,
  singleQuote: false,
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

function fileName(path: string) {
  return path.replace(/\\/g, '/').split('/').pop() || path
}

function normalizedPath(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function pathWithin(path: string, parent: string) {
  const current = normalizedPath(path)
  const root = normalizedPath(parent)
  return current === root || current.startsWith(`${root}/`)
}

function renamePathPrefix(path: string, from: string, to: string): string | null {
  const current = normalizedPath(path)
  const oldRoot = normalizedPath(from)
  if (current === oldRoot) return to
  if (!pathWithin(current, oldRoot)) return null
  const next = `${to}${current.slice(oldRoot.length)}`
  return to.includes('\\') ? next.replace(/\//g, '\\') : next
}

type IdeState = {
  root: string | null
  files: IdeFile[]
  activePath: string | null
  expandedFolders: string[]
  sidebarView: IdeSidebarView
  layout: IdeLayout
  settings: IdeSettings
  setRoot: (root: string | null) => void
  openFile: (file: Omit<IdeFile, 'name' | 'language'>) => void
  updateContent: (path: string, content: string) => void
  markSaved: (path: string) => void
  closeFile: (path: string) => void
  renamePath: (from: string, to: string) => void
  removePath: (path: string) => void
  setActive: (path: string | null) => void
  toggleFolder: (path: string) => void
  setSidebarView: (view: IdeSidebarView) => void
  setLayout: (patch: Partial<IdeLayout>) => void
  setSettings: (patch: Partial<IdeSettings>) => void
}

export const useIdeStore = create<IdeState>((set, get) => ({
  root: (() => {
    try {
      return localStorage.getItem(ROOT_KEY)
    } catch {
      return null
    }
  })(),
  files: [],
  activePath: null,
  expandedFolders: [],
  sidebarView: 'explorer',
  layout: readJson(LAYOUT_KEY, DEFAULT_LAYOUT),
  settings: readJson(SETTINGS_KEY, DEFAULT_SETTINGS),

  setRoot: (root) => {
    try {
      if (root) localStorage.setItem(ROOT_KEY, root)
      else localStorage.removeItem(ROOT_KEY)
    } catch {
      return
    }
    set({ root, files: [], activePath: null, expandedFolders: [] })
  },

  openFile: (file) => {
    const name = fileName(file.path)
    const nextFile: IdeFile = {
      ...file,
      name,
      language: languageForPath(file.path),
    }
    set((state) => {
      const exists = state.files.some((item) => item.path === file.path)
      return {
        files: exists ? state.files : [...state.files, nextFile],
        activePath: file.path,
      }
    })
  },

  updateContent: (path, content) =>
    set((state) => ({
      files: state.files.map((file) =>
        file.path === path ? { ...file, content } : file
      ),
    })),

  markSaved: (path) =>
    set((state) => ({
      files: state.files.map((file) =>
        file.path === path ? { ...file, original: file.content } : file
      ),
    })),

  closeFile: (path) =>
    set((state) => {
      const index = state.files.findIndex((file) => file.path === path)
      if (index === -1) return state
      const files = state.files.filter((file) => file.path !== path)
      let activePath = state.activePath
      if (activePath === path) {
        activePath = files[Math.min(index, files.length - 1)]?.path ?? null
      }
      return { files, activePath }
    }),

  renamePath: (from, to) =>
    set((state) => ({
      files: state.files.map((file) => {
        const nextPath = renamePathPrefix(file.path, from, to)
        if (!nextPath) return file
        return {
          ...file,
          path: nextPath,
          name: fileName(nextPath),
          language: languageForPath(nextPath),
        }
      }),
      activePath: state.activePath
        ? renamePathPrefix(state.activePath, from, to) ?? state.activePath
        : null,
      expandedFolders: state.expandedFolders.map(
        (path) => renamePathPrefix(path, from, to) ?? path
      ),
    })),

  removePath: (path) =>
    set((state) => ({
      files: state.files.filter((file) => !pathWithin(file.path, path)),
      activePath:
        state.activePath && pathWithin(state.activePath, path)
          ? null
          : state.activePath,
      expandedFolders: state.expandedFolders.filter(
        (item) => !pathWithin(item, path)
      ),
    })),

  setActive: (activePath) => set({ activePath }),

  toggleFolder: (path) =>
    set((state) => ({
      expandedFolders: state.expandedFolders.includes(path)
        ? state.expandedFolders.filter((item) => item !== path)
        : [...state.expandedFolders, path],
    })),

  setSidebarView: (sidebarView) => set({ sidebarView }),

  setLayout: (patch) => {
    const layout = { ...get().layout, ...patch }
    writeJson(LAYOUT_KEY, layout)
    set({ layout })
  },

  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    writeJson(SETTINGS_KEY, settings)
    set({ settings })
  },
}))
