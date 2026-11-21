export type IdeFile = {
  path: string
  name: string
  content: string
  original: string
  language: string
  binary: boolean
  truncated: boolean
}

export type IdeSidebarView = 'explorer' | 'search'

export type IdeLayout = {
  explorerWidth: number
  terminalHeight: number
  terminalRailWidth: number
  browserWidth: number
  explorerOpen: boolean
  terminalOpen: boolean
  browserOpen: boolean
}

export type IdeSettings = {
  formatOnSave: boolean
  wordWrap: boolean
  tabSize: number
  tabWidth: number
  printWidth: number
  semi: boolean
  singleQuote: boolean
}
