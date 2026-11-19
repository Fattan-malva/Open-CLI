import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronRight, GripVertical } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { AddSocialPopover } from '@/features/social/add-social-popover'
import { DeleteSocialButton } from '@/features/social/delete-social-button'
import { socialKeyFromUrl } from '@/features/social/order'
import { cn } from '@/lib/utils'
import { Badge } from '../ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
  type NavCollapsible,
  type NavItem,
  type NavLink,
  type NavGroup as NavGroupProps,
} from './types'

export function NavGroup({
  title,
  items,
  reorderable = false,
  onReorder,
  collapsible = false,
  expanded = true,
  onExpandedChange,
  showAddSocial = false,
}: NavGroupProps) {
  const { state, isMobile } = useSidebar()
  const href = useLocation({ select: (location) => location.href })
  const itemRefs = useRef(new Map<string, HTMLLIElement>())
  const dragKeyRef = useRef<string | null>(null)
  const overKeyRef = useRef<string | null>(null)
  const cleanupDragRef = useRef<(() => void) | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    startY: number
    key: string
    order: string[]
    rects: Map<string, DOMRect>
    step: number
  } | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const isExpanded = !collapsible || expanded

  useEffect(() => () => cleanupDragRef.current?.(), [])

  useEffect(() => {
    if (!dragKey) return
    const previous = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.userSelect = previous
    }
  }, [dragKey])

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()

    const handle = event.currentTarget
    const pointerId = event.pointerId
    const order = Array.from(itemRefs.current.keys())
    const rects = new Map<string, DOMRect>()
    for (const [itemKey, element] of itemRefs.current) {
      rects.set(itemKey, element.getBoundingClientRect())
    }
    const keyIndex = order.indexOf(key)
    const draggedRect = rects.get(key)
    const nextRect = keyIndex >= 0 ? rects.get(order[keyIndex + 1]) : undefined
    const prevRect = keyIndex > 0 ? rects.get(order[keyIndex - 1]) : undefined
    const gap =
      nextRect && draggedRect
        ? Math.max(0, nextRect.top - draggedRect.bottom)
        : draggedRect && prevRect
          ? Math.max(0, draggedRect.top - prevRect.bottom)
          : 4
    const step = (draggedRect?.height ?? 32) + gap

    handle.setPointerCapture?.(pointerId)
    dragStateRef.current = {
      pointerId,
      startY: event.clientY,
      key,
      order,
      rects,
      step,
    }
    dragKeyRef.current = key
    overKeyRef.current = key
    setDragKey(key)
    setOverKey(key)

    const keyAtPoint = (clientY: number) => {
      let nearest: { key: string; distance: number } | null = null
      for (const [itemKey, rect] of rects) {
        if (clientY >= rect.top && clientY <= rect.bottom) return itemKey
        const distance = Math.min(
          Math.abs(clientY - rect.top),
          Math.abs(clientY - rect.bottom)
        )
        if (!nearest || distance < nearest.distance) {
          nearest = { key: itemKey, distance }
        }
      }
      return nearest?.key ?? key
    }

    const applyTransforms = (clientY: number, targetKey: string) => {
      const state = dragStateRef.current
      if (!state) return
      const dy = clientY - state.startY
      const fromIndex = state.order.indexOf(state.key)
      const toIndex = Math.max(0, state.order.indexOf(targetKey))

      for (const [itemKey, element] of itemRefs.current) {
        const index = state.order.indexOf(itemKey)
        if (itemKey === state.key) {
          element.style.transform = `translate3d(0, ${dy}px, 0)`
          element.style.zIndex = '20'
          element.style.willChange = 'transform'
          element.style.transition = 'none'
          continue
        }

        let shift = 0
        if (fromIndex < toIndex && index > fromIndex && index <= toIndex) {
          shift = -state.step
        } else if (
          fromIndex > toIndex &&
          index >= toIndex &&
          index < fromIndex
        ) {
          shift = state.step
        }
        element.style.transform = shift ? `translate3d(0, ${shift}px, 0)` : ''
        element.style.transition = 'transform 150ms ease-out'
        element.style.willChange = 'transform'
      }
    }

    const resetStyles = () => {
      for (const element of itemRefs.current.values()) {
        element.style.transform = ''
        element.style.transition = ''
        element.style.willChange = ''
        element.style.zIndex = ''
      }
    }

    const onMove = (moveEvent: PointerEvent) => {
      const nextKey = keyAtPoint(moveEvent.clientY)
      if (nextKey !== overKeyRef.current) {
        overKeyRef.current = nextKey
        setOverKey(nextKey)
      }
      applyTransforms(moveEvent.clientY, nextKey)
    }

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onCancel)
      if (handle.hasPointerCapture?.(pointerId)) {
        handle.releasePointerCapture(pointerId)
      }
      resetStyles()
      dragStateRef.current = null
      dragKeyRef.current = null
      overKeyRef.current = null
      setDragKey(null)
      setOverKey(null)
      cleanupDragRef.current = null
    }

    const onEnd = () => {
      const fromKey = dragKeyRef.current
      const toKey = overKeyRef.current
      cleanup()
      if (fromKey && toKey && fromKey !== toKey) {
        onReorder?.(fromKey, toKey)
      }
    }

    const onCancel = () => cleanup()

    cleanupDragRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onCancel)
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild={collapsible}>
        {collapsible ? (
          <button
            type='button'
            onClick={() => onExpandedChange?.(!expanded)}
            aria-expanded={expanded}
            className='flex w-full items-center justify-between gap-2 text-start leading-none'
          >
            <span className='truncate leading-none'>{title}</span>
            <ChevronRight
              className={cn(
                'size-3.5 shrink-0 self-center transition-transform duration-200',
                expanded && 'rotate-90'
              )}
            />
          </button>
        ) : (
          title
        )}
      </SidebarGroupLabel>

      {isExpanded ? (
        <SidebarMenu>
          {items.map((item) => {
            const key = `${item.title}-${item.url}`
            const itemKey =
              reorderable && !item.items && typeof item.url === 'string'
                ? socialKeyFromUrl(item.url)
                : null
            const canDrag = Boolean(itemKey)
            const dragProps: ComponentProps<'li'> | undefined = canDrag
              ? {
                  ref: (element) => {
                    if (element) itemRefs.current.set(itemKey as string, element)
                    else itemRefs.current.delete(itemKey as string)
                  },
                  className: cn(
                    'transition-colors',
                    dragKey === itemKey && 'opacity-95 shadow-md',
                    overKey === itemKey &&
                      dragKey !== itemKey &&
                      'rounded-md bg-sidebar-accent/70 ring-1 ring-sidebar-ring/50'
                  ),
                }
              : undefined
            const dragHandle: ReactNode | undefined = itemKey ? (
              <SidebarMenuAction
                aria-label={`Geser urutan ${item.title}`}
                title='Tahan lalu geser urutan'
                onPointerDown={(event) => startDrag(event, itemKey)}
                className='cursor-grab touch-none active:cursor-grabbing'
              >
                <GripVertical />
              </SidebarMenuAction>
            ) : undefined
            const deleteAction: ReactNode | undefined =
              item.canDelete && itemKey ? (
                <DeleteSocialButton siteKey={itemKey} label={item.title} />
              ) : undefined

            if (!item.items)
              return (
                <SidebarMenuLink
                  key={key}
                  item={item}
                  href={href}
                  dragProps={dragProps}
                  dragHandle={dragHandle}
                  deleteAction={deleteAction}
                />
              )

            if (state === 'collapsed' && !isMobile)
              return (
                <SidebarMenuCollapsedDropdown key={key} item={item} href={href} />
              )

            return <SidebarMenuCollapsible key={key} item={item} href={href} />
          })}
          {showAddSocial ? <AddSocialPopover /> : null}
        </SidebarMenu>
      ) : null}
    </SidebarGroup>
  )
}

