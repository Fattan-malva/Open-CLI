import { cn } from '@/lib/utils'
import { getAgentInitials } from '@/lib/agent-cli'
import { type AgentCliItem } from '../data/agents'

type AgentIconProps = {
  agent: Pick<AgentCliItem, 'name' | 'icon' | 'darkIcon' | 'iconClassName'>
  className?: string
}

export function AgentIcon({ agent, className }: AgentIconProps) {
  if (!agent.icon) {
    return (
      <span
        className={cn(
          'inline-flex h-12 items-center text-sm font-semibold tracking-tight text-muted-foreground',
          className
        )}
      >
        {getAgentInitials(agent.name)}
      </span>
    )
  }

  return (
    <span className={cn('relative inline-flex h-12 items-center', className)}>
      <img
        src={agent.icon}
        alt=''
        className={cn(
          'max-h-12 max-w-16 object-contain',
          agent.iconClassName,
          agent.darkIcon && 'dark:hidden'
        )}
      />
      {agent.darkIcon && (
        <img
          src={agent.darkIcon}
          alt=''
          className={cn(
            'absolute inset-0 m-auto hidden max-h-12 max-w-16 object-contain dark:block',
            agent.iconClassName
          )}
        />
      )}
    </span>
  )
}
