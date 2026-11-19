import aiderIcon from '@/assets/agent-cli/aider.svg'
import claudeIcon from '@/assets/agent-cli/claude.svg'
import clineIcon from '@/assets/agent-cli/cline.svg'
import codexIcon from '@/assets/agent-cli/codex.svg'
import commandCodeDarkIcon from '@/assets/agent-cli/commandcode-dark.svg'
import commandCodeLightIcon from '@/assets/agent-cli/commandcode-light.svg'
import geminiIcon from '@/assets/agent-cli/gemini.svg'
import gooseIcon from '@/assets/agent-cli/goose.svg'
import kiloIcon from '@/assets/agent-cli/kilo.svg'
import opencodeDarkIcon from '@/assets/agent-cli/opencode-dark.svg'
import opencodeLightIcon from '@/assets/agent-cli/opencode-light.svg'
import piIcon from '@/assets/agent-cli/pi.svg'
import qwenIcon from '@/assets/agent-cli/qwen.svg'

export type AgentCliItem = {
  id: string
  name: string
  command: string
  description: string
  icon?: string
  darkIcon?: string
  iconClassName?: string
  shortcut?: string[]
  custom?: boolean
}

export const builtInAgents: AgentCliItem[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    command: 'opencode',
    description: 'Multi-model, coding agent',
    icon: opencodeLightIcon,
    darkIcon: opencodeDarkIcon,
    iconClassName: 'size-8',
    shortcut: ['Ctrl', 'T', 'O'],
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    command: 'claude',
    description: 'Autonomous coding agent',
    icon: claudeIcon,
    iconClassName: 'size-9',
    shortcut: ['Ctrl', 'T', 'C'],
  },
  {
    id: 'codex-cli',
    name: 'Codex CLI',
    command: 'codex',
    description: 'AI coding & task execution',
    icon: codexIcon,
    iconClassName: 'size-9',
    shortcut: ['Ctrl', 'T', 'C'],
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    command: 'gemini',
    description: 'Coding, analysis & agent',
    icon: geminiIcon,
    iconClassName: 'size-9',
    shortcut: ['Ctrl', 'T', 'G'],
  },
  {
    id: 'aider',
    name: 'Aider',
    command: 'aider',
    description: 'AI pair programming + Git',
    icon: aiderIcon,
    iconClassName: 'h-5 w-14',
    shortcut: ['Ctrl', 'T', 'A'],
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    command: 'qwen',
    description: 'AI coding agent',
    icon: qwenIcon,
    iconClassName: 'size-9',
    shortcut: ['Ctrl', 'T', 'Q'],
  },
  {
    id: 'goose',
    name: 'Goose',
    command: 'goose',
    description: 'General-purpose AI agent',
    icon: gooseIcon,
    iconClassName: 'size-9 dark:invert',
    shortcut: ['Ctrl', 'T', 'G'],
  },
  {
    id: 'kilo-cli',
    name: 'Kilo CLI',
    command: 'kilo',
    description: 'Coding agent dengan mode/workflow',
    icon: kiloIcon,
    iconClassName: 'size-9',
    shortcut: ['Ctrl', 'T', 'K'],
  },
  {
    id: 'cline-cli',
    name: 'Cline CLI',
    command: 'cline',
    description: 'Autonomous coding & tools',
    icon: clineIcon,
    iconClassName: 'size-9 dark:invert',
    shortcut: ['Ctrl', 'T', 'C'],
  },
  {
    id: 'pi-coding-agent',
    name: 'Pi Coding Agent',
    command: 'pi',
    description: 'Minimal, extensible coding agent',
    icon: piIcon,
    iconClassName: 'size-9',
    shortcut: ['Ctrl', 'T', 'P'],
  },
  {
    id: 'command-code',
    name: 'Command Code',
    command: 'cmd',
    description: 'Coding agent open models dengan taste learning',
    icon: commandCodeLightIcon,
    darkIcon: commandCodeDarkIcon,
    iconClassName: 'h-7 max-w-24',
    shortcut: ['Ctrl', 'T', 'C'],
  },
]
