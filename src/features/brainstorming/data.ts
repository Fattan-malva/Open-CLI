import { type ComponentType, type SVGProps } from 'react'
import { Bot, BrainCircuit, PenLine, Sparkles, Zap } from 'lucide-react'
import { readCustomBrainstormApps } from './storage'

export type BrainstormApp = {
  key: string
  label: string
  url: string
  /** Page where the chat lets the user add a custom MCP connector. */
  connectorsUrl?: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  iconUrl?: string
}

export type McpServerPreset = {
  key: string
  label: string
  url: string
}

export const BRAINSTORM_MCP_SERVERS: McpServerPreset[] = [
  {
    key: 'excalidraw',
    label: 'Excalidraw',
    url: 'https://api.excalidraw.com/api/v1/mcp',
  },
]

export const brainstormApps: Record<string, BrainstormApp> = {
  excalidraw: {
    key: 'excalidraw',
    label: 'Excalidraw',
    url: 'https://excalidraw.com/',
    icon: PenLine,
  },
  chatgpt: {
    key: 'chatgpt',
    label: 'ChatGPT',
    url: 'https://chatgpt.com/',
    connectorsUrl: 'https://chatgpt.com/#settings/Connectors',
    icon: Sparkles,
  },
  claude: {
    key: 'claude',
    label: 'Claude Chat',
    url: 'https://claude.ai/',
    connectorsUrl: 'https://claude.ai/customize/connectors',
    icon: Bot,
  },
  deepseek: {
    key: 'deepseek',
    label: 'DeepSeek Chat',
    url: 'https://chat.deepseek.com/',
    icon: BrainCircuit,
  },
  gemini: {
    key: 'gemini',
    label: 'Gemini Chat',
    url: 'https://gemini.google.com/',
    icon: Zap,
  },
}

export function isCustomBrainstormApp(key: string) {
  return key.startsWith('custom-')
}

export function getBrainstormApp(key: string | null): BrainstormApp | null {
  if (!key) return null

  const custom = readCustomBrainstormApps().find((app) => app.key === key)
  if (custom) return custom

  return brainstormApps[key] ?? null
}
