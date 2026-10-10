// Small UI primitives shared across the app.
import { forwardRef, useLayoutEffect, useRef, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Button = forwardRef(function Button({ variant = 'default', size = 'md', className, ...props }, ref) {
  const v = {
    default: 'bg-surface border border-line-strong/70 text-fg hover:bg-sunk shadow-[var(--shadow-sm)]',
    primary: 'bg-accent text-accent-fg border border-transparent hover:opacity-90 shadow-[var(--shadow-sm)]',
    ghost: 'bg-transparent border border-transparent text-fg hover:bg-sunk',
    danger: 'bg-surface border border-line text-danger hover:bg-sunk',
  }[variant]
  const s = { sm: 'h-8 px-2.5 text-sm', md: 'h-10 px-3.5 text-[15px]', lg: 'h-12 px-5 text-base' }[size]
  return <button ref={ref} className={cn('inline-flex items-center justify-center gap-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none', v, s, className)} {...props} />
})

export const IconButton = forwardRef(function IconButton({ label, className, active, ...props }, ref) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn('hit inline-flex items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-sunk transition-colors', active && 'text-accent bg-accent-soft', className)}
      {...props}
    />
  )
})

/**
 * Opens a menu toward the side of the screen with more room (down from a button high on the
 * screen, up from one low on it), so long menus fit instead of running past the edge.
 */
export function useMenuSide(isOpen) {
  const ref = useRef(null)
  const [side, setSide] = useState('bottom')
  useLayoutEffect(() => {
    if (!isOpen || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setSide(window.innerHeight - r.bottom >= r.top ? 'bottom' : 'top')
  }, [isOpen])
  return [ref, side]
}

export function Menu({ trigger, children, align = 'end', open, onOpenChange, side: fixedSide }) {
  const [inner, setInner] = useState(false)
  const isOpen = open ?? inner
  const [ref, side] = useMenuSide(isOpen)
  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={(v) => { setInner(v); onOpenChange?.(v) }} dir="rtl">
      <DropdownMenu.Trigger asChild ref={ref}>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side={fixedSide || side} align={fixedSide ? 'center' : align} sideOffset={6} collisionPadding={8} className="z-50 min-w-[200px] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow)] text-[15px]" dir="rtl">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function MenuItem({ children, onSelect, danger, disabled, icon: Icon }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn('flex items-center gap-2 rounded-lg px-2.5 min-h-[34px] cursor-pointer outline-none data-[highlighted]:bg-sunk data-[disabled]:opacity-40', danger && 'text-danger')}
    >
      {Icon && <Icon size={16} className="shrink-0 opacity-70" />}
      <span className="flex-1">{children}</span>
    </DropdownMenu.Item>
  )
}
export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-line" />
export const MenuLabel = ({ children }) => <DropdownMenu.Label className="px-2.5 py-1 text-xs text-muted">{children}</DropdownMenu.Label>

/**
 * A choice from a list, in the app's own menu instead of the browser's.
 * options: [{ value, label, group?, style? }]; consecutive options with the same group sit under one heading.
 * size: 'md' (form field), 'sm' (inline), 'xs' (tiny, inside cards).
 */
export function Select({ value, onChange, options, placeholder = 'בחרו', size = 'md', className, menuClassName, 'aria-label': ariaLabel, 'data-testid': testid, align = 'start' }) {
  const current = options.find((o) => String(o.value) === String(value ?? ''))
  const h = { md: 'h-10 px-3 text-[15px]', sm: 'h-9 px-2.5 text-sm', xs: 'h-7 px-2 text-[12px] text-muted' }[size]
  let lastGroup
  const [isOpen, setOpen] = useState(false)
  const [ref, side] = useMenuSide(isOpen)
  return (
    <DropdownMenu.Root dir="rtl" modal={false} open={isOpen} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild ref={ref}>
        <button
          type="button"
          aria-label={ariaLabel}
          data-testid={testid}
          data-value={current ? String(current.value) : ''}
          className={cn('inline-flex items-center justify-between gap-2 rounded-lg border border-line bg-bg text-fg outline-none focus-visible:border-accent data-[state=open]:border-accent min-w-0', h, className)}
        >
          <span className="truncate" style={current?.style}>{current ? current.label : <span className="text-faint">{placeholder}</span>}</span>
          <ChevronDown size={size === 'xs' ? 13 : 15} className="shrink-0 opacity-60" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side={side} align={align} sideOffset={4} collisionPadding={8} dir="rtl"
          className={cn('z-[60] min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-[min(360px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow)] text-[15px]', menuClassName)}>
          {options.map((o) => {
            const head = o.group && o.group !== lastGroup ? o.group : null
            lastGroup = o.group
            const on = String(o.value) === String(value ?? '')
            return (
              <div key={`${o.group || ''}:${o.value}`}>
                {head && <DropdownMenu.Label className="px-2.5 pt-2 pb-1 text-xs text-muted">{head}</DropdownMenu.Label>}
                <DropdownMenu.Item
                  onSelect={() => onChange(o.value)}
                  data-testid={testid ? `${testid}-option-${o.value}` : undefined}
                  className={cn('flex items-center gap-2 rounded-lg px-2.5 min-h-[36px] cursor-pointer outline-none data-[highlighted]:bg-sunk', on && 'font-medium')}
                >
                  <span className="w-4 shrink-0">{on && <Check size={14} />}</span>
                  <span className="flex-1" style={o.style}>{o.label}</span>
                </DropdownMenu.Item>
              </div>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function Dialog({ open, onOpenChange, title, children, wide, className }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          dir="rtl"
          className={cn('fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-24px)] max-h-[calc(100dvh-32px)] overflow-auto rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow)]', wide ? 'max-w-4xl' : 'max-w-lg', className)}
        >
          <div className="flex items-center justify-between mb-4 gap-3">
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild><IconButton label="סגור"><X size={18} /></IconButton></DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass = 'h-10 rounded-lg border border-line bg-bg px-3 text-[15px] text-fg outline-none focus:border-accent'

export function Toasts({ items }) {
  return (
    <div className="fixed bottom-4 inset-x-0 z-[80] flex flex-col items-center gap-2 pointer-events-none px-4" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto rounded-xl bg-fg text-bg px-4 py-2.5 text-sm shadow-[var(--shadow)] flex items-center gap-3">
          <span>{t.text}</span>
          {t.action && <button className="font-semibold underline" onClick={t.action.run}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  )
}
