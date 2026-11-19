import { type ComponentType, type SVGProps } from 'react'
import { Bot, BrainCircuit, PenLine, Sparkles, Zap } from 'lucide-react'
import { readCustomBrainstormApps } from './storage'

export type BrainstormApp = {
  key: string
  label: string
  url: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  iconUrl?: string
}

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
    icon: Sparkles,
  },
  claude: {
    key: 'claude',
    label: 'Claude Chat',
    url: 'https://claude.ai/',
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
