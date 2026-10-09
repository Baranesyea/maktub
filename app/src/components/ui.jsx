// Small UI primitives shared across the app.
import { forwardRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
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

export function Menu({ trigger, children, align = 'end', open, onOpenChange }) {
  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange} dir="rtl">
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className="z-50 min-w-[200px] rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow)] text-[15px]" dir="rtl">
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
      className={cn('flex items-center gap-2 rounded-lg px-2.5 min-h-[38px] cursor-pointer outline-none data-[highlighted]:bg-sunk data-[disabled]:opacity-40', danger && 'text-danger')}
    >
      {Icon && <Icon size={16} className="shrink-0 opacity-70" />}
      <span className="flex-1">{children}</span>
    </DropdownMenu.Item>
  )
}
export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-line" />
export const MenuLabel = ({ children }) => <DropdownMenu.Label className="px-2.5 py-1 text-xs text-muted">{children}</DropdownMenu.Label>

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
