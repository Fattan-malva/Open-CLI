import {
  Globe,
  HelpCircle,
  LayoutDashboard,
  ListTodo,
  Settings,
  Terminal,
  Info,
} from 'lucide-react'
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
