// The application frame: a fixed navigation rail on every screen, and the page anatomy
// (header, panels, stat tiles) that every page is built from.
import { NavLink, useMatch } from 'react-router-dom'
import { Home as HomeIcon, Lightbulb, PenLine, CalendarClock, History, BookOpen, Upload, Settings, LogOut, ShieldCheck } from 'lucide-react'
import { LogoMark } from '@/components/Logo'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/components/ui'
import { useSettings } from '@/lib/settings'
import { useAuth } from '@/lib/AuthContext'
import { subscribeSave } from '@/lib/outbox'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

function RailLink({ to, icon: Icon, label, end, testid, match = true }) {
  return (
    <NavLink
      to={to}
      end={end}
      data-testid={testid}
      className={({ isActive }) => cn(
        'relative w-[64px] min-h-[54px] flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] leading-none transition-colors',
        isActive && match ? 'bg-[var(--rail-active)] text-white' : 'text-[var(--rail-fg)] hover:text-white hover:bg-[var(--rail-hover)]',
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && match && <span className="absolute -right-[6px] top-3 bottom-3 w-[3px] rounded-full bg-white" aria-hidden />}
          <Icon size={19} strokeWidth={1.8} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

/** Backup: a shield with a dot. White dot when everything is on the server, grey ring while waiting. */
function BackupRailItem() {
  const [save, setSave] = useState({ status: 'saved' })
  useEffect(() => subscribeSave(setSave), [])
  const ok = save.status === 'saved'
  return (
    <NavLink to="/backup" title={ok ? 'הכול שמור. לחצו להגדרות הגיבוי.' : 'שומר… לחצו להגדרות הגיבוי.'} data-testid="nav-backup"
      className={({ isActive }) => cn('relative w-[64px] min-h-[54px] flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] leading-none transition-colors', isActive ? 'bg-[var(--rail-active)] text-white' : 'text-[var(--rail-fg)] hover:text-white hover:bg-[var(--rail-hover)]')}>
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -right-[6px] top-3 bottom-3 w-[3px] rounded-full bg-white" aria-hidden />}
          <span className="relative"><ShieldCheck size={19} strokeWidth={1.8} /><span className={cn('absolute -top-0.5 -left-1 w-2 h-2 rounded-full ring-2 ring-[var(--rail-bg)]', ok ? 'bg-white' : 'bg-[var(--rail-fg)] animate-pulse')} /></span>
          <span>גיבוי</span>
        </>
      )}
    </NavLink>
  )
}

function AccountButton() {
  const { user, logout } = useAuth()
  const initial = (user?.full_name || user?.email || '?').trim()[0]?.toUpperCase()
  return (
    <Menu align="end" trigger={
      <button className="w-10 h-10 rounded-full bg-white/10 text-white text-sm font-black hover:bg-white/20" aria-label="החשבון שלי" data-testid="account-menu">{initial}</button>
    }>
      <MenuLabel>{user?.email || 'מחובר'}</MenuLabel>
      <MenuSeparator />
      <MenuItem icon={LogOut} onSelect={() => logout(true)}>התנתקות</MenuItem>
    </Menu>
  )
}

/** The navigation rail. Book items appear for the open book, or the last one you worked on. */
export function Rail() {
  const { settings } = useSettings()
  const m = useMatch('/book/:bookId/*')
  const bookId = m?.params.bookId || settings.last_book_id || null
  return (
    <nav className="hidden sm:flex shrink-0 w-[80px] h-full flex-col items-center py-3 gap-1 bg-[var(--rail-bg)] z-30" aria-label="ניווט ראשי" data-testid="rail">
      <NavLink to="/" className="mb-3 mt-1 text-white" aria-label="מכתוב, מסך הבית"><LogoMark size={34} /></NavLink>
      <RailLink to="/" end icon={HomeIcon} label="בית" testid="nav-home" />
      {bookId && (
        <>
          <div className="w-10 h-px bg-white/10 my-1.5" />
          <RailLink to={`/book/${bookId}`} end icon={PenLine} label="כתיבה" testid="nav-write" />
          <RailLink to={`/book/${bookId}/plan`} icon={CalendarClock} label="תכנון" testid="nav-plan" />
          <RailLink to={`/book/${bookId}/timeline`} icon={History} label="ציר זמן" testid="nav-timeline" />
          <RailLink to={`/book/${bookId}/read`} icon={BookOpen} label="קריאה" testid="nav-read" />
          <RailLink to={`/book/${bookId}?ideas=1`} icon={Lightbulb} label="רעיונות" testid="nav-ideas" match={false} />
        </>
      )}
      <div className="w-10 h-px bg-white/10 my-1.5" />
      <RailLink to="/import" icon={Upload} label="ייבוא" testid="nav-import" />
      <div className="flex-1" />
      <BackupRailItem />
      <RailLink to="/settings" icon={Settings} label="הגדרות" testid="nav-settings" />
      <div className="mt-2"><AccountButton /></div>
    </nav>
  )
}

/** Phone navigation: a bar at the bottom of the screen on pages outside the editor. */
export function MobileNav() {
  const { settings } = useSettings()
  const m = useMatch('/book/:bookId/*')
  const bookId = m?.params.bookId || settings.last_book_id || null
  const item = (to, Icon, label, end) => (
    <NavLink key={label} to={to} end={end} className={({ isActive }) => cn('flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'text-fg' : 'text-muted')}>
      <Icon size={20} strokeWidth={1.8} />{label}
    </NavLink>
  )
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 h-16 pb-[env(safe-area-inset-bottom)] flex bg-surface border-t border-line z-30" aria-label="ניווט">
      {item('/', HomeIcon, 'בית', true)}
      {bookId && item(`/book/${bookId}`, PenLine, 'כתיבה', true)}
      {bookId && item(`/book/${bookId}/plan`, CalendarClock, 'תכנון')}
      {item('/settings', Settings, 'הגדרות')}
    </nav>
  )
}

/** The frame around every screen except reading mode. */
export function AppFrame({ children }) {
  return (
    <div className="h-full flex">
      <Rail />
      <div className="flex-1 min-w-0 h-full">{children}</div>
    </div>
  )
}

/**
 * A page: a fixed header with the title, an optional line under it, and actions on the left;
 * then the content in a centred column.
 */
export function Page({ title, subtitle, eyebrow, actions, children, width = 'max-w-[1180px]', testid }) {
  return (
    <div className="h-full flex flex-col" data-testid={testid}>
      <header className="shrink-0 border-b border-line bg-surface">
        <div className={cn('mx-auto px-5 sm:px-8 py-5 flex flex-wrap items-end gap-x-4 gap-y-3', width)}>
          <div className="flex-1 min-w-[220px]">
            {eyebrow && <div className="text-xs text-muted mb-1">{eyebrow}</div>}
            <h1 className="text-[26px] leading-tight font-black tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-y-auto pb-20 sm:pb-0">
        <div className={cn('mx-auto px-5 sm:px-8 py-6 sm:py-8 flex flex-col gap-6', width)}>{children}</div>
      </main>
      <MobileNav />
    </div>
  )
}

/** A work surface with a header row. */
export function Panel({ title, description, actions, children, className, bodyClass, ...rest }) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface shadow-[var(--shadow-sm)]', className)} {...rest}>
      {(title || actions) && (
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-line">
          <div className="flex-1 min-w-0">
            {title && <h2 className="text-[15px] font-black">{title}</h2>}
            {description && <p className="text-[13px] text-muted mt-0.5">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn('p-5', bodyClass)}>{children}</div>
    </section>
  )
}

/** A number tile for the top of a dashboard. */
export function Stat({ label, value, hint, icon: Icon, tone, children, ...rest }) {
  return (
    <div className="rounded-xl border border-line bg-surface shadow-[var(--shadow-sm)] px-5 py-4 flex flex-col gap-1 min-w-0" {...rest}>
      <div className="flex items-center gap-1.5 text-[13px] text-muted">{Icon && <Icon size={15} className={tone} />}{label}</div>
      <div className="text-[30px] leading-none font-black tabular-nums mt-1">{value}</div>
      {hint && <div className="text-[13px] text-muted mt-1">{hint}</div>}
      {children}
    </div>
  )
}
