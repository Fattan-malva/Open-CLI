import {
  Bot,
  Globe,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  Settings,
  Terminal,
  Info,
  Workflow,
} from 'lucide-react'
import {
  IconDiscord,
  IconGithub,
  IconGmail,
  IconMicrosoft,
  IconTelegram,
  IconWhatsapp,
  IconZoom,
} from '@/assets/brand-icons'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  user: {
    name: 'Open CLI',
    email: 'Local workspace',
    avatar: '',
  },
  teams: [
    {
      name: 'Open CLI',
      logo: Terminal,
      plan: 'Desktop Terminal',
    },
  ],
  navGroups: [
    {
      title: 'Workspace',
      items: [
        {
          title: 'Terminal',
          url: '/terminal',
          icon: Terminal,
        },
        {
          title: 'Browser',
          url: '/browser',
          icon: Globe,
        },
        {
          title: 'Dashboard',
          url: '/',
          icon: LayoutDashboard,
        },
        {
          title: 'Tasks',
          url: '/tasks',
          icon: ListTodo,
        },
      ],
    },
    {
      title: 'Agent AI',
      items: [
        {
          title: 'Agent CLI',
          url: '/agent-cli',
          icon: Bot,
        },
        {
          title: 'Orchestration',
          url: '/agent-chat',
          icon: MessageSquare,
          badge: 'Soon',
        },
        {
          title: 'Custom Provider',
          url: '/agent-flow',
          icon: Workflow,
          badge: 'Soon',
        },
      ],
    },
    {
      title: 'Social',
      items: [
        {
          title: 'WhatsApp',
          url: '/social/whatsapp',
          icon: IconWhatsapp,
        },
        {
          title: 'Discord',
          url: '/social/discord',
          icon: IconDiscord,
        },
        {
          title: 'GitHub',
          url: '/social/github',
          icon: IconGithub,
        },
        {
          title: 'Zoom',
          url: '/social/zoom',
          icon: IconZoom,
        },
        {
          title: 'Telegram',
          url: '/social/telegram',
          icon: IconTelegram,
        },
        {
          title: 'Gmail',
          url: '/social/gmail',
          icon: IconGmail,
        },
        {
          title: 'Microsoft.com',
          url: '/social/microsoft',
          icon: IconMicrosoft,
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          title: 'About',
          url: '/about',
          icon: Info,
        },
        {
          title: 'Help',
          url: '/help-center',
          icon: HelpCircle,
        },
        {
          title: 'Settings',
          url: '/settings',
          icon: Settings,
        },
      ],
    },
  ],
}