function NavBadge({ children }: { children: ReactNode }) {
  return <Badge className='rounded-full px-1 py-0 text-xs'>{children}</Badge>
}

function SidebarMenuLink({
  item,
  href,
  dragProps,
  dragHandle,
  deleteAction,
}: {
  item: NavLink
  href: string
  dragProps?: ComponentProps<'li'>
  dragHandle?: ReactNode
  deleteAction?: ReactNode
}) {
  const { setOpenMobile } = useSidebar()
  const dragClassName = dragProps?.className

  return (
    <SidebarMenuItem {...dragProps} className={cn(dragClassName)}>
      <SidebarMenuButton
        asChild
        isActive={checkIsActive(href, item)}
        tooltip={item.title}
        className={cn(
          dragHandle && (deleteAction ? 'pe-14' : 'pe-8'),
          !dragHandle && deleteAction && 'pe-8'
        )}
      >
        <Link to={item.url} onClick={() => setOpenMobile(false)}>
          {item.icon && <item.icon />}
          <span>{item.title}</span>
          {item.badge && <NavBadge>{item.badge}</NavBadge>}
        </Link>
      </SidebarMenuButton>
      {dragHandle}
      {deleteAction}
    </SidebarMenuItem>
  )
}

function SidebarMenuCollapsible({
  item,
  href,
}: {
  item: NavCollapsible
  href: string
}) {
  const { setOpenMobile } = useSidebar()
  return (
    <Collapsible
      asChild
      defaultOpen={checkIsActive(href, item, true)}
      className='group/collapsible'
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            {item.badge && <NavBadge>{item.badge}</NavBadge>}
            <ChevronRight className='ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180' />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className='CollapsibleContent'>
          <SidebarMenuSub>
            {item.items.map((subItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  asChild
                  isActive={checkIsActive(href, subItem)}
                >
                  <Link to={subItem.url} onClick={() => setOpenMobile(false)}>
                    {subItem.icon && <subItem.icon />}
                    <span>{subItem.title}</span>
                    {subItem.badge && <NavBadge>{subItem.badge}</NavBadge>}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function SidebarMenuCollapsedDropdown({
  item,
  href,
}: {
  item: NavCollapsible
  href: string
}) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={checkIsActive(href, item)}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            {item.badge && <NavBadge>{item.badge}</NavBadge>}
            <ChevronRight className='ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='right' align='start' sideOffset={4}>
          <DropdownMenuLabel>
            {item.title} {item.badge ? `(${item.badge})` : ''}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.map((sub) => (
            <DropdownMenuItem key={`${sub.title}-${sub.url}`} asChild>
              <Link
                to={sub.url}
                className={`${checkIsActive(href, sub) ? 'bg-secondary' : ''}`}
              >
                {sub.icon && <sub.icon />}
                <span className='max-w-52 text-wrap'>{sub.title}</span>
                {sub.badge && (
                  <span className='ms-auto text-xs'>{sub.badge}</span>
                )}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  return (
    href === item.url ||
    href.split('?')[0] === item.url ||
    !!item?.items?.filter((i) => i.url === href).length ||
    (mainNav &&
      href.split('/')[1] !== '' &&
      href.split('/')[1] === item?.url?.split('/')[1])
  )
}
