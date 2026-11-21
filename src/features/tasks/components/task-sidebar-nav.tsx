import {
  BellRing,
  CalendarDays,
  CheckSquare2,
  ListTodo,
  type LucideIcon,
} from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type TaskSection = 'tugas' | 'todo' | 'kalender' | 'pengingat'

const sections: { value: TaskSection; title: string; icon: LucideIcon }[] = [
  { value: 'tugas', title: 'Tugas', icon: ListTodo },
  { value: 'todo', title: 'Todo', icon: CheckSquare2 },
  { value: 'kalender', title: 'Kalender', icon: CalendarDays },
  { value: 'pengingat', title: 'Pengingat', icon: BellRing },
]

type TaskSidebarNavProps = {
  value: TaskSection
  onChange: (value: TaskSection) => void
}

export function TaskSidebarNav({ value, onChange }: TaskSidebarNavProps) {
  return (
    <>
      <div className='p-1 md:hidden'>
        <Select
          value={value}
          onValueChange={(next) => onChange(next as TaskSection)}
        >
          <SelectTrigger className='h-12 sm:w-48'>
            <SelectValue placeholder='Pilih bagian' />
          </SelectTrigger>
          <SelectContent>
            {sections.map((section) => (
              <SelectItem key={section.value} value={section.value}>
                <div className='flex items-center gap-3 px-2 py-1'>
                  <section.icon className='size-4' />
                  <span>{section.title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea
        orientation='horizontal'
        type='always'
        className='hidden w-full min-w-40 bg-background px-1 py-2 md:block'
      >
        <nav className='flex space-x-2 py-1 lg:flex-col lg:space-y-1 lg:space-x-0'>
          {sections.map((section) => (
            <button
              key={section.value}
              type='button'
              onClick={() => onChange(section.value)}
              className={cn(
                buttonVariants({ variant: 'ghost' }),
                value === section.value ? 'bg-muted hover:bg-accent' : 'hover:bg-accent',
                'justify-start'
              )}
            >
              <section.icon className='me-2 size-[18px]' />
              {section.title}
            </button>
          ))}
        </nav>
      </ScrollArea>
    </>
  )
}
